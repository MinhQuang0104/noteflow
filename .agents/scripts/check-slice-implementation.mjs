import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { attemptReceiptPath, validateReceipt } from './check-artifact-contract.mjs'

const CODES = { READY: 0, RECONCILIATION_REQUIRED: 1, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 }
const SHA = /^[0-9a-f]{40,64}$/
const SHA256 = /^sha256:[0-9a-f]{64}$/

function canonicalPaths(items) {
  return [...new Set(items.map(item => String(item).replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function pathDigest(items) {
  const paths = canonicalPaths(items)
  return `sha256:${createHash('sha256').update(paths.length ? `${paths.join('\n')}\n` : '', 'utf8').digest('hex')}`
}

function samePaths(left, right) {
  const a = canonicalPaths(left)
  const b = canonicalPaths(right)
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
}

function requiredGit(root, args, failure) {
  const result = git(root, args)
  if (result.error || result.status === null || result.status !== 0) {
    const error = new Error(failure)
    error.gitFailure = true
    throw error
  }
  return result.stdout
}

function nulPaths(root, args, failure) {
  const separator = args.indexOf('--')
  const withNul = separator === -1
    ? [...args, '-z']
    : [...args.slice(0, separator), '-z', ...args.slice(separator)]
  return canonicalPaths(requiredGit(root, withNul, failure).split('\0'))
}

function validInputPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.' || normalized.startsWith('/') || path.win32.isAbsolute(value) ||
      normalized.split('/').some(segment => !segment || segment === '..')) return null
  return normalized
}

function planRelative(storyId) {
  return `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
}

function defaultResult(storyId, sliceId) {
  return {
    status: 'INVALID',
    valid: false,
    ready: false,
    storyId,
    sliceId,
    mode: null,
    branch: null,
    head: null,
    gitDir: null,
    gitCommonDir: null,
    lifecycle: null,
    lifecycleSnapshot: null,
    executionStatus: null,
    currentSlice: null,
    nextAction: null,
    sliceStatus: null,
    dependencies: [],
    blockers: [],
    unresolvedQuestions: [],
    stagedPaths: [],
    unstagedPaths: [],
    untrackedPaths: [],
    excludedUnrelatedPaths: [],
    relevantDirtyPaths: [],
    resumePaths: [],
    metadataPaths: [],
    baselineCommit: null,
    checkpointCommit: null,
    candidateChangedPaths: [],
    gitInventoryComplete: false,
    gitMetadataWriteRequired: false,
    reasons: [],
    warnings: []
  }
}

function finish(result, status) {
  result.status = status
  result.ready = status === 'READY'
  result.valid = !['STALE', 'INVALID', 'ERROR'].includes(status)
  result.reasons = [...new Set(result.reasons)]
  result.warnings = [...new Set(result.warnings)]
  return result
}

function commitExists(root, sha) {
  if (typeof sha !== 'string' || !SHA.test(sha)) return false
  const result = git(root, ['cat-file', '-e', `${sha}^{commit}`])
  if (result.error || result.status === null) throw new Error('GIT_COMMIT_QUERY_FAILED')
  return result.status === 0
}

function isAncestor(root, older, newer) {
  const result = git(root, ['merge-base', '--is-ancestor', older, newer])
  if (result.error || result.status === null) throw new Error('GIT_ANCESTRY_QUERY_FAILED')
  return result.status === 0
}

function dependencyEntry(plan, dependencyId) {
  const dependency = plan.slices.find(item => item.id === dependencyId)
  if (dependency.status === 'reviewed') {
    return { id: dependencyId, status: dependency.status, eligible: true, reason: 'REVIEWED' }
  }
  if (dependency.status !== 'verified') {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'STATUS_NOT_REVIEWED_OR_VERIFIED' }
  }
  if (dependency.verification?.progression_eligible !== true) {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'PROGRESSION_NOT_ELIGIBLE' }
  }
  if (dependency.review?.required === true) {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'REQUIRED_REVIEW_REMAINS' }
  }
  return { id: dependencyId, status: dependency.status, eligible: true, reason: 'VERIFIED_PROGRESSION_ELIGIBLE' }
}

function inspectImplementationMetadata(root, result, slice, planPath, plan) {
  const implementation = slice.implementation
  const baseline = slice.baseline_commit
  const checkpoint = slice.checkpoint_commit
  const attemptId = slice.current_attempt?.attempt_id ?? 1
  result.attemptId = attemptId
  result.historicalAttemptCount = Array.isArray(slice.attempt_history) ? slice.attempt_history.length : 0
  if (plan.schema_version === 2 && attemptId > 1 && slice.receipt_refs?.implementation?.path !== attemptReceiptPath(plan.story_id, slice.id, attemptId, 'implementation')) {
    result.reasons.push('CURRENT_ATTEMPT_RECEIPT_PATH_MISMATCH')
  }
  if (!commitExists(root, baseline)) result.reasons.push('BASELINE_COMMIT_INVALID')
  if (!commitExists(root, checkpoint)) result.reasons.push('CHECKPOINT_COMMIT_INVALID')
  if (result.reasons.includes('BASELINE_COMMIT_INVALID') || result.reasons.includes('CHECKPOINT_COMMIT_INVALID')) return false
  if (!isAncestor(root, baseline, checkpoint)) result.reasons.push('BASELINE_NOT_ANCESTOR_OF_CHECKPOINT')
  if (!isAncestor(root, checkpoint, result.head)) result.reasons.push('CHECKPOINT_NOT_ANCESTOR')
  const changedPaths = nulPaths(root,
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${baseline}..${checkpoint}`, '--'],
    'GIT_CHECKPOINT_DIFF_FAILED')
  if (!changedPaths.length) result.reasons.push('EMPTY_IMPLEMENTATION_CHECKPOINT')
  if (changedPaths.includes(planPath)) result.reasons.push('IMPLEMENTATION_CHECKPOINT_CONTAINS_PLAN')
  if (plan.schema_version === 2) {
    if (slice.changed_paths_sha256 !== pathDigest(changedPaths)) result.reasons.push('IMPLEMENTATION_CHANGED_PATH_DIGEST_MISMATCH')
    for (const error of validateReceipt(root, plan, slice.id, 'implementation')) result.reasons.push(error)
  } else if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) {
    result.reasons.push('IMPLEMENTATION_METADATA_REQUIRED')
  } else {
    if (!Array.isArray(implementation.changed_paths) || !samePaths(implementation.changed_paths, changedPaths)) {
      result.reasons.push('IMPLEMENTATION_CHANGED_PATHS_MISMATCH')
    }
    if (!SHA256.test(implementation.changed_paths_sha256 ?? '') ||
        implementation.changed_paths_sha256 !== pathDigest(changedPaths)) {
      result.reasons.push('IMPLEMENTATION_CHANGED_PATH_DIGEST_MISMATCH')
    }
    if (!Array.isArray(implementation.focused_checks) || !implementation.focused_checks.length ||
        implementation.focused_checks.some(item => !item || typeof item !== 'object' ||
          typeof item.command !== 'string' || typeof item.result !== 'string' || !Number.isInteger(item.exit_code))) {
      result.reasons.push('IMPLEMENTATION_FOCUSED_CHECKS_INVALID')
    }
    if (implementation.red_green !== undefined &&
        (!implementation.red_green || typeof implementation.red_green !== 'object' || Array.isArray(implementation.red_green))) {
      result.reasons.push('IMPLEMENTATION_RED_GREEN_EVIDENCE_INVALID')
    }
  }
  result.baselineCommit = baseline
  result.checkpointCommit = checkpoint
  result.candidateChangedPaths = changedPaths
  return !result.reasons.some(reason => [
    'BASELINE_NOT_ANCESTOR_OF_CHECKPOINT', 'CHECKPOINT_NOT_ANCESTOR', 'EMPTY_IMPLEMENTATION_CHECKPOINT',
    'IMPLEMENTATION_CHECKPOINT_CONTAINS_PLAN', 'IMPLEMENTATION_METADATA_REQUIRED', 'CURRENT_ATTEMPT_RECEIPT_PATH_MISMATCH',
    'IMPLEMENTATION_CHANGED_PATHS_MISMATCH', 'IMPLEMENTATION_CHANGED_PATH_DIGEST_MISMATCH',
    'IMPLEMENTATION_FOCUSED_CHECKS_INVALID', 'IMPLEMENTATION_RED_GREEN_EVIDENCE_INVALID',
    'INVALID_RECEIPT_REF', 'INVALID_RECEIPT_FILE', 'RECEIPT_DIGEST_MISMATCH', 'STORY_ID_MISMATCH',
    'SLICE_ID_MISMATCH', 'CHECKPOINT_MISMATCH', 'BASELINE_MISMATCH', 'SUBJECT_MISMATCH',
    'CHANGED_PATHS_MISMATCH', 'INVALID_RECEIPT_IDENTITY', 'INVALID_RECEIPT_PAYLOAD'
  ].includes(reason))
}

