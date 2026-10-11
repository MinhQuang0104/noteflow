import { recoveryDrifts, fixture, preserved, stagedFixture } from './v4-transaction-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { executeSliceTransaction, inspectActionTransaction, snapshotWorkingFiles, transactionIdentity } from './v4-slice-transaction.mjs'
import * as transactions from './v4-slice-transaction.mjs'

test('transaction stages and commits exact implementation and metadata scopes', () => {
  const f = fixture()
  try {
    const result = executeSliceTransaction(f.root, f.descriptor)
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.checkpoint_commit).split(/\r?\n/), ['src/implementation.txt'])
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/), ['meta/checkpoint.txt'])
    assert.equal(inspectActionTransaction(f.root, f.descriptor.transaction_id).status, 'COMPLETE')
  } finally { f.cleanup() }
})
test('failure before metadata commit preserves exact partial state and explicit recovery finishes it', () => {
  const f = fixture()
  try {
    const failed = executeSliceTransaction(f.root, { ...f.descriptor, fail_at: 'before-commit2' })
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '2')
    assert.ok(failed.checkpoint_commit)
    assert.ok(existsSync(failed.lock_path))
    const recovered = executeSliceTransaction(f.root, {
      ...f.descriptor,
      recovery: true,
      recovery_checkpoint: failed.checkpoint_commit
    })
    assert.equal(recovered.status, 'CHECKPOINTED', JSON.stringify(recovered))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.equal(executeSliceTransaction(f.root, {
      ...f.descriptor,
      recovery: true,
      recovery_checkpoint: failed.checkpoint_commit
    }).status, 'NOOP')
  } finally { f.cleanup() }
})

test('failure after stage leaves the index and lock for inspection', () => {
  const f = fixture()
  try {
    const failed = executeSliceTransaction(f.root, { ...f.descriptor, fail_at: 'after-stage' })
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.ok(git(f.root, 'diff', '--cached', '--name-only').includes('src/implementation.txt'))
    assert.ok(existsSync(failed.lock_path))
    const inspected = inspectActionTransaction(f.root, f.descriptor.transaction_id)
    assert.equal(inspected.status, 'RECOVERY_REQUIRED')
    assert.equal(inspected.checkpoint_commit, null)
  } finally { f.cleanup() }
})

test('a pre-commit hook that adds scope is detected after commit instead of being trusted', () => {
  const f = fixture()
  try {
    write(f.root, '.git/hooks/pre-commit', '#!/bin/sh\nif git diff --cached --name-only | grep -q "^meta/checkpoint.txt$"; then printf hook > hook.txt; git add -- hook.txt; fi\n')
    const result = executeSliceTransaction(f.root, f.descriptor)
    assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
    assert.ok(result.reasons.some(reason => reason.includes('COMMIT_SCOPE_MISMATCH')))
    assert.ok(existsSync(result.lock_path))
  } finally { f.cleanup() }
})

test('transaction identity is per repository/worktree/action/slice scope', () => {
  const f = fixture()
  try {
    const identity = transactionIdentity(f.root, f.descriptor)
    assert.equal(identity.worktree, path.resolve(f.root))
    assert.equal(identity.scopeKey.length, 64)
    assert.match(identity.lockPath, /noteflow-v4-transactions/)
    assert.equal(identity.repository, path.resolve(f.root, '.git'))
  } finally { f.cleanup() }
})

test('Git canonical CRLF blob identity does not reject legitimate exact staging', () => {
  const f = fixture()
  try {
    git(f.root, 'config', 'core.autocrlf', 'true')
    write(f.root, 'src/implementation.txt', 'implemented\r\n')
    f.descriptor.snapshot = snapshotWorkingFiles(f.root, f.descriptor.implementation_paths)
    const result = executeSliceTransaction(f.root, f.descriptor)
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.equal(readFileSync(path.join(f.root, 'src/implementation.txt'), 'utf8'), 'implemented\r\n')
    assert.equal(git(f.root, 'show', result.checkpoint_commit + ':src/implementation.txt'), 'implemented')
  } finally { f.cleanup() }
})

