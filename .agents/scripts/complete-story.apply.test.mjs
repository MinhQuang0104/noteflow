import { createCompletionFixture, FINALIZATION, SPRINT, STORY } from './completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { applyCompletion, recordHumanApproval } from './complete-story.mjs'
import { inspectCompletion } from './check-story-completion.mjs'

test('fresh approval permits exactly review to done and preserves immutable evidence', () => {
  const f = createCompletionFixture()
  try {
    const receiptBefore = readFileSync(`${f.root}/${FINALIZATION}`, 'utf8')
    const approval = recordHumanApproval(f.root, '9.1', f.head, {
      action: 'approve_exact_scope', disclosures_acknowledged: true, approved_at: '2026-09-26T12:00:00.000Z'
    })
    const completed = applyCompletion(f.root, '9.1', approval.commit)
    assert.equal(completed.status, 'DONE', JSON.stringify(completed))
    assert.equal(readFileSync(`${f.root}/${FINALIZATION}`, 'utf8'), receiptBefore)
    assert.match(readFileSync(`${f.root}/${STORY}`, 'utf8'), /status: done/)
    assert.match(readFileSync(`${f.root}/${SPRINT}`, 'utf8'), /9-1-fixture: done/)
    const plan = f.readPlan()
    assert.match(plan, /lifecycle_snapshot: done/)
    assert.match(plan, /execution_status: "complete"/)
    assert.match(plan, /next_action: null/)
    assert.match(plan, /human_approval:/)
    const terminal = inspectCompletion(f.root, '9.1', completed.commit)
    assert.equal(terminal.status, 'READY', JSON.stringify(terminal))
    assert.equal(terminal.terminal, true)
    assert.equal(terminal.recovery_classification, 'TERMINAL_HEALTHY')
  } finally {
    f.cleanup()
  }
})

test('complete_story is idempotently terminal and does not create a second commit', () => {
  const f = createCompletionFixture()
  try {
    const approval = recordHumanApproval(f.root, '9.1', f.head, { action: 'approve_exact_scope', disclosures_acknowledged: true })
    const completed = applyCompletion(f.root, '9.1', approval.commit)
    const terminal = applyCompletion(f.root, '9.1', completed.commit)
    assert.equal(terminal.status, 'TERMINAL')
    assert.equal(terminal.gate.recovery_classification, 'TERMINAL_HEALTHY')
    assert.equal(f.refreshHead(), completed.commit)
  } finally {
    f.cleanup()
  }
})
