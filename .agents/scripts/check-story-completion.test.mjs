import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'

import {
  approvalRecordForSnapshot,
  doneGateSummaryDigest,
  explicitApprovalInput,
  inspectCompletion
} from './check-story-completion.mjs'
import { createCompletionFixture, PLAN, SPRINT, STORY } from './completion-fixture.mjs'

const digest = letter => `sha256:${letter.repeat(64)}`

function snapshot() {
  const value = {
    story_id: '9.1',
    story_title: 'Fixture completion story',
    lifecycle: 'review',
    story_normative_digest: digest('a'),
    finalization_receipt_digest: digest('b'),
    done_gate_disposition: 'SATISFIED_WITH_DISCLOSURES',
    ac_coverage: [{ id: 'AC-1', covered: true, evidence: [] }],
    canonical_disclosures: [{ slice_id: 'A', applicability: 'APPLICABLE', status: 'INCOMPLETE', complete: false }],
    implementation_path_count: 2,
    scope_paths_digest: digest('c'),
    implementation_commit_set_digest: digest('d'),
    final_scoped_tree_digest: digest('e'),
    pending_action: { kind: 'complete_story', target: 'story' },
    approved_review_head: 'f'.repeat(40)
  }
  return { ...value, done_gate_summary_digest: doneGateSummaryDigest(value) }
}

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

function approvalYaml(record) {
  return [
    'human_approval:',
    ...Object.entries(record).map(([key, value]) => `  ${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`),
    ''
  ].join('\n')
}

function persistApproval(f, mutate = {}, commit = true) {
  const gate = inspectCompletion(f.root, '9.1', f.head)
  const approval = { ...approvalRecordForSnapshot(gate.preview, f.head, '2026-09-26T12:00:00.000Z'), ...mutate }
  f.write(PLAN, f.readPlan().replace('human_approval: null\n', approvalYaml(approval)))
  if (commit) {
    f.git('add', '.')
    f.git('commit', '-qm', 'fixture Human approval')
    f.refreshHead()
  }
  return approval
}

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

for (const [label, edit, expected] of [
  ['Story-only done projection', f => f.write(STORY, f.read(STORY).replace('status: review', 'status: done')), 'PARTIAL_STORY_ONLY'],
  ['Plan-only done projection', f => f.write(PLAN, f.readPlan().replace('lifecycle_snapshot: "review"', 'lifecycle_snapshot: "done"').replace('next_action:\n  kind: "complete_story"\n  target: "story"', 'next_action: null')), 'PARTIAL_PLAN_ONLY'],
  ['sprint-only done projection', f => f.write(SPRINT, 'development_status:\n  9-1-fixture: done\n'), 'PARTIAL_SPRINT_ONLY']
]) test(`${label} requires reconciliation`, () => {
  const f = createCompletionFixture()
  try {
    edit(f)
    f.git('add', '.')
    f.git('commit', '-qm', 'partial completion projection')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'RECONCILIATION_REQUIRED', JSON.stringify(result))
    assert.equal(result.recovery_classification, expected)
  } finally {
    f.cleanup()
  }
})

for (const [field, mutate] of [
  ['story digest', { story_normative_digest: digest('1') }],
  ['receipt digest', { finalization_receipt_digest: digest('1') }],
  ['Done Gate digest', { done_gate_summary_digest: digest('1') }],
  ['scope digest', { scope_paths_digest: digest('1') }],
  ['approved review HEAD', { approved_review_head: '0'.repeat(40) }],
  ['approved HEAD', { approved_commit: '0'.repeat(40) }]
]) test(`approval ${field} mismatch is stale`, () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f, mutate)
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
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

test('product drift after durable approval is stale', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f)
    f.write('src/implementation.txt', 'drift after approval\n')
    f.git('add', 'src/implementation.txt')
    f.git('commit', '-qm', 'product drift')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL'))
  } finally {
    f.cleanup()
  }
})

test('uncommitted product drift after durable approval is stale', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f)
    f.write('src/implementation.txt', 'uncommitted drift after approval\n')
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL'))
  } finally {
    f.cleanup()
  }
})

const TWO_PATHS = ['src/a.txt', 'src/b.txt']

test('exact-scope multi-path review evidence keeps completion at the Human Gate', () => {
  const f = createCompletionFixture({ implementationPaths: TWO_PATHS })
  try {
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['HUMAN_APPROVAL_REQUIRED'])
  } finally {
    f.cleanup()
  }
})

for (const [label, options] of [
  ['missing evidence refs', { mutateReview: review => { delete review.evidence_refs; return review } }],
  ['missing risk context', { mutateReview: review => { delete review.risk_context_digest; return review } }],
  ['missing scope digest', { mutateReview: review => { delete review.scope_digest; return review } }],
  ['stale risk context', { mutateReview: review => ({ ...review, risk_context_digest: digest('1') }) }],
  ['stale scope digest', { mutateReview: review => ({ ...review, scope_digest: digest('1') }) }],
  ['tampered evidence body digest', { mutateReview: review => ({ ...review, evidence_refs: review.evidence_refs.map(ref => ({ ...ref, body_digest: 'not-a-digest' })) }) }],
  ['duplicated evidence hunk', { mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: [...evidenceRefs, evidenceRefs[0]] }) }],
  ['reordered multi-path evidence', { implementationPaths: TWO_PATHS, mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: [...evidenceRefs].reverse() }) }],
  ['partial multi-path evidence', { implementationPaths: TWO_PATHS, mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: evidenceRefs.slice(0, 1) }) }],
  ['cross-scope evidence', { mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: evidenceRefs.map(ref => ({ ...ref, path: 'src/other.txt' })) }) }]
]) test(`review receipt with ${label} fails closed`, () => {
  const f = createCompletionFixture(options)
  try {
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.ready, false, JSON.stringify(result))
    assert.notEqual(result.status, 'READY')
    assert.ok(result.reasons.includes('REVIEW_FRESHNESS_INVALID:A'), JSON.stringify(result.reasons))
  } finally {
    f.cleanup()
  }
})

test('review receipt edited after Plan binding fails closed', () => {
  const f = createCompletionFixture()
  try {
    const review = JSON.parse(f.read('receipts/review.json'))
    f.write('receipts/review.json', JSON.stringify({ ...review, evidence_refs: [] }))
    f.git('add', '.')
    f.git('commit', '-qm', 'tamper review receipt')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.ready, false, JSON.stringify(result))
    assert.notEqual(result.status, 'READY')
  } finally {
    f.cleanup()
  }
})
