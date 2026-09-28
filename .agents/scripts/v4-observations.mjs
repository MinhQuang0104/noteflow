import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EVENT_SCHEMA_VERSION = 1
const MAX_EVENT_BYTES = 64 * 1024
const EVENT_TYPES = new Set([
  'action_started',
  'action_finished',
  'check_finished',
  'context_delivered',
  'usage_imported',
  'session_checkpoint',
  'session_closed',
  'story_review_snapshot',
  'story_completed',
  'reflection_requested',
  'diagnostic',
])
const COVERAGE = new Set(['MEASURED', 'PARTIAL', 'UNKNOWN'])
const USAGE_NUMERIC_FIELDS = [
  'uncached_input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'reasoning_tokens',
]
const CONTEXT_BYTE_FIELDS = ['generated', 'projected', 'delivered']
const USAGE_SEMANTICS = new Set([true, false, 'unknown'])
const MEASUREMENT_KINDS = new Set(['provider', 'operator', 'estimate'])
const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const SECRET_KEY = /(?:secret|password|passphrase|authorization|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|cookie|credential|transcript|chain[_-]?of[_-]?thought|raw[_-]?(?:prompt|response)|product[_-]?text)/i

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  if (result.error || result.status !== 0) throw new Error('GIT_UNAVAILABLE')
  return result.stdout.trim()
}

function normalizedPath(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function repositoryContext(inputRoot) {
  const root = realpathSync(inputRoot)
  const top = realpathSync(runGit(root, ['rev-parse', '--show-toplevel']))
  const commonRaw = runGit(root, ['rev-parse', '--git-common-dir'])
  const common = realpathSync(path.resolve(root, commonRaw))
  const sourceHead = runGit(root, ['rev-parse', 'HEAD'])
  return {
    root: top,
    repository_id: digest(normalizedPath(common)),
    worktree_id: digest(normalizedPath(top)),
    source_head: sourceHead,
    architecture_fingerprint: digest(sourceHead),
  }
}

function invalid(reason, extra = {}) {
  return { status: 'ERROR', reason, ...extra }
}

function validateSafeIdentifier(value, field, { pathSafe = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    return `INVALID_${field.toUpperCase()}`
  }
  if (pathSafe && (!EVENT_ID.test(value) || value.includes('/') || value.includes('\\'))) {
    return `INVALID_${field.toUpperCase()}`
  }
  if (!pathSafe && (!SAFE_ID.test(value) || value.includes('/') || value.includes('\\') || value.split('/').includes('..'))) {
    return `INVALID_${field.toUpperCase()}`
  }
  return null
}

function findUnsafeKey(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findUnsafeKey(item)
      if (result) return result
    }
    return null
  }
  if (!isObject(value)) return null
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) return key
    const result = findUnsafeKey(child)
    if (result) return result
  }
  return null
}

