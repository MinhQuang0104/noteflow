import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  applyCompletion,
  prepareCompletion,
  recordHumanApproval
} from './complete-story.mjs'
import { inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture, FINALIZATION, PLAN, SPRINT, STORY } from './completion-fixture.mjs'

test('completion transaction exports the bounded approval and completion interfaces', () => {
  assert.equal(typeof recordHumanApproval, 'function')
  assert.equal(typeof prepareCompletion, 'function')
  assert.equal(typeof applyCompletion, 'function')
})

test('completion preparation fails closed outside a repository', () => {
  const result = prepareCompletion('not-a-repository', '9.1', 'f'.repeat(40))
  assert.equal(result.status, 'ERROR')
  assert.equal(result.valid, false)
})

test('exact structured approval is durable and stops before complete_story', () => {
  const f = createCompletionFixture()
  try {
    const before = f.head
    const result = recordHumanApproval(f.root, '9.1', before, {
      action: 'approve_exact_scope',
      disclosures_acknowledged: true,
      approved_at: '2026-09-26T12:00:00.000Z'
    })
    assert.equal(result.status, 'APPROVAL_DURABLE_PENDING_COMPLETION', JSON.stringify(result))
    assert.notEqual(result.commit, before)
    assert.match(f.readPlan(), /human_approval:/)
    assert.match(f.readPlan(), /approved_action: "complete_story"/)
    assert.match(f.readPlan(), /kind: "?complete_story"?/)
  } finally {
    f.cleanup()
  }
})

test('generic continuation cannot create approval or execute completion', () => {
  const f = createCompletionFixture()
  try {
    const before = f.head
    const approval = recordHumanApproval(f.root, '9.1', before, 'continue')
    assert.equal(approval.status, 'BLOCKED')
    assert.equal(f.refreshHead(), before)
    const completion = applyCompletion(f.root, '9.1', before)
    assert.equal(completion.status, 'BLOCKED')
    assert.equal(f.refreshHead(), before)
  } finally {
    f.cleanup()
  }
})

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

test('tampered finalization receipt fails closed after approval', () => {
  const f = createCompletionFixture()
  try {
    const approval = recordHumanApproval(f.root, '9.1', f.head, { action: 'approve_exact_scope', disclosures_acknowledged: true })
    const receipt = JSON.parse(readFileSync(`${f.root}/${FINALIZATION}`, 'utf8'))
    receipt.done_gate_disposition = 'SATISFIED_WITH_DISCLOSURES'
    f.write(FINALIZATION, JSON.stringify(receipt))
    f.git('add', FINALIZATION)
    f.git('commit', '-qm', 'tamper finalization')
    f.refreshHead()
    const result = applyCompletion(f.root, '9.1', f.head)
    assert.ok(['STALE', 'INVALID'].includes(result.status), JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})
