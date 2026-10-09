import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createV4Fixture } from './v4-architecture-fixture.mjs'

const CLI = fileURLToPath(new URL('./story-registry.mjs', import.meta.url))
const claimArgs = (root, session = 'session-1') => ['claim', '9.1', '--worktree', root, '--lead-vendor', 'codex', '--session', session]
const recordPath = f => path.resolve(f.root, f.git(['rev-parse', '--git-common-dir']), 'noteflow-v4-runs/stories/9.1.json')
function cli(root, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.ok(result.stdout.trim(), result.stderr)
  return { code: result.status, ...JSON.parse(result.stdout) }
}
function concurrentCli(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: root, windowsHide: true })
    let output = '', error = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { error += chunk })
    child.on('error', reject)
    child.on('exit', code => { try { resolve({ code, ...JSON.parse(output) }) } catch { reject(new Error(error || output)) } })
  })
}

test('unsupported registry versions refuse every operation and preserve the record', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).status, 'APPLIED')
    const record = JSON.parse(readFileSync(recordPath(f), 'utf8'))
    for (const schemaVersion of [2, 99]) {
      writeFileSync(recordPath(f), JSON.stringify({ ...record, schemaVersion }))
      const bytes = readFileSync(recordPath(f), 'utf8')
      const operations = [
        ['status'], claimArgs(f.root), ['policy-drift', '9.1'],
        ['claim', '9.1', '--takeover', '--lead-vendor', 'claude', '--session', 'replacement'],
        ['heartbeat', '9.1', '--generation', '1', '--state', 'REVIEWING'],
        ...['merged', 'abort', 'orphaned'].map(disposition => ['release', '9.1', '--generation', '1', `--${disposition}`])
      ]
      for (const args of operations) {
        const result = cli(f.root, args)
        assert.equal(result.status, 'INVALID', args.join(' '))
        assert.deepEqual(result.reasons, ['REGISTRY_SCHEMA_UNSUPPORTED'])
        assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
      }
      assert.equal(existsSync(path.join(path.dirname(path.dirname(recordPath(f))), 'aborted')), false)
    }
  } finally { f.cleanup() }
})

test('claim pins HEAD and scope in Git-common runtime without changing Git or pointer', () => {
  const f = createV4Fixture()
  try {
    const before = f.gitStatus(), head = f.git(['rev-parse', 'HEAD'])
    const pointer = readFileSync(f.paths.activeRun, 'utf8')
    const result = cli(f.root, [...claimArgs(f.root), '--orca-run', 'run-1', '--lead-terminal', 'lead-h', '--agy-terminal', 'agy-h'])
    assert.equal(result.code, 0)
    assert.equal(result.status, 'APPLIED')
    const record = JSON.parse(readFileSync(recordPath(f), 'utf8'))
    assert.equal(record.schemaVersion, 1)
    assert.equal(record.storyId, '9.1')
    assert.equal(record.generation, 1)
    assert.equal(record.controlPlaneCommit, head)
    assert.equal(record.planHead, head)
    assert.equal(record.worktree, path.resolve(f.root))
    assert.equal(record.lead.sessionId, 'session-1')
    assert.deepEqual(record.orca, { runId: 'run-1', leadTerminal: 'lead-h', agyTerminal: 'agy-h' })
    assert.deepEqual(record.declaredScope, [])
    assert.deepEqual(f.gitStatus(), before)
    assert.equal(readFileSync(f.paths.activeRun, 'utf8'), pointer)
    const conflict = cli(f.root, claimArgs(f.root, 'another-session'))
    assert.equal(conflict.status, 'CONFLICT')
    assert.deepEqual(conflict.reasons, ['STORY_ALREADY_CLAIMED'])
    assert.equal(conflict.holder.lead.sessionId, 'session-1')
  } finally { f.cleanup() }
})

test('two claim processes have exactly one winner', async () => {
  const f = createV4Fixture()
  try {
    const results = await Promise.all([concurrentCli(f.root, claimArgs(f.root, 'one')), concurrentCli(f.root, claimArgs(f.root, 'two'))])
    assert.deepEqual(results.map(item => item.status).sort(), ['APPLIED', 'CONFLICT'])
    assert.deepEqual(results.find(item => item.status === 'CONFLICT').reasons, ['STORY_ALREADY_CLAIMED'])
  } finally { f.cleanup() }
})

