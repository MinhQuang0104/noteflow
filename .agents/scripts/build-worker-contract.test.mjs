import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { claimStory, registryPaths } from './story-registry.mjs'

const SCRIPT = path.resolve('.agents/scripts/build-worker-contract.mjs')
const TEMPLATE = readFileSync('.agents/templates/worker-contract.md', 'utf8')

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
  return file
}

function seedSources(fixture) {
  for (const relative of [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/routing/task-router.md',
    '.agents/context/context-routing.md',
    '.agents/context/control-plane.md',
    '.agents/skills/v4-story-runner/SKILL.md',
    '.agents/docs/v4-artifact-contract.md',
    '.agents/skills/v4-story-runner/actions/implement-slice.md',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md',
    '.agents/skills/v4-story-runner/references/agy-executor.md',
    '.agents/skills/v4-story-runner/references/recovery.md',
  ]) write(fixture.root, relative, `fixture instruction: ${relative}\n`)
  write(fixture.root, '.agents/templates/worker-contract.md', TEMPLATE)
}

function agyFixture() {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  seedSources(fixture)
  writeFileSync(fixture.paths.plan, readFileSync(fixture.paths.plan, 'utf8').replace(
    '    depends_on: []',
    '    depends_on: []\n    executor: agy\n    scope:\n      paths: [src/]\n    verification_obligations: [node --test src/a.test.js]',
  ))
  const preamble = write(fixture.root, 'preamble.txt', 'Preamble line\r\n')
  const expectedHead = fixture.git(['rev-parse', 'HEAD'])
  return { fixture, preamble, expectedHead }
}

function run(fixture, args) {
  const processResult = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return { ...processResult, json: JSON.parse(processResult.stdout) }
}

function buildArgs(fixture, preamble, out, expectedHead) {
  return [
    'build', '9.1', 'A',
    '--expected-head', expectedHead,
    '--attempt', '1',
    '--run-id', 'run-1',
    '--task-id', 'task-1',
    '--preamble-file', preamble,
    '--out', out,
  ]
}

for (const [command, resource] of [['php artisan test', 'backend-test-db'], ['npx playwright test', 'e2e-db']]) {
  test(`builder requires and records the automatic ${resource} reservation`, () => {
    const { fixture, preamble, expectedHead } = agyFixture()
    try {
      writeFileSync(fixture.paths.plan, readFileSync(fixture.paths.plan, 'utf8').replace('node --test src/a.test.js', command))
      const out = path.join(fixture.root, '.orca-contract', 'contract.md')
      const args = buildArgs(fixture, preamble, out, expectedHead)
      const refused = run(fixture, args)
      assert.equal(refused.json.status, 'BLOCKED', JSON.stringify(refused.json))
      assert.deepEqual(refused.json.reasons, ['REGISTRY_CLAIM_REQUIRED'])
      assert.equal(claimStory(fixture.root, '9.1', { worktree: fixture.root, leadVendor: 'codex', session: 'builder' }).status, 'APPLIED')
      const result = run(fixture, args)
      assert.equal(result.json.status, 'READY', JSON.stringify(result.json))
      assert.deepEqual(result.json.resources, [resource])
      assert.match(readFileSync(out, 'utf8'), new RegExp(`Shared resources held for this dispatch: ${resource}`))
      const bytes = readFileSync(out, 'utf8'), locations = registryPaths(fixture.root, '9.1')
      const record = JSON.parse(readFileSync(locations.record, 'utf8'))
      writeFileSync(locations.record, JSON.stringify({ ...record, resources: [] }))
      assert.deepEqual(run(fixture, args).json.reasons, ['RESOURCE_UNDECLARED'])
      writeFileSync(locations.record, JSON.stringify(record))
      writeFileSync(registryPaths(fixture.root, '9.2').record, JSON.stringify({ ...record, storyId: '9.2',
        worktree: path.join(fixture.root, 'other'), declaredScope: ['other/'] }))
      assert.deepEqual(run(fixture, args).json.reasons, ['RESOURCE_CONFLICT'])
      assert.equal(readFileSync(out, 'utf8'), bytes)
    } finally { fixture.cleanup() }
  })
}

