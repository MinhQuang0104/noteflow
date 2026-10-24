import { PLAN, STORY, POINTER, fixture, checkpointRequest, maintenanceExecutor, protectedKernelState } from './v4-kernel-fixture.mjs'
import { write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'
import * as kernel from './v4-action-kernel.mjs'

test('staged recovery binds authority, evidence, executor and target without rejection writes', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const executor = await maintenanceExecutor()
  try {
    for (const label of ['Plan', 'Story', 'policy', 'recipe', 'pointer', 'executor', 'evidence', 'authorization', 'cross-worktree', 'fingerprint', 'semantic coverage']) {
      const f = fixture('v2')
      try {
        const original = prepareAction(f.root, f.request)
        const failed = checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
        const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
          maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
          fresh_checks: [{ command: 'fresh checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
        const ready = executor.api.prepareStagedRecovery(f.root, input)
        assert.equal(ready.status, 'READY', JSON.stringify(ready))
        const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview }
        if (label === 'Plan') write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8') + '\nchanged\n')
        if (label === 'Story') write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8') + '\nchanged\n')
        if (label === 'policy') write(f.root, 'AGENTS.md', 'changed policy\n')
        if (label === 'recipe') write(f.root, f.request.recipe_paths[0], 'changed recipe\n')
        if (label === 'pointer') write(f.root, POINTER, JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE', changed: true }))
        if (label === 'executor') apply.executor_commit = '0'.repeat(40)
        if (label === 'evidence') apply.fresh_checks[0].exit_code = 1
        if (label === 'authorization') { delete apply.maintenance_authorization; apply.recovery_authorized = true }
        if (label === 'cross-worktree') apply.recovery_preview = { ...ready.preview, worktree: path.join(f.root, 'foreign') }
        if (label === 'fingerprint') apply.original_preview = { ...original.preview, fingerprint: 'sha256:' + '0'.repeat(64) }
        if (label === 'semantic coverage') apply.semantic_coverage = { status: 'invented' }
        const before = protectedKernelState(f, failed)
        const result = executor.api.applyStagedRecovery(f.root, apply)
        assert.ok(!['CHECKPOINTED', 'NOOP', 'RECOVERY_REQUIRED'].includes(result.status), label + ': ' + JSON.stringify(result))
        assert.deepEqual(protectedKernelState(f, failed), before, label)
      } finally { f.cleanup() }
    }
  } finally { executor.cleanup() }
})
