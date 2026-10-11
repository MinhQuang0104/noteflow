import { RECEIPTS, readPlan, head, fixture, implement, verify, recordReview, finalizeAndComplete, stripReview, finalizationReasons } from './v4-no-review-finalization-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'

// P2.2: a slice that `verify` passed on the LOW NO_REVIEW path reaches `done`
// through the real kernel and Runner, and nothing else can skip review. Only the
// fixture seed and the explicit tamper cases write Plan text by hand.



test('MEDIUM Story with one LOW NO_REVIEW slice finalizes, passes the Human Gate and completes', () => {
  const slice = { id: 'A', risk: 'LOW', path: 'src/a.txt', task: 'T-1' }
  const f = fixture([slice])
  try {
    implement(f, slice)
    const step = verify(f, slice)
    assert.equal(step.result.status, 'APPLIED', JSON.stringify(step.result))
    assert.equal(step.result.policy.decision, 'PROGRESS')
    const persisted = frontmatter(readPlan(f)).slices[0]
    assert.equal(persisted.status, 'verified')
    assert.equal(persisted.receipt_refs.review, undefined)
    assert.equal(frontmatter(readPlan(f)).next_action.kind, 'finalize_story')
    finalizeAndComplete(f)
  } finally { f.cleanup() }
})

test('MEDIUM slice stops at REVIEW_REQUIRED and skipping review cannot reach finalization', () => {
  const slice = { id: 'A', risk: 'MEDIUM', path: 'src/a.txt', task: 'T-1' }
  const f = fixture([slice])
  try {
    implement(f, slice)
    const before = head(f)
    const step = verify(f, slice)
    assert.equal(step.result.status, 'REVIEW_REQUIRED', JSON.stringify(step.result))
    assert.equal(head(f), before)
    const plan = frontmatter(readPlan(f))
    assert.equal(plan.slices[0].status, 'checkpointed')
    assert.equal(plan.next_action.kind, 'verify_slice')
    const reasons = finalizationReasons(f)
    assert.ok(reasons.includes('FINALIZE_STORY_ACTION_REQUIRED'), JSON.stringify(reasons))
    assert.ok(reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(reasons))
  } finally { f.cleanup() }
})

for (const [label, extra] of [
  ['a judgment flag escalation', { judgment_flags: ['PUBLIC_CONTRACT'] }],
  ['a requested MEDIUM risk', { risk: 'MEDIUM' }]
]) {
  test(`LOW slice raised to REVIEW_REQUIRED by ${label} is not final-ready without review`, () => {
    const slice = { id: 'A', risk: 'LOW', path: 'src/a.txt', task: 'T-1' }
    const f = fixture([slice])
    try {
      implement(f, slice)
      const step = verify(f, slice, extra)
      assert.equal(step.result.status, 'REVIEW_REQUIRED', JSON.stringify(step.result))
      assert.equal(frontmatter(readPlan(f)).slices[0].status, 'checkpointed')
      recordReview(f, slice, step)
      const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPTS, 'A-verification.json'), 'utf8'))
      assert.equal(receipt.escalation.decision, 'REVIEW_REQUIRED')
      stripReview(f, 'A')
      const reasons = finalizationReasons(f)
      assert.ok(reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(reasons))
      assert.ok(reasons.includes('REVIEW_RECEIPT_REQUIRED:A'), JSON.stringify(reasons))
    } finally { f.cleanup() }
  })
}

test('tampering a reviewed MEDIUM slice to verified with review.required false is blocked by the receipt', () => {
  const slice = { id: 'A', risk: 'MEDIUM', path: 'src/a.txt', task: 'T-1' }
  const f = fixture([slice])
  try {
    implement(f, slice)
    recordReview(f, slice, verify(f, slice))
    const tampered = stripReview(f, 'A')
    assert.equal(tampered.status, 'verified')
    assert.equal(tampered.review.required, false)
    assert.equal(tampered.receipt_refs.review, undefined)
    const reasons = finalizationReasons(f)
    assert.ok(reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(reasons))
    assert.ok(reasons.includes('REVIEW_RECEIPT_REQUIRED:A'), JSON.stringify(reasons))
  } finally { f.cleanup() }
})

test('two-slice Story with a LOW NO_REVIEW slice and a reviewed MEDIUM slice finalizes and completes', () => {
  const low = { id: 'A', risk: 'LOW', path: 'src/a.txt', task: 'T-1' }
  const medium = { id: 'B', risk: 'MEDIUM', path: 'src/b.txt', task: 'T-2', dependsOn: ['A'] }
  const f = fixture([low, medium])
  try {
    implement(f, low)
    const lowStep = verify(f, low)
    assert.equal(lowStep.result.status, 'APPLIED', JSON.stringify(lowStep.result))
    assert.deepEqual(frontmatter(readPlan(f)).next_action, { kind: 'implement_slice', target: 'B' })
    implement(f, medium)
    recordReview(f, medium, verify(f, medium))
    const plan = frontmatter(readPlan(f))
    assert.deepEqual(plan.slices.map(slice => slice.status), ['verified', 'reviewed'])
    assert.equal(plan.next_action.kind, 'finalize_story')
    finalizeAndComplete(f)
  } finally { f.cleanup() }
})
