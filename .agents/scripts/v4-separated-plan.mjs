import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest, validateTaskSlices, validateReceipt } from './check-artifact-contract.mjs'
import { validateFinalizationReceipt } from './finalization-contract.mjs'

const DIGEST = /^sha256:[0-9a-f]{64}$/
const SHA = /^[0-9a-f]{40,64}$/
const ACTIONS = new Set(['plan_slice', 'implement_slice', 'verify_slice', 'review_slice', 'resolve_blocker', 'reconcile_lifecycle', 'request_gate', 'finalize_story', 'complete_story'])
const STATUSES = new Set(['pending', 'active', 'checkpointed', 'verified', 'reviewed', 'blocked'])
const V3_KEYS = new Set(['run_id', 'runId', 'activeRunId', 'task_id', 'taskId', 'taskIds', 'workerId', 'lease', 'generation', 'humanGateRequired', 'dispatchId'])

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) ||
      path.win32.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null
}

function forbidden(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => V3_KEYS.has(key) || forbidden(child))
}

function commitState(root, sha) {
  if (typeof sha !== 'string' || !SHA.test(sha)) return 'MISSING'
  const exists = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, windowsHide: true })
  if (exists.status !== 0) return 'MISSING'
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: root, windowsHide: true })
  return ancestor.status === 0 ? 'FRESH' : 'NOT_ANCESTOR'
}

export function separatedStory(root, plan) {
  const file = safePath(root, plan.story?.path)
  if (!file || !existsSync(file)) return { story: null, error: 'STORY_MISSING' }
  const story = inspectStory(readFileSync(file, 'utf8'))
  if (story.errors.length) return { story, error: 'INVALID_STORY_CONTRACT' }
  return { story, error: null }
}

