import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const script = path.resolve('.agents/scripts/check-slice-implementation.mjs')
const planRelative = '_bmad-output/implementation-artifacts/story-9-1-plan.md'

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function pathDigest(paths) {
  const canonical = [...new Set(paths)].sort()
  return digest(canonical.length ? `${canonical.join('\n')}\n` : '')
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function planText(options, commits = {}) {
  const dependency = options.dependency ?? 'reviewed'
  const dependencyDetails = dependency === 'verified-eligible'
    ? '    status: verified\n    depends_on: []\n    verification:\n      progression_eligible: true\n'
    : dependency === 'verified-review-required'
      ? '    status: verified\n    depends_on: []\n    verification:\n      progression_eligible: true\n    review:\n      required: true\n      verdict: PENDING\n'
      : `    status: ${dependency}\n    depends_on: []\n`
  const blockers = options.blocker
    ? '\n  - id: implementation-blocked\n    reason: fixture blocker'
    : ' []'
  const questions = options.question
    ? '\n  - id: implementation-question\n    question: fixture question'
    : ' []'
  const sliceStatus = options.sliceStatus ?? 'pending'
  const currentSlice = options.currentSlice ?? 'B'
  const actionKind = options.actionKind ?? 'implement_slice'
  const actionTarget = options.actionTarget ?? currentSlice
  const implementation = options.implementation
    ? `    baseline_commit: ${commits.baseline}\n    checkpoint_commit: ${commits.checkpoint}\n    implementation:\n      changed_paths:\n        - src/impl.txt\n      changed_paths_sha256: ${pathDigest(['src/impl.txt'])}\n      focused_checks:\n        - command: node --test fixture\n          result: PASS\n          exit_code: 0\n      red_green:\n        applicable: false\n        reason: documentation-only fixture\n`
    : ''
  return `---
schema_version: 1
story_id: "9.1"
source:
  path: docs/product/epics.md
  anchor: "#story-91-fixture"
  section_digest: "${options.sourceDigest}"
sprint_key: 9-1-fixture
execution_status: ${options.executionStatus ?? 'in-progress'}
lifecycle_snapshot: ${options.lifecycle ?? 'in-progress'}
current_slice: ${currentSlice}
risk:
  level: HIGH
slices:
  - id: A
${dependencyDetails}  - id: B
    status: ${sliceStatus}
    depends_on: [A]
${implementation}blockers:${blockers}
unresolved_questions:${questions}
next_action:
  kind: ${actionKind}
  target: ${actionTarget}
---
`
}

function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'slice-implementation-'))
  const section = '### Story 9.1: Fixture\n\n**Acceptance Criteria:**\n\nDone.\n\n'
  const sourceDigest = digest(section)
  write(root, 'docs/product/epics.md', `# Epic\n\n${section}### Story 9.2: Next\n`)
  write(root, '_bmad-output/implementation-artifacts/sprint-status.yaml',
    `development_status:\n  epic-9: in-progress\n  9-1-fixture: ${options.lifecycle ?? 'in-progress'}\n`)
  write(root, 'src/tracked.txt', 'base\n')
  write(root, planRelative, planText({ ...options, sourceDigest }))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  return { root, baseline: git(root, 'rev-parse', 'HEAD'), sourceDigest }
}

function run(root, args = [], env = {}) {
  const result = spawnSync(process.execPath, [script, 'check', '9.1', 'B', ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env }
  })
  assert.ok(result.stdout, result.stderr)
  return { code: result.status, json: JSON.parse(result.stdout) }
}

