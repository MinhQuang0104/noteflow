import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { receiptDigest } from './check-artifact-contract.mjs'
import {
  canonicalPaths,
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
  if (request.plan_template !== undefined && request.plan_template !== preview.plan_template) throw new Error('STALE_PLAN_TEMPLATE')
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

export function prepareAction(root, request = {}) {
  try { return buildPreview(path.resolve(root), request) }
  catch (error) {
    if (error.message.includes('MISMATCH') || error.message.includes('STALE') || error.message === 'EXPECTED_HEAD_MISMATCH') return stale(error.message)
    if (error.message.includes('NOT_READY') || error.message.startsWith('PLAN_NOT_READY')) return blocked(error.message)
    if (['INPUT_REQUIRED', 'INVALID_STORY_ID', 'INVALID_SLICE_ID', 'INVALID_EXPECTED_HEAD', 'ACTION_MISMATCH', 'OPERATION_MISMATCH'].includes(error.message)) return invalid(error.message)
    return errorResult(error)
  }
}

export function checkpointImplementation(root, request = {}) {
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

export function inspectActionTransactionPublic(root, transactionId) {
  return inspectActionTransaction(path.resolve(root), transactionId)
}

export { inspectActionTransactionPublic as inspectActionTransaction }

export function actionFingerprint(value) { return digestValue(value) }

export { transactionHash, transactionIdentity, transactionPathDigest }