export function validateSeparatedPlan(root, id, plan, result) {
  const invalid = reason => result.reasons.push(reason)
  const stale = reason => result.reasons.push(reason)
  if (plan.story_id !== id) invalid('STORY_ID_MISMATCH')
  if (forbidden(plan)) invalid('FORBIDDEN_V3_STATE')
  if (plan.source !== undefined || plan.completion !== undefined || plan.ac !== undefined || plan.tasks !== undefined) invalid('MIXED_SCHEMA_PLAN')
  if (!['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].includes(plan.lifecycle_snapshot)) invalid('INVALID_LIFECYCLE_SNAPSHOT')
  if (!['backlog', 'ready-for-dev', 'in-progress', 'review', 'complete'].includes(plan.execution_status)) invalid('INVALID_EXECUTION_STATUS')
  if (!plan.story || !safePath(root, plan.story.path) || !DIGEST.test(plan.story.normative_digest ?? '')) invalid('INVALID_STORY_REF')
  else {
    const { story, error } = separatedStory(root, plan)
    if (error) invalid(error)
    else {
      result.storyStatus = story.status
      if (story.story_id !== plan.story_id) invalid('STORY_ID_MISMATCH')
      else if (normativeDigest(story) !== plan.story.normative_digest) stale('STORY_NORMATIVE_DIGEST_MISMATCH')
      if (Array.isArray(plan.slices) && plan.slices.every(slice => slice && typeof slice === 'object' && !Array.isArray(slice))) {
        result.reasons.push(...validateTaskSlices(story, plan).filter(reason => reason !== 'INVALID_PLAN_STORY_BINDING'))
      } else invalid('INVALID_SLICES')
    }
  }
  result.sourceDigest = plan.story?.normative_digest ?? null
  if (plan.upstream_epic !== undefined && (!plan.upstream_epic || typeof plan.upstream_epic !== 'object' ||
      !safePath(root, plan.upstream_epic.path) || !DIGEST.test(plan.upstream_epic.section_digest ?? ''))) invalid('INVALID_UPSTREAM_EPIC_REF')
  if (typeof plan.sprint_key !== 'string' || !plan.sprint_key.startsWith(`${id.replace('.', '-')}-`)) invalid('INVALID_SPRINT_KEY')
  else {
    const file = path.join(root, '_bmad-output/implementation-artifacts/sprint-status.yaml')
    if (!existsSync(file)) invalid('SPRINT_STATUS_MISSING')
    else {
      const section = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').split(/^development_status:\s*$/m)[1]
      if (!section) invalid('SPRINT_STATUS_INVALID')
      else {
        const entries = [...section.matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)].filter(match => match[1] === plan.sprint_key)
        if (entries.length !== 1) invalid('SPRINT_KEY_MISSING')
        else {
          result.actualLifecycle = entries[0][2]
          if (result.actualLifecycle !== plan.lifecycle_snapshot) stale('SNAPSHOT_MISMATCH')
        }
      }
    }
  }
  const slices = Array.isArray(plan.slices) ? plan.slices : []
  const ids = slices.map(slice => slice?.id)
  const relevant = new Set()
  function includeDependencies(sliceId) {
    if (relevant.has(sliceId)) return
    relevant.add(sliceId)
    const slice = slices.find(item => item?.id === sliceId)
    for (const dependency of Array.isArray(slice?.depends_on) ? slice.depends_on : []) includeDependencies(dependency)
  }
  includeDependencies(plan.current_slice)
  if (!slices.length || new Set(ids).size !== ids.length) invalid('INVALID_SLICES')
  if (!ids.includes(plan.current_slice)) invalid('INVALID_CURRENT_SLICE')
  for (const slice of slices) {
    if (!slice || typeof slice !== 'object' || Array.isArray(slice)) { invalid('INVALID_SLICES'); continue }
    if (!STATUSES.has(slice.status)) invalid('INVALID_SLICE_STATUS')
    if (slice.purpose !== undefined || slice.scope !== undefined || slice.implementation !== undefined ||
        slice.verification?.focused_checks !== undefined) invalid('MIXED_SCHEMA_PLAN')
    if (slice.receipt_refs !== undefined && (!slice.receipt_refs || typeof slice.receipt_refs !== 'object' || Array.isArray(slice.receipt_refs) ||
        Object.keys(slice.receipt_refs).some(kind => !['implementation', 'verification', 'review'].includes(kind)))) invalid('INVALID_RECEIPT_REF')
    if (slice.status === 'checkpointed' || slice.status === 'verified' || slice.status === 'reviewed') {
      if (!SHA.test(slice.baseline_commit ?? '') || !SHA.test(slice.checkpoint_commit ?? '') ||
          !DIGEST.test(slice.subject_digest ?? '') || !DIGEST.test(slice.changed_paths_sha256 ?? '')) invalid('INVALID_CHECKPOINT_METADATA')
      if (!slice.receipt_refs?.implementation) invalid('IMPLEMENTATION_RECEIPT_REQUIRED')
      const state = commitState(root, slice.checkpoint_commit)
      result.checkpointState = state === 'FRESH' ? 'FRESH' : 'STALE'
      if (state !== 'FRESH') stale(state === 'MISSING' ? 'CHECKPOINT_MISSING' : 'CHECKPOINT_NOT_ANCESTOR')
      const baselineState = commitState(root, slice.baseline_commit)
      if (baselineState !== 'FRESH') stale('BASELINE_COMMIT_INVALID')
    } else if (slice.checkpoint_commit || slice.baseline_commit || slice.receipt_refs?.implementation) invalid('UNEXPECTED_CHECKPOINT_METADATA')
    if (['verified', 'reviewed'].includes(slice.status) && !slice.receipt_refs?.verification) invalid('VERIFICATION_RECEIPT_REQUIRED')
    if (slice.status === 'reviewed' && !slice.receipt_refs?.review) invalid('REVIEW_RECEIPT_REQUIRED')
    for (const [kind, ref] of Object.entries(slice.receipt_refs ?? {})) {
      const file = safePath(root, ref?.path)
      if (!file || !DIGEST.test(ref?.digest ?? '')) invalid('INVALID_RECEIPT_REF')
      else if (!existsSync(file)) invalid('INVALID_RECEIPT_FILE')
      else if (relevant.has(slice.id)) {
        for (const error of validateReceipt(root, plan, slice.id, kind)) {
          (error === 'RECEIPT_DIGEST_MISMATCH' || error.endsWith('_MISMATCH') ? stale : invalid)(error)
        }
      }
    }
    if (slice.verification !== undefined && (!slice.verification || typeof slice.verification !== 'object' || Array.isArray(slice.verification) ||
        (slice.verification.progression_eligible !== undefined && typeof slice.verification.progression_eligible !== 'boolean'))) invalid('INVALID_VERIFICATION_SCHEMA')
  }
  if (!ACTIONS.has(plan.next_action?.kind)) invalid('UNKNOWN_ACTION')
  else {
    const storyAction = ['reconcile_lifecycle', 'request_gate', 'finalize_story', 'complete_story'].includes(plan.next_action.kind)
    if (storyAction ? plan.next_action.target !== 'story' : plan.next_action.target !== plan.current_slice) invalid('INVALID_ACTION_TARGET')
    const references = [...(Array.isArray(plan.blockers) ? plan.blockers : []),
      ...(Array.isArray(plan.unresolved_questions) ? plan.unresolved_questions : [])].map(item => item?.id)
    if (plan.next_action.reference && !references.includes(plan.next_action.reference)) invalid('INVALID_ACTION_REFERENCE')
  }
  for (const [name, entries] of [['blockers', plan.blockers], ['unresolved_questions', plan.unresolved_questions]]) {
    if (entries !== undefined && (!Array.isArray(entries) || entries.some(item => !item || typeof item.id !== 'string' || !item.id ||
        typeof item[name === 'blockers' ? 'reason' : 'question'] !== 'string'))) invalid(`INVALID_${name.toUpperCase()}`)
  }
  const reviewState = plan.lifecycle_snapshot === 'review' && plan.execution_status === 'complete'
  if (plan.next_action?.kind === 'complete_story' && !reviewState) invalid('COMPLETE_STORY_REQUIRES_REVIEW')
  if (reviewState && result.storyStatus !== 'review') invalid('STORY_STATUS_MISMATCH')
  if (reviewState && !slices.every(slice => slice?.status === 'reviewed')) invalid('REVIEW_SLICES_INCOMPLETE')
  if (reviewState && plan.human_approval !== undefined && plan.human_approval !== null) invalid('HUMAN_APPROVAL_MUST_BE_ABSENT')
  if (reviewState) {
    const finalization = plan.finalization
    if (!finalization || typeof finalization !== 'object' || Array.isArray(finalization)) {
      invalid('FINALIZATION_REQUIRED')
    } else {
      const ref = finalization.receipt_ref
      if (typeof ref !== 'string' || !safePath(root, ref)) invalid('INVALID_FINALIZATION_RECEIPT_REF')
      else {
        const finalizationResult = validateFinalizationReceipt(root, plan, ref)
        for (const error of finalizationResult.errors) {
          const staleError = error.includes('DIGEST_MISMATCH') || error === 'FINALIZATION_STORY_DIGEST_MISMATCH'
          (staleError ? stale : invalid)(error)
        }
      }
    }
  }
  if (plan.execution_status === 'complete' && (slices.some(slice => !['verified', 'reviewed'].includes(slice?.status)) ||
      (Array.isArray(plan.blockers) ? plan.blockers.length : 0) ||
      !['finalize_story', 'reconcile_lifecycle', 'complete_story'].includes(plan.next_action?.kind))) invalid('INCOMPLETE_CLAIM')
  const reconcile = result.actualLifecycle && ['backlog', 'ready-for-dev'].includes(result.actualLifecycle) &&
    (plan.execution_status === 'in-progress' || slices.some(slice => slice?.checkpoint_commit))
  if (reconcile && plan.next_action?.kind !== 'reconcile_lifecycle') invalid('RECONCILIATION_ACTION_REQUIRED')
  if (reconcile) result.reasons.push('EXECUTION_AHEAD_OF_LIFECYCLE')
  const staleReasons = new Set(['STORY_NORMATIVE_DIGEST_MISMATCH', 'SNAPSHOT_MISMATCH',
    'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR', 'BASELINE_COMMIT_INVALID', 'RECEIPT_DIGEST_MISMATCH',
    'CHECKPOINT_MISMATCH', 'BASELINE_MISMATCH', 'SUBJECT_MISMATCH', 'CHANGED_PATHS_MISMATCH'])
  result.status = result.reasons.some(reason => !staleReasons.has(reason) && reason !== 'EXECUTION_AHEAD_OF_LIFECYCLE') ? 'INVALID'
    : result.reasons.some(reason => staleReasons.has(reason)) ? 'STALE' : reconcile ? 'RECONCILIATION_REQUIRED' : 'READY'
  result.valid = ['READY', 'RECONCILIATION_REQUIRED'].includes(result.status)
  result.reasons = [...new Set(result.reasons)]
  return result
}