function withFixture(options, callback) {
  const f = fixture(options)
  try { callback(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

function expectStatus(result, status, code, reason) {
  assert.equal(result.code, code, JSON.stringify(result.json))
  assert.equal(result.json.status, status)
  if (reason) assert.ok(result.json.reasons.includes(reason), JSON.stringify(result.json))
}

test('happy FRESH case', () => withFixture({}, f => {
  const result = run(f.root)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.mode, 'FRESH')
  assert.equal(result.json.ready, true)
  assert.equal(result.json.gitInventoryComplete, true)
  assert.equal(result.json.gitMetadataWriteRequired, true)
}))

test('wrong current slice is blocked', () => withFixture({ currentSlice: 'A', actionTarget: 'A' }, f => {
  expectStatus(run(f.root), 'BLOCKED', 3, 'TARGET_NOT_CURRENT_SLICE')
}))

test('wrong next action is blocked', () => withFixture({ actionKind: 'verify_slice' }, f => {
  expectStatus(run(f.root), 'BLOCKED', 3, 'IMPLEMENT_SLICE_ACTION_REQUIRED')
}))

test('invalid lifecycle or execution state is blocked', () => withFixture({ lifecycle: 'review' }, f => {
  expectStatus(run(f.root), 'BLOCKED', 3, 'LIFECYCLE_NOT_IN_PROGRESS')
}))

test('blocker present is blocked', () => withFixture({ blocker: true }, f => {
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'BLOCKERS_PRESENT')
  assert.equal(result.json.blockers[0].id, 'implementation-blocked')
}))

test('unresolved question present is blocked', () => withFixture({ question: true }, f => {
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'UNRESOLVED_QUESTIONS_PRESENT')
  assert.equal(result.json.unresolvedQuestions[0].id, 'implementation-question')
}))

test('pending dependency is not eligible', () => withFixture({ dependency: 'pending' }, f => {
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'DEPENDENCY_NOT_ELIGIBLE:A')
  assert.equal(result.json.dependencies[0].eligible, false)
}))

test('reviewed dependency is eligible', () => withFixture({ dependency: 'reviewed' }, f => {
  const result = run(f.root)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.dependencies[0].eligible, true)
}))

test('verified progression-eligible dependency without required review is eligible', () => withFixture({ dependency: 'verified-eligible' }, f => {
  const result = run(f.root)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.dependencies[0].eligible, true)
}))

test('verified dependency with unsatisfied required review is blocked', () => withFixture({ dependency: 'verified-review-required' }, f => {
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'DEPENDENCY_NOT_ELIGIBLE:A')
  assert.equal(result.json.dependencies[0].reason, 'REQUIRED_REVIEW_REMAINS')
}))

test('relevant staged path is blocked', () => withFixture({}, f => {
  write(f.root, 'src/staged.txt', 'staged\n')
  git(f.root, 'add', 'src/staged.txt')
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'RELEVANT_DIRTY_PATHS')
  assert.deepEqual(result.json.stagedPaths, ['src/staged.txt'])
}))

test('relevant unstaged path is blocked', () => withFixture({}, f => {
  write(f.root, 'src/tracked.txt', 'changed\n')
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'RELEVANT_DIRTY_PATHS')
  assert.deepEqual(result.json.unstagedPaths, ['src/tracked.txt'])
}))

test('relevant untracked path is blocked', () => withFixture({}, f => {
  write(f.root, 'src/untracked.txt', 'untracked\n')
  const result = run(f.root)
  expectStatus(result, 'BLOCKED', 3, 'RELEVANT_DIRTY_PATHS')
  assert.deepEqual(result.json.untrackedPaths, ['src/untracked.txt'])
}))

test('exact explicitly accepted unrelated noise is excluded', () => withFixture({}, f => {
  write(f.root, 'noise/exact.pyc', 'noise\n')
  const result = run(f.root, ['--exclude-unrelated', 'noise/exact.pyc'])
  expectStatus(result, 'READY', 0)
  assert.deepEqual(result.json.excludedUnrelatedPaths, ['noise/exact.pyc'])
  assert.deepEqual(result.json.relevantDirtyPaths, [])
}))

test('Git inventory failure returns ERROR and never claims completeness', () => withFixture({}, f => {
  const badIndex = path.join(f.root, 'bad-index')
  mkdirSync(badIndex)
  const result = run(f.root, [], { GIT_INDEX_FILE: badIndex })
  expectStatus(result, 'ERROR', 5, 'GIT_STAGED_PATHS_FAILED')
  assert.equal(result.json.gitInventoryComplete, false)
}))

test('malformed Plan propagates INVALID', () => withFixture({}, f => {
  write(f.root, planRelative, 'not frontmatter\n')
  expectStatus(run(f.root), 'INVALID', 4, 'INVALID_FRONTMATTER')
}))

test('missing requested slice is INVALID', () => withFixture({}, f => {
  const result = spawnSync(process.execPath, [script, 'check', '9.1', 'Z'], {
    cwd: f.root, encoding: 'utf8', windowsHide: true
  })
  const json = JSON.parse(result.stdout)
  assert.equal(result.status, 4)
  assert.equal(json.status, 'INVALID')
  assert.ok(json.reasons.includes('TARGET_SLICE_MISSING'))
}))

