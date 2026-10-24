import { recoveryDrifts, preserved, stagedFixture } from './v4-transaction-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import * as transactions from './v4-slice-transaction.mjs'

test('explicit staged recovery consumes the existing index and preserves original journal audit', () => {
  const f = stagedFixture()
  try {
    const before = preserved(f)
    assert.equal(typeof transactions.prepareStagedRecoveryTransaction, 'function')
    const ready = transactions.prepareStagedRecoveryTransaction(f.root, f.descriptor)
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    assert.deepEqual(preserved(f), before, 'prepare is strictly read-only')
    const result = transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview)
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.deepEqual(result.next_action, { kind: 'verify_slice', target: 'A' })
    const journal = JSON.parse(readFileSync(f.failed.journal_path, 'utf8'))
    assert.equal(journal.preview_fingerprint, f.descriptor.preview_fingerprint)
    assert.equal(journal.staged_recovery.original_journal_base64, before.journal)
    assert.equal(journal.staged_recovery.original_lock_base64, before.lock)
    assert.deepEqual(readFileSync(path.join(f.root, 'src/implementation.txt')).toString('base64'), before.product)
    const complete = preserved(f)
    assert.equal(transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview).status, 'NOOP')
    assert.deepEqual(preserved(f), complete)
  } finally { f.cleanup() }
})

for (const [label, mutate] of Object.entries(recoveryDrifts)) test('staged recovery rejects and preserves all state on ' + label, () => {
  const f = stagedFixture()
  try {
    assert.equal(typeof transactions.prepareStagedRecoveryTransaction, 'function')
    const ready = transactions.prepareStagedRecoveryTransaction(f.root, f.descriptor)
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    mutate(f)
    const before = preserved(f)
    const result = transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview)
    assert.ok(!['CHECKPOINTED', 'NOOP', 'RECOVERY_REQUIRED'].includes(result.status), JSON.stringify(result))
    assert.deepEqual(preserved(f), before)
  } finally { f.cleanup() }
})
