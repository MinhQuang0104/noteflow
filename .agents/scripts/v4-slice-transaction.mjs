import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const TRANSACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function canonicalPaths(items = []) {
  return [...new Set(items.map(item => String(item).replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.' || normalized.startsWith('/') || path.win32.isAbsolute(value) ||
      normalized.split('/').some(segment => !segment || segment === '..')) return null
  return normalized
}

function git(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 10000,
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024
  })
  if (result.error || result.status === null) throw new Error(`GIT_UNAVAILABLE:${args[0]}`)
  return result
}

function gitOutput(root, args, failure = `GIT_FAILED:${args[0]}`) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout
}

function nulPaths(root, args) {
  const separator = args.indexOf('--')
  const command = separator === -1
    ? [...args, '-z']
    : [...args.slice(0, separator), '-z', ...args.slice(separator)]
  return canonicalPaths(gitOutput(root, command).split('\0'))
}

function repositoryIdentity(root) {
  const worktree = path.resolve(gitOutput(root, ['rev-parse', '--show-toplevel']).trim())
  if (worktree !== path.resolve(root)) throw new Error('ROOT_NOT_TOPLEVEL')
  const commonRaw = gitOutput(root, ['rev-parse', '--git-common-dir']).trim()
  const common = path.resolve(root, commonRaw)
  const repository = path.resolve(root, gitOutput(root, ['rev-parse', '--git-dir']).trim())
  return { repository, worktree, common }
}