test('RECONCILIATION_REQUIRED is propagated', () => withFixture({
  lifecycle: 'backlog', actionKind: 'reconcile_lifecycle', actionTarget: 'story'
}, f => {
  expectStatus(run(f.root), 'RECONCILIATION_REQUIRED', 1, 'EXECUTION_AHEAD_OF_LIFECYCLE')
}))

test('STALE is propagated', () => withFixture({}, f => {
  const source = path.join(f.root, 'docs/product/epics.md')
  writeFileSync(source, readFileSync(source, 'utf8').replace('Done.', 'Changed.'))
  expectStatus(run(f.root), 'STALE', 2, 'SOURCE_DIGEST_MISMATCH')
}))

test('RESUME_WORKTREE requires exact explicit resume scope', () => withFixture({}, f => {
  write(f.root, 'src/resume.txt', 'partial\n')
  const result = run(f.root, ['--resume-path', 'src/resume.txt'])
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.mode, 'RESUME_WORKTREE')
  assert.deepEqual(result.json.relevantDirtyPaths, ['src/resume.txt'])
}))

test('CHECKPOINT_UNRECORDED requires an explicit exact checkpoint candidate', () => withFixture({}, f => {
  write(f.root, 'src/impl.txt', 'implemented\n')
  git(f.root, 'add', 'src/impl.txt')
  git(f.root, 'commit', '-qm', 'arbitrary subject is not classification input')
  const checkpoint = git(f.root, 'rev-parse', 'HEAD')
  const result = run(f.root, ['--checkpoint-candidate', checkpoint])
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.mode, 'CHECKPOINT_UNRECORDED')
  assert.equal(result.json.baselineCommit, f.baseline)
  assert.equal(result.json.checkpointCommit, checkpoint)
  assert.deepEqual(result.json.candidateChangedPaths, ['src/impl.txt'])
}))

test('PLAN_UPDATE_PENDING detects a matching uncommitted Plan-only mutation', () => withFixture({}, f => {
  write(f.root, 'src/impl.txt', 'implemented\n')
  git(f.root, 'add', 'src/impl.txt')
  git(f.root, 'commit', '-qm', 'implementation')
  const checkpoint = git(f.root, 'rev-parse', 'HEAD')
  write(f.root, planRelative, planText({
    sourceDigest: f.sourceDigest,
    sliceStatus: 'checkpointed',
    actionKind: 'verify_slice',
    actionTarget: 'B',
    implementation: true
  }, { baseline: f.baseline, checkpoint }))
  const result = run(f.root)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.mode, 'PLAN_UPDATE_PENDING')
  assert.deepEqual(result.json.metadataPaths, [planRelative])
  assert.equal(result.json.checkpointCommit, checkpoint)
  assert.deepEqual(result.json.relevantDirtyPaths, [planRelative])
}))

test('COMPLETE detects committed checkpoint metadata and never requests implementation', () => withFixture({}, f => {
  write(f.root, 'src/impl.txt', 'implemented\n')
  git(f.root, 'add', 'src/impl.txt')
  git(f.root, 'commit', '-qm', 'implementation')
  const checkpoint = git(f.root, 'rev-parse', 'HEAD')
  write(f.root, planRelative, planText({
    sourceDigest: f.sourceDigest,
    sliceStatus: 'checkpointed',
    actionKind: 'verify_slice',
    actionTarget: 'B',
    implementation: true
  }, { baseline: f.baseline, checkpoint }))
  git(f.root, 'add', planRelative)
  git(f.root, 'commit', '-qm', 'plan update')
  const result = run(f.root)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.mode, 'COMPLETE')
  assert.equal(result.json.gitMetadataWriteRequired, false)
  assert.ok(result.json.warnings.includes('DO_NOT_REIMPLEMENT'))
}))

test('helper is read-only', () => withFixture({}, f => {
  write(f.root, 'noise/exact.pyc', 'noise\n')
  const beforePlan = readFileSync(path.join(f.root, planRelative), 'utf8')
  const beforeStatus = git(f.root, 'status', '--porcelain=v2', '--untracked-files=all')
  run(f.root, ['--exclude-unrelated', 'noise/exact.pyc'])
  assert.equal(readFileSync(path.join(f.root, planRelative), 'utf8'), beforePlan)
  assert.equal(git(f.root, 'status', '--porcelain=v2', '--untracked-files=all'), beforeStatus)
}))