for (const [label, attributes, autocrlf, content] of [
  ['LF', '', 'false', 'implemented\n'],
  ['mixed EOL', '* text eol=lf\n', 'false', 'implemented\r\nsecond\n'],
  ['binary', '* -text\n', 'true', Buffer.from([0, 13, 10, 255])],
  ['explicit CRLF checkout', '* text eol=crlf\n', 'false', 'implemented\r\n']
]) test('canonical staging supports ' + label + ' without rewriting working bytes', () => {
  const f = fixture()
  try {
    if (attributes) {
      write(f.root, '.gitattributes', attributes)
      git(f.root, 'add', '.gitattributes')
      git(f.root, 'commit', '-qm', 'fixture attributes')
    }
    git(f.root, 'config', 'core.autocrlf', autocrlf)
    write(f.root, 'src/implementation.txt', content)
    f.descriptor.expected_head = git(f.root, 'rev-parse', 'HEAD')
    f.descriptor.snapshot = snapshotWorkingFiles(f.root, f.descriptor.implementation_paths)
    const before = readFileSync(path.join(f.root, 'src/implementation.txt'))
    assert.equal(executeSliceTransaction(f.root, f.descriptor).status, 'CHECKPOINTED')
    assert.deepEqual(readFileSync(path.join(f.root, 'src/implementation.txt')), before)
  } finally { f.cleanup() }
})

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

for (const phase of ['BEFORE_COMMIT1', 'AFTER_COMMIT1_BEFORE_JOURNAL', 'AFTER_COMMIT1', 'AFTER_WRITE', 'AFTER_METADATA_STAGE', 'AFTER_COMMIT2_BEFORE_JOURNAL', 'AFTER_COMMIT2_HOOK', 'AFTER_COMPLETE_BEFORE_RELEASE']) {
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

test('external clean filters fail closed without executing the configured command', () => {
  const f = fixture()
  try {
    write(f.root, '.git/info/attributes', '* filter=external\n')
    git(f.root, 'config', 'filter.external.clean', 'touch FILTER_EXECUTED')
    assert.throws(() => snapshotWorkingFiles(f.root, f.descriptor.implementation_paths), /UNSUPPORTED_GIT_TRANSFORM/)
    assert.equal(existsSync(path.join(f.root, 'FILTER_EXECUTED')), false)
  } finally { f.cleanup() }
})

test('metadata-only external filter rejects staged recovery before any mutation', () => {
  const f = stagedFixture()
  try {
    write(f.root, '.git/info/attributes', 'meta/* filter=external\n')
    git(f.root, 'config', 'filter.external.clean', 'touch FILTER_EXECUTED')
    for (const snapshot of Object.values(f.descriptor.snapshot)) { delete snapshot.git_context; delete snapshot.git_blob }
    const before = preserved(f)
    const ready = transactions.prepareStagedRecoveryTransaction(f.root, f.descriptor)
    assert.equal(ready.status, 'BLOCKED', JSON.stringify(ready))
    assert.ok(ready.reasons.includes('UNSUPPORTED_GIT_TRANSFORM'))
    assert.deepEqual(preserved(f), before)
    assert.equal(existsSync(path.join(f.root, 'FILTER_EXECUTED')), false)
  } finally { f.cleanup() }
})

test('raw byte freshness still rejects changed EOL even when canonical blobs are equal', () => {
  const f = fixture()
  try {
    git(f.root, 'config', 'core.autocrlf', 'true')
    f.descriptor.snapshot = snapshotWorkingFiles(f.root, f.descriptor.implementation_paths)
    const blob = git(f.root, 'hash-object', '--path=src/implementation.txt', 'src/implementation.txt')
    write(f.root, 'src/implementation.txt', 'implemented\r\n')
    assert.equal(git(f.root, 'hash-object', '--path=src/implementation.txt', 'src/implementation.txt'), blob)
    const result = executeSliceTransaction(f.root, f.descriptor)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('STALE_WORKTREE_PREVIEW'))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'diff', '--cached', '--name-only'), '')
  } finally { f.cleanup() }
})

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
