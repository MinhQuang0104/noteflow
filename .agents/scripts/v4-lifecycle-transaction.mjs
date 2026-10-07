import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const SHA = /^[0-9a-f]{40,64}$/
const STORY_ID = /^\d+\.\d+$/

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function git(root, args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000
  })
  if (result.error || result.status === null) throw new Error(`GIT_UNAVAILABLE:${args[0]}`)
  return result
}

function gitOutput(root, args, failure = `GIT_FAILED:${args[0]}`) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.trim()
}

function comparablePath(value) {
  const resolved = path.resolve(value).replaceAll('\\', '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function worktrees(root) {
  const entries = []
  let current = null
  for (const line of gitOutput(root, ['worktree', 'list', '--porcelain'], 'WORKTREE_LIST_UNAVAILABLE').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) entries.push(current = { worktree: line.slice('worktree '.length).trim(), branch: null })
    else if (line.startsWith('branch ') && current) current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
  }
  return entries
}

function identity(root) {
  root = path.resolve(root)
  const top = path.resolve(gitOutput(root, ['rev-parse', '--show-toplevel'], 'ROOT_NOT_TOPLEVEL'))
  if (comparablePath(top) !== comparablePath(root)) throw new Error('ROOT_NOT_TOPLEVEL')
  const common = path.resolve(root, gitOutput(root, ['rev-parse', '--git-common-dir'], 'GIT_COMMON_DIR_UNAVAILABLE'))
  const entries = worktrees(root)
  const canonical = entries[0]?.worktree
  if (!canonical) throw new Error('CANONICAL_WORKTREE_UNAVAILABLE')
  return { root, top, common, canonical: path.resolve(canonical) }
}

function pointer(root) {
  const locations = identity(root)
  const pointerPath = path.join(locations.canonical, '.agent-state', 'active-run.json')
  let value
  try { value = JSON.parse(readFileSync(pointerPath, 'utf8')) } catch { throw new Error('V3_POINTER_UNAVAILABLE') }
  return { path: pointerPath, value }
}

export function pointerIdle(root) {
  try {
    const value = pointer(root).value
    return value.schemaVersion === 1 && value.status === 'IDLE' && value.activeRunId === null && value.storyId === null
  } catch {
    return false
  }
}

export function storyCheckoutState(root, storyId) {
  if (!STORY_ID.test(storyId ?? '')) return { status: 'INVALID', authorized: false, reasons: ['INVALID_STORY_ID'], owners: [] }
  const token = 'story-' + storyId.replace('.', '-')
  const owner = new RegExp('(^|[/_-])' + token + '($|[/_-])')
  const owners = worktrees(root).filter(entry => entry.branch && owner.test(entry.branch))
  if (!owners.length) return { status: 'READY', owners: [] }
  const here = comparablePath(root)
  if (owners.some(entry => comparablePath(entry.worktree) === here)) return { status: 'READY', owners: owners.map(entry => entry.worktree) }
  return { status: 'BLOCKED', authorized: false, reasons: ['WRONG_CHECKOUT'], owners: owners.map(entry => entry.worktree) }
}

export function lifecyclePaths(root, storyId) {
  const locations = identity(root)
  const scope = hash(JSON.stringify({ common: locations.common, worktree: locations.top, story_id: storyId }))
  const directory = path.join(locations.common, 'noteflow-v4-lifecycle')
  return {
    directory,
    lockPath: path.join(directory, `scope-${scope}.lock`),
    scopeKey: scope
  }
}

function lifecycleFailure(status, reason, extra = {}) {
  return { status, ready: false, valid: !['INVALID', 'ERROR'].includes(status), reasons: [reason], ...extra }
}