function normalizeNumber(value, field, unknownReasons) {
  if (value === undefined || value === null) {
    unknownReasons[field] ??= 'not_observed'
    return null
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_USAGE_NUMBER')
  return value
}

function normalizeSemantics(value, field, unknownReasons) {
  if (value === undefined || value === null) {
    unknownReasons[field] ??= 'provider_semantics_unknown'
    return 'unknown'
  }
  if (!USAGE_SEMANTICS.has(value)) throw new Error('INVALID_USAGE_SEMANTICS')
  if (value === 'unknown') unknownReasons[field] ??= 'provider_semantics_unknown'
  return value
}

function normalizeContextBytes(value, unknownReasons) {
  const source = value === undefined || value === null ? {} : value
  if (!isObject(source)) throw new Error('INVALID_CONTEXT_BYTES')
  const result = {}
  for (const field of CONTEXT_BYTE_FIELDS) result[field] = normalizeNumber(source[field], `context_bytes.${field}`, unknownReasons)
  return result
}

export function normalizeUsage(input) {
  if (!isObject(input)) throw new Error('INVALID_USAGE_RECORD')
  const unsafe = findUnsafeKey(input)
  if (unsafe) throw new Error('SECRET_FIELD')
  if (input.units !== 'tokens') throw new Error('INVALID_USAGE_UNITS')
  if (!MEASUREMENT_KINDS.has(input.measurement_kind)) throw new Error('INVALID_USAGE_MEASUREMENT_KIND')

  const usageId = input.usage_id ?? input.source_export_id ?? input.provider_request_id
  if (typeof usageId !== 'string' || !usageId || !SAFE_ID.test(usageId)) throw new Error('USAGE_ID_REQUIRED')
  const unknownReasons = isObject(input.unknown_reasons) ? { ...input.unknown_reasons } : {}
  const result = {
    schema_version: 1,
    usage_id: usageId,
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    units: 'tokens',
    measurement_kind: input.measurement_kind,
    source_export_id: input.source_export_id ?? null,
    provider_request_id: input.provider_request_id ?? null,
    parent_export_id: input.parent_export_id ?? null,
    parent_request_id: input.parent_request_id ?? null,
    uncached_input_tokens: null,
    cached_input_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
    output_includes_reasoning: 'unknown',
    input_includes_cached: 'unknown',
    context_bytes: null,
    unknown_reasons: unknownReasons,
  }
  if (result.provider !== null && (typeof result.provider !== 'string' || !result.provider)) throw new Error('INVALID_USAGE_PROVIDER')
  if (result.model !== null && (typeof result.model !== 'string' || !result.model)) throw new Error('INVALID_USAGE_MODEL')
  if (result.effort !== null && (typeof result.effort !== 'string' || !result.effort)) throw new Error('INVALID_USAGE_EFFORT')
  for (const field of USAGE_NUMERIC_FIELDS) result[field] = normalizeNumber(input[field], field, unknownReasons)
  result.output_includes_reasoning = normalizeSemantics(input.output_includes_reasoning, 'output_includes_reasoning', unknownReasons)
  result.input_includes_cached = normalizeSemantics(input.input_includes_cached, 'input_includes_cached', unknownReasons)
  result.context_bytes = normalizeContextBytes(input.context_bytes, unknownReasons)
  return result
}

export function createObservation(inputRoot, input = {}) {
  const identity = repositoryContext(inputRoot)
  return {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: input.event_id ?? randomUUID(),
    observed_at: input.observed_at ?? new Date().toISOString(),
    source_kind: input.source_kind ?? 'local',
    source_id: input.source_id ?? 'codex-local',
    story_id: input.story_id ?? null,
    slice_id: input.slice_id ?? null,
    action: input.action ?? null,
    invocation_id: input.invocation_id ?? null,
    session_id: input.session_id ?? null,
    repository_id: input.repository_id ?? identity.repository_id,
    worktree_id: input.worktree_id ?? identity.worktree_id,
    source_head: input.source_head ?? identity.source_head,
    architecture_fingerprint: input.architecture_fingerprint ?? identity.architecture_fingerprint,
    event_type: input.event_type ?? 'diagnostic',
    coverage: input.coverage ?? 'UNKNOWN',
    payload: input.payload ?? {},
    provenance: input.provenance ?? { kind: 'local_observation', source: 'v4-observations' },
  }
}

function hookEventId(input) {
  if (input.event_id !== undefined) return input.event_id
  const stable = stableJson({
    event_type: input.event_type,
    story_id: input.story_id ?? null,
    slice_id: input.slice_id ?? null,
    action: input.action ?? null,
    invocation_id: input.invocation_id ?? null,
    session_id: input.session_id ?? null,
    attempt_id: input.attempt_id ?? null,
    subject: input.payload?.subject ?? null,
  })
  return `hook-${input.event_type}-${digest(stable).slice('sha256:'.length, 'sha256:'.length + 48)}`
}

/**
 * Small observational adapter used by the real action/check/context paths.
 * It is deliberately advisory: a failed event write is returned to the
 * caller, but never becomes lifecycle authority or a reason to rerun an
 * already completed action.
 */
export function recordHookObservation(canonicalRoot, input = {}) {
  try {
    const event = createObservation(canonicalRoot, { ...input, event_id: hookEventId(input) })
    return recordObservation(canonicalRoot, event)
  } catch (error) {
    return invalid(error.message || 'OBSERVATION_HOOK_FAILED', { coverage: 'UNKNOWN', warning: 'observational failure does not change lifecycle state' })
  }
}

export function recordActionStarted(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'action_started', coverage: input.coverage ?? 'MEASURED' })
}

