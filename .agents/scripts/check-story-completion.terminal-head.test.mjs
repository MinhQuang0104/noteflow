import { completedFixture, integrateUnrelatedWork } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectCompletion } from './check-story-completion.mjs'
import { PLAN } from './completion-fixture.mjs'

test('uncommitted terminal Plan edits are stale and a wrong expected head is reported', async () => {
  const f = await completedFixture()
  try {
    const head = integrateUnrelatedWork(f)
    f.write(PLAN, f.readPlan() + '\n')
    const dirty = inspectCompletion(f.root, '9.1', head)
    assert.equal(dirty.status, 'STALE', JSON.stringify(dirty))
    assert.ok(dirty.reasons.includes('STORY_METADATA_DIRTY_AFTER_COMPLETION'))
    f.git('checkout', '--', PLAN)
    const wrongHead = inspectCompletion(f.root, '9.1', f.completion)
    assert.equal(wrongHead.status, 'STALE', JSON.stringify(wrongHead))
    assert.ok(wrongHead.reasons.includes('EXPECTED_HEAD_MISMATCH'))
  } finally {
    f.cleanup()
  }
})

test('terminal check at the completion commit itself keeps the direct parent-chain binding', async () => {
  const f = await completedFixture()
  try {
    const result = inspectCompletion(f.root, '9.1', f.completion)
    assert.equal(result.status, 'READY', JSON.stringify(result))
    assert.equal(result.evaluation, undefined)
    assert.equal(result.recovery_classification, 'TERMINAL_HEALTHY')
  } finally {
    f.cleanup()
  }
})
