import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { pathListDigest } from './check-slice-verification.mjs'
import { validate } from './check-story-plan.mjs'
import { inspect as implementation } from './check-slice-implementation.mjs'
import { inspect as verification } from './check-slice-verification.mjs'

const source = readFileSync(new URL('./fixtures/artifact-contract/story-9-1.md', import.meta.url), 'utf8')
const write = (root, name, contents) => {
  const target = path.join(root, name)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, contents)
}
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
function yaml(value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return '\n' + value.map(item => typeof item === 'object' && item !== null
      ? `${pad}- ${yaml(item, indent + 2).trimStart()}`
      : `${pad}- ${JSON.stringify(item)}`).join('\n')
  }
  if (value && typeof value === 'object') {
    return (indent ? '\n' : '') + Object.entries(value).map(([key, item]) => {
      const rendered = yaml(item, indent + 2)
      return `${pad}${key}:${rendered.startsWith('\n') ? rendered : ` ${rendered}`}`
    }).join('\n')
  }
  return JSON.stringify(value)
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'dual-schema-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  write(root, 'src/base.txt', 'base\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/implementation.txt', 'implementation\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'checkpoint')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const storyPath = 'docs/stories/story-9-1.md'
  write(root, storyPath, source)
  write(root, '_bmad-output/implementation-artifacts/sprint-status.yaml', 'development_status:\n  9-1-fixture: in-progress\n')
  const changedPathsSha256 = pathListDigest(['src/implementation.txt'])
  const plan = {
    schema_version: 2, story_id: '9.1',
    story: { path: storyPath, normative_digest: normativeDigest(inspectStory(source)) },
    sprint_key: '9-1-fixture', execution_status: 'in-progress', lifecycle_snapshot: 'in-progress',
    current_slice: 'A',
    slices: [{ id: 'A', status: 'pending', task_refs: ['T-1', 'T-1.1'], depends_on: [] },
      { id: 'B', status: 'pending', task_refs: ['T-2'], depends_on: ['A'] }],
    blockers: [], unresolved_questions: [], next_action: { kind: 'implement_slice', target: 'A' }
  }
  const receipt = { schema_version: 1, story_id: '9.1', slice_id: 'A', kind: 'implementation',
    checkpoint_commit: checkpoint, baseline_commit: baseline,
    subject_digest: plan.story.normative_digest, created_from_head: checkpoint,
    changed_paths_sha256: changedPathsSha256,
    commands: [{ command: 'node --check src/implementation.txt', exit_code: 0, tool: 'Node.js', environment: 'fixture' }] }
  const save = () => write(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md', `---\n${yaml(plan)}\n---\n`)
  const saveReceipt = () => {
    write(root, 'receipts/implementation.json', JSON.stringify(receipt))
    plan.slices[0].receipt_refs = { implementation: { path: 'receipts/implementation.json', digest: receiptDigest(receipt) } }
  }
  save()
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'record plan')
  return { root, plan, receipt, baseline, checkpoint, save, saveReceipt, storyPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function withFixture(run) {
  const f = fixture()
  try { run(f) } finally { f.cleanup() }
}

test('separated pending Plan validates and implementation starts FRESH', () => withFixture(f => {
  const result = validate(f.root, '9.1')
  assert.equal(result.status, 'READY', `${JSON.stringify(result)}\n${yaml(f.plan)}`)
  assert.equal(implementation(f.root, '9.1', 'A').mode, 'FRESH')
}))

const planStatus = f => validate(f.root, '9.1')
function checkpoint(f) {
  f.plan.slices[0].status = 'checkpointed'
  f.plan.slices[0].baseline_commit = f.baseline
  f.plan.slices[0].checkpoint_commit = f.checkpoint
  f.plan.slices[0].subject_digest = f.plan.story.normative_digest
  f.plan.slices[0].changed_paths_sha256 = f.receipt.changed_paths_sha256
  f.plan.next_action.kind = 'verify_slice'
  f.saveReceipt()
  f.save()
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'record checkpoint')
}

