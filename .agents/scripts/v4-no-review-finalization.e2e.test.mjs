import { readPlan, fixture, implement, verify, finalizeAndComplete } from './v4-no-review-finalization-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
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
