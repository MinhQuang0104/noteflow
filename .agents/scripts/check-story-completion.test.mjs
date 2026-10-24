import { digest, snapshot, persistApproval } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'

import { approvalRecordForSnapshot, explicitApprovalInput, inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'

test('structured approval input is explicit and generic continuation is rejected', () => {
  assert.equal(explicitApprovalInput({ action: 'approve_exact_scope', disclosures_acknowledged: true }), true)
  assert.equal(explicitApprovalInput({ action: 'approve_exact_scope', disclosures_acknowledged: false }), false)
  for (const value of ['continue', 'next', 'go on', 'proceed', 'ok']) {
    assert.equal(explicitApprovalInput(value), false)
  }
})

test('approval record binds the complete exact review snapshot without account identity', () => {
  const result = approvalRecordForSnapshot(snapshot(), 'f'.repeat(40), '2026-09-26T12:00:00.000Z')
  assert.deepEqual(result, {
    schema_version: 1,
    story_id: '9.1',
    approver_type: 'human',
    decision: 'APPROVED',
    approved_at: '2026-09-26T12:00:00.000Z',
    story_normative_digest: digest('a'),
    finalization_receipt_digest: digest('b'),
    done_gate_summary_digest: snapshot().done_gate_summary_digest,
    scope_paths_digest: digest('c'),
    implementation_commit_set_digest: digest('d'),
    final_scope_digest: digest('e'),
    final_scoped_tree_digest: digest('e'),
    approved_review_head: 'f'.repeat(40),
    approved_commit: 'f'.repeat(40),
    approved_action: 'complete_story',
    disclosures_acknowledged: true
  })
  assert.equal('account_id' in result, false)
  assert.equal('transcript' in result, false)
})

test('completion gate API is read-only and exposes the exact preview for a fixture root', () => {
  const result = inspectCompletion('not-a-repository', '9.1', 'f'.repeat(40))
  assert.equal(result.status, 'ERROR')
  assert.equal(result.valid, false)
})

test('review without approval is BLOCKED but emits the exact Human Gate preview', () => {
  const f = createCompletionFixture()
  try {
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.equal(result.recovery_classification, 'HUMAN_GATE_REQUIRED')
    assert.equal(result.preview.lifecycle, 'review')
    assert.equal(result.preview.pending_action.kind, 'complete_story')
    assert.match(result.preview.story_normative_digest, /^sha256:/)
    assert.match(result.preview.finalization_receipt_digest, /^sha256:/)
    assert.match(result.preview.done_gate_summary_digest, /^sha256:/)
    assert.equal(result.preview.implementation_path_count, 1)
  } finally {
    f.cleanup()
  }
})

test('durable exact approval is READY for completion and generic continuation cannot create it', () => {
  const f = createCompletionFixture()
  try {
    assert.equal(explicitApprovalInput('continue'), false)
    const approval = persistApproval(f)
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'READY', JSON.stringify(result))
    assert.equal(result.recovery_classification, 'APPROVAL_DURABLE_PENDING_COMPLETION')
    assert.equal(result.approval_fresh, true)
    assert.equal(approval.decision, 'APPROVED')
  } finally {
    f.cleanup()
  }
})

test('disclosures must be acknowledged and remain BLOCKED', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f, { disclosures_acknowledged: false })
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('DISCLOSURES_NOT_ACKNOWLEDGED'))
  } finally {
    f.cleanup()
  }
})

test('missing finalization receipt blocks completion', () => {
  const f = createCompletionFixture()
  try {
    rmSync(`${f.root}/_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json`)
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('FINALIZATION_RECEIPT_MISSING'))
  } finally {
    f.cleanup()
  }
})

test('approval in an uncommitted Plan is only an approval preview', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f, {}, false)
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'RECONCILIATION_REQUIRED', JSON.stringify(result))
    assert.equal(result.recovery_classification, 'APPROVAL_PREVIEW_ONLY')
  } finally {
    f.cleanup()
  }
})
