import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'
import { validateFinalizationReceipt, stableFinalizationDigest } from './finalization-contract.mjs'

const CODES = { READY: 0, RECONCILIATION_REQUIRED: 1, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 }
const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const NOISE = new Set(['_bmad/scripts/tests/__pycache__/test_agent_architecture.cpython-314.pyc'])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function stableDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status === null) throw new Error('GIT_UNAVAILABLE')
  return result
}

function gitOutput(root, args, failure) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.trim()
}

function gitPaths(root, args, failure) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.split(/\r?\n/).map(item => item.replaceAll('\\', '/')).filter(Boolean).sort()
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null
}

function planRelative(storyId) {
  return `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
}

function receiptRelative(storyId) {
  return `_bmad-output/implementation-artifacts/receipts/story-${storyId.replace('.', '-')}/finalization.json`
}

function readLifecycle(root, sprintKey) {
  const file = safePath(root, '_bmad-output/implementation-artifacts/sprint-status.yaml')
  if (!file || !existsSync(file)) throw new Error('SPRINT_STATUS_MISSING')
  const section = readFileSync(file, 'utf8').replaceAll('\r\n', '\n').split(/^development_status:\s*$/m)[1]
  const matches = [...(section ?? '').matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)].filter(match => match[1] === sprintKey)
  if (matches.length !== 1) throw new Error('SPRINT_KEY_MISSING')
  return matches[0][2]
}

function defaultResult(storyId, expectedHead) {
  return {
    story_id: storyId,
    status: 'ERROR',
    valid: false,
    ready: false,
    terminal: false,
    approval_fresh: false,
    expected_head: expectedHead ?? null,
    head: null,
    lifecycle: null,
    execution_status: null,
    next_action: null,
    story_normative_digest: null,
    finalization_receipt_digest: null,
    done_gate_summary_digest: null,
    scope_paths_digest: null,
    implementation_commit_set_digest: null,
    final_scoped_tree_digest: null,
    preview: null,
    recovery_classification: null,
    reasons: []
  }
}

function classify(result, flags) {
  result.reasons = [...new Set(result.reasons)]
  if (flags.invalid) result.status = 'INVALID'
  else if (flags.stale) result.status = 'STALE'
  else if (flags.reconciliation) result.status = 'RECONCILIATION_REQUIRED'
  else if (flags.blocked) result.status = 'BLOCKED'
  else result.status = 'READY'
  result.ready = result.status === 'READY'
  result.valid = !['INVALID', 'ERROR'].includes(result.status)
  return result
}

function issue(result, flags, reason, kind) {
  result.reasons.push(reason)
  flags[kind] = true
}

function approvalShapeValid(approval) {
  return Boolean(approval && typeof approval === 'object' && !Array.isArray(approval))
}

function approvalFieldErrors(approval, snapshot) {
  const errors = []
  if (!approvalShapeValid(approval)) return ['HUMAN_APPROVAL_MISSING']
  if (approval.schema_version !== 1) errors.push('INVALID_HUMAN_APPROVAL_SCHEMA_VERSION')
  if (approval.story_id !== snapshot.story_id) errors.push('HUMAN_APPROVAL_STORY_ID_MISMATCH')
  if (approval.approver_type !== 'human') errors.push('INVALID_HUMAN_APPROVER_TYPE')
  if (approval.decision !== 'APPROVED') errors.push('HUMAN_APPROVAL_DECISION_NOT_APPROVED')
  if (typeof approval.approved_at !== 'string' || Number.isNaN(Date.parse(approval.approved_at))) errors.push('INVALID_HUMAN_APPROVAL_TIMESTAMP')
  if (approval.approved_action !== 'complete_story') errors.push('HUMAN_APPROVAL_ACTION_MISMATCH')
  if (approval.disclosures_acknowledged !== true) errors.push('DISCLOSURES_NOT_ACKNOWLEDGED')
  for (const [field, expected] of [
    ['story_normative_digest', snapshot.story_normative_digest],
    ['finalization_receipt_digest', snapshot.finalization_receipt_digest],
    ['done_gate_summary_digest', snapshot.done_gate_summary_digest],
    ['scope_paths_digest', snapshot.scope_paths_digest],
    ['implementation_commit_set_digest', snapshot.implementation_commit_set_digest],
    ['final_scope_digest', snapshot.final_scoped_tree_digest],
    ['final_scoped_tree_digest', snapshot.final_scoped_tree_digest]
  ]) {
    if (!DIGEST.test(approval[field] ?? '')) errors.push('INVALID_HUMAN_APPROVAL_' + field.toUpperCase())
    else if (approval[field] !== expected) errors.push('HUMAN_APPROVAL_' + field.toUpperCase() + '_MISMATCH')
  }
  if (!SHA.test(approval.approved_review_head ?? '')) errors.push('INVALID_HUMAN_APPROVAL_REVIEW_HEAD')
  else if (approval.approved_review_head !== snapshot.approved_review_head) errors.push('HUMAN_APPROVAL_REVIEW_HEAD_MISMATCH')
  if (!SHA.test(approval.approved_commit ?? '')) errors.push('INVALID_HUMAN_APPROVAL_COMMIT')
  else if (approval.approved_commit !== approval.approved_review_head) errors.push('HUMAN_APPROVAL_COMMIT_REVIEW_HEAD_MISMATCH')
  return [...new Set(errors)]
}

function statusAndScope(root, storyId, expectedHead, plan, story, receipt, result, flags) {
  let finalization
  try {
    finalization = inspectFinalization(root, storyId, expectedHead)
  } catch (error) {
    issue(result, flags, error.message, 'invalid')
    finalization = {}
  }
  const scope = finalization.scope ?? {}
  const snapshot = {
    story_id: storyId,
    story_title: story.title,
    lifecycle: 'review',
    story_normative_digest: plan.story.normative_digest,
    finalization_receipt_digest: stableFinalizationDigest(receipt),
    done_gate_disposition: receipt.done_gate_disposition,
    done_gate_summary_digest: null,
    canonical_disclosures: finalization.canonical_disclosures ?? [],
    ac_coverage: finalization.ac_coverage ?? [],
    ac_coverage_summary: finalization.ac_coverage_summary ?? null,
    implementation_path_count: receipt.scope_path_count,
    scope_paths_digest: receipt.scope_paths_digest,
    implementation_commit_set_digest: receipt.implementation_commit_set_digest,
    final_scoped_tree_digest: receipt.final_scoped_tree_digest,
    final_scope_digest: receipt.final_scoped_tree_digest,
    approved_review_head: plan.human_approval?.approved_review_head ?? expectedHead,
    approved_action: 'complete_story',
    pending_action: { kind: 'complete_story', target: 'story' }
  }
  snapshot.done_gate_summary_digest = doneGateSummaryDigest(snapshot)
  result.story_normative_digest = snapshot.story_normative_digest
  result.finalization_receipt_digest = snapshot.finalization_receipt_digest
  result.done_gate_summary_digest = snapshot.done_gate_summary_digest
  result.scope_paths_digest = snapshot.scope_paths_digest
  result.implementation_commit_set_digest = snapshot.implementation_commit_set_digest
  result.final_scoped_tree_digest = snapshot.final_scoped_tree_digest
  result.preview = snapshot

  if (scope.scope_paths_digest && scope.scope_paths_digest !== receipt.scope_paths_digest) issue(result, flags, 'FINALIZATION_SCOPE_PATHS_DRIFT', 'stale')
  if (scope.implementation_commit_set_digest && scope.implementation_commit_set_digest !== receipt.implementation_commit_set_digest) issue(result, flags, 'FINALIZATION_COMMIT_SET_DRIFT', 'stale')
  if (scope.final_scoped_tree_digest && scope.final_scoped_tree_digest !== receipt.final_scoped_tree_digest) issue(result, flags, 'FINALIZATION_SCOPED_TREE_DRIFT', 'stale')
  if (finalization.slice_set_digest && finalization.slice_set_digest !== receipt.slice_set_digest) issue(result, flags, 'FINALIZATION_SLICE_SET_DRIFT', 'stale')
  if (finalization.receipt_set_digest && finalization.receipt_set_digest !== receipt.receipt_set_digest) issue(result, flags, 'FINALIZATION_RECEIPT_SET_DRIFT', 'stale')
  if (stableDigest(finalization.ac_coverage ?? []) !== receipt.ac_coverage_digest) issue(result, flags, 'FINALIZATION_AC_COVERAGE_DRIFT', 'stale')
  if (stableDigest(finalization.canonical_disclosures ?? []) !== receipt.canonical_disclosures_digest) issue(result, flags, 'FINALIZATION_DISCLOSURES_DRIFT', 'stale')
  const ignored = new Set([
    'HUMAN_GATE_PENDING', 'FINALIZE_STORY_ACTION_REQUIRED', 'EXECUTION_STATUS_NOT_IN_PROGRESS',
    'LIFECYCLE_NOT_IN_PROGRESS', 'DONE_PROJECTION_MISMATCH', 'LIFECYCLE_PROJECTION_MISMATCH',
    'COMPLETION_METADATA_BEFORE_REVIEW', 'STORY_STATUS_MISMATCH', 'SPRINT_STATUS_MISMATCH', 'SNAPSHOT_MISMATCH',
    'PARTIAL_STORY_ONLY', 'PARTIAL_PLAN_ONLY', 'PARTIAL_SPRINT_ONLY', 'RECONCILIATION_REQUIRED'
  ])
  for (const reason of finalization.reasons ?? []) {
    if (ignored.has(reason) || result.reasons.includes(reason)) continue
    const kind = reason.includes('DRIFT') || reason.includes('STALE') || reason.includes('MISMATCH') || reason.includes('NOT_ANCESTOR')
      ? 'stale' : reason.includes('MISSING') || reason.includes('REQUIRED') ? 'blocked' : 'invalid'
    issue(result, flags, reason, kind)
  }
  return { finalization, snapshot }
}

function approvalCommitState(root, approval, allowedPaths, result, flags) {
  if (!SHA.test(approval?.approved_commit ?? '')) return
  const head = result.head
  if (git(root, ['merge-base', '--is-ancestor', approval.approved_commit, head]).status !== 0) {
    issue(result, flags, 'HUMAN_APPROVAL_REVIEW_HEAD_NOT_ANCESTOR', 'stale')
    return
  }
  const changed = gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${approval.approved_commit}..${head}`, '--'], 'GIT_APPROVAL_DIFF_FAILED')
  if (changed.some(item => !allowedPaths.has(item))) issue(result, flags, 'PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL', 'stale')
}

