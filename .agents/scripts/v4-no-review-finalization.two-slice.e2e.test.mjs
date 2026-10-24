import { readPlan, fixture, implement, verify, recordReview, finalizeAndComplete } from './v4-no-review-finalization-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'

// P2.2: a slice that `verify` passed on the LOW NO_REVIEW path reaches `done`
// through the real kernel and Runner, and nothing else can skip review. Only the
// fixture seed and the explicit tamper cases write Plan text by hand.

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
