import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import {
  inspectStory,
  normativeDigest,
  readReceipt,
  validateTaskSlices
} from './check-artifact-contract.mjs'
import { validateFinalizationReceipt } from './finalization-contract.mjs'

const CODES = { READY: 0, RECONCILIATION_REQUIRED: 1, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 }
const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const FINALIZATION_ACTION = 'finalize_story'
const LIFECYCLES = new Set(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'])
const KNOWN_NOISE = new Set(['_bmad/scripts/tests/__pycache__/test_agent_architecture.cpython-314.pyc'])
const RECEIPT_KINDS = ['implementation', 'verification', 'review']

function canonicalPaths(paths) {
  return [...new Set((paths ?? []).map(item => String(item).trim().replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter(Boolean))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
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

export function pathListDigest(paths) {
  const canonical = canonicalPaths(paths)
  return `sha256:${createHash('sha256').update(canonical.length ? `${canonical.join('\n')}\n` : '', 'utf8').digest('hex')}`
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
  return canonicalPaths(result.stdout.split(/\r?\n/))
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

function receiptPrefix(storyId) {
  return `_bmad-output/implementation-artifacts/receipts/story-${storyId.replace('.', '-')}/`
}

function defaultResult(storyId, expectedHead) {
  return {
    story_id: storyId,
    status: 'ERROR',
    valid: false,
    ready: false,
    expected_head: expectedHead ?? null,
    head: null,
    story_normative_digest: null,
    slice_set_digest: null,
    receipt_set_digest: null,
    slices: [],
    ac_coverage: [],
    canonical_disclosures: [],
    reference_freshness: 'UNKNOWN',
    reference_freshness_reasons: [],
    scope: {
      path_count: 0,
      paths: [],
      scope_paths_digest: null,
      implementation_commit_set_digest: null,
      final_scoped_tree_digest: null,
      excluded_paths: [],
      excluded_worktree_paths: []
    },
    scope_paths_digest: null,
    implementation_commit_set_digest: null,
    final_scoped_tree_digest: null,
    done_gate_disposition: null,
    lifecycle_from: null,
    lifecycle_target: 'review',
    human_gate_required: true,
    human_approval_present: false,
    recovery_classification: null,
    reasons: [],
    warnings: []
  }
}

function finish(result, status) {
  result.status = status
  result.ready = status === 'READY'
  result.valid = !['INVALID', 'ERROR'].includes(status)
  result.reasons = [...new Set(result.reasons)]
  result.warnings = [...new Set(result.warnings)]
  if (result.canonical_disclosures.some(item => item.status !== 'PASS' || item.complete !== true)) {
    result.done_gate_disposition = status === 'READY' ? 'READY_WITH_DISCLOSURES' : result.done_gate_disposition
  } else if (status === 'READY') {
    result.done_gate_disposition = 'READY'
  }
  return result
}

function issue(result, reason, classification = 'blocked') {
  result.reasons.push(reason)
  result._flags[classification] = true
}

function classify(result) {
  const flags = result._flags
  delete result._flags
  if (flags.invalid) return finish(result, 'INVALID')
  if (flags.stale) return finish(result, 'STALE')
  if (flags.reconciliation) return finish(result, 'RECONCILIATION_REQUIRED')
  if (flags.blocked) return finish(result, 'BLOCKED')
  return finish(result, 'READY')
}

function commitExists(root, sha) {
  return typeof sha === 'string' && SHA.test(sha) && git(root, ['cat-file', '-e', `${sha}^{commit}`]).status === 0
}

function equalPaths(left, right) {
  const a = canonicalPaths(left)
  const b = canonicalPaths(right)
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function storySection(source, id) {
  const pattern = /^### (Story \d+\.\d+:[^\r\n]*)/gm
  const matches = [...source.matchAll(pattern)]
  const found = matches.find(match => match[1].startsWith(`Story ${id}:`))
  if (!found) throw new Error('UPSTREAM_EPIC_SECTION_MISSING')
  const next = matches.find(match => match.index > found.index)
  return source.slice(found.index, next?.index ?? source.length)
}

function readLifecycle(root, sprintKey) {
  const file = safePath(root, '_bmad-output/implementation-artifacts/sprint-status.yaml')
  if (!file || !existsSync(file)) throw new Error('SPRINT_STATUS_MISSING')
  const text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
  const section = text.split(/^development_status:\s*$/m)[1]
  if (!section) throw new Error('SPRINT_STATUS_INVALID')
  const matches = [...section.matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)].filter(match => match[1] === sprintKey)
  if (matches.length !== 1) throw new Error('SPRINT_KEY_MISSING')
  return matches[0][2]
}

function completionHasMaterialContent(source) {
  const match = /<!-- v4:completion:start -->([\s\S]*?)<!-- v4:completion:end -->/.exec(source)
  if (!match) return false
  return match[1].replace(/^\s*### [^\r\n]*\s*$/gm, '').trim().length > 0
}

function finalizationCandidateExists(root, storyId) {
  return existsSync(path.join(root, receiptPrefix(storyId), 'finalization.json'))
}

function recoveryOutcome(classification, reasons = [], healthy = false) {
  return { classification, reasons: [...new Set(reasons)], healthy }
}

function recoveryDirtyPaths(root, storyId, storyPath) {
  const protectedPaths = new Set([
    planRelative(storyId),
    storyPath,
    '_bmad-output/implementation-artifacts/sprint-status.yaml',
    receiptPrefix(storyId) + 'finalization.json'
  ])
  const staged = gitPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_STAGED_PATHS_FAILED')
  const unstaged = gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_UNSTAGED_PATHS_FAILED')
  const untracked = gitPaths(root, ['ls-files', '--others', '--exclude-standard', '--'], 'GIT_UNTRACKED_PATHS_FAILED')
  return canonicalPaths([...staged, ...unstaged, ...untracked]).filter(item => protectedPaths.has(item))
}

export function classifyFinalizationRecovery(root, storyId, expectedHead) {
  try {
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (expectedHead && head !== expectedHead) return recoveryOutcome('STALE', ['EXPECTED_HEAD_MISMATCH'])
    const planPath = planRelative(storyId)
    const planFile = safePath(root, planPath)
    if (!planFile || !existsSync(planFile)) return recoveryOutcome('INVALID', ['PLAN_MISSING'])
    const plan = frontmatter(readFileSync(planFile, 'utf8'))
    const storyPath = plan.story?.path
    const storyFile = safePath(root, storyPath)
    if (!storyFile || !existsSync(storyFile)) return recoveryOutcome('INVALID', ['STORY_MISSING'])
    const story = inspectStory(readFileSync(storyFile, 'utf8'))
    const sprintLifecycle = readLifecycle(root, plan.sprint_key)
    const receiptPath = receiptPrefix(storyId) + 'finalization.json'
    const receiptExists = existsSync(path.join(root, receiptPath))
    const dirty = recoveryDirtyPaths(root, storyId, storyPath)
    if (dirty.length) return recoveryOutcome('UNCOMMITTED_FINALIZATION', dirty)

    const storyReview = story.status === 'review'
    const planReview = plan.lifecycle_snapshot === 'review' && plan.execution_status === 'complete'
    const sprintReview = sprintLifecycle === 'review'
    const allReview = storyReview && planReview && sprintReview && plan.next_action?.kind === 'complete_story'
    const allInProgress = story.status === 'in-progress' &&
      plan.lifecycle_snapshot === 'in-progress' &&
      plan.execution_status === 'in-progress' &&
      sprintLifecycle === 'in-progress' &&
      plan.next_action?.kind === 'finalize_story'

    if (allReview && receiptExists && (plan.human_approval === undefined || plan.human_approval === null)) {
      const receipt = validateFinalizationReceipt(root, plan, receiptPath)
      if (!receipt.errors.length) return recoveryOutcome('HUMAN_GATE_PENDING', ['HUMAN_GATE_PENDING'], true)
      return recoveryOutcome('TAMPERED_FINALIZATION_RECEIPT', receipt.errors)
    }
    if (receiptExists && allInProgress) return recoveryOutcome('ORPHAN_FINALIZATION_RECEIPT', ['ORPHAN_FINALIZATION_RECEIPT'])
    if (storyReview && !planReview && !sprintReview) return recoveryOutcome('PARTIAL_STORY_ONLY', ['PARTIAL_STORY_ONLY'])
    if (planReview && !storyReview && !sprintReview) return recoveryOutcome('PARTIAL_PLAN_ONLY', ['PARTIAL_PLAN_ONLY'])
    if (sprintReview && !storyReview && !planReview) return recoveryOutcome('PARTIAL_SPRINT_ONLY', ['PARTIAL_SPRINT_ONLY'])
    if (allInProgress && !receiptExists) return recoveryOutcome('CLEAN_BASE', [], true)
    return recoveryOutcome('CONFLICTING_FINALIZATION_STATE', ['CONFLICTING_FINALIZATION_STATE'])
  } catch (error) {
    return recoveryOutcome('ERROR', [error.message])
  }
}

function scopeExcluded(relative, storyId, storyPath) {
  const normalized = relative.replaceAll('\\', '/')
  return normalized === planRelative(storyId) || normalized === storyPath ||
    normalized === '_bmad-output/implementation-artifacts/sprint-status.yaml' ||
    normalized.startsWith(receiptPrefix(storyId)) || normalized.startsWith('.agents/') ||
    normalized.startsWith('.agent-state/') || normalized === 'finalization.json' ||
    KNOWN_NOISE.has(normalized)
}

function blobAt(root, commit, relative) {
  const result = git(root, ['rev-parse', `${commit}:${relative}`])
  return result.status === 0 ? result.stdout.trim() : 'DELETED'
}

function deriveScope(root, storyId, storyPath, slices, expectedHead, result) {
  const records = new Map()
  const implementationCommits = []
  const excludedPaths = new Set()
  for (const slice of slices) {
    const actual = gitPaths(root,
      ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${slice.baseline_commit}..${slice.checkpoint_commit}`, '--'],
      'GIT_CHECKPOINT_DIFF_FAILED')
    const implementation = slice.receipts.implementation
    const receiptPaths = canonicalPaths(implementation?.changed_paths)
    if (!implementation || !Array.isArray(implementation.changed_paths)) {
      issue(result, `IMPLEMENTATION_PATHS_MISSING:${slice.id}`, 'blocked')
      continue
    }
    if (!equalPaths(actual, receiptPaths)) issue(result, `IMPLEMENTATION_PATHS_MISMATCH:${slice.id}`, 'stale')
    const actualDigest = pathListDigest(actual)
    if (actualDigest !== slice.changed_paths_sha256 || implementation.changed_paths_sha256 !== actualDigest) {
      issue(result, `IMPLEMENTATION_PATH_DIGEST_MISMATCH:${slice.id}`, 'stale')
    }
    implementationCommits.push({ slice_id: slice.id, checkpoint_commit: slice.checkpoint_commit })
    for (const relative of receiptPaths) {
      if (scopeExcluded(relative, storyId, storyPath)) {
        excludedPaths.add(relative)
        continue
      }
      const record = records.get(relative) ?? {
        path: relative,
        contributor_slices: [],
        latest_slice: null,
        latest_checkpoint: null,
        blob: null
      }
      if (!record.contributor_slices.includes(slice.id)) record.contributor_slices.push(slice.id)
      record.latest_slice = slice.id
      record.latest_checkpoint = slice.checkpoint_commit
      records.set(relative, record)
    }
  }

  const paths = [...records.keys()].sort()
  for (const relative of paths) {
    const record = records.get(relative)
    const expectedBlob = blobAt(root, expectedHead, relative)
    const checkpointBlob = blobAt(root, record.latest_checkpoint, relative)
    record.blob = expectedBlob
    if (expectedBlob !== checkpointBlob) {
      issue(result, 'OUTSIDE_STORY_DRIFT', 'stale')
      result.scope_drift_paths = [...(result.scope_drift_paths ?? []), relative]
    }
  }

  const scopePathsDigest = stableDigest(paths)
  const commitSetDigest = stableDigest(implementationCommits)
  const treeDigest = stableDigest(paths.map(relative => ({ path: relative, blob: records.get(relative).blob })))
  const scope = {
    path_count: paths.length,
    paths: paths.map(relative => records.get(relative)),
    scope_paths_digest: scopePathsDigest,
    implementation_commit_set_digest: commitSetDigest,
    final_scoped_tree_digest: treeDigest,
    excluded_paths: [...excludedPaths].sort(),
    excluded_worktree_paths: []
  }
  result.scope = scope
  result.scope_paths_digest = scopePathsDigest
  result.implementation_commit_set_digest = commitSetDigest
  result.final_scoped_tree_digest = treeDigest
  if (!paths.length) issue(result, 'EMPTY_IMPLEMENTATION_SCOPE', 'blocked')
  return scope
}

function inspectWorkingTree(root, result, scopePaths, metadataPaths = []) {
  const staged = gitPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_STAGED_PATHS_FAILED')
  const unstaged = gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_UNSTAGED_PATHS_FAILED')
  const untracked = gitPaths(root, ['ls-files', '--others', '--exclude-standard', '--'], 'GIT_UNTRACKED_PATHS_FAILED')
  const dirty = canonicalPaths([...staged, ...unstaged, ...untracked])
  const scope = new Set(scopePaths)
  const allowedMetadata = new Set([KNOWN_NOISE.values().next().value,
    '_bmad-output/implementation-artifacts/sprint-status.yaml', ...metadataPaths])
  const excluded = dirty.filter(item => KNOWN_NOISE.has(item))
  result.scope.excluded_worktree_paths = excluded
  const relevant = dirty.filter(item => scope.has(item))
  if (relevant.length) issue(result, 'WORKING_SCOPE_DRIFT', 'stale')
  const unexpected = dirty.filter(item => !scope.has(item) && !allowedMetadata.has(item) &&
    item !== 'AGENTS.md' && !item.startsWith('.agents/') && !item.startsWith('docs/superpowers/') &&
    !item.startsWith('_bmad-output/implementation-artifacts/receipts/'))
  if (unexpected.length) issue(result, `UNRELATED_WORKTREE_DRIFT:${unexpected[0]}`, 'blocked')
}

function classifyPlanValidation(result, validation) {
  const blockedEvidence = new Set(['IMPLEMENTATION_RECEIPT_REQUIRED', 'VERIFICATION_RECEIPT_REQUIRED',
    'REVIEW_RECEIPT_REQUIRED', 'INVALID_RECEIPT_FILE'])
  const stale = new Set(['STORY_NORMATIVE_DIGEST_MISMATCH', 'CHECKPOINT_MISSING', 'CHECKPOINT_NOT_ANCESTOR',
    'BASELINE_COMMIT_INVALID', 'RECEIPT_DIGEST_MISMATCH', 'CHECKPOINT_MISMATCH', 'BASELINE_MISMATCH',
    'SUBJECT_MISMATCH', 'CHANGED_PATHS_MISMATCH', 'REVIEW_COMMIT_MISSING', 'REVIEW_COMMIT_NOT_ANCESTOR'])
  for (const reason of validation.reasons ?? []) {
    if (reason === 'SNAPSHOT_MISMATCH' || reason === 'EXECUTION_AHEAD_OF_LIFECYCLE') continue
    if (reason === 'INVALID_PLAN_STORY_BINDING' && result.reasons.includes('STORY_NORMATIVE_DIGEST_STALE')) continue
    if (blockedEvidence.has(reason)) issue(result, reason, 'blocked')
    else if (stale.has(reason)) issue(result, reason, 'stale')
    else issue(result, reason, 'invalid')
  }
}

function canonicalDetails(planSlice, verification) {
  const canonical = verification?.canonical ?? {}
  const applicability = canonical.applicability ?? canonical.canonical_applicability ?? planSlice.verification?.canonical_applicability ?? null
  const status = canonical.status ?? canonical.canonical_status ?? planSlice.verification?.canonical_status ?? null
  const complete = canonical.complete ?? (status === 'PASS')
  const reasons = canonical.escalationReasons ?? canonical.escalation_reasons ??
    verification?.escalation?.reasons ?? planSlice.verification?.outstanding_obligation ?? []
  const disclosure = verification?.done_gate_disclosure?.required ?? verification?.done_gate_disclosure_required ??
    planSlice.verification?.done_gate_disclosure_required ?? (status !== 'PASS' || complete !== true)
  return {
    applicability,
    status,
    complete,
    reasons: Array.isArray(reasons) ? reasons : [reasons],
    done_gate_disclosure_required: disclosure,
    coverage_authority: verification?.done_gate_disclosure?.coverage_authority ?? 'focused checks'
  }
}

function receiptErrorKind(error) {
  if (error === 'RECEIPT_DIGEST_MISMATCH' || error.endsWith('_MISMATCH') || error.endsWith('_NOT_ANCESTOR')) return 'stale'
  if (error === 'INVALID_RECEIPT_FILE') return 'blocked'
  return 'invalid'
}

function reviewFreshness(receipt) {
  const freshness = receipt?.freshness
  if (typeof freshness === 'string') return freshness
  return freshness?.status ?? null
}

function loadSliceReceipts(root, plan, result) {
  const slices = plan.slices ?? []
  const details = []
  for (const slice of slices) {
    const detail = { ...slice, receipts: {}, receipt_refs: [] }
    for (const kind of RECEIPT_KINDS) {
      const required = kind === 'implementation' || kind === 'verification' || slice.review?.required === true
      const ref = slice.receipt_refs?.[kind]
      if (!required) continue
      if (!ref) {
        issue(result, `${kind.toUpperCase()}_RECEIPT_REQUIRED:${slice.id}`, 'blocked')
        continue
      }
      if (!safePath(root, ref.path) || !existsSync(path.resolve(root, ref.path))) {
        issue(result, `${kind.toUpperCase()}_RECEIPT_MISSING:${slice.id}`, 'blocked')
        continue
      }
      const loaded = readReceipt(root, plan, slice.id, kind)
      detail.receipt_refs.push({ kind, path: ref.path, digest: ref.digest })
      if (loaded.errors.length) {
        for (const error of loaded.errors) issue(result, `${error}:${slice.id}`, receiptErrorKind(error))
        continue
      }
      detail.receipts[kind] = loaded.receipt
    }

    const implementation = detail.receipts.implementation
    const verification = detail.receipts.verification
    const review = detail.receipts.review
    if (verification && verification.progression_eligible !== true) issue(result, `PROGRESSION_NOT_ELIGIBLE:${slice.id}`, 'blocked')
    if (slice.verification?.progression_eligible !== true) issue(result, `PLAN_PROGRESSION_NOT_ELIGIBLE:${slice.id}`, 'blocked')
    if (verification && (!Array.isArray(verification.focused_checks) || !verification.focused_checks.length) &&
        !Array.isArray(verification.commands)) issue(result, `FOCUSED_EVIDENCE_MISSING:${slice.id}`, 'blocked')
    if (review) {
      if (review.verdict !== 'APPROVE' || slice.review?.verdict !== 'APPROVE') issue(result, `REVIEW_NOT_APPROVED:${slice.id}`, 'blocked')
      if ((review.findings_blocking ?? 0) !== 0) issue(result, `REVIEW_BLOCKING_FINDINGS:${slice.id}`, 'blocked')
      if (review.reviewed_commit !== slice.checkpoint_commit) issue(result, `REVIEWED_COMMIT_MISMATCH:${slice.id}`, 'stale')
      const freshness = reviewFreshness(review)
      if (!['FRESH_CANDIDATE', 'FRESH_REUSED', 'FRESH'].includes(freshness)) issue(result, `REVIEW_FRESHNESS_INVALID:${slice.id}`, 'blocked')
    }
    const canonical = canonicalDetails(slice, verification)
    if (verification?.canonical?.applicability && slice.verification?.canonical_applicability &&
        verification.canonical.applicability !== slice.verification.canonical_applicability) {
      issue(result, `CANONICAL_APPLICABILITY_MISMATCH:${slice.id}`, 'blocked')
    }
    if (verification?.canonical?.status && slice.verification?.canonical_status &&
        verification.canonical.status !== slice.verification.canonical_status) {
      issue(result, `CANONICAL_STATUS_MISMATCH:${slice.id}`, 'blocked')
    }
    if (typeof verification?.done_gate_disclosure?.required === 'boolean' &&
        typeof slice.verification?.done_gate_disclosure_required === 'boolean' &&
        verification.done_gate_disclosure.required !== slice.verification.done_gate_disclosure_required) {
      issue(result, `CANONICAL_DISCLOSURE_MISMATCH:${slice.id}`, 'blocked')
    }
    if (!canonical.applicability || !canonical.status || typeof canonical.complete !== 'boolean') {
      issue(result, `CANONICAL_DISCLOSURE_MISSING:${slice.id}`, 'blocked')
    } else if ((canonical.status !== 'PASS' || canonical.complete !== true) && canonical.done_gate_disclosure_required !== true) {
      issue(result, `CANONICAL_DISCLOSURE_REQUIRED:${slice.id}`, 'blocked')
    }
    result.canonical_disclosures.push({ slice_id: slice.id, ...canonical })
    details.push(detail)
  }
  return details
}

function passEvidence(item) {
  return item && item.result === 'PASS' && item.exit_code === 0
}

function aggregateAcEvidence(story, plan, details, result) {
  const taskById = new Map(story.tasks.map(task => [task.id, task]))
  const contributors = new Map(story.ac.map(ac => [ac.id, new Set()]))
  const evidence = new Map(story.ac.map(ac => [ac.id, []]))
  const addEvidence = (ac, item) => {
    if (!evidence.has(ac)) return
    const key = JSON.stringify([ac, item.slice_id, item.receipt_digest, item.evidence_id, item.mode])
    if (evidence.get(ac).some(existing => existing._key === key)) return
    evidence.get(ac).push({ ...item, _key: key })
  }

  for (const detail of details) {
    const taskIds = detail.task_refs ?? []
    const sliceAcs = new Set(taskIds.flatMap(taskId => taskById.get(taskId)?.ac_refs ?? []))
    for (const ac of sliceAcs) contributors.get(ac)?.add(detail.id)
    const verification = detail.receipts.verification
    const receiptDigestValue = detail.receipt_refs.find(ref => ref.kind === 'verification')?.digest ?? null
    const structured = Array.isArray(verification?.ac_evidence) ? verification.ac_evidence : []
    const structuredAcs = new Set()
    structured.forEach((item, index) => {
      const ids = item?.ac ? [item.ac] : Array.isArray(item?.ac_refs) ? item.ac_refs : []
      if (item?.status !== 'PASS' && item?.result !== 'PASS') return
      for (const ac of ids) {
        if (!contributors.has(ac)) continue
        structuredAcs.add(ac)
        addEvidence(ac, {
          slice_id: detail.id,
          mode: 'structured',
          evidence_id: item.id ?? `structured-${detail.id}-${index + 1}`,
          receipt_digest: receiptDigestValue,
          receipt_ref: detail.receipt_refs.find(ref => ref.kind === 'verification')?.path ?? null,
          summary: item.contribution ?? item.summary ?? item.fresh_evidence ?? null
        })
      }
    })
    const focused = Array.isArray(verification?.focused_checks) ? verification.focused_checks
      : (verification?.commands ?? []).map((item, index) => ({ ...item, id: `receipt-command-${index + 1}` }))
    const firstPass = focused.find(passEvidence)
    if (firstPass) {
      for (const ac of sliceAcs) {
        if (structuredAcs.has(ac)) continue
        addEvidence(ac, {
          slice_id: detail.id,
          mode: 'fallback',
          evidence_id: firstPass.id ?? `receipt-command-${focused.indexOf(firstPass) + 1}`,
          receipt_digest: receiptDigestValue,
          receipt_ref: detail.receipt_refs.find(ref => ref.kind === 'verification')?.path ?? null,
          summary: firstPass.summary ?? firstPass.command ?? 'receipt-level PASS evidence'
        })
      }
    }
  }

  result.ac_coverage = story.ac.map(ac => {
    const items = evidence.get(ac.id) ?? []
    const output = {
      id: ac.id,
      covered: items.length > 0,
      contributor_slices: [...(contributors.get(ac.id) ?? [])].sort(),
      evidence: items.map(({ _key, ...item }) => item),
      canonical_disclosure_relevant: result.canonical_disclosures
        .filter(disclosure => (contributors.get(ac.id) ?? new Set()).has(disclosure.slice_id) &&
          (disclosure.status !== 'PASS' || disclosure.complete !== true))
        .map(disclosure => disclosure.slice_id)
    }
    if (!output.covered) issue(result, `AC_EVIDENCE_MISSING:${ac.id}`, 'blocked')
    return output
  })
  result.ac_coverage_summary = {
    total: result.ac_coverage.length,
    covered: result.ac_coverage.filter(item => item.covered).length,
    fallback_count: result.ac_coverage.reduce((sum, item) => sum + item.evidence.filter(evidenceItem => evidenceItem.mode === 'fallback').length, 0),
    structured_count: result.ac_coverage.reduce((sum, item) => sum + item.evidence.filter(evidenceItem => evidenceItem.mode === 'structured').length, 0)
  }
}

function checkReferences(root, story, plan, result) {
  const references = story.references ?? []
  const missing = []
  for (const reference of references) {
    const relative = reference.ref.split('#')[0]
    if (!safePath(root, relative) || !existsSync(path.join(root, relative))) missing.push(relative)
  }
  if (missing.length) {
    issue(result, `REFERENCE_MISSING:${missing[0]}`, 'blocked')
    result.reference_freshness = 'BLOCKED'
    result.reference_freshness_reasons = ['REFERENCE_MISSING']
    return
  }
  const pinned = Array.isArray(plan.reference_digests) && plan.reference_digests.length >= references.length
  result.reference_freshness = pinned ? 'DIGEST_FRESH' : 'PARTIAL'
  result.reference_freshness_reasons = pinned ? [] : ['NO_PINNED_REFERENCE_DIGESTS']
  result.reference_freshness_blocking = false
}

function checkHumanApproval(plan, result) {
  const approval = plan.human_approval
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return
  result.human_approval_present = true
  const expected = {
    story_id: result.story_id,
    story_normative_digest: result.story_normative_digest,
    scope_paths_digest: result.scope_paths_digest,
    implementation_commit_set_digest: result.implementation_commit_set_digest,
    final_scoped_tree_digest: result.final_scoped_tree_digest,
    approved_head: result.expected_head
  }
  const actualHead = approval.approved_head ?? approval.approved_commit
  const actual = {
    story_id: approval.story_id,
    story_normative_digest: approval.story_normative_digest,
    scope_paths_digest: approval.scope_paths_digest,
    implementation_commit_set_digest: approval.implementation_commit_set_digest,
    final_scoped_tree_digest: approval.final_scoped_tree_digest,
    approved_head: actualHead
  }
  if (approval.decision !== undefined && approval.decision !== 'APPROVE') issue(result, 'HUMAN_APPROVAL_STALE', 'stale')
  if (Object.entries(expected).some(([key, value]) => actual[key] !== value)) issue(result, 'HUMAN_APPROVAL_STALE', 'stale')
}

export function inspectFinalization(root, storyId, expectedHead) {
  const result = defaultResult(storyId, expectedHead)
  result._flags = { invalid: false, stale: false, reconciliation: false, blocked: false }
  if (!/^\d+\.\d+$/.test(storyId ?? '')) {
    issue(result, 'INVALID_STORY_ID', 'invalid')
    return classify(result)
  }
  if (!SHA.test(expectedHead ?? '')) {
    issue(result, 'INVALID_EXPECTED_HEAD', 'invalid')
    return classify(result)
  }

  const actualHead = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
  result.head = actualHead
  if (actualHead !== expectedHead) issue(result, 'EXPECTED_HEAD_MISMATCH', 'stale')
  if (!commitExists(root, expectedHead)) issue(result, 'EXPECTED_HEAD_INVALID', 'invalid')

  const planPath = planRelative(storyId)
  const planFile = safePath(root, planPath)
  if (!planFile || !existsSync(planFile)) {
    issue(result, 'PLAN_MISSING', 'invalid')
    return classify(result)
  }
  let plan
  try { plan = frontmatter(readFileSync(planFile, 'utf8')) } catch { issue(result, 'INVALID_PLAN_FRONTMATTER', 'invalid'); return classify(result) }
  if (plan.schema_version !== 2) issue(result, 'UNSUPPORTED_PLAN_SCHEMA', 'invalid')
  if (plan.story_id !== storyId) issue(result, 'STORY_ID_MISMATCH', 'invalid')
  if (!plan.story || !safePath(root, plan.story.path) || !existsSync(path.join(root, plan.story.path))) {
    issue(result, 'STORY_MISSING', 'invalid')
    return classify(result)
  }

  let story
  const storyFile = safePath(root, plan.story.path)
  try { story = inspectStory(readFileSync(storyFile, 'utf8')) } catch { issue(result, 'INVALID_STORY_CONTRACT', 'invalid'); return classify(result) }
  if (story.errors.length) issue(result, `INVALID_STORY_CONTRACT:${story.errors.join(',')}`, 'invalid')
  const postFinalization = plan.lifecycle_snapshot === 'review' &&
    plan.execution_status === 'complete' &&
    plan.next_action?.kind === 'complete_story' &&
    plan.next_action?.target === 'story'
  let actualStoryDigest = null
  try { actualStoryDigest = normativeDigest(story) } catch { issue(result, 'INVALID_STORY_CONTRACT', 'invalid') }
  result.story_normative_digest = actualStoryDigest
  if (actualStoryDigest && actualStoryDigest !== plan.story.normative_digest) issue(result, 'STORY_NORMATIVE_DIGEST_STALE', 'stale')
  if (story.story_id !== storyId) issue(result, 'STORY_ID_MISMATCH', 'invalid')

  const validation = validateStoryPlan(root, storyId)
  classifyPlanValidation(result, validation)
  if (validation.lifecycleSnapshot && validation.actualLifecycle && validation.lifecycleSnapshot !== validation.actualLifecycle) {
    issue(result, 'LIFECYCLE_PROJECTION_MISMATCH', 'reconciliation')
  }

  if (!Array.isArray(plan.slices) || !plan.slices.length) issue(result, 'MISSING_SLICES', 'invalid')
  const slices = Array.isArray(plan.slices) ? plan.slices : []
  const ids = slices.map(slice => slice?.id)
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) issue(result, 'DUPLICATE_OR_MALFORMED_SLICE', 'invalid')
  if (plan.current_slice !== ids.at(-1)) issue(result, 'CURRENT_SLICE_NOT_FINAL', 'blocked')
  for (const slice of slices) {
    if (slice?.status !== 'reviewed') issue(result, `SLICE_NOT_REVIEWED:${slice?.id ?? 'unknown'}`, 'blocked')
  }
  if (!Array.isArray(plan.blockers)) issue(result, 'INVALID_BLOCKERS', 'invalid')
  else if (plan.blockers.length) issue(result, 'BLOCKERS_PRESENT', 'blocked')
  if (!Array.isArray(plan.unresolved_questions)) issue(result, 'INVALID_UNRESOLVED_QUESTIONS', 'invalid')
  else if (plan.unresolved_questions.length) issue(result, 'UNRESOLVED_QUESTIONS_PRESENT', 'blocked')
  if (!postFinalization && (plan.next_action?.kind !== FINALIZATION_ACTION || plan.next_action?.target !== 'story')) issue(result, 'FINALIZE_STORY_ACTION_REQUIRED', 'blocked')
  if (!postFinalization && plan.execution_status !== 'in-progress') issue(result, 'EXECUTION_STATUS_NOT_IN_PROGRESS', 'blocked')

  const taskErrors = validateTaskSlices(story, plan)
  for (const error of taskErrors) {
    if (error === 'INVALID_PLAN_STORY_BINDING' && result.reasons.includes('STORY_NORMATIVE_DIGEST_STALE')) continue
    issue(result, error, error === 'UNCOVERED_TASK' ? 'blocked' : 'invalid')
  }

  let sprintLifecycle = null
  try {
    sprintLifecycle = readLifecycle(root, plan.sprint_key)
  } catch (error) {
    issue(result, error.message, 'invalid')
  }
  const projections = [plan.lifecycle_snapshot, sprintLifecycle, story.status]
  result.lifecycle_from = plan.lifecycle_snapshot
  if (new Set(projections).size !== 1) issue(result, 'LIFECYCLE_PROJECTION_MISMATCH', 'reconciliation')
  if (![...projections].every(item => LIFECYCLES.has(item))) issue(result, 'INVALID_LIFECYCLE_PROJECTION', 'invalid')
  else if (projections.every(item => item === 'review')) issue(result, 'HUMAN_GATE_PENDING', 'reconciliation')
  else if (projections.some(item => item === 'done')) issue(result, 'DONE_PROJECTION_MISMATCH', 'reconciliation')
  else if (!projections.every(item => item === 'in-progress')) issue(result, 'LIFECYCLE_NOT_IN_PROGRESS', 'blocked')
  if (completionHasMaterialContent(readFileSync(storyFile, 'utf8')) && projections.every(item => item === 'in-progress')) {
    issue(result, 'COMPLETION_METADATA_BEFORE_REVIEW', 'reconciliation')
  }
  if (finalizationCandidateExists(root, storyId) && projections.every(item => item === 'in-progress')) {
    issue(result, 'FINALIZATION_CANDIDATE_WITHOUT_PLAN_ADVANCE', 'reconciliation')
  }

  const details = loadSliceReceipts(root, plan, result)
  const sliceSummary = slices.map(slice => ({
    id: slice.id,
    status: slice.status,
    checkpoint: slice.checkpoint_commit,
    progression_eligible: slice.verification?.progression_eligible === true,
    review_required: slice.review?.required === true,
    review_verdict: slice.review?.verdict ?? null,
    review_freshness: reviewFreshness(details.find(detail => detail.id === slice.id)?.receipts.review)
  }))
  result.slices = sliceSummary
  result.slice_set_digest = stableDigest(sliceSummary)
  result.receipt_set_digest = stableDigest(details.flatMap(detail => detail.receipt_refs))

  const upstream = plan.upstream_epic
  if (!upstream || !safePath(root, upstream.path) || !DIGEST.test(upstream.section_digest ?? '')) issue(result, 'INVALID_UPSTREAM_EPIC_REF', 'invalid')
  else {
    try {
      const actual = `sha256:${createHash('sha256').update(storySection(readFileSync(path.join(root, upstream.path), 'utf8'), storyId), 'utf8').digest('hex')}`
      if (actual !== upstream.section_digest) issue(result, 'UPSTREAM_EPIC_DIGEST_STALE', 'stale')
    } catch (error) { issue(result, error.message, 'invalid') }
  }
  checkReferences(root, story, plan, result)
  aggregateAcEvidence(story, plan, details, result)

  const scope = deriveScope(root, storyId, plan.story.path, details, expectedHead, result)
  inspectWorkingTree(root, result, scope.paths.map(item => item.path), [planPath, plan.story.path])
  checkHumanApproval(plan, result)
  const recovery = classifyFinalizationRecovery(root, storyId, expectedHead)
  result.recovery_classification = recovery.classification
  if (recovery.classification === 'HUMAN_GATE_PENDING' && !result.reasons.includes('HUMAN_GATE_PENDING')) {
    issue(result, 'HUMAN_GATE_PENDING', 'reconciliation')
  }
  if (['UNCOMMITTED_FINALIZATION', 'ORPHAN_FINALIZATION_RECEIPT', 'PARTIAL_PLAN_ONLY',
    'PARTIAL_SPRINT_ONLY', 'PARTIAL_STORY_ONLY', 'TAMPERED_FINALIZATION_RECEIPT'].includes(recovery.classification)) {
    issue(result, recovery.classification, 'reconciliation')
  }

  result.human_gate_required = true
  if (!result.canonical_disclosures.length) issue(result, 'CANONICAL_DISCLOSURE_MISSING', 'blocked')
  const final = classify(result)
  return final
}

function parseArguments(argv) {
  const [verb, storyId, flag, expectedHead, ...rest] = argv
  if (verb !== 'check' || !/^\d+\.\d+$/.test(storyId ?? '') || flag !== '--expected-head' || !SHA.test(expectedHead ?? '') || rest.length) {
    return { error: 'USAGE: check <epic.story> --expected-head <sha>' }
  }
  return { storyId, expectedHead }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return { status: 'INVALID', valid: false, ready: false, reasons: [parsed.error] }
  const root = gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE')
  return inspectFinalization(path.resolve(root), parsed.storyId, parsed.expectedHead)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = CODES[result.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', valid: false, ready: false, reasons: [error.message] })}\n`)
    process.exitCode = CODES.ERROR
  }
}
