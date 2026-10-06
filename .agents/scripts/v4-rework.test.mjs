import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { applyRework, checkpointImplementation, prepareAction, prepareRework } from './v4-action-kernel.mjs'
import { deriveScope, stableDigest } from './check-story-finalization.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'
import { runV4Story } from './v4-story-runner.mjs'

const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const STORY = 'docs/story.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const POINTER = '.agent-state/active-run.json'
const RECEIPT_DIR = '_bmad-output/implementation-artifacts/receipts/story-9-1'
const OLD_RECEIPT = `${RECEIPT_DIR}/D-implementation.json`
const NEW_IMPLEMENTATION_RECEIPT = `${RECEIPT_DIR}/D-implementation-attempt-2.json`
const NEW_VERIFICATION_RECEIPT = `${RECEIPT_DIR}/D-verification-attempt-2.json`
const NEW_REVIEW_RECEIPT = `${RECEIPT_DIR}/D-review-attempt-2.json`
const digest = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const pathDigest = paths => digest(`${[...new Set(paths)].sort().join('\n')}\n`)

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

function storySource() {
  return [
    '---', 'story_id: "9.1"', 'title: Rework fixture', 'status: in-progress', '---',
    '# Rework fixture', '',
    '<!-- v4:story:start -->', 'A bounded rework fixture.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', '- AC-1: The original and rework attempts remain auditable.', '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', '- [ ] T-6 [AC-1]: Implement the current slice.', '- [ ] T-7 [AC-1]: Verify the successor slice.', '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: .agents/docs/v4-action-kernel.md#kernel', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', '- level: HIGH', '- invariant: append-only attempt history', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

function planText(storyDigest, sliceText, nextKind, nextTarget) {
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', `current_slice: ${nextTarget}`,
    'risk:', '  level: HIGH', 'slices:', sliceText, 'blockers: []', 'unresolved_questions: []',
    'next_action:', `  kind: ${nextKind}`, `  target: ${nextTarget}`, '---', ''
  ].join('\n')
}

function pendingSlices() {
  return [
    '  - id: D', '    status: pending', '    task_refs: [T-6]', '    depends_on: []',
    '  - id: E', '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

function checkpointedSlices(baseline, checkpoint, subjectDigest, changedDigest, receiptDigestValue) {
  return [
    '  - id: D', '    status: checkpointed', '    task_refs: [T-6]', '    depends_on: []',
    `    baseline_commit: ${baseline}`, `    checkpoint_commit: ${checkpoint}`,
    `    subject_digest: ${subjectDigest}`, `    changed_paths_sha256: ${changedDigest}`,
    '    receipt_refs:', '      implementation:', `        path: ${OLD_RECEIPT}`, `        digest: ${receiptDigestValue}`,
    '  - id: E', '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

function reworkSlices(f) {
  const history = [
    '    attempt_history:', '      - attempt_id: 1', '        status: checkpointed',
    `        baseline_commit: ${f.baseline}`, `        checkpoint_commit: ${f.checkpoint}`,
    `        subject_digest: ${f.subjectDigest}`, `        changed_paths_sha256: ${f.changedDigest}`,
    '        receipt_refs:', '          implementation:', `            path: ${OLD_RECEIPT}`, `            digest: ${f.oldReceiptDigest}`
  ]
  const current = [
    '    current_attempt:', '      attempt_id: 2', '      receipt_refs:',
    '        implementation:', `          path: ${NEW_IMPLEMENTATION_RECEIPT}`,
    '        verification:', `          path: ${NEW_VERIFICATION_RECEIPT}`,
    '        review:', `          path: ${NEW_REVIEW_RECEIPT}`
  ]
  return [
    '  - id: D', '    status: pending', '    task_refs: [T-6]', '    depends_on: []', ...history, ...current,
    '  - id: E', '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-rework-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  const files = {
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'src/sync.ts': 'old sync\n', 'src/sync.spec.ts': 'old test\n', 'src/untouched.txt': 'untouched\n'
  }
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  const story = storySource()
  const storyDigest = normativeDigest(inspectStory(story))
  write(root, STORY, story)
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, PLAN, planText(storyDigest, pendingSlices(), 'implement_slice', 'D'))
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Rework Fixture')
  git(root, 'config', 'user.email', 'v4-rework@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')

  write(root, 'src/sync.ts', 'old implementation\n')
  write(root, 'src/sync.spec.ts', 'old implementation test\n')
  git(root, 'add', '--', 'src/sync.ts', 'src/sync.spec.ts')
  git(root, 'commit', '-qm', 'fixture D implementation')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const changedPaths = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', `${baseline}..${checkpoint}`).split(/\r?\n/).filter(Boolean)
  const changedDigest = pathDigest(changedPaths)
  const subjectDigest = digest(git(root, 'show', '-s', '--format=%s', checkpoint))
  const oldReceipt = {
    schema_version: 1, story_id: '9.1', slice_id: 'D', kind: 'implementation',
    checkpoint_commit: checkpoint, baseline_commit: baseline, subject_digest: subjectDigest,
    created_from_head: checkpoint, changed_paths_sha256: changedDigest, changed_paths: changedPaths,
    commands: [{ command: 'fixture D', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
  }
  const oldReceiptDigest = receiptDigest(oldReceipt)
  write(root, PLAN, planText(storyDigest, checkpointedSlices(baseline, checkpoint, subjectDigest, changedDigest, oldReceiptDigest), 'verify_slice', 'D'))
  write(root, OLD_RECEIPT, `${JSON.stringify(oldReceipt, null, 2)}\n`)
  git(root, 'add', '--', PLAN, OLD_RECEIPT)
  git(root, 'commit', '-qm', 'fixture D metadata')
  const head = git(root, 'rev-parse', 'HEAD')
  const reworkTemplate = planText(storyDigest, reworkSlices({ baseline, checkpoint, subjectDigest, changedDigest, oldReceiptDigest }), 'implement_slice', 'D')
  const request = {
    action: 'rework_slice', operation: 'prepare-rework', story_id: '9.1', slice_id: 'D', expected_head: head,
    transaction_id: 'fixture-rework-attempt-2', maintenance_authorization: 'V4_LITE_REWORK',
    old_checkpoint_commit: checkpoint, old_receipt_digest: oldReceiptDigest,
    findings: [{ id: 'finding-1', severity: 'HIGH', summary: 'D mapping is incomplete.' }],
    rework_paths: changedPaths, plan_template: reworkTemplate
  }
  return { root, cleanup, baseline, checkpoint, head, changedPaths, changedDigest, subjectDigest, oldReceiptDigest, request }
}

function applyRequest(f, preview, extra = {}) {
  return applyRework(f.root, { ...f.request, operation: 'apply-rework', preview, ...extra })
}

function state(f) {
  const identity = transactionIdentity(f.root, {
    action: 'rework_slice', story_id: '9.1', slice_id: 'D', transaction_id: f.request.transaction_id
  })
  return {
    head: git(f.root, 'rev-parse', 'HEAD'),
    count: git(f.root, 'rev-list', '--count', 'HEAD'),
    status: git(f.root, 'status', '--porcelain', '--untracked-files=all').split(/\r?\n/)
      .filter(line => line && !line.includes('.agent-state/v4-observations/')).join('\n'),
    index: git(f.root, 'diff', '--cached', '--binary'),
    plan: readFileSync(path.join(f.root, PLAN), 'utf8'),
    receipt: readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'),
    lock: existsSync(identity.lockPath) ? readFileSync(identity.lockPath, 'utf8') : null
  }
}

test('rework is append-only, creates attempt identity, and never runs the successor', () => {
  const f = fixture()
  try {
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(prepared.preview.new_attempt.attempt_id, 2)
    assert.equal(prepared.preview.new_attempt.receipt_refs.implementation.path, NEW_IMPLEMENTATION_RECEIPT)
    const before = state(f)
    const result = applyRequest(f, prepared.preview)
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(result.next_action, { kind: 'implement_slice', target: 'D' })
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/), [PLAN], JSON.stringify(result))
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices.find(item => item.id === 'D').status, 'pending')
    assert.equal(plan.slices.find(item => item.id === 'D').attempt_history[0].checkpoint_commit, f.checkpoint)
    assert.equal(plan.slices.find(item => item.id === 'D').current_attempt.attempt_id, 2)
    assert.equal(plan.slices.find(item => item.id === 'E').status, 'pending')
    assert.deepEqual(plan.next_action, { kind: 'implement_slice', target: 'D' })
    assert.equal(readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'), before.receipt)
    assert.equal(existsSync(path.join(f.root, NEW_IMPLEMENTATION_RECEIPT)), false)
    assert.deepEqual(git(f.root, 'diff', '--name-only', `${f.checkpoint}..HEAD`).split(/\r?\n/).sort(), [OLD_RECEIPT, PLAN].sort())
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('the next implementation binds to the new receipt path and attempt id', () => {
  const f = fixture()
  try {
    const oldBytes = readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8')
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const applied = applyRequest(f, prepared.preview)
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    const currentHead = git(f.root, 'rev-parse', 'HEAD')
    write(f.root, 'src/sync.ts', 'rework implementation\n')
    write(f.root, 'src/sync.spec.ts', 'rework implementation test\n')
    const marker = '  - id: D\n    status: pending\n    task_refs: [T-6]\n    depends_on: []\n    attempt_history:'
    const replacement = [
      '  - id: D', '    status: checkpointed', '    task_refs: [T-6]', '    depends_on: []',
      '    baseline_commit: {{BASELINE_COMMIT}}', '    checkpoint_commit: {{CHECKPOINT_COMMIT}}',
      '    subject_digest: {{SUBJECT_DIGEST}}', '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}',
      '    receipt_refs:', '      implementation:', `        path: ${NEW_IMPLEMENTATION_RECEIPT}`, '        digest: {{RECEIPT_DIGEST}}',
      '    attempt_history:'
    ].join('\n')
    const planTemplate = f.request.plan_template.replace(marker, replacement).replace('kind: implement_slice', 'kind: verify_slice')
    const implementationRequest = {
      action: 'implement_slice', operation: 'prepare', story_id: '9.1', slice_id: 'D', expected_head: currentHead,
      transaction_id: 'fixture-implementation-attempt-2', owned_paths: f.changedPaths, plan_template: planTemplate,
      policy_paths: ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md',
        '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md'],
      recipe_paths: ['.agents/skills/v4-story-runner/SKILL.md'],
      commands: [{ command: 'fixture rework', exit_code: 0, tool: 'fixture', environment: 'node-test' }],
      semantic_coverage: { status: 'MEASURED', task_refs: ['T-6'], note: 'new attempt' },
      selected_tasks: ['T-6'], selected_acceptance_criteria: ['AC-1'], red_green: { applicable: false, reason: 'fixture' }
    }
    const next = prepareAction(f.root, implementationRequest)
    assert.equal(next.status, 'READY', JSON.stringify(next))
    assert.equal(next.preview.receipt_path, NEW_IMPLEMENTATION_RECEIPT)
    const checkpointed = checkpointImplementation(f.root, { ...implementationRequest, operation: 'checkpoint', preview: next.preview })
    assert.equal(checkpointed.status, 'CHECKPOINTED', JSON.stringify(checkpointed))
    const newReceipt = JSON.parse(readFileSync(path.join(f.root, NEW_IMPLEMENTATION_RECEIPT), 'utf8'))
    assert.equal(newReceipt.attempt_id, 2)
    assert.equal(readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'), oldBytes)
  } finally { f.cleanup() }
})

test('rework rejects cross identity, stale fingerprint, dirty scope, and foreign lock without mutation', () => {
  for (const mutate of [
    request => ({ ...request, story_id: '9.2' }),
    request => ({ ...request, slice_id: 'E' }),
    request => ({ ...request, plan_template: request.plan_template.replace('  target: D\n---', '  target: E\n---') })
  ]) {
    const f = fixture()
    try {
      const before = state(f)
      const result = prepareRework(f.root, mutate(f.request))
      assert.notEqual(result.status, 'READY', JSON.stringify(result))
      assert.deepEqual(state(f), before)
    } finally { f.cleanup() }
  }

  const stale = fixture()
  try {
    const prepared = prepareRework(stale.root, stale.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const before = state(stale)
    const result = applyRequest(stale, { ...prepared.preview, fingerprint: `sha256:${'0'.repeat(64)}` })
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.deepEqual(state(stale), before)
  } finally { stale.cleanup() }

  const dirty = fixture()
  try {
    const prepared = prepareRework(dirty.root, dirty.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(dirty.root, 'unrelated.txt', 'do not touch\n')
    const before = state(dirty)
    const result = applyRequest(dirty, prepared.preview)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('DIRTY_SCOPE_MISMATCH'), JSON.stringify(result))
    assert.deepEqual(state(dirty), before)
  } finally { dirty.cleanup() }

  const locked = fixture()
  try {
    const prepared = prepareRework(locked.root, locked.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const identity = transactionIdentity(locked.root, {
      action: 'rework_slice', story_id: '9.1', slice_id: 'D', transaction_id: prepared.preview.transaction_id
    })
    mkdirSync(path.dirname(identity.lockPath), { recursive: true })
    writeFileSync(identity.lockPath, JSON.stringify({ transaction_id: 'foreign', scope_key: identity.scopeKey }) + '\n')
    const before = state(locked)
    const result = applyRequest(locked, prepared.preview)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('TRANSACTION_SCOPE_LOCKED'), JSON.stringify(result))
    assert.deepEqual(state(locked), before)
  } finally { locked.cleanup() }
})

test('rework cannot approve or move to E and interruption retry does not duplicate metadata commits', () => {
  const fake = fixture()
  try {
    const approvalTemplate = fake.request.plan_template.replace('next_action:', 'human_approval:\n  decision: APPROVED\nnext_action:')
    const result = prepareRework(fake.root, { ...fake.request, plan_template: approvalTemplate })
    assert.notEqual(result.status, 'READY', JSON.stringify(result))
    assert.equal(state(fake).head, fake.head)
  } finally { fake.cleanup() }

  const f = fixture()
  try {
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = applyRequest(f, prepared.preview, { fail_at: 'after-commit-hook' })
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    const headAfterFailure = git(f.root, 'rev-parse', 'HEAD')
    const countAfterFailure = git(f.root, 'rev-list', '--count', 'HEAD')
    assert.notEqual(headAfterFailure, f.head)
    assert.equal(existsSync(failed.lock_path), true)
    const retried = applyRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: prepared.preview.expected_head
    })
    assert.equal(retried.status, 'NOOP', JSON.stringify(retried))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), headAfterFailure)
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), countAfterFailure)
    assert.equal(existsSync(failed.lock_path), false)
  } finally { f.cleanup() }
})

test('Runner accepts rework only as an explicit maintenance action and stops before implementation', () => {
  const f = fixture()
  try {
    const prepared = runV4Story(f.root, '9.1', {
      expectedHead: f.head,
      operation: 'prepare-rework',
      input: f.request
    })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const applied = runV4Story(f.root, '9.1', {
      expectedHead: f.head,
      operation: 'apply-rework',
      input: { ...f.request, operation: 'apply-rework', preview: prepared.preview }
    })
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    assert.deepEqual(applied.next_action, { kind: 'implement_slice', target: 'D' })
    assert.equal(git(f.root, 'diff', '--name-only', `${f.head}..HEAD`), PLAN)
    assert.equal(existsSync(path.join(f.root, NEW_IMPLEMENTATION_RECEIPT)), false)
  } finally { f.cleanup() }
})

test('finalization scope includes the original implementation attempt', () => {
  const f = fixture()
  try {
    const newBaseline = f.head
    write(f.root, 'src/sync.ts', 'reworked sync\n')
    write(f.root, 'src/sync.spec.ts', 'reworked test\n')
    git(f.root, 'add', '--', 'src/sync.ts', 'src/sync.spec.ts')
    git(f.root, 'commit', '-qm', 'fixture D rework implementation')
    const newCheckpoint = git(f.root, 'rev-parse', 'HEAD')
    const historicalReceipt = JSON.parse(readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'))
    const currentReceipt = {
      ...historicalReceipt, attempt_id: 2, checkpoint_commit: newCheckpoint, baseline_commit: newBaseline,
      subject_digest: digest(git(f.root, 'show', '-s', '--format=%s', newCheckpoint))
    }
    const detail = {
      id: 'D',
      baseline_commit: newBaseline,
      checkpoint_commit: newCheckpoint,
      changed_paths_sha256: f.changedDigest,
      current_attempt: { attempt_id: 2 },
      receipts: { implementation: { ...currentReceipt, changed_paths: f.changedPaths } },
      attempt_history: [{
        attempt_id: 1, baseline_commit: f.baseline, checkpoint_commit: f.checkpoint,
        changed_paths_sha256: f.changedDigest, receipt: historicalReceipt
      }]
    }
    const result = { reasons: [], _flags: { stale: false, invalid: false, blocked: false, reconciliation: false } }
    const scope = deriveScope(f.root, '9.1', STORY, [detail], newCheckpoint, result)
    assert.equal(result.reasons.length, 0, JSON.stringify(result))
    assert.equal(scope.implementation_commit_set_digest, stableDigest([
      { slice_id: 'D', attempt_id: 1, checkpoint_commit: f.checkpoint },
      { slice_id: 'D', attempt_id: 2, checkpoint_commit: newCheckpoint }
    ]), JSON.stringify({ scope, result }))
  } finally { f.cleanup() }
})
