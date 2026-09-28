import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { receiptDigest } from './check-artifact-contract.mjs'
import { inspect as inspectSliceVerification } from './check-slice-verification.mjs'
import { verifyChangedPaths } from './check-verification.mjs'
import { validateEvidenceSet } from './prepare-change-evidence.mjs'
import { executeCheck, validateCheckEvidence } from './v4-check-executor.mjs'
import { recordActionFinished, recordActionStarted, recordCheckFinished } from './v4-observations.mjs'
import {
  canonicalPaths,
  executeMetadataTransaction,
  executeSliceTransaction,
  inspectActionTransaction,
  safeRelative,
  snapshotWorkingFiles,
  transactionHash,
  transactionIdentity,
  transactionPathDigest,
  worktreeInventory
} from './v4-slice-transaction.mjs'

const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const STORY_ID = /^\d+\.\d+$/
const SLICE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const PLAN_PATH = storyId => `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
const SPRINT_PATH = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const DEFAULT_POLICY_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/routing/task-router.md',
  '.agents/context/control-plane.md',
  '.agents/context/context-routing.md',
  '.agents/skills/v4-story-runner/SKILL.md'
]
const DEFAULT_RECIPE_PATHS = [
  '.agents/skills/v4-story-runner/actions/implement-slice.md',
  '.agents/skills/v4-story-runner/references/implementation-techniques.md'
]
const DEFAULT_VERIFICATION_RECIPE_PATHS = [
  '.agents/skills/v4-story-runner/actions/verify-slice.md',
  '.agents/skills/v4-story-runner/references/implementation-techniques.md',
  '.agents/verification/registry.json',
  '.agents/verification/challenge-list.json',
  '.agents/verification/journal-frontend.json',
  '.agents/verification/today-view.json',
  '.agents/features/challenge-list.json',
  '.agents/features/journal-frontend.json',
  '.agents/features/today-view.json'
]
const FORBIDDEN_REQUEST_KEYS = new Set([
  'approve_exact_scope', 'approval', 'start_fingerprint', 'startFingerprint',
  'human_approval', 'complete_story', 'finalize_story', 'start_story', 'review_story',
  'lifecycle_update', 'sprint_update'
])

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function digestValue(value) { return hash(JSON.stringify(stableValue(value))) }

function previewFingerprint(preview) {
  const unsigned = { ...preview }
  delete unsigned.fingerprint
  return digestValue(unsigned)
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status === null) throw new Error(`GIT_UNAVAILABLE:${args[0]}`)
  return result
}

function gitOutput(root, args, failure = `GIT_FAILED:${args[0]}`) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.trim()
}

function safeFile(root, relative) {
  const normalized = safeRelative(relative)
  if (!normalized) throw new Error(`INVALID_PATH:${relative}`)
  const absolute = path.resolve(root, normalized)
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`INVALID_PATH:${relative}`)
  let cursor = path.resolve(root)
  for (const segment of normalized.split('/')) {
    cursor = path.join(cursor, segment)
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`SYMLINK_PATH:${normalized}`)
  }
  return absolute
}

function readText(root, relative) {
  const file = safeFile(root, relative)
  if (!existsSync(file)) throw new Error(`FILE_MISSING:${relative}`)
  return readFileSync(file, 'utf8')
}

function digestFiles(root, paths) {
  const normalized = canonicalPaths(paths)
  const files = Object.fromEntries(normalized.map(relative => [relative, hash(readFileSync(safeFile(root, relative)))]))
  return { paths: normalized, files, digest: digestValue(files) }
}

function planRelative(storyId) { return PLAN_PATH(storyId) }

function canonicalPointer(root) {
  const line = /^worktree (.+)$/m.exec(gitOutput(root, ['worktree', 'list', '--porcelain'], 'CANONICAL_WORKTREE_UNAVAILABLE'))
  if (!line?.[1]) throw new Error('CANONICAL_WORKTREE_UNAVAILABLE')
  return path.join(line[1].trim(), '.agent-state/active-run.json')
}

function assertPointerIdle(root) {
  const pointerPath = canonicalPointer(root)
  let pointer
  try { pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) } catch { throw new Error('V3_POINTER_UNAVAILABLE') }
  if (pointer.schemaVersion !== 1 || pointer.status !== 'IDLE' || pointer.activeRunId !== null || pointer.storyId !== null) {
    throw new Error('V3_POINTER_NOT_IDLE')
  }
  return { path: pointerPath, digest: hash(readFileSync(pointerPath)) }
}

function invalid(reason, extra = {}) {
  return { status: 'INVALID', ready: false, valid: false, reasons: [reason], ...extra }
}

function blocked(reason, extra = {}) {
  return { status: 'BLOCKED', ready: false, valid: true, reasons: [reason], ...extra }
}

function stale(reason, extra = {}) {
  return { status: 'STALE', ready: false, valid: true, reasons: [reason], ...extra }
}

function errorResult(error, extra = {}) {
  return { status: 'ERROR', ready: false, valid: false, reasons: [error.message], ...extra }
}

function actionHookInput(request, operation, result = null) {
  const preview = request?.preview
  return {
    story_id: request?.story_id ?? preview?.story_id ?? null,
    slice_id: request?.slice_id ?? preview?.slice_id ?? null,
    action: request?.action ?? preview?.action ?? null,
    invocation_id: request?.invocation_id ?? null,
    session_id: request?.session_id ?? null,
    attempt_id: request?.attempt_id ?? preview?.fingerprint ?? request?.transaction_id ?? preview?.transaction_id ?? null,
    payload: {
      operation,
      transaction_id: request?.transaction_id ?? preview?.transaction_id ?? null,
      expected_head: request?.expected_head ?? preview?.expected_head ?? null,
      preview_fingerprint: preview?.fingerprint ?? null,
      result_status: result?.status ?? null,
      durable_action_count: result?.durable_action_count ?? 0,
      next_action: result?.next_action ?? null,
    },
    provenance: { kind: 'v4_kernel', source: 'v4-action-kernel', operation },
  }
}

function observeActionStarted(root, request, operation) {
  return recordActionStarted(root, actionHookInput(request, operation))
}

function observeActionFinished(root, request, operation, result) {
  return recordActionFinished(root, actionHookInput(request, operation, result))
}

function observeCanonicalCheck(root, preview, canonical, request) {
  return recordCheckFinished(root, {
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    action: 'verify_slice',
    invocation_id: request.invocation_id ?? null,
    session_id: request.session_id ?? null,
    attempt_id: request.attempt_id ?? preview.fingerprint,
    payload: {
      check_id: `canonical:${preview.canonical_selector}`,
      status: canonical.status,
      complete: canonical.complete === true,
      changed_paths: preview.changed_paths,
      escalation_reasons: canonical.escalationReasons ?? [],
    },
    provenance: { kind: 'canonical_verifier', source: 'check-verification', selector: preview.canonical_selector },
  })
}

function assertRequestShape(request, operation) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('INPUT_REQUIRED')
  if (request.operation !== undefined && request.operation !== operation) throw new Error('OPERATION_MISMATCH')
  for (const key of FORBIDDEN_REQUEST_KEYS) if (Object.hasOwn(request, key)) throw new Error(`MIXED_CONTROL_FLAG:${key}`)
  if (request.action !== 'implement_slice') throw new Error('ACTION_MISMATCH')
  if (!STORY_ID.test(request.story_id ?? '')) throw new Error('INVALID_STORY_ID')
  if (!SLICE_ID.test(request.slice_id ?? '')) throw new Error('INVALID_SLICE_ID')
  if (!SHA.test(request.expected_head ?? '')) throw new Error('INVALID_EXPECTED_HEAD')
}

function normalizePaths(root, values, label) {
  if (!Array.isArray(values) || !values.length || values.some(item => !safeRelative(item))) throw new Error(`${label}_REQUIRED`)
  const result = canonicalPaths(values)
  for (const relative of result) safeFile(root, relative)
  return result
}

function commandRecords(request) {
  const source = request.commands ?? request.focused_checks
  if (!Array.isArray(source) || !source.length) throw new Error('FOCUSED_EVIDENCE_REQUIRED')
  return source.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.command !== 'string' || !item.command ||
        !Number.isInteger(item.exit_code) || typeof item.tool !== 'string' || !item.tool ||
        typeof item.environment !== 'string' || !item.environment) throw new Error('FOCUSED_EVIDENCE_INVALID')
    return {
      command: item.command,
      exit_code: item.exit_code,
      tool: item.tool,
      environment: item.environment
    }
  })
}

function noImplementationPaths(paths) {
  return paths.some(relative => relative === SPRINT_PATH || relative.startsWith('.agents/') ||
    relative.startsWith('.agent-state/') || relative.startsWith('_bmad-output/implementation-artifacts/'))
}

function ensureUniquePathGroups(owned, metadata, storyPath, receiptPath) {
  if (owned.includes(metadata[0]) || owned.includes(storyPath) || owned.includes(receiptPath)) throw new Error('IMPLEMENTATION_SCOPE_CONTAINS_AUTHORITY_FILE')
  if (noImplementationPaths(owned)) throw new Error('IMPLEMENTATION_SCOPE_CONTAINS_CONTROL_PLANE')
  if (new Set(metadata).size !== metadata.length) throw new Error('METADATA_SCOPE_DUPLICATE')
}

function replaceTokens(text, values) {
  let output = text
  for (const [name, value] of Object.entries(values)) {
    const patterns = [new RegExp(`\\{\\{${name}\\}\\}`, 'g'), new RegExp(`\\{\\{${name.toLowerCase()}\\}\\}`, 'g')]
    for (const pattern of patterns) output = output.replace(pattern, value)
  }
  if (/\{\{(?:BASELINE_COMMIT|CHECKPOINT_COMMIT|SUBJECT_DIGEST|CHANGED_PATHS_SHA256|RECEIPT_PATH|RECEIPT_DIGEST)\}\}/i.test(output)) throw new Error('PLAN_TEMPLATE_UNRESOLVED')
  return output
}

function sameJson(left, right) { return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right)) }

function assertUnchanged(original, generated, keys) {
  for (const key of keys) if (!sameJson(original[key], generated[key])) throw new Error(`PLAN_FIELD_CHANGED:${key}`)
}

function sliceById(plan, sliceId) {
  const slice = plan.slices?.find(item => item?.id === sliceId)
  if (!slice) throw new Error('TARGET_SLICE_MISSING')
  return slice
}

function validateMetadataProjection(root, descriptor, checkpoint, metadata) {
  const planText = metadata.files[descriptor.plan_path]
  const generated = frontmatter(planText)
  if (generated.schema_version !== descriptor.schema_version || generated.story_id !== descriptor.story_id) throw new Error('PLAN_IDENTITY_CHANGED')
  if (generated.lifecycle_snapshot !== descriptor.original_plan.lifecycle_snapshot || generated.execution_status !== descriptor.original_plan.execution_status) throw new Error('PLAN_LIFECYCLE_CHANGED')
  if (generated.current_slice !== descriptor.slice_id || generated.next_action?.kind !== 'verify_slice' || generated.next_action?.target !== descriptor.slice_id) throw new Error('VERIFY_SUCCESSOR_REQUIRED')
  if (generated.next_action?.kind === 'complete_story' || generated.human_approval != null || generated.finalization != null) throw new Error('COMPLETION_AUTHORITY_FORBIDDEN')
  assertUnchanged(descriptor.original_plan, generated, [
    'schema_version', 'story_id', 'story', 'upstream_epic', 'sprint_key', 'lifecycle_snapshot',
    'execution_status', 'planning_approval', 'readiness', 'current_slice', 'risk', 'blockers',
    'unresolved_questions', 'checkpoints', 'human_approval', 'finalization'
  ])
  const originalSlices = descriptor.original_plan.slices ?? []
  const generatedSlices = generated.slices ?? []
  for (const original of originalSlices) {
    const next = generatedSlices.find(item => item?.id === original.id)
    if (!next) throw new Error('PLAN_SLICE_SET_CHANGED')
    if (original.id !== descriptor.slice_id && !sameJson(original, next)) throw new Error('OTHER_SLICE_METADATA_CHANGED')
  }
  const slice = sliceById(generated, descriptor.slice_id)
  const changedDigest = descriptor.schema_version === 2
    ? slice.changed_paths_sha256
    : slice.implementation?.changed_paths_sha256
  if (slice.status !== 'checkpointed' || slice.baseline_commit !== checkpoint.baseline_commit ||
      slice.checkpoint_commit !== checkpoint.checkpoint_commit || changedDigest !== checkpoint.changed_paths_sha256) throw new Error('CHECKPOINT_METADATA_MISMATCH')
  if (descriptor.schema_version === 2 && slice.subject_digest !== checkpoint.subject_digest) throw new Error('CHECKPOINT_METADATA_MISMATCH')
  if (descriptor.schema_version === 2) {
    const reference = slice.receipt_refs?.implementation
    if (!reference || reference.path !== descriptor.receipt_path || reference.digest !== descriptor.receipt_digest) throw new Error('IMPLEMENTATION_RECEIPT_BINDING_MISMATCH')
    if (Object.keys(slice.receipt_refs ?? {}).some(kind => kind !== 'implementation' && descriptor.original_slice.receipt_refs?.[kind] === undefined)) throw new Error('UNAUTHORIZED_RECEIPT_KIND')
    const receipt = JSON.parse(metadata.files[descriptor.receipt_path])
    if (receiptDigest(receipt) !== descriptor.receipt_digest) throw new Error('RECEIPT_DIGEST_MISMATCH')
  } else {
    const implementation = slice.implementation
    if (!implementation || !sameJson(implementation.changed_paths, checkpoint.changed_paths) ||
        implementation.changed_paths_sha256 !== checkpoint.changed_paths_sha256 ||
        !Array.isArray(implementation.focused_checks) || !implementation.focused_checks.length) throw new Error('LEGACY_IMPLEMENTATION_METADATA_MISMATCH')
    if (slice.receipt_refs?.implementation) throw new Error('SCHEMA_V1_RECEIPT_FORBIDDEN')
  }
  const checked = validateStoryPlan(root, descriptor.story_id)
  if (checked.status !== 'READY') throw new Error(`POST_METADATA_PLAN_NOT_READY:${checked.reasons.join(',')}`)
}

function buildPreview(root, request) {
  assertRequestShape(request, 'prepare')
  if (typeof request.plan_template !== 'string' || !request.plan_template) throw new Error('PLAN_TEMPLATE_REQUIRED')
  if (/^\s*kind:\s*(?:complete_story|finalize_story)\s*$/m.test(request.plan_template) ||
      /^\s*(?:human_approval|finalization):/m.test(request.plan_template)) throw new Error('COMPLETION_AUTHORITY_FORBIDDEN')
  const pointer = assertPointerIdle(root)
  const head = gitOutput(root, ['rev-parse', 'HEAD'])
  if (head !== request.expected_head) throw new Error('EXPECTED_HEAD_MISMATCH')
  const planPath = planRelative(request.story_id)
  const planText = readText(root, planPath)
  const plan = frontmatter(planText)
  if (plan.story_id !== request.story_id) throw new Error('STORY_ID_MISMATCH')
  const checked = validateStoryPlan(root, request.story_id)
  if (checked.status !== 'READY') throw new Error(`PLAN_NOT_READY:${checked.status}:${checked.reasons.join(',')}`)
  const slice = sliceById(plan, request.slice_id)
  if (plan.current_slice !== request.slice_id || plan.next_action?.kind !== 'implement_slice' || plan.next_action?.target !== request.slice_id) throw new Error('PLAN_ACTION_SLICE_MISMATCH')
  if (slice.status !== 'pending') throw new Error('SLICE_NOT_PENDING')
  const storyPath = plan.schema_version === 2 ? plan.story?.path : 'docs/product/epics.md'
  if (!safeRelative(storyPath)) throw new Error('STORY_PATH_INVALID')
  const owned = normalizePaths(root, request.owned_paths, 'IMPLEMENTATION_SCOPE')
  const receiptPath = plan.schema_version === 2
    ? (request.receipt_path ?? `_bmad-output/implementation-artifacts/receipts/story-${request.story_id.replace('.', '-')}/${request.slice_id}-implementation.json`)
    : null
  const metadata = [planPath, ...(receiptPath ? [receiptPath] : [])]
  ensureUniquePathGroups(owned, metadata, storyPath, receiptPath)
  if (receiptPath && !safeRelative(receiptPath)) throw new Error('RECEIPT_PATH_INVALID')
  if (receiptPath && receiptPath !== `_bmad-output/implementation-artifacts/receipts/story-${request.story_id.replace('.', '-')}/${request.slice_id}-implementation.json`) throw new Error('RECEIPT_PATH_IDENTITY_MISMATCH')
  if (receiptPath && git(root, ['cat-file', '-e', `${head}:${receiptPath}`]).status === 0) throw new Error('IMPLEMENTATION_RECEIPT_ALREADY_EXISTS')
  const commands = commandRecords(request)
  const semanticCoverage = request.semantic_coverage
  if (!semanticCoverage || typeof semanticCoverage !== 'object' || Array.isArray(semanticCoverage)) throw new Error('SEMANTIC_COVERAGE_REQUIRED')
  const policyPaths = normalizePaths(root, request.policy_paths ?? DEFAULT_POLICY_PATHS, 'POLICY_PATHS')
  const recipePaths = normalizePaths(root, request.recipe_paths ?? DEFAULT_RECIPE_PATHS, 'RECIPE_PATHS')
  const policy = digestFiles(root, policyPaths)
  const recipes = digestFiles(root, recipePaths)
  const story = digestFiles(root, [storyPath])
  const pointerBytes = readFileSync(pointer.path)
  const snapshot = snapshotWorkingFiles(root, owned)
  const inventory = worktreeInventory(root)
  const dirty = canonicalPaths([...inventory.staged, ...inventory.unstaged, ...inventory.untracked])
  if (inventory.staged.length) throw new Error('DIRTY_INDEX')
  if (dirty.some(relative => !owned.includes(relative))) throw new Error('DIRTY_SCOPE_MISMATCH')
  if (dirty.length !== owned.length || dirty.some((relative, index) => relative !== owned[index])) throw new Error('IMPLEMENTATION_SCOPE_NOT_DIRTY')
  const commandsDigest = digestValue(commands)
  const contextDigest = digestValue({
    story_id: request.story_id,
    slice_id: request.slice_id,
    action: request.action,
    selected_tasks: request.selected_tasks ?? null,
    selected_acceptance_criteria: request.selected_acceptance_criteria ?? null,
    semantic_coverage: semanticCoverage,
    commands_digest: commandsDigest
  })
  const transactionId = request.transaction_id ?? randomUUID()
  const preview = {
    schema_version: 1,
    action: request.action,
    operation: 'checkpoint',
    story_id: request.story_id,
    slice_id: request.slice_id,
    transaction_id: transactionId,
    expected_head: head,
    plan_path: planPath,
    story_path: storyPath,
    schema_version_plan: plan.schema_version,
    original_plan: plan,
    original_slice: slice,
    plan_digest: hash(Buffer.from(planText)),
    story_digest: story.files[storyPath],
    story_normative_digest: plan.story?.normative_digest ?? null,
    policy: { paths: policy.paths, files: policy.files, digest: policy.digest },
    recipes: { paths: recipes.paths, files: recipes.files, digest: recipes.digest },
    pointer_digest: hash(pointerBytes),
    implementation_paths: owned,
    snapshot,
    metadata_paths: metadata,
    receipt_path: receiptPath,
    plan_template: request.plan_template,
    plan_template_digest: hash(Buffer.from(request.plan_template)),
    commands,
    commands_digest: commandsDigest,
    semantic_coverage: semanticCoverage,
    context_digest: contextDigest,
    selected_tasks: request.selected_tasks ?? null,
    selected_acceptance_criteria: request.selected_acceptance_criteria ?? null,
    red_green: request.red_green ?? null,
    implementation_message: request.implementation_message ?? `chore(story-${request.story_id}): implementation checkpoint`,
    metadata_message: request.metadata_message ?? `chore(story-${request.story_id}): record implementation checkpoint`
  }
  preview.fingerprint = previewFingerprint(preview)
  return { status: 'READY', ready: true, valid: true, action: 'implement_slice', operation: 'prepare', fingerprint: preview.fingerprint, preview }
}

function descriptorFromPreview(root, request, preview, recovery = false) {
  if (!preview || typeof preview !== 'object') throw new Error('PREVIEW_REQUIRED')
  if (preview.fingerprint !== previewFingerprint(preview)) throw new Error('STALE_PREVIEW')
  if (preview.action !== 'implement_slice' || preview.story_id !== request.story_id || preview.slice_id !== request.slice_id) throw new Error('PREVIEW_IDENTITY_MISMATCH')
  if (request.action !== 'implement_slice') throw new Error('ACTION_MISMATCH')
  if (request.transaction_id && request.transaction_id !== preview.transaction_id) throw new Error('TRANSACTION_ID_MISMATCH')
  const currentPointer = assertPointerIdle(root)
  if (currentPointer.digest !== preview.pointer_digest) throw new Error('STALE_POINTER_PREVIEW')
  const currentStory = digestFiles(root, [preview.story_path])
  if (currentStory.files[preview.story_path] !== preview.story_digest) throw new Error('STALE_STORY_PREVIEW')
  const policy = digestFiles(root, preview.policy.paths)
  const recipes = digestFiles(root, preview.recipes.paths)
  if (policy.digest !== preview.policy.digest) throw new Error('STALE_POLICY_PREVIEW')
  if (recipes.digest !== preview.recipes.digest) throw new Error('STALE_RECIPE_PREVIEW')
  if (hash(Buffer.from(preview.plan_template)) !== preview.plan_template_digest) throw new Error('STALE_PLAN_TEMPLATE')
  if (request.plan_template !== undefined && preview.plan_template !== null && request.plan_template !== preview.plan_template) throw new Error('STALE_PLAN_TEMPLATE')
  if (request.owned_paths !== undefined && !sameJson(canonicalPaths(request.owned_paths), preview.implementation_paths)) throw new Error('STALE_SCOPE_PREVIEW')
  if (request.receipt_path !== undefined && request.receipt_path !== preview.receipt_path) throw new Error('STALE_RECEIPT_PREVIEW')
  if (request.policy_paths !== undefined && !sameJson(canonicalPaths(request.policy_paths), preview.policy.paths)) throw new Error('STALE_POLICY_PREVIEW')
  if (request.recipe_paths !== undefined && !sameJson(canonicalPaths(request.recipe_paths), preview.recipes.paths)) throw new Error('STALE_RECIPE_PREVIEW')
  const currentHead = gitOutput(root, ['rev-parse', 'HEAD'])
  if (!recovery && currentHead !== preview.expected_head) throw new Error('STALE_HEAD')
  if (recovery && !SHA.test(currentHead)) throw new Error('RECOVERY_HEAD_INVALID')
  if (hash(Buffer.from(readText(root, preview.plan_path))) !== preview.plan_digest && !recovery) throw new Error('STALE_PLAN_PREVIEW')
  const requestCommands = commandRecords(request)
  if (!sameJson(requestCommands, preview.commands)) throw new Error('FOCUSED_EVIDENCE_CHANGED')
  if (digestValue(request.semantic_coverage) !== digestValue(preview.semantic_coverage)) throw new Error('SEMANTIC_COVERAGE_CHANGED')
  if (request.selected_tasks !== undefined && !sameJson(request.selected_tasks, preview.selected_tasks)) throw new Error('SELECTED_TASKS_CHANGED')
  if (request.selected_acceptance_criteria !== undefined && !sameJson(request.selected_acceptance_criteria, preview.selected_acceptance_criteria)) throw new Error('SELECTED_AC_CHANGED')
  if (request.red_green !== undefined && !sameJson(request.red_green, preview.red_green)) throw new Error('RED_GREEN_CHANGED')
  const metadataPaths = preview.metadata_paths
  return {
    action: 'implement_slice',
    story_id: request.story_id,
    slice_id: request.slice_id,
    transaction_id: preview.transaction_id,
    expected_head: preview.expected_head,
    preview_fingerprint: preview.fingerprint,
    implementation_paths: preview.implementation_paths,
    metadata_paths: metadataPaths,
    snapshot: preview.snapshot,
    plan_path: preview.plan_path,
    receipt_path: preview.receipt_path,
    schema_version: preview.schema_version_plan,
    original_plan: preview.original_plan,
    original_slice: preview.original_slice,
    commands: preview.commands,
    semantic_coverage: preview.semantic_coverage,
    red_green: preview.red_green,
    implementation_message: preview.implementation_message,
    metadata_message: preview.metadata_message,
    buildMetadata: checkpoint => buildMetadata(root, preview, checkpoint),
    recheck: freshRoot => {
      if (gitOutput(freshRoot, ['rev-parse', 'HEAD']) !== preview.expected_head) throw new Error('STALE_HEAD')
      const pointer = assertPointerIdle(freshRoot)
      if (pointer.digest !== preview.pointer_digest) throw new Error('STALE_POINTER_PREVIEW')
      if (hash(Buffer.from(readText(freshRoot, preview.plan_path))) !== preview.plan_digest) throw new Error('STALE_PLAN_PREVIEW')
      const current = snapshotWorkingFiles(freshRoot, preview.implementation_paths)
      for (const relative of preview.implementation_paths) {
        if (!sameJson(current[relative], preview.snapshot[relative])) throw new Error('STALE_WORKTREE_PREVIEW')
      }
      const inventory = worktreeInventory(freshRoot)
      if (inventory.staged.length) throw new Error('DIRTY_INDEX')
      const dirty = canonicalPaths([...inventory.unstaged, ...inventory.untracked])
      if (dirty.some(relative => !preview.implementation_paths.includes(relative))) throw new Error('DIRTY_SCOPE_MISMATCH')
    },
    validateMetadata: metadata => {
      const descriptor = { ...descriptorShell(preview), original_plan: preview.original_plan, original_slice: preview.original_slice, receipt_digest: metadata.receipt_digest }
      validateMetadataProjection(root, descriptor, {
        baseline_commit: metadata.checkpoint?.baseline_commit,
        checkpoint_commit: metadata.checkpoint?.checkpoint_commit,
        changed_paths: metadata.checkpoint?.changed_paths,
        changed_paths_sha256: metadata.checkpoint?.changed_paths_sha256,
        subject_digest: metadata.checkpoint?.subject_digest
      }, metadata)
    },
    validateFinal: metadata => {
      const descriptor = { ...descriptorShell(preview), original_plan: preview.original_plan, original_slice: preview.original_slice, receipt_digest: metadata.receipt_digest }
      validateMetadataProjection(root, descriptor, {
        baseline_commit: metadata.checkpoint?.baseline_commit,
        checkpoint_commit: metadata.checkpoint?.checkpoint_commit,
        changed_paths: metadata.checkpoint?.changed_paths,
        changed_paths_sha256: metadata.checkpoint?.changed_paths_sha256,
        subject_digest: metadata.checkpoint?.subject_digest
      }, metadata)
    }
  }
}

function descriptorShell(preview) {
  return {
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    schema_version: preview.schema_version_plan,
    plan_path: preview.plan_path,
    receipt_path: preview.receipt_path,
    original_plan: preview.original_plan,
    original_slice: preview.original_slice,
    story_path: preview.story_path
  }
}

function buildMetadata(root, preview, checkpoint) {
  const receipt = preview.schema_version_plan === 2 ? {
    schema_version: 1,
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    kind: 'implementation',
    checkpoint_commit: checkpoint.checkpoint_commit,
    baseline_commit: checkpoint.baseline_commit,
    subject_digest: checkpoint.subject_digest,
    created_from_head: checkpoint.checkpoint_commit,
    changed_paths_sha256: checkpoint.changed_paths_sha256,
    commands: preview.commands
  } : null
  const receiptBytes = receipt ? `${JSON.stringify(receipt, null, 2)}\n` : null
  const receiptDigestValue = receipt ? receiptDigest(receipt) : null
  const templateValues = {
    STORY_NORMATIVE_DIGEST: preview.story_normative_digest ?? '',
    SOURCE_DIGEST: preview.original_plan.source?.section_digest ?? '',
    BASELINE_COMMIT: checkpoint.baseline_commit,
    CHECKPOINT_COMMIT: checkpoint.checkpoint_commit,
    SUBJECT_DIGEST: checkpoint.subject_digest,
    CHANGED_PATHS_SHA256: checkpoint.changed_paths_sha256,
    RECEIPT_PATH: preview.receipt_path ?? '',
    RECEIPT_DIGEST: receiptDigestValue ?? ''
  }
  const planText = replaceTokens(preview.plan_template, templateValues)
  const files = { [preview.plan_path]: planText }
  if (receiptBytes) files[preview.receipt_path] = receiptBytes
  const metadata = { paths: canonicalPaths(Object.keys(files)), files, receipt, receipt_digest: receiptDigestValue }
  const descriptor = descriptorShell(preview)
  descriptor.schema_version = preview.schema_version_plan
  descriptor.commands = preview.commands
  descriptor.receipt_digest = receiptDigestValue
  validateMetadataProjection(root, descriptor, checkpoint, metadata)
  metadata.checkpoint = checkpoint
  return metadata
}

function buildRequestFromPreview(preview, request, operation) {
  return {
    ...request,
    operation,
    action: 'implement_slice',
    story_id: request.story_id ?? preview.story_id,
    slice_id: request.slice_id ?? preview.slice_id,
    expected_head: request.expected_head ?? preview.expected_head,
    transaction_id: request.transaction_id ?? preview.transaction_id,
    commands: request.commands ?? preview.commands,
    focused_checks: request.focused_checks,
    semantic_coverage: request.semantic_coverage ?? preview.semantic_coverage,
    plan_template: request.plan_template ?? preview.plan_template
  }
}

// ---------------------------------------------------------------------------
// verify_slice / same-Lead review kernel
// ---------------------------------------------------------------------------

const VERIFICATION_STATUSES = new Set(['PASS', 'FAIL', 'INCOMPLETE', 'ERROR'])
const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH'])
const REVIEW_JUDGMENTS = new Set(['APPROVE', 'CHANGES_REQUIRED', 'NEED_MORE_EVIDENCE'])
const KNOWN_COVERAGE_REASONS = new Set([
  'NO_APPLICABLE_RECIPE', 'NO_MAPPED_CHANGE', 'UNMAPPED_CHANGED_PATH',
  'DEPENDENCY_ONLY_CHANGED_PATH', 'INCOMPLETE_COVERAGE'
])

function assertVerificationRequestShape(request, operation) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('INPUT_REQUIRED')
  if (request.operation !== undefined && request.operation !== operation) throw new Error('OPERATION_MISMATCH')
  for (const key of FORBIDDEN_REQUEST_KEYS) if (Object.hasOwn(request, key)) throw new Error(`MIXED_CONTROL_FLAG:${key}`)
  if (request.action !== 'verify_slice') throw new Error('ACTION_MISMATCH')
  if (!STORY_ID.test(request.story_id ?? '')) throw new Error('INVALID_STORY_ID')
  if (!SLICE_ID.test(request.slice_id ?? '')) throw new Error('INVALID_SLICE_ID')
  if (!SHA.test(request.expected_head ?? '')) throw new Error('INVALID_EXPECTED_HEAD')
}

function changePaths(value, label = 'CHANGED_PATHS') {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label}_REQUIRED`)
  const normalized = value.map(item => {
    const safe = safeRelative(item)
    if (!safe) throw new Error(`${label}_INVALID`)
    return safe
  })
  return canonicalPaths(normalized)
}

