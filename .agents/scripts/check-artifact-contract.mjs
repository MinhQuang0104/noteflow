import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const ATTEMPT_ID = /^[1-9][0-9]*$/
const CATEGORIES = ['story', 'ac', 'tasks', 'readiness', 'references', 'risk', 'completion']
const REQUIRED = ['story', 'ac', 'tasks', 'readiness']
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const stableValue = value => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])])) : value
export const receiptDigest = receipt => hash(JSON.stringify(stableValue(receipt)))
function clean(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n').map(line => line.trimEnd())
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines.at(-1).trim()) lines.pop()
  return lines.join('\n')
}

function metadata(source, errors) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) { errors.push('MISSING_FRONTMATTER'); return {} }
  const result = {}
  for (const line of match[1].replaceAll('\r\n', '\n').split('\n')) {
    const field = /^([a-z_]+):\s*(?:"([^"]*)"|([^\n]*))$/.exec(line)
    if (!field || !['story_id', 'title', 'status'].includes(field[1]) || Object.hasOwn(result, field[1])) {
      errors.push('INVALID_FRONTMATTER'); continue
    }
    result[field[1]] = (field[2] ?? field[3]).trim()
  }
  if (!/^\d+\.\d+$/.test(result.story_id ?? '') || !result.title ||
      !['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].includes(result.status)) errors.push('INVALID_STORY_IDENTITY')
  return result
}

function section(source, category, errors) {
  const start = `<!-- v4:${category}:start -->`, end = `<!-- v4:${category}:end -->`
  const starts = source.split(start).length - 1, ends = source.split(end).length - 1
  if (!starts && !ends) { if (REQUIRED.includes(category)) errors.push(`MISSING_${category.toUpperCase()}`); return '' }
  if (starts !== 1 || ends !== 1 || source.indexOf(end) < source.indexOf(start)) {
    errors.push(`INVALID_${category.toUpperCase()}_SECTION`); return ''
  }
  const value = clean(source.slice(source.indexOf(start) + start.length, source.indexOf(end)))
  if (!value && REQUIRED.includes(category)) errors.push(`MISSING_${category.toUpperCase()}`)
  return value
}

function items(body, pattern, invalid, duplicate, errors) {
  const found = [], seen = new Set()
  for (const line of body.split('\n').filter(Boolean)) {
    const match = pattern.exec(line)
    if (!match) { errors.push(invalid); continue }
    if (duplicate && seen.has(match[1])) errors.push(duplicate)
    seen.add(match[1]); found.push(match)
  }
  return found
}

export function inspectStory(source) {
  const errors = []
  const meta = metadata(source, errors)
  const blocks = Object.fromEntries(CATEGORIES.map(category => [category, section(source, category, errors)]))
  let unmarked = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  for (const category of CATEGORIES) {
    unmarked = unmarked.replace(new RegExp(`<!-- v4:${category}:start -->[\\s\\S]*?<!-- v4:${category}:end -->`, 'g'), '')
  }
  if (unmarked.replaceAll('\r\n', '\n').split('\n').some(line => line.trim() && !/^#{1,6} .+$/.test(line))) errors.push('UNMARKED_CONTENT')
  const ac = items(blocks.ac, /^- (AC-[0-9]+): (.+)$/, 'INVALID_AC_ITEM', 'DUPLICATE_AC_ID', errors)
    .map(([, id, text]) => ({ id, text }))
  const tasks = items(blocks.tasks, /^- \[[ xX]\] ([A-Z][A-Z0-9]*-[0-9]+(?:\.[0-9]+)*) \[([A-Z0-9., -]+)\]: (.+)$/, 'INVALID_TASK_ITEM', 'DUPLICATE_TASK_ID', errors)
    .map(([, id, refs, text]) => ({ id, ac_refs: refs.split(',').map(ref => ref.trim()), text }))
  const acIds = new Set(ac.map(item => item.id))
  if (tasks.some(task => !task.ac_refs.length || task.ac_refs.some(ref => !acIds.has(ref)))) errors.push('UNKNOWN_AC_REF')
  if (blocks.readiness && (!/^- result: .+$/m.test(blocks.readiness) || !/^- dependencies: .+$/m.test(blocks.readiness))) errors.push('INVALID_READINESS')
  const references = blocks.references ? items(blocks.references, /^- (product|architecture|ux): (.+)$/, 'INVALID_REFERENCE', null, errors)
    .map(([, kind, ref]) => ({ kind, ref })) : []
  return { story_id: meta.story_id, title: meta.title, status: meta.status, narrative: blocks.story,
    ac, tasks, readiness: blocks.readiness, references, risk: blocks.risk, errors: [...new Set(errors)] }
}

export function normativeDigest(story) {
  if (story.errors?.length) throw new Error(`INVALID_STORY:${story.errors.join(',')}`)
  const normative = { story_id: story.story_id, title: story.title, narrative: story.narrative,
    ac: story.ac, tasks: story.tasks, readiness: story.readiness, references: story.references, risk: story.risk }
  return hash(JSON.stringify(normative))
}

export function validateTaskSlices(story, plan) {
  const errors = []
  if (story.errors?.length) return ['INVALID_STORY']
  if (plan.schema_version !== 2 || plan.story_id !== story.story_id ||
      plan.story?.normative_digest !== normativeDigest(story) || typeof plan.story?.path !== 'string' || !plan.story.path) errors.push('INVALID_PLAN_STORY_BINDING')
  if (!Array.isArray(plan.slices) || !plan.slices.length) return [...errors, 'MISSING_SLICES']
  const ids = plan.slices.map(slice => slice.id)
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) errors.push('INVALID_SLICE_ID')
  const tasks = new Set(story.tasks.map(task => task.id)), covered = new Set()
  const graph = new Map()
  for (const slice of plan.slices) {
    if (!Array.isArray(slice.task_refs) || !slice.task_refs.length) errors.push('MISSING_TASK_REFS')
    for (const ref of Array.isArray(slice.task_refs) ? slice.task_refs : []) { if (!tasks.has(ref)) errors.push('UNKNOWN_TASK_REF'); else covered.add(ref) }
    if (!Array.isArray(slice.depends_on) || slice.depends_on.some(dep => !ids.includes(dep))) errors.push('INVALID_SLICE_DEPENDENCY')
    graph.set(slice.id, Array.isArray(slice.depends_on) ? slice.depends_on : [])
  }
  if ([...tasks].some(id => !covered.has(id))) errors.push('UNCOVERED_TASK')
  const visiting = new Set(), visited = new Set()
  const cyclic = id => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    if ((graph.get(id) ?? []).some(dep => graph.has(dep) && cyclic(dep))) return true
    visiting.delete(id); visited.add(id); return false
  }
  if (ids.some(cyclic)) errors.push('CYCLIC_SLICE_DEPENDENCY')
  return [...new Set(errors)]
}

export function attemptReceiptPath(storyId, sliceId, attemptId, kind) {
  if (!/^\d+\.\d+$/.test(storyId ?? '') || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sliceId ?? '') ||
      !ATTEMPT_ID.test(String(attemptId)) || !['implementation', 'verification', 'review'].includes(kind)) return null
  return `_bmad-output/implementation-artifacts/receipts/story-${storyId.replace('.', '-')}/${sliceId}-${kind}-attempt-${attemptId}.json`
}

