import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as scope from './story-scope.mjs'
import { createRegistryFixture } from './registry-test-fixture.mjs'
import { claimStory, registryPaths, releaseStory } from './story-registry.mjs'
import { frontmatter, validate } from './check-story-plan.mjs'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'

const options = root => ({ worktree: root, leadVendor: 'codex', session: 'resources' })
function edit(f, transform) { writeFileSync(f.paths.plan, transform(readFileSync(f.paths.plan, 'utf8'))) }
function resourcePlan(f, resource) { edit(f, value => value.replace('schema_version:', `resources: ${JSON.stringify(resource)}\nschema_version:`)) }
function holder(f, resources) {
  const claimed = claimStory(f.root, '9.1', options(f.root))
  assert.equal(claimed.status, 'APPLIED', JSON.stringify(claimed))
  assert.equal(releaseStory(f.root, '9.1', 1, 'merged').status, 'APPLIED')
  const locations = registryPaths(f.root, '9.2')
  mkdirSync(locations.stories, { recursive: true })
  writeFileSync(locations.record, JSON.stringify({ ...claimed.record, storyId: '9.2',
    worktree: path.join(f.root, 'other'), declaredScope: ['other/'], resources }))
}

test('resource configuration and declarations reject unknown, malformed and duplicate names', () => {
  assert.deepEqual(scope.loadHotPaths().resources, ['backend-test-db', 'e2e-db'])
  assert.equal(typeof scope.declaredResources, 'function')
  assert.deepEqual(scope.declaredResources({ resources: ['e2e-db', 'backend-test-db'], slices: [] }), ['backend-test-db', 'e2e-db'])
  for (const resources of [null, 'backend-test-db', ['unknown-db'], ['e2e-db', 'e2e-db'], [7]]) {
    assert.throws(() => scope.declaredResources({ resources }), /RESOURCES_INVALID/)
  }
  const f = createRegistryFixture()
  try {
    const file = path.join(f.root, 'hot-paths.json')
    for (const resources of [null, ['e2e-db', 'e2e-db'], ['unsafe/name']]) {
      writeFileSync(file, JSON.stringify({ schema: 'hot-paths-v1', entries: [], resources }))
      assert.throws(() => scope.loadHotPaths(file), /HOT_PATHS_INVALID/)
    }
  } finally { f.cleanup() }
})

test('backend and E2E command forms automatically declare the shared database resources', () => {
  assert.equal(typeof scope.inferredResources, 'function')
  for (const [check, expected] of [
    ['php artisan test --filter Notes', ['backend-test-db']],
    [{ command: './vendor/bin/phpunit', cwd: 'backend' }, ['backend-test-db']],
    [{ argv: ['vendor/bin/pest'], cwd: 'backend' }, ['backend-test-db']],
    ['pwsh -File scripts/local.ps1 test', ['backend-test-db']],
    [{ command: 'composer test', cwd: 'backend' }, ['backend-test-db']],
    ['npm run test:e2e', ['e2e-db']],
    ['npx playwright test', ['e2e-db']],
    ['powershell -File scripts/local.ps1 e2e', ['e2e-db']],
    ['npm run test:v4', []],
    [{ command: 'npm test', cwd: 'frontend' }, []],
  ]) assert.deepEqual(scope.inferredResources([check]), expected, JSON.stringify(check))
  assert.deepEqual(scope.declaredResources({ resources: ['e2e-db'], slices: [
    { verification_obligations: ['php artisan test'] }, { verification_obligations: ['npx playwright test'] },
  ] }), ['backend-test-db', 'e2e-db'])
  assert.deepEqual(scope.declaredResources({ checks: ['php artisan test'], slices: [{}] }), ['backend-test-db'])
})

for (const schemaVersion of [1, 2]) test(`schema-${schemaVersion} Plan validates its optional resource list`, () => {
  const f = createRegistryFixture({ schemaVersion })
  try {
    assert.equal(validate(f.root, '9.1').status, 'READY')
    resourcePlan(f, ['backend-test-db'])
    assert.equal(validate(f.root, '9.1').status, 'READY')
    edit(f, value => value.replace('backend-test-db', 'unknown-db'))
    const result = validate(f.root, '9.1')
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('RESOURCES_INVALID'))
    assert.equal(claimStory(f.root, '9.1', options(f.root)).status, 'INVALID')
    assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
  } finally { f.cleanup() }
})

