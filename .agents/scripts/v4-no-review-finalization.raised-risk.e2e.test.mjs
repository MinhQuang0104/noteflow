import { RECEIPTS, readPlan, fixture, implement, verify, recordReview, stripReview, finalizationReasons } from './v4-no-review-finalization-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'

// P2.2: a slice that `verify` passed on the LOW NO_REVIEW path reaches `done`
// through the real kernel and Runner, and nothing else can skip review. Only the
// fixture seed and the explicit tamper cases write Plan text by hand.

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