export function recordActionFinished(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'action_finished', coverage: input.coverage ?? 'MEASURED' })
}

export function recordCheckFinished(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'check_finished', coverage: input.coverage ?? 'MEASURED' })
}

export function recordContextDelivered(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'context_delivered', coverage: input.coverage ?? 'MEASURED' })
}

export function recordReflectionRequested(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'reflection_requested', coverage: input.coverage ?? 'PARTIAL' })
}

export function recordSessionCheckpoint(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'session_checkpoint', coverage: input.coverage ?? 'PARTIAL' })
}

export function recordSessionClosed(root, input = {}) {
  return recordHookObservation(root, { ...input, event_type: 'session_closed', coverage: input.coverage ?? 'PARTIAL' })
}

export function recordStoryReviewSnapshot(root, input = {}) {
  if (input.finalization_status !== 'HUMAN_GATE_REQUIRED') return invalid('REVIEW_SNAPSHOT_REQUIRES_FINALIZATION', { coverage: 'UNKNOWN' })
  return recordHookObservation(root, { ...input, event_type: 'story_review_snapshot', coverage: input.coverage ?? 'MEASURED' })
}

export function recordStoryCompleted(root, input = {}) {
  if (input.approval_present !== true || input.approval_fresh !== true) return invalid('COMPLETION_APPROVAL_REQUIRED', { coverage: 'UNKNOWN' })
  return recordHookObservation(root, { ...input, event_type: 'story_completed', coverage: input.coverage ?? 'MEASURED' })
}

function validateEvent(root, event) {
  if (!isObject(event)) return 'INVALID_EVENT'
  if (event.schema_version !== EVENT_SCHEMA_VERSION) return 'INVALID_SCHEMA_VERSION'
  const eventIdError = validateSafeIdentifier(event.event_id, 'event_id', { pathSafe: true })
  if (eventIdError) return eventIdError
  if (typeof event.observed_at !== 'string' || Number.isNaN(Date.parse(event.observed_at))) return 'INVALID_OBSERVED_AT'
  if (typeof event.source_kind !== 'string' || !event.source_kind) return 'INVALID_SOURCE_KIND'
  const sourceIdError = validateSafeIdentifier(event.source_id, 'source_id')
  if (sourceIdError) return sourceIdError
  if (!EVENT_TYPES.has(event.event_type)) return 'INVALID_EVENT_TYPE'
  if (!COVERAGE.has(event.coverage)) return 'INVALID_COVERAGE'
  for (const field of ['story_id', 'slice_id', 'action', 'invocation_id', 'session_id']) {
    if (event[field] !== null && event[field] !== undefined && validateSafeIdentifier(event[field], field)) return `INVALID_${field.toUpperCase()}`
  }
  let identity
  try { identity = repositoryContext(root) } catch { return 'REPOSITORY_UNAVAILABLE' }
  if (event.repository_id !== identity.repository_id) return 'REPOSITORY_ID_MISMATCH'
  if (event.worktree_id !== identity.worktree_id) return 'WORKTREE_ID_MISMATCH'
  if (!SHA.test(event.source_head ?? '')) return 'INVALID_SOURCE_HEAD'
  if (!DIGEST.test(event.architecture_fingerprint ?? '')) return 'INVALID_ARCHITECTURE_FINGERPRINT'
  if (!isObject(event.payload)) return 'INVALID_PAYLOAD'
  if (!isObject(event.provenance)) return 'INVALID_PROVENANCE'
  const unsafe = findUnsafeKey(event.payload) ?? findUnsafeKey(event.provenance)
  if (unsafe) return 'SECRET_FIELD'
  if (event.event_type === 'usage_imported') {
    try { event.payload.usage = normalizeUsage(event.payload.usage) } catch (error) { return error.message }
  }
  try {
    if (bytes(event) > MAX_EVENT_BYTES) return 'EVENT_TOO_LARGE'
  } catch { return 'INVALID_EVENT' }
  return null
}

