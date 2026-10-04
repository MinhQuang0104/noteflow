import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  executeSliceTransaction,
  inspectActionTransaction,
  snapshotWorkingFiles,
  transactionHash,
  transactionIdentity
} from './v4-slice-transaction.mjs'
import * as transactions from './v4-slice-transaction.mjs'

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-transaction-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  write(root, 'src/implementation.txt', 'base\n')
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Fixture')
  git(root, 'config', 'user.email', 'v4-fixture@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'baseline')
  const head = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/implementation.txt', 'implemented\n')
  const descriptor = {
    action: 'implement_slice',
    story_id: '9.1',
    slice_id: 'A',
    transaction_id: 'transaction-fixture',
    expected_head: head,
    preview_fingerprint: transactionHash('transaction-preview'),
    implementation_paths: ['src/implementation.txt'],
    metadata_paths: ['meta/checkpoint.txt'],
    snapshot: snapshotWorkingFiles(root, ['src/implementation.txt']),
    buildMetadata: checkpoint => ({
      paths: ['meta/checkpoint.txt'],
      files: { 'meta/checkpoint.txt': checkpoint.checkpoint_commit + '\n' },
      checkpoint
    }),
    validateMetadata: () => {},
    validateFinal: () => {}
  }
  return { root, head, descriptor, cleanup }
}

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

function preserved(f) {
  const identity = transactionIdentity(f.root, f.descriptor)
  const file = p => existsSync(p) ? readFileSync(p).toString('base64') : null
  return {
    head: git(f.root, 'rev-parse', 'HEAD'),
    index: file(path.join(f.root, '.git/index')),
    product: file(path.join(f.root, 'src/implementation.txt')),
    metadata: file(path.join(f.root, 'meta/checkpoint.txt')),
    journal: file(identity.journalPath), lock: file(identity.lockPath)
  }
}

function stagedFixture() {
  const f = fixture()
  const failed = executeSliceTransaction(f.root, { ...f.descriptor, fail_at: 'after-stage' })
  assert.equal(failed.status, 'RECOVERY_REQUIRED')
  // Legacy journal has no canonical snapshot or checkpoint. Recovery must
  // append an audit record without rebinding this original fingerprint.
  f.failed = failed
  f.descriptor.staged_recovery_authorization = 'V4_LITE_STAGED_RECOVERY'
  return f
}

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

const recoveryDrifts = {
  'missing explicit authorization': f => { delete f.descriptor.staged_recovery_authorization; f.descriptor.recovery = true },
  'cross Story': f => { f.descriptor.story_id = '9.2' },
  'cross slice': f => { f.descriptor.slice_id = 'B' },
  'raw byte drift': f => write(f.root, 'src/implementation.txt', 'implemented\r\n'),
  'index blob drift': f => { write(f.root, 'src/implementation.txt', 'foreign\n'); git(f.root, 'add', 'src/implementation.txt'); write(f.root, 'src/implementation.txt', 'implemented\n') },
  'index mode drift': f => git(f.root, 'update-index', '--chmod=+x', 'src/implementation.txt'),
  'scope drift': f => { write(f.root, 'src/foreign.txt', 'foreign\n'); git(f.root, 'add', 'src/foreign.txt') },
  'HEAD drift': f => git(f.root, 'commit', '--allow-empty', '-qm', 'foreign checkpoint'),
  'foreign lock': f => { const lock = JSON.parse(readFileSync(f.failed.lock_path)); lock.transaction_id = 'foreign'; writeFileSync(f.failed.lock_path, JSON.stringify(lock)) },
  'journal drift': f => { const journal = JSON.parse(readFileSync(f.failed.journal_path)); journal.error = 'foreign'; writeFileSync(f.failed.journal_path, JSON.stringify(journal)) },
  'Git config drift': f => git(f.root, 'config', 'core.autocrlf', 'true'),
  'Git attribute drift': f => write(f.root, '.git/info/attributes', '* -text\n'),
  'metadata already written': f => write(f.root, 'meta/checkpoint.txt', 'foreign\n')
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
