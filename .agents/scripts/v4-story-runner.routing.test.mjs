import { runCli } from './v4-story-runner-fixture.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { routeAction, humanApprovalIntent, V4_AUTHORIZED_ACTIONS, authorizeAction, exitCodeForStatus, CODES } from './v4-story-runner.mjs'
import { runAction } from './v4-story-runner.mjs'

test('CLI exit-code table covers every documented result class', () => {
  for (const status of [
    'STARTED', 'DONE', 'APPROVAL_DURABLE_PENDING_COMPLETION', 'NOOP', 'APPLIED',
    'HUMAN_GATE_REQUIRED', 'REVIEW_REQUIRED', 'READY', 'AUTHORIZED', 'TERMINAL',
    'NO_CHANGE', 'CHECKPOINTED'
  ]) assert.equal(exitCodeForStatus(status), 0, status)
  for (const status of ['STALE', 'CONFLICT']) assert.equal(exitCodeForStatus(status), 2, status)
  for (const status of [
    'BLOCKED', 'UNAUTHORIZED_ACTION', 'HUMAN_REQUIRED', 'RECONCILIATION_REQUIRED',
    'HUMAN_GATE_PENDING', 'APPROVAL_PREVIEW_ONLY', 'CHECKPOINT_UNRECORDED',
    'PLAN_UPDATE_PENDING', 'RESUME_WORKTREE', 'RERUN_REQUIRED', 'INCONCLUSIVE'
  ]) assert.equal(exitCodeForStatus(status), 3, status)
  assert.equal(exitCodeForStatus('INVALID'), 4)
  assert.equal(exitCodeForStatus('ERROR'), 5)
  assert.equal(exitCodeForStatus('RECOVERY_REQUIRED'), 6)
  assert.equal(exitCodeForStatus('UNRECOGNIZED_STATUS'), 5)
})

test('every status the action kernel or transactions emit has a Runner exit code', () => {
  // G1 found a successful checkpoint (CHECKPOINTED) exiting 5 because the table
  // missed it. NOT_FOUND is internal to transaction inspection and never
  // leaves the Runner.
  const internalOnly = new Set(['NOT_FOUND'])
  const sources = ['v4-action-kernel.mjs', 'v4-slice-transaction.mjs']
    .map(name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')).join('\n')
  const statuses = new Set([...sources.matchAll(/status: '([A-Z_]+)'|statusResult\('([A-Z_]+)'/g)]
    .map(match => match[1] ?? match[2]))
  const missing = [...statuses].filter(status => !internalOnly.has(status) && !Object.hasOwn(CODES, status))
  assert.deepEqual(missing, [])
})

test('fresh start routes only a ready preview and stops before implementing its successor', () => {
  const input = { nextAction: { kind: 'start_story', target: 'story' }, helperStatus: 'READY' }
  const result = routeAction(input)
  assert.equal(result.authorized, true)
  assert.equal(result.stopCondition, 'STORY_STARTED')
  for (const status of ['BLOCKED', 'STALE', 'INVALID', undefined]) {
    assert.equal(routeAction({ ...input, helperStatus: status }).authorized, false)
  }
  assert.equal(routeAction({ ...input, nextAction: { kind: 'start_story', target: 'A' } }).authorized, false)
})

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

test('CLI accepts an explicit operation and JSON input file', () => {
  const f = createCompletionFixture()
  const input = path.join(f.root, 'runner-input.json')
  try {
    writeFileSync(input, JSON.stringify({ story_id: '9.1', action: 'implement_slice', slice_id: 'A' }))
    const result = runCli(f.root, [
      'run', '9.1', '--expected-head', f.head,
      '--operation', 'checkpoint', '--input', input
    ])
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'UNAUTHORIZED_ACTION', result.stdout)
    assert.equal(result.status, exitCodeForStatus('UNAUTHORIZED_ACTION'))
  } finally {
    f.cleanup()
  }
})

test('CLI maps durable approval success to exit code zero', () => {
  const f = createCompletionFixture()
  try {
    const result = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--approve-exact-scope'])
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'APPROVAL_DURABLE_PENDING_COMPLETION', result.stdout)
    assert.equal(result.status, 0)
  } finally {
    f.cleanup()
  }
})

test('CLI reports PLAN_MISSING before attempting to read a missing Plan', () => {
  const f = createCompletionFixture()
  const plan = path.join(f.root, '_bmad-output', 'implementation-artifacts', 'story-9-1-plan.md')
  try {
    rmSync(plan)
    const result = runCli(f.root, ['run', '9.1', '--expected-head', f.head])
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'INVALID', result.stdout)
    assert.deepEqual(output.reasons, ['PLAN_MISSING'])
    assert.equal(result.status, 4)
  } finally {
    f.cleanup()
  }
})