function parentCommit(root, commit) {
  return gitOutput(root, ['rev-parse', `${commit}^`], 'APPROVAL_REVIEW_HEAD_UNAVAILABLE')
}

function approvalReviewHeadState(root, approval, head, allDone, result, flags) {
  if (!SHA.test(approval?.approved_review_head ?? '') || !SHA.test(approval?.approved_commit ?? '')) return
  const durableApprovalCommit = allDone ? parentCommit(root, head) : head
  const reviewHead = parentCommit(root, durableApprovalCommit)
  if (approval.approved_commit !== approval.approved_review_head || reviewHead !== approval.approved_review_head) {
    issue(result, flags, 'HUMAN_APPROVAL_REVIEW_HEAD_MISMATCH', 'stale')
  }
}

function dirtyPaths(root) {
  return [...new Set([
    ...gitPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_STAGED_PATHS_FAILED'),
    ...gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_UNSTAGED_PATHS_FAILED'),
    ...gitPaths(root, ['ls-files', '--others', '--exclude-standard', '--'], 'GIT_UNTRACKED_PATHS_FAILED')
  ])].filter(item => !NOISE.has(item) && !item.startsWith('.agent-state/v4-observations/')).sort()
}

function receiptDirectory(storyId) {
  return '_bmad-output/implementation-artifacts/receipts/story-' + storyId.replace('.', '-')
}

