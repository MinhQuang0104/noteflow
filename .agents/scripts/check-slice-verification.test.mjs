import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { canonicalPaths, pathListDigest, stableDigest } from './check-slice-verification.mjs'

const script = path.resolve('.agents/scripts/check-slice-verification.mjs')

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function write(root, relative, contents) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

function fixture({ mergeCheckpoint = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'slice-verification-'))
  const section = '### Story 9.1: Fixture\n\n**Acceptance Criteria:**\n\nDone.\n\n'
  const sourceDigest = createHash('sha256').update(section).digest('hex')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  write(root, 'docs/product/epics.md', `# Epic\n\n${section}### Story 9.2: Next\n`)
  write(root, 'docs/architecture/ref.md', 'reference\n')
  write(root, '_bmad-output/implementation-artifacts/sprint-status.yaml', 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, 'src/deleted.txt', 'delete me\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'base')
  const baseline = git(root, 'rev-parse', 'HEAD')

  let checkpoint
  if (mergeCheckpoint) {
    git(root, 'checkout', '-qb', 'side')
    write(root, 'src/side.txt', 'side\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'side')
    git(root, 'checkout', '-q', '-')
    write(root, 'src/main.txt', 'main\n')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'main')
    git(root, 'merge', '--no-ff', '-qm', 'merge checkpoint', 'side')
    checkpoint = git(root, 'rev-parse', 'HEAD')
  } else {
    write(root, 'src/b.txt', 'b\n')
    write(root, 'src/a.txt', 'a\n')
    rmSync(path.join(root, 'src/deleted.txt'))
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'checkpoint')
    checkpoint = git(root, 'rev-parse', 'HEAD')
  }

  const changedPaths = canonicalPaths(git(root, 'diff', '--name-only', '--diff-filter=ACDMRT', `${baseline}..${checkpoint}`).split(/\r?\n/))
  const changedPathsSha256 = pathListDigest(changedPaths)
  const planPath = path.join(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md')
  const plan = `---
schema_version: 1
story_id: "9.1"
source:
  path: docs/product/epics.md
  anchor: "#story-91-fixture"
  section_digest: "sha256:${sourceDigest}"
sprint_key: 9-1-fixture
execution_status: in-progress
lifecycle_snapshot: in-progress
current_slice: A
risk:
  level: HIGH
  flags: [security, concurrency]
slices:
  - id: A
    status: checkpointed
    depends_on: []
    checkpoint_commit: ${checkpoint}
    verification:
      focused_tests: "PASS: legacy summary"
    review:
      verdict: APPROVE
      reviewed_commit: ${checkpoint}
blockers: []
unresolved_questions: []
next_action:
  kind: verify_slice
  target: A
---
`
  writeFileSync(planPath, plan)
  return { root, planPath, baseline, checkpoint, changedPaths, changedPathsSha256 }
}

function check(root, id = '9.1', slice = 'A') {
  const result = spawnSync(process.execPath, [script, 'check', id, slice], { cwd: root, encoding: 'utf8' })
  assert.equal(result.stderr, '')
  return { code: result.status, json: JSON.parse(result.stdout) }
}

function editPlan(f, transform) {
  const before = readFileSync(f.planPath, 'utf8')
  const after = transform(before)
  assert.notEqual(after, before)
  writeFileSync(f.planPath, after)
}