function exactList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index])
}

function verificationReceiptPath(storyId, sliceId, kind) {
  return `_bmad-output/implementation-artifacts/receipts/story-${storyId.replace('.', '-')}/${sliceId}-${kind}.json`
}

function planAtHead(root, storyId) {
  const planPath = planRelative(storyId)
  const text = readText(root, planPath)
  return { planPath, text, plan: frontmatter(text), digest: hash(Buffer.from(text)) }
}

function riskLevel(plan, request) {
  const value = request.risk ?? plan.risk?.level ?? plan.risk
  const risk = typeof value === 'string' ? value.toUpperCase() : null
  if (!RISK_LEVELS.has(risk)) throw new Error('RISK_LEVEL_REQUIRED')
  return risk
}

function validateReviewQuestions(value, fallbackReasons = []) {
  const source = value === undefined
    ? (fallbackReasons.length ? fallbackReasons : ['Review the canonical verification result and bounded change evidence.'])
    : value
  if (!Array.isArray(source) || !source.length) throw new Error('REVIEW_QUESTIONS_REQUIRED')
  const result = source.map((item, index) => {
    if (typeof item === 'string') return { id: `question-${index + 1}`, question: item }
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id ||
        typeof item.question !== 'string' || !item.question) throw new Error('REVIEW_QUESTION_INVALID')
    return { id: item.id, question: item.question }
  })
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error('REVIEW_QUESTION_DUPLICATE')
  return result
}

