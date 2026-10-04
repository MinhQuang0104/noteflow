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
