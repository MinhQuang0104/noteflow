import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { inspectStory, receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'
import { applyFinalization } from './finalize-story.mjs'
import { validateFinalizationReceipt } from './finalization-contract.mjs'

export const V4_AUTHORIZED_ACTIONS = new Set([
  'reconcile_lifecycle',
  'implement_slice',
  'verify_slice',
  'finalize_story'
])

const STORY_ACTIONS = new Set([
  'reconcile_lifecycle',
  'request_gate',
  'finalize_story',
  'complete_story'
])
const SHA = /^[0-9a-f]{40,64}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const CODES = {
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

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') ||
      relative.includes('\\') || path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  return absolute.startsWith(root + path.sep) ? absolute : null
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
    const pointer = JSON.parse(readFileSync(path.join(root, '.agent-state/active-run.json'), 'utf8'))
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.decision !== 'APPROVE') return false
  if (typeof value.intent !== 'string' ||
      !/^approve\s+(?:the\s+)?exact\s+scope\b/i.test(value.intent.trim())) return false
  return DIGEST.test(value.story_normative_digest ?? '') &&
    DIGEST.test(value.finalization_receipt_digest ?? '') &&
    DIGEST.test(value.scope_paths_digest ?? '') &&
    DIGEST.test(value.implementation_commit_set_digest ?? '') &&
    DIGEST.test(value.final_scoped_tree_digest ?? '') &&
    SHA.test(value.approved_head ?? '') &&
    /^\d+\.\d+$/.test(value.story_id ?? '')
}

export function routeAction(input = {}) {
  const action = input.nextAction?.kind
  const target = input.nextAction?.target
  if (typeof action !== 'string') return invalidResult('NEXT_ACTION_MISSING')
  if ((STORY_ACTIONS.has(action) && target !== 'story') ||
      (!STORY_ACTIONS.has(action) && typeof target !== 'string')) {
    return { status: 'INVALID', authorized: false, reasons: ['INVALID_ACTION_TARGET'] }
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
    return {
      status: 'HUMAN_GATE_REQUIRED',
      authorized: false,
      action,
      reason: 'COMPLETE_STORY_EXECUTION_DISABLED',
      instruction: 'Human must approve the exact displayed scope; generic continuation is insufficient.'
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

function reviewSnapshot(root, storyId, plan) {
  const receiptPath = plan.finalization?.receipt_ref
  const receiptFile = safePath(root, receiptPath)
  const storyFile = safePath(root, plan.story?.path)
  if (!receiptFile || !storyFile || !existsSync(receiptFile) || !existsSync(storyFile)) {
    return { status: 'HUMAN_GATE_REQUIRED', reasons: ['FINALIZATION_RECEIPT_MISSING'] }
  }
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
  const checked = validateFinalizationReceipt(root, plan, receiptPath, receipt)
  const story = inspectStory(readFileSync(storyFile, 'utf8'))
  if (checked.errors.length) return { status: 'INVALID', reasons: checked.errors }
  return {
    status: 'HUMAN_GATE_REQUIRED',
    authorized: false,
    snapshot: {
      story_id: storyId,
      story_title: story.title,
      story_normative_digest: receipt.story_normative_digest,
      finalization_receipt_digest: receiptDigest(receipt),
      final_scope_path_count: receipt.scope_path_count,
      scope_paths_digest: receipt.scope_paths_digest,
      implementation_commit_set_digest: receipt.implementation_commit_set_digest,
      final_scoped_tree_digest: receipt.final_scoped_tree_digest,
      ac_coverage_digest: receipt.ac_coverage_digest,
      canonical_disclosures_digest: receipt.canonical_disclosures_digest,
      lifecycle: 'review',
      requested_next_action: { kind: 'complete_story', target: 'story' }
    },
    instruction: 'Approve the exact displayed scope to authorize the future complete_story phase.'
  }
}

export function runV4Story(root, storyId, options = {}) {
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '')) return invalidResult('INVALID_STORY_ID')
    if (!pointerIdle(root)) return { status: 'BLOCKED', authorized: false, reasons: ['V3_POINTER_NOT_IDLE'] }
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    const expectedHead = options.expectedHead ?? head
    if (!SHA.test(expectedHead)) return invalidResult('INVALID_EXPECTED_HEAD')
    if (head !== expectedHead) return { status: 'STALE', authorized: false, reasons: ['EXPECTED_HEAD_MISMATCH'] }
    const planCheck = validateStoryPlan(root, storyId)
    if (!planCheck.valid) {
      return {
        status: planCheck.status,
        authorized: false,
        reasons: planCheck.reasons
      }
    }
    const planPath = planRelative(storyId)
    const plan = frontmatter(readFileSync(path.join(root, planPath), 'utf8'))
    const decisionInput = {
      nextAction: plan.next_action,
      lifecycle: plan.lifecycle_snapshot,
      executionStatus: plan.execution_status,
      humanApprovalPresent: plan.human_approval !== undefined && plan.human_approval !== null
    }
    if (plan.next_action?.kind === 'complete_story') return reviewSnapshot(root, storyId, plan)
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

export function authorizeAction(root, storyId, action, expectedHead) {
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
    if (action === 'finalize_story') {
      const helper = inspectFinalization(root, storyId, expectedHead)
      return { ...routeAction({
        ...input,
        helperStatus: helper.status,
        doneGateDisposition: helper.done_gate_disposition
      }), helper }
    }
    return routeAction(input)
  } catch (error) {
    return { status: 'ERROR', authorized: false, reasons: [error.message] }
  }
}

export function runAction(root, storyId, expectedHead) {
  return runV4Story(root, storyId, { expectedHead })
}

function parseArguments(argv) {
  const [verb, storyId, flag, expectedHead, ...rest] = argv
  if (!['run', 'execute'].includes(verb) || !/^\d+\.\d+$/.test(storyId ?? '') ||
      rest.length || (flag !== undefined && flag !== '--expected-head') ||
      (flag === '--expected-head' && !SHA.test(expectedHead ?? ''))) {
    return { error: 'USAGE: run <epic.story> [--expected-head <sha>]' }
  }
  return { storyId, expectedHead: flag === '--expected-head' ? expectedHead : undefined }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return invalidResult(parsed.error)
  const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  return runV4Story(root, parsed.storyId, { expectedHead: parsed.expectedHead })
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