function inspectChangeEvidence(evidence, expectedPaths) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { valid: false, reasons: ['CHANGE_EVIDENCE_REQUIRED'], refs: [], scope_digest: null }
  }
  try {
    if (evidence.evidenceSet) {
      validateEvidenceSet(evidence.evidenceSet)
      const setPaths = evidence.evidenceSet.paths.map(item => item.path)
      if (!exactList(setPaths, expectedPaths)) throw new Error('CHANGE_EVIDENCE_SCOPE_MISMATCH')
      return {
        valid: true,
        reasons: [],
        refs: evidence.evidenceSet.units.map(unit => ({
          path: unit.path,
          unit_index: unit.unitIndex,
          evidence_set_digest: unit.evidenceSetDigest
        })),
        scope_digest: digestValue({ paths: setPaths, source: evidence.evidenceSet.sourceDigest })
      }
    }
    if (!Array.isArray(evidence.paths) || !exactList(evidence.paths.map(item => item?.path), expectedPaths)) {
      throw new Error('CHANGE_EVIDENCE_SCOPE_MISMATCH')
    }
    if (evidence.paths.length > 4) throw new Error('CHANGE_EVIDENCE_PATH_LIMIT')
    const refs = []
    for (const entry of evidence.paths) {
      if (!entry || typeof entry.path !== 'string' || !Array.isArray(entry.hunks) || !entry.hunks.length) throw new Error('CHANGE_EVIDENCE_HUNK_REQUIRED')
      if (entry.hunks.length > 6) throw new Error('CHANGE_EVIDENCE_HUNK_LIMIT')
      let lineCount = 0
      for (const [hunkIndex, hunk] of entry.hunks.entries()) {
        const body = Array.isArray(hunk?.diffText) ? hunk.diffText.join('\n') : typeof hunk?.diffText === 'string' ? hunk.diffText : ''
        lineCount += body ? body.split('\n').length : 0
        refs.push({ path: entry.path, hunk_index: hunkIndex, body_digest: digestValue(body) })
      }
      if (lineCount > 240) throw new Error('CHANGE_EVIDENCE_UNIT_LIMIT')
    }
    return { valid: true, reasons: [], refs, scope_digest: digestValue({ paths: expectedPaths, refs }) }
  } catch (error) {
    return { valid: false, reasons: [error.message], refs: [], scope_digest: null }
  }
}

