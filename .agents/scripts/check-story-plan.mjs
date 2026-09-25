import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { validateSeparatedPlan } from './v4-separated-plan.mjs'

// Exit codes: READY=0, RECONCILIATION_REQUIRED=1, STALE=2, INVALID=3, ERROR=4.
const CODES = { READY: 0, RECONCILIATION_REQUIRED: 1, STALE: 2, INVALID: 3, ERROR: 4 }
const ACTIONS = new Set(['plan_slice', 'implement_slice', 'verify_slice', 'review_slice', 'resolve_blocker', 'reconcile_lifecycle', 'request_gate', 'finalize_story'])
const SLICE_STATUSES = new Set(['pending', 'active', 'checkpointed', 'verified', 'reviewed', 'blocked'])
const V3_KEYS = new Set(['run_id', 'runId', 'activeRunId', 'task_id', 'taskId', 'taskIds', 'workerId', 'lease', 'generation', 'humanGateRequired', 'dispatchId'])
const SHA256 = /^sha256:[0-9a-f]{64}$/

function scalar(raw) {
  const value = raw.trim()
  if (value === 'null' || value === '~') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d{1,12}$/.test(value)) return Number(value)
  if (value.startsWith('"')) return JSON.parse(value)
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error('INVALID_YAML')
    return value.slice(1, -1).replaceAll("''", "'")
  }
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error('INVALID_YAML')
    const body = value.slice(1, -1).trim()
    return body ? body.split(',').map(part => scalar(part)) : []
  }
  if (/^[{}|>!*&]/.test(value)) throw new Error('UNSUPPORTED_YAML')
  return value
}

function parseYaml(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
    .map((raw, index) => ({ raw, indent: raw.match(/^ */)[0].length, text: raw.trim(), index }))
    .filter(line => line.text && !line.text.startsWith('#'))
  if (lines.some(line => /\t/.test(line.raw.slice(0, line.raw.length - line.text.length)))) throw new Error('INVALID_YAML')
  let cursor = 0
  function map(indent, seed = {}) {
    const out = seed
    while (cursor < lines.length && lines[cursor].indent === indent && !lines[cursor].text.startsWith('- ')) {
      const line = lines[cursor++]
      const match = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line.text)
      if (!match || Object.hasOwn(out, match[1])) throw new Error('INVALID_YAML')
      const [, key, raw = ''] = match
      if (raw) out[key] = scalar(raw)
      else if (cursor < lines.length && lines[cursor].indent > indent) out[key] = block(lines[cursor].indent)
      else out[key] = null
    }
    return out
  }
  function list(indent) {
    const out = []
    while (cursor < lines.length && lines[cursor].indent === indent && lines[cursor].text.startsWith('- ')) {
      const item = lines[cursor++].text.slice(2)
      const match = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(item)
      if (match) {
        const obj = {}
        if (match[2]) obj[match[1]] = scalar(match[2])
        else if (cursor < lines.length && lines[cursor].indent > indent + 2) obj[match[1]] = block(lines[cursor].indent)
        else obj[match[1]] = null
        if (cursor < lines.length && lines[cursor].indent > indent) map(indent + 2, obj)
        out.push(obj)
      } else out.push(scalar(item))
    }
    return out
  }
  function block(indent) { return lines[cursor].text.startsWith('- ') ? list(indent) : map(indent) }
  if (!lines.length || lines[0].indent !== 0) throw new Error('INVALID_YAML')
  const parsed = block(0)
  if (cursor !== lines.length || Array.isArray(parsed)) throw new Error('INVALID_YAML')
  return parsed
}

export function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error('INVALID_FRONTMATTER')
  return parseYaml(match[1])
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status === null) throw new Error('GIT_UNAVAILABLE')
  return result
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) ||
      path.win32.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('INVALID_PATH')
  const absolute = path.resolve(root, relative)
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_PATH')
  return absolute
}

function slug(heading) {
  return heading.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
}

