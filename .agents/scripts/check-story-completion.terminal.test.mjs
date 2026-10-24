import { completedFixture, integrateUnrelatedWork } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectCompletion } from './check-story-completion.mjs'

test('terminal Story stays healthy after an integration merge and is evaluated at its completion commit', async () => {
  const f = await completedFixture()
  try {
    const head = integrateUnrelatedWork(f)
    assert.notEqual(head, f.completion)
    const result = inspectCompletion(f.root, '9.1', head)
    assert.equal(result.status, 'READY', JSON.stringify(result))
    assert.equal(result.approval_fresh, true)
    assert.equal(result.evaluation, 'TERMINAL_AT_COMPLETION_COMMIT')
    assert.equal(result.evaluated_commit, f.completion)
    assert.equal(result.head, head)
    assert.deepEqual(f.git('status', '--porcelain').split('\n').filter(line => line && !line.includes('.agent-state/v4-observations/')), [])
  } finally {
    f.cleanup()
  }
})

test('terminal Story metadata edited after completion is stale even behind a merge', async () => {
  const f = await completedFixture()
  try {
    integrateUnrelatedWork(f)
    const review = JSON.parse(f.read('receipts/review.json'))
    f.write('receipts/review.json', JSON.stringify({ ...review, findings_blocking: 0, note: 'edited later' }))
    f.git('add', 'receipts/review.json')
    f.git('commit', '-qm', 'edit review receipt after completion')
    const result = inspectCompletion(f.root, '9.1', f.refreshHead())
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.equal(result.approval_fresh, false)
    assert.ok(result.reasons.includes('STORY_METADATA_DRIFT_AFTER_COMPLETION'))
  } finally {
    f.cleanup()
  }
})