function withFixture(run, options) {
  const f = fixture(options)
  try { run(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

test('valid checkpoint slice is ready for rerunning legacy focused evidence', () => withFixture(f => {
  const result = check(f.root)
  assert.equal(result.code, 0)
  assert.equal(result.json.valid, true)
  assert.equal(result.json.status, 'RERUN_REQUIRED')
  assert.equal(result.json.mode, 'checkpoint')
}))

test('legacy baseline is derived from a checkpoint single parent', () => withFixture(f => {
  const result = check(f.root)
  assert.equal(result.json.baselineCommit, f.baseline)
  assert.ok(result.json.reasons.includes('LEGACY_BASELINE_DERIVED_FROM_FIRST_PARENT'))
}))

test('persisted baseline is preferred', () => withFixture(f => {
  editPlan(f, text => text.replace(`checkpoint_commit: ${f.checkpoint}`, `baseline_commit: ${f.baseline}\n    checkpoint_commit: ${f.checkpoint}`))
  const result = check(f.root)
  assert.equal(result.json.baselineCommit, f.baseline)
  assert.ok(!result.json.reasons.includes('LEGACY_BASELINE_DERIVED_FROM_FIRST_PARENT'))
}))

test('merge checkpoint without persisted baseline is blocked', () => withFixture(f => {
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.includes('AMBIGUOUS_CHECKPOINT_BASELINE'))
}, { mergeCheckpoint: true }))

test('missing checkpoint is blocked', () => withFixture(f => {
  editPlan(f, text => text.replace(`    checkpoint_commit: ${f.checkpoint}\n`, ''))
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.reasons.includes('CHECKPOINT_REQUIRED'))
}))

test('checkpoint that is not an ancestor is stale', () => withFixture(f => {
  const other = mkdtempSync(path.join(tmpdir(), 'slice-other-'))
  try {
    git(other, 'init', '-q')
    git(other, 'config', 'user.email', 'test@example.com')
    git(other, 'config', 'user.name', 'Test')
    write(other, 'other.txt', 'other\n')
    git(other, 'add', '.')
    git(other, 'commit', '-qm', 'other')
    const sha = git(other, 'rev-parse', 'HEAD')
    git(f.root, 'fetch', '-q', other, 'HEAD')
    editPlan(f, text => text.replaceAll(f.checkpoint, sha))
    const result = check(f.root)
    assert.equal(result.code, 2)
    assert.equal(result.json.status, 'STALE')
    assert.ok(result.json.reasons.includes('CHECKPOINT_NOT_ANCESTOR'))
  } finally { rmSync(other, { recursive: true, force: true }) }
}))

test('changed paths are derived exactly and sorted', () => withFixture(f => {
  assert.deepEqual(check(f.root).json.changedPaths, ['src/a.txt', 'src/b.txt', 'src/deleted.txt'])
}))

test('path canonicalization normalizes, deduplicates, and sorts', () => {
  assert.deepEqual(canonicalPaths(['z\\b', './a/x', 'z/b', '', 'a/x']), ['a/x', 'z/b'])
})

test('changed path digest is stable', () => {
  const one = pathListDigest(['b', 'a', 'a'])
  const two = pathListDigest(['a', 'b'])
  assert.equal(one, two)
  assert.match(one, /^sha256:[0-9a-f]{64}$/)
})

test('persisted changed path allowlist exact match passes', () => withFixture(f => {
  const yaml = f.changedPaths.map(item => `        - ${item}`).join('\n')
  editPlan(f, text => text.replace('      focused_tests:', `      changed_paths:\n${yaml}\n      changed_paths_sha256: ${f.changedPathsSha256}\n      focused_tests:`))
  assert.equal(check(f.root).json.status, 'RERUN_REQUIRED')
}))

test('persisted allowlist missing a path is blocked', () => withFixture(f => {
  editPlan(f, text => text.replace('      focused_tests:', '      changed_paths: [src/a.txt, src/b.txt]\n      focused_tests:'))
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.reasons.includes('CHANGED_PATHS_ALLOWLIST_MISMATCH'))
}))

test('persisted allowlist with an extra path is blocked', () => withFixture(f => {
  editPlan(f, text => text.replace('      focused_tests:', '      changed_paths: [src/a.txt, src/b.txt, src/deleted.txt, src/extra.txt]\n      focused_tests:'))
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.reasons.includes('CHANGED_PATHS_ALLOWLIST_MISMATCH'))
}))

test('post-checkpoint implementation drift is stale', () => withFixture(f => {
  write(f.root, 'src/a.txt', 'after checkpoint\n')
  git(f.root, 'add', 'src/a.txt')
  git(f.root, 'commit', '-qm', 'drift')
  const result = check(f.root)
  assert.equal(result.code, 2)
  assert.deepEqual(result.json.postCheckpointDrift, ['src/a.txt'])
}))

test('staged implementation drift is blocked', () => withFixture(f => {
  write(f.root, 'src/a.txt', 'staged\n')
  git(f.root, 'add', 'src/a.txt')
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.workingDrift.some(item => item.kind === 'staged' && item.path === 'src/a.txt'))
}))

test('unstaged implementation drift is blocked', () => withFixture(f => {
  write(f.root, 'src/a.txt', 'unstaged\n')
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.workingDrift.some(item => item.kind === 'unstaged' && item.path === 'src/a.txt'))
}))

test('relevant untracked drift is blocked', () => withFixture(f => {
  write(f.root, 'src/deleted.txt', 'returned untracked\n')
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.ok(result.json.workingDrift.some(item => item.kind === 'untracked' && item.path === 'src/deleted.txt'))
}))

test('unrelated untracked file does not stale the slice', () => withFixture(f => {
  write(f.root, 'notes/unrelated.txt', 'unrelated\n')
  const result = check(f.root)
  assert.equal(result.code, 0)
  assert.deepEqual(result.json.workingDrift, [])
}))

test('source digest is fresh', () => withFixture(f => {
  assert.equal(check(f.root).json.sourceFreshness, 'FRESH')
}))

