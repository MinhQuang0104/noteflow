import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  routeAction,
  humanApprovalIntent,
  V4_AUTHORIZED_ACTIONS,
  authorizeAction,
  exitCodeForStatus
} from './v4-story-runner.mjs'
import { runAction } from './v4-story-runner.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'

const RUNNER = fileURLToPath(new URL('./v4-story-runner.mjs', import.meta.url))

function runCli(root, args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
}

test('CLI exit-code table covers every documented result class', () => {
  for (const status of [
    'STARTED', 'DONE', 'APPROVAL_DURABLE_PENDING_COMPLETION', 'NOOP', 'APPLIED',
    'HUMAN_GATE_REQUIRED', 'REVIEW_REQUIRED', 'READY', 'AUTHORIZED', 'TERMINAL',
    'NO_CHANGE'
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

test('Runner does not invoke the kernel without an explicit current implement action', () => {
  const f = createCompletionFixture()
  try {
    const result = runAction(f.root, '9.1', f.head, {
      operation: 'checkpoint',
      input: { story_id: '9.1', action: 'implement_slice', slice_id: 'A' }
    })
    assert.equal(result.status, 'UNAUTHORIZED_ACTION')
    assert.ok(result.reasons.includes('KERNEL_ACTION_NOT_CURRENT'))
    assert.equal(result.authorized, false)
  } finally {
    f.cleanup()
  }
})

test('Runner refuses a Story action outside the linked worktree that owns the Story branch', async () => {
  const { spawnSync } = await import('node:child_process')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = (await import('node:path')).default
  const { storyCheckoutState } = await import('./v4-story-runner.mjs')
  const f = createCompletionFixture()
  const parent = mkdtempSync(path.join(tmpdir(), 'v4-checkout-'))
  const linked = path.join(parent, 'story')
  const unrelated = path.join(parent, 'unrelated')
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: f.root, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    git('worktree', 'add', '-q', '-b', 'codex/story-9-10', unrelated, f.head)
    assert.equal(storyCheckoutState(f.root, '9.1').status, 'READY', 'story-9-10 must not claim Story 9.1')
    git('worktree', 'add', '-q', '-b', 'codex/story-9-1-v4', linked, f.head)
    const before = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).stdout.trim()
    const blocked = runAction(f.root, '9.1', f.head, {
      approval: { action: 'approve_exact_scope', disclosures_acknowledged: true, approved_at: '2026-09-26T12:00:00.000Z' }
    })
    assert.equal(blocked.status, 'BLOCKED', JSON.stringify(blocked))
    assert.deepEqual(blocked.reasons, ['WRONG_CHECKOUT'])
    assert.equal(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).stdout.trim(), before)
    const authorization = authorizeAction(f.root, '9.1', 'complete_story', f.head)
    assert.deepEqual(authorization.reasons, ['WRONG_CHECKOUT'])
    assert.equal(storyCheckoutState(linked, '9.1').status, 'READY')
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', linked], { cwd: f.root })
    spawnSync('git', ['worktree', 'remove', '--force', unrelated], { cwd: f.root })
    rmSync(parent, { recursive: true, force: true })
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
