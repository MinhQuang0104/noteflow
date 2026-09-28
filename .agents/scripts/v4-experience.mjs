import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { readObservationEvents } from './v4-observations.mjs'

const ENTRY_SCHEMA_VERSION = 1
const MAX_CLAIM_BYTES = 2 * 1024
const MAX_ENTRY_BYTES = 16 * 1024
const MAX_SELECTION_ENTRIES = 3
const MAX_SELECTION_BYTES = 6 * 1024
const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const KINDS = new Set(['verified_fact', 'semantic_hypothesis'])
const LIFECYCLES = new Set(['candidate', 'active', 'stale', 'deprecated'])
const UNSAFE_INSTRUCTION = /(?:\bskip\b[^\n]{0,96}\breview\b|\b(?:bypass|ignore)\b[^\n]{0,96}\b(?:review|gate|approval)\b|\b(?:change|rewrite|modify)\b[^\n]{0,96}\b(?:ac|acceptance criteria|policy|plan|story)\b|\b(?:run|execute)\b[^\n]{0,96}\b(?:command|script|shell|npm|node|git)\b)/i

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

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function byteLength(value) {
  return Buffer.byteLength(stableJson(value), 'utf8')
}

function invalid(reason, extra = {}) {
  return { status: 'ERROR', reason, ...extra }
}

function safeRelative(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const normalizedAbsolute = process.platform === 'win32' ? absolute.toLowerCase() : absolute
  return normalizedAbsolute.startsWith(`${normalizedRoot}${path.sep}`) ? absolute : null
}

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  if (result.error || result.status !== 0) throw new Error('GIT_HEAD_UNAVAILABLE')
  const head = result.stdout.trim()
  if (!SHA.test(head)) throw new Error('INVALID_GIT_HEAD')
  return head
}

function eventDirectory(root) {
  return path.join(root, '.agent-state', 'v4-observations', 'events')
}

function experienceDirectory(root) {
  return path.join(root, '.agent-state', 'v4-observations', 'experience')
}

function eventRelativePath(eventId) {
  return `.agent-state/v4-observations/events/${eventId}.json`
}

function experienceRelativePath(id) {
  return `.agent-state/v4-observations/experience/${id}.json`
}

function pathDigest(root, relative) {
  const file = safeRelative(root, relative)
  if (!file || !existsSync(file)) return null
  try {
    if (lstatSync(file).isSymbolicLink()) return null
    return digestBytes(readFileSync(file))
  } catch {
    return null
  }
}

function normalizePaths(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const result = []
  for (const item of value) {
    if (typeof item !== 'string' || !item || item.includes('\\') || path.isAbsolute(item) ||
        path.win32.isAbsolute(item) || item.split('/').some(part => !part || part === '.' || part === '..')) return null
    result.push(item)
  }
  return [...new Set(result)].sort()
}

function sourceBindingsFor(event) {
  const payloadBindings = Array.isArray(event.payload?.source_bindings) ? event.payload.source_bindings : []
  const provenanceBindings = Array.isArray(event.provenance?.source_bindings) ? event.provenance.source_bindings : []
  return [...payloadBindings, ...provenanceBindings]
    .filter(item => isObject(item) && typeof item.path === 'string' && DIGEST.test(item.digest ?? ''))
    .map(item => ({ path: item.path, digest: item.digest, role: item.role ?? 'source' }))
}

function eventSourceRefs(root, event) {
  const refs = []
  const eventPath = eventRelativePath(event.event_id)
  const eventDigest = pathDigest(root, eventPath)
  if (eventDigest) {
    refs.push({ kind: 'event', ref: event.event_id, path: eventPath, digest: eventDigest })
  } else {
    refs.push({ kind: 'event', ref: event.event_id, path: null, digest: digestText(stableJson(event)) })
  }
  for (const binding of sourceBindingsFor(event)) refs.push({
    kind: binding.role,
    ref: binding.path,
    path: binding.path,
    digest: binding.digest,
  })
  return refs
}

