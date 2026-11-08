import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, prepareVerification, makeReviewEvidence, makeSplitReviewEvidence, scopeDigest } from './v4-verification-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { actionFingerprint, recordSliceReview, verifySlice } from './v4-action-kernel.mjs'
import { digestValue, reviewEvidenceFreshness } from './v4-finalization-contract.mjs'
import { runV4Story } from './v4-story-runner.mjs'

test('HIGH PASS stops at REVIEW_REQUIRED with immutable pending evidence and no commit', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(result.status, 'REVIEW_REQUIRED', JSON.stringify(result))
    assert.equal(result.pending.verification_status, 'PASS')
    assert.equal(result.pending.review_questions.length > 0, true)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(result.pending.fingerprint, actionFingerprint(Object.fromEntries(Object.entries(result.pending).filter(([key]) => key !== 'fingerprint'))))
  } finally { f.cleanup() }
})

for (const operation of ['record-review', 'record_review']) test(`Runner ${operation} rejects human review authority without mutation`, () => {
  const f = fixture('HIGH')
  try {
    const result = runV4Story(f.root, '9.1', {
      expectedHead: f.head, operation,
      input: { ...f.verifyRequest, review: { reviewer: { type: 'human', vendor: null, independent: false } } }
    })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['OWNER_REVIEW_OPERATION_REQUIRED'])
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
  } finally { f.cleanup() }
})

test('same-Lead APPROVE requires exact bounded evidence and persists verification plus review receipts', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices[0].status, 'reviewed')
    const reviewReceipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.equal(reviewReceipt.judgment, 'APPROVE')
    assert.equal(reviewReceipt.reviewer, 'same-lead')
    assert.equal(Object.hasOwn(reviewReceipt, 'findings'), false)
    assert.equal(reviewReceipt.verdict, undefined)
    assert.equal(reviewReceipt.freshness, undefined)
    assert.equal(reviewEvidenceFreshness(reviewReceipt, ['src/feature.txt'], plan.slices[0].checkpoint_commit, digestValue(plan.risk)).status, 'FRESH_REUSED')
    assert.ok(plan.slices[0].receipt_refs.review.digest)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('same-Lead APPROVE accepts one ordered evidence set covering five changed paths', () => {
  const changedPaths = [
    'src/feature.txt', 'src/feature-a.txt', 'src/feature-b.txt', 'src/feature-c.txt', 'src/feature-d.txt'
  ].sort()
  const f = fixture('HIGH', { changedPaths })
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(pendingResult.status, 'REVIEW_REQUIRED', JSON.stringify(pendingResult))
    const evidence = makeReviewEvidence(f, prepared.preview)
    assert.ok(evidence.evidenceSet)
    assert.deepEqual(evidence.evidenceSet.paths.map(item => item.path), changedPaths)
    assert.deepEqual(evidence.evidenceSet.requestedPaths, changedPaths)
    const review = {
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: changedPaths, scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead five-path review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.evidence_refs.map(item => item.path), evidence.evidenceSet.units.map(item => item.path))
    assert.deepEqual(receipt.evidence_refs.map(item => item.unit_index), evidence.evidenceSet.units.map(item => item.unitIndex))
    assert.equal(receipt.scope_digest, scopeDigest(evidence))
    assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).slices[0].status, 'reviewed')
  } finally { f.cleanup() }
})

// F-41-1 (Story 4.1): slice A changed 28 paths, more than one 16-path evidence set holds.
test('same-Lead APPROVE accepts split evidence sets covering twenty changed paths and finalization accepts the receipt', () => {
  const changedPaths = ['src/feature.txt', ...Array.from({ length: 19 }, (_, index) => `src/feature-${String(index).padStart(2, '0')}.txt`)].sort()
  const f = fixture('HIGH', { changedPaths })
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(pendingResult.status, 'REVIEW_REQUIRED', JSON.stringify(pendingResult))
    const evidence = makeSplitReviewEvidence(f, prepared.preview, 10)
    assert.equal(evidence.evidenceSets.length, 2)
    const review = change_evidence => ({
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: changedPaths, scope_digest: scopeDigest(change_evidence), change_evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead twenty-path review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    })
    const request = change_evidence => ({
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review: review(change_evidence)
    })
    const reversed = { evidenceSets: [...evidence.evidenceSets].reverse() }
    assert.equal(recordSliceReview(f.root, request(reversed)).reasons?.[0], 'CHANGE_EVIDENCE_SCOPE_MISMATCH')
    assert.equal(recordSliceReview(f.root, request({ evidenceSets: [evidence.evidenceSets[0]] })).reasons?.[0], 'CHANGE_EVIDENCE_SETS_INVALID')
    const duplicated = { evidenceSets: [evidence.evidenceSets[0], evidence.evidenceSets[0]] }
    assert.equal(recordSliceReview(f.root, request(duplicated)).reasons?.[0], 'CHANGE_EVIDENCE_SETS_INVALID')
    const result = recordSliceReview(f.root, request(evidence))
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.evidence_refs.map(item => item.path), evidence.evidenceSets.flatMap(set => set.units.map(item => item.path)))
    assert.equal(receipt.scope_digest, scopeDigest(evidence))
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const slice = plan.slices[0]
    const freshness = reviewEvidenceFreshness({ ...receipt, freshness: 'FRESH_CANDIDATE' }, changedPaths, slice.review.reviewed_commit, slice.review.risk_context_digest)
    assert.equal(freshness.reason, null, JSON.stringify(freshness))
  } finally { f.cleanup() }
})

test('CHANGES_REQUIRED blocks and stale policy rejects continuation without mutation', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const common = {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      review: {
        judgment: 'CHANGES_REQUIRED', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
        scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'not approved' })),
        commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
      }
    }
    const blockedResult = recordSliceReview(f.root, common)
    assert.equal(blockedResult.status, 'BLOCKED', JSON.stringify(blockedResult))
    assert.equal(blockedResult.reasons[0], 'CHANGES_REQUIRED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    const reworkResult = recordSliceReview(f.root, { ...common, review: { ...common.review,
      findings: [{ id: 'F1', class: 'VALID', summary: 'Correction needed', paths: ['src/feature.txt'] }] } })
    assert.equal(reworkResult.status, blockedResult.status)
    assert.deepEqual(reworkResult.reasons, blockedResult.reasons)
    assert.equal(reworkResult.stop_condition, blockedResult.stop_condition)
    assert.deepEqual(reworkResult.policy, { decision: 'REWORK', reasons: ['VALID_FINDINGS_CORRECTION_ALLOWED'] })
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    write(f.root, 'AGENTS.md', '# changed policy\n')
    const staleResult = recordSliceReview(f.root, common)
    assert.equal(staleResult.status, 'STALE', JSON.stringify(staleResult))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('NEED_MORE_EVIDENCE permits one bounded round and rejects a second round', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'NEED_MORE_EVIDENCE', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
      scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'need one more bounded check' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const next = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending, review })
    assert.equal(next.status, 'REVIEW_REQUIRED', JSON.stringify(next))
    assert.equal(next.pending.evidence_round, 1)
    const second = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: next.pending, review: { ...review, pending_fingerprint: next.pending.fingerprint } })
    assert.equal(second.status, 'BLOCKED', JSON.stringify(second))
    assert.equal(second.reasons[0], 'EVIDENCE_BUDGET_EXHAUSTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})
