import { preserved, stagedFixture } from './v4-transaction-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import * as transactions from './v4-slice-transaction.mjs'

for (const phase of ['AFTER_METADATA_STAGE', 'AFTER_COMMIT2_BEFORE_JOURNAL', 'AFTER_COMMIT2_HOOK', 'AFTER_COMPLETE_BEFORE_RELEASE']) {
  test('staged recovery retry is idempotent after interruption ' + phase, () => {
    const f = stagedFixture()
    try {
      assert.equal(typeof transactions.prepareStagedRecoveryTransaction, 'function')
      const ready = transactions.prepareStagedRecoveryTransaction(f.root, f.descriptor)
      assert.equal(ready.status, 'READY', JSON.stringify(ready))
      const interrupted = transactions.executeStagedRecoveryTransaction(f.root, { ...f.descriptor, fail_at: phase }, ready.preview)
      assert.equal(interrupted.status, 'RECOVERY_REQUIRED', JSON.stringify(interrupted))
      const result = transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview)
      assert.equal(result.status, phase === 'AFTER_COMPLETE_BEFORE_RELEASE' ? 'NOOP' : 'CHECKPOINTED', JSON.stringify(result))
      assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3', 'never duplicate either durable commit')
      assert.equal(transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview).status, 'NOOP')
    } finally { f.cleanup() }
  })
}

test('interrupted recovery rejects metadata index mode drift without restaging user state', () => {
  const f = stagedFixture()
  try {
    const ready = transactions.prepareStagedRecoveryTransaction(f.root, f.descriptor)
    const interrupted = transactions.executeStagedRecoveryTransaction(f.root, { ...f.descriptor, fail_at: 'AFTER_METADATA_STAGE' }, ready.preview)
    assert.equal(interrupted.status, 'RECOVERY_REQUIRED', JSON.stringify(interrupted))
    git(f.root, 'update-index', '--chmod=+x', 'meta/checkpoint.txt')
    const before = preserved(f)
    const result = transactions.executeStagedRecoveryTransaction(f.root, f.descriptor, ready.preview)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(preserved(f), before)
  } finally { f.cleanup() }
})