function successorFor(plan, currentSliceId) {
  const current = sliceById(plan, currentSliceId)
  const statuses = new Map((plan.slices ?? []).map(slice => [slice.id, slice.status]))
  statuses.set(currentSliceId, 'verified')
  const candidates = (plan.slices ?? []).filter(slice => slice.id !== currentSliceId && slice.status === 'pending' &&
    (slice.depends_on ?? []).every(dependency => ['verified', 'reviewed'].includes(statuses.get(dependency))))
  if (candidates.length > 1) throw new Error('AMBIGUOUS_SUCCESSOR')
  if (candidates.length === 1) return { kind: 'implement_slice', target: candidates[0].id }
  const remaining = (plan.slices ?? []).filter(slice => slice.id !== currentSliceId && !['verified', 'reviewed'].includes(slice.status))
  if (remaining.length) throw new Error('SUCCESSOR_DEPENDENCY_UNSATISFIED')
  return { kind: 'finalize_story', target: 'story' }
}

function verificationCheckSpecs(request) {
  const specs = request.check_specs ?? request.focused_check_specs ?? request.focused_checks
  if (!Array.isArray(specs) || !specs.length) throw new Error('FOCUSED_CHECK_SPECS_REQUIRED')
  return specs.map(spec => {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('CHECK_SPEC_INVALID')
    return JSON.parse(JSON.stringify(spec))
  })
}

function buildVerificationPreview(root, request) {
  assertVerificationRequestShape(request, 'prepare')
  const pointer = assertPointerIdle(root)
  const head = gitOutput(root, ['rev-parse', 'HEAD'])
  if (head !== request.expected_head) throw new Error('EXPECTED_HEAD_MISMATCH')
  const { planPath, text: planText, plan, digest: planDigest } = planAtHead(root, request.story_id)
  if (plan.story_id !== request.story_id) throw new Error('STORY_ID_MISMATCH')
  const checked = validateStoryPlan(root, request.story_id)
  if (checked.status !== 'READY') throw new Error(`PLAN_NOT_READY:${checked.status}:${checked.reasons.join(',')}`)
  const slice = sliceById(plan, request.slice_id)
  if (plan.current_slice !== request.slice_id || plan.next_action?.kind !== 'verify_slice' || plan.next_action?.target !== request.slice_id) throw new Error('PLAN_ACTION_SLICE_MISMATCH')
  if (slice.status !== 'checkpointed') throw new Error('SLICE_NOT_CHECKPOINTED')
  if (plan.schema_version !== 2) throw new Error('SCHEMA_V2_REQUIRED')
  const manifest = inspectSliceVerification(root, request.story_id, request.slice_id)
  if (['STALE', 'BLOCKED', 'INVALID', 'ERROR'].includes(manifest.status)) throw new Error(`VERIFICATION_MANIFEST_${manifest.status}`)
  const changed = changePaths(manifest.changedPaths)
  if (manifest.checkpointCommit !== slice.checkpoint_commit || manifest.baselineCommit !== slice.baseline_commit) throw new Error('CHECKPOINT_MANIFEST_MISMATCH')
  const storyPath = plan.story?.path
  if (!safeRelative(storyPath)) throw new Error('STORY_PATH_INVALID')
  const policyPaths = normalizePaths(root, request.policy_paths ?? DEFAULT_POLICY_PATHS, 'POLICY_PATHS')
  const recipePaths = normalizePaths(root, request.recipe_paths ?? DEFAULT_VERIFICATION_RECIPE_PATHS, 'RECIPE_PATHS')
  const policy = digestFiles(root, policyPaths)
  const recipes = digestFiles(root, recipePaths)
  const risk = riskLevel(plan, request)
  const checkSpecs = verificationCheckSpecs(request)
  const semanticCoverage = request.semantic_coverage ?? null
  const verificationReceipt = request.verification_receipt_path ?? verificationReceiptPath(request.story_id, request.slice_id, 'verification')
  const reviewReceipt = request.review_receipt_path ?? verificationReceiptPath(request.story_id, request.slice_id, 'review')
  if (!safeRelative(verificationReceipt) || !safeRelative(reviewReceipt)) throw new Error('RECEIPT_PATH_INVALID')
  if (git(root, ['cat-file', '-e', `${head}:${verificationReceipt}`]).status === 0) throw new Error('VERIFICATION_RECEIPT_ALREADY_EXISTS')
  if (git(root, ['cat-file', '-e', `${head}:${reviewReceipt}`]).status === 0) throw new Error('REVIEW_RECEIPT_ALREADY_EXISTS')
  const nextAction = successorFor(plan, request.slice_id)
  const transactionId = request.transaction_id ?? randomUUID()
  const preview = {
    schema_version: 1,
    action: 'verify_slice',
    operation: 'verify',
    story_id: request.story_id,
    slice_id: request.slice_id,
    transaction_id: transactionId,
    expected_head: head,
    plan_path: planPath,
    story_path: storyPath,
    original_plan: plan,
    original_slice: slice,
    plan_digest: planDigest,
    story_digest: hash(readFileSync(safeFile(root, storyPath))),
    policy: { paths: policy.paths, files: policy.files, digest: policy.digest },
    recipes: { paths: recipes.paths, files: recipes.files, digest: recipes.digest },
    pointer_digest: hash(readFileSync(pointer.path)),
    manifest,
    changed_paths: changed,
    changed_paths_sha256: manifest.changedPathsSha256,
    baseline_commit: manifest.baselineCommit,
    checkpoint_commit: manifest.checkpointCommit,
    subject_digest: slice.subject_digest,
    risk,
    canonical_selector: request.canonical_selector ?? 'auto',
    check_specs: checkSpecs,
    semantic_coverage: semanticCoverage,
    review_questions: request.review_questions ?? null,
    verification_receipt_path: verificationReceipt,
    review_receipt_path: reviewReceipt,
    next_action: nextAction,
    plan_template: request.plan_template ?? null,
    plan_template_digest: request.plan_template ? hash(Buffer.from(request.plan_template)) : null,
  }
  preview.context_digest = digestValue({
    action: 'verify_slice', story_id: request.story_id, slice_id: request.slice_id,
    risk, canonical_selector: preview.canonical_selector, changed_paths: changed,
    check_specs: checkSpecs, semantic_coverage: semanticCoverage, next_action: nextAction
  })
  preview.fingerprint = previewFingerprint(preview)
  return { status: 'READY', ready: true, valid: true, action: 'verify_slice', operation: 'prepare', fingerprint: preview.fingerprint, preview }
}

