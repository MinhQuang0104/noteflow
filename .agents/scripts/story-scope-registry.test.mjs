import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { claimStory, registryPaths } from './story-registry.mjs'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'

const CLI = fileURLToPath(new URL('./story-registry.mjs', import.meta.url))
const SCOPE = fileURLToPath(new URL('./story-scope.mjs', import.meta.url))
const options = root => ({ worktree: root, leadVendor: 'codex', session: 'fixture' })
function declare(f, paths) {
  writeFileSync(f.paths.plan, readFileSync(f.paths.plan, 'utf8').replace('    depends_on: []',
    `    depends_on: []\n    scope:\n      paths: ${JSON.stringify(paths)}`))
}
function holder(f, paths) {
  const locations = registryPaths(f.root, '9.2'), head = f.git(['rev-parse', 'HEAD'])
  mkdirSync(locations.stories, { recursive: true })
  writeFileSync(locations.record, JSON.stringify({ schemaVersion: 1, storyId: '9.2', generation: 1,
    worktree: path.join(f.root, 'other'), branch: 'story-9-2', controlPlaneCommit: head, planHead: head,
    lead: { vendor: 'claude', sessionId: 'other', claimedAt: new Date().toISOString() },
    orca: { runId: null, leadTerminal: null, agyTerminal: null }, state: 'IMPLEMENTING',
    declaredScope: paths, overlapOverride: null, heartbeatAt: new Date().toISOString() }))
}

test('unknown pending scope refuses a claim without a record', () => {
  const f = createV4Fixture()
  try {
    assert.deepEqual(claimStory(f.root, '9.1', options(f.root)).reasons, ['SCOPE_UNDECLARED'])
    assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
  } finally { f.cleanup() }
})

test('legacy empty scope is unknown and blocks another Story claim', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/a']); holder(f, [])
    const result = claimStory(f.root, '9.1', options(f.root))
    assert.equal(result.status, 'BLOCKED')
    assert.deepEqual(result.reasons, ['SCOPE_UNDECLARED'])
  } finally { f.cleanup() }
})

for (const [name, requested, held, reason] of [
  ['directory scope', ['src/a'], ['src/'], 'SCOPE_OVERLAP'],
  ['reverse directory scope', ['src/'], ['src/a'], 'SCOPE_OVERLAP'],
  ['shared hot directory', ['backend/config/a.php'], ['backend/config/b.php'], 'HOT_PATH_CONFLICT']
]) test(`claim refuses ${name} with Story IDs and paths`, () => {
  const f = createV4Fixture()
  try {
    declare(f, requested); holder(f, held)
    const result = claimStory(f.root, '9.1', options(f.root))
    assert.equal(result.status, 'CONFLICT')
    assert.deepEqual(result.reasons, [reason])
    assert.equal(result.conflicts[0].storyId, '9.2')
    assert.ok(result.conflicts[0].paths.length)
    assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
  } finally { f.cleanup() }
})

test('owner overlap reason is persisted and slice dispatch rechecks new conflicts', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/a']); holder(f, ['src/'])
    const claimed = claimStory(f.root, '9.1', { ...options(f.root), allowOverlap: 'owner accepts this overlap' })
    assert.equal(claimed.status, 'APPLIED', JSON.stringify(claimed))
    assert.equal(claimed.record.overlapOverride.reason, 'owner accepts this overlap')
    const check = () => {
      const child = spawnSync(process.execPath, [SCOPE, 'check-slice', '9.1', 'A'], { cwd: f.root, encoding: 'utf8', windowsHide: true })
      assert.ok(child.stdout.trim(), child.stderr)
      return JSON.parse(child.stdout)
    }
    assert.equal(check().status, 'READY')
    const second = JSON.parse(readFileSync(registryPaths(f.root, '9.2').record, 'utf8'))
    second.storyId = '9.3'
    writeFileSync(registryPaths(f.root, '9.3').record, JSON.stringify(second))
    assert.deepEqual(check().reasons, ['SCOPE_OVERLAP'])
  } finally { f.cleanup() }
})