function scopeForEvent(event) {
  const paths = normalizePaths(
    event.payload?.changed_paths ?? event.payload?.referenced_paths ?? event.payload?.subject?.paths ?? [],
  )
  if (paths === null) return null
  return {
    story_id: event.story_id ?? null,
    slice_id: event.slice_id ?? null,
    action: event.action ?? null,
    risk: event.payload?.risk ?? event.provenance?.risk ?? null,
    feature_id: event.payload?.feature_id ?? event.provenance?.feature_id ?? null,
    paths,
  }
}

function experienceId(kind, sourceEvent, claim, scope) {
  return `experience-${digestText(stableJson({ kind, event_id: sourceEvent, claim, scope })).slice('sha256:'.length)}`
}

function claimText(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const claim = value.trim()
  if (Buffer.byteLength(claim, 'utf8') > MAX_CLAIM_BYTES || /[\u0000-\u001f]/.test(claim)) return null
  return claim
}

function sourceHeadFor(event, root) {
  const head = event.source_head ?? gitHead(root)
  return SHA.test(head) ? head : null
}

function buildVerifiedFact(root, event) {
  const payload = event.payload
  if (event.event_type !== 'check_finished' || payload?.status !== 'PASS') return null
  if (event.coverage === 'UNKNOWN' || !payload?.check_id || !isObject(payload.subject)) return null
  if (!payload.command_digest && !String(payload.check_id).startsWith('canonical:')) return null
  if (!isObject(event.provenance) || !event.provenance.kind) return null
  const scope = scopeForEvent(event)
  const sourceHead = sourceHeadFor(event, root)
  const claim = claimText(`Check ${payload.check_id} passed for the recorded subject.`)
  if (!scope || !sourceHead || !claim) return null
  const sourceRefs = eventSourceRefs(root, event)
  const pathDigests = Object.fromEntries(sourceRefs.filter(item => item.path).map(item => [item.path, item.digest]))
  return {
    schema_version: ENTRY_SCHEMA_VERSION,
    id: experienceId('verified_fact', event.event_id, claim, scope),
    kind: 'verified_fact',
    claim,
    scope,
    source: {
      story_id: event.story_id ?? null,
      session_id: event.session_id ?? null,
      event_id: event.event_id,
      receipt_refs: Array.isArray(payload.receipt_refs) ? [...payload.receipt_refs] : [],
    },
    source_refs: sourceRefs,
    source_head: sourceHead,
    architecture_fingerprint: event.architecture_fingerprint ?? digestText(sourceHead),
    relevant_digests: {
      path_digests: pathDigests,
      recipe_digest: payload.recipe_digest ?? event.provenance.recipe_digest ?? null,
      policy_digest: payload.policy_digest ?? event.provenance.policy_digest ?? null,
    },
    evidence_status: payload.status,
    lifecycle: 'active',
    validation_basis: ['actual_check_finished', 'subject_identity', 'bounded_output_digest'],
    last_validated_at: event.observed_at,
    invalidation_triggers: ['source_head_changed', 'source_ref_digest_changed', 'scope_mismatch'],
    limitations: [
      'This fact describes one observed subject and does not prove universal sufficiency.',
      ...(event.coverage === 'PARTIAL' ? ['The source observation had partial coverage.'] : []),
    ],
    provenance: { kind: 'derived_experience', extractor: 'v4-experience', source_event: event.event_id },
  }
}

