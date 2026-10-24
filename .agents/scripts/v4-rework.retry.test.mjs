import { PLAN, NEW_IMPLEMENTATION_RECEIPT, git, fixture, applyRequest, state } from './v4-rework-fixture.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { prepareRework } from './v4-action-kernel.mjs'
import { runV4Story } from './v4-story-runner.mjs'

test('rework cannot approve or move to E and interruption retry does not duplicate metadata commits', () => {
  const fake = fixture()
  try {
    const approvalTemplate = fake.request.plan_template.replace('next_action:', 'human_approval:\n  decision: APPROVED\nnext_action:')
    const result = prepareRework(fake.root, { ...fake.request, plan_template: approvalTemplate })
    assert.notEqual(result.status, 'READY', JSON.stringify(result))
    assert.equal(state(fake).head, fake.head)
  } finally { fake.cleanup() }

  const f = fixture()
  try {
    const prepared = prepareRework(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = applyRequest(f, prepared.preview, { fail_at: 'after-commit-hook' })
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    const headAfterFailure = git(f.root, 'rev-parse', 'HEAD')
    const countAfterFailure = git(f.root, 'rev-list', '--count', 'HEAD')
    assert.notEqual(headAfterFailure, f.head)
    assert.equal(existsSync(failed.lock_path), true)
    const retried = applyRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: prepared.preview.expected_head
    })
    assert.equal(retried.status, 'NOOP', JSON.stringify(retried))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), headAfterFailure)
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), countAfterFailure)
    assert.equal(existsSync(failed.lock_path), false)
  } finally { f.cleanup() }
})

test('Runner accepts rework only as an explicit maintenance action and stops before implementation', () => {
  const f = fixture()
  try {
    const prepared = runV4Story(f.root, '9.1', {
      expectedHead: f.head,
      operation: 'prepare-rework',
      input: f.request
    })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const applied = runV4Story(f.root, '9.1', {
      expectedHead: f.head,
      operation: 'apply-rework',
      input: { ...f.request, operation: 'apply-rework', preview: prepared.preview }
    })
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    assert.deepEqual(applied.next_action, { kind: 'implement_slice', target: 'D' })
    assert.equal(git(f.root, 'diff', '--name-only', `${f.head}..HEAD`), PLAN)
    assert.equal(existsSync(path.join(f.root, NEW_IMPLEMENTATION_RECEIPT)), false)
  } finally { f.cleanup() }
})
