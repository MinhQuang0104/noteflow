import { readPlan, head, fixture, implement, verify, recordReview, stripReview, finalizationReasons } from './v4-no-review-finalization-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'

// P2.2: a slice that `verify` passed on the LOW NO_REVIEW path reaches `done`
// through the real kernel and Runner, and nothing else can skip review. Only the
// fixture seed and the explicit tamper cases write Plan text by hand.

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