test('non-overridable control-plane paths cannot be claimed with an owner override', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['.agents/scripts/unsafe.mjs'])
    const result = claimStory(f.root, '9.1', { ...options(f.root), allowOverlap: 'owner reason' })
    assert.equal(result.status, 'CONFLICT')
    assert.deepEqual(result.reasons, ['HOT_PATH_NON_OVERRIDABLE'])
  } finally { f.cleanup() }
})

test('owner reason is recorded even when no current overlap needs it', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/a'])
    const result = claimStory(f.root, '9.1', { ...options(f.root), allowOverlap: 'owner annotation' })
    assert.equal(result.status, 'APPLIED')
    assert.equal(result.record.overlapOverride?.reason, 'owner annotation')
    assert.deepEqual(result.record.overlapOverride.conflicts, [])
  } finally { f.cleanup() }
})

test('CLI records an owner override and rejects a missing reason', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/a']); holder(f, ['src/'])
    const args = [CLI, 'claim', '9.1', '--worktree', f.root, '--lead-vendor', 'codex', '--session', 'fixture', '--allow-overlap']
    const run = tail => JSON.parse(spawnSync(process.execPath, [...args, ...tail], { cwd: f.root, encoding: 'utf8', windowsHide: true }).stdout)
    assert.deepEqual(run([]).reasons, ['REGISTRY_USAGE'])
    assert.equal(run(['approved by owner']).status, 'APPLIED')
  } finally { f.cleanup() }
})

test('approved directory overlap covers a bounded child slice but does not allow broader held scope', () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/']); holder(f, ['src/a'])
    assert.equal(claimStory(f.root, '9.1', { ...options(f.root), allowOverlap: 'owner accepts directory overlap' }).status, 'APPLIED')
    writeFileSync(f.paths.plan, readFileSync(f.paths.plan, 'utf8').replace('["src/"]', '["src/a"]'))
    const check = () => {
      const result = spawnSync(process.execPath, [SCOPE, 'check-slice', '9.1', 'A'], { cwd: f.root, encoding: 'utf8', windowsHide: true })
      assert.ok(result.stdout.trim(), result.stderr)
      return JSON.parse(result.stdout)
    }
    assert.equal(check().status, 'READY')
    holder(f, ['src/'])
    assert.deepEqual(check().reasons, ['SCOPE_OVERLAP'])
  } finally { f.cleanup() }
})

test('concurrent cross-Story claims cannot both reserve overlapping scope', async () => {
  const f = createV4Fixture()
  try {
    declare(f, ['src/'])
    const story = readFileSync(f.paths.story, 'utf8').replaceAll('9.1', '9.2')
    writeFileSync(path.join(f.root, 'docs/story-9-2.md'), story)
    const plan = readFileSync(f.paths.plan, 'utf8')
    writeFileSync(path.join(f.root, '_bmad-output/implementation-artifacts/story-9-2-plan.md'),
      plan.replaceAll('9.1', '9.2').replaceAll('9-1', '9-2').replace(frontmatter(plan).story.normative_digest, normativeDigest(inspectStory(story))))
    writeFileSync(f.paths.sprintStatus, readFileSync(f.paths.sprintStatus, 'utf8') + '  9-2-fixture: ready-for-dev\n')
    f.git(['add', '.']); f.git(['commit', '-m', 'seed two scoped Stories'])
    const roots = ['one', 'two'].map(name => path.join(f.root, '..', name))
    roots.forEach((root, index) => f.git(['worktree', 'add', '-b', `story-9-${index + 1}`, root, 'HEAD']))
    const run = (root, id) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, 'claim', id, '--worktree', root, '--lead-vendor', 'codex', '--session', id], { cwd: root, windowsHide: true })
      let output = '', error = ''
      child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { error += value })
      child.on('error', reject)
      child.on('exit', () => { try { resolve(JSON.parse(output)) } catch { reject(new Error(error || output)) } })
    })
    const results = await Promise.all(roots.map((root, index) => run(root, `9.${index + 1}`)))
    assert.deepEqual(results.map(item => item.status).sort(), ['APPLIED', 'CONFLICT'])
    assert.deepEqual(results.find(item => item.status === 'CONFLICT').reasons, ['SCOPE_OVERLAP'])
  } finally { f.cleanup() }
})
