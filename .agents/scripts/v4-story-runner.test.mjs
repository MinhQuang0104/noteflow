import { RUNNER, runCli, PLAN, autopilotInput, prepareFinalizeAutopilotFixture } from './v4-story-runner-fixture.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { autopilotStatus } from './v4-story-runner.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'

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
    assert.equal(output.recovery.lock_path, path.join(f.root, '.git', 'v4-autopilot-authority-9.1.lock'))
    assert.equal(output.recovery.plan_path, path.join(f.root, PLAN))
    assert.equal(output.recovery.index_path, path.join(f.root, '.git', 'index'))
    assert.equal(readFileSync(output.recovery.lock_path, 'utf8').includes(f.head), true)
    assert.equal(f.git('rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('authorization locks fence only their Story while legacy locks stop every Story', () => {
  const f = prepareFinalizeAutopilotFixture()
  try {
    const recorded = runCli(f.root, ['run', '9.1', '--expected-head', f.head,
      '--authorize-autopilot', JSON.stringify(autopilotInput())])
    assert.equal(recorded.status, 0, recorded.stdout)
    const head = f.git('rev-parse', 'HEAD')
    const otherLock = path.join(f.root, '.git', 'v4-autopilot-authority-9.2.lock')
    writeFileSync(otherLock, 'other Story authorization\n')
    assert.equal(autopilotStatus(f.root, '9.1', head, 1).status, 'CONTINUE')
    const ownLock = path.join(f.root, '.git', 'v4-autopilot-authority-9.1.lock')
    writeFileSync(ownLock, 'this Story authorization\n')
    assert.deepEqual(autopilotStatus(f.root, '9.1', head, 1).reasons, ['RECOVERY_REQUIRED'])
    const conflict = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', head,
      '--revoke-autopilot']).stdout)
    assert.equal(conflict.recovery.lock_path, ownLock)
    assert.equal(readFileSync(ownLock, 'utf8'), 'this Story authorization\n')
    rmSync(ownLock)
    writeFileSync(path.join(f.root, '.git', 'v4-autopilot-authority.lock'), 'legacy recovery\n')
    assert.deepEqual(autopilotStatus(f.root, '9.1', head, 1).reasons, ['RECOVERY_REQUIRED'])
    assert.equal(readFileSync(otherLock, 'utf8'), 'other Story authorization\n')
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