test('changed Story source digest is stale', () => withFixture(f => {
  const file = path.join(f.root, 'docs/product/epics.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('Done.', 'Changed.'))
  const result = check(f.root)
  assert.equal(result.code, 2)
  assert.equal(result.json.sourceFreshness, 'STALE')
}))

test('persisted reference digest is verified', () => withFixture(f => {
  const digest = `sha256:${createHash('sha256').update('reference\n').digest('hex')}`
  editPlan(f, text => text.replace('execution_status:', `architecture_refs:\n  - path: docs/architecture/ref.md\n    digest: ${digest}\nexecution_status:`))
  assert.equal(check(f.root).json.referenceFreshness, 'DIGEST_FRESH')
}))

test('persisted reference digest mismatch is stale', () => withFixture(f => {
  const digest = `sha256:${'0'.repeat(64)}`
  editPlan(f, text => text.replace('execution_status:', `architecture_refs:\n  - path: docs/architecture/ref.md\n    digest: ${digest}\nexecution_status:`))
  const result = check(f.root)
  assert.equal(result.code, 2)
  assert.equal(result.json.referenceFreshness, 'STALE')
  assert.ok(result.json.reasons.includes('REFERENCE_DIGEST_MISMATCH'))
}))

test('legacy summary evidence requires rerun', () => withFixture(f => {
  assert.deepEqual(check(f.root).json.evidence.map(item => item.status), ['RERUN_REQUIRED'])
}))

test('structured immutable evidence is reusable', () => withFixture(f => {
  const tree = git(f.root, 'rev-parse', `${f.checkpoint}^{tree}`)
  const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
  editPlan(f, text => text.replace('      focused_tests: "PASS: legacy summary"', `      changed_paths_sha256: ${f.changedPathsSha256}\n      focused_checks:\n        - id: focused\n          command_digest: ${digest('command')}\n          subject:\n            commit: ${f.checkpoint}\n            tree: ${tree}\n          changed_paths_sha256: ${f.changedPathsSha256}\n          toolchain_digest: ${digest('toolchain')}\n          result: PASS\n          exit_code: 0\n          environment_sensitive: false`))
  const result = check(f.root)
  assert.deepEqual(result.json.evidence.map(item => item.status), ['REUSABLE'])
  assert.equal(result.json.status, 'READY')
}))

test('environment-sensitive evidence without identity requires rerun', () => withFixture(f => {
  const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
  editPlan(f, text => text.replace('      focused_tests: "PASS: legacy summary"', `      focused_checks:\n        - id: focused\n          command_digest: ${digest('command')}\n          subject:\n            commit: ${f.checkpoint}\n          changed_paths_sha256: ${f.changedPathsSha256}\n          toolchain_digest: ${digest('toolchain')}\n          result: PASS\n          exit_code: 0\n          environment_sensitive: true`))
  assert.deepEqual(check(f.root).json.evidence.map(item => item.status), ['RERUN_REQUIRED'])
}))

test('structured evidence that contradicts the checkpoint is blocked', () => withFixture(f => {
  const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
  editPlan(f, text => text.replace('      focused_tests: "PASS: legacy summary"', `      focused_checks:\n        - id: focused\n          command_digest: ${digest('command')}\n          subject:\n            commit: ${f.baseline}\n          changed_paths_sha256: ${f.changedPathsSha256}\n          toolchain_digest: ${digest('toolchain')}\n          result: PASS\n          exit_code: 0\n          environment_sensitive: false`))
  const result = check(f.root)
  assert.equal(result.code, 3)
  assert.equal(result.json.evidence[0].status, 'BLOCKED')
  assert.ok(result.json.evidence[0].reasons.includes('SUBJECT_MISMATCH'))
}))

test('matching reviewed commit is a freshness candidate pending checks', () => withFixture(f => {
  assert.equal(check(f.root).json.reviewFreshness.status, 'REVIEW_FRESHNESS_PENDING_CHECKS')
}))

test('reviewed commit mismatch makes review stale', () => withFixture(f => {
  editPlan(f, text => text.replace(`reviewed_commit: ${f.checkpoint}`, `reviewed_commit: ${f.baseline}`))
  assert.equal(check(f.root).json.reviewFreshness.status, 'STALE')
}))

test('risk context structural mismatch makes review stale', () => withFixture(f => {
  editPlan(f, text => text.replace('      verdict: APPROVE', `      verdict: APPROVE\n      risk_context_digest: ${stableDigest({ level: 'LOW', flags: [] })}`))
  const review = check(f.root).json.reviewFreshness
  assert.equal(review.status, 'STALE')
  assert.ok(review.reasons.includes('RISK_CONTEXT_MISMATCH'))
}))

test('helper performs no mutation', () => withFixture(f => {
  const planBefore = readFileSync(f.planPath, 'utf8')
  const statusBefore = git(f.root, 'status', '--porcelain=v1')
  check(f.root)
  assert.equal(readFileSync(f.planPath, 'utf8'), planBefore)
  assert.equal(git(f.root, 'status', '--porcelain=v1'), statusBefore)
}))