export function lifecycleAdmission(root, { storyId, action, expectedHead } = {}) {
  if (!STORY_ID.test(storyId ?? '') || !['reconcile_lifecycle', 'finalize_story', 'complete_story'].includes(action) || !SHA.test(expectedHead ?? '')) {
    return lifecycleFailure('INVALID', 'INVALID_INPUT')
  }
  try {
    const locations = identity(root)
    const currentHead = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (currentHead !== expectedHead) return lifecycleFailure('STALE', 'EXPECTED_HEAD_MISMATCH', { head: currentHead })
    if (!pointerIdle(root)) return lifecycleFailure('BLOCKED', 'V3_POINTER_NOT_IDLE')
    const checkout = storyCheckoutState(root, storyId)
    if (checkout.status !== 'READY') return checkout
    return {
      status: 'READY', ready: true, valid: true, reasons: [],
      root: locations.root, common: locations.common, canonical: locations.canonical,
      story_id: storyId, action, expected_head: expectedHead,
      pointer_path: path.join(locations.canonical, '.agent-state', 'active-run.json')
    }
  } catch (error) {
    return lifecycleFailure('ERROR', error.message)
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

function updateJournal(file, journal, patch) {
  const next = { ...journal, ...patch, updated_at: new Date().toISOString() }
  atomicJson(file, next)
  return next
}

function keepLock(status) {
  return ['ERROR', 'RECOVERY_REQUIRED', 'UNCOMMITTED_FINALIZATION', 'UNCOMMITTED_COMPLETION'].includes(status)
}

export function inspectLifecycleTransaction(root, storyId) {
  try {
    const locations = lifecyclePaths(root, storyId)
    const lock = existsSync(locations.lockPath) ? readJson(locations.lockPath) ?? { raw: readFileSync(locations.lockPath, 'utf8') } : null
    return { status: lock ? 'LOCKED' : 'IDLE', lock_path: locations.lockPath, lock, directory: locations.directory }
  } catch (error) {
    return { status: 'ERROR', reasons: [error.message] }
  }
}

export function runLifecycleTransaction(root, descriptor, callback) {
  const admission = lifecycleAdmission(root, descriptor)
  if (admission.status !== 'READY') return admission
  let locations
  try { locations = lifecyclePaths(root, descriptor.storyId) } catch (error) { return lifecycleFailure('ERROR', error.message) }
  mkdirSync(locations.directory, { recursive: true })
  const transactionId = randomUUID()
  const journalPath = path.join(locations.directory, `transaction-${transactionId}.json`)
  const transaction = {
    schema_version: 1,
    kind: 'v4_lifecycle_transaction',
    transaction_id: transactionId,
    repository: admission.common,
    worktree: admission.root,
    story_id: descriptor.storyId,
    action: descriptor.action,
    expected_head: descriptor.expectedHead,
    scope_key: locations.scopeKey,
    phase: 'ADMITTED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  let acquired = false
  try {
    writeFileSync(locations.lockPath, `${JSON.stringify({
      schema_version: 1,
      transaction_id: transactionId,
      story_id: descriptor.storyId,
      action: descriptor.action,
      expected_head: descriptor.expectedHead,
      scope_key: locations.scopeKey,
      created_at: transaction.created_at
    }, null, 2)}\n`, { flag: 'wx' })
    acquired = true
    atomicJson(journalPath, transaction)
    let journal = transaction
    if (process.env.V4_LIFECYCLE_TEST_FAULT === 'AFTER_ADMISSION') throw new Error('INJECTED_FAILURE:AFTER_ADMISSION')
    journal = updateJournal(journalPath, journal, { phase: 'RUNNING' })
    const result = callback({ transaction_id: transactionId, lock_path: locations.lockPath, journal_path: journalPath, update: patch => { journal = updateJournal(journalPath, journal, patch) } })
    const final = keepLock(result?.status) ? 'RECOVERY_REQUIRED' : 'COMPLETE'
    updateJournal(journalPath, journal, { phase: final, result_status: result?.status ?? null, result_reasons: result?.reasons ?? [] })
    const metadata = { transaction_id: transactionId, journal_path: journalPath, lock_path: locations.lockPath }
    if (!keepLock(result?.status) && existsSync(locations.lockPath)) unlinkSync(locations.lockPath)
    return { ...result, lifecycle_transaction: metadata }
  } catch (error) {
    if (error.code === 'EEXIST') return lifecycleFailure('BLOCKED', 'LIFECYCLE_SCOPE_LOCKED', { lock_path: locations.lockPath })
    let journal = readJson(journalPath)
    if (journal) updateJournal(journalPath, journal, { phase: 'RECOVERY_REQUIRED', error: error.message })
    if (acquired) {
      return lifecycleFailure('RECOVERY_REQUIRED', error.message, {
        recovery: 'Preserve lifecycle files, index, lock and journal for explicit recovery.',
        lifecycle_transaction: { transaction_id: transactionId, journal_path: journalPath, lock_path: locations.lockPath }
      })
    }
    return lifecycleFailure('ERROR', error.message)
  }
}
