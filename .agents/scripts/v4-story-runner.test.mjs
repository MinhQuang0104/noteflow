import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  routeAction,
  humanApprovalIntent,
  V4_AUTHORIZED_ACTIONS,
  authorizeAction,
  autopilotStatus,
  exitCodeForStatus,
  CODES
} from './v4-story-runner.mjs'
import { runAction } from './v4-story-runner.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'

const RUNNER = fileURLToPath(new URL('./v4-story-runner.mjs', import.meta.url))

function runCli(root, args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
}

const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'

const autopilotInput = (budgets = { max_slices: 2, max_rework_per_slice: 1, max_minutes_per_slice: 30 }) =>
  ({ action: 'authorize_autopilot', story_id: '9.1', budgets, lead_vendor: 'codex' })

function prepareFinalizeAutopilotFixture() {
  const f = createCompletionFixture()
  f.write(PLAN, f.readPlan().replace('kind: "complete_story"', 'kind: "finalize_story"'))
  f.git('add', PLAN)
  f.git('commit', '-qm', 'prepare autopilot status fixture')
  f.refreshHead()
  return f
}

test('structured autopilot authority is Plan-bound in one exact-path commit and can be revoked', () => {
  const f = createCompletionFixture()
  try {
    const original = f.readPlan()
    const authorized = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--authorize-autopilot', JSON.stringify(autopilotInput())])
    assert.equal(authorized.status, 0, authorized.stdout)
    const result = JSON.parse(authorized.stdout)
    assert.equal(result.status, 'AUTHORIZED')
    assert.equal(f.git('show', 'HEAD:' + PLAN), f.readPlan().trim())
    assert.equal(f.git('rev-parse', 'HEAD:' + PLAN), result.committed_plan_blob)
    assert.deepEqual(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split(/\r?\n/), ['_bmad-output/implementation-artifacts/story-9-1-plan.md'])
    const authority = frontmatter(f.readPlan()).autopilot
    assert.equal(authority.schema_version, 1)
    assert.equal(authority.authorized_head, f.head)
    assert.deepEqual(authority.budgets, autopilotInput().budgets)
    assert.equal(authority.lead_vendor, 'codex')
    assert.equal(authority.revoked, false)
    assert.match(authority.authorized_plan_digest, /^sha256:[0-9a-f]{64}$/)
    assert.equal(authority.authorized_plan_digest, 'sha256:' + createHash('sha256').update(original).digest('hex'))
    assert.equal(typeof authority.authorized_at, 'string')
    assert.notEqual(f.readPlan(), original)
    const beforeRevoke = f.git('rev-parse', 'HEAD')
    const revoked = runCli(f.root, ['run', '9.1', '--expected-head', beforeRevoke, '--revoke-autopilot'])
    assert.equal(revoked.status, 0, revoked.stdout)
    assert.equal(frontmatter(f.readPlan()).autopilot.revoked, true)
    assert.equal(frontmatter(f.readPlan()).autopilot.authorized_head, f.head)
    assert.deepEqual(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split(/\r?\n/), ['_bmad-output/implementation-artifacts/story-9-1-plan.md'])
    f.write('_bmad-output/implementation-artifacts/story-9-1-plan.md', f.readPlan().replace(authority.authorized_plan_digest, 'sha256:' + '0'.repeat(64)))
    assert.ok(validateStoryPlan(f.root, '9.1').reasons.includes('AUTOPILOT_PLAN_BINDING_MISMATCH'))
  } finally { f.cleanup() }
})

test('autopilot lock conflict reports recovery paths and leaves the foreign lock untouched', () => {
  const f = createCompletionFixture()
  try {
    const lock = path.join(f.root, '.git', 'v4-autopilot-authority.lock')
    writeFileSync(lock, 'foreign transaction\n')
    const result = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', f.head,
      '--authorize-autopilot', JSON.stringify(autopilotInput())]).stdout)
    assert.equal(result.status, 'RECOVERY_REQUIRED')
    assert.deepEqual(result.reasons, ['AUTOPILOT_TRANSACTION_LOCKED'])
    assert.equal(result.recovery.lock_path, lock)
    assert.equal(result.recovery.plan_path, path.join(f.root, PLAN))
    assert.equal(result.recovery.index_path, path.join(f.root, '.git', 'index'))
    assert.equal(readFileSync(lock, 'utf8'), 'foreign transaction\n')
    assert.equal(f.git('rev-parse', 'HEAD'), f.head)
    const staleRetry = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', '0'.repeat(40),
      '--authorize-autopilot', JSON.stringify(autopilotInput())]).stdout)
    assert.equal(staleRetry.status, 'RECOVERY_REQUIRED')
    assert.equal(staleRetry.recovery.lock_path, lock)
  } finally { f.cleanup() }
})

