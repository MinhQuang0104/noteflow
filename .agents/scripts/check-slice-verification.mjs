import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { readReceipt } from './check-artifact-contract.mjs'
import { separatedStory } from './v4-separated-plan.mjs'

const CODES = { READY: 0, RERUN_REQUIRED: 0, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 }
const SHA = /^[0-9a-f]{40,64}$/
const SHA256 = /^sha256:[0-9a-f]{64}$/

export function canonicalPaths(paths) {
  return [...new Set(paths.map(item => String(item).trim().replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean))]
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
}

export function pathListDigest(paths) {
  const canonical = canonicalPaths(paths)
  const serialized = canonical.length ? `${canonical.join('\n')}\n` : ''
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

export function stableDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status === null) throw new Error('GIT_UNAVAILABLE')
  return result
}

function gitPaths(root, args) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error('GIT_QUERY_FAILED')
  return canonicalPaths(result.stdout.split(/\r?\n/))
}

function commitExists(root, sha) {
  return typeof sha === 'string' && SHA.test(sha) && git(root, ['cat-file', '-e', `${sha}^{commit}`]).status === 0
}

function isAncestor(root, older, newer) {
  return git(root, ['merge-base', '--is-ancestor', older, newer]).status === 0
}

function equalPaths(left, right) {
  const a = canonicalPaths(left)
  const b = canonicalPaths(right)
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function intersect(paths, scope) {
  const allowed = new Set(scope)
  return canonicalPaths(paths.filter(item => allowed.has(item)))
}

function planFile(root, storyId) {
  return path.join(root, `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`)
}

function defaultManifest(storyId, sliceId) {
  return {
    storyId,
    sliceId,
    valid: false,
    status: 'INVALID',
    mode: 'checkpoint',
    head: null,
    baselineCommit: null,
    checkpointCommit: null,
    checkpointFreshness: 'UNKNOWN',
    changedPaths: [],
    changedPathsSha256: null,
    postCheckpointDrift: [],
    workingDrift: [],
    sourceFreshness: 'UNKNOWN',
    referenceFreshness: 'UNKNOWN',
    evidence: [],
    reviewFreshness: { status: 'NOT_AVAILABLE', reasons: [] },
    legacy: { sliceStatusDrift: false, baselineDerivedFromFirstParent: false },
    reasons: []
  }
}

function referenceEntries(plan, slice) {
  return [...(plan.architecture_refs ?? []), ...(plan.ux_refs ?? []), ...(slice.verification?.subject?.references ?? [])]
    .map(item => typeof item === 'string'
      ? { path: item.split('#')[0], digest: null }
      : { path: item?.path?.split('#')[0], digest: item?.digest ?? item?.sha256 ?? null })
    .filter(item => item.path)
}

function workingPaths(root, args) {
  return gitPaths(root, args)
}

function classifyEvidence(verification, checkpoint, checkpointTree, changedPaths, changedPathsSha256) {
  if (!Array.isArray(verification?.focused_checks)) {
    const legacyKeys = ['focused_tests', 'php_l', 'pint', 'targeted_phpstan', 'git_diff_check', 'migration_rollback_reapply']
    const legacy = legacyKeys.filter(key => verification?.[key] !== undefined)
    return [{ id: legacy.length ? 'legacy-focused-evidence' : 'focused-checks', status: 'RERUN_REQUIRED',
      reasons: [legacy.length ? 'LEGACY_SUMMARY_ONLY' : 'FOCUSED_EVIDENCE_MISSING'] }]
  }
  if (!verification.focused_checks.length) {
    return [{ id: 'focused-checks', status: 'RERUN_REQUIRED', reasons: ['FOCUSED_EVIDENCE_MISSING'] }]
  }
  return verification.focused_checks.map((item, index) => {
    const reasons = []
    const contradictions = []
    const subject = item.subject ?? {}
    if (!SHA256.test(item.command_digest ?? item.input_digest ?? '')) reasons.push('COMMAND_INPUT_DIGEST_MISSING')
    const hasSubject = typeof subject.commit === 'string' || typeof subject.tree === 'string'
    if (!hasSubject) reasons.push('SUBJECT_IDENTITY_MISSING')
    else if (subject.commit !== checkpoint && subject.tree !== checkpointTree) contradictions.push('SUBJECT_MISMATCH')
    const hasScope = typeof item.changed_paths_sha256 === 'string' || Array.isArray(item.changed_paths)
    if (!hasScope) reasons.push('CHANGED_PATH_SCOPE_MISSING')
    else if (item.changed_paths_sha256 !== changedPathsSha256 &&
      !(Array.isArray(item.changed_paths) && equalPaths(item.changed_paths, changedPaths))) contradictions.push('CHANGED_PATH_SCOPE_MISMATCH')
    if (!SHA256.test(item.toolchain_digest ?? item.config_digest ?? '')) reasons.push('TOOLCHAIN_CONFIG_DIGEST_MISSING')
    if (typeof item.result !== 'string' || !Number.isInteger(item.exit_code)) reasons.push('RESULT_IDENTITY_MISSING')
    if (item.environment_sensitive === true && (!item.environment || typeof item.environment !== 'object')) reasons.push('ENVIRONMENT_IDENTITY_MISSING')
    if (item.result === 'PASS' && Number.isInteger(item.exit_code) && item.exit_code !== 0) contradictions.push('RESULT_EXIT_CODE_CONFLICT')
    return { id: item.id ?? `focused-check-${index + 1}`,
      status: contradictions.length ? 'BLOCKED' : reasons.length ? 'RERUN_REQUIRED' : 'REUSABLE',
      reasons: [...contradictions, ...reasons] }
  })
}

function finish(manifest, flags) {
  manifest.valid = !flags.invalid
  if (flags.invalid) manifest.status = 'INVALID'
  else if (flags.blocked) manifest.status = 'BLOCKED'
  else if (flags.stale) manifest.status = 'STALE'
  else if (flags.rerun) manifest.status = 'RERUN_REQUIRED'
  else manifest.status = 'READY'
  return manifest
}

export function inspect(root, storyId, sliceId) {
  const manifest = defaultManifest(storyId, sliceId)
  const flags = { invalid: false, blocked: false, stale: false, rerun: false }
  const reason = (name, kind) => {
    if (!manifest.reasons.includes(name)) manifest.reasons.push(name)
    flags[kind] = true
  }

  const headResult = git(root, ['rev-parse', 'HEAD'])
  if (headResult.status !== 0) throw new Error('HEAD_UNAVAILABLE')
  manifest.head = headResult.stdout.trim()

  const validation = validateStoryPlan(root, storyId)
  manifest.legacy.sliceStatusDrift = validation.legacy?.sliceStatusDrift === true
  if (manifest.legacy.sliceStatusDrift) manifest.reasons.push('LEGACY_SLICE_STATUS_IN_PROGRESS')
  if (validation.status === 'INVALID') {
    validation.reasons.forEach(item => reason(item, 'invalid'))
    return finish(manifest, flags)
  }

  const file = planFile(root, storyId)
  if (!existsSync(file)) {
    reason('PLAN_MISSING', 'invalid')
    return finish(manifest, flags)
  }
  const plan = frontmatter(readFileSync(file, 'utf8'))
  const slice = plan.slices?.find(item => item.id === sliceId)
  if (!slice) {
    reason('TARGET_SLICE_MISSING', 'invalid')
    return finish(manifest, flags)
  }
  if (plan.current_slice !== sliceId) reason('TARGET_NOT_CURRENT_SLICE', 'invalid')
  if (plan.next_action?.kind !== 'verify_slice' || plan.next_action?.target !== sliceId) reason('VERIFY_SLICE_ACTION_REQUIRED', 'invalid')
  if (flags.invalid) return finish(manifest, flags)

  manifest.checkpointCommit = slice.checkpoint_commit ?? null
  if (!commitExists(root, manifest.checkpointCommit)) {
    manifest.checkpointFreshness = 'MISSING'
    reason(slice.checkpoint_commit ? 'CHECKPOINT_COMMIT_INVALID' : 'CHECKPOINT_REQUIRED', 'blocked')
    return finish(manifest, flags)
  }
  if (!isAncestor(root, manifest.checkpointCommit, manifest.head)) {
    manifest.checkpointFreshness = 'NOT_ANCESTOR'
    reason('CHECKPOINT_NOT_ANCESTOR', 'stale')
    return finish(manifest, flags)
  } else manifest.checkpointFreshness = 'FRESH'

  const persistedBaseline = slice.baseline_commit ?? slice.verification?.subject?.baseline_commit
  if (persistedBaseline !== undefined && persistedBaseline !== null) {
    if (!commitExists(root, persistedBaseline) || !isAncestor(root, persistedBaseline, manifest.checkpointCommit)) {
      reason('BASELINE_COMMIT_INVALID', 'blocked')
      return finish(manifest, flags)
    }
    manifest.baselineCommit = persistedBaseline
  } else {
    const parentsResult = git(root, ['rev-list', '--parents', '-n', '1', manifest.checkpointCommit])
    if (parentsResult.status !== 0) throw new Error('CHECKPOINT_PARENT_QUERY_FAILED')
    const parents = parentsResult.stdout.trim().split(/\s+/).slice(1)
    if (parents.length !== 1) {
      reason('AMBIGUOUS_CHECKPOINT_BASELINE', 'blocked')
      return finish(manifest, flags)
    }
    manifest.baselineCommit = parents[0]
    manifest.legacy.baselineDerivedFromFirstParent = true
    manifest.reasons.push('LEGACY_BASELINE_DERIVED_FROM_FIRST_PARENT')
  }

  manifest.changedPaths = gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRT', `${manifest.baselineCommit}..${manifest.checkpointCommit}`])
  manifest.changedPathsSha256 = pathListDigest(manifest.changedPaths)
  const persistedPaths = plan.schema_version === 2 ? undefined : slice.verification?.changed_paths
  if (persistedPaths !== undefined && !equalPaths(persistedPaths, manifest.changedPaths)) reason('CHANGED_PATHS_ALLOWLIST_MISMATCH', 'blocked')
  const persistedPathDigest = plan.schema_version === 2 ? slice.changed_paths_sha256 : slice.verification?.changed_paths_sha256
  if (persistedPathDigest !== undefined && persistedPathDigest !== manifest.changedPathsSha256) reason('CHANGED_PATHS_DIGEST_MISMATCH', 'blocked')

  manifest.postCheckpointDrift = intersect(
    gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRT', `${manifest.checkpointCommit}..${manifest.head}`]),
    manifest.changedPaths
  )
  if (manifest.postCheckpointDrift.length) reason('POST_CHECKPOINT_IMPLEMENTATION_DRIFT', 'stale')

  const staged = intersect(workingPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRT', 'HEAD']), manifest.changedPaths)
  const unstaged = intersect(workingPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRT']), manifest.changedPaths)
  const untracked = intersect(workingPaths(root, ['ls-files', '--others', '--exclude-standard']), manifest.changedPaths)
  manifest.workingDrift = [
    ...staged.map(item => ({ kind: 'staged', path: item })),
    ...unstaged.map(item => ({ kind: 'unstaged', path: item })),
    ...untracked.map(item => ({ kind: 'untracked', path: item }))
  ]
  if (manifest.workingDrift.length) reason('WORKING_IMPLEMENTATION_DRIFT', 'blocked')

  const sourceMismatch = plan.schema_version === 2 ? 'STORY_NORMATIVE_DIGEST_MISMATCH' : 'SOURCE_DIGEST_MISMATCH'
  manifest.sourceFreshness = validation.reasons.includes(sourceMismatch) ? 'STALE' : 'FRESH'
  if (manifest.sourceFreshness === 'STALE') reason(sourceMismatch, 'stale')
  for (const item of validation.reasons.filter(item => item !== sourceMismatch)) {
    if (['SNAPSHOT_MISMATCH', 'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR', 'REVIEW_COMMIT_MISSING',
      'REVIEW_COMMIT_NOT_ANCESTOR', 'SUBJECT_DIGEST_MISMATCH', 'RECEIPT_DIGEST_MISMATCH'].includes(item)) reason(item, 'stale')
  }

  const referenceItems = plan.schema_version === 2
    ? (separatedStory(root, plan).story?.references ?? []).map(item => ({ path: item.ref.split('#')[0], digest: null }))
    : referenceEntries(plan, slice)
  const refs = canonicalPaths(referenceItems.map(item => item.path))
  if (refs.length) {
    const committedRefDrift = intersect(gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRT', `${manifest.checkpointCommit}..${manifest.head}`]), refs)
    const workingRefDrift = intersect(canonicalPaths([
      ...workingPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRT', 'HEAD']),
      ...workingPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRT']),
      ...workingPaths(root, ['ls-files', '--others', '--exclude-standard'])
    ]), refs)
    let digestMismatch = false
    let digestBlocked = false
    for (const item of referenceItems.filter(item => item.digest)) {
      const relative = item.path.replaceAll('\\', '/')
      const absolute = path.resolve(root, relative)
      if (path.isAbsolute(relative) || relative.split('/').includes('..') || !absolute.startsWith(`${root}${path.sep}`) || !existsSync(absolute) || !SHA256.test(item.digest)) {
        digestBlocked = true
        continue
      }
      const actual = `sha256:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`
      if (actual !== item.digest) digestMismatch = true
    }
    if (digestBlocked) {
      manifest.referenceFreshness = 'BLOCKED'
      reason('REFERENCE_DIGEST_UNVERIFIABLE', 'blocked')
    } else if (digestMismatch) {
      manifest.referenceFreshness = 'STALE'
      reason('REFERENCE_DIGEST_MISMATCH', 'stale')
    } else if (committedRefDrift.length || workingRefDrift.length) {
      manifest.referenceFreshness = 'STALE'
      reason('REFERENCE_DRIFT', 'stale')
    } else manifest.referenceFreshness = referenceItems.every(item => item.digest) ? 'DIGEST_FRESH' : 'FILE_LEVEL_FRESH'
  }

  const treeResult = git(root, ['rev-parse', `${manifest.checkpointCommit}^{tree}`])
  if (treeResult.status !== 0) throw new Error('CHECKPOINT_TREE_UNAVAILABLE')
  let verificationEvidence = slice.verification
  if (plan.schema_version === 2 && slice.receipt_refs?.verification) {
    const loaded = readReceipt(root, plan, sliceId, 'verification')
    for (const error of loaded.errors) reason(error, error === 'RECEIPT_DIGEST_MISMATCH' || error.endsWith('_MISMATCH') ? 'stale' : 'invalid')
    if (loaded.errors.length) return finish(manifest, flags)
    verificationEvidence = loaded.receipt
  }
  manifest.evidence = classifyEvidence(verificationEvidence, manifest.checkpointCommit, treeResult.stdout.trim(),
    manifest.changedPaths, manifest.changedPathsSha256)
  if (manifest.evidence.some(item => item.status === 'BLOCKED')) reason('FOCUSED_EVIDENCE_BLOCKED', 'blocked')
  else if (manifest.evidence.some(item => item.status !== 'REUSABLE')) reason('FOCUSED_EVIDENCE_RERUN_REQUIRED', 'rerun')

  const reviewReasons = []
  let review = slice.review
  if (plan.schema_version === 2 && slice.receipt_refs?.review && manifest.evidence.every(item => item.status === 'REUSABLE')) {
    const loaded = readReceipt(root, plan, sliceId, 'review')
    for (const error of loaded.errors) reason(error, error === 'RECEIPT_DIGEST_MISMATCH' || error.endsWith('_MISMATCH') ? 'stale' : 'invalid')
    if (loaded.errors.length) return finish(manifest, flags)
    review = { ...loaded.receipt, reviewed_commit: loaded.receipt.checkpoint_commit }
  }
  if (!review?.reviewed_commit) reviewReasons.push('REVIEW_IDENTITY_MISSING')
  else if (review.reviewed_commit !== manifest.checkpointCommit) reviewReasons.push('REVIEWED_COMMIT_MISMATCH')
  if (manifest.postCheckpointDrift.length) reviewReasons.push('IMPLEMENTATION_DRIFT')
  if (manifest.workingDrift.length) reviewReasons.push('WORKING_DRIFT')
  if (manifest.sourceFreshness !== 'FRESH') reviewReasons.push('SOURCE_STALE')
  if (manifest.referenceFreshness === 'STALE') reviewReasons.push('REFERENCE_STALE')
  if (review?.risk_context_digest && review.risk_context_digest !== stableDigest(plan.risk ?? null)) reviewReasons.push('RISK_CONTEXT_MISMATCH')
  if (reviewReasons.length) manifest.reviewFreshness = { status: 'STALE', reasons: reviewReasons }
  else if (manifest.evidence.some(item => item.status !== 'REUSABLE')) {
    manifest.reviewFreshness = { status: 'REVIEW_FRESHNESS_PENDING_CHECKS', reasons: ['FOCUSED_CHECKS_RERUN_REQUIRED'] }
  } else manifest.reviewFreshness = { status: 'FRESH_CANDIDATE', reasons: [] }

  return finish(manifest, flags)
}

function main() {
  const [, , verb, storyId, sliceId] = process.argv
  if (verb !== 'check' || !/^\d+\.\d+$/.test(storyId ?? '') || !/^[A-Za-z0-9]+$/.test(sliceId ?? '') || process.argv.length !== 5) {
    return { ...defaultManifest(storyId ?? null, sliceId ?? null), status: 'INVALID', reasons: ['USAGE: check <epic.story> <slice-id>'] }
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel'])
  if (root.status !== 0) throw new Error('GIT_ROOT_UNAVAILABLE')
  return inspect(path.resolve(root.stdout.trim()), storyId, sliceId)
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