test('takeover preserves pin and fences old heartbeat and release generations', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    const first = JSON.parse(readFileSync(recordPath(f), 'utf8'))
    const takeover = cli(f.root, ['claim', '9.1', '--takeover', '--lead-vendor', 'claude', '--session', 'replacement'])
    assert.equal(takeover.code, 0)
    assert.equal(takeover.record.generation, 2)
    assert.equal(takeover.record.controlPlaneCommit, first.controlPlaneCommit)
    assert.deepEqual(takeover.record.takeover.previous, { vendor: 'codex', session: 'session-1', generation: 1 })
    const bytes = readFileSync(recordPath(f), 'utf8')
    for (const args of [['heartbeat', '9.1', '--generation', '1', '--state', 'REVIEWING'], ['release', '9.1', '--generation', '1', '--abort']]) {
      const stale = cli(f.root, args)
      assert.equal(stale.status, 'STALE')
      assert.deepEqual(stale.reasons, ['GENERATION_FENCED'])
      assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
    }
    const heartbeat = cli(f.root, ['heartbeat', '9.1', '--generation', '2', '--state', 'WAITING_HUMAN'])
    assert.equal(heartbeat.code, 0)
    const updated = { ...heartbeat.record, state: first.state, heartbeatAt: first.heartbeatAt }
    assert.deepEqual(updated, { ...takeover.record, heartbeatAt: first.heartbeatAt })
    assert.ok(cli(f.root, ['status', '--json']).records[0].flags.includes('WAITING_OWNER'))
  } finally { f.cleanup() }
})

test('status flags stale and orphaned records without automatic takeover or deletion', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    const record = JSON.parse(readFileSync(recordPath(f), 'utf8'))
    record.heartbeatAt = '2000-01-01T00:00:00.000Z'
    record.worktree = path.join(f.root, 'missing worktree')
    writeFileSync(recordPath(f), JSON.stringify(record))
    const bytes = readFileSync(recordPath(f), 'utf8')
    const status = cli(f.root, ['status'])
    assert.equal(status.code, 0)
    assert.deepEqual(status.records[0].flags, ['STALE?', 'ORPHANED'])
    assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
    assert.equal(cli(f.root, ['release', '9.1', '--generation', '1', '--orphaned']).code, 0)
    assert.equal(existsSync(recordPath(f)), false)
  } finally { f.cleanup() }
})

test('malformed records fail closed and remain untouched', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    for (const bytes of ['{bad json', '{}']) {
      writeFileSync(recordPath(f), bytes)
      for (const args of [['status'], ['claim', '9.1', '--takeover', '--lead-vendor', 'claude', '--session', 'next'], ['release', '9.1', '--generation', '1', '--abort']]) {
        assert.equal(cli(f.root, args).status, 'INVALID')
        assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
      }
    }
  } finally { f.cleanup() }
})

test('release abort archives only the record and merged release removes it', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    assert.equal(cli(f.root, ['release', '9.1', '--generation', '1', '--orphaned']).status, 'BLOCKED')
    const before = f.gitStatus()
    assert.equal(cli(f.root, ['release', '9.1', '--generation', '1', '--abort']).code, 0)
    assert.equal(existsSync(recordPath(f)), false)
    assert.equal(readdirSync(path.join(path.dirname(path.dirname(recordPath(f))), 'aborted')).length, 1)
    assert.deepEqual(f.gitStatus(), before)
    assert.ok(existsSync(f.paths.plan))
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    assert.equal(cli(f.root, ['release', '9.1', '--generation', '1', '--merged']).code, 0)
    assert.equal(existsSync(recordPath(f)), false)
  } finally { f.cleanup() }
})

test('claim validates global pointer, checkout, Plan and Windows paths with spaces', () => {
  const f = createV4Fixture()
  try {
    const linked = path.join(f.root, '..', 'Story worktree with spaces')
    f.git(['worktree', 'add', '-b', 'story-9-1', linked, 'HEAD'])
    assert.deepEqual(cli(f.root, claimArgs(f.root)).reasons, ['WRONG_CHECKOUT'])
    const claimed = cli(f.root, claimArgs(linked))
    assert.equal(claimed.code, 0, JSON.stringify(claimed))
    assert.equal(claimed.record.worktree, path.resolve(linked))
    assert.equal(claimed.record.branch, 'story-9-1')
    assert.equal(cli(f.root, ['release', '9.1', '--generation', '1', '--merged']).code, 0)
    writeFileSync(f.paths.activeRun, JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'v3', storyId: '9.1' }))
    assert.deepEqual(cli(f.root, claimArgs(linked)).reasons, ['V3_POINTER_NOT_IDLE'])
    writeFileSync(f.paths.activeRun, JSON.stringify(f.canonicalPointer))
    writeFileSync(path.join(linked, '_bmad-output/implementation-artifacts/story-9-1-plan.md'), 'invalid Plan')
    assert.equal(cli(f.root, claimArgs(linked)).status, 'INVALID')
    assert.equal(existsSync(recordPath(f)), false)
  } finally { f.cleanup() }
})