function verificationDescriptorFromPreview(root, request, preview, recovery = false) {
  if (!preview || typeof preview !== 'object') throw new Error('PREVIEW_REQUIRED')
  if (preview.fingerprint !== previewFingerprint(preview)) throw new Error('STALE_PREVIEW')
  if (preview.action !== 'verify_slice' || preview.story_id !== request.story_id || preview.slice_id !== request.slice_id) throw new Error('PREVIEW_IDENTITY_MISMATCH')
  const pointer = assertPointerIdle(root)
  if (pointer.digest !== preview.pointer_digest) throw new Error('STALE_POINTER_PREVIEW')
  if (!recovery && gitOutput(root, ['rev-parse', 'HEAD']) !== preview.expected_head) throw new Error('STALE_HEAD')
  if (!recovery && hash(Buffer.from(readText(root, preview.plan_path))) !== preview.plan_digest) throw new Error('STALE_PLAN_PREVIEW')
  if (digestFiles(root, preview.policy.paths).digest !== preview.policy.digest) throw new Error('STALE_POLICY_PREVIEW')
  if (digestFiles(root, preview.recipes.paths).digest !== preview.recipes.digest) throw new Error('STALE_RECIPE_PREVIEW')
  if (hash(readFileSync(safeFile(root, preview.story_path))) !== preview.story_digest) throw new Error('STALE_STORY_PREVIEW')
  if (request.expected_head && request.expected_head !== preview.expected_head) throw new Error('STALE_HEAD')
  if (request.canonical_selector !== undefined && request.canonical_selector !== preview.canonical_selector) throw new Error('CANONICAL_SELECTOR_CHANGED')
  const requestSpecs = request.check_specs ?? request.focused_check_specs ?? request.focused_checks
  if (requestSpecs !== undefined && !sameJson(requestSpecs, preview.check_specs)) throw new Error('CHECK_SPECS_CHANGED')
  if (request.semantic_coverage !== undefined && !sameJson(request.semantic_coverage, preview.semantic_coverage)) throw new Error('SEMANTIC_COVERAGE_CHANGED')
  if (request.policy_paths !== undefined && !sameJson(canonicalPaths(request.policy_paths), preview.policy.paths)) throw new Error('STALE_POLICY_PREVIEW')
  if (request.recipe_paths !== undefined && !sameJson(canonicalPaths(request.recipe_paths), preview.recipes.paths)) throw new Error('STALE_RECIPE_PREVIEW')
  if (request.plan_template !== undefined && preview.plan_template !== null && request.plan_template !== preview.plan_template) throw new Error('STALE_PLAN_TEMPLATE')
  return {
    ...preview,
    action: 'verify_slice',
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    transaction_id: preview.transaction_id,
    expected_head: preview.expected_head,
    metadata_paths: [preview.plan_path, preview.verification_receipt_path, ...(request.include_review_receipt ? [preview.review_receipt_path] : [])],
    recheck: recovery ? undefined : freshRoot => {
      if (gitOutput(freshRoot, ['rev-parse', 'HEAD']) !== preview.expected_head) throw new Error('STALE_HEAD')
      const freshPointer = assertPointerIdle(freshRoot)
      if (freshPointer.digest !== preview.pointer_digest) throw new Error('STALE_POINTER_PREVIEW')
      if (hash(Buffer.from(readText(freshRoot, preview.plan_path))) !== preview.plan_digest) throw new Error('STALE_PLAN_PREVIEW')
      const freshManifest = inspectSliceVerification(freshRoot, preview.story_id, preview.slice_id)
      if (['STALE', 'BLOCKED', 'INVALID', 'ERROR'].includes(freshManifest.status)) throw new Error(`VERIFICATION_MANIFEST_${freshManifest.status}`)
      if (!exactList(changePaths(freshManifest.changedPaths), preview.changed_paths)) throw new Error('CHANGED_PATH_SCOPE_CHANGED')
      const inventory = worktreeInventory(freshRoot)
      if (inventory.staged.length || inventory.unstaged.length || inventory.untracked.length) throw new Error('DIRTY_SCOPE_MISMATCH')
    }
  }
}

function runEscalation(root, risk, verification, judgmentFlags) {
  const script = safeFile(root, '.agents/scripts/check-escalation.mjs')
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ risk, verification, judgmentFlags }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024
  })
  if (result.error || result.status === null || !result.stdout?.trim()) throw new Error('ESCALATION_EXECUTION_ERROR')
  let parsed
  try { parsed = JSON.parse(result.stdout.trim()) } catch { throw new Error('ESCALATION_OUTPUT_INVALID') }
  if (!['NO_REVIEW', 'REVIEW_REQUIRED'].includes(parsed.decision)) throw new Error('ESCALATION_DECISION_INVALID')
  return parsed
}

function produceChangeEvidence(root, preview) {
  const script = path.resolve(root, '.agents/scripts/prepare-change-evidence.mjs')
  if (!existsSync(script)) return null
  const result = spawnSync(process.execPath, [script, '--comparison', 'explicit-pair', '--base', preview.baseline_commit,
    '--head', preview.checkpoint_commit, ...preview.changed_paths.flatMap(relative => ['--path', relative])], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 64 * 1024 * 1024
  })
  if (result.error || result.status !== 0 || !result.stdout?.trim()) return null
  try {
    const output = JSON.parse(result.stdout.trim())
    return output.status === 'OK' ? output.changeEvidence : null
  } catch { return null }
}

function runVerificationBundle(root, preview, request) {
  const manifest = inspectSliceVerification(root, preview.story_id, preview.slice_id)
  if (['STALE', 'BLOCKED', 'INVALID', 'ERROR'].includes(manifest.status)) return { blocked: true, reasons: [`VERIFICATION_MANIFEST_${manifest.status}`], manifest }
  if (!exactList(changePaths(manifest.changedPaths), preview.changed_paths) || manifest.changedPathsSha256 !== preview.changed_paths_sha256) {
    return { stale: true, reasons: ['CHANGED_PATH_SCOPE_CHANGED'], manifest }
  }
  const subject = { kind: 'commit', value: preview.checkpoint_commit }
  const canonical = verifyChangedPaths(root, preview.canonical_selector, preview.changed_paths, { subject: { commit: preview.checkpoint_commit } })
  const canonicalObservation = observeCanonicalCheck(root, preview, canonical, request)
  const specs = request.check_specs ?? request.focused_check_specs ?? request.focused_checks ?? preview.check_specs
  const focusedEvidence = specs.map(spec => executeCheck(root, spec, subject))
  const focusedValidation = focusedEvidence.map(evidence => validateCheckEvidence(root, evidence))
  const canonicalStatus = VERIFICATION_STATUSES.has(canonical.status) ? canonical.status : 'ERROR'
  const focusedStatus = focusedValidation.some(item => item.status === 'STALE') ? 'ERROR' :
    focusedValidation.some(item => item.status !== 'VALID') ? 'ERROR' :
      focusedEvidence.some(item => item.status === 'ERROR') ? 'ERROR' :
        focusedEvidence.some(item => item.status === 'FAIL') ? 'FAIL' : 'PASS'
  const status = canonicalStatus === 'ERROR' || focusedStatus === 'ERROR' ? 'ERROR' :
    canonicalStatus === 'FAIL' || focusedStatus === 'FAIL' ? 'FAIL' : canonicalStatus
  const reasons = [...new Set([
    ...(Array.isArray(canonical.escalationReasons) ? canonical.escalationReasons : ['CANONICAL_RESULT_INVALID']),
    ...focusedEvidence.flatMap(item => item.reasons ?? []),
    ...focusedValidation.flatMap(item => item.reasons ?? [])
  ])]
  const checks = [
    ...(Array.isArray(canonical.checks) ? canonical.checks : []),
    ...focusedEvidence.map((evidence, index) => ({
      id: evidence.check_id,
      status: focusedValidation[index].status === 'VALID' ? evidence.status : 'ERROR',
      required: evidence.required !== false,
      evidence_ref: evidence.command_digest ?? null,
      reasons: [...(evidence.reasons ?? []), ...(focusedValidation[index].reasons ?? [])]
    }))
  ]
  const verification = {
    schema_version: 2,
    status,
    complete: status === 'PASS' || status === 'FAIL',
    escalationReasons: reasons,
    checks,
    canonical,
    focused_checks: focusedEvidence,
    changed_paths: preview.changed_paths,
    changed_paths_sha256: preview.changed_paths_sha256,
    subject: { commit: preview.checkpoint_commit },
    semantic_coverage: preview.semantic_coverage ?? null
  }
  const unknownCoverage = status === 'INCOMPLETE' ? reasons.filter(reason => !KNOWN_COVERAGE_REASONS.has(reason)) : []
  if (unknownCoverage.length) return { blocked: true, reasons: ['UNKNOWN_COVERAGE_REASON', ...unknownCoverage], manifest, verification }
  if (status === 'INCOMPLETE') {
    const semantic = request.semantic_coverage ?? preview.semantic_coverage
    if (!semantic || semantic.decision !== 'COVERED' || !Array.isArray(semantic.evidence_refs) || !semantic.evidence_refs.length) {
      return { blocked: true, reasons: ['SEMANTIC_COVERAGE_REQUIRED'], manifest, verification }
    }
  }
  const judgmentFlags = request.judgment_flags ?? []
  if (!Array.isArray(judgmentFlags) || judgmentFlags.some(item => typeof item !== 'string')) return { invalid: true, reasons: ['JUDGMENT_FLAGS_INVALID'], manifest, verification }
  let escalation
  try { escalation = runEscalation(root, preview.risk, verification, judgmentFlags) }
  catch (error) { return { blocked: true, reasons: [error.message], manifest, verification } }
  return { manifest, verification, focusedEvidence, focusedValidation, escalation, judgmentFlags, reasons, canonicalObservation }
}

