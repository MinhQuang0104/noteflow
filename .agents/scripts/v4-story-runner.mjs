import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'
import { applyFinalization } from './finalize-story.mjs'
import { explicitApprovalInput, inspectCompletion } from './check-story-completion.mjs'
import { applyCompletion, recordHumanApproval } from './complete-story.mjs'
import { inspectStart, applyStart } from './start-story.mjs'
import { applyRework, checkpointImplementation, prepareAction, prepareRework, recordSliceReview, verifySlice, prepareStagedRecovery, applyStagedRecovery } from './v4-action-kernel.mjs'
import { prepareMetadataAbort, applyMetadataAbort } from './v4-metadata-recovery.mjs'
import { recordActionFinished, recordActionStarted, recordStoryCompleted, recordStoryReviewSnapshot } from './v4-observations.mjs'
import { pointerIdle, storyCheckoutState } from './v4-lifecycle-transaction.mjs'

export { pointerIdle, storyCheckoutState } from './v4-lifecycle-transaction.mjs'

export const V4_AUTHORIZED_ACTIONS = new Set([
  'start_story',
  'reconcile_lifecycle',
  'implement_slice',
  'verify_slice',
  'finalize_story',
  'complete_story'
])

const STORY_ACTIONS = new Set([
  'start_story',
  'reconcile_lifecycle',
  'request_gate',
  'finalize_story',
  'complete_story'
])
const SHA = /^[0-9a-f]{40,64}$/
export const CODES = Object.freeze({
  STARTED: 0,
  DONE: 0,
  APPROVAL_DURABLE_PENDING_COMPLETION: 0,
  NOOP: 0,
  APPLIED: 0,
  HUMAN_GATE_REQUIRED: 0,
  REVIEW_REQUIRED: 0,
  READY: 0,
  AUTHORIZED: 0,
  TERMINAL: 0,
  NO_CHANGE: 0,
  RECOVERY_REQUIRED: 6,
  STALE: 2,
  CONFLICT: 2,
  BLOCKED: 3,
  UNAUTHORIZED_ACTION: 3,
  HUMAN_REQUIRED: 3,
  RECONCILIATION_REQUIRED: 3,
  HUMAN_GATE_PENDING: 3,
  APPROVAL_PREVIEW_ONLY: 3,
  CHECKPOINT_UNRECORDED: 3,
  PLAN_UPDATE_PENDING: 3,
  RESUME_WORKTREE: 3,
  RERUN_REQUIRED: 3,
  INCONCLUSIVE: 3,
  INVALID: 4,
  ERROR: 5
})

export function exitCodeForStatus(status) {
  return CODES[status] ?? CODES.ERROR
}

const CLI_OPERATIONS = new Set([
  'prepare',
  'checkpoint',
  'verify',
  'record-review',
  'record_review',
  'prepare-rework',
  'apply-rework',
  'prepare-recovery-abort',
  'abort-unwritten-metadata',
  'prepare-staged-recovery',
  'apply-staged-recovery'
])
const CLI_USAGE = 'USAGE: run <epic.story> [--expected-head <sha>] [--operation <operation> --input <file>] [--approve-exact-scope]'

function planRelative(storyId) {
  return '_bmad-output/implementation-artifacts/story-' + storyId.replace('.', '-') + '-plan.md'
}

function git(root, args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.error || result.status === null) throw new Error('GIT_UNAVAILABLE')
  return result
}

function gitOutput(root, args, failure) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.trim()
}

function storyLifecycle(root, storyId) {
  try { return frontmatter(readFileSync(path.join(root, planRelative(storyId)), 'utf8')).lifecycle_snapshot ?? null } catch { return null }
}

function checkoutBlock(root, storyId) {
  if (storyLifecycle(root, storyId) === 'done') return null
  const state = storyCheckoutState(root, storyId)
  return state.status === 'READY' ? null : state
}

function invalidResult(reason) {
  return { status: 'INVALID', authorized: false, valid: false, reasons: [reason] }
}

function runnerActionContext(root, storyId, action, expectedHead, options = {}) {
  return {
    story_id: storyId,
    action,
    invocation_id: options.invocationId ?? null,
    session_id: options.sessionId ?? null,
    attempt_id: options.attemptId ?? expectedHead,
    payload: { expected_head: expectedHead, operation: action },
    provenance: { kind: 'v4_runner', source: 'v4-story-runner', operation: action },
  }
}