test('builder emits a deterministic AGY contract from projected context', () => {
  const { fixture, preamble, expectedHead } = agyFixture()
  try {
    const out = path.join(fixture.root, '.orca-contract', 'contract.md')
    const first = run(fixture, buildArgs(fixture, preamble, out, expectedHead))
    assert.equal(first.status, 0, JSON.stringify(first))
    assert.equal(first.json.status, 'READY', JSON.stringify(first.json))
    assert.deepEqual(first.json.allow, ['src/'])
    assert.equal(first.json.base, expectedHead)
    assert.equal(first.json.attempt, 1)
    const bytes = readFileSync(out, 'utf8')
    assert.match(bytes, /^Preamble line\n\n\n# Worker execution contract\n/)
    assert.doesNotMatch(bytes, /\r/)
    assert.doesNotMatch(bytes, /<[^>\r\n]+>/)
    assert.match(bytes, /T-1/)
    assert.match(bytes, /AC-1/)
    assert.match(bytes, /src\//)
    assert.match(bytes, /node --test src\/a\.test\.js/)
    assert.match(bytes, new RegExp(`Dispatch base: ${expectedHead}; commits\\s+allowed: no`))
    assert.match(bytes, /Worker: Antigravity/)
    const reportPath = '.agent-state/v4-auto/workers/task-1/report-attempt-1.json'
    assert.equal(first.json.report_path, reportPath)
    assert.ok(bytes.includes(`--report-path ${reportPath}`))
    assert.doesNotMatch(bytes, /(^|[\s>])workers\/task-1\//m)
    assert.doesNotMatch(bytes, /lease/)
    // Worker context is the Story plus the AGENTS.md worker role, never Lead
    // runner/action/recovery documents.
    assert.doesNotMatch(bytes, /\.agents\/skills\//)
    assert.doesNotMatch(bytes, /v4-artifact-contract/)
    assert.match(bytes, /Required context: docs\/story-9-1\.md/)
    assert.match(bytes, /"Worker role" section only/)
    assert.match(bytes, /sha256=SHA256_HEX_OF_THAT_REPORT_FILE/)
    assert.doesNotMatch(bytes, /V3 policy\./)

    const second = run(fixture, buildArgs(fixture, preamble, out, expectedHead))
    assert.equal(second.status, 0, second.stderr)
    assert.equal(second.json.contract_sha256, first.json.contract_sha256)
    assert.equal(readFileSync(out, 'utf8'), bytes)
  } finally { fixture.cleanup() }
})

test('builder blocks when context is not ready', () => {
  const { fixture, preamble, expectedHead } = agyFixture()
  try {
    const out = path.join(fixture.root, '.orca-contract', 'contract.md')
    const result = run(fixture, buildArgs(fixture, preamble, out, '0'.repeat(expectedHead.length)))
    assert.equal(result.status, 3, JSON.stringify(result.json))
    assert.equal(result.json.status, 'BLOCKED')
    assert.ok(result.json.reasons.includes('CONTEXT_NOT_READY'))
  } finally { fixture.cleanup() }
})

test('builder refuses a lead slice', () => {
  const { fixture, preamble, expectedHead } = agyFixture()
  try {
    writeFileSync(fixture.paths.plan, readFileSync(fixture.paths.plan, 'utf8').replace('executor: agy', 'executor: lead'))
    const out = path.join(fixture.root, '.orca-contract', 'contract.md')
    const result = run(fixture, buildArgs(fixture, preamble, out, expectedHead))
    assert.equal(result.status, 3, JSON.stringify(result.json))
    assert.equal(result.json.status, 'BLOCKED')
    assert.ok(result.json.reasons.includes('NOT_AGY_SLICE'))
  } finally { fixture.cleanup() }
})

test('builder rejects malformed flags before writing output', () => {
  const { fixture, preamble, expectedHead } = agyFixture()
  try {
    const out = path.join(fixture.root, '.orca-contract', 'contract.md')
    const result = run(fixture, buildArgs(fixture, preamble, out, expectedHead).map(value => value === '1' ? '0' : value))
    assert.equal(result.status, 4, JSON.stringify(result.json))
    assert.equal(result.json.status, 'INVALID')
    assert.equal(readFileSync(fixture.paths.plan, 'utf8').includes('executor: agy'), true)
  } finally { fixture.cleanup() }
})