for (const [name, mutate, expected, reason] of [
  ['invalid Story contract', f => write(f.root, f.storyPath, source.replace('- AC-1:', '- AC-2:')), 'INVALID', 'INVALID_STORY_CONTRACT'],
  ['wrong Story ID', f => f.plan.story_id = '9.2', 'INVALID', 'STORY_ID_MISMATCH'],
  ['normative digest mismatch', f => f.plan.story.normative_digest = `sha256:${'a'.repeat(64)}`, 'STALE', 'STORY_NORMATIVE_DIGEST_MISMATCH'],
  ['nonexistent task ref', f => f.plan.slices[0].task_refs.push('T-99'), 'INVALID', 'UNKNOWN_TASK_REF'],
  ['uncovered Task', f => f.plan.slices[1].task_refs = ['T-1'], 'INVALID', 'UNCOVERED_TASK'],
  ['cyclic slices', f => f.plan.slices[0].depends_on = ['B'], 'INVALID', 'CYCLIC_SLICE_DEPENDENCY'],
  ['unknown schema', f => f.plan.schema_version = 3, 'INVALID', 'UNSUPPORTED_SCHEMA'],
  ['mixed schema', f => f.plan.source = { path: 'docs/product/epics.md' }, 'INVALID', 'MIXED_SCHEMA_PLAN'],
]) test(`Plan v2: ${name}`, () => withFixture(f => {
  mutate(f); f.save()
  const result = planStatus(f)
  assert.equal(result.status, expected, JSON.stringify(result))
  assert.ok(result.reasons.includes(reason), JSON.stringify(result))
}))

for (const [name, text, status] of [
  ['completion', source.replace('Pending.', 'Complete.') , 'READY'],
  ['status', source.replace('status: ready-for-dev', 'status: in-progress'), 'READY'],
  ['task checkbox', source.replace('- [ ] T-1', '- [x] T-1'), 'READY'],
  ['AC text', source.replace('one entry.', 'two entries.'), 'STALE'],
  ['Task semantics', source.replace('Add the save operation.', 'Add an encrypted save operation.'), 'STALE'],
]) test(`Plan v2: ${name} edit has ${status} freshness`, () => withFixture(f => {
  write(f.root, f.storyPath, text)
  assert.equal(planStatus(f).status, status)
}))

test('Plan v2: checkpoint requires implementation receipt', () => withFixture(f => {
  checkpoint(f)
  delete f.plan.slices[0].receipt_refs
  f.save()
  assert.equal(planStatus(f).status, 'INVALID')
}))

test('Plan v2: tampered receipt digest is STALE', () => withFixture(f => {
  checkpoint(f)
  f.plan.slices[0].receipt_refs.implementation.digest = `sha256:${'f'.repeat(64)}`
  f.save()
  assert.equal(planStatus(f).status, 'STALE')
}))

test('Plan v2: checkpoint subject digest remains separate from Story normative digest', () => withFixture(f => {
  checkpoint(f)
  const subject = `sha256:${'1'.repeat(64)}`
  f.plan.slices[0].subject_digest = subject
  f.receipt.subject_digest = subject
  write(f.root, 'receipts/implementation.json', JSON.stringify(f.receipt))
  f.plan.slices[0].receipt_refs.implementation.digest = receiptDigest(f.receipt)
  f.save()
  assert.equal(planStatus(f).status, 'READY')
}))

test('Plan v2: malformed slice and blocker shapes are INVALID', () => withFixture(f => {
  f.plan.slices[0] = null
  f.plan.blockers = { id: 'bad' }
  f.save()
  assert.equal(planStatus(f).status, 'INVALID')
}))

test('Plan v2: null receipt document is INVALID', () => withFixture(f => {
  checkpoint(f)
  write(f.root, 'receipts/implementation.json', 'null')
  assert.equal(planStatus(f).status, 'INVALID')
}))

test('Plan v2: malformed receipt command is INVALID', () => withFixture(f => {
  checkpoint(f)
  f.receipt.commands = [null]
  write(f.root, 'receipts/implementation.json', JSON.stringify(f.receipt))
  f.plan.slices[0].receipt_refs.implementation.digest = receiptDigest(f.receipt)
  f.save()
  assert.equal(planStatus(f).status, 'INVALID')
}))

test('implementation v2: checkpointed receipt is COMPLETE', () => withFixture(f => {
  checkpoint(f)
  const result = implementation(f.root, '9.1', 'A')
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'COMPLETE')
}))