function storyMetadataPaths(storyId, plan, planPath) {
  const paths = [planPath, plan.story?.path, receiptDirectory(storyId), plan.finalization?.receipt_ref]
  for (const slice of plan.slices ?? []) {
    for (const ref of Object.values(slice.receipt_refs ?? {})) paths.push(ref?.path)
    for (const attempt of slice.attempt_history ?? []) for (const ref of Object.values(attempt.receipt_refs ?? {})) paths.push(ref?.path)
    for (const ref of Object.values(slice.current_attempt?.receipt_refs ?? {})) paths.push(ref?.path)
  }
  return [...new Set(paths.filter(item => typeof item === 'string' && item))].sort()
}

function snapshotCheckout(root, commit) {
  const parent = mkdtempSync(path.join(tmpdir(), 'v4-completion-snapshot-'))
  const clone = path.join(parent, 'repo')
  const run = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 300000 })
  // --shared borrows the source object store through alternates; the source
  // repository, its index and its worktrees are never written.
  const cloned = run(parent, ['clone', '--quiet', '--shared', '--no-checkout', root, clone])
  const checkedOut = cloned.status === 0 ? run(clone, ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', commit]) : cloned
  if (cloned.status !== 0 || checkedOut.status !== 0) {
    rmSync(parent, { recursive: true, force: true })
    throw new Error('COMPLETION_SNAPSHOT_UNAVAILABLE')
  }
  return { root: clone, cleanup: () => rmSync(parent, { recursive: true, force: true }) }
}