test('claim stores the union of declared slice scopes', () => {
  const f = createV4Fixture()
  try {
    const text = readFileSync(f.paths.plan, 'utf8').replace('    status: pending', '    scope:\n      paths: ["src/fixture.txt", "src/"]\n    status: pending')
    writeFileSync(f.paths.plan, text)
    const result = cli(f.root, claimArgs(f.root))
    assert.equal(result.code, 0, JSON.stringify(result))
    assert.deepEqual(result.record.declaredScope, ['src/', 'src/fixture.txt'])
  } finally { f.cleanup() }
})

test('owner takeover still requires an idle pointer and a valid Plan in the claimed checkout', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    const bytes = readFileSync(recordPath(f), 'utf8')
    const takeover = ['claim', '9.1', '--takeover', '--lead-vendor', 'claude', '--session', 'next']
    writeFileSync(f.paths.activeRun, JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'v3', storyId: '9.1' }))
    assert.deepEqual(cli(f.root, takeover).reasons, ['V3_POINTER_NOT_IDLE'])
    assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
    writeFileSync(f.paths.activeRun, JSON.stringify(f.canonicalPointer))
    writeFileSync(f.paths.plan, 'invalid Plan')
    assert.equal(cli(f.root, takeover).status, 'INVALID')
    assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
  } finally { f.cleanup() }
})

test('policy-drift compares the pinned commit with main and only reports information', () => {
  const f = createV4Fixture()
  try {
    const policies = ['AGENTS.md', '.agents/routing/task-router.md', '.agents/skills/v4-story-runner/SKILL.md', '.agents/policies/orchestration-v3.md']
    for (const relative of policies) {
      mkdirSync(path.dirname(path.join(f.root, relative)), { recursive: true })
      writeFileSync(path.join(f.root, relative), 'pinned policy\n')
    }
    f.git(['add', '--', ...policies])
    f.git(['commit', '-m', 'seed policies'])
    const pin = f.git(['rev-parse', 'HEAD'])
    f.git(['checkout', '-b', 'story-9-1'])
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    const bytes = readFileSync(recordPath(f), 'utf8')
    assert.equal(cli(f.root, ['policy-drift', '9.1']).status, 'NONE')
    for (const relative of policies) writeFileSync(path.join(f.root, relative), 'new policy\n')
    f.git(['add', '--', ...policies])
    f.git(['commit', '-m', 'advance policy'])
    const latest = f.git(['rev-parse', 'HEAD'])
    assert.equal(cli(f.root, ['policy-drift', '9.1']).status, 'NONE', 'current Story HEAD must not replace the pinned policy')
    f.git(['update-ref', 'refs/heads/main', latest])
    const result = cli(f.root, ['policy-drift', '9.1'])
    assert.equal(result.code, 0)
    assert.equal(result.status, 'INFO_DRIFT')
    assert.deepEqual(result.paths, policies.sort())
    assert.equal(result.controlPlaneCommit, pin)
    assert.equal(result.canonicalMain, latest)
    assert.equal(readFileSync(recordPath(f), 'utf8'), bytes)
    assert.equal(f.git(['rev-parse', 'HEAD']), latest)
    assert.deepEqual(f.gitStatus(), [])
  } finally { f.cleanup() }
})

test('policy-drift treats paths absent from both policy commits as unchanged', () => {
  const f = createV4Fixture()
  try {
    assert.equal(cli(f.root, claimArgs(f.root)).code, 0)
    const result = cli(f.root, ['policy-drift', '9.1'])
    assert.equal(result.code, 0)
    assert.equal(result.status, 'NONE')
    assert.deepEqual(result.paths, [])
  } finally { f.cleanup() }
})