function buildSemanticHypothesis(root, event) {
  if (event.event_type !== 'reflection_requested') return null
  const candidate = event.payload?.experience_candidate ?? event.payload?.candidate
  if (!isObject(candidate)) return null
  const claim = claimText(candidate.claim ?? candidate.hypothesis ?? candidate.text)
  const scope = scopeForEvent({ ...event, payload: { ...event.payload, ...candidate } })
  const sourceHead = sourceHeadFor(event, root)
  if (!claim || !scope || !sourceHead) return null
  const sourceRefs = eventSourceRefs(root, event)
  return {
    schema_version: ENTRY_SCHEMA_VERSION,
    id: experienceId('semantic_hypothesis', event.event_id, claim, scope),
    kind: 'semantic_hypothesis',
    claim,
    scope,
    source: {
      story_id: event.story_id ?? null,
      session_id: event.session_id ?? null,
      event_id: event.event_id,
      receipt_refs: Array.isArray(candidate.receipt_refs) ? [...candidate.receipt_refs] : [],
    },
    source_refs: sourceRefs,
    source_head: sourceHead,
    architecture_fingerprint: event.architecture_fingerprint ?? digestText(sourceHead),
    relevant_digests: { path_digests: Object.fromEntries(sourceRefs.filter(item => item.path).map(item => [item.path, item.digest])) },
    evidence_status: event.coverage ?? 'UNKNOWN',
    lifecycle: 'candidate',
    validation_basis: ['bounded_lead_candidate'],
    last_validated_at: event.observed_at,
    invalidation_triggers: ['source_head_changed', 'source_ref_digest_changed', 'human_rejection'],
    limitations: ['Candidate semantic content is not an instruction, check command, or authority.', 'Requires separate evaluation/adoption before becoming active.'],
    provenance: { kind: 'derived_experience', extractor: 'v4-experience', source_event: event.event_id },
  }
}

function unsafeClaim(entry) {
  return UNSAFE_INSTRUCTION.test(entry.claim ?? '')
}

function validateEntryShape(entry) {
  if (!isObject(entry) || entry.schema_version !== ENTRY_SCHEMA_VERSION) return 'INVALID_SCHEMA'
  if (!SAFE_ID.test(entry.id ?? '') || !KINDS.has(entry.kind) || !LIFECYCLES.has(entry.lifecycle)) return 'INVALID_ID_KIND_OR_LIFECYCLE'
  if (!claimText(entry.claim)) return 'INVALID_CLAIM'
  if (unsafeClaim(entry)) return 'UNTRUSTED_INSTRUCTION_CONTENT'
  if (!isObject(entry.scope) || !Array.isArray(entry.source_refs) || !entry.source_refs.length) return 'SOURCE_SCOPE_REQUIRED'
  if (!SHA.test(entry.source_head ?? '') || !DIGEST.test(entry.architecture_fingerprint ?? '')) return 'INVALID_SOURCE_IDENTITY'
  if (!isObject(entry.relevant_digests) || !isObject(entry.relevant_digests.path_digests)) return 'INVALID_RELEVANT_DIGESTS'
  if (!Array.isArray(entry.validation_basis) || !Array.isArray(entry.limitations) || !Array.isArray(entry.invalidation_triggers)) return 'INVALID_VALIDATION_METADATA'
  if (byteLength(entry) > MAX_ENTRY_BYTES) return 'ENTRY_TOO_LARGE'
  return null
}

function validateSourceRef(root, ref) {
  if (!isObject(ref) || typeof ref.kind !== 'string' || typeof ref.ref !== 'string' || !DIGEST.test(ref.digest ?? '')) return 'INVALID_SOURCE_REF'
  if (ref.path === null || ref.path === undefined) return ref.kind === 'event' ? 'SOURCE_EVENT_PATH_MISSING' : 'INVALID_SOURCE_REF_PATH'
  const file = safeRelative(root, ref.path)
  if (!file) return 'INVALID_SOURCE_REF_PATH'
  try {
    if (!existsSync(file)) return 'SOURCE_REF_MISSING'
    if (lstatSync(file).isSymbolicLink()) return 'SOURCE_REF_SYMLINK'
    if (pathDigest(root, ref.path) !== ref.digest) return 'SOURCE_REF_DIGEST_STALE'
  } catch {
    return 'SOURCE_REF_UNREADABLE'
  }
  return null
}