function storySection(source, id, anchor) {
  const pattern = /^### (Story \d+\.\d+:[^\r\n]*)/gm
  const matches = [...source.matchAll(pattern)]
  const found = matches.find(match => match[1].startsWith(`Story ${id}:`))
  if (!found || anchor !== `#${slug(found[1])}`) throw new Error('SOURCE_ANCHOR_MISMATCH')
  const next = matches.find(match => match.index > found.index)
  return source.slice(found.index, next?.index ?? source.length)
}

function hasForbidden(value) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(hasForbidden)
  return Object.entries(value).some(([key, child]) => V3_KEYS.has(key) || hasForbidden(child))
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }

function validVerificationSchema(slice) {
  const verification = slice.verification
  if (verification !== undefined && !isObject(verification)) return false
  if (verification) {
    if (verification.subject !== undefined && !isObject(verification.subject)) return false
    if (verification.changed_paths !== undefined &&
        (!Array.isArray(verification.changed_paths) || verification.changed_paths.some(item => typeof item !== 'string' || !item))) return false
    if (verification.changed_paths_sha256 !== undefined && !SHA256.test(verification.changed_paths_sha256)) return false
    if (verification.focused_checks !== undefined &&
        (!Array.isArray(verification.focused_checks) || verification.focused_checks.some(item => !isObject(item)))) return false
    if (verification.canonical !== undefined && !isObject(verification.canonical)) return false
    if (verification.escalation !== undefined && !isObject(verification.escalation)) return false
    if (verification.progression_eligible !== undefined && typeof verification.progression_eligible !== 'boolean') return false
  }
  if (slice.verification_obligations !== undefined && !Array.isArray(slice.verification_obligations)) return false
  if (slice.review?.freshness !== undefined &&
      typeof slice.review.freshness !== 'string' && !isObject(slice.review.freshness)) return false
  return true
}