function readReceiptRecord(root, plan, sliceId, kind, ref, expected, attemptId = null) {
  const errors = []
  if (!['implementation', 'verification', 'review'].includes(kind) || !expected || !ref || typeof ref.path !== 'string' ||
      !ref.path || path.isAbsolute(ref.path) || path.win32.isAbsolute(ref.path) ||
      ref.path.includes('\\') || ref.path.split('/').some(part => !part || part === '.' || part === '..') || !DIGEST.test(ref.digest ?? '')) return { receipt: null, errors: ['INVALID_RECEIPT_REF'] }
  let bytes, receipt
  try {
    bytes = readFileSync(path.resolve(root, ref.path))
    receipt = JSON.parse(bytes.toString('utf8'))
  } catch { return { receipt: null, errors: ['INVALID_RECEIPT_FILE'] } }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return { receipt: null, errors: ['INVALID_RECEIPT_FILE'] }
  if (receiptDigest(receipt) !== ref.digest) errors.push('RECEIPT_DIGEST_MISMATCH')
  if (receipt.story_id !== plan.story_id) errors.push('STORY_ID_MISMATCH')
  if (receipt.slice_id !== sliceId) errors.push('SLICE_ID_MISMATCH')
  if (receipt.checkpoint_commit !== expected.checkpoint_commit) errors.push('CHECKPOINT_MISMATCH')
  if (receipt.baseline_commit !== expected.baseline_commit) errors.push('BASELINE_MISMATCH')
  if (receipt.subject_digest !== expected.subject_digest) errors.push('SUBJECT_MISMATCH')
  if (receipt.changed_paths_sha256 !== expected.changed_paths_sha256) errors.push('CHANGED_PATHS_MISMATCH')
  if (attemptId !== null && receipt.attempt_id !== attemptId) errors.push('ATTEMPT_ID_MISMATCH')
  const schemaSupported = receipt.schema_version === 1 || (kind === 'review' && receipt.schema_version === 2)
  if (!schemaSupported || receipt.kind !== kind || !SHA.test(receipt.checkpoint_commit ?? '') ||
      !SHA.test(receipt.baseline_commit ?? '') || !SHA.test(receipt.created_from_head ?? '') ||
      receipt.created_from_head !== receipt.checkpoint_commit || !DIGEST.test(receipt.subject_digest ?? '') ||
      !DIGEST.test(receipt.changed_paths_sha256 ?? '')) errors.push('INVALID_RECEIPT_IDENTITY')
  if (!Array.isArray(receipt.commands) || !receipt.commands.length || receipt.commands.some(item =>
    !item || typeof item !== 'object' || Array.isArray(item) ||
    typeof item.command !== 'string' || !item.command || !Number.isInteger(item.exit_code) ||
    typeof item.tool !== 'string' || !item.tool || typeof item.environment !== 'string' || !item.environment)) errors.push('INVALID_RECEIPT_PAYLOAD')
  return { receipt, errors: [...new Set(errors)] }
}

export function readReceipt(root, plan, sliceId, kind) {
  const slice = plan.slices?.find(item => item.id === sliceId)
  const attemptId = slice?.current_attempt?.attempt_id
  return readReceiptRecord(root, plan, sliceId, kind, slice?.receipt_refs?.[kind], slice,
    Number.isInteger(attemptId) && attemptId > 1 ? attemptId : null)
}

export function readReceiptForAttempt(root, plan, sliceId, attempt, kind = 'implementation') {
  const attemptId = attempt?.attempt_id
  return readReceiptRecord(root, plan, sliceId, kind, attempt?.receipt_refs?.[kind], attempt,
    Number.isInteger(attemptId) && attemptId > 1 ? attemptId : null)
}

export function validateReceipt(root, plan, sliceId, kind) {
  return readReceipt(root, plan, sliceId, kind).errors
}