export function validateExperience(root, entry) {
  try {
    root = path.resolve(root)
    const shapeError = validateEntryShape(entry)
    if (shapeError) return { status: 'INVALID', reason: shapeError, id: entry?.id ?? null }
    const head = gitHead(root)
    if (entry.source_head !== head || entry.architecture_fingerprint !== digestText(head)) {
      return { status: 'STALE', reason: 'SOURCE_HEAD_OR_ARCHITECTURE_DRIFT', id: entry.id }
    }
    const paths = normalizePaths(entry.scope.paths)
    if (paths === null) return { status: 'INVALID', reason: 'INVALID_SCOPE_PATHS', id: entry.id }
    for (const ref of entry.source_refs) {
      const error = validateSourceRef(root, ref)
      if (error) return { status: error.includes('STALE') ? 'STALE' : error.includes('MISSING') ? 'STALE' : 'INVALID', reason: error, id: entry.id }
    }
    for (const [relative, expected] of Object.entries(entry.relevant_digests.path_digests)) {
      if (!DIGEST.test(expected)) return { status: 'INVALID', reason: 'INVALID_PATH_DIGEST', id: entry.id }
      const actual = pathDigest(root, relative)
      if (actual === null) return { status: 'STALE', reason: 'RELEVANT_SOURCE_MISSING', id: entry.id }
      if (actual !== expected) return { status: 'STALE', reason: 'RELEVANT_SOURCE_DIGEST_STALE', id: entry.id }
    }
    return { status: 'VALID', id: entry.id, lifecycle: entry.lifecycle, kind: entry.kind }
  } catch (error) {
    return { status: 'INVALID', reason: error instanceof Error ? error.message : String(error), id: entry?.id ?? null }
  }
}

function writeEntry(root, entry) {
  const directory = experienceDirectory(root)
  const file = path.join(directory, `${entry.id}.json`)
  const serialized = `${stableJson(entry)}\n`
  mkdirSync(directory, { recursive: true })
  if (existsSync(file)) {
    try {
      if (readFileSync(file, 'utf8') === serialized) return { status: 'NOOP', path: file }
      return { status: 'CONFLICT', path: file, reason: 'EXPERIENCE_ID_CONFLICT' }
    } catch {
      return { status: 'ERROR', path: file, reason: 'EXPERIENCE_STORE_CORRUPT' }
    }
  }
  const temp = `${file}.${entry.id}.tmp`
  try {
    writeFileSync(temp, serialized, { flag: 'wx' })
    renameSync(temp, file)
    return { status: 'RECORDED', path: file }
  } catch (error) {
    return { status: error?.code === 'EEXIST' ? 'CONFLICT' : 'ERROR', path: file, reason: error?.code === 'EEXIST' ? 'EXPERIENCE_ID_CONFLICT' : 'EXPERIENCE_WRITE_FAILED' }
  }
}

function observationList(observations, root) {
  if (observations === undefined) return readObservationEvents(root)
  if (Array.isArray(observations)) return observations
  if (isObject(observations) && Array.isArray(observations.events)) return observations.events
  if (isObject(observations) && Array.isArray(observations.observations)) return observations.observations
  return null
}

export function extractExperience(canonicalRoot, observations) {
  try {
    const root = path.resolve(canonicalRoot)
    const events = observationList(observations, root)
    if (!events) return invalid('OBSERVATIONS_ARRAY_REQUIRED', { entries: [], rejected: [], unknown: [] })
    const entries = []
    const rejected = []
    const unknown = []
    for (const event of events) {
      if (!isObject(event) || typeof event.event_id !== 'string') {
        rejected.push({ reason: 'INVALID_OBSERVATION' })
        continue
      }
      let entry = buildVerifiedFact(root, event)
      if (!entry) entry = buildSemanticHypothesis(root, event)
      if (!entry) {
        if (event.event_type === 'check_finished' || event.event_type === 'reflection_requested') {
          unknown.push({ event_id: event.event_id, reason: 'INSUFFICIENT_VERIFIED_SOURCE' })
        }
        continue
      }
      const validation = validateExperience(root, entry)
      if (validation.status !== 'VALID') {
        rejected.push({ id: entry.id, reason: validation.reason, status: validation.status })
        continue
      }
      const stored = writeEntry(root, entry)
      if (stored.status === 'CONFLICT' || stored.status === 'ERROR') {
        rejected.push({ id: entry.id, reason: stored.reason, status: stored.status })
        continue
      }
      entries.push(entry)
    }
    return { status: 'OK', entries, rejected, unknown, persisted: entries.map(entry => experienceRelativePath(entry.id)) }
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error), { entries: [], rejected: [], unknown: [] })
  }
}

