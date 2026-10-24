import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, prepareVerification, makeReviewEvidence, scopeDigest } from './v4-verification-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { receiptDigest, validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { recordSliceReview, verifySlice } from './v4-action-kernel.mjs'
import { digestValue } from './v4-finalization-contract.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'

test('kernel-written review receipts round-trip through the finalization gate', async () => {
  const { inspectFinalization } = await import('./check-story-finalization.mjs')
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const pendingBefore = JSON.stringify(pendingResult.pending)
    const evidence = makeReviewEvidence(f, prepared.preview)
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true),
      review: {
        judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
        scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
        commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
      }
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.equal(result.next_action.kind, 'finalize_story')
    assert.deepEqual(result.policy, { decision: 'HUMAN_REQUIRED', reasons: ['LEGACY_REVIEWER_UNCLASSIFIED'] })
    const { policy, ...legacyResult } = result
    assert.equal(legacyResult.status, 'APPLIED')
    assert.equal(Object.hasOwn(legacyResult, 'policy'), false)
    const identity = transactionIdentity(f.root, f.verifyRequest)
    assert.deepEqual(legacyResult, {
      status: 'APPLIED', ready: false, valid: true, reasons: [],
      transaction_id: f.verifyRequest.transaction_id, checkpoint_commit: f.head,
      metadata_commit: git(f.root, 'rev-parse', 'HEAD'), changed_paths: prepared.preview.changed_paths,
      changed_paths_sha256: prepared.preview.changed_paths_sha256,
      next_action: { kind: 'finalize_story', target: 'story' },
      journal_path: identity.journalPath, lock_path: identity.lockPath, durable_action_count: 1,
      stop_condition: 'NEXT_ACTION_EXPLICIT_AFTER_REVIEW', action: 'verify_slice', operation: 'record-review'
    })
    assert.equal(JSON.stringify(pendingResult.pending), pendingBefore)

    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.equal(receipt.schema_version, 2)
    assert.deepEqual(Object.keys(receipt).sort(), ['schema_version', 'story_id', 'slice_id', 'kind',
      'checkpoint_commit', 'baseline_commit', 'subject_digest', 'created_from_head', 'changed_paths_sha256',
      'commands', 'judgment', 'questions', 'answers', 'evidence_refs', 'scope_digest',
      'risk_context_digest', 'reviewed_commit', 'reviewer'].sort())

    // The pre-policy receipt contract, with only fixture-bound identities/evidence substituted.
    const legacyReceipt = {
      schema_version: 2, story_id: '9.1', slice_id: 'A', kind: 'review',
      checkpoint_commit: prepared.preview.checkpoint_commit, baseline_commit: prepared.preview.baseline_commit,
      subject_digest: prepared.preview.subject_digest, created_from_head: prepared.preview.checkpoint_commit,
      changed_paths_sha256: prepared.preview.changed_paths_sha256,
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }],
      judgment: 'APPROVE', questions: pendingResult.pending.review_questions,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      evidence_refs: pendingResult.pending.requested_evidence.refs, scope_digest: scopeDigest(evidence),
      risk_context_digest: digestValue(prepared.preview.original_plan.risk),
      reviewed_commit: prepared.preview.checkpoint_commit, reviewer: 'same-lead'
    }
    assert.equal(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'), `${JSON.stringify(legacyReceipt, null, 2)}\n`)
    assert.equal(receiptDigest(receipt), receiptDigest(legacyReceipt))
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices[0].receipt_refs.review.digest, receiptDigest(receipt))
    assert.notEqual(receiptDigest({ ...receipt, policy }), receiptDigest(receipt))
    const verification = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(Object.hasOwn(verification, 'policy'), false)
    assert.equal(plan.slices[0].receipt_refs.verification.digest, receiptDigest(verification))
    const gate = inspectFinalization(f.root, '9.1', git(f.root, 'rev-parse', 'HEAD'))
    const reviewReasons = gate.reasons.filter(reason => /REVIEW|RECEIPT|PROGRESSION/.test(reason))
    assert.deepEqual(reviewReasons, [], JSON.stringify(gate.reasons))
    assert.ok(['FRESH_CANDIDATE', 'FRESH_REUSED', 'FRESH'].includes(gate.slices[0].review_freshness), JSON.stringify(gate.slices))
  } finally { f.cleanup() }
})

for (const [name, reviewer, findings, reason] of [
  ['structured lead', { type: 'lead', vendor: 'codex', independent: false }, [], null],
  ['structured human', { type: 'human', vendor: null, independent: false }, [{ id: 'F1', class: 'FALSE_POSITIVE', summary: 'Disproved by evidence', paths: ['src/feature.txt'] }], null],
  ['false independence', { type: 'lead', vendor: 'claude', independent: true }, [], 'REVIEWER_INDEPENDENCE_MISMATCH'],
  ['malformed reviewer', { type: 'lead', vendor: 'other', independent: false }, [], 'REVIEWER_INVALID'],
  ...['VALID', 'SPEC_AMBIGUITY', 'NEEDS_HUMAN_DECISION'].map(className => [className, { type: 'lead', vendor: 'codex', independent: false }, [{ id: 'F1', class: className, summary: 'Open finding', paths: ['src/feature.txt'] }], 'REVIEW_FINDINGS_OPEN']),
  ['malformed findings', 'same-lead', [{ id: 'F1', class: 'FALSE_POSITIVE', summary: '', paths: ['../outside'] }], 'REVIEW_FINDINGS_INVALID'],
  ['conflicting decisions', 'same-lead', [], 'REVIEW_DECISION_CONFLICT']
]) test(`structured review ${name} validates before persisting`, () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(pendingResult.status, 'REVIEW_REQUIRED')
    assert.equal(Object.hasOwn(pendingResult.pending, 'policy'), false)
    assert.equal(pendingResult.pending.fingerprint, digestValue(Object.fromEntries(
      Object.entries(pendingResult.pending).filter(([key]) => key !== 'fingerprint'))))
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'APPROVE', reviewer, findings, pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'bounded review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    if (name === 'conflicting decisions') review.verdict = 'CHANGES_REQUIRED'
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    if (reason) {
      assert.equal(result.status, reason === 'REVIEW_FINDINGS_OPEN' ? 'BLOCKED' : 'INVALID', JSON.stringify(result))
      assert.ok(result.reasons.includes(reason), JSON.stringify(result))
      assert.notEqual(result.policy.decision, 'APPROVE_ALLOWED')
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
      assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    } else {
      assert.equal(result.status, 'APPLIED', JSON.stringify(result))
      const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
      assert.equal(receipt.schema_version, 2)
      assert.deepEqual(receipt.reviewer, reviewer)
      assert.deepEqual(receipt.findings, findings)
      const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
      assert.deepEqual(plan.slices[0].review.reviewer, reviewer)
      assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
      assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    }
  } finally { f.cleanup() }
})