function evidenceRefs(evidence = []) {
  return evidence.map(item => ({ check_id: item.check_id, command_digest: item.command_digest, output_digest: item.output_digest }))
}

function makePending(preview, bundle, request, evidenceState = null) {
  const questions = validateReviewQuestions(request.review_questions ?? preview.review_questions ?? undefined, bundle.verification?.escalationReasons ?? [])
  const requestedEvidence = evidenceState?.valid
    ? { paths: preview.changed_paths, refs: evidenceState.refs, scope_digest: evidenceState.scope_digest }
    : { paths: preview.changed_paths, refs: [], scope_digest: null }
  const pendingBase = {
    schema_version: 1,
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    expected_head: preview.expected_head,
    checkpoint_commit: preview.checkpoint_commit,
    baseline_commit: preview.baseline_commit,
    changed_paths: preview.changed_paths,
    changed_paths_sha256: preview.changed_paths_sha256,
    subject_digest: preview.subject_digest,
    policy_digest: preview.policy.digest,
    recipes_digest: preview.recipes.digest,
    context_digest: preview.context_digest,
    preview_fingerprint: preview.fingerprint,
    risk: preview.risk,
    verification_status: bundle.verification?.status ?? 'ERROR',
    canonical_status: bundle.verification?.canonical?.status ?? 'ERROR',
    verification: bundle.verification ?? null,
    focused_evidence: bundle.focusedEvidence ?? bundle.verification?.focused_checks ?? [],
    escalation: bundle.escalation ?? null,
    judgment_flags: bundle.judgmentFlags ?? [],
    review_questions: questions,
    requested_evidence: requestedEvidence,
    evidence_round: 0,
    evidence_refs: evidenceRefs(bundle.focusedEvidence ?? bundle.verification?.focused_checks ?? [])
  }
  return { ...pendingBase, fingerprint: digestValue(pendingBase) }
}

function replaceVerificationTemplate(text, values) {
  if (typeof text !== 'string' || !text) throw new Error('PLAN_TEMPLATE_REQUIRED')
  let output = text
  for (const [name, value] of Object.entries(values)) {
    const replacement = String(value ?? '')
    output = output.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), replacement)
      .replace(new RegExp(`\\{\\{${name.toLowerCase()}\\}\\}`, 'g'), replacement)
  }
  if (/\{\{[^}]+\}\}/.test(output)) throw new Error('PLAN_TEMPLATE_UNRESOLVED')
  return output
}

function commandRecordsFromEvidence(evidence) {
  const records = evidence.filter(item => Number.isInteger(item.exit_code)).map(item => ({
    command: `check:${item.check_id}`,
    exit_code: item.exit_code,
    tool: 'v4-check-executor',
    environment: item.environment?.status === 'KNOWN' ? JSON.stringify(item.environment) : 'unknown'
  }))
  if (!records.length) throw new Error('VERIFICATION_COMMAND_EVIDENCE_REQUIRED')
  return records
}

function reviewCommandRecords(review) {
  const records = review?.commands
  if (!Array.isArray(records) || !records.length || records.some(item => !item || typeof item.command !== 'string' || !item.command ||
      !Number.isInteger(item.exit_code) || typeof item.tool !== 'string' || !item.tool || typeof item.environment !== 'string' || !item.environment)) {
    throw new Error('REVIEW_COMMAND_EVIDENCE_REQUIRED')
  }
  return records.map(item => ({ command: item.command, exit_code: item.exit_code, tool: item.tool, environment: item.environment }))
}

function buildVerificationMetadata(root, preview, outcome, targetStatus, review = null) {
  const verificationEvidence = outcome.verification
  const focused = outcome.focusedEvidence ?? verificationEvidence.focused_checks ?? []
  const reusableFocused = focused.map(item => ({
    ...item,
    result: item.status,
    subject: { commit: preview.checkpoint_commit },
    changed_paths: preview.changed_paths,
    changed_paths_sha256: preview.changed_paths_sha256,
    toolchain_digest: digestValue(item.toolchain ?? null),
    environment_sensitive: false
  }))
  const verificationReceipt = {
    schema_version: 1,
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    kind: 'verification',
    checkpoint_commit: preview.checkpoint_commit,
    baseline_commit: preview.baseline_commit,
    subject_digest: preview.subject_digest,
    created_from_head: preview.checkpoint_commit,
    changed_paths_sha256: preview.changed_paths_sha256,
    commands: commandRecordsFromEvidence(focused),
    canonical: verificationEvidence.canonical,
    focused_checks: reusableFocused,
    raw_focused_checks: focused,
    escalation: outcome.escalation,
    semantic_coverage: preview.semantic_coverage ?? null,
    progression_eligible: true,
    status: verificationEvidence.status,
    context_digest: preview.context_digest
  }
  const verificationDigest = receiptDigest(verificationReceipt)
  let reviewReceipt = null
  let reviewDigest = null
  if (review) {
    const reviewCommands = reviewCommandRecords(review)
    reviewReceipt = {
      schema_version: 1,
      story_id: preview.story_id,
      slice_id: preview.slice_id,
      kind: 'review',
      checkpoint_commit: preview.checkpoint_commit,
      baseline_commit: preview.baseline_commit,
      subject_digest: preview.subject_digest,
      created_from_head: preview.checkpoint_commit,
      changed_paths_sha256: preview.changed_paths_sha256,
      commands: reviewCommands,
      judgment: review.judgment,
      questions: preview.review_questions ?? review.questions ?? [],
      answers: review.answers ?? null,
      evidence_refs: review.evidence_refs ?? null,
      scope_digest: review.scope_digest ?? null,
      risk_context_digest: digestValue(preview.original_plan.risk ?? null),
      reviewed_commit: preview.checkpoint_commit,
      reviewer: review.reviewer ?? 'same-lead'
    }
    reviewDigest = receiptDigest(reviewReceipt)
  }
  const nextAction = preview.next_action
  const currentSlice = nextAction.kind === 'implement_slice' ? nextAction.target : preview.slice_id
  const values = {
    BASELINE_COMMIT: preview.baseline_commit,
    CHECKPOINT_COMMIT: preview.checkpoint_commit,
    SUBJECT_DIGEST: preview.subject_digest,
    CHANGED_PATHS_SHA256: preview.changed_paths_sha256,
    VERIFICATION_RECEIPT_PATH: preview.verification_receipt_path,
    VERIFICATION_RECEIPT_DIGEST: verificationDigest,
    REVIEW_RECEIPT_PATH: preview.review_receipt_path,
    REVIEW_RECEIPT_DIGEST: reviewDigest ?? '',
    CURRENT_SLICE: currentSlice,
    NEXT_ACTION_KIND: nextAction.kind,
    NEXT_ACTION_TARGET: nextAction.target,
    TARGET_STATUS: targetStatus,
    VERIFICATION_STATUS: verificationEvidence.status,
    CANONICAL_STATUS: verificationEvidence.canonical?.status ?? 'ERROR',
    ESCALATION_DECISION: outcome.escalation?.decision ?? 'REVIEW_REQUIRED',
    PROGRESSION_ELIGIBLE: 'true',
    REVIEW_JUDGMENT: review?.judgment ?? '',
    REVIEWED_COMMIT: preview.checkpoint_commit,
    REVIEWER: review?.reviewer ?? '',
    RISK_CONTEXT_DIGEST: digestValue(preview.original_plan.risk ?? null),
    CONTEXT_DIGEST: preview.context_digest
  }
  const planText = replaceVerificationTemplate(preview.plan_template, values)
  const files = {
    [preview.plan_path]: planText,
    [preview.verification_receipt_path]: `${JSON.stringify(verificationReceipt, null, 2)}\n`
  }
  if (reviewReceipt) files[preview.review_receipt_path] = `${JSON.stringify(reviewReceipt, null, 2)}\n`
  const metadata = {
    paths: canonicalPaths(Object.keys(files)),
    files,
    verification_receipt: verificationReceipt,
    verification_digest: verificationDigest,
    review_receipt: reviewReceipt,
    review_digest: reviewDigest,
    target_status: targetStatus,
    next_action: nextAction,
    checkpoint: {
      baseline_commit: preview.baseline_commit,
      checkpoint_commit: preview.checkpoint_commit,
      changed_paths: preview.changed_paths,
      changed_paths_sha256: preview.changed_paths_sha256,
      subject_digest: preview.subject_digest
    }
  }
  validateVerificationMetadata(root, preview, metadata)
  return metadata
}

