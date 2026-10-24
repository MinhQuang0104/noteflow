import { RECEIPT, fixture, agyWorker, agyFixture, checkpointRequest } from './v4-kernel-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'

test('AGY prepare and checkpoint bind worker evidence and the scope gate', () => {
  const f = agyFixture()
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(prepared.preview.worker.executor, 'agy')
    assert.equal(prepared.preview.scope_gate.status, 'PASS')
    assert.deepEqual(prepared.preview.scope_gate.allowed, ['src/'])
    assert.deepEqual(prepared.preview.scope_gate.changed, ['src/feature.txt'])
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPT), 'utf8'))
    assert.deepEqual(receipt.worker, { ...agyWorker(), scope_gate: prepared.preview.scope_gate })
  } finally { f.cleanup() }
})

test('AGY worker evidence is required, forbidden for lead, and shape-validated', () => {
  const missing = agyFixture()
  try {
    const request = { ...missing.request }
    delete request.worker
    const result = prepareAction(missing.root, request)
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_REQUIRED'))
  } finally { missing.cleanup() }

  const forbidden = fixture('v2')
  try {
    const result = prepareAction(forbidden.root, { ...forbidden.request, worker: agyWorker() })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_FORBIDDEN'))
  } finally { forbidden.cleanup() }

  const invalid = agyFixture()
  try {
    const result = prepareAction(invalid.root, { ...invalid.request, worker: { ...agyWorker(), orca: { ...agyWorker().orca, dispatch_ids: [] } } })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_INVALID'))
  } finally { invalid.cleanup() }
})

test('AGY scope gate blocks out-of-scope files, worker commits, and deletions', () => {
  const outside = agyFixture()
  try {
    write(outside.root, 'docs/outside.txt', 'outside\n')
    const result = prepareAction(outside.root, outside.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
    assert.ok(result.scope_gate.violations.some(item => item.path === 'docs/outside.txt'))
  } finally { outside.cleanup() }

  const committed = agyFixture()
  try {
    git(committed.root, 'add', 'src/feature.txt')
    git(committed.root, 'commit', '-qm', 'worker commit')
    const result = prepareAction(committed.root, committed.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
  } finally { committed.cleanup() }

  const deleted = agyFixture()
  try {
    deleted.request.owned_paths = ['src/base.txt', 'src/feature.txt']
    rmSync(path.join(deleted.root, 'src/feature.txt'))
    rmSync(path.join(deleted.root, 'src/base.txt'))
    const result = prepareAction(deleted.root, deleted.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_DELETE_UNSUPPORTED'))
  } finally { deleted.cleanup() }
})

test('AGY scope gate re-check becomes stale when the tree changes after prepare', () => {
  const f = agyFixture()
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(f.root, 'docs/outside.txt', 'outside after prepare\n')
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_CHANGED'))
  } finally { f.cleanup() }
})

test('AGY metadata cannot change the execution contract during checkpoint', () => {
  const f = agyFixture()
  try {
    const altered = f.request.plan_template.replace('    executor: agy\n', '')
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'))
  } finally { f.cleanup() }
})
