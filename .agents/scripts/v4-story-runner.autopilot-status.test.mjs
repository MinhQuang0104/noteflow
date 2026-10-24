import { runCli, autopilotInput, prepareFinalizeAutopilotFixture } from './v4-story-runner-fixture.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { authorizeAction } from './v4-story-runner.mjs'
import { runAction } from './v4-story-runner.mjs'

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