function eventsDirectory(root) {
  return path.join(root, '.agent-state', 'v4-observations', 'events')
}

export function recordObservation(canonicalRoot, inputEvent) {
  let root
  try { root = repositoryContext(canonicalRoot).root } catch { return invalid('REPOSITORY_UNAVAILABLE', { coverage: 'UNKNOWN' }) }
  const event = JSON.parse(JSON.stringify(inputEvent))
  const validationError = validateEvent(root, event)
  if (validationError) return invalid(validationError, { coverage: 'UNKNOWN' })
  const directory = eventsDirectory(root)
  const file = path.join(directory, `${event.event_id}.json`)
  let descriptor = null
  try {
    mkdirSync(directory, { recursive: true })
    const serialized = `${stableJson(event)}\n`
    descriptor = openSync(file, 'wx')
    writeSync(descriptor, serialized, null, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    return { status: 'RECORDED', event_id: event.event_id, path: file, coverage: event.coverage }
  } catch (error) {
    if (descriptor !== null) {
      try { closeSync(descriptor) } catch { /* best effort */ }
    }
    if (error?.code === 'EEXIST') {
      try {
        const existing = JSON.parse(readFileSync(file, 'utf8'))
        const comparable = value => {
          const copy = { ...value }
          delete copy.observed_at
          return stableJson(copy)
        }
        if (comparable(existing) === comparable(event)) return { status: 'NOOP', event_id: event.event_id, path: file, coverage: existing.coverage }
        return { status: 'CONFLICT', event_id: event.event_id, path: file, coverage: 'UNKNOWN', reason: 'EVENT_ID_PAYLOAD_CONFLICT' }
      } catch {
        return invalid('OBSERVATION_STORE_CORRUPT', { event_id: event.event_id, coverage: 'UNKNOWN' })
      }
    }
    return invalid('OBSERVATION_WRITE_FAILED', { event_id: event.event_id, coverage: 'UNKNOWN', warning: 'telemetry write failure does not change lifecycle state' })
  }
}

export function readObservationEvents(canonicalRoot, selection = {}) {
  let root
  try { root = repositoryContext(canonicalRoot).root } catch { return [] }
  const directory = eventsDirectory(root)
  if (!existsSync(directory)) return []
  const files = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort()
  const events = []
  for (const name of files) {
    try {
      const event = JSON.parse(readFileSync(path.join(directory, name), 'utf8'))
      if (selection.story_id !== undefined && event.story_id !== selection.story_id) continue
      if (selection.session_id !== undefined && event.session_id !== selection.session_id) continue
      if (selection.event_type !== undefined && event.event_type !== selection.event_type) continue
      events.push(event)
    } catch {
      // A malformed event is excluded from derived summaries; the raw file remains for diagnosis.
    }
  }
  return events
}

function coverageOf(events) {
  if (!events.length || events.some(event => event.coverage === 'UNKNOWN')) return 'UNKNOWN'
  if (events.some(event => event.coverage === 'PARTIAL')) return 'PARTIAL'
  return 'MEASURED'
}

function usageRecords(events) {
  const candidates = events
    .filter(event => event.event_type === 'usage_imported' && isObject(event.payload?.usage))
    .map(event => event.payload.usage)
  const byExport = new Map(candidates.filter(item => item.source_export_id).map(item => [item.source_export_id, item]))
  const byRequest = new Map(candidates.filter(item => item.provider_request_id).map(item => [item.provider_request_id, item]))
  const seen = new Set()
  return candidates.filter(item => {
    const identity = item.usage_id ?? item.source_export_id ?? item.provider_request_id
    if (seen.has(identity)) return false
    seen.add(identity)
    if (item.parent_export_id && byExport.has(item.parent_export_id)) return false
    if (item.parent_request_id && byRequest.has(item.parent_request_id)) return false
    return true
  })
}

function sumKnown(records, field) {
  if (!records.length) return null
  const values = records.map(record => {
    if (field === 'reasoning_tokens' && record.output_includes_reasoning === true) return 0
    if (field === 'reasoning_tokens' && record.output_includes_reasoning === 'unknown') return null
    return record[field]
  })
  if (values.some(value => value === null || value === undefined)) return null
  return values.reduce((total, value) => total + value, 0)
}

export function summarizeObservations(events, selection = {}) {
  const filtered = events.filter(event =>
    (selection.story_id === undefined || event.story_id === selection.story_id) &&
    (selection.session_id === undefined || event.session_id === selection.session_id) &&
    (selection.event_type === undefined || event.event_type === selection.event_type))
  const records = usageRecords(filtered)
  const unknowns = []
  for (const record of records) {
    for (const [field, reason] of Object.entries(record.unknown_reasons ?? {})) {
      if (record[field] === null || field.startsWith('context_bytes.')) unknowns.push(`${field}:${reason}`)
    }
  }
  const sources = [...new Set(records.map(record => record.source_export_id).filter(Boolean))].sort()
  const measurements = {
    provider: records.filter(record => record.measurement_kind === 'provider').length,
    operator: records.filter(record => record.measurement_kind === 'operator').length,
    estimate: records.filter(record => record.measurement_kind === 'estimate').length,
  }
  return {
    event_count: filtered.length,
    coverage: coverageOf(filtered),
    usage_records: records.length,
    totals: Object.fromEntries(USAGE_NUMERIC_FIELDS.map(field => [field, sumKnown(records, field)])),
    context_bytes: Object.fromEntries(CONTEXT_BYTE_FIELDS.map(field => [field, sumKnown(records.map(record => record.context_bytes ?? {}), field)])),
    measurements,
    unknowns: [...new Set(unknowns)].sort(),
    sources,
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function cliRoot() {
  return repositoryContext(process.cwd()).root
}

function cliInput(root, value) {
  const input = readJson(path.resolve(process.cwd(), value))
  return createObservation(root, input)
}

function emit(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = code
}

function runCli(argv) {
  const root = cliRoot()
  const [verb, ...rest] = argv
  if (verb === 'record' || verb === 'session-checkpoint' || verb === 'close-session') {
    const inputIndex = rest.indexOf('--input')
    if (inputIndex < 0 || !rest[inputIndex + 1]) return emit(invalid('USAGE'), 3)
    const input = cliInput(root, rest[inputIndex + 1])
    if (verb === 'session-checkpoint') input.event_type = 'session_checkpoint'
    if (verb === 'close-session') input.event_type = 'session_closed'
    const result = recordObservation(root, input)
    return emit(result, result.status === 'CONFLICT' ? 2 : result.status === 'ERROR' ? 3 : 0)
  }
  if (verb === 'import-usage') {
    const inputIndex = rest.indexOf('--input')
    if (inputIndex < 0 || !rest[inputIndex + 1]) return emit(invalid('USAGE'), 3)
    const raw = readJson(path.resolve(process.cwd(), rest[inputIndex + 1]))
    const source = raw.usage ?? raw
    const input = createObservation(root, {
      ...raw,
      event_id: raw.event_id ?? `usage-${source.usage_id ?? source.source_export_id ?? source.provider_request_id}`,
      event_type: 'usage_imported',
      payload: { usage: source },
    })
    const result = recordObservation(root, input)
    return emit(result, result.status === 'CONFLICT' ? 2 : result.status === 'ERROR' ? 3 : 0)
  }
  if (verb === 'summarize') {
    const storyIndex = rest.indexOf('--story')
    const sessionIndex = rest.indexOf('--session')
    const selection = {}
    if (storyIndex >= 0) selection.story_id = rest[storyIndex + 1]
    if (sessionIndex >= 0) selection.session_id = rest[sessionIndex + 1]
    return emit(summarizeObservations(readObservationEvents(root, selection), selection))
  }
  return emit(invalid('USAGE'), 3)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(process.argv.slice(2)) } catch (error) { emit(invalid(error.message || 'CLI_ERROR'), 3) }
}