test('verification v2: checkpoint without verification receipt requires rerun', () => withFixture(f => {
  checkpoint(f)
  const result = verification(f.root, '9.1', 'A')
  assert.equal(result.status, 'RERUN_REQUIRED', JSON.stringify(result))
}))

function addVerificationReceipt(f) {
  const receipt = { ...structuredClone(f.receipt), kind: 'verification',
    focused_checks: [{ id: 'focused-test', command_digest: `sha256:${'a'.repeat(64)}`,
      subject: { commit: f.checkpoint }, changed_paths_sha256: f.receipt.changed_paths_sha256,
      toolchain_digest: `sha256:${'b'.repeat(64)}`, result: 'PASS', exit_code: 0 }] }
  write(f.root, 'receipts/verification.json', JSON.stringify(receipt))
  f.plan.slices[0].receipt_refs.verification = { path: 'receipts/verification.json', digest: receiptDigest(receipt) }
  f.save()
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'record verification')
  return receipt
}

test('implementation v2: relevant dirty path blocks', () => withFixture(f => {
  write(f.root, 'src/implementation.txt', 'dirty\n')
  const result = implementation(f.root, '9.1', 'A')
  assert.equal(result.status, 'BLOCKED')
  assert.ok(result.reasons.includes('RELEVANT_DIRTY_PATHS'))
}))

test('implementation v2: exact explicit resume succeeds', () => withFixture(f => {
  write(f.root, 'src/implementation.txt', 'dirty\n')
  const result = implementation(f.root, '9.1', 'A', { resumePaths: ['src/implementation.txt'] })
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'RESUME_WORKTREE')
}))

test('implementation v2: unrelated noise requires explicit exclusion', () => withFixture(f => {
  write(f.root, 'noise.tmp', 'unrelated\n')
  assert.equal(implementation(f.root, '9.1', 'A').status, 'BLOCKED')
  const result = implementation(f.root, '9.1', 'A', { excludeUnrelated: ['noise.tmp'] })
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'FRESH')
}))

test('implementation v2: blocker blocks pending slice', () => withFixture(f => {
  f.plan.blockers = [{ id: 'blocked-1', reason: 'Unresolved contract' }]
  f.save()
  const result = implementation(f.root, '9.1', 'A')
  assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
  assert.ok(result.reasons.includes('BLOCKERS_PRESENT'))
}))

test('implementation v2: checkpoint receipt mismatch fails closed', () => withFixture(f => {
  checkpoint(f)
  f.receipt.checkpoint_commit = f.baseline
  write(f.root, 'receipts/implementation.json', JSON.stringify(f.receipt))
  f.plan.slices[0].receipt_refs.implementation.digest = receiptDigest(f.receipt)
  f.save()
  assert.notEqual(implementation(f.root, '9.1', 'A').status, 'READY')
}))

test('verification v2: fresh verification receipt can be reused', () => withFixture(f => {
  checkpoint(f)
  addVerificationReceipt(f)
  const result = verification(f.root, '9.1', 'A')
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.evidence[0].status, 'REUSABLE')
}))

test('verification v2: normative Story edit is STALE', () => withFixture(f => {
  checkpoint(f)
  write(f.root, f.storyPath, source.replace('one entry.', 'two entries.'))
  assert.equal(verification(f.root, '9.1', 'A').status, 'STALE')
}))

test('verification v2: completion edit does not invalidate checkpoint', () => withFixture(f => {
  checkpoint(f)
  addVerificationReceipt(f)
  write(f.root, f.storyPath, source.replace('Pending.', 'Complete.'))
  assert.equal(verification(f.root, '9.1', 'A').status, 'READY')
}))

test('verification v2: post-checkpoint implementation drift is STALE', () => withFixture(f => {
  checkpoint(f)
  write(f.root, 'src/implementation.txt', 'changed after checkpoint\n')
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'drift')
  const result = verification(f.root, '9.1', 'A')
  assert.equal(result.status, 'STALE', JSON.stringify(result))
  assert.ok(result.reasons.includes('POST_CHECKPOINT_IMPLEMENTATION_DRIFT'))
}))

test('verification v2: receipt tamper is STALE', () => withFixture(f => {
  checkpoint(f)
  const receipt = addVerificationReceipt(f)
  receipt.commands[0].environment = 'tampered'
  write(f.root, 'receipts/verification.json', JSON.stringify(receipt))
  assert.equal(verification(f.root, '9.1', 'A').status, 'STALE')
}))

