import { digest, stableDigest, fixture, run, withFixture, expectStatus } from './check-story-finalization-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

// The persisted NO_REVIEW shape (P2.2): `verified`, no review receipt, no Plan
// review block; only the verification receipt records the escalation.
const noReviewSlice = extra => ({ id: 'A', path: 'src/a.txt', status: 'verified', reviewReceipt: false, reviewBlock: false, ...extra })

test('clean reviewed fixture is READY with a compact preview', () => withFixture({}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY')
  assert.equal(result.json.human_gate_required, true)
  assert.equal(result.json.human_approval_present, false)
  assert.equal(result.json.lifecycle_from, 'in-progress')
  assert.equal(result.json.lifecycle_target, 'review')
  assert.equal(result.json.scope.path_count, 1)
}))

test('canonical disclosures produce READY with READY_WITH_DISCLOSURES without relabeling', () => withFixture({ slices: [{ id: 'A', path: 'src/a.txt', canonical: { applicability: 'NOT_APPLICABLE', status: 'INCOMPLETE', complete: false } }] }, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY_WITH_DISCLOSURES')
  assert.equal(result.json.canonical_disclosures[0].status, 'INCOMPLETE')
  assert.equal(result.json.canonical_disclosures[0].applicability, 'NOT_APPLICABLE')
  assert.equal(result.json.canonical_disclosures[0].complete, false)
}))

test('all slices must be reviewed', () => withFixture({ sliceStatus: 'verified' }, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'SLICE_NOT_REVIEWED:A')
}))

test('progression false blocks finalization', () => withFixture({ progressionEligible: false }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'PROGRESSION_NOT_ELIGIBLE:A')
}))

test('blockers and unresolved questions block finalization', () => withFixture({ blockers: true }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'BLOCKERS_PRESENT')
}))

test('unresolved questions block finalization', () => withFixture({ question: true }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'UNRESOLVED_QUESTIONS_PRESENT')
}))

test('missing verification receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('VERIFICATION_RECEIPT')))
}))

test('missing implementation receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('IMPLEMENTATION_RECEIPT')))
}))

test('missing required review receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('REVIEW_RECEIPT')))
}))

test('verified LOW slice in MEDIUM Story with a NO_REVIEW receipt is final-ready', () => withFixture({
  slices: [noReviewSlice({ risk: { level: 'LOW' } })]
}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.deepEqual(result.json.reasons, [])
  assert.equal(result.json.slices[0].status, 'verified')
  assert.equal(result.json.slices[0].review_required, false)
}))

test('reviewed slice without its review receipt is blocked even when no review was due', () => withFixture({
  slices: [{ id: 'A', path: 'src/a.txt', risk: { level: 'LOW' }, reviewRequired: false, reviewReceipt: false }]
}, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'REVIEW_RECEIPT_REQUIRED')
}))

test('verified slice whose Plan adds review.required true is not final-ready', () => withFixture({
  slices: [noReviewSlice({ risk: { level: 'LOW' }, reviewBlock: true, reviewRequired: true })]
}, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'SLICE_NOT_REVIEWED:A')
  assert.ok(result.json.reasons.includes('REVIEW_RECEIPT_REQUIRED:A'), JSON.stringify(result.json))
}))

test('MEDIUM slice in MEDIUM Story still requires a review receipt', () => withFixture({
  slices: [noReviewSlice({ risk: { level: 'MEDIUM' }, escalation: { decision: 'NO_REVIEW', risk: 'MEDIUM', reasons: [] } })]
}, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'REVIEW_RECEIPT_REQUIRED:A')
  assert.ok(result.json.reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(result.json))
}))

test('absent slice risk retains Story risk review requirement and digest', () => withFixture({ kernelReview: true }, f => {
  const review = JSON.parse(readFileSync(path.join(f.root,
    '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json'), 'utf8'))
  assert.equal(review.risk_context_digest, stableDigest({ level: 'MEDIUM' }))
  expectStatus(run(f), 'READY', 0)
}))

test('absent slice risk still requires Story risk review without explicit review clauses', () => withFixture({
  slices: [noReviewSlice()]
}, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'REVIEW_RECEIPT_REQUIRED:A')
  assert.ok(result.json.reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(result.json))
}))

test('LOW slice with a bound review still validates its Story risk digest', () => withFixture({
  kernelReview: true,
  slices: [{ id: 'A', path: 'src/a.txt', risk: { level: 'LOW' }, reviewRequired: false }]
}, f => {
  const review = JSON.parse(readFileSync(path.join(f.root,
    '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json'), 'utf8'))
  assert.equal(review.risk_context_digest, stableDigest({ level: 'MEDIUM' }))
  expectStatus(run(f), 'READY', 0)
}))

test('LOW slice review bound to slice risk digest fails Story risk freshness', () => withFixture({
  kernelReview: true,
  slices: [{ id: 'A', path: 'src/a.txt', risk: { level: 'LOW' }, reviewRequired: false,
    reviewRiskDigest: stableDigest({ level: 'LOW' }) }]
}, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'REVIEW_FRESHNESS_INVALID:A')
}))