// A terminal Story stays verifiable after later commits (an integration merge,
// later Stories). The full Done/Human Gate check runs against the completion
// commit itself, and the Story's own Plan, Story file and receipts must be
// byte-identical from that commit to HEAD. Product files may evolve afterwards;
// that is later work, not drift of the approved snapshot.
function inspectTerminalAtCompletion(root, storyId, plan, planPath, result, expectedHead, options) {
  const completion = gitOutput(root, ['log', '-1', '--format=%H', result.head, '--', planPath], 'COMPLETION_COMMIT_UNAVAILABLE')
  if (!SHA.test(completion) || completion === result.head) return null
  const atCompletion = git(root, ['show', `${completion}:${planPath}`])
  if (atCompletion.status !== 0) return null
  const completedPlan = frontmatter(atCompletion.stdout)
  if (completedPlan.lifecycle_snapshot !== 'done' || completedPlan.next_action !== null) return null

  const flags = { invalid: false, stale: false, reconciliation: false, blocked: false }
  const outer = { reasons: [] }
  if (result.head !== expectedHead) issue(outer, flags, 'EXPECTED_HEAD_MISMATCH', 'stale')
  const protectedPaths = storyMetadataPaths(storyId, plan, planPath)
  const changed = gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${completion}..${result.head}`, '--', ...protectedPaths], 'GIT_COMPLETION_DIFF_FAILED')
  if (changed.length) issue(outer, flags, 'STORY_METADATA_DRIFT_AFTER_COMPLETION', 'stale')
  const dirty = dirtyPaths(root)
  if (dirty.some(item => protectedPaths.some(prefix => item === prefix || item.startsWith(prefix + '/')))) issue(outer, flags, 'STORY_METADATA_DIRTY_AFTER_COMPLETION', 'stale')
  if (readLifecycle(root, plan.sprint_key) !== 'done') issue(outer, flags, 'SPRINT_LIFECYCLE_NOT_DONE', 'reconciliation')

  const snapshot = snapshotCheckout(root, completion)
  let inner
  try { inner = inspectCompletion(snapshot.root, storyId, completion, { ...options, atCompletionCommit: true }) } finally { snapshot.cleanup() }
  for (const [status, kind] of [['INVALID', 'invalid'], ['ERROR', 'invalid'], ['STALE', 'stale'], ['RECONCILIATION_REQUIRED', 'reconciliation'], ['BLOCKED', 'blocked']]) {
    if (inner.status === status) flags[kind] = true
  }
  const combined = {
    ...inner,
    expected_head: expectedHead,
    head: result.head,
    evaluated_commit: completion,
    evaluation: 'TERMINAL_AT_COMPLETION_COMMIT',
    reasons: [...inner.reasons, ...outer.reasons]
  }
  classify(combined, flags)
  combined.approval_fresh = combined.status === 'READY' && inner.approval_fresh === true
  if (combined.status !== 'READY') combined.recovery_classification = inner.status === 'READY' ? 'TERMINAL_DRIFT_AFTER_COMPLETION' : inner.recovery_classification
  return combined
}

export function doneGateSummaryDigest(snapshot) {
  return stableDigest({
    done_gate_disposition: snapshot.done_gate_disposition,
    ac_coverage: snapshot.ac_coverage ?? [],
    canonical_disclosures: snapshot.canonical_disclosures ?? []
  })
}

export function explicitApprovalInput(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    value.action === 'approve_exact_scope' && value.disclosures_acknowledged === true)
}

export function approvalRecordForSnapshot(snapshot, approvedCommit, approvedAt = new Date().toISOString()) {
  return {
    schema_version: 1,
    story_id: snapshot.story_id,
    approver_type: 'human',
    decision: 'APPROVED',
    approved_at: approvedAt,
    story_normative_digest: snapshot.story_normative_digest,
    finalization_receipt_digest: snapshot.finalization_receipt_digest,
    done_gate_summary_digest: snapshot.done_gate_summary_digest,
    scope_paths_digest: snapshot.scope_paths_digest,
    implementation_commit_set_digest: snapshot.implementation_commit_set_digest,
    final_scope_digest: snapshot.final_scoped_tree_digest,
    final_scoped_tree_digest: snapshot.final_scoped_tree_digest,
    approved_review_head: approvedCommit,
    approved_commit: approvedCommit,
    approved_action: 'complete_story',
    disclosures_acknowledged: true
  }
}

export function inspectCompletion(root, storyId, expectedHead, options = {}) {
  const result = defaultResult(storyId, expectedHead)
  const flags = { invalid: false, stale: false, reconciliation: false, blocked: false }
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '')) return classify(result, { ...flags, invalid: true })
    if (!SHA.test(expectedHead ?? '')) return classify(result, { ...flags, invalid: true })
    result.head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (result.head !== expectedHead) issue(result, flags, 'EXPECTED_HEAD_MISMATCH', 'stale')
    const planPath = planRelative(storyId)
    const planFile = safePath(root, planPath)
    if (!planFile || !existsSync(planFile)) return classify(result, { ...flags, invalid: true })
    const planText = readFileSync(planFile, 'utf8')
    const plan = frontmatter(planText)
    result.lifecycle = plan.lifecycle_snapshot ?? null
    result.execution_status = plan.execution_status ?? null
    result.next_action = plan.next_action ?? null
    if (!options.atCompletionCommit && plan.lifecycle_snapshot === 'done' && plan.next_action === null) {
      const terminal = inspectTerminalAtCompletion(root, storyId, plan, planPath, result, expectedHead, options)
      if (terminal) return terminal
    }
    const storyFile = safePath(root, plan.story?.path)
    if (!storyFile || !existsSync(storyFile)) return classify(result, { ...flags, invalid: true })
    const story = inspectStory(readFileSync(storyFile, 'utf8'))
    if (story.errors.length) issue(result, flags, 'INVALID_STORY_CONTRACT', 'invalid')
    const actualDigest = normativeDigest(story)
    if (actualDigest !== plan.story?.normative_digest) issue(result, flags, 'STORY_NORMATIVE_DIGEST_STALE', 'stale')

    const planCheck = validateStoryPlan(root, storyId)
    if (!planCheck.valid && !planCheck.reasons.every(reason => reason === 'HUMAN_APPROVAL_MUST_BE_ABSENT')) {
      const staleReasons = new Set([
        'STORY_NORMATIVE_DIGEST_MISMATCH', 'RECEIPT_DIGEST_MISMATCH', 'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR',
        'HUMAN_APPROVAL_COMMIT_STALE', 'HUMAN_APPROVAL_STORY_ID_MISMATCH', 'HUMAN_APPROVAL_STORY_DIGEST_MISMATCH',
        'HUMAN_APPROVAL_RECEIPT_DIGEST_MISMATCH', 'HUMAN_APPROVAL_SCOPE_DIGEST_MISMATCH',
        'HUMAN_APPROVAL_COMMIT_SET_DIGEST_MISMATCH', 'HUMAN_APPROVAL_FINAL_SCOPE_DIGEST_MISMATCH',
        'HUMAN_APPROVAL_TREE_DIGEST_MISMATCH', 'HUMAN_APPROVAL_COMMIT_REVIEW_HEAD_MISMATCH'
      ])
      const blockedReasons = new Set(['DISCLOSURES_NOT_ACKNOWLEDGED', 'FINALIZATION_RECEIPT_MISSING'])
      const reconciliationReasons = new Set(['STORY_STATUS_MISMATCH', 'SNAPSHOT_MISMATCH', 'COMPLETE_STORY_REQUIRES_REVIEW'])
      for (const reason of planCheck.reasons) issue(result, flags, reason,
        staleReasons.has(reason) ? 'stale' : blockedReasons.has(reason) ? 'blocked' :
          reconciliationReasons.has(reason) ? 'reconciliation' : 'invalid')
    }

    const receiptPath = plan.finalization?.receipt_ref ?? receiptRelative(storyId)
    const receiptFile = safePath(root, receiptPath)
    if (!receiptFile || !existsSync(receiptFile)) {
      issue(result, flags, 'FINALIZATION_RECEIPT_MISSING', 'blocked')
      return classify(result, flags)
    }
    let receipt
    try { receipt = JSON.parse(readFileSync(receiptFile, 'utf8')) } catch { issue(result, flags, 'INVALID_FINALIZATION_RECEIPT_FILE', 'invalid'); return classify(result, flags) }
    const receiptCheck = validateFinalizationReceipt(root, plan, receiptPath, receipt)
    for (const error of receiptCheck.errors) {
      const staleError = error.includes('DIGEST_MISMATCH') || error.endsWith('_MISMATCH')
      issue(result, flags, error, staleError ? 'stale' : 'invalid')
    }
    const { snapshot } = statusAndScope(root, storyId, expectedHead, plan, story, receipt, result, flags)
    const sprintLifecycle = readLifecycle(root, plan.sprint_key)
    const projections = [story.status, plan.lifecycle_snapshot, sprintLifecycle]
    const allReview = story.status === 'review' && plan.lifecycle_snapshot === 'review' && sprintLifecycle === 'review' &&
      plan.execution_status === 'complete' && plan.next_action?.kind === 'complete_story' && plan.next_action?.target === 'story'
    const allDone = story.status === 'done' && plan.lifecycle_snapshot === 'done' && sprintLifecycle === 'done' &&
      plan.execution_status === 'complete' && plan.next_action === null
    const doneCount = projections.filter(item => item === 'done').length
    const reviewCount = projections.filter(item => item === 'review').length
    if (allDone) {
      result.terminal = true
      result.recovery_classification = 'TERMINAL_HEALTHY'
    } else if (doneCount === 1) {
      result.recovery_classification = story.status === 'done' ? 'PARTIAL_STORY_ONLY' : plan.lifecycle_snapshot === 'done' ? 'PARTIAL_PLAN_ONLY' : 'PARTIAL_SPRINT_ONLY'
      issue(result, flags, result.recovery_classification, 'reconciliation')
    } else if (doneCount > 0 || reviewCount !== 3) {
      result.recovery_classification = 'RECONCILIATION_REQUIRED'
      issue(result, flags, 'LIFECYCLE_PROJECTION_MISMATCH', 'reconciliation')
    } else if (!allReview) {
      issue(result, flags, 'COMPLETE_STORY_REQUIRES_REVIEW', 'blocked')
    }

    const approval = plan.human_approval
    const approvalPresent = approvalShapeValid(approval)
    const paths = dirtyPaths(root)
    if (approvalPresent) {
      const approvalErrors = approvalFieldErrors(approval, snapshot)
      for (const error of approvalErrors) {
        const kind = error === 'DISCLOSURES_NOT_ACKNOWLEDGED' ? 'blocked' :
          error.includes('MISMATCH') || error === 'HUMAN_APPROVAL_REVIEW_HEAD_NOT_ANCESTOR' ? 'stale' : 'invalid'
        issue(result, flags, error, kind)
      }
      const allowedApprovalPaths = new Set(allDone ? [planPath, plan.story.path, '_bmad-output/implementation-artifacts/sprint-status.yaml'] : [planPath])
      approvalCommitState(root, approval, allowedApprovalPaths, result, flags)
      const allowedDirtyPaths = new Set(allReview ? [planPath] : [planPath, plan.story.path, '_bmad-output/implementation-artifacts/sprint-status.yaml'])
      if (paths.some(item => !allowedDirtyPaths.has(item))) issue(result, flags, 'PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL', 'stale')
      const approvalPreviewOnly = allReview && paths.length === 1 && paths[0] === planPath
      if (!approvalPreviewOnly && (allReview || allDone)) approvalReviewHeadState(root, approval, result.head, allDone, result, flags)
      if (approvalPreviewOnly) {
        result.recovery_classification = 'APPROVAL_PREVIEW_ONLY'
        issue(result, flags, 'APPROVAL_PREVIEW_ONLY', 'reconciliation')
      } else if (allReview && !flags.stale && !flags.invalid && !flags.blocked) {
        result.recovery_classification = 'APPROVAL_DURABLE_PENDING_COMPLETION'
        result.approval_fresh = true
      }
    } else if (allReview && !options.allowApproval) {
      result.recovery_classification = 'HUMAN_GATE_REQUIRED'
      issue(result, flags, 'HUMAN_APPROVAL_REQUIRED', 'blocked')
    }

    if (allDone && !approvalPresent) issue(result, flags, 'HUMAN_APPROVAL_REQUIRED', 'blocked')
    if (allDone && approvalPresent && !flags.stale && !flags.invalid && !flags.blocked) {
      result.approval_fresh = true
      result.recovery_classification = 'TERMINAL_HEALTHY'
    }
    result.preview = snapshot
    return classify(result, flags)
  } catch (error) {
    result.reasons.push(error.message)
    result.status = 'ERROR'
    result.valid = false
    result.ready = false
    return result
  }
}

export function completionSnapshot(root, storyId, expectedHead) {
  return inspectCompletion(root, storyId, expectedHead).preview
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [verb, storyId, flag, expectedHead, ...rest] = process.argv.slice(2)
    if (verb !== 'check' || !/^\d+\.\d+$/.test(storyId ?? '') || flag !== '--expected-head' || !SHA.test(expectedHead ?? '') || rest.length) {
      process.stdout.write(JSON.stringify({ status: 'INVALID', valid: false, ready: false, reasons: ['USAGE: check <epic.story> --expected-head <sha>'] }) + '\n')
      process.exitCode = CODES.INVALID
    } else {
      const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
      const result = inspectCompletion(root, storyId, expectedHead)
      process.stdout.write(JSON.stringify(result) + '\n')
      process.exitCode = CODES[result.status] ?? CODES.ERROR
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'ERROR', valid: false, ready: false, reasons: [error.message] }) + '\n')
    process.exitCode = CODES.ERROR
  }
}
