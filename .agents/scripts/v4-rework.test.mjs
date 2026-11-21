import { PLAN, STORY, OLD_RECEIPT, NEW_IMPLEMENTATION_RECEIPT, REWORK_RECEIPT, digest, git, write, fixture, applyRequest, state } from './v4-rework-fixture.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { checkpointImplementation, prepareAction, prepareRework, priorAttemptChangedPaths, reworkDependents } from './v4-action-kernel.mjs'
import { deriveScope, stableDigest } from './check-story-finalization.mjs'
import { readReworkReceipt } from './check-artifact-contract.mjs'

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
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, REWORK_RECEIPT].sort(), JSON.stringify(result))
    const rework = JSON.parse(readFileSync(path.join(f.root, REWORK_RECEIPT), 'utf8'))
    assert.deepEqual(rework, {
      schema_version: 1, kind: 'rework', story_id: '9.1', slice_id: 'D', attempt_id: 2, previous_attempt_id: 1,
      judgment: 'CHANGES_REQUIRED', baseline_commit: f.baseline, checkpoint_commit: f.checkpoint,
      implementation_receipt_digest: f.oldReceiptDigest, rework_paths: [...f.changedPaths].sort(), reviewer: null,
      findings: f.request.findings, findings_digest: prepared.preview.findings_digest
    })
    const reworkPlan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.deepEqual(readReworkReceipt(f.root, reworkPlan, 'D', 2).errors, [])
    assert.deepEqual(readReworkReceipt(f.root, reworkPlan, 'D', 3).errors, ['INVALID_RECEIPT_FILE'])
    write(f.root, REWORK_RECEIPT, JSON.stringify({ ...rework, findings: [{ id: 'other', summary: 'changed' }] }))
    assert.deepEqual(readReworkReceipt(f.root, reworkPlan, 'D', 2).errors, ['INVALID_RECEIPT_PAYLOAD'])
    write(f.root, REWORK_RECEIPT, JSON.stringify({ ...rework, checkpoint_commit: f.baseline }))
    assert.deepEqual(readReworkReceipt(f.root, reworkPlan, 'D', 2).errors, ['REWORK_ATTEMPT_MISMATCH'])
    write(f.root, REWORK_RECEIPT, JSON.stringify({ ...rework, schema_version: 2 }))
    assert.deepEqual(readReworkReceipt(f.root, reworkPlan, 'D', 2).errors, ['INVALID_RECEIPT_IDENTITY'])
    write(f.root, REWORK_RECEIPT, `${JSON.stringify(rework, null, 2)}\n`)
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices.find(item => item.id === 'D').status, 'pending')
    assert.equal(plan.slices.find(item => item.id === 'D').attempt_history[0].checkpoint_commit, f.checkpoint)
    assert.equal(plan.slices.find(item => item.id === 'D').current_attempt.attempt_id, 2)
    assert.equal(plan.slices.find(item => item.id === 'E').status, 'pending')
    assert.deepEqual(plan.next_action, { kind: 'implement_slice', target: 'D' })
    assert.equal(readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'), before.receipt)
    assert.equal(existsSync(path.join(f.root, NEW_IMPLEMENTATION_RECEIPT)), false)
    assert.deepEqual(git(f.root, 'diff', '--name-only', `${f.checkpoint}..HEAD`).split(/\r?\n/).sort(), [OLD_RECEIPT, PLAN, REWORK_RECEIPT].sort())
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

test('rework accepts a checkpoint of any size and binds its exact paths (Story 1.7 F-17-2)', () => {
  const f = fixture({ extraPaths: ['src/extra-one.ts', 'src/extra-two.ts', 'src/extra-three.ts'] })
  try {
    assert.equal(f.changedPaths.length, 5)
    const partial = prepareRework(f.root, { ...f.request, rework_paths: f.changedPaths.slice(1) })
    assert.notEqual(partial.status, 'READY', JSON.stringify(partial))
    assert.deepEqual(partial.reasons, ['REWORK_SCOPE_MISMATCH'])
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.deepEqual(prepared.preview.rework_paths, [...f.changedPaths].sort())
    const result = applyRequest(f, prepared.preview)
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices.find(item => item.id === 'D').current_attempt.attempt_id, 2)
  } finally { f.cleanup() }
})

test('rework finds dependent slices by depends_on, not by the slice name E', () => {
  const f = fixture({ successor: 'B' })
  try {
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(applyRequest(f, prepared.preview).status, 'APPLIED')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices.find(item => item.id === 'B').status, 'pending')
  } finally { f.cleanup() }
  const plan = { slices: [
    { id: 'A', depends_on: [] }, { id: 'B', depends_on: ['A'] }, { id: 'C', depends_on: ['B'] },
    { id: 'D', depends_on: [] }, { id: 'E', depends_on: ['D'] }
  ] }
  assert.deepEqual(reworkDependents(plan, 'A').map(item => item.id), ['B', 'C'])
  assert.deepEqual(reworkDependents(plan, 'D').map(item => item.id), ['E'])
  assert.deepEqual(reworkDependents(plan, 'C').map(item => item.id), [])
})

test('verification after rework explains anchors changed by earlier attempts (Story 1.7 F-17-6)', () => {
  const f = fixture()
  try {
    assert.deepEqual(priorAttemptChangedPaths(f.root, { attempt_history: [] }), [])
    const history = [{ attempt_id: 1, baseline_commit: f.baseline, checkpoint_commit: f.checkpoint }]
    assert.deepEqual(priorAttemptChangedPaths(f.root, { attempt_history: history }), [...f.changedPaths].sort())
    assert.throws(() => priorAttemptChangedPaths(f.root, { attempt_history: [{ attempt_id: 1, baseline_commit: 'HEAD~1', checkpoint_commit: f.checkpoint }] }), /ATTEMPT_HISTORY_INVALID/)
  } finally { f.cleanup() }
})

test('rework records the CHANGES_REQUIRED reviewer and refuses a malformed one or an existing rework receipt', () => {
  const f = fixture()
  try {
    const reviewer = { type: 'lead', vendor: 'claude', independent: false }
    for (const bad of [{ type: 'worker', vendor: null, independent: false }, { type: 'lead', vendor: 'claude', independent: true }, 'same-lead']) {
      const refused = prepareRework(f.root, { ...f.request, reviewer: bad })
      assert.equal(refused.status, 'INVALID', JSON.stringify(refused))
      assert.deepEqual(refused.reasons, ['REWORK_REVIEWER_INVALID'])
    }
    write(f.root, REWORK_RECEIPT, '{}\n')
    assert.deepEqual(prepareRework(f.root, { ...f.request, reviewer }).reasons, ['REWORK_RECEIPT_EXISTS'])
    rmSync(path.join(f.root, REWORK_RECEIPT))
    const prepared = prepareRework(f.root, { ...f.request, reviewer })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.deepEqual(prepared.preview.metadata_paths, [REWORK_RECEIPT, PLAN].sort())
    assert.deepEqual(applyRequest(f, prepared.preview, { reviewer: { ...reviewer, vendor: 'codex' } }).reasons, ['STALE_REWORK_FINDINGS'])
    const result = applyRequest(f, prepared.preview, { reviewer })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, REWORK_RECEIPT), 'utf8')).reviewer, reviewer)
  } finally { f.cleanup() }
})
