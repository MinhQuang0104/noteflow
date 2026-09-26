import test from 'node:test'
import assert from 'node:assert/strict'

import {
  routeAction,
  humanApprovalIntent,
  V4_AUTHORIZED_ACTIONS
} from './v4-story-runner.mjs'

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

test('complete_story is recognized but remains a Human Gate placeholder', () => {
  const result = routeAction({
    nextAction: { kind: 'complete_story', target: 'story' },
    lifecycle: 'review',
    executionStatus: 'complete',
    humanApprovalPresent: false
  })
  assert.equal(V4_AUTHORIZED_ACTIONS.has('complete_story'), false)
  assert.equal(result.authorized, false)
  assert.equal(result.status, 'HUMAN_GATE_REQUIRED')
  assert.equal(result.reason, 'COMPLETE_STORY_EXECUTION_DISABLED')
})

test('generic continuation is never an explicit approval intent', () => {
  assert.equal(humanApprovalIntent('continue'), false)
  assert.equal(humanApprovalIntent({ decision: 'APPROVE' }), false)
  assert.equal(humanApprovalIntent({
    decision: 'APPROVE',
    intent: 'approve exact scope',
    story_id: '2.3',
    story_normative_digest: 'sha256:' + 'a'.repeat(64),
    finalization_receipt_digest: 'sha256:' + 'b'.repeat(64),
    scope_paths_digest: 'sha256:' + 'c'.repeat(64),
    implementation_commit_set_digest: 'sha256:' + 'd'.repeat(64),
    final_scoped_tree_digest: 'sha256:' + 'e'.repeat(64),
    approved_head: 'f'.repeat(40)
  }), true)
})