function readStoredEntries(root) {
  const directory = experienceDirectory(root)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.json'))
    .map(item => {
      try { return JSON.parse(readFileSync(path.join(directory, item.name), 'utf8')) } catch { return null }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function matchesQuery(entry, query) {
  const scope = entry.scope
  for (const field of ['story_id', 'slice_id', 'action', 'risk', 'feature_id']) {
    if (query[field] !== undefined && stableJson(scope[field]) !== stableJson(query[field])) return false
  }
  if (query.current_head !== undefined && entry.source_head !== query.current_head) return false
  if (Array.isArray(query.paths) && query.paths.length) {
    if (!scope.paths.some(item => query.paths.includes(item))) return false
  }
  if (isObject(query.current_digests)) {
    for (const [relative, expected] of Object.entries(query.current_digests)) {
      if (entry.relevant_digests.path_digests[relative] !== expected) return false
    }
  }
  return true
}

export function selectExperience(root, query = {}) {
  try {
    root = path.resolve(root)
    if (!isObject(query) || Array.isArray(query)) return invalid('QUERY_REQUIRED', { entries: [], rejected: [] })
    const entries = Array.isArray(query.entries) ? query.entries : readStoredEntries(root)
    const rejected = []
    const selected = []
    let byteCount = 0
    for (const entry of entries) {
      const validation = validateExperience(root, entry)
      if (validation.status !== 'VALID') {
        rejected.push({ id: entry?.id ?? null, reason: validation.reason, status: validation.status })
        continue
      }
      if (!['active', 'candidate'].includes(entry.lifecycle) || !matchesQuery(entry, query)) continue
      const size = byteLength(entry)
      if (selected.length >= MAX_SELECTION_ENTRIES || byteCount + size > MAX_SELECTION_BYTES) continue
      selected.push(entry)
      byteCount += size
    }
    return {
      status: 'OK',
      entries: selected,
      rejected,
      byte_count: byteCount,
      limits: { max_entries: MAX_SELECTION_ENTRIES, max_bytes: MAX_SELECTION_BYTES },
      advisory: true,
    }
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error), { entries: [], rejected: [], byte_count: 0, advisory: true })
  }
}

function parseCli(argv) {
  const [verb, ...rest] = argv
  if (!['extract', 'select', 'validate'].includes(verb)) throw new Error('USAGE: extract|select|validate --input <json>')
  const flag = rest[0]
  const input = rest[1]
  if (flag !== '--input' || !input) throw new Error('USAGE: extract|select|validate --input <json>')
  return { verb, input: JSON.parse(readFileSync(path.resolve(input), 'utf8')) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const parsed = parseCli(process.argv.slice(2))
    const root = path.resolve(process.cwd())
    const output = parsed.verb === 'extract'
      ? extractExperience(root, parsed.input)
      : parsed.verb === 'select'
        ? selectExperience(root, parsed.input)
        : validateExperience(root, parsed.input)
    process.stdout.write(`${JSON.stringify(output)}\n`)
    process.exitCode = output.status === 'ERROR' ? 5 : output.status === 'INVALID' ? 4 : output.status === 'STALE' ? 2 : 0
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'INVALID', reason: error.message })}\n`)
    process.exitCode = 4
  }
}
