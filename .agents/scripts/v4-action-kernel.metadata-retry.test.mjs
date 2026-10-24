import { PLAN, RECEIPT, fixture, checkpointRequest, maintenanceExecutor, protectedKernelState } from './v4-kernel-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'
import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'
import * as kernel from './v4-action-kernel.mjs'

for (const interruption of ['AFTER_WRITE', 'AFTER_FIRST_METADATA_WRITE']) test('bounded Runner retries its own partial metadata ' + interruption + ', rejects foreign metadata and never duplicates commits', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const f = fixture('v2'), executor = await maintenanceExecutor()
  try {
    const original = prepareAction(f.root, f.request)
    checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
    const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
      maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
      fresh_checks: [{ command: 'fresh checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
    const ready = executor.api.prepareStagedRecovery(f.root, input)
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview, fail_at: interruption }
    const interrupted = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: apply.operation, input: apply })
    assert.equal(interrupted.status, 'RECOVERY_REQUIRED', JSON.stringify(interrupted))
    const currentHead = git(f.root, 'rev-parse', 'HEAD')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '2')
    if (interruption === 'AFTER_FIRST_METADATA_WRITE') {
      assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).next_action.kind, 'implement_slice', 'new receipt is written before Plan')
      assert.equal(existsSync(path.join(f.root, RECEIPT)), true)
    }
    const intended = readFileSync(path.join(f.root, PLAN))
    write(f.root, PLAN, 'foreign Plan\n')
    const before = protectedKernelState(f, interrupted)
    delete apply.fail_at
    const rejected = executor.runner.runV4Story(f.root, '9.1', { expectedHead: currentHead, operation: apply.operation, input: apply })
    assert.ok(!['CHECKPOINTED', 'NOOP', 'RECOVERY_REQUIRED'].includes(rejected.status), JSON.stringify(rejected))
    assert.deepEqual(protectedKernelState(f, interrupted), before)
    write(f.root, PLAN, intended)
    const resumed = executor.runner.runV4Story(f.root, '9.1', { expectedHead: currentHead, operation: apply.operation, input: apply })
    assert.equal(resumed.status, 'CHECKPOINTED', JSON.stringify(resumed))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.equal(executor.runner.runV4Story(f.root, '9.1', { expectedHead: resumed.metadata_commit, operation: apply.operation, input: apply }).status, 'NOOP')
  } finally { f.cleanup(); executor.cleanup() }
})
