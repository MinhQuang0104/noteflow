import { PLAN, RECEIPT, fixture, checkpointRequest, maintenanceExecutor, protectedKernelState } from './v4-kernel-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'
import * as kernel from './v4-action-kernel.mjs'

test('separate committed executor repairs a legacy staged checkpoint only through explicit bounded Runner recovery', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const f = fixture('v2'), executor = await maintenanceExecutor()
  try {
    git(f.root, 'config', 'core.autocrlf', 'true')
    write(f.root, 'src/feature.txt', 'implemented\r\n')
    const original = prepareAction(f.root, f.request)
    // An actual legacy preview binds raw bytes only; reproduce the old
    // EOL mismatch before the journal ever records a checkpoint.
    for (const snapshot of Object.values(original.preview.snapshot)) { delete snapshot.git_blob; delete snapshot.git_context }
    delete original.preview.fingerprint
    original.preview.fingerprint = kernel.actionFingerprint(original.preview)
    const failed = checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED')
    assert.ok(failed.reasons.includes('STAGED_CONTENT_MISMATCH:src/feature.txt'))
    const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
      maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
      fresh_checks: [{ command: 'fresh focused fixture checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
    const before = protectedKernelState(f, failed)
    const ready = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: input.operation, input })
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    assert.deepEqual(protectedKernelState(f, failed), before)
    const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview }
    const result = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: apply.operation, input: apply })
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(result.next_action, { kind: 'verify_slice', target: 'A' })
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.lifecycle_snapshot, 'in-progress')
    assert.equal(plan.human_approval, undefined)
    assert.equal(plan.finalization, undefined)
    assert.equal(JSON.parse(readFileSync(path.join(f.root, RECEIPT))).commands.at(-1).command, 'fresh focused fixture checks')
    assert.equal(executor.runner.runV4Story(f.root, '9.1', { expectedHead: result.metadata_commit, operation: apply.operation, input: apply }).status, 'NOOP')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
  } finally { f.cleanup(); executor.cleanup() }
})

test('commit-1 failure preserves journal and explicit recovery finishes without replay', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { fail_at: 'after-commit1' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), failed.checkpoint_commit)
    assert.ok(existsSync(failed.lock_path))
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'BLOCKED')
    const recovered = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit
    }))
    assert.equal(recovered.status, 'CHECKPOINTED', JSON.stringify(recovered))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    const noop = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit
    }))
    assert.equal(noop.status, 'NOOP', JSON.stringify(noop))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
  } finally { f.cleanup() }
})

test('metadata write failure preserves the partial Plan and requires recovery', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { fail_at: 'after-write' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.ok(existsSync(failed.lock_path))
    assert.ok(existsSync(failed.journal_path))
    assert.ok(git(f.root, 'status', '--porcelain').includes(PLAN))
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'BLOCKED')
  } finally { f.cleanup() }
})