function persistedPlanAtHead(root, relative) {
  const result = git(root, ['show', `HEAD:${relative}`])
  if (result.error || result.status === null) throw new Error('GIT_PERSISTED_PLAN_QUERY_FAILED')
  if (result.status !== 0) return null
  try { return frontmatter(result.stdout) } catch { return null }
}

function classifyCheckpointCandidate(root, result, candidate, planPath) {
  const resolved = git(root, ['rev-parse', '--verify', `${candidate}^{commit}`])
  if (resolved.error || resolved.status === null) throw new Error('GIT_CHECKPOINT_CANDIDATE_QUERY_FAILED')
  if (resolved.status !== 0 || resolved.stdout.trim() !== result.head) {
    result.reasons.push('CHECKPOINT_CANDIDATE_MUST_EQUAL_HEAD')
    return false
  }
  const parents = requiredGit(root, ['rev-list', '--parents', '-n', '1', result.head],
    'GIT_CHECKPOINT_PARENT_QUERY_FAILED').trim().split(/\s+/).slice(1)
  if (parents.length !== 1) {
    result.reasons.push('CHECKPOINT_CANDIDATE_REQUIRES_SINGLE_PARENT')
    return false
  }
  const changedPaths = nulPaths(root,
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${parents[0]}..${result.head}`, '--'],
    'GIT_CHECKPOINT_DIFF_FAILED')
  if (!changedPaths.length) result.reasons.push('EMPTY_IMPLEMENTATION_CHECKPOINT')
  if (changedPaths.includes(planPath)) result.reasons.push('IMPLEMENTATION_CHECKPOINT_CONTAINS_PLAN')
  if (result.reasons.includes('EMPTY_IMPLEMENTATION_CHECKPOINT') ||
      result.reasons.includes('IMPLEMENTATION_CHECKPOINT_CONTAINS_PLAN')) return false
  result.baselineCommit = parents[0]
  result.checkpointCommit = result.head
  result.candidateChangedPaths = changedPaths
  result.warnings.push('CHECKPOINT_CANDIDATE_OWNERSHIP_EXPLICITLY_ASSERTED')
  return true
}

export function inspect(root, storyId, sliceId, options = {}) {
  const result = defaultResult(storyId, sliceId)
  const planPath = planRelative(storyId)
  try {
    result.branch = requiredGit(root, ['branch', '--show-current'], 'GIT_BRANCH_QUERY_FAILED').trim() || null
    result.head = requiredGit(root, ['rev-parse', 'HEAD'], 'GIT_HEAD_QUERY_FAILED').trim()
    result.gitDir = requiredGit(root, ['rev-parse', '--git-dir'], 'GIT_DIR_QUERY_FAILED').trim()
    result.gitCommonDir = requiredGit(root, ['rev-parse', '--git-common-dir'], 'GIT_COMMON_DIR_QUERY_FAILED').trim()
    result.stagedPaths = nulPaths(root,
      ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'],
      'GIT_STAGED_PATHS_FAILED')
    result.unstagedPaths = nulPaths(root,
      ['diff', '--name-only', '--diff-filter=ACDMRTUXB', '--'],
      'GIT_UNSTAGED_PATHS_FAILED')
    result.untrackedPaths = nulPaths(root,
      ['ls-files', '--others', '--exclude-standard', '--'],
      'GIT_UNTRACKED_PATHS_FAILED')
    result.gitInventoryComplete = true
  } catch (error) {
    result.reasons.push(error.message)
    return finish(result, 'ERROR')
  }

  const dirtyPaths = canonicalPaths([...result.stagedPaths, ...result.unstagedPaths, ...result.untrackedPaths])
  const excluded = new Set(options.excludeUnrelated ?? [])
  result.excludedUnrelatedPaths = dirtyPaths.filter(item => excluded.has(item))
  for (const item of excluded) if (!dirtyPaths.includes(item)) result.warnings.push(`EXCLUDED_PATH_NOT_DIRTY:${item}`)
  result.relevantDirtyPaths = dirtyPaths.filter(item => !excluded.has(item))
  result.resumePaths = canonicalPaths(options.resumePaths ?? [])

  let validation
  try { validation = validateStoryPlan(root, storyId) }
  catch (error) {
    result.reasons.push(error.message)
    return finish(result, 'ERROR')
  }
  result.lifecycle = validation.actualLifecycle
  result.lifecycleSnapshot = validation.lifecycleSnapshot
  result.executionStatus = validation.executionStatus
  result.currentSlice = validation.currentSlice
  result.nextAction = validation.nextAction
  if (validation.status !== 'READY') {
    result.reasons.push(...validation.reasons)
    return finish(result, validation.status)
  }

  const file = path.join(root, planPath)
  let plan
  try {
    if (!existsSync(file)) throw new Error('PLAN_MISSING')
    plan = frontmatter(readFileSync(file, 'utf8'))
  } catch (error) {
    result.reasons.push(error.message)
    return finish(result, 'INVALID')
  }
  const slice = plan.slices?.find(item => item.id === sliceId)
  if (!slice) {
    result.reasons.push('TARGET_SLICE_MISSING')
    return finish(result, 'INVALID')
  }
  result.sliceStatus = slice.status
  result.attemptId = slice.current_attempt?.attempt_id ?? 1
  result.historicalAttemptCount = Array.isArray(slice.attempt_history) ? slice.attempt_history.length : 0
  result.blockers = Array.isArray(plan.blockers) ? plan.blockers : []
  result.unresolvedQuestions = Array.isArray(plan.unresolved_questions) ? plan.unresolved_questions : []
  result.dependencies = (slice.depends_on ?? []).map(id => dependencyEntry(plan, id))

  if (plan.lifecycle_snapshot !== 'in-progress' || validation.actualLifecycle !== 'in-progress') {
    result.reasons.push('LIFECYCLE_NOT_IN_PROGRESS')
  }
  if (plan.execution_status !== 'in-progress') result.reasons.push('EXECUTION_STATUS_NOT_IN_PROGRESS')
  if (plan.current_slice !== sliceId) result.reasons.push('TARGET_NOT_CURRENT_SLICE')
  if (result.blockers.length) result.reasons.push('BLOCKERS_PRESENT')
  if (result.unresolvedQuestions.length) result.reasons.push('UNRESOLVED_QUESTIONS_PRESENT')
  for (const dependency of result.dependencies.filter(item => !item.eligible)) {
    result.reasons.push(`DEPENDENCY_NOT_ELIGIBLE:${dependency.id}`)
  }
  if (!result.branch) result.reasons.push('DETACHED_HEAD')

  const pending = slice.status === 'pending'
  const checkpointed = slice.status === 'checkpointed'
  const implementAction = plan.next_action?.kind === 'implement_slice' && plan.next_action?.target === sliceId
  const verifyAction = plan.next_action?.kind === 'verify_slice' && plan.next_action?.target === sliceId
  if (pending && !implementAction) result.reasons.push('IMPLEMENT_SLICE_ACTION_REQUIRED')
  else if (checkpointed && !verifyAction) result.reasons.push('VERIFY_SLICE_ACTION_REQUIRED')
  else if (!pending && !checkpointed) result.reasons.push('SLICE_STATUS_NOT_IMPLEMENTABLE')

  if (result.reasons.length) return finish(result, 'BLOCKED')

  if (checkpointed) {
    let metadataValid
    try { metadataValid = inspectImplementationMetadata(root, result, slice, planPath, plan) }
    catch (error) {
      result.reasons.push(error.message)
      return finish(result, 'ERROR')
    }
    if (!metadataValid) return finish(result, 'BLOCKED')
    const planStaged = result.stagedPaths.includes(planPath)
    const planUnstaged = result.unstagedPaths.includes(planPath)
    const receiptPath = plan.schema_version === 2 ? slice.receipt_refs?.implementation?.path : null
    result.metadataPaths = canonicalPaths([planPath, receiptPath].filter(Boolean))
    const otherDirty = result.relevantDirtyPaths.filter(item => item !== planPath && item !== receiptPath)
    if (planStaged || planUnstaged) {
      if (planStaged && planUnstaged) result.reasons.push('PLAN_UPDATE_PARTIALLY_STAGED')
      if (otherDirty.length) result.reasons.push('PLAN_UPDATE_NOT_PLAN_ONLY')
      const persisted = persistedPlanAtHead(root, planPath)
      const persistedSlice = persisted?.slices?.find(item => item.id === sliceId)
      if (!persisted || persisted.current_slice !== sliceId || persistedSlice?.status !== 'pending' ||
          persisted.next_action?.kind !== 'implement_slice' || persisted.next_action?.target !== sliceId) {
        result.reasons.push('PERSISTED_PLAN_NOT_PENDING_IMPLEMENTATION')
      }
      if (slice.checkpoint_commit !== result.head) result.reasons.push('PENDING_PLAN_CHECKPOINT_MUST_EQUAL_HEAD')
      if (result.reasons.length) return finish(result, 'BLOCKED')
      result.mode = 'PLAN_UPDATE_PENDING'
      result.gitMetadataWriteRequired = true
      return finish(result, 'READY')
    }
    if (result.relevantDirtyPaths.length) {
      result.reasons.push('RELEVANT_DIRTY_PATHS')
      return finish(result, 'BLOCKED')
    }
    result.mode = 'COMPLETE'
    result.gitMetadataWriteRequired = false
    result.warnings.push('DO_NOT_REIMPLEMENT')
    return finish(result, 'READY')
  }

  result.gitMetadataWriteRequired = true
  if (options.checkpointCandidate) {
    if (result.relevantDirtyPaths.length) {
      result.reasons.push('CHECKPOINT_CANDIDATE_REQUIRES_CLEAN_RELEVANT_WORKTREE')
      return finish(result, 'BLOCKED')
    }
    try {
      if (!classifyCheckpointCandidate(root, result, options.checkpointCandidate, planPath)) {
        return finish(result, 'BLOCKED')
      }
    } catch (error) {
      result.reasons.push(error.message)
      return finish(result, 'ERROR')
    }
    result.mode = 'CHECKPOINT_UNRECORDED'
    return finish(result, 'READY')
  }

  if (result.resumePaths.length) {
    if (!samePaths(result.resumePaths, result.relevantDirtyPaths)) {
      result.reasons.push('RESUME_SCOPE_MUST_EXACTLY_MATCH_RELEVANT_DIRTY_PATHS')
      return finish(result, 'BLOCKED')
    }
    result.mode = 'RESUME_WORKTREE'
    return finish(result, 'READY')
  }

  if (result.relevantDirtyPaths.length) {
    result.reasons.push('RELEVANT_DIRTY_PATHS')
    return finish(result, 'BLOCKED')
  }
  result.mode = 'FRESH'
  result.warnings.push('CHECKPOINT_UNRECORDED_REQUIRES_EXPLICIT_CANDIDATE')
  return finish(result, 'READY')
}

function parseArguments(argv) {
  const [verb, storyId, sliceId, ...rest] = argv
  const invalid = () => ({ error: 'USAGE: check <epic.story> <slice-id> [--resume-path <path>] [--exclude-unrelated <path>] [--checkpoint-candidate <sha>]' })
  if (verb !== 'check' || !/^\d+\.\d+$/.test(storyId ?? '') || !/^[A-Za-z0-9]+$/.test(sliceId ?? '')) return invalid()
  const options = { resumePaths: [], excludeUnrelated: [], checkpointCandidate: null }
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (!value) return invalid()
    if (flag === '--resume-path' || flag === '--exclude-unrelated') {
      const normalized = validInputPath(value)
      if (!normalized || normalized === planRelative(storyId)) return invalid()
      const target = flag === '--resume-path' ? options.resumePaths : options.excludeUnrelated
      target.push(normalized)
    } else if (flag === '--checkpoint-candidate') {
      if (options.checkpointCandidate || !SHA.test(value)) return invalid()
      options.checkpointCandidate = value
    } else return invalid()
  }
  options.resumePaths = canonicalPaths(options.resumePaths)
  options.excludeUnrelated = canonicalPaths(options.excludeUnrelated)
  if (options.resumePaths.some(item => options.excludeUnrelated.includes(item))) return invalid()
  if (options.checkpointCandidate && options.resumePaths.length) return invalid()
  return { storyId, sliceId, options }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) {
    const result = defaultResult(null, null)
    result.reasons.push(parsed.error)
    return finish(result, 'INVALID')
  }
  const rootResult = git(process.cwd(), ['rev-parse', '--show-toplevel'])
  if (rootResult.error || rootResult.status === null || rootResult.status !== 0) {
    const result = defaultResult(parsed.storyId, parsed.sliceId)
    result.reasons.push('GIT_ROOT_UNAVAILABLE')
    return finish(result, 'ERROR')
  }
  return inspect(path.resolve(rootResult.stdout.trim()), parsed.storyId, parsed.sliceId, parsed.options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = CODES[result.status]
  } catch (error) {
    const result = defaultResult(null, null)
    result.reasons.push(error.message)
    process.stdout.write(`${JSON.stringify(finish(result, 'ERROR'))}\n`)
    process.exitCode = CODES.ERROR
  }
}