function transactionPaths(root, identity, descriptor) {
  const transactionRoot = path.join(identity.common, 'noteflow-v4-transactions')
  const scopeKey = hash(JSON.stringify({
    repository: identity.repository,
    worktree: identity.worktree,
    action: descriptor.action,
    story_id: descriptor.story_id,
    slice_id: descriptor.slice_id
  })).slice('sha256:'.length)
  const transactionId = descriptor.transaction_id
  if (!TRANSACTION_ID.test(transactionId)) throw new Error('INVALID_TRANSACTION_ID')
  return {
    transactionRoot,
    scopeKey,
    lockPath: path.join(transactionRoot, `scope-${scopeKey}.lock`),
    journalPath: path.join(transactionRoot, `transaction-${transactionId}.json`)
  }
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    renameSync(temporary, file)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

function updateJournal(journal, patch) {
  const next = { ...journal, ...patch, updated_at: new Date().toISOString() }
  atomicJson(journal._path, next)
  return next
}

function lockPayload(identity, paths, descriptor) {
  return {
    schema_version: 1,
    repository: identity.repository,
    worktree: identity.worktree,
    action: descriptor.action,
    story_id: descriptor.story_id,
    slice_id: descriptor.slice_id,
    transaction_id: descriptor.transaction_id,
    scope_key: paths.scopeKey,
    created_at: new Date().toISOString()
  }
}

function normalizeFailure(value) {
  return String(value ?? '').toUpperCase().replaceAll('-', '_').replaceAll(' ', '_')
}

function maybeFail(descriptor, phase) {
  if (normalizeFailure(descriptor.fail_at) === phase) {
    const error = new Error(`INJECTED_FAILURE:${phase}`)
    error.code = `INJECTED_FAILURE:${phase}`
    throw error
  }
}

function statusResult(status, reasons, extra = {}) {
  return { status, ready: status === 'READY', valid: !['INVALID', 'ERROR'].includes(status), reasons: [...new Set(reasons)], ...extra }
}

function worktreeInventory(root) {
  return {
    staged: nulPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--']),
    unstaged: nulPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--']),
    untracked: nulPaths(root, ['ls-files', '--others', '--exclude-standard', '--'])
  }
}

function dirtyPaths(inventory) {
  return canonicalPaths([...inventory.staged, ...inventory.unstaged, ...inventory.untracked])
}

function indexMode(root, relative) {
  const result = git(root, ['ls-files', '--stage', '--', relative])
  const line = result.stdout.split(/\r?\n/).find(Boolean)
  return line ? line.split(/\s+/)[0] : null
}

function treeMode(root, commit, relative) {
  const result = git(root, ['ls-tree', commit, '--', relative])
  const line = result.stdout.split(/\r?\n/).find(Boolean)
  return line ? line.split(/\s+/)[0] : null
}

function treeBytes(root, commit, relative) {
  const object = commit === ':' ? `:${relative}` : `${commit}:${relative}`
  const result = git(root, ['show', object], { encoding: 'buffer' })
  return result.status === 0 ? Buffer.from(result.stdout) : null
}

function fileSnapshot(root, relative) {
  const normalized = safeRelative(relative)
  if (!normalized) throw new Error(`INVALID_PATH:${relative}`)
  const absolute = path.resolve(root, normalized)
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`INVALID_PATH:${relative}`)
  if (!existsSync(absolute)) return { path: normalized, exists: false, kind: 'missing', sha256: null, mode: null }
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_PATH:${normalized}`)
  if (!stat.isFile()) throw new Error(`NON_FILE_PATH:${normalized}`)
  return {
    path: normalized,
    exists: true,
    kind: 'file',
    sha256: hash(readFileSync(absolute)),
    mode: (stat.mode & 0o111) ? '100755' : '100644'
  }
}

export function snapshotWorkingFiles(root, paths) {
  return Object.fromEntries(canonicalPaths(paths).map(relative => [relative, fileSnapshot(root, relative)]))
}

function sameSnapshot(expected, actual) {
  return expected.path === actual.path && expected.exists === actual.exists && expected.kind === actual.kind &&
    expected.sha256 === actual.sha256 && expected.mode === actual.mode
}

function pathDigest(paths) {
  const canonical = canonicalPaths(paths)
  return hash(canonical.length ? `${canonical.join('\n')}\n` : '')
}

function ensureExactSet(actual, expected, reason) {
  const left = canonicalPaths(actual)
  const right = canonicalPaths(expected)
  if (left.length !== right.length || left.some((item, index) => item !== right[index])) throw new Error(reason)
}

function verifyIndexSnapshot(root, paths, snapshot) {
  for (const relative of paths) {
    const expected = snapshot[relative]
    const stagedMode = indexMode(root, relative)
    if (!expected.exists) {
      if (stagedMode !== null) throw new Error('STAGED_CONTENT_MISMATCH')
      continue
    }
    if (!stagedMode || stagedMode !== expected.mode) throw new Error('STAGED_MODE_MISMATCH')
    const bytes = treeBytes(root, ':', relative)
    if (!bytes || hash(bytes) !== expected.sha256) throw new Error(`STAGED_CONTENT_MISMATCH:${relative}`)
  }
}

function verifyCommitSnapshot(root, commit, paths, snapshot) {
  for (const relative of paths) {
    const expected = snapshot[relative]
    const mode = treeMode(root, commit, relative)
    if (!expected.exists) {
      if (mode !== null) throw new Error('COMMITTED_CONTENT_MISMATCH')
      continue
    }
    if (mode !== expected.mode) throw new Error('COMMITTED_MODE_MISMATCH')
    const bytes = treeBytes(root, commit, relative)
    if (!bytes || hash(bytes) !== expected.sha256) throw new Error('COMMITTED_CONTENT_MISMATCH')
  }
}

function commitPaths(root, commit) {
  return nulPaths(root, ['diff-tree', '--no-commit-id', '--name-only', '--diff-filter=ACDMRTUXB', '-r', commit, '--'])
}

function commitParent(root, commit) {
  const parents = gitOutput(root, ['rev-list', '--parents', '-n', '1', commit]).trim().split(/\s+/).slice(1)
  if (parents.length !== 1) throw new Error('COMMIT_REQUIRES_SINGLE_PARENT')
  return parents[0]
}

function commitSubject(root, commit) {
  return gitOutput(root, ['show', '-s', '--format=%s', commit]).trim()
}

function matchesDescriptor(journal, descriptor, identity) {
  return journal && journal.repository === identity.repository && journal.worktree === identity.worktree &&
    journal.action === descriptor.action && journal.story_id === descriptor.story_id &&
    journal.slice_id === descriptor.slice_id && journal.transaction_id === descriptor.transaction_id &&
    journal.preview_fingerprint === descriptor.preview_fingerprint
}

function inspectJournal(root, transactionId) {
  const identity = repositoryIdentity(root)
  if (!TRANSACTION_ID.test(transactionId ?? '')) return statusResult('INVALID', ['INVALID_TRANSACTION_ID'])
  const paths = transactionPaths(root, identity, { action: 'implement_slice', story_id: 'unknown', slice_id: 'unknown', transaction_id: transactionId })
  // A transaction id is globally unique for the worktree, so locate it without
  // trusting action/slice data supplied by the caller.
  const files = existsSync(paths.transactionRoot)
    ? requireDirectory(paths.transactionRoot).filter(file => file === `transaction-${transactionId}.json`)
    : []
  if (!files.length) return statusResult('NOT_FOUND', ['TRANSACTION_NOT_FOUND'], { transaction_id: transactionId })
  const journalPath = path.join(paths.transactionRoot, files[0])
  const journal = readJson(journalPath)
  if (!journal) return statusResult('ERROR', ['TRANSACTION_JOURNAL_INVALID'], { transaction_id: transactionId, journal_path: journalPath })
  const lockPath = journal.lock_path
  const lock = lockPath && existsSync(lockPath) ? readJson(lockPath) ?? { raw: readFileSync(lockPath, 'utf8') } : null
  const inspectedStatus = journal.phase === 'COMPLETE' ? 'COMPLETE' : journal.phase === 'ABORTED' ? 'ABORTED' : 'RECOVERY_REQUIRED'
  return statusResult(inspectedStatus, [], {
    transaction_id: transactionId,
    journal_path: journalPath,
    lock_path: lockPath,
    journal: { ...journal, _path: undefined },
    lock,
    checkpoint_commit: journal.checkpoint_commit ?? null,
    next_action: journal.next_action ?? null
  })
}

// Node's synchronous directory API is kept behind one narrow inspection point
// so missing transaction storage remains a normal NOT_FOUND result.
import { readdirSync } from 'node:fs'
function requireDirectory(directory) { return readdirSync(directory) }

export function transactionIdentity(root, descriptor) {
  const identity = repositoryIdentity(root)
  const paths = transactionPaths(root, identity, descriptor)
  return { ...identity, ...paths }
}

export function inspectActionTransaction(root, transactionId) {
  try { return inspectJournal(root, transactionId) }
  catch (error) { return statusResult('ERROR', [error.message], { transaction_id: transactionId ?? null }) }
}

function acquire(root, descriptor, identity, paths) {
  mkdirSync(paths.transactionRoot, { recursive: true })
  const lock = lockPayload(identity, paths, descriptor)
  try {
    writeFileSync(paths.lockPath, `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('TRANSACTION_SCOPE_LOCKED')
    throw error
  }
  return lock
}