function runRunnerAction(root, storyId, action, expectedHead, options, apply, after = null) {
  recordActionStarted(root, runnerActionContext(root, storyId, action, expectedHead, options))
  let result
  try { result = apply() } catch (error) { result = { status: 'ERROR', authorized: false, reasons: [error.message] } }
  recordActionFinished(root, { ...runnerActionContext(root, storyId, action, expectedHead, options), payload: {
    expected_head: expectedHead, operation: action, result_status: result.status, next_action: result.next_action ?? null,
  } })
  if (after) after(result)
  return result
}

export function humanApprovalIntent(value) {
  return explicitApprovalInput(value)
}

export function routeAction(input = {}) {
  const action = input.nextAction?.kind
  const target = input.nextAction?.target
  if (typeof action !== 'string') return invalidResult('NEXT_ACTION_MISSING')
  if ((STORY_ACTIONS.has(action) && target !== 'story') ||
      (!STORY_ACTIONS.has(action) && typeof target !== 'string')) {
    return { status: 'INVALID', authorized: false, reasons: ['INVALID_ACTION_TARGET'] }
  }
  if (action === 'start_story') {
    if (input.helperStatus !== 'READY') return { status: input.helperStatus ?? 'BLOCKED', authorized: false, reasons: ['START_HELPER_NOT_READY'] }
    return { status: 'READY', authorized: true, action, stopCondition: 'STORY_STARTED', durableActionCount: 1 }
  }
  if (action === 'finalize_story') {
    if (target !== 'story') return invalidResult('INVALID_ACTION_TARGET')
    if (input.lifecycle !== 'in-progress') return { status: 'BLOCKED', authorized: false, reasons: ['LIFECYCLE_NOT_IN_PROGRESS'] }
    if (input.executionStatus !== 'in-progress') return { status: 'BLOCKED', authorized: false, reasons: ['EXECUTION_STATUS_NOT_IN_PROGRESS'] }
    if (input.helperStatus !== 'READY') {
      return { status: input.helperStatus ?? 'BLOCKED', authorized: false, reasons: ['FINALIZATION_HELPER_NOT_READY'] }
    }
    if (!['READY', 'READY_WITH_DISCLOSURES'].includes(input.doneGateDisposition)) {
      return { status: 'BLOCKED', authorized: false, reasons: ['DONE_GATE_NOT_FINALIZABLE'] }
    }
    if (input.humanApprovalPresent === true) {
      return { status: 'BLOCKED', authorized: false, reasons: ['HUMAN_APPROVAL_NOT_EXPECTED_BEFORE_FINALIZE'] }
    }
    return {
      status: 'READY',
      authorized: true,
      action,
      stopCondition: 'HUMAN_GATE_REQUIRED',
      durableActionCount: 1
    }
  }
  if (action === 'complete_story') {
    if (target !== 'story') return invalidResult('INVALID_ACTION_TARGET')
    if (input.lifecycle !== 'review') return { status: 'BLOCKED', authorized: false, action, reasons: ['LIFECYCLE_NOT_REVIEW'] }
    if (input.executionStatus !== 'complete') return { status: 'BLOCKED', authorized: false, action, reasons: ['EXECUTION_STATUS_NOT_COMPLETE'] }
    if (input.humanApprovalPresent !== true) return { status: 'BLOCKED', authorized: false, action, reasons: ['HUMAN_APPROVAL_REQUIRED'] }
    if (input.completionStatus !== 'READY' || input.humanApprovalFresh !== true) {
      return { status: input.completionStatus ?? 'STALE', authorized: false, action, reasons: ['HUMAN_APPROVAL_STALE'] }
    }
    return {
      status: 'READY',
      authorized: true,
      action,
      stopCondition: 'TERMINAL_DONE',
      durableActionCount: 1
    }
  }
  if (action === 'review_slice') {
    return { status: 'UNAUTHORIZED_ACTION', authorized: false, action, reasons: ['STANDALONE_REVIEW_SLICE_DISABLED'] }
  }
  if (V4_AUTHORIZED_ACTIONS.has(action)) {
    return { status: 'AUTHORIZED', authorized: true, action, durableActionCount: 1 }
  }
  return { status: 'UNAUTHORIZED_ACTION', authorized: false, action, reasons: ['ACTION_NOT_AUTHORIZED'] }
}

