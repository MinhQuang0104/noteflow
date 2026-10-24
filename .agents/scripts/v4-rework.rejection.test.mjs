import { write, fixture, applyRequest, state } from './v4-rework-fixture.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { prepareRework } from './v4-action-kernel.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'

test('rework rejects cross identity, stale fingerprint, dirty scope, and foreign lock without mutation', () => {
  for (const mutate of [
    request => ({ ...request, story_id: '9.2' }),
    request => ({ ...request, slice_id: 'E' }),
    request => ({ ...request, plan_template: request.plan_template.replace('  target: D\n---', '  target: E\n---') })
  ]) {
    const f = fixture()
    try {
      const before = state(f)
      const result = prepareRework(f.root, mutate(f.request))
      assert.notEqual(result.status, 'READY', JSON.stringify(result))
      assert.deepEqual(state(f), before)
    } finally { f.cleanup() }
  }

  const stale = fixture()
  try {
    const prepared = prepareRework(stale.root, stale.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const before = state(stale)
    const result = applyRequest(stale, { ...prepared.preview, fingerprint: `sha256:${'0'.repeat(64)}` })
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.deepEqual(state(stale), before)
  } finally { stale.cleanup() }

  const dirty = fixture()
  try {
    const prepared = prepareRework(dirty.root, dirty.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(dirty.root, 'unrelated.txt', 'do not touch\n')
    const before = state(dirty)
    const result = applyRequest(dirty, prepared.preview)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('DIRTY_SCOPE_MISMATCH'), JSON.stringify(result))
    assert.deepEqual(state(dirty), before)
  } finally { dirty.cleanup() }

  const locked = fixture()
  try {
    const prepared = prepareRework(locked.root, locked.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const identity = transactionIdentity(locked.root, {
      action: 'rework_slice', story_id: '9.1', slice_id: 'D', transaction_id: prepared.preview.transaction_id
    })
    mkdirSync(path.dirname(identity.lockPath), { recursive: true })
    writeFileSync(identity.lockPath, JSON.stringify({ transaction_id: 'foreign', scope_key: identity.scopeKey }) + '\n')
    const before = state(locked)
    const result = applyRequest(locked, prepared.preview)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('TRANSACTION_SCOPE_LOCKED'), JSON.stringify(result))
    assert.deepEqual(state(locked), before)
  } finally { locked.cleanup() }
})