function loadExistingJournal(paths) {
  if (!existsSync(paths.journalPath)) return null
  const journal = readJson(paths.journalPath)
  if (!journal) throw new Error('TRANSACTION_JOURNAL_INVALID')
  journal._path = paths.journalPath
  return journal
}

function release(lockPath, transactionId) {
  if (!existsSync(lockPath)) return
  const lock = readJson(lockPath)
  if (lock?.transaction_id === transactionId) unlinkSync(lockPath)
}

function journalSeed(identity, paths, descriptor, lock) {
  return {
    schema_version: 1,
    repository: identity.repository,
    worktree: identity.worktree,
    action: descriptor.action,
    story_id: descriptor.story_id,
    slice_id: descriptor.slice_id,
    transaction_id: descriptor.transaction_id,
    scope_key: paths.scopeKey,
    lock_path: paths.lockPath,
    journal_path: paths.journalPath,
    preview_fingerprint: descriptor.preview_fingerprint,
    expected_head: descriptor.expected_head,
    implementation_paths: canonicalPaths(descriptor.implementation_paths),
    metadata_paths: canonicalPaths(descriptor.metadata_paths),
    lock_identity: lock,
    phase: 'LOCK_ACQUIRED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

function normalizeDescriptor(descriptor) {
  const implementation = canonicalPaths(descriptor.implementation_paths)
  const metadata = canonicalPaths(descriptor.metadata_paths)
  if (!implementation.length) throw new Error('IMPLEMENTATION_SCOPE_REQUIRED')
  if (!metadata.length) throw new Error('METADATA_SCOPE_REQUIRED')
  for (const relative of [...implementation, ...metadata]) if (!safeRelative(relative)) throw new Error(`INVALID_PATH:${relative}`)
  if (!SHA.test(descriptor.expected_head ?? '')) throw new Error('INVALID_EXPECTED_HEAD')
  if (!DIGEST.test(descriptor.preview_fingerprint ?? '')) throw new Error('INVALID_PREVIEW_FINGERPRINT')
  if (!descriptor.snapshot || typeof descriptor.snapshot !== 'object') throw new Error('WORKTREE_SNAPSHOT_REQUIRED')
  return { ...descriptor, implementation_paths: implementation, metadata_paths: metadata }
}

function assertInitialState(root, descriptor, inventory) {
  if (inventory.staged.length) throw new Error('DIRTY_INDEX')
  const dirty = dirtyPaths(inventory)
  ensureExactSet(dirty, descriptor.implementation_paths, 'DIRTY_SCOPE_MISMATCH')
  const current = snapshotWorkingFiles(root, descriptor.implementation_paths)
  for (const relative of descriptor.implementation_paths) {
    if (!sameSnapshot(descriptor.snapshot[relative], current[relative])) throw new Error('STALE_WORKTREE_PREVIEW')
  }
}

function metadataFiles(descriptor, checkpoint) {
  const result = descriptor.buildMetadata(checkpoint)
  if (!result || !Array.isArray(result.paths) || !result.files || typeof result.files !== 'object') throw new Error('METADATA_BUILDER_INVALID')
  ensureExactSet(result.paths, descriptor.metadata_paths, 'METADATA_SCOPE_MISMATCH')
  for (const relative of descriptor.metadata_paths) {
    if (typeof result.files[relative] !== 'string') throw new Error('METADATA_FILE_MISSING')
  }
  return result
}

function writeMetadata(root, result) {
  for (const [relative, value] of Object.entries(result.files)) {
    const normalized = safeRelative(relative)
    if (!normalized) throw new Error(`INVALID_PATH:${relative}`)
    const file = path.resolve(root, normalized)
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`INVALID_PATH:${relative}`)
    mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    try { writeFileSync(temporary, value, { flag: 'wx' }); renameSync(temporary, file) }
    finally { if (existsSync(temporary)) unlinkSync(temporary) }
  }
}

function commitExact(root, message, paths) {
  const result = git(root, ['commit', '-m', message])
  if (result.status !== 0) {
    const error = new Error('GIT_COMMIT_FAILED')
    error.stderr = result.stderr
    throw error
  }
  const commit = gitOutput(root, ['rev-parse', 'HEAD']).trim()
  const changed = commitPaths(root, commit)
  ensureExactSet(changed, paths, 'COMMIT_SCOPE_MISMATCH')
  return commit
}

function stageExact(root, paths, snapshot, phase) {
  git(root, ['add', '--', ...paths])
  const staged = nulPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'])
  ensureExactSet(staged, paths, `STAGED_SCOPE_MISMATCH:${phase}`)
  if (snapshot) verifyIndexSnapshot(root, paths, snapshot)
  return staged
}

function verifyClean(root) {
  const inventory = worktreeInventory(root)
  if (inventory.staged.length || inventory.unstaged.length || inventory.untracked.length) throw new Error('WORKTREE_SCOPE_MISMATCH')
}

function checkpointRecord(root, descriptor, baseline) {
  const checkpoint = gitOutput(root, ['rev-parse', 'HEAD']).trim()
  if (!SHA.test(checkpoint)) throw new Error('CHECKPOINT_COMMIT_INVALID')
  if (commitParent(root, checkpoint) !== baseline) throw new Error('CHECKPOINT_PARENT_MISMATCH')
  const changedPaths = commitPaths(root, checkpoint)
  ensureExactSet(changedPaths, descriptor.implementation_paths, 'COMMIT_SCOPE_MISMATCH')
  return {
    baseline_commit: baseline,
    checkpoint_commit: checkpoint,
    changed_paths: changedPaths,
    changed_paths_sha256: pathDigest(changedPaths),
    subject: commitSubject(root, checkpoint),
    subject_digest: hash(Buffer.from(commitSubject(root, checkpoint), 'utf8'))
  }
}

function runTransaction(root, rawDescriptor) {
  const descriptor = normalizeDescriptor(rawDescriptor)
  const identity = repositoryIdentity(root)
  const paths = transactionPaths(root, identity, descriptor)
  let journal = loadExistingJournal(paths)
  if (journal?.phase === 'COMPLETE') {
    if (!matchesDescriptor(journal, descriptor, identity)) return statusResult('STALE', ['COMPLETED_TRANSACTION_BINDING_MISMATCH'], { transaction_id: descriptor.transaction_id })
    return statusResult('NOOP', [], { transaction_id: descriptor.transaction_id, checkpoint_commit: journal.checkpoint_commit, metadata_commit: journal.metadata_commit, next_action: journal.next_action })
  }
  const recovery = descriptor.recovery === true
  if (journal && !recovery) return statusResult('BLOCKED', ['RECOVERY_AUTHORIZATION_REQUIRED'], { transaction_id: descriptor.transaction_id, journal_path: paths.journalPath, checkpoint_commit: journal.checkpoint_commit ?? null })
  if (journal && recovery) {
    if (!matchesDescriptor(journal, descriptor, identity)) return statusResult('STALE', ['RECOVERY_BINDING_MISMATCH'], { transaction_id: descriptor.transaction_id })
    if (journal.checkpoint_commit !== descriptor.recovery_checkpoint) return statusResult('BLOCKED', ['RECOVERY_CHECKPOINT_REQUIRED'], { transaction_id: descriptor.transaction_id, checkpoint_commit: journal.checkpoint_commit ?? null })
  }
  let lockAcquired = false
  let mutated = false
  try {
    let lock
    if (journal) {
      if (!existsSync(paths.lockPath)) throw new Error('RECOVERY_LOCK_MISSING')
      lock = readJson(paths.lockPath)
      if (!lock || lock.transaction_id !== descriptor.transaction_id || lock.scope_key !== paths.scopeKey) throw new Error('RECOVERY_LOCK_MISMATCH')
    } else {
      lock = acquire(root, descriptor, identity, paths)
      lockAcquired = true
      journal = journalSeed(identity, paths, descriptor, lock)
      journal._path = paths.journalPath
      atomicJson(paths.journalPath, journal)
    }

    if (!journal.checkpoint_commit) {
      if (descriptor.recheck) descriptor.recheck(root)
      const inventory = worktreeInventory(root)
      assertInitialState(root, descriptor, inventory)
      journal = updateJournal(journal, { phase: 'PREPARED', initial_inventory: inventory })
      mutated = true
      git(root, ['add', '--', ...descriptor.implementation_paths])
      const staged = nulPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'])
      ensureExactSet(staged, descriptor.implementation_paths, 'STAGED_SCOPE_MISMATCH:implementation')
      verifyIndexSnapshot(root, descriptor.implementation_paths, descriptor.snapshot)
      journal = updateJournal(journal, { phase: 'IMPLEMENTATION_STAGED', staged_paths: staged })
      maybeFail(descriptor, 'AFTER_STAGE')
      const baseline = descriptor.expected_head
      const checkpointCommit = commitExact(root, descriptor.implementation_message ?? `chore(story-${descriptor.story_id}): implementation checkpoint`, descriptor.implementation_paths)
      const checkpoint = checkpointRecord(root, descriptor, baseline)
      verifyCommitSnapshot(root, checkpoint.checkpoint_commit, descriptor.implementation_paths, descriptor.snapshot)
      journal = updateJournal(journal, { phase: 'CHECKPOINT_COMMITTED', ...checkpoint })
      maybeFail(descriptor, 'AFTER_COMMIT1')
      verifyClean(root)
    } else {
      const head = gitOutput(root, ['rev-parse', 'HEAD']).trim()
      if (head !== journal.checkpoint_commit) throw new Error('RECOVERY_HEAD_MISMATCH')
    }

    const checkpoint = {
      baseline_commit: journal.baseline_commit ?? descriptor.expected_head,
      checkpoint_commit: journal.checkpoint_commit,
      changed_paths: journal.changed_paths,
      changed_paths_sha256: journal.changed_paths_sha256,
      subject: journal.subject,
      subject_digest: journal.subject_digest
    }
    const metadata = metadataFiles(descriptor, checkpoint)
    journal = updateJournal(journal, { phase: 'METADATA_WRITE_STARTED', metadata_paths: metadata.paths })
    mutated = true
    writeMetadata(root, metadata)
    maybeFail(descriptor, 'AFTER_WRITE')
    if (descriptor.validateMetadata) descriptor.validateMetadata(metadata)
    journal = updateJournal(journal, { phase: 'METADATA_WRITTEN' })
    const stagedMetadata = stageExact(root, descriptor.metadata_paths, null, 'metadata')
    journal = updateJournal(journal, { phase: 'METADATA_STAGED', staged_paths: stagedMetadata })
    maybeFail(descriptor, 'AFTER_METADATA_STAGE')
    maybeFail(descriptor, 'BEFORE_COMMIT2')
    const metadataCommit = commitExact(root, descriptor.metadata_message ?? `chore(story-${descriptor.story_id}): record implementation checkpoint`, descriptor.metadata_paths)
    journal = updateJournal(journal, { phase: 'COMMIT2_ATTEMPTED', metadata_commit: metadataCommit })
    maybeFail(descriptor, 'AFTER_COMMIT2_HOOK')
    if (commitParent(root, metadataCommit) !== checkpoint.checkpoint_commit) throw new Error('METADATA_PARENT_MISMATCH')
    ensureExactSet(commitPaths(root, metadataCommit), descriptor.metadata_paths, 'METADATA_COMMIT_SCOPE_MISMATCH')
    for (const [relative, expected] of Object.entries(metadata.files)) {
      const actual = readFileSync(path.resolve(root, relative), 'utf8')
      if (actual !== expected) throw new Error('METADATA_CONTENT_MISMATCH')
      const committed = gitOutput(root, ['show', `${metadataCommit}:${relative}`])
      if (committed !== expected) throw new Error('COMMITTED_METADATA_MISMATCH')
    }
    if (descriptor.validateFinal) descriptor.validateFinal(metadata)
    verifyClean(root)
    const nextAction = { kind: 'verify_slice', target: descriptor.slice_id }
    journal = updateJournal(journal, { phase: 'COMPLETE', metadata_commit: metadataCommit, next_action: nextAction, recovery_required: false })
    release(paths.lockPath, descriptor.transaction_id)
    return statusResult('CHECKPOINTED', [], {
      transaction_id: descriptor.transaction_id,
      baseline_commit: checkpoint.baseline_commit,
      checkpoint_commit: checkpoint.checkpoint_commit,
      metadata_commit: metadataCommit,
      changed_paths: checkpoint.changed_paths,
      changed_paths_sha256: checkpoint.changed_paths_sha256,
      next_action: nextAction,
      journal_path: paths.journalPath,
      lock_path: paths.lockPath,
      durable_action_count: 1,
      stop_condition: 'VERIFY_SLICE_SAME_SLICE'
    })
  } catch (error) {
    const reason = error.code === 'EEXIST' ? 'TRANSACTION_SCOPE_LOCKED' : error.message
    if (mutated) {
      if (journal) {
        journal = updateJournal(journal, { phase: 'RECOVERY_REQUIRED', recovery_required: true, error: reason })
      }
      return statusResult('RECOVERY_REQUIRED', [reason], {
        transaction_id: descriptor.transaction_id,
        journal_path: paths.journalPath,
        lock_path: paths.lockPath,
        checkpoint_commit: journal?.checkpoint_commit ?? null,
        recovery: 'Preserve files/index/lock/journal. Inspect the journal and provide explicit human-authorized recovery input; never reset, delete the lock, or replay implementation.'
      })
    }
    if (journal) {
      try { updateJournal(journal, { phase: 'ABORTED', recovery_required: false, error: reason }) } catch { /* preserve the original failure */ }
    }
    if (lockAcquired) release(paths.lockPath, descriptor.transaction_id)
    return statusResult(reason.startsWith('STALE_') ? 'STALE' : reason === 'TRANSACTION_SCOPE_LOCKED' ? 'BLOCKED' : 'BLOCKED', [reason], {
      transaction_id: descriptor.transaction_id,
      journal_path: paths.journalPath,
      lock_path: paths.lockPath
    })
  }
}

export function executeSliceTransaction(root, descriptor) {
  try { return runTransaction(root, descriptor) }
  catch (error) { return statusResult('ERROR', [error.message], { transaction_id: descriptor?.transaction_id ?? null }) }
}

// Verification and review actions are metadata-only transactions.  They use
// the same lock/journal/recovery discipline as implementation, but deliberately
// do not create an implementation checkpoint.  Keeping this path separate is
// important: a verification receipt must never smuggle product files into the
// durable scope or create a second product commit.
function normalizeMetadataDescriptor(descriptor) {
  const metadata = canonicalPaths(descriptor.metadata_paths)
  if (!metadata.length) throw new Error('METADATA_SCOPE_REQUIRED')
  for (const relative of metadata) if (!safeRelative(relative)) throw new Error(`INVALID_PATH:${relative}`)
  if (!SHA.test(descriptor.expected_head ?? '')) throw new Error('INVALID_EXPECTED_HEAD')
  if (!SHA.test(descriptor.checkpoint_commit ?? '')) throw new Error('INVALID_CHECKPOINT_COMMIT')
  if (!DIGEST.test(descriptor.preview_fingerprint ?? '')) throw new Error('INVALID_PREVIEW_FINGERPRINT')
  return { ...descriptor, implementation_paths: [], metadata_paths: metadata }
}

function runMetadataTransaction(root, rawDescriptor) {
  const descriptor = normalizeMetadataDescriptor(rawDescriptor)
  const identity = repositoryIdentity(root)
  const paths = transactionPaths(root, identity, descriptor)
  let journal = loadExistingJournal(paths)
  if (journal?.phase === 'COMPLETE') {
    if (!matchesDescriptor(journal, descriptor, identity)) return statusResult('STALE', ['COMPLETED_TRANSACTION_BINDING_MISMATCH'], { transaction_id: descriptor.transaction_id })
    return statusResult('NOOP', [], {
      transaction_id: descriptor.transaction_id,
      checkpoint_commit: journal.checkpoint_commit,
      metadata_commit: journal.metadata_commit,
      next_action: journal.next_action
    })
  }
  const recovery = descriptor.recovery === true
  if (journal && !recovery) return statusResult('BLOCKED', ['RECOVERY_AUTHORIZATION_REQUIRED'], {
    transaction_id: descriptor.transaction_id,
    journal_path: paths.journalPath,
    checkpoint_commit: journal.checkpoint_commit ?? descriptor.checkpoint_commit
  })
  if (journal && recovery) {
    if (!matchesDescriptor(journal, descriptor, identity)) return statusResult('STALE', ['RECOVERY_BINDING_MISMATCH'], { transaction_id: descriptor.transaction_id })
    if (journal.checkpoint_commit !== descriptor.recovery_checkpoint) return statusResult('BLOCKED', ['RECOVERY_CHECKPOINT_REQUIRED'], {
      transaction_id: descriptor.transaction_id,
      checkpoint_commit: journal.checkpoint_commit ?? null
    })
  }

  let lockAcquired = false
  let mutated = false
  try {
    let lock
    if (journal) {
      if (!existsSync(paths.lockPath)) throw new Error('RECOVERY_LOCK_MISSING')
      lock = readJson(paths.lockPath)
      if (!lock || lock.transaction_id !== descriptor.transaction_id || lock.scope_key !== paths.scopeKey) throw new Error('RECOVERY_LOCK_MISMATCH')
    } else {
      lock = acquire(root, descriptor, identity, paths)
      lockAcquired = true
      journal = journalSeed(identity, paths, descriptor, lock)
      journal._path = paths.journalPath
      journal = updateJournal(journal, {
        checkpoint_commit: descriptor.checkpoint_commit,
        baseline_commit: descriptor.baseline_commit ?? null,
        phase: 'LOCK_ACQUIRED'
      })
    }

    const currentHead = gitOutput(root, ['rev-parse', 'HEAD']).trim()
    if (journal.metadata_commit) {
      if (journal.metadata_commit !== currentHead) throw new Error('RECOVERY_HEAD_MISMATCH')
      const committedMetadata = descriptor.readMetadata
        ? descriptor.readMetadata(root)
        : metadataFiles(descriptor, {
        baseline_commit: descriptor.baseline_commit ?? descriptor.expected_head,
        checkpoint_commit: descriptor.checkpoint_commit,
        changed_paths: descriptor.changed_paths ?? [],
        changed_paths_sha256: descriptor.changed_paths_sha256 ?? null,
        subject: descriptor.subject ?? null,
        subject_digest: descriptor.subject_digest ?? null
      })
      ensureExactSet(commitPaths(root, journal.metadata_commit), descriptor.metadata_paths, 'METADATA_COMMIT_SCOPE_MISMATCH')
      for (const [relative, expected] of Object.entries(committedMetadata.files)) {
        const actual = readFileSync(path.resolve(root, relative), 'utf8')
        if (actual !== expected) throw new Error('COMMITTED_METADATA_CONTENT_MISMATCH')
        const committed = gitOutput(root, ['show', `${journal.metadata_commit}:${relative}`])
        if (committed !== expected) throw new Error('COMMITTED_METADATA_MISMATCH')
      }
      if (descriptor.validateFinal) descriptor.validateFinal(committedMetadata)
      verifyClean(root)
      const nextAction = descriptor.next_action ?? journal.next_action ?? { kind: 'implement_slice', target: descriptor.slice_id }
      journal = updateJournal(journal, { phase: 'COMPLETE', next_action: nextAction, recovery_required: false })
      release(paths.lockPath, descriptor.transaction_id)
      return statusResult('NOOP', [], {
        transaction_id: descriptor.transaction_id,
        checkpoint_commit: descriptor.checkpoint_commit,
        metadata_commit: journal.metadata_commit,
        next_action: nextAction,
        journal_path: paths.journalPath,
        lock_path: paths.lockPath,
        durable_action_count: 0,
        stop_condition: descriptor.stop_condition ?? 'NEXT_ACTION_EXPLICIT'
      })
    }
    if (journal.checkpoint_commit !== currentHead) throw new Error('METADATA_HEAD_MISMATCH')
    if (descriptor.recheck) descriptor.recheck(root)
    if (!journal.metadata_commit) {
      const inventory = worktreeInventory(root)
      const resumingWrite = journal.phase === 'METADATA_WRITTEN' || journal.phase === 'METADATA_STAGED'
      if (!resumingWrite) {
        if (inventory.staged.length) throw new Error('DIRTY_INDEX')
        if (inventory.unstaged.length || inventory.untracked.length) throw new Error('DIRTY_SCOPE_MISMATCH')
        journal = updateJournal(journal, { phase: 'METADATA_PREPARED', initial_inventory: inventory })
      }
      mutated = true
      const metadata = resumingWrite && descriptor.readMetadata
        ? descriptor.readMetadata(root)
        : metadataFiles(descriptor, {
        baseline_commit: descriptor.baseline_commit ?? descriptor.expected_head,
        checkpoint_commit: descriptor.checkpoint_commit,
        changed_paths: descriptor.changed_paths ?? [],
        changed_paths_sha256: descriptor.changed_paths_sha256 ?? null,
        subject: descriptor.subject ?? null,
        subject_digest: descriptor.subject_digest ?? null
      })
      if (resumingWrite) {
        for (const [relative, expected] of Object.entries(metadata.files)) {
          const file = path.resolve(root, relative)
          if (!existsSync(file) || readFileSync(file, 'utf8') !== expected) throw new Error('RECOVERY_METADATA_CONTENT_MISMATCH')
        }
        if (journal.phase === 'METADATA_WRITTEN') {
          if (inventory.staged.length || inventory.untracked.length) throw new Error('RECOVERY_METADATA_SCOPE_MISMATCH')
          ensureExactSet(inventory.unstaged, descriptor.metadata_paths, 'RECOVERY_METADATA_SCOPE_MISMATCH')
        } else {
          ensureExactSet(inventory.staged, descriptor.metadata_paths, 'RECOVERY_METADATA_SCOPE_MISMATCH')
          if (inventory.unstaged.length || inventory.untracked.length) throw new Error('RECOVERY_METADATA_SCOPE_MISMATCH')
        }
      } else {
        journal = updateJournal(journal, { phase: 'METADATA_WRITE_STARTED', metadata_paths: metadata.paths })
        writeMetadata(root, metadata)
        maybeFail(descriptor, 'AFTER_WRITE')
        if (descriptor.validateMetadata) descriptor.validateMetadata(metadata)
        journal = updateJournal(journal, { phase: 'METADATA_WRITTEN' })
      }
      const staged = journal.phase === 'METADATA_STAGED' ? inventory.staged : stageExact(root, descriptor.metadata_paths, null, 'metadata')
      journal = updateJournal(journal, { phase: 'METADATA_STAGED', staged_paths: staged })
      maybeFail(descriptor, 'AFTER_METADATA_STAGE')
      maybeFail(descriptor, 'BEFORE_COMMIT')
      const metadataCommit = commitExact(root, descriptor.metadata_message ?? `chore(story-${descriptor.story_id}): record verification metadata`, descriptor.metadata_paths)
      journal = updateJournal(journal, { phase: 'COMMIT_ATTEMPTED', metadata_commit: metadataCommit })
      maybeFail(descriptor, 'AFTER_COMMIT_HOOK')
      if (commitParent(root, metadataCommit) !== descriptor.checkpoint_commit) throw new Error('METADATA_PARENT_MISMATCH')
      ensureExactSet(commitPaths(root, metadataCommit), descriptor.metadata_paths, 'METADATA_COMMIT_SCOPE_MISMATCH')
      for (const [relative, expected] of Object.entries(metadata.files)) {
        const actual = readFileSync(path.resolve(root, relative), 'utf8')
        if (actual !== expected) throw new Error('METADATA_CONTENT_MISMATCH')
        const committed = gitOutput(root, ['show', `${metadataCommit}:${relative}`])
        if (committed !== expected) throw new Error('COMMITTED_METADATA_MISMATCH')
      }
      if (descriptor.validateFinal) descriptor.validateFinal(metadata)
      verifyClean(root)
      const nextAction = descriptor.next_action ?? { kind: 'implement_slice', target: descriptor.slice_id }
      journal = updateJournal(journal, { phase: 'COMPLETE', metadata_commit: metadataCommit, next_action: nextAction, recovery_required: false })
      release(paths.lockPath, descriptor.transaction_id)
      return statusResult('APPLIED', [], {
        transaction_id: descriptor.transaction_id,
        checkpoint_commit: descriptor.checkpoint_commit,
        metadata_commit: metadataCommit,
        changed_paths: descriptor.changed_paths ?? [],
        changed_paths_sha256: descriptor.changed_paths_sha256 ?? null,
        next_action: nextAction,
        journal_path: paths.journalPath,
        lock_path: paths.lockPath,
        durable_action_count: 1,
        stop_condition: descriptor.stop_condition ?? 'NEXT_ACTION_EXPLICIT'
      })
    }
    throw new Error('METADATA_COMMIT_ALREADY_RECORDED')
  } catch (error) {
    const reason = error.code === 'EEXIST' ? 'TRANSACTION_SCOPE_LOCKED' : error.message
    if (mutated) {
      if (journal) journal = updateJournal(journal, { phase: 'RECOVERY_REQUIRED', recovery_required: true, error: reason })
      return statusResult('RECOVERY_REQUIRED', [reason], {
        transaction_id: descriptor.transaction_id,
        journal_path: paths.journalPath,
        lock_path: paths.lockPath,
        checkpoint_commit: journal?.checkpoint_commit ?? descriptor.checkpoint_commit,
        recovery: 'Preserve files/index/lock/journal. Inspect the journal and provide explicit human-authorized recovery input; never reset, delete the lock, or replay metadata.'
      })
    }
    if (journal) {
      try { updateJournal(journal, { phase: 'ABORTED', recovery_required: false, error: reason }) } catch { /* preserve the original failure */ }
    }
    if (lockAcquired) release(paths.lockPath, descriptor.transaction_id)
    return statusResult(reason.startsWith('STALE_') ? 'STALE' : reason === 'TRANSACTION_SCOPE_LOCKED' ? 'BLOCKED' : 'BLOCKED', [reason], {
      transaction_id: descriptor.transaction_id,
      journal_path: paths.journalPath,
      lock_path: paths.lockPath
    })
  }
}

export function executeMetadataTransaction(root, descriptor) {
  try { return runMetadataTransaction(root, descriptor) }
  catch (error) { return statusResult('ERROR', [error.message], { transaction_id: descriptor?.transaction_id ?? null }) }
}

export function transactionPathDigest(paths) { return pathDigest(paths) }

export function transactionHash(value) { return hash(value) }

export { canonicalPaths, safeRelative, worktreeInventory }
