import test from 'node:test'
import assert from 'node:assert/strict'

import {
  routeAction,
  humanApprovalIntent,
  V4_AUTHORIZED_ACTIONS,
  authorizeAction
} from './v4-story-runner.mjs'
import { runAction } from './v4-story-runner.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'

test('finalize_story is authorized only for READY in-progress story state', () => {
  const result = routeAction({
    nextAction: { kind: 'finalize_story', target: 'story' },
    lifecycle: 'in-progress',
    executionStatus: 'in-progress',
    helperStatus: 'READY',
    doneGateDisposition: 'READY_WITH_DISCLOSURES',
    humanApprovalPresent: false
  })
  assert.equal(result.authorized, true)
  assert.equal(result.action, 'finalize_story')
  assert.equal(result.stopCondition, 'HUMAN_GATE_REQUIRED')
})

for (const helperStatus of ['BLOCKED', 'STALE', 'INVALID']) {
  test('finalize_story rejects helper ' + helperStatus, () => {
    const result = routeAction({
      nextAction: { kind: 'finalize_story', target: 'story' },
      lifecycle: 'in-progress',
      executionStatus: 'in-progress',
      helperStatus,
      doneGateDisposition: 'READY',
      humanApprovalPresent: false
    })
    assert.equal(result.authorized, false)
    assert.equal(result.status, helperStatus)
  })
}

test('complete_story is enabled only with a fresh durable approval', () => {
  const result = routeAction({
    nextAction: { kind: 'complete_story', target: 'story' },
    lifecycle: 'review',
    executionStatus: 'complete',
    humanApprovalPresent: true,
    humanApprovalFresh: true,
    completionStatus: 'READY'
  })
  assert.equal(V4_AUTHORIZED_ACTIONS.has('complete_story'), true)
  assert.equal(result.authorized, true)
  assert.equal(result.status, 'READY')
  assert.equal(result.stopCondition, 'TERMINAL_DONE')
})

test('generic continuation is never an explicit approval intent', () => {
  for (const value of ['continue', 'next', 'go on', 'proceed', 'ok']) assert.equal(humanApprovalIntent(value), false)
  assert.equal(humanApprovalIntent({
    action: 'approve_exact_scope',
    disclosures_acknowledged: true
  }), true)
})

test('complete_story without approval is blocked and returns the exact preview', () => {
  const result = routeAction({
    nextAction: { kind: 'complete_story', target: 'story' },
    lifecycle: 'review',
    executionStatus: 'complete',
    humanApprovalPresent: false,
    humanApprovalFresh: false,
    completionStatus: 'BLOCKED'
  })
  assert.equal(result.authorized, false)
  assert.equal(result.status, 'BLOCKED')
  assert.ok(result.reasons.includes('HUMAN_APPROVAL_REQUIRED'))
})

test('complete_story rejects non-review lifecycle and wrong next action', () => {
  const lifecycle = routeAction({
    nextAction: { kind: 'complete_story', target: 'story' },
    lifecycle: 'in-progress',
    executionStatus: 'complete',
    humanApprovalPresent: true,
    humanApprovalFresh: true,
    completionStatus: 'READY'
  })
  assert.equal(lifecycle.authorized, false)
  assert.ok(lifecycle.reasons.includes('LIFECYCLE_NOT_REVIEW'))
  const f = createCompletionFixture()
  try {
    const action = authorizeAction(f.root, '9.1', 'finalize_story', f.head)
    assert.equal(action.authorized, false)
    assert.ok(action.reasons.includes('NEXT_ACTION_MISMATCH'))
  } finally {
    f.cleanup()
  }
})

test('Runner approval flag is one durable action and the next invocation completes', () => {
  const f = createCompletionFixture()
  try {
    const preview = runAction(f.root, '9.1', f.head)
    assert.equal(preview.status, 'BLOCKED', JSON.stringify(preview))
    assert.equal(preview.snapshot.pending_action.kind, 'complete_story')
    const approval = runAction(f.root, '9.1', f.head, {
      approval: { action: 'approve_exact_scope', disclosures_acknowledged: true, approved_at: '2026-09-26T12:00:00.000Z' }
    })
    assert.equal(approval.status, 'APPROVAL_DURABLE_PENDING_COMPLETION', JSON.stringify(approval))
    const completed = runAction(f.root, '9.1', approval.commit)
    assert.equal(completed.status, 'DONE', JSON.stringify(completed))
  } finally {
    f.cleanup()
  }
})
