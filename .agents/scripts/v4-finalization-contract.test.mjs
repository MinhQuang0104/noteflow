import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { inferCanonicalApplicability, receiptKindsForAttemptStatus, reviewDecision, reviewEvidenceFreshness } from './v4-finalization-contract.mjs'

const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')

test('kernel review judgment is accepted and contradictory legacy verdict is rejected', () => {
  assert.deepEqual(reviewDecision({ judgment: 'APPROVE' }), { value: 'APPROVE', error: null })
  assert.equal(reviewDecision({ judgment: 'APPROVE', verdict: 'CHANGES_REQUIRED' }).error, 'REVIEW_DECISION_CONFLICT')
})

test('review freshness requires exact checkpoint, risk binding and ordered evidence scope', () => {
  const refs = [{ path: 'src/a.txt', hunk_index: 0, body_digest: 'sha256:' + '1'.repeat(64) }]
  const review = {
   judgment: 'APPROVE', reviewed_commit: 'c'.repeat(40),
   risk_context_digest: digest({ level: 'HIGH' }),
    evidence_refs: refs, scope_digest: 'sha256:50a006cdb5cebd8a3cf8dbec50bc85d1d403278a1a6c078b99bccc724bf47d3d'
 }
  const result = reviewEvidenceFreshness(review, ['src/a.txt'], 'c'.repeat(40), digest({ level: 'HIGH' }))
  assert.equal(result.status, 'FRESH_REUSED')
  assert.equal(reviewEvidenceFreshness(review, ['src/b.txt'], 'c'.repeat(40), digest({ level: 'HIGH' })).status, 'INVALID')
})

test('historical receipt kinds follow immutable attempt status', () => {
  assert.deepEqual(receiptKindsForAttemptStatus('checkpointed'), ['implementation'])
  assert.deepEqual(receiptKindsForAttemptStatus('verified'), ['implementation', 'verification'])
  assert.deepEqual(receiptKindsForAttemptStatus('reviewed'), ['implementation', 'verification', 'review'])
})

test('canonical applicability is inferred only from complete validated recipe provenance', () => {
  const paths = ['src/a.txt', 'src/b.txt']
  assert.equal(inferCanonicalApplicability({ featureId: 'fixture-feature', changedPaths: paths, matchedPaths: ['src/a.txt'], unmatchedPaths: ['src/b.txt'], dependencyOnlyPaths: [] }, paths), 'APPLICABLE')
  assert.equal(inferCanonicalApplicability({ featureId: null, changedPaths: paths, matchedPaths: [], unmatchedPaths: paths, dependencyOnlyPaths: [] }, paths), null)
})

test('review receipt dialect separates schema 2, bound schema 1 and legacy schema 1 receipts', async () => {
  const { reviewReceiptDialect, REVIEW_RECEIPT_SCHEMA_VERSION } = await import('./v4-finalization-contract.mjs')
  assert.equal(REVIEW_RECEIPT_SCHEMA_VERSION, 2)
  const bound = { judgment: 'APPROVE', evidence_refs: [], scope_digest: 'sha256:' + '0'.repeat(64) }
  assert.equal(reviewReceiptDialect({ schema_version: 2, ...bound }), 'bound')
  assert.equal(reviewReceiptDialect({ schema_version: 1, ...bound }), 'bound')
  assert.equal(reviewReceiptDialect({ schema_version: 1, judgment: 'APPROVE', scope_digest: null }), 'bound', 'a null scope_digest still binds and must fail evidence checks')
  assert.equal(reviewReceiptDialect({ schema_version: 1, verdict: 'APPROVE', freshness: 'FRESH', evidence_refs: [] }), 'legacy')
  assert.equal(reviewReceiptDialect({ schema_version: 2, verdict: 'APPROVE', freshness: 'FRESH' }), 'invalid')
  assert.equal(reviewReceiptDialect({ schema_version: 2, ...bound, verdict: 'APPROVE' }), 'invalid')
  assert.equal(reviewReceiptDialect({ schema_version: 1, verdict: 'APPROVE' }), 'invalid')
  assert.equal(reviewReceiptDialect({ schema_version: 3, ...bound }), 'invalid')
  assert.equal(reviewReceiptDialect(null), 'invalid')
})

test('legacy review freshness still binds approval, checkpoint, risk and declared freshness', async () => {
  const { legacyReviewFreshness } = await import('./v4-finalization-contract.mjs')
  const risk = 'sha256:' + 'a'.repeat(64)
  const legacy = { schema_version: 1, verdict: 'APPROVE', reviewed_commit: 'c'.repeat(40), risk_context_digest: risk, freshness: { status: 'FRESH_CANDIDATE' } }
  assert.equal(legacyReviewFreshness(legacy, 'c'.repeat(40), risk).status, 'FRESH_CANDIDATE')
  assert.equal(legacyReviewFreshness({ ...legacy, verdict: 'CHANGES_REQUIRED' }, 'c'.repeat(40), risk).status, 'INVALID')
  assert.equal(legacyReviewFreshness(legacy, 'd'.repeat(40), risk).reason, 'REVIEWED_COMMIT_MISMATCH')
  assert.equal(legacyReviewFreshness(legacy, 'c'.repeat(40), 'sha256:' + 'b'.repeat(64)).reason, 'RISK_CONTEXT_DIGEST_MISMATCH')
  assert.equal(legacyReviewFreshness({ ...legacy, freshness: 'STALE' }, 'c'.repeat(40), risk).reason, 'REVIEW_FRESHNESS_INVALID')
})