test('claim reserves explicit and automatic resources until release', () => {
  const f = createRegistryFixture()
  try {
    resourcePlan(f, ['e2e-db'])
    edit(f, value => value.replace('    depends_on: []', '    depends_on: []\n    verification_obligations: [php artisan test]'))
    const result = claimStory(f.root, '9.1', options(f.root))
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(result.record.resources, ['backend-test-db', 'e2e-db'])
    assert.equal(releaseStory(f.root, '9.1', 1, 'merged').status, 'APPLIED')
    assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
  } finally { f.cleanup() }
})

test('resource overlap refuses disjoint scope and cannot be bypassed by an overlap override', () => {
  const f = createRegistryFixture()
  try {
    holder(f, ['backend-test-db']); resourcePlan(f, ['backend-test-db'])
    for (const allowOverlap of [undefined, 'owner accepts path overlap']) {
      const result = claimStory(f.root, '9.1', { ...options(f.root), allowOverlap })
      assert.equal(result.status, 'CONFLICT', JSON.stringify(result))
      assert.deepEqual(result.reasons, ['RESOURCE_CONFLICT'])
      assert.deepEqual(result.conflicts, [{ storyId: '9.2', resources: ['backend-test-db'] }])
      assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
    }
    edit(f, value => value.replace('backend-test-db', 'e2e-db'))
    assert.equal(claimStory(f.root, '9.1', options(f.root)).status, 'APPLIED')
  } finally { f.cleanup() }
})

test('dispatch stops when checks add an unclaimed resource or another Story holds it', async () => {
  const f = createRegistryFixture()
  try {
    assert.equal(claimStory(f.root, '9.1', options(f.root)).status, 'APPLIED')
    edit(f, value => value.replace('    depends_on: []', '    depends_on: []\n    verification_obligations: [php artisan test]'))
    assert.deepEqual((await scope.checkSlice(f.root, '9.1', 'A')).reasons, ['RESOURCE_UNDECLARED'])
    assert.equal(releaseStory(f.root, '9.1', 1, 'merged').status, 'APPLIED')
    holder(f, ['backend-test-db'])
    const record = JSON.parse(readFileSync(registryPaths(f.root, '9.2').record, 'utf8'))
    writeFileSync(registryPaths(f.root, '9.1').record, JSON.stringify({ ...record, storyId: '9.1', worktree: f.root, declaredScope: ['src/fixture.txt'] }))
    assert.deepEqual((await scope.checkSlice(f.root, '9.1', 'A')).reasons, ['RESOURCE_CONFLICT'])
  } finally { f.cleanup() }
})

test('concurrent disjoint Stories have exactly one winner for a shared database', async () => {
  const f = createRegistryFixture()
  try {
    resourcePlan(f, ['backend-test-db'])
    const story = readFileSync(f.paths.story, 'utf8').replaceAll('9.1', '9.2')
    writeFileSync(path.join(f.root, 'docs/story-9-2.md'), story)
    const plan = readFileSync(f.paths.plan, 'utf8')
    writeFileSync(path.join(f.root, '_bmad-output/implementation-artifacts/story-9-2-plan.md'),
      plan.replaceAll('9.1', '9.2').replaceAll('9-1', '9-2').replace('src/fixture.txt', 'other/fixture.txt')
        .replace(frontmatter(plan).story.normative_digest, normativeDigest(inspectStory(story))))
    writeFileSync(f.paths.sprintStatus, readFileSync(f.paths.sprintStatus, 'utf8') + '  9-2-fixture: ready-for-dev\n')
    f.git(['add', '.']); f.git(['commit', '-m', 'fixture two resource Stories'])
    const roots = ['one', 'two'].map(name => path.join(f.root, '..', name))
    roots.forEach((root, index) => f.git(['worktree', 'add', '-b', `story-9-${index + 1}`, root, 'HEAD']))
    const run = (root, id) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./story-registry.mjs', import.meta.url)),
        'claim', id, '--worktree', root, '--lead-vendor', 'codex', '--session', id], { cwd: root, windowsHide: true })
      let output = '', error = ''
      child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { error += value })
      child.on('error', reject)
      child.on('exit', () => { try { resolve(JSON.parse(output)) } catch { reject(new Error(error || output)) } })
    })
    const results = await Promise.all(roots.map((root, index) => run(root, `9.${index + 1}`)))
    assert.deepEqual(results.map(item => item.status).sort(), ['APPLIED', 'CONFLICT'])
    assert.deepEqual(results.find(item => item.status === 'CONFLICT').reasons, ['RESOURCE_CONFLICT'])
  } finally { f.cleanup() }
})
