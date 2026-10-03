// Explicit retirement of an unwritten verification transaction. This never
// rebuilds evidence, rebinds a fingerprint, or modifies Story/worktree files.
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { canonicalPaths, safeRelative, snapshotWorkingFiles, transactionHash, transactionIdentity, worktreeInventory } from './v4-slice-transaction.mjs'

const fail = reason => { throw new Error(reason) }
const result = (status, reasons = [], extra = {}) => ({ status, valid: true, ready: status === 'READY', reasons, ...extra })
const fingerprint = value => transactionHash(JSON.stringify(value))
const bytes = file => {
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) fail('RECOVERY_FILE_UNSAFE')
  return readFileSync(file)
}
function git(root, args) {
  const out = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (out.error || out.status !== 0) fail('RECOVERY_GIT_ERROR')
  return out.stdout.trim()
}
function idlePointer(root) {
  const canonical = /^worktree (.+)$/m.exec(git(root, ['worktree', 'list', '--porcelain']))?.[1]
  if (!canonical) fail('CANONICAL_WORKTREE_UNAVAILABLE')
  const raw = bytes(path.join(canonical, '.agent-state/active-run.json'))
  const pointer = JSON.parse(raw)
  if (pointer.schemaVersion !== 1 || pointer.status !== 'IDLE' || pointer.activeRunId !== null || pointer.storyId !== null) fail('V3_POINTER_NOT_IDLE')
  return transactionHash(raw)
}
function identityFor(root, request) {
  if (request.action !== 'verify_slice' || !/^\d+\.\d+$/.test(request.story_id ?? '') || !/^[A-Za-z0-9_-]+$/.test(request.slice_id ?? '')) fail('RECOVERY_IDENTITY_INVALID')
  if (!/^[0-9a-f]{40,64}$/.test(request.recovery_checkpoint ?? '')) fail('RECOVERY_CHECKPOINT_REQUIRED')
  return transactionIdentity(root, request)
}
function allowedMaintenance(relative) {
  return safeRelative(relative) === relative && (
    /^\.agents\/scripts\/v4-[A-Za-z0-9.-]+\.mjs$/.test(relative) ||
    relative === '.agents/skills/v4-story-runner/references/recovery.md' ||
    /^docs\/superpowers\/plans\/[A-Za-z0-9.-]+\.md$/.test(relative)
  )
}
function inspect(root, request) {
  const identity = identityFor(root, request)
  const pointerDigest = idlePointer(root)
  const journalBytes = bytes(identity.journalPath)
  const journal = JSON.parse(journalBytes)
  const lockBytes = bytes(identity.lockPath)
  const lock = JSON.parse(lockBytes)
  if (journal.repository !== identity.repository || journal.worktree !== identity.worktree ||
      journal.transaction_id !== request.transaction_id || journal.action !== request.action ||
      journal.story_id !== request.story_id || journal.slice_id !== request.slice_id ||
      journal.scope_key !== identity.scopeKey || journal.lock_path !== identity.lockPath ||
      journal.journal_path !== identity.journalPath) fail('RECOVERY_IDENTITY_MISMATCH')
  if (JSON.stringify(lock) !== JSON.stringify(journal.lock_identity) || lock.transaction_id !== request.transaction_id ||
      lock.scope_key !== identity.scopeKey || lock.repository !== identity.repository || lock.worktree !== identity.worktree) fail('RECOVERY_LOCK_MISMATCH')
  if (journal.phase !== 'RECOVERY_REQUIRED' || journal.error !== 'SUCCESSOR_PROJECTION_MISMATCH' ||
      journal.metadata_commit || journal.metadata_hashes || journal.staged_paths?.length ||
      journal.implementation_paths?.length !== 0 ||
      journal.resume_phase && !['LOCK_ACQUIRED', 'METADATA_PREPARED'].includes(journal.resume_phase) ||
      !journal.initial_inventory || Object.values(journal.initial_inventory).some(items => !Array.isArray(items) || items.length)) fail('UNWRITTEN_METADATA_REQUIRED')
  const checkpoint = request.recovery_checkpoint
  if (journal.expected_head !== checkpoint || journal.checkpoint_commit !== checkpoint || git(root, ['rev-parse', 'HEAD']) !== checkpoint) fail('RECOVERY_CHECKPOINT_MISMATCH')
  const storyKey = request.story_id.replaceAll('.', '-')
  const metadata = canonicalPaths(journal.metadata_paths)
  const expected = [
    `_bmad-output/implementation-artifacts/story-${storyKey}-plan.md`,
    `_bmad-output/implementation-artifacts/receipts/story-${storyKey}/${request.slice_id}-verification.json`,
    `_bmad-output/implementation-artifacts/receipts/story-${storyKey}/${request.slice_id}-review.json`
  ]
  if (metadata.length < 2 || metadata.some(item => !expected.includes(item)) || !metadata.includes(expected[0]) || !metadata.includes(expected[1])) fail('RECOVERY_METADATA_SCOPE_MISMATCH')
  const maintenance = canonicalPaths(request.maintenance_paths ?? [])
  if (maintenance.some(relative => !allowedMaintenance(relative))) fail('RECOVERY_MAINTENANCE_SCOPE_INVALID')
  const inventory = worktreeInventory(root)
  if (inventory.staged.length) fail('DIRTY_INDEX')
  if (canonicalPaths([...inventory.unstaged, ...inventory.untracked]).some(relative => !maintenance.includes(relative))) fail('RECOVERY_DIRTY_SCOPE_MISMATCH')
  // Verify metadata directly as well, including paths hidden by index flags.
  for (const relative of metadata) {
    const tree = git(root, ['ls-tree', checkpoint, '--', relative])
    const file = path.join(root, relative)
    if (!tree) { if (existsSync(file)) fail('RECOVERY_METADATA_CHANGED'); continue }
    bytes(file)
    const blob = tree.split(/\s+/)[2]
    if (git(root, ['hash-object', `--path=${relative}`, '--', relative]) !== blob) fail('RECOVERY_METADATA_CHANGED')
  }
  const preview = {
    schema_version: 1, action: request.action, story_id: request.story_id, slice_id: request.slice_id,
    transaction_id: request.transaction_id, checkpoint_commit: checkpoint,
    repository: identity.repository, worktree: identity.worktree,
    journal_digest: transactionHash(journalBytes), lock_digest: transactionHash(lockBytes), pointer_digest: pointerDigest,
    original_preview_fingerprint: journal.preview_fingerprint, metadata_paths: metadata,
    maintenance_paths: maintenance, maintenance_snapshot: snapshotWorkingFiles(root, maintenance),
    metadata_snapshot: snapshotWorkingFiles(root, metadata)
  }
  return { identity, journal, journalBytes, lockBytes, preview: { ...preview, fingerprint: fingerprint(preview) } }
}
export function prepareMetadataAbort(root, request = {}) {
  try { return result('READY', [], { preview: inspect(root, request).preview }) }
  catch (error) { return result('BLOCKED', [error.message]) }
}
function preserve(file, content) {
  if (existsSync(file)) {
    if (!bytes(file).equals(content)) fail('RECOVERY_ARCHIVE_COLLISION')
  } else writeFileSync(file, content, { flag: 'wx' })
}
function atomicJournal(file, journal) {
  const temporary = `${file}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' })
  renameSync(temporary, file)
}
export function applyMetadataAbort(root, request = {}) {
  let terminalWritten = false
  try {
    if (request.recovery_authorized !== true) return result('BLOCKED', ['RECOVERY_AUTHORIZATION_REQUIRED'])
    const preview = request.preview
    if (!preview || preview.fingerprint !== fingerprint(Object.fromEntries(Object.entries(preview).filter(([key]) => key !== 'fingerprint')))) return result('STALE', ['RECOVERY_PREVIEW_INVALID'])
    const identity = identityFor(root, request)
    if (preview.transaction_id !== request.transaction_id || preview.checkpoint_commit !== request.recovery_checkpoint ||
        preview.action !== request.action || preview.story_id !== request.story_id || preview.slice_id !== request.slice_id ||
        preview.repository !== identity.repository || preview.worktree !== identity.worktree) return result('STALE', ['RECOVERY_PREVIEW_MISMATCH'])
    idlePointer(root)
    const archive = path.join(identity.transactionRoot, `retired-${request.transaction_id}`)
    const archiveJournal = path.join(archive, 'journal.json')
    const archiveLock = path.join(archive, 'scope.lock')
    const output = { transaction_id: request.transaction_id, checkpoint_commit: request.recovery_checkpoint,
      archive_journal_path: archiveJournal, archive_lock_path: archiveLock, durable_action_count: 0,
      stop_condition: 'FRESH_VERIFICATION_REQUIRED' }
    const current = JSON.parse(bytes(identity.journalPath))
    if (current.phase === 'ABORTED' && current.recovery_abort?.preview_fingerprint === preview.fingerprint) {
      terminalWritten = true
      if (transactionHash(bytes(archiveJournal)) !== preview.journal_digest) fail('RECOVERY_ARCHIVE_MISMATCH')
      if (existsSync(archiveLock)) {
        if (transactionHash(bytes(archiveLock)) !== preview.lock_digest) fail('RECOVERY_ARCHIVE_MISMATCH')
        return result('NOOP', [], output)
      }
      if (git(root, ['rev-parse', 'HEAD']) !== request.recovery_checkpoint || transactionHash(bytes(identity.lockPath)) !== preview.lock_digest) fail('RECOVERY_LOCK_MISMATCH')
      renameSync(identity.lockPath, archiveLock)
      return result('ABORTED', [], output)
    }
    const fresh = inspect(root, request)
    if (fresh.preview.fingerprint !== preview.fingerprint) return result('STALE', ['RECOVERY_PREVIEW_MISMATCH'])
    if (existsSync(archive) && (lstatSync(archive).isSymbolicLink() || !lstatSync(archive).isDirectory())) fail('RECOVERY_ARCHIVE_UNSAFE')
    mkdirSync(archive, { recursive: true })
    preserve(archiveJournal, fresh.journalBytes)
    if (existsSync(archiveLock)) fail('RECOVERY_ARCHIVE_COLLISION')
    preserve(path.join(archive, 'authorization.json'), Buffer.from(JSON.stringify({
      operation: 'abort-unwritten-metadata', recovery_authorized: true, preview
    }, null, 2) + '\n'))
    // Retain all original binding fields. This is a failed/retired transaction,
    // never an approval or a completed verification action.
    atomicJournal(identity.journalPath, {
      ...fresh.journal, phase: 'ABORTED', recovery_required: false, updated_at: new Date().toISOString(),
      recovery_abort: { reason: 'UNWRITTEN_METADATA', preview_fingerprint: preview.fingerprint,
        archive_journal_path: archiveJournal, archive_lock_path: archiveLock }
    })
    terminalWritten = true
    if (request.fail_at === 'AFTER_ABORT_JOURNAL') fail('INJECTED_FAILURE:AFTER_ABORT_JOURNAL')
    if (transactionHash(bytes(identity.lockPath)) !== preview.lock_digest) fail('RECOVERY_LOCK_MISMATCH')
    renameSync(identity.lockPath, archiveLock)
    return result('ABORTED', [], output)
  } catch (error) { return result(terminalWritten ? 'RECOVERY_REQUIRED' : 'BLOCKED', [error.message]) }
}