test('post-write commit failure retains a visible autopilot recovery lock', () => {
  const f = createCompletionFixture()
  try {
    const result = spawnSync(process.execPath, [RUNNER, 'run', '9.1', '--expected-head', f.head,
      '--authorize-autopilot', JSON.stringify(autopilotInput())], {
      cwd: f.root, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GIT_COMMITTER_DATE: 'invalid' }
    })
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'RECOVERY_REQUIRED', result.stdout)
    assert.ok(output.recovery.lock_path)
    assert.equal(output.recovery.plan_path, path.join(f.root, PLAN))
    assert.equal(output.recovery.index_path, path.join(f.root, '.git', 'index'))
    assert.equal(readFileSync(output.recovery.lock_path, 'utf8').includes(f.head), true)
    assert.equal(f.git('rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('autopilot cannot be reauthorized or revoked without a durable record', () => {
  const f = createCompletionFixture()
  try {
    const absent = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--revoke-autopilot'])
    assert.deepEqual(JSON.parse(absent.stdout).reasons, ['NO_AUTOPILOT_AUTHORIZATION'])
    const input = JSON.stringify(autopilotInput())
    const first = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--authorize-autopilot', input])
    assert.equal(first.status, 0, first.stdout)
    const head = f.git('rev-parse', 'HEAD')
    const duplicate = runCli(f.root, ['run', '9.1', '--expected-head', head, '--authorize-autopilot', input])
    assert.deepEqual(JSON.parse(duplicate.stdout).reasons, ['AUTOPILOT_ALREADY_AUTHORIZED'])
    assert.equal(f.git('rev-parse', 'HEAD'), head)
  } finally { f.cleanup() }
})

test('autopilot authority rejects free text, invalid budgets, and stale HEAD without mutation', () => {
  const f = createCompletionFixture()
  try {
    for (const input of ['continue', JSON.stringify(autopilotInput({ max_slices: 0, max_rework_per_slice: 4, max_minutes_per_slice: 4 }))]) {
      const result = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--authorize-autopilot', input])
      assert.equal(JSON.parse(result.stdout).status, 'INVALID', result.stdout)
      assert.equal(f.git('rev-parse', 'HEAD'), f.head)
    }
    const stale = runCli(f.root, ['run', '9.1', '--expected-head', '0'.repeat(40), '--authorize-autopilot', JSON.stringify(autopilotInput())])
    assert.equal(JSON.parse(stale.stdout).status, 'STALE')
    assert.equal(f.git('rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('autopilot-status is read-only, requires authorization, and stops at the Human Gate', () => {
  const f = createCompletionFixture()
  try {
    const beforeHead = f.git('rev-parse', 'HEAD')
    const beforePlan = f.readPlan()
    const beforeStatus = f.git('status', '--porcelain')
    const result = runCli(f.root, ['autopilot-status', '9.1', '--expected-head', beforeHead])
    const output = JSON.parse(result.stdout)
    assert.equal(result.status, 3, result.stdout)
    assert.equal(output.status, 'STOP')
    assert.deepEqual(output.reasons, ['NO_AUTHORIZATION'])
    assert.equal(output.next_action.kind, 'complete_story')
    assert.equal(f.git('rev-parse', 'HEAD'), beforeHead)
    assert.equal(f.readPlan(), beforePlan)
    assert.equal(f.git('status', '--porcelain'), beforeStatus)
  } finally { f.cleanup() }

  const authorized = prepareFinalizeAutopilotFixture()
  try {
    const recorded = runCli(authorized.root, ['run', '9.1', '--expected-head', authorized.head,
      '--authorize-autopilot', JSON.stringify(autopilotInput())])
    assert.equal(recorded.status, 0, recorded.stdout)
    const head = authorized.git('rev-parse', 'HEAD')
    const status = runCli(authorized.root, ['autopilot-status', '9.1', '--expected-head', head])
    const output = JSON.parse(status.stdout)
    assert.equal(status.status, 0, status.stdout)
    assert.equal(output.status, 'CONTINUE')
    assert.equal(output.next_action.kind, 'finalize_story')
    assert.deepEqual(output.reasons, [])
    assert.equal(output.budgets_remaining.slices.used, 0)
  } finally { authorized.cleanup() }
})

test('autopilot-status reports revoked, stale, and recovery stop reasons', () => {
  const f = prepareFinalizeAutopilotFixture()
  try {
    const recorded = runCli(f.root, ['run', '9.1', '--expected-head', f.head,
      '--authorize-autopilot', JSON.stringify(autopilotInput())])
    assert.equal(recorded.status, 0, recorded.stdout)
    const authorizedHead = f.git('rev-parse', 'HEAD')
    const stale = runCli(f.root, ['autopilot-status', '9.1', '--expected-head', f.head])
    assert.equal(stale.status, 3, stale.stdout)
    assert.deepEqual(JSON.parse(stale.stdout).reasons, ['STALE'])

    const revoked = runCli(f.root, ['run', '9.1', '--expected-head', authorizedHead, '--revoke-autopilot'])
    assert.equal(revoked.status, 0, revoked.stdout)
    const revokedHead = f.git('rev-parse', 'HEAD')
    const stopped = runCli(f.root, ['autopilot-status', '9.1', '--expected-head', revokedHead])
    assert.equal(stopped.status, 3, stopped.stdout)
    assert.deepEqual(JSON.parse(stopped.stdout).reasons, ['REVOKED'])

    const lock = path.join(f.root, '.git', 'v4-autopilot-authority.lock')
    writeFileSync(lock, 'recovery\n')
    const recovery = runCli(f.root, ['autopilot-status', '9.1', '--expected-head', revokedHead])
    assert.equal(recovery.status, 3, recovery.stdout)
    assert.deepEqual(JSON.parse(recovery.stdout).reasons, ['RECOVERY_REQUIRED'])
  } finally { f.cleanup() }
})

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
