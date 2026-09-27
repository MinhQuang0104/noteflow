import { readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'
import { applyFinalization } from './finalize-story.mjs'
import { explicitApprovalInput, inspectCompletion } from './check-story-completion.mjs'
import { applyCompletion, recordHumanApproval } from './complete-story.mjs'
import { inspectStart, applyStart } from './start-story.mjs'

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
const CODES = {
  STARTED: 0,
  RECOVERY_REQUIRED: 6,
  HUMAN_GATE_REQUIRED: 0,
  AUTHORIZED: 0,
  READY: 0,
  STALE: 2,
  BLOCKED: 3,
  INVALID: 4,
  ERROR: 5
}

function planRelative(storyId) {
  return '_bmad-output/implementation-artifacts/story-' + storyId.replace('.', '-') + '-plan.md'
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

function pointerIdle(root) {
  try {
    const canonical = /^worktree (.+)$/m.exec(gitOutput(root, ['worktree', 'list', '--porcelain'], 'CANONICAL_WORKTREE_UNAVAILABLE'))?.[1]?.trim()
    if (!canonical) return false
    const pointer = JSON.parse(readFileSync(path.join(canonical, '.agent-state/active-run.json'), 'utf8'))
    return pointer.schemaVersion === 1 &&
      pointer.status === 'IDLE' &&
      pointer.activeRunId === null &&
      pointer.storyId === null
  } catch {
    return false
  }
}

function invalidResult(reason) {
  return { status: 'INVALID', authorized: false, valid: false, reasons: [reason] }
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
    if (!pointerIdle(root)) return { status: 'BLOCKED', authorized: false, reasons: ['V3_POINTER_NOT_IDLE'] }
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    const expectedHead = options.expectedHead ?? head
    if (!SHA.test(expectedHead)) return invalidResult('INVALID_EXPECTED_HEAD')
    if (head !== expectedHead) return { status: 'STALE', authorized: false, reasons: ['EXPECTED_HEAD_MISMATCH'] }
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
      return applyStart(root, storyId, expectedHead, options.startFingerprint, startOptions)
    }
    if (plan.next_action?.kind === 'complete_story') {
      const helper = inspectCompletion(root, storyId, expectedHead)
      const route = routeAction({
        ...decisionInput,
        humanApprovalFresh: helper.approval_fresh,
        completionStatus: helper.status
      })
      if (!route.authorized) return { ...route, helper, snapshot: helper.preview }
      return applyCompletion(root, storyId, expectedHead)
    }
    if (plan.next_action?.kind === 'finalize_story') {
      const helper = inspectFinalization(root, storyId, expectedHead)
      const route = routeAction({
        ...decisionInput,
        helperStatus: helper.status,
        doneGateDisposition: helper.done_gate_disposition
      })
      if (!route.authorized) return { ...route, helper }
      return applyFinalization(root, storyId, expectedHead)
    }
    return routeAction(decisionInput)
  } catch (error) {
    return { status: 'ERROR', authorized: false, reasons: [error.message] }
  }
}

export function authorizeAction(root, storyId, action, expectedHead, options = {}) {
  try {
    if (!pointerIdle(root)) return { status: 'BLOCKED', authorized: false, reasons: ['V3_POINTER_NOT_IDLE'] }
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
  if (!['run', 'execute'].includes(verb) || !/^\d+\.\d+$/.test(storyId ?? '')) return { error: 'USAGE: run <epic.story> [--expected-head <sha>] [--approve-exact-scope]' }
  let expectedHead
  let startFingerprint
  const excludeUnrelated = []
  let approveExactScope = false
  for (let index = 0; index < tail.length; index += 1) {
    if (tail[index] === '--approve-exact-scope') approveExactScope = true
    else if (tail[index] === '--expected-head' && SHA.test(tail[index + 1] ?? '')) { expectedHead = tail[++index] }
    else if (tail[index] === '--start-fingerprint' && /^sha256:[0-9a-f]{64}$/.test(tail[index + 1] ?? '') && !startFingerprint) { startFingerprint = tail[++index] }
    else if (tail[index] === '--exclude-unrelated' && tail[index + 1]) { excludeUnrelated.push(tail[++index]) }
    else return { error: 'USAGE: run <epic.story> [--expected-head <sha>] [--approve-exact-scope]' }
  }
  return { storyId, expectedHead, approveExactScope, startFingerprint, excludeUnrelated }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return invalidResult(parsed.error)
  const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  return runV4Story(root, parsed.storyId, { expectedHead: parsed.expectedHead, approveExactScope: parsed.approveExactScope, startFingerprint: parsed.startFingerprint, excludeUnrelated: parsed.excludeUnrelated })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = CODES[result.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'ERROR', authorized: false, reasons: [error.message] }) + '\n')
    process.exitCode = CODES.ERROR
  }
}
