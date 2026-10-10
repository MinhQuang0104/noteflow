import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { pointerIdle, storyCheckoutState } from './v4-lifecycle-transaction.mjs'
import { autopilotStatus, exitCodeForStatus } from './v4-story-runner.mjs'
import { declaredScope, heldHotPaths, scopeConflicts } from './story-scope.mjs'
import { inspectCompletion } from './check-story-completion.mjs'

const STORY_ID = /^\d+\.\d+$/
const SHA = /^[0-9a-f]{40,64}$/
export const REGISTRY_SCHEMA_VERSION = 2
export const RUN_STATES = new Set(['IMPLEMENTING', 'WAITING_WORKER', 'REVIEWING', 'WAITING_HUMAN', 'BLOCKED', 'INTEGRATING'])
const POLICY_PATHS = ['AGENTS.md', '.agents/routing/task-router.md', '.agents/skills/v4-story-runner/SKILL.md', '.agents/policies/orchestration-v3.md']
const planRelative = storyId => `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
const failure = (status, reason, extra = {}) => ({ status, reasons: [reason], ...extra })
const applied = record => ({ status: 'APPLIED', reasons: [], record })
const text = value => typeof value === 'string' && value.trim().length > 0
const timestamp = value => text(value) && Number.isFinite(Date.parse(value))

function git(root, args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status !== 0) throw new Error(`GIT_UNAVAILABLE:${args[0]}`)
  return result.stdout.trim()
}

export function comparableWorktree(value) {
  const normalized = path.resolve(value).replaceAll('\\', '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function registryPaths(root, storyId) {
  root = path.resolve(root)
  const top = path.resolve(git(root, ['rev-parse', '--show-toplevel']))
  if (comparableWorktree(top) !== comparableWorktree(root)) throw new Error('ROOT_NOT_TOPLEVEL')
  if (storyId !== undefined && !STORY_ID.test(storyId)) throw new Error('INVALID_STORY_ID')
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']))
  const directory = path.join(common, 'noteflow-v4-runs')
  return { common, directory, stories: path.join(directory, 'stories'), aborted: path.join(directory, 'aborted'),
    ...(storyId === undefined ? {} : { record: path.join(directory, 'stories', `${storyId}.json`), lock: path.join(directory, `story-${storyId}.lock`) }) }
}

function validRecordV1(record, storyId) {
  return record && typeof record === 'object' && !Array.isArray(record) && record.schemaVersion === 1 &&
    STORY_ID.test(record.storyId ?? '') && record.storyId === storyId && Number.isSafeInteger(record.generation) && record.generation > 0 &&
    text(record.worktree) && path.isAbsolute(record.worktree) && typeof record.branch === 'string' && SHA.test(record.controlPlaneCommit ?? '') &&
    ['codex', 'claude'].includes(record.lead?.vendor) && text(record.lead?.sessionId) && timestamp(record.lead?.claimedAt) &&
    record.orca && typeof record.orca === 'object' && !Array.isArray(record.orca) &&
    ['runId', 'leadTerminal', 'agyTerminal'].every(key => record.orca[key] === null || text(record.orca[key])) &&
    RUN_STATES.has(record.state) && Array.isArray(record.declaredScope) && record.declaredScope.every(text) &&
    record.overlapOverride === null && timestamp(record.heartbeatAt) && SHA.test(record.planHead ?? '') &&
    (record.takeover === undefined || (timestamp(record.takeover?.at) && ['codex', 'claude'].includes(record.takeover?.previous?.vendor) &&
      text(record.takeover?.previous?.session) && Number.isSafeInteger(record.takeover?.previous?.generation) &&
      record.takeover.previous.generation > 0 && record.takeover.previous.generation < record.generation))
}

// Readers are version-specific: changing the writer must not change the old reader.
export const REGISTRY_READERS = Object.freeze({
  1: (record, storyId) => validRecordV1(record, storyId) ? record : null,
  2: (record, storyId) => validRecordV1({ ...record, schemaVersion: 1, overlapOverride: null }, storyId) &&
    record?.schemaVersion === 2 && (record.overlapOverride === null ||
      (text(record.overlapOverride?.reason) && timestamp(record.overlapOverride?.at) &&
        Array.isArray(record.overlapOverride?.conflicts) && record.overlapOverride.conflicts.every(item =>
          STORY_ID.test(item.storyId ?? '') && Array.isArray(item.paths) && item.paths.every(text) &&
          (item.heldPaths === undefined || (Array.isArray(item.heldPaths) && item.heldPaths.every(text)))))) ? record : null
})

function validRecord(record, storyId) {
  return Object.hasOwn(REGISTRY_READERS, record?.schemaVersion) && Boolean(REGISTRY_READERS[record.schemaVersion](record, storyId))
}

export function readRegistryRecord(root, storyId) {
  try {
    const file = registryPaths(root, storyId).record
    if (!existsSync(file)) return failure('BLOCKED', 'REGISTRY_CLAIM_REQUIRED')
    let record
    try { record = JSON.parse(readFileSync(file, 'utf8')) } catch { return failure('INVALID', 'REGISTRY_RECORD_INVALID', { path: file }) }
    if (!record || typeof record !== 'object' || Array.isArray(record) || !Number.isSafeInteger(record.schemaVersion)) {
      return failure('INVALID', 'REGISTRY_RECORD_INVALID', { path: file })
    }
    if (!Object.hasOwn(REGISTRY_READERS, record.schemaVersion)) return failure('INVALID', 'REGISTRY_SCHEMA_UNSUPPORTED', { path: file })
    if (!REGISTRY_READERS[record.schemaVersion](record, storyId)) return failure('INVALID', 'REGISTRY_RECORD_INVALID', { path: file })
    return { status: 'READY', reasons: [], record }
  } catch (error) { return failure('ERROR', error.message) }
}

export function checkLeadGeneration(root, storyId, generation) {
  const loaded = readRegistryRecord(root, storyId)
  if (loaded.status !== 'READY') return loaded
  if (!Number.isSafeInteger(generation) || generation < 1) return failure('BLOCKED', 'REGISTRY_CLAIM_REQUIRED')
  if (loaded.record.generation !== generation) return failure('STALE', 'GENERATION_FENCED')
  if (comparableWorktree(loaded.record.worktree) !== comparableWorktree(root)) return failure('BLOCKED', 'REGISTRY_CLAIM_REQUIRED')
  return loaded
}

export function assertLeadGeneration(root, storyId, generation) {
  const result = checkLeadGeneration(root, storyId, generation)
  if (result.status !== 'READY') throw Object.assign(new Error(result.reasons[0]), { fenceStatus: result.status })
}

function atomicRecord(file, record) {
  const temporary = `${file}.${randomUUID()}.tmp`
  try { writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' }); renameSync(temporary, file) }
  finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

function withMutationLock(root, storyId, callback) {
  const locations = registryPaths(root, storyId)
  mkdirSync(locations.directory, { recursive: true })
  let owned = false
  try {
    try { writeFileSync(locations.lock, `${randomUUID()}\n`, { flag: 'wx' }); owned = true }
    catch (error) { if (error.code === 'EEXIST') return failure('CONFLICT', 'REGISTRY_MUTATION_LOCKED'); throw error }
    return callback(locations)
  } finally { if (owned) unlinkSync(locations.lock) }
}

function compareAndSwap(root, storyId, generation, change) {
  return withMutationLock(root, storyId, locations => {
    const loaded = readRegistryRecord(root, storyId)
    if (loaded.status !== 'READY') return loaded
    if (loaded.record.generation !== generation) return failure('STALE', 'GENERATION_FENCED')
    const result = change(loaded.record, locations)
    if (result.status !== 'APPLIED' || !result.record) return result
    const reread = readRegistryRecord(root, storyId)
    if (reread.status !== 'READY') return reread
    if (reread.record.generation !== generation) return failure('STALE', 'GENERATION_FENCED')
    atomicRecord(locations.record, result.record)
    const verified = readRegistryRecord(root, storyId)
    if (verified.status !== 'READY') return verified
    if (JSON.stringify(verified.record) !== JSON.stringify(result.record)) return failure('STALE', 'GENERATION_FENCED')
    return result
  })
}

// One short common-directory critical section covers checking every claim and
// creating the new record; per-Story locks alone cannot prevent cross-Story races.
function withClaimLock(locations, callback) {
  mkdirSync(locations.directory, { recursive: true })
  const lock = path.join(locations.directory, 'scope.lock'), deadline = Date.now() + 10000
  let owned = false
  try {
    while (!owned) {
      try { writeFileSync(lock, `${randomUUID()}\n`, { flag: 'wx' }); owned = true }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        if (Date.now() >= deadline) return failure('CONFLICT', 'REGISTRY_MUTATION_LOCKED')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
      }
    }
    return callback()
  } finally { if (owned) unlinkSync(lock) }
}

export function activeRegistryRecords(root) {
  const locations = registryPaths(root), records = []
  for (const name of existsSync(locations.stories) ? readdirSync(locations.stories).filter(name => name.endsWith('.json')).sort() : []) {
    const loaded = readRegistryRecord(root, name.slice(0, -5))
    if (loaded.status !== 'READY') return loaded
    records.push(loaded.record)
  }
  return { status: 'READY', reasons: [], records }
}

/** --takeover is an explicit owner operation; heartbeat age never grants it. */
export function claimStory(root, storyId, options = {}) {
  try {
    if (!STORY_ID.test(storyId ?? '') || !['codex', 'claude'].includes(options.leadVendor) || !text(options.session) ||
        (options.allowOverlap !== undefined && (!text(options.allowOverlap) || options.takeover))) return failure('INVALID', 'CLAIM_INPUT_INVALID')
    if (options.takeover) {
      const loaded = readRegistryRecord(root, storyId)
      if (loaded.status !== 'READY') return loaded
      return compareAndSwap(root, storyId, loaded.record.generation, record => {
        if (!pointerIdle(record.worktree)) return failure('BLOCKED', 'V3_POINTER_NOT_IDLE')
        const checkout = storyCheckoutState(record.worktree, storyId)
        if (checkout.status !== 'READY') return checkout
        const checked = validateStoryPlan(record.worktree, storyId)
        if (!checked.valid || checked.status !== 'READY') return { status: checked.status, reasons: checked.reasons }
        const now = new Date().toISOString()
        return applied({ ...record, generation: record.generation + 1,
          lead: { vendor: options.leadVendor, sessionId: options.session, claimedAt: now }, heartbeatAt: now,
          takeover: { previous: { vendor: record.lead.vendor, session: record.lead.sessionId, generation: record.generation }, at: now } })
      })
    }
    if (!text(options.worktree)) return failure('INVALID', 'WORKTREE_REQUIRED')
    const worktree = path.resolve(options.worktree)
    const locations = registryPaths(worktree, storyId)
    if (locations.common !== registryPaths(root, storyId).common) return failure('BLOCKED', 'WRONG_REPOSITORY')
    if (!pointerIdle(worktree)) return failure('BLOCKED', 'V3_POINTER_NOT_IDLE')
    const checkout = storyCheckoutState(worktree, storyId)
    if (checkout.status !== 'READY') return checkout
    const checked = validateStoryPlan(worktree, storyId)
    if (!checked.valid || checked.status !== 'READY') return { status: checked.status, reasons: checked.reasons }
    const plan = frontmatter(readFileSync(path.join(worktree, planRelative(storyId)), 'utf8'))
    const head = git(worktree, ['rev-parse', 'HEAD']), now = new Date().toISOString()
    const record = { schemaVersion: REGISTRY_SCHEMA_VERSION, storyId, generation: 1, worktree,
      branch: git(worktree, ['branch', '--show-current']), controlPlaneCommit: head,
      lead: { vendor: options.leadVendor, sessionId: options.session, claimedAt: now },
      orca: { runId: options.orcaRun ?? null, leadTerminal: options.leadTerminal ?? null, agyTerminal: options.agyTerminal ?? null },
      state: 'IMPLEMENTING', declaredScope: declaredScope(plan),
      overlapOverride: null, heartbeatAt: now, planHead: head }
    if (!validRecord(record, storyId)) return failure('INVALID', 'CLAIM_INPUT_INVALID')
    return withClaimLock(locations, () => {
      if (existsSync(locations.record)) {
        const holder = readRegistryRecord(root, storyId)
        return holder.status === 'READY' ? failure('CONFLICT', 'STORY_ALREADY_CLAIMED', { holder: holder.record }) : holder
      }
      const active = activeRegistryRecords(root)
      if (active.status !== 'READY') return active
      const conflicts = scopeConflicts(storyId, record.declaredScope, active.records)
      if (text(options.allowOverlap)) record.overlapOverride = { reason: options.allowOverlap, at: now, conflicts: [] }
      if (conflicts.status !== 'READY') {
        if (!text(options.allowOverlap) || !['SCOPE_OVERLAP', 'HOT_PATH_CONFLICT'].includes(conflicts.reasons[0])) return conflicts
        record.overlapOverride = { reason: options.allowOverlap, at: now,
          conflicts: [...conflicts.conflicts, ...(conflicts.hotConflicts ?? [])] }
      }
      mkdirSync(locations.stories, { recursive: true })
      writeFileSync(locations.record, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
      return applied(record)
    })
  } catch (error) { return failure(error.message === 'SCOPE_UNDECLARED' ? 'BLOCKED' : 'ERROR', error.message) }
}

export function heartbeatStory(root, storyId, generation, state) {
  try {
    if (!Number.isSafeInteger(generation) || generation < 1 || !RUN_STATES.has(state)) return failure('INVALID', 'HEARTBEAT_INPUT_INVALID')
    return compareAndSwap(root, storyId, generation, record => applied({ ...record, state, heartbeatAt: new Date().toISOString() }))
  } catch (error) { return failure('ERROR', error.message) }
}

/** --orphaned is owner-only; abort changes no worktree files. */
export function releaseStory(root, storyId, generation, disposition) {
  try {
    if (!Number.isSafeInteger(generation) || generation < 1 || !['merged', 'abort', 'orphaned'].includes(disposition)) return failure('INVALID', 'RELEASE_INPUT_INVALID')
    return withMutationLock(root, storyId, locations => {
      const loaded = readRegistryRecord(root, storyId)
      if (loaded.status !== 'READY') return loaded
      if (loaded.record.generation !== generation) return failure('STALE', 'GENERATION_FENCED')
      if (disposition === 'orphaned' && existsSync(loaded.record.worktree)) return failure('BLOCKED', 'WORKTREE_NOT_ORPHANED')
      const reread = readRegistryRecord(root, storyId)
      if (reread.status !== 'READY') return reread
      if (reread.record.generation !== generation) return failure('STALE', 'GENERATION_FENCED')
      if (disposition === 'abort') {
        mkdirSync(locations.aborted, { recursive: true })
        renameSync(locations.record, path.join(locations.aborted, `${storyId}-${generation}-${randomUUID()}.json`))
      } else unlinkSync(locations.record)
      if (existsSync(locations.record)) return failure('STALE', 'GENERATION_FENCED')
      return { status: 'APPLIED', reasons: [], storyId, disposition }
    })
  } catch (error) { return failure('ERROR', error.message) }
}

export function registryStatus(root, now = Date.now()) {
  try {
    const locations = registryPaths(root)
    if (!existsSync(locations.stories)) return { status: 'READY', reasons: [], records: [] }
    const records = []
    for (const name of readdirSync(locations.stories).sort()) {
      if (!name.endsWith('.json')) continue
      const loaded = readRegistryRecord(root, name.slice(0, -5))
      if (loaded.status !== 'READY') return { ...loaded, records }
      const record = loaded.record, flags = []
      let plan = null
      if (existsSync(record.worktree)) {
        try { plan = frontmatter(readFileSync(path.join(record.worktree, planRelative(record.storyId)), 'utf8')) } catch { /* dashboard retains the record */ }
      }
      const minutes = plan?.autopilot?.budgets?.max_minutes_per_slice ?? 60
      if (now - Date.parse(record.heartbeatAt) > minutes * 60000) flags.push('STALE?')
      if (!existsSync(record.worktree)) flags.push('ORPHANED')
      let stop = null
      if (plan?.autopilot && plan.autopilot.revoked === false) {
        stop = autopilotStatus(record.worktree, record.storyId, git(record.worktree, ['rev-parse', 'HEAD']), record.generation)
      }
      if (record.state === 'WAITING_HUMAN' || stop?.status === 'STOP') flags.push('WAITING_OWNER')
      let integrationStatus = record.state === 'INTEGRATING' ? 'INTEGRATING' : null, integrationPaths = []
      const marker = path.join(locations.directory, 'integration', `${record.storyId}.json`)
      if (!integrationStatus && record.state === 'BLOCKED' && existsSync(marker)) {
        try {
          const attempt = JSON.parse(readFileSync(marker, 'utf8'))
          if (attempt.storyId === record.storyId && attempt.generation === record.generation && attempt.status === 'MERGE_CONFLICT') {
            integrationStatus = 'MERGE_CONFLICT'
            integrationPaths = Array.isArray(attempt.paths) ? attempt.paths : []
          }
        } catch { /* an unreadable attempt cannot grant integration readiness */ }
      }
      if (!integrationStatus && plan?.lifecycle_snapshot === 'done' &&
          inspectCompletion(record.worktree, record.storyId, git(record.worktree, ['rev-parse', 'HEAD'])).status === 'READY') {
        integrationStatus = 'READY_TO_INTEGRATE'
      }
      records.push({ ...record, currentSlice: plan?.current_slice ?? null, flags, integrationStatus,
        hotPaths: heldHotPaths(record.declaredScope), ...(integrationPaths.length ? { integrationPaths } : {}),
        ...(stop?.status === 'STOP' ? { stopReasons: stop.reasons } : {}) })
    }
    return { status: 'READY', reasons: [], records }
  } catch (error) { return failure('ERROR', error.message) }
}

export function policyDrift(root, storyId) {
  try {
    const loaded = readRegistryRecord(root, storyId)
    if (loaded.status !== 'READY') return loaded
    const controlPlaneCommit = loaded.record.controlPlaneCommit
    git(root, ['cat-file', '-e', `${controlPlaneCommit}^{commit}`])
    const canonicalMain = git(root, ['rev-parse', '--verify', 'refs/heads/main'])
    const blob = (commit, relative) => {
      const result = spawnSync('git', ['--no-optional-locks', 'rev-parse', '--verify', `${commit}:${relative}`], {
        cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000
      })
      if (result.error || result.status === null) throw new Error('POLICY_BLOB_UNAVAILABLE')
      if (result.status !== 0) return null
      return result.stdout.trim()
    }
    const paths = POLICY_PATHS.filter(relative => blob(controlPlaneCommit, relative) !== blob(canonicalMain, relative)).sort()
    return { status: paths.length ? 'INFO_DRIFT' : 'NONE', paths, controlPlaneCommit, canonicalMain }
  } catch (error) { return failure('ERROR', error.message) }
}

function parseArguments(argv) {
  const [command, ...tail] = argv
  if (command === 'status') return tail.length === 0 || (tail.length === 1 && tail[0] === '--json') ? { command } : null
  if (command === 'policy-drift') return tail.length === 1 && STORY_ID.test(tail[0]) ? { command, storyId: tail[0] } : null
  if (!['claim', 'heartbeat', 'release'].includes(command) || !STORY_ID.test(tail[0] ?? '')) return null
  const result = { command, storyId: tail.shift() }
  const names = { '--worktree': 'worktree', '--lead-vendor': 'leadVendor', '--session': 'session', '--orca-run': 'orcaRun', '--lead-terminal': 'leadTerminal', '--agy-terminal': 'agyTerminal', '--generation': 'generation', '--state': 'state', '--allow-overlap': 'allowOverlap' }
  const allowed = command === 'claim' ? new Set(['worktree', 'leadVendor', 'session', 'orcaRun', 'leadTerminal', 'agyTerminal', 'allowOverlap']) : new Set(command === 'heartbeat' ? ['generation', 'state'] : ['generation'])
  for (let index = 0; index < tail.length; index++) {
    const flag = tail[index], name = names[flag]
    if (command === 'claim' && flag === '--takeover' && !result.takeover) result.takeover = true
    else if (command === 'release' && ['--merged', '--abort', '--orphaned'].includes(flag) && !result.disposition) result.disposition = flag.slice(2)
    else if (name && allowed.has(name) && result[name] === undefined && text(tail[index + 1]) && !tail[index + 1].startsWith('--')) result[name] = tail[++index]
    else return null
  }
  if (result.generation !== undefined) {
    if (!/^[1-9]\d*$/.test(result.generation) || !Number.isSafeInteger(Number(result.generation))) return null
    result.generation = Number(result.generation)
  }
  if (result.takeover && ['worktree', 'orcaRun', 'leadTerminal', 'agyTerminal', 'allowOverlap'].some(key => result[key] !== undefined)) return null
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args) return failure('INVALID', 'REGISTRY_USAGE')
  const root = path.resolve(git(process.cwd(), ['rev-parse', '--show-toplevel']))
  if (args.command === 'claim') return claimStory(root, args.storyId, args)
  if (args.command === 'heartbeat') return heartbeatStory(root, args.storyId, args.generation, args.state)
  if (args.command === 'release') return releaseStory(root, args.storyId, args.generation, args.disposition)
  if (args.command === 'policy-drift') return policyDrift(root, args.storyId)
  return registryStatus(root)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let result
  try { result = main() } catch (error) { result = failure('ERROR', error.message) }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exitCode = ['NONE', 'INFO_DRIFT'].includes(result.status) ? 0 : exitCodeForStatus(result.status)
}
