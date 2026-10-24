import { VERIFICATION_RECEIPT, fixture, legacyMetadataFailure } from './v4-verification-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { inspectActionTransaction } from './v4-slice-transaction.mjs'

test('Runner retires only the unwritten legacy transaction and preserves its journal and lock evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview }).status, 'BLOCKED')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'ABORTED', JSON.stringify(result))
    assert.equal(readFileSync(result.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(result.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(existsSync(legacy.identity.lockPath), false)
    assert.equal(inspectActionTransaction(f.root, legacy.request.transaction_id).status, 'ABORTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true }).status, 'NOOP')
  } finally { f.cleanup() }
})

for (const fault of ['wrong-checkpoint', 'foreign-lock', 'dirty-product', 'dirty-metadata', 'staged-work', 'non-idle']) {
  test(`unwritten retirement rejects ${fault} without changing recovery evidence`, () => {
    const f = fixture('HIGH')
    try {
      const legacy = legacyMetadataFailure(f)
      if (fault === 'wrong-checkpoint') legacy.request.recovery_checkpoint = 'f'.repeat(40)
      if (fault === 'foreign-lock') writeFileSync(legacy.identity.lockPath, legacy.lockBytes.replace('legacy-prewrite', 'foreign-owner'))
      if (fault === 'dirty-product') write(f.root, 'src/base.txt', 'user work\n')
      if (fault === 'dirty-metadata') write(f.root, VERIFICATION_RECEIPT, '{}\n')
      if (fault === 'staged-work') { write(f.root, 'user.txt', 'staged\n'); git(f.root, 'add', 'user.txt') }
      if (fault === 'non-idle') write(f.root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'other', storyId: '9.2' }))
      const lockBefore = readFileSync(legacy.identity.lockPath, 'utf8')
      const statusBefore = git(f.root, 'status', '--porcelain')
      const result = legacy.run('prepare-recovery-abort')
      assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
      assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
      assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), lockBefore)
      assert.equal(git(f.root, 'status', '--porcelain'), statusBefore)
    } finally { f.cleanup() }
  })
}

test('retirement binds maintenance changes and rejects a stale preview', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const maintenance = '.agents/scripts/v4-repair.mjs'
    write(f.root, maintenance, '// authorized tooling repair\n')
    legacy.request.maintenance_paths = [maintenance]
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(f.root, maintenance, '// changed after preview\n')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), legacy.lockBytes)
  } finally { f.cleanup() }
})

test('retirement resumes interrupted owned-lock archival without replacing evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const input = { preview: prepared.preview, recovery_authorized: true }
    const first = legacy.run('abort-unwritten-metadata', { ...input, fail_at: 'AFTER_ABORT_JOURNAL' })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.ok(existsSync(legacy.identity.lockPath))
    const recovered = legacy.run('abort-unwritten-metadata', input)
    assert.equal(recovered.status, 'ABORTED', JSON.stringify(recovered))
    assert.equal(readFileSync(recovered.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(recovered.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})