function validateVerificationMetadata(root, preview, metadata) {
  const generated = frontmatter(metadata.files[preview.plan_path])
  if (generated.schema_version !== preview.original_plan.schema_version || generated.story_id !== preview.story_id) throw new Error('PLAN_IDENTITY_CHANGED')
  if (generated.lifecycle_snapshot !== preview.original_plan.lifecycle_snapshot || generated.execution_status !== preview.original_plan.execution_status) throw new Error('PLAN_LIFECYCLE_CHANGED')
  const expectedCurrent = metadata.next_action.kind === 'implement_slice' ? metadata.next_action.target : preview.slice_id
  if (generated.current_slice !== expectedCurrent || !sameJson(generated.next_action, metadata.next_action)) throw new Error('SUCCESSOR_PROJECTION_MISMATCH')
  if (generated.human_approval != null || generated.finalization != null) throw new Error('COMPLETION_AUTHORITY_FORBIDDEN')
  assertUnchanged(preview.original_plan, generated, [
    'schema_version', 'story_id', 'story', 'upstream_epic', 'sprint_key', 'lifecycle_snapshot',
    'execution_status', 'planning_approval', 'readiness', 'risk', 'blockers', 'unresolved_questions',
    'human_approval', 'finalization'
  ])
  const originalSlices = preview.original_plan.slices ?? []
  for (const original of originalSlices) {
    const next = generated.slices?.find(item => item?.id === original.id)
    if (!next) throw new Error('PLAN_SLICE_SET_CHANGED')
    if (original.id !== preview.slice_id && !sameJson(original, next)) throw new Error('OTHER_SLICE_METADATA_CHANGED')
  }
  const slice = sliceById(generated, preview.slice_id)
  if (slice.status !== metadata.target_status || slice.baseline_commit !== preview.baseline_commit ||
      slice.checkpoint_commit !== preview.checkpoint_commit || slice.subject_digest !== preview.subject_digest ||
      slice.changed_paths_sha256 !== preview.changed_paths_sha256) throw new Error('VERIFICATION_SCOPE_MISMATCH')
  if (!sameJson(slice.receipt_refs?.implementation, preview.original_slice.receipt_refs?.implementation)) throw new Error('IMPLEMENTATION_RECEIPT_CHANGED')
  if (!slice.receipt_refs?.verification || slice.receipt_refs.verification.path !== preview.verification_receipt_path ||
      slice.receipt_refs.verification.digest !== metadata.verification_digest) throw new Error('VERIFICATION_RECEIPT_BINDING_MISMATCH')
  if (metadata.review_digest) {
    if (!slice.receipt_refs?.review || slice.receipt_refs.review.path !== preview.review_receipt_path || slice.receipt_refs.review.digest !== metadata.review_digest) throw new Error('REVIEW_RECEIPT_BINDING_MISMATCH')
  } else if (slice.receipt_refs?.review) throw new Error('UNEXPECTED_REVIEW_RECEIPT')
  if (receiptDigest(JSON.parse(metadata.files[preview.verification_receipt_path])) !== metadata.verification_digest) throw new Error('VERIFICATION_RECEIPT_DIGEST_MISMATCH')
  if (metadata.review_digest && receiptDigest(JSON.parse(metadata.files[preview.review_receipt_path])) !== metadata.review_digest) throw new Error('REVIEW_RECEIPT_DIGEST_MISMATCH')
  if (metadata.verification_receipt?.status === 'INCOMPLETE' &&
      typeof slice.verification?.review_disclosure !== 'string' ||
      metadata.verification_receipt?.status === 'INCOMPLETE' && !slice.verification.review_disclosure.trim()) throw new Error('INCOMPLETE_REVIEW_DISCLOSURE_REQUIRED')
  const checked = validateStoryPlan(root, preview.story_id)
  if (checked.status !== 'READY') throw new Error(`POST_METADATA_PLAN_NOT_READY:${checked.reasons.join(',')}`)
}

function metadataDescriptor(root, preview, outcome, targetStatus, review, transactionId) {
  const metadataPaths = [preview.plan_path, preview.verification_receipt_path, ...(review ? [preview.review_receipt_path] : [])]
  const binding = digestValue({ preview: preview.fingerprint, targetStatus, review, nextAction: preview.next_action })
  return {
    action: 'verify_slice',
    story_id: preview.story_id,
    slice_id: preview.slice_id,
    transaction_id: transactionId,
    expected_head: preview.expected_head,
    checkpoint_commit: preview.expected_head,
    baseline_commit: preview.baseline_commit,
    preview_fingerprint: binding,
    metadata_paths: metadataPaths,
    changed_paths: preview.changed_paths,
    changed_paths_sha256: preview.changed_paths_sha256,
    subject: null,
    subject_digest: preview.subject_digest,
    target_status: targetStatus,
    next_action: preview.next_action,
    stop_condition: targetStatus === 'reviewed' ? 'NEXT_ACTION_EXPLICIT_AFTER_REVIEW' : 'SAME_ACTION_REVIEW_REQUIRED_OR_NEXT_ACTION',
    buildMetadata: () => buildVerificationMetadata(root, preview, outcome, targetStatus, review),
    readMetadata: freshRoot => {
      const files = Object.fromEntries(metadataPaths.map(relative => [relative, readText(freshRoot, relative)]))
      const verificationReceipt = JSON.parse(files[preview.verification_receipt_path])
      const reviewReceipt = review ? JSON.parse(files[preview.review_receipt_path]) : null
      return {
        paths: metadataPaths,
        files,
        verification_receipt: verificationReceipt,
        verification_digest: receiptDigest(verificationReceipt),
        review_receipt: reviewReceipt,
        review_digest: reviewReceipt ? receiptDigest(reviewReceipt) : null,
        target_status: targetStatus,
        next_action: preview.next_action,
        checkpoint: {
          baseline_commit: preview.baseline_commit,
          checkpoint_commit: preview.checkpoint_commit,
          changed_paths: preview.changed_paths,
          changed_paths_sha256: preview.changed_paths_sha256,
          subject_digest: preview.subject_digest
        }
      }
    },
    recheck: freshRoot => {
      if (gitOutput(freshRoot, ['rev-parse', 'HEAD']) !== preview.expected_head) throw new Error('STALE_HEAD')
      const pointer = assertPointerIdle(freshRoot)
      if (pointer.digest !== preview.pointer_digest) throw new Error('STALE_POINTER_PREVIEW')
      if (hash(Buffer.from(readText(freshRoot, preview.plan_path))) !== preview.plan_digest) throw new Error('STALE_PLAN_PREVIEW')
      const manifest = inspectSliceVerification(freshRoot, preview.story_id, preview.slice_id)
      if (['STALE', 'BLOCKED', 'INVALID', 'ERROR'].includes(manifest.status)) throw new Error(`VERIFICATION_MANIFEST_${manifest.status}`)
      if (!exactList(changePaths(manifest.changedPaths), preview.changed_paths)) throw new Error('CHANGED_PATH_SCOPE_CHANGED')
    },
    validateMetadata: metadata => validateVerificationMetadata(root, preview, metadata),
    validateFinal: metadata => validateVerificationMetadata(root, preview, metadata)
  }
}

function persistVerification(root, preview, outcome, request, targetStatus = 'verified', review = null) {
  const recovery = request.recovery_authorized === true || request.recovery?.authorized === true
  if (!preview.plan_template && !request.plan_template && !recovery) throw new Error('PLAN_TEMPLATE_REQUIRED')
  const effectivePreview = { ...preview, plan_template: request.plan_template ?? preview.plan_template }
  const transactionId = request.transaction_id ?? (review ? `${preview.transaction_id}-review` : preview.transaction_id)
  const descriptor = metadataDescriptor(root, effectivePreview, outcome, targetStatus, review, transactionId)
  descriptor.fail_at = request.fail_at ?? request.failure_phase
  descriptor.recovery = request.recovery_authorized === true || request.recovery?.authorized === true
  if (descriptor.recovery) {
    descriptor.recovery_checkpoint = request.recovery_checkpoint ?? request.recovery?.checkpoint_commit
    if (!descriptor.recovery_checkpoint) throw new Error('RECOVERY_CHECKPOINT_REQUIRED')
    descriptor.recheck = undefined
  }
  const result = executeMetadataTransaction(root, descriptor)
  if (result.status === 'APPLIED' || result.status === 'NOOP') return { ...result, action: 'verify_slice', operation: review ? 'record-review' : 'verify', next_action: result.next_action }
  return result
}

function verificationError(error) {
  if (error.message.includes('STALE') || error.message.includes('MISMATCH') || error.message === 'EXPECTED_HEAD_MISMATCH') return stale(error.message)
  if (error.message.includes('PLAN_NOT_READY') || error.message.includes('MANIFEST_') || error.message.includes('SLICE_') ||
      error.message.includes('DIRTY_') || error.message.includes('SUCCESSOR_') || error.message.includes('AMBIGUOUS_')) return blocked(error.message)
  if (['INPUT_REQUIRED', 'INVALID_STORY_ID', 'INVALID_SLICE_ID', 'INVALID_EXPECTED_HEAD', 'ACTION_MISMATCH', 'OPERATION_MISMATCH', 'RISK_LEVEL_REQUIRED'].includes(error.message) ||
      error.message.startsWith('MIXED_CONTROL_FLAG:')) return invalid(error.message)
  return errorResult(error)
}

function verifySliceCore(root, request = {}) {
  try {
    root = path.resolve(root)
    assertVerificationRequestShape(request, 'verify')
    const recovery = request.recovery_authorized === true || request.recovery?.authorized === true
    const preview = request.preview
    const descriptorPreview = verificationDescriptorFromPreview(root, request, preview, recovery)
    if (recovery) return persistVerification(root, descriptorPreview, null, request, request.target_status ?? 'verified', request.review ?? null)
    const bundle = runVerificationBundle(root, descriptorPreview, request)
    if (bundle.stale) return stale(bundle.reasons[0], { action: 'verify_slice', operation: 'verify', manifest: bundle.manifest })
    if (bundle.invalid) return invalid(bundle.reasons[0], { action: 'verify_slice', operation: 'verify', verification: bundle.verification })
    if (bundle.blocked) return blocked(bundle.reasons[0], { action: 'verify_slice', operation: 'verify', manifest: bundle.manifest, verification: bundle.verification ?? null })
    if (bundle.verification.status === 'ERROR') return blocked('VERIFICATION_ERROR', { action: 'verify_slice', operation: 'verify', verification: bundle.verification, escalation: bundle.escalation })
    const reviewRequired = bundle.escalation.decision === 'REVIEW_REQUIRED' || descriptorPreview.risk !== 'LOW'
    if (reviewRequired) {
      const evidence = inspectChangeEvidence(request.change_evidence ?? produceChangeEvidence(root, descriptorPreview), descriptorPreview.changed_paths)
      const pending = makePending(descriptorPreview, bundle, request, evidence)
      return {
        status: 'REVIEW_REQUIRED', ready: false, valid: true, reasons: bundle.escalation.reasons ?? ['REVIEW_REQUIRED'],
        action: 'verify_slice', operation: 'verify', escalation: bundle.escalation,
        verification: bundle.verification, pending, requested_evidence: pending.requested_evidence,
        stop_condition: 'SAME_LEAD_REVIEW_REQUIRED'
      }
    }
    if (bundle.verification.status !== 'PASS' || bundle.verification.escalationReasons.length) {
      return blocked('VERIFICATION_NOT_PROGRESSING', { action: 'verify_slice', operation: 'verify', verification: bundle.verification, escalation: bundle.escalation })
    }
    return persistVerification(root, descriptorPreview, bundle, request, 'verified')
  } catch (error) { return verificationError(error) }
}