export function runV4Story(root, storyId, options = {}) {
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '')) return invalidResult('INVALID_STORY_ID')
    if (!existsSync(path.join(root, planRelative(storyId)))) return invalidResult('PLAN_MISSING')
    if (!pointerIdle(root)) return { status: 'BLOCKED', authorized: false, reasons: ['V3_POINTER_NOT_IDLE'] }
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    const expectedHead = options.expectedHead ?? head
    if (!SHA.test(expectedHead)) return invalidResult('INVALID_EXPECTED_HEAD')
    if (head !== expectedHead) return { status: 'STALE', authorized: false, reasons: ['EXPECTED_HEAD_MISMATCH'] }
    const wrongCheckout = checkoutBlock(root, storyId)
    if (wrongCheckout) return wrongCheckout
    const recoveryOperation = options.operation ?? options.kernel?.operation
    if (['prepare-staged-recovery', 'apply-staged-recovery'].includes(recoveryOperation)) {
      const input = options.input ?? options.kernel?.input
      if (options.approval || options.approveExactScope || !input || input.story_id !== storyId || input.action !== 'implement_slice') return invalidResult('MAINTENANCE_INPUT_MISMATCH')
      // Partial Plan metadata is not a new Story action. The recovery kernel
      // validates the original Plan and exact journal-derived projection.
      return recoveryOperation === 'prepare-staged-recovery'
        ? prepareStagedRecovery(root, { ...input, operation: recoveryOperation })
        : applyStagedRecovery(root, { ...input, operation: recoveryOperation })
    }
    const planPath = planRelative(storyId)
    const plan = frontmatter(readFileSync(path.join(root, planPath), 'utf8'))
    const planCheck = validateStoryPlan(root, storyId)
    const completionApprovalBlock = plan.next_action?.kind === 'complete_story' &&
      planCheck.reasons.length > 0 && planCheck.reasons.every(reason => reason === 'DISCLOSURES_NOT_ACKNOWLEDGED')
    if (!planCheck.valid && !completionApprovalBlock) {
      return {
        status: planCheck.status,
        authorized: false,
        reasons: planCheck.reasons
      }
    }
    const approvalInput = options.approval ?? (options.approveExactScope
      ? { action: 'approve_exact_scope', disclosures_acknowledged: true }
      : null)
    if (approvalInput) {
      return recordHumanApproval(root, storyId, expectedHead, approvalInput)
    }
    if (plan.lifecycle_snapshot === 'done') {
      return inspectCompletion(root, storyId, expectedHead)
    }
    const explicitKernelOperation = options.operation ?? options.kernel?.operation
    if (explicitKernelOperation !== undefined) {
      const input = options.input ?? options.kernel?.input
      if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidResult('KERNEL_INPUT_REQUIRED')
      if (explicitKernelOperation === 'prepare-rework' || explicitKernelOperation === 'apply-rework') {
        if (input.action !== 'rework_slice' || input.story_id !== storyId || input.slice_id !== plan.current_slice ||
            input.expected_head !== expectedHead || input.maintenance_authorization !== 'V4_LITE_REWORK') {
          return invalidResult('MAINTENANCE_INPUT_MISMATCH')
        }
        if (explicitKernelOperation === 'prepare-rework') return prepareRework(root, { ...input, operation: 'prepare-rework' })
        return runRunnerAction(root, storyId, 'rework_slice', expectedHead, options,
          () => applyRework(root, { ...input, operation: 'apply-rework' }))
      }
      if (plan.next_action?.kind === 'implement_slice') {
        if (input.story_id !== storyId || input.action !== 'implement_slice' || input.slice_id !== plan.next_action.target) {
          return invalidResult('KERNEL_INPUT_PLAN_MISMATCH')
        }
        if (explicitKernelOperation === 'prepare') return prepareAction(root, { ...input, operation: 'prepare' })
        if (explicitKernelOperation === 'checkpoint') return checkpointImplementation(root, { ...input, operation: 'checkpoint' })
        return invalidResult('KERNEL_OPERATION_UNSUPPORTED')
      }
      if (plan.next_action?.kind === 'verify_slice') {
        if (input.story_id !== storyId || input.action !== 'verify_slice' || input.slice_id !== plan.next_action.target) {
          return invalidResult('KERNEL_INPUT_PLAN_MISMATCH')
        }
        if (explicitKernelOperation === 'prepare-recovery-abort') return prepareMetadataAbort(root, input)
        if (explicitKernelOperation === 'abort-unwritten-metadata') return applyMetadataAbort(root, input)
        if (explicitKernelOperation === 'prepare') return prepareAction(root, { ...input, operation: 'prepare' })
        if (explicitKernelOperation === 'verify') return verifySlice(root, { ...input, operation: 'verify' })
        if (explicitKernelOperation === 'record-review' || explicitKernelOperation === 'record_review') return recordSliceReview(root, { ...input, operation: 'record-review' })
        return invalidResult('KERNEL_OPERATION_UNSUPPORTED')
      }
      return { status: 'UNAUTHORIZED_ACTION', authorized: false, reasons: ['KERNEL_ACTION_NOT_CURRENT'] }
    }
    const decisionInput = {
      nextAction: plan.next_action,
      lifecycle: plan.lifecycle_snapshot,
      executionStatus: plan.execution_status,
      humanApprovalPresent: plan.human_approval !== undefined && plan.human_approval !== null
    }
    if (plan.next_action?.kind === 'start_story') {
      if (!options.expectedHead) return { status: 'BLOCKED', authorized: false, reasons: ['EXPLICIT_EXPECTED_HEAD_REQUIRED'] }
      const startOptions = { excludeUnrelated: options.excludeUnrelated ?? [] }
      const helper = inspectStart(root, storyId, expectedHead, startOptions)
      const route = routeAction({ ...decisionInput, helperStatus: helper.status })
      if (!route.authorized) return { ...route, helper }
      if (!options.startFingerprint) return { status: 'BLOCKED', authorized: false, reasons: ['START_PREVIEW_FINGERPRINT_REQUIRED'], helper }
      return runRunnerAction(root, storyId, 'start_story', expectedHead, options,
        () => applyStart(root, storyId, expectedHead, options.startFingerprint, startOptions))
    }
    if (plan.next_action?.kind === 'complete_story') {
      const helper = inspectCompletion(root, storyId, expectedHead)
      const route = routeAction({
        ...decisionInput,
        humanApprovalFresh: helper.approval_fresh,
        completionStatus: helper.status
      })
      if (!route.authorized) return { ...route, helper, snapshot: helper.preview }
      return runRunnerAction(root, storyId, 'complete_story', expectedHead, options,
        () => applyCompletion(root, storyId, expectedHead),
        result => {
          if (result.status === 'DONE') recordStoryCompleted(root, {
            story_id: storyId,
            action: 'complete_story',
            invocation_id: options.invocationId ?? null,
            session_id: options.sessionId ?? null,
            attempt_id: options.attemptId ?? expectedHead,
            approval_present: decisionInput.humanApprovalPresent === true,
            approval_fresh: helper.approval_fresh === true,
            payload: { result_status: result.status, expected_head: expectedHead },
            provenance: { kind: 'completion_transaction', source: 'v4-story-runner' },
          })
        })
    }
    if (plan.next_action?.kind === 'finalize_story') {
      const helper = inspectFinalization(root, storyId, expectedHead)
      const route = routeAction({
        ...decisionInput,
        helperStatus: helper.status,
        doneGateDisposition: helper.done_gate_disposition
      })
      if (!route.authorized) return { ...route, helper }
      return runRunnerAction(root, storyId, 'finalize_story', expectedHead, options,
        () => applyFinalization(root, storyId, expectedHead),
        result => {
          if (result.status === 'HUMAN_GATE_REQUIRED') recordStoryReviewSnapshot(root, {
            story_id: storyId,
            action: 'finalize_story',
            invocation_id: options.invocationId ?? null,
            session_id: options.sessionId ?? null,
            attempt_id: options.attemptId ?? expectedHead,
            finalization_status: result.status,
            payload: { result_status: result.status, expected_head: expectedHead, review_head: result.review_head ?? expectedHead },
            provenance: { kind: 'finalization_transaction', source: 'v4-story-runner' },
          })
        })
    }
    return routeAction(decisionInput)
  } catch (error) {
    return { status: 'ERROR', authorized: false, reasons: [error.message] }
  }
}

