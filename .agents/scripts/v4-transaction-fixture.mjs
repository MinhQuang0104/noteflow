import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { executeSliceTransaction, snapshotWorkingFiles, transactionHash, transactionIdentity } from './v4-slice-transaction.mjs'
import * as transactions from './v4-slice-transaction.mjs'

import { git, write } from './v4-test-helpers.mjs'

export const recoveryDrifts = {
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

export function fixture() {
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

export function preserved(f) {
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

export function stagedFixture() {
  const f = fixture()
  const failed = executeSliceTransaction(f.root, { ...f.descriptor, fail_at: 'after-stage' })
  assert.equal(failed.status, 'RECOVERY_REQUIRED')
  // Legacy journal has no canonical snapshot or checkpoint. Recovery must
  // append an audit record without rebinding this original fingerprint.
  f.failed = failed
  f.descriptor.staged_recovery_authorization = 'V4_LITE_STAGED_RECOVERY'
  return f
}