function validateReviewAnswers(review, questions) {
  const answers = review?.answers
  if (Array.isArray(answers)) {
    if (!exactList(answers.map(item => item?.id), questions.map(item => item.id)) || answers.some(item => typeof item?.answer !== 'string' || !item.answer.trim())) throw new Error('REVIEW_ANSWERS_INCOMPLETE')
    return answers
  }
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    if (!exactList(Object.keys(answers), questions.map(item => item.id)) || Object.values(answers).some(value => typeof value !== 'string' || !value.trim())) throw new Error('REVIEW_ANSWERS_INCOMPLETE')
    return questions.map(item => ({ id: item.id, answer: answers[item.id] }))
  }
  throw new Error('REVIEW_ANSWERS_INCOMPLETE')
}

function recordSliceReviewCore(root, request = {}) {
  try {
    root = path.resolve(root)
    assertVerificationRequestShape({ ...request, action: 'verify_slice' }, 'record-review')
    const recovery = request.recovery_authorized === true || request.recovery?.authorized === true
    const preview = request.preview
    const pending = request.pending
    if (!pending || typeof pending !== 'object' || pending.fingerprint !== digestValue(Object.fromEntries(Object.entries(pending).filter(([key]) => key !== 'fingerprint')))) throw new Error('PENDING_EVIDENCE_INVALID')
    const descriptorPreview = verificationDescriptorFromPreview(root, { ...request, action: 'verify_slice' }, preview, recovery)
    if (pending.preview_fingerprint !== descriptorPreview.fingerprint || pending.story_id !== descriptorPreview.story_id || pending.slice_id !== descriptorPreview.slice_id) throw new Error('PENDING_EVIDENCE_STALE')
    if (!exactList(pending.changed_paths, descriptorPreview.changed_paths) || pending.changed_paths_sha256 !== descriptorPreview.changed_paths_sha256) throw new Error('PENDING_SCOPE_MISMATCH')
    if (recovery) {
      if (!request.review || request.review.judgment !== 'APPROVE') throw new Error('RECOVERY_REVIEW_APPROVAL_REQUIRED')
      return persistVerification(root, descriptorPreview, null, request, 'reviewed', request.review)
    }
    const manifest = inspectSliceVerification(root, descriptorPreview.story_id, descriptorPreview.slice_id)
    if (['STALE', 'BLOCKED', 'INVALID', 'ERROR'].includes(manifest.status)) return stale(`VERIFICATION_MANIFEST_${manifest.status}`)
    if (!exactList(changePaths(manifest.changedPaths), descriptorPreview.changed_paths)) return stale('CHANGED_PATH_SCOPE_CHANGED')
    const review = request.review
    if (!review || typeof review !== 'object' || Array.isArray(review) || !REVIEW_JUDGMENTS.has(review.judgment)) throw new Error('REVIEW_JUDGMENT_REQUIRED')
    const questions = pending.review_questions
    if (!Array.isArray(questions) || !questions.length) throw new Error('REVIEW_QUESTIONS_REQUIRED')
    validateReviewAnswers(review, questions)
    if (!exactList(review.scope_paths, descriptorPreview.changed_paths)) throw new Error('REVIEW_SCOPE_MISMATCH')
    if (review.pending_fingerprint !== pending.fingerprint) throw new Error('REVIEW_PENDING_FINGERPRINT_MISMATCH')
    const evidence = inspectChangeEvidence(review.change_evidence, descriptorPreview.changed_paths)
    if (!evidence.valid) return blocked(evidence.reasons[0], { action: 'verify_slice', operation: 'record-review' })
    if (review.scope_digest !== evidence.scope_digest || pending.requested_evidence.scope_digest !== null &&
        pending.requested_evidence.scope_digest !== undefined && review.scope_digest !== pending.requested_evidence.scope_digest) throw new Error('REVIEW_EVIDENCE_SCOPE_DIGEST_MISMATCH')
    if (review.judgment === 'CHANGES_REQUIRED') return blocked('CHANGES_REQUIRED', {
      action: 'verify_slice', operation: 'record-review', pending, review, stop_condition: 'HUMAN_REVIEW_CHANGES_REQUIRED'
    })
    if (review.judgment === 'NEED_MORE_EVIDENCE') {
      if (pending.evidence_round >= 1) return blocked('EVIDENCE_BUDGET_EXHAUSTED', { action: 'verify_slice', operation: 'record-review', pending })
      const nextPending = { ...pending, evidence_round: pending.evidence_round + 1, requested_evidence: { paths: descriptorPreview.changed_paths, refs: evidence.refs, scope_digest: evidence.scope_digest } }
      delete nextPending.fingerprint
      nextPending.fingerprint = digestValue(nextPending)
      return { status: 'REVIEW_REQUIRED', ready: false, valid: true, reasons: ['MORE_EVIDENCE_REQUIRED'], action: 'verify_slice', operation: 'record-review', pending: nextPending, requested_evidence: nextPending.requested_evidence, stop_condition: 'ONE_BOUNDED_EVIDENCE_ROUND' }
    }
    if (!['PASS', 'INCOMPLETE'].includes(pending.verification_status) || pending.canonical_status === 'FAIL' || pending.canonical_status === 'ERROR' ||
        (pending.focused_evidence ?? []).some(item => item.status !== 'PASS')) return blocked('VERIFICATION_NOT_APPROVABLE', { action: 'verify_slice', operation: 'record-review', pending })
    const outcome = {
      verification: pending.verification,
      focusedEvidence: pending.focused_evidence,
      escalation: pending.escalation,
      judgmentFlags: pending.judgment_flags ?? []
    }
    const effectiveReview = { ...review, questions, evidence_refs: evidence.refs, scope_digest: evidence.scope_digest }
    return persistVerification(root, descriptorPreview, outcome, request, 'reviewed', effectiveReview)
  } catch (error) { return verificationError(error) }
}

export function verifySlice(root, request = {}) {
  observeActionStarted(path.resolve(root), request, 'verify')
  let result
  try { result = verifySliceCore(root, request) }
  catch (error) { result = errorResult(error) }
  observeActionFinished(path.resolve(root), request, 'verify', result)
  return result
}

export function recordSliceReview(root, request = {}) {
  observeActionStarted(path.resolve(root), request, 'record-review')
  let result
  try { result = recordSliceReviewCore(root, request) }
  catch (error) { result = errorResult(error) }
  observeActionFinished(path.resolve(root), request, 'record-review', result)
  return result
}

export function prepareAction(root, request = {}) {
  try {
    root = path.resolve(root)
    if (request?.action === 'verify_slice') return buildVerificationPreview(root, request)
    return buildPreview(root, request)
  }
  catch (error) {
    if (request?.action === 'verify_slice') return verificationError(error)
    if (error.message.includes('MISMATCH') || error.message.includes('STALE') || error.message === 'EXPECTED_HEAD_MISMATCH') return stale(error.message)
    if (error.message.includes('NOT_READY') || error.message.startsWith('PLAN_NOT_READY')) return blocked(error.message)
    if (['INPUT_REQUIRED', 'INVALID_STORY_ID', 'INVALID_SLICE_ID', 'INVALID_EXPECTED_HEAD', 'ACTION_MISMATCH', 'OPERATION_MISMATCH'].includes(error.message)) return invalid(error.message)
    return errorResult(error)
  }
}

function checkpointImplementationCore(root, request = {}) {
  try {
    root = path.resolve(root)
    const recovery = request.recovery_authorized === true || request.recovery?.authorized === true
    const preview = request.preview
    if (!preview) throw new Error('PREVIEW_REQUIRED')
    const input = buildRequestFromPreview(preview, request, 'checkpoint')
    assertRequestShape(input, 'checkpoint')
    const existing = inspectActionTransaction(root, preview.transaction_id)
    if (!recovery && existing.status === 'RECOVERY_REQUIRED') {
      return blocked('RECOVERY_AUTHORIZATION_REQUIRED', {
        transaction_id: preview.transaction_id,
        journal_path: existing.journal_path,
        lock_path: existing.lock_path,
        checkpoint_commit: existing.checkpoint_commit
      })
    }
    if (!recovery && existing.status === 'COMPLETE') {
      return { status: 'NOOP', ready: false, valid: true, reasons: [], transaction_id: preview.transaction_id,
        checkpoint_commit: existing.checkpoint_commit, metadata_commit: existing.journal?.metadata_commit ?? null,
        next_action: existing.next_action ?? { kind: 'verify_slice', target: preview.slice_id } }
    }
    if (recovery) {
      if (!request.recovery_checkpoint && !request.recovery?.checkpoint_commit) throw new Error('RECOVERY_CHECKPOINT_REQUIRED')
      if (request.recovery_authorized !== true && request.recovery?.authorized !== true) throw new Error('RECOVERY_AUTHORIZATION_REQUIRED')
      input.recovery_checkpoint = request.recovery_checkpoint ?? request.recovery.checkpoint_commit
    } else if (request.expected_head && request.expected_head !== preview.expected_head) {
      throw new Error('STALE_HEAD')
    }
    const descriptor = descriptorFromPreview(root, input, preview, recovery)
    descriptor.recovery = recovery
    descriptor.recovery_checkpoint = input.recovery_checkpoint
    descriptor.fail_at = request.fail_at ?? request.failure_phase
    const result = executeSliceTransaction(root, descriptor)
    if (result.status === 'CHECKPOINTED' || result.status === 'NOOP') {
      return { ...result, action: 'implement_slice', operation: 'checkpoint', next_action: result.next_action ?? { kind: 'verify_slice', target: preview.slice_id } }
    }
    return result
  } catch (error) {
    if (error.message.includes('STALE') || error.message.includes('MISMATCH') || error.message === 'EXPECTED_HEAD_MISMATCH') return stale(error.message)
    if (error.message.includes('RECOVERY')) return blocked(error.message)
    if (error.message === 'MIXED_CONTROL_FLAG:approval' || error.message.startsWith('MIXED_CONTROL_FLAG:')) return invalid(error.message)
    return errorResult(error)
  }
}

export function checkpointImplementation(root, request = {}) {
  observeActionStarted(path.resolve(root), request, 'checkpoint')
  let result
  try { result = checkpointImplementationCore(root, request) }
  catch (error) { result = errorResult(error) }
  observeActionFinished(path.resolve(root), request, 'checkpoint', result)
  return result
}

export function inspectActionTransactionPublic(root, transactionId) {
  return inspectActionTransaction(path.resolve(root), transactionId)
}

export { inspectActionTransactionPublic as inspectActionTransaction }

export function actionFingerprint(value) { return digestValue(value) }

export { transactionHash, transactionIdentity, transactionPathDigest }