export function validate(root, id) {
  const planPath = `_bmad-output/implementation-artifacts/story-${id.replace('.', '-')}-plan.md`
  const result = { storyId: id, planPath, valid: false, status: 'INVALID', executionStatus: null,
    lifecycleSnapshot: null, actualLifecycle: null, currentSlice: null, nextAction: null,
    sourceDigest: null, checkpointState: 'NONE', warnings: [], legacy: { sliceStatusDrift: false }, reasons: [] }
  const invalid = reason => result.reasons.push(reason)
  const stale = reason => result.reasons.push(reason)
  const file = safePath(root, planPath)
  if (!existsSync(file)) { invalid('PLAN_MISSING'); return result }
  let plan
  try { plan = frontmatter(readFileSync(file, 'utf8')) }
  catch { invalid('INVALID_FRONTMATTER'); return result }
  result.executionStatus = plan.execution_status ?? null
  result.lifecycleSnapshot = plan.lifecycle_snapshot ?? null
  result.currentSlice = plan.current_slice ?? null
  result.nextAction = plan.next_action ?? null
  result.sourceDigest = plan.source?.section_digest ?? null
  if (plan.schema_version === 2) return validateSeparatedPlan(root, id, plan, result)
  if (plan.schema_version !== 1) invalid('UNSUPPORTED_SCHEMA')
  if (plan.story_id !== id) invalid('STORY_ID_MISMATCH')
  if (hasForbidden(plan)) invalid('FORBIDDEN_V3_STATE')
  if (!['backlog','ready-for-dev','in-progress','review','done'].includes(plan.lifecycle_snapshot)) invalid('INVALID_LIFECYCLE_SNAPSHOT')
  if (!['backlog','ready-for-dev','in-progress','review','complete'].includes(plan.execution_status)) invalid('INVALID_EXECUTION_STATUS')
  if (!plan.source || plan.source.path !== 'docs/product/epics.md' || typeof plan.source.anchor !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(plan.source.section_digest ?? '')) invalid('INVALID_SOURCE_REF')
  else {
    try {
      const sourcePath = safePath(root, plan.source.path)
      if (!existsSync(sourcePath)) invalid('SOURCE_MISSING')
      else {
        const section = storySection(readFileSync(sourcePath, 'utf8'), id, plan.source.anchor)
        const digest = `sha256:${createHash('sha256').update(section, 'utf8').digest('hex')}`
        if (digest !== plan.source.section_digest) stale('SOURCE_DIGEST_MISMATCH')
      }
    } catch (error) { invalid(error.message === 'SOURCE_ANCHOR_MISMATCH' ? error.message : 'INVALID_SOURCE_REF') }
  }
  if (typeof plan.sprint_key !== 'string' || !plan.sprint_key.startsWith(`${id.replace('.', '-')}-`)) invalid('INVALID_SPRINT_KEY')
  else {
    const sprintFile = safePath(root, '_bmad-output/implementation-artifacts/sprint-status.yaml')
    if (!existsSync(sprintFile)) invalid('SPRINT_STATUS_MISSING')
    else {
      const text = readFileSync(sprintFile, 'utf8').replaceAll('\r\n', '\n')
      const section = text.split(/^development_status:\s*$/m)[1]
      if (!section) invalid('SPRINT_STATUS_INVALID')
      else {
        const entries = [...section.matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)]
        const matches = entries.filter(match => match[1] === plan.sprint_key)
        if (matches.length !== 1) invalid('SPRINT_KEY_MISSING')
        else {
          result.actualLifecycle = matches[0][2]
          if (result.actualLifecycle !== plan.lifecycle_snapshot) stale('SNAPSHOT_MISMATCH')
        }
      }
    }
  }
  const slices = plan.slices
  if (!Array.isArray(slices) || !slices.length || slices.some(slice => !slice || typeof slice.id !== 'string')) invalid('INVALID_SLICES')
  else {
    const ids = slices.map(slice => slice.id)
    if (new Set(ids).size !== ids.length) invalid('DUPLICATE_SLICE')
    if (!ids.includes(plan.current_slice)) invalid('INVALID_CURRENT_SLICE')
    const graph = new Map()
    for (const slice of slices) {
      const legacyInProgress = slice.status === 'in-progress' && plan.schema_version === 1 &&
        Boolean(slice.checkpoint_commit) && slice.id === plan.current_slice &&
        plan.next_action?.kind === 'verify_slice' && plan.next_action?.target === slice.id &&
        plan.execution_status === 'in-progress'
      if (!SLICE_STATUSES.has(slice.status)) {
        if (legacyInProgress) {
          result.legacy.sliceStatusDrift = true
          if (!result.warnings.includes('LEGACY_SLICE_STATUS_IN_PROGRESS')) result.warnings.push('LEGACY_SLICE_STATUS_IN_PROGRESS')
        } else invalid('INVALID_SLICE_STATUS')
      }
      if (!validVerificationSchema(slice)) invalid('INVALID_VERIFICATION_SCHEMA')
      if (!Array.isArray(slice.depends_on) || slice.depends_on.some(dep => !ids.includes(dep))) invalid('INVALID_DEPENDENCY')
      graph.set(slice.id, slice.depends_on ?? [])
    }
    const visiting = new Set(), visited = new Set()
    function visit(node) {
      if (visiting.has(node)) return true
      if (visited.has(node)) return false
      visiting.add(node)
      if ((graph.get(node) ?? []).some(dep => graph.has(dep) && visit(dep))) return true
      visiting.delete(node); visited.add(node); return false
    }
    if (ids.some(visit)) invalid('CYCLIC_DEPENDENCY')
    if (plan.execution_status === 'complete' &&
        (slices.some(slice => !((slice.status === 'reviewed') || (slice.status === 'verified' && !slice.review?.required)) ||
          (slice.verification?.gate_status && slice.verification.gate_status !== 'PASS') ||
          (slice.review?.required && slice.review.verdict !== 'APPROVE')) || (plan.blockers?.length ?? 0) ||
          !['finalize_story', ...(plan.lifecycle_snapshot === 'review' ? ['reconcile_lifecycle'] : [])].includes(plan.next_action?.kind))) invalid('INCOMPLETE_CLAIM')
  }
  if (!ACTIONS.has(plan.next_action?.kind)) invalid('UNKNOWN_ACTION')
  else {
    const action = plan.next_action
    const storyAction = ['reconcile_lifecycle','request_gate','finalize_story'].includes(action.kind)
    if (storyAction && action.target !== 'story') invalid('INVALID_ACTION_TARGET')
    if (!storyAction && action.target !== plan.current_slice) invalid('INVALID_ACTION_TARGET')
    if (action.reference && ![...(plan.blockers ?? []).map(item => item.id), ...(plan.unresolved_questions ?? []).map(item => item.id)].includes(action.reference)) invalid('INVALID_ACTION_REFERENCE')
  }
  const shas = []
  for (const slice of slices ?? []) {
    if (slice.checkpoint_commit) shas.push([slice.checkpoint_commit, 'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR'])
    if (slice.review?.reviewed_commit) shas.push([slice.review.reviewed_commit, 'REVIEW_COMMIT_MISSING', 'REVIEW_COMMIT_NOT_ANCESTOR'])
  }
  for (const [name, sha] of Object.entries(plan.checkpoints ?? {})) {
    if (sha) shas.push([sha, 'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR'])
    const sliceId = /^slice_([a-z0-9]+)_commit$/.exec(name)?.[1]?.toUpperCase()
    if (sliceId && slices?.some(slice => slice.id === sliceId && slice.checkpoint_commit !== sha)) invalid('CHECKPOINT_REFERENCE_MISMATCH')
  }
  result.checkpointState = shas.length ? 'FRESH' : 'NONE'
  for (const [sha, missing, ancestor] of shas) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(sha) || git(root, ['cat-file', '-e', `${sha}^{commit}`]).status !== 0) {
      stale(missing); result.checkpointState = 'STALE'
    } else if (git(root, ['merge-base', '--is-ancestor', sha, 'HEAD']).status !== 0) {
      stale(ancestor); result.checkpointState = 'STALE'
    }
  }
  const reconcile = result.actualLifecycle && ['backlog','ready-for-dev'].includes(result.actualLifecycle) &&
    (plan.execution_status === 'in-progress' || shas.length > 0)
  if (reconcile && plan.next_action?.kind !== 'reconcile_lifecycle') invalid('RECONCILIATION_ACTION_REQUIRED')
  if (reconcile) result.reasons.push('EXECUTION_AHEAD_OF_LIFECYCLE')
  const invalidReasons = result.reasons.filter(reason => !['SOURCE_DIGEST_MISMATCH','SNAPSHOT_MISMATCH',
    'CHECKPOINT_MISSING','CHECKPOINT_NOT_ANCESTOR','REVIEW_COMMIT_MISSING','REVIEW_COMMIT_NOT_ANCESTOR',
    'EXECUTION_AHEAD_OF_LIFECYCLE'].includes(reason))
  const staleReasons = result.reasons.filter(reason => ['SOURCE_DIGEST_MISMATCH','SNAPSHOT_MISMATCH',
    'CHECKPOINT_MISSING','CHECKPOINT_NOT_ANCESTOR','REVIEW_COMMIT_MISSING','REVIEW_COMMIT_NOT_ANCESTOR'].includes(reason))
  result.status = invalidReasons.length ? 'INVALID' : staleReasons.length ? 'STALE' : reconcile ? 'RECONCILIATION_REQUIRED' : 'READY'
  result.valid = result.status === 'READY' || result.status === 'RECONCILIATION_REQUIRED'
  return result
}

function main() {
  const [, , verb, id] = process.argv
  if (verb !== 'check' || !/^\d+\.\d+$/.test(id ?? '') || process.argv.length !== 4) {
    return { valid: false, status: 'INVALID', reasons: ['USAGE: check <epic.story>'] }
  }
  const rootResult = git(process.cwd(), ['rev-parse', '--show-toplevel'])
  if (rootResult.status !== 0) throw new Error('GIT_ROOT_UNAVAILABLE')
  return validate(path.resolve(rootResult.stdout.trim()), id)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = CODES[result.status]
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ valid: false, status: 'ERROR', reasons: [error.message] })}\n`)
    process.exitCode = CODES.ERROR
  }
}