test('verification v2: wrong checkpoint binding fails closed', () => withFixture(f => {
  checkpoint(f)
  const receipt = addVerificationReceipt(f)
  receipt.checkpoint_commit = f.baseline
  receipt.created_from_head = f.baseline
  write(f.root, 'receipts/verification.json', JSON.stringify(receipt))
  f.plan.slices[0].receipt_refs.verification.digest = receiptDigest(receipt)
  f.save()
  assert.notEqual(verification(f.root, '9.1', 'A').status, 'READY')
}))

test('Plan v2: verified slice requires verification receipt', () => withFixture(f => {
  checkpoint(f)
  f.plan.slices[0].status = 'verified'
  f.save()
  const result = planStatus(f)
  assert.equal(result.status, 'INVALID')
  assert.ok(result.reasons.includes('VERIFICATION_RECEIPT_REQUIRED'))
}))

function dependencyFixture(f, status) {
  checkpoint(f)
  addVerificationReceipt(f)
  f.plan.slices[0].status = status
  if (status === 'reviewed') {
    const receipt = { ...structuredClone(f.receipt), kind: 'review' }
    write(f.root, 'receipts/review.json', JSON.stringify(receipt))
    f.plan.slices[0].receipt_refs.review = { path: 'receipts/review.json', digest: receiptDigest(receipt) }
  } else f.plan.slices[0].verification = { progression_eligible: true }
  f.plan.current_slice = 'B'
  f.plan.next_action = { kind: 'implement_slice', target: 'B' }
  f.save()
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'progress to next slice')
}

for (const status of ['reviewed', 'verified']) test(`implementation v2: ${status} dependency is eligible`, () => withFixture(f => {
  dependencyFixture(f, status)
  const result = implementation(f.root, '9.1', 'B')
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'FRESH')
  assert.equal(result.dependencies[0].eligible, true)
}))

test('Plan v2: tampered current dependency receipt is STALE', () => withFixture(f => {
  dependencyFixture(f, 'reviewed')
  const receipt = JSON.parse(readFileSync(path.join(f.root, 'receipts/review.json'), 'utf8'))
  receipt.commands[0].environment = 'tampered'
  write(f.root, 'receipts/review.json', JSON.stringify(receipt))
  const result = planStatus(f)
  assert.equal(result.status, 'STALE', JSON.stringify(result))
  assert.equal(implementation(f.root, '9.1', 'B').status, 'STALE')
}))

test('implementation v2: explicit checkpoint candidate stays CHECKPOINT_UNRECORDED', () => withFixture(f => {
  write(f.root, 'src/next.txt', 'next\n')
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'next implementation')
  const candidate = git(f.root, 'rev-parse', 'HEAD')
  const result = implementation(f.root, '9.1', 'A', { checkpointCandidate: candidate })
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'CHECKPOINT_UNRECORDED')
}))

test('implementation v2: Plan and bound receipt update is PLAN_UPDATE_PENDING', () => withFixture(f => {
  const baseline = git(f.root, 'rev-parse', 'HEAD')
  write(f.root, 'src/next.txt', 'next\n')
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'next implementation')
  const checkpointCommit = git(f.root, 'rev-parse', 'HEAD')
  f.plan.slices[0].status = 'checkpointed'
  f.plan.slices[0].baseline_commit = baseline
  f.plan.slices[0].checkpoint_commit = checkpointCommit
  f.plan.slices[0].subject_digest = f.plan.story.normative_digest
  f.plan.slices[0].changed_paths_sha256 = pathListDigest(['src/next.txt'])
  f.plan.next_action.kind = 'verify_slice'
  f.receipt.baseline_commit = baseline
  f.receipt.checkpoint_commit = checkpointCommit
  f.receipt.created_from_head = checkpointCommit
  f.receipt.changed_paths_sha256 = f.plan.slices[0].changed_paths_sha256
  f.saveReceipt()
  f.save()
  const result = implementation(f.root, '9.1', 'A')
  assert.equal(result.status, 'READY', JSON.stringify(result))
  assert.equal(result.mode, 'PLAN_UPDATE_PENDING')
}))