export function authorizeAction(root, storyId, action, expectedHead, options = {}) {
  try {
    if (!existsSync(path.join(root, planRelative(storyId)))) return invalidResult('PLAN_MISSING')
    if (!pointerIdle(root)) return { status: 'BLOCKED', authorized: false, reasons: ['V3_POINTER_NOT_IDLE'] }
    const wrongCheckout = checkoutBlock(root, storyId)
    if (wrongCheckout) return wrongCheckout
    const planPath = planRelative(storyId)
    const plan = frontmatter(readFileSync(path.join(root, planPath), 'utf8'))
    if (plan.next_action?.kind !== action) {
      return { status: 'BLOCKED', authorized: false, reasons: ['NEXT_ACTION_MISMATCH'] }
    }
    const input = {
      nextAction: plan.next_action,
      lifecycle: plan.lifecycle_snapshot,
      executionStatus: plan.execution_status,
      humanApprovalPresent: plan.human_approval !== undefined && plan.human_approval !== null
    }
    if (action === 'start_story') {
      const helper = inspectStart(root, storyId, expectedHead, options)
      return { ...routeAction({ ...input, helperStatus: helper.status }), helper }
    }
    if (action === 'finalize_story') {
      const helper = inspectFinalization(root, storyId, expectedHead)
      return { ...routeAction({
        ...input,
        helperStatus: helper.status,
        doneGateDisposition: helper.done_gate_disposition
      }), helper }
    }
    if (action === 'complete_story') {
      const helper = inspectCompletion(root, storyId, expectedHead)
      return {
        ...routeAction({
          ...input,
          humanApprovalFresh: helper.approval_fresh,
          completionStatus: helper.status
        }),
        helper,
        snapshot: helper.preview
      }
    }
    return routeAction(input)
  } catch (error) {
    return { status: 'ERROR', authorized: false, reasons: [error.message] }
  }
}

