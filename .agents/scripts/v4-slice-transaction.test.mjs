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