export function runAction(root, storyId, expectedHead, options = {}) {
  return runV4Story(root, storyId, { expectedHead, ...options })
}

function parseArguments(argv) {
  const [verb, storyId, ...tail] = argv
  if (!['run', 'execute'].includes(verb) || !/^\d+\.\d+$/.test(storyId ?? '')) return { error: CLI_USAGE }
  let expectedHead
  let startFingerprint
  let operation
  let inputFile
  const excludeUnrelated = []
  let approveExactScope = false
  for (let index = 0; index < tail.length; index += 1) {
    if (tail[index] === '--approve-exact-scope') approveExactScope = true
    else if (tail[index] === '--expected-head' && SHA.test(tail[index + 1] ?? '')) { expectedHead = tail[++index] }
    else if (tail[index] === '--start-fingerprint' && /^sha256:[0-9a-f]{64}$/.test(tail[index + 1] ?? '') && !startFingerprint) { startFingerprint = tail[++index] }
    else if (tail[index] === '--exclude-unrelated' && tail[index + 1]) { excludeUnrelated.push(tail[++index]) }
    else if (tail[index] === '--operation' && CLI_OPERATIONS.has(tail[index + 1] ?? '') && !operation) { operation = tail[++index] }
    else if (tail[index] === '--input' && tail[index + 1] && !inputFile) { inputFile = tail[++index] }
    else return { error: CLI_USAGE }
  }
  if ((operation && !inputFile) || (!operation && inputFile)) return { error: CLI_USAGE }
  return { storyId, expectedHead, operation, inputFile, approveExactScope, startFingerprint, excludeUnrelated }
}

function readCliInput(root, inputFile) {
  const file = path.resolve(root, inputFile)
  if (!existsSync(file)) return { error: 'INPUT_MISSING' }
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'INPUT_OBJECT_REQUIRED' }
    return { value }
  } catch {
    return { error: 'INPUT_JSON_INVALID' }
  }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return invalidResult(parsed.error)
  const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  if (!existsSync(path.join(root, planRelative(parsed.storyId)))) return invalidResult('PLAN_MISSING')
  const loaded = parsed.inputFile ? readCliInput(root, parsed.inputFile) : { value: undefined }
  if (loaded.error) return invalidResult(loaded.error)
  return runV4Story(root, parsed.storyId, {
    expectedHead: parsed.expectedHead,
    operation: parsed.operation,
    input: loaded.value,
    approveExactScope: parsed.approveExactScope,
    startFingerprint: parsed.startFingerprint,
    excludeUnrelated: parsed.excludeUnrelated
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = exitCodeForStatus(result.status)
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'ERROR', authorized: false, reasons: [error.message] }) + '\n')
    process.exitCode = CODES.ERROR
  }
}
