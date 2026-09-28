import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import {
  approvalRecordForSnapshot,
  explicitApprovalInput,
  inspectCompletion
} from './check-story-completion.mjs'

const SHA = /^[0-9a-f]{40,64}$/
const NOISE = new Set(['_bmad/scripts/tests/__pycache__/test_agent_architecture.cpython-314.pyc'])
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'

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

function planRelative(storyId) {
  return `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
}

function storyPathFromPlan(root, plan) {
  if (typeof plan.story?.path !== 'string' || plan.story.path.includes('\\') || path.isAbsolute(plan.story.path) || plan.story.path.split('/').includes('..')) {
    throw new Error('INVALID_STORY_PATH')
  }
  const file = path.resolve(root, plan.story.path)
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_STORY_PATH')
  return plan.story.path
}

function readText(root, relative) {
  return readFileSync(path.join(root, relative), 'utf8')
}

function replaceOne(text, pattern, replacement, error) {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
  const matches = text.match(new RegExp(pattern.source, flags))
  if (!matches || matches.length !== 1) throw new Error(error)
  return text.replace(pattern, replacement)
}

function approvalBlock(record) {
  const scalar = value => typeof value === 'string' ? JSON.stringify(value) : String(value)
  return [
    'human_approval:',
    '  schema_version: ' + scalar(record.schema_version),
    '  story_id: ' + scalar(record.story_id),
    '  approver_type: ' + scalar(record.approver_type),
    '  decision: ' + scalar(record.decision),
    '  approved_at: ' + scalar(record.approved_at),
    '  story_normative_digest: ' + scalar(record.story_normative_digest),
    '  finalization_receipt_digest: ' + scalar(record.finalization_receipt_digest),
    '  done_gate_summary_digest: ' + scalar(record.done_gate_summary_digest),
    '  scope_paths_digest: ' + scalar(record.scope_paths_digest),
    '  implementation_commit_set_digest: ' + scalar(record.implementation_commit_set_digest),
    '  final_scope_digest: ' + scalar(record.final_scope_digest),
    '  final_scoped_tree_digest: ' + scalar(record.final_scoped_tree_digest),
    '  approved_review_head: ' + scalar(record.approved_review_head),
    '  approved_commit: ' + scalar(record.approved_commit),
    '  approved_action: ' + scalar(record.approved_action),
    '  disclosures_acknowledged: ' + scalar(record.disclosures_acknowledged)
  ].join('\n') + '\n'
}

function replaceHumanApproval(planText, record) {
  const block = approvalBlock(record)
  const existing = /^human_approval:(?:\s+[^\r\n]*)?(?:\r?\n(?:  [^\r\n]*\r?\n)*)?/m
  if (existing.test(planText)) return planText.replace(existing, block)
  return replaceOne(planText, /^next_action:/m, block + 'next_action:', 'NEXT_ACTION_MISSING')
}

function replaceLifecycle(text, from, to) {
  return replaceOne(text, new RegExp(`^(lifecycle_snapshot:\\s+)(?:"${from}"|${from})$`, 'm'), `$1${to}`, 'LIFECYCLE_SNAPSHOT_REPLACE_FAILED')
}

function replaceNextActionWithNull(text) {
  return replaceOne(text, /^next_action:\r?\n(?:  [^\r\n]*\r?\n)*/m, 'next_action: null\n', 'NEXT_ACTION_REPLACE_FAILED')
}

function replaceStoryStatus(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!front) throw new Error('INVALID_STORY_FRONTMATTER')
  const frontStatus = /^status: review$/m
  if (!frontStatus.test(front[1])) throw new Error('STORY_NOT_IN_REVIEW')
  return text.replace(/^status: review(?=\r?\n)/m, 'status: done')
}

function appendCompletionNote(text) {
  const marker = '<!-- v4:completion:end -->'
  if (!text.includes(marker)) throw new Error('COMPLETION_BLOCK_MISSING')
  const note = '- Human approval recorded for the exact review scope: review -> done; next action terminal.\n'
  if (text.includes(note.trim())) return text
  return text.replace(marker, note + marker)
}

function replaceSprintLifecycle(text, key) {
  return replaceOne(text, new RegExp(`^(  ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s+)(?:"review"|review)$`, 'm'), '$1done', 'SPRINT_LIFECYCLE_REPLACE_FAILED')
}

function dirtyPaths(root) {
  return [...new Set([
    ...gitPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_STAGED_PATHS_FAILED'),
    ...gitPaths(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_UNSTAGED_PATHS_FAILED'),
    ...gitPaths(root, ['ls-files', '--others', '--exclude-standard', '--'], 'GIT_UNTRACKED_PATHS_FAILED')
  ])].filter(item => !NOISE.has(item) && !item.startsWith('.agent-state/v4-observations/')).sort()
}

function writeTempThenRename(root, relative, bytes) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, bytes, { flag: 'wx' })
    renameSync(temp, file)
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
}

function exactStagedPaths(root, expected) {
  const actual = gitPaths(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'], 'GIT_STAGED_PATHS_FAILED')
  return JSON.stringify(actual) === JSON.stringify([...expected].sort())
}

function fingerprint(root, storyPath, planPath, expectedHead, preview) {
  const hash = relative => gitOutput(root, ['hash-object', path.join(root, relative)], 'HASH_OBJECT_FAILED')
  return JSON.stringify({
    expectedHead,
    story: hash(storyPath),
    plan: hash(planPath),
    sprint: hash(SPRINT),
    preview: {
      story_normative_digest: preview.story_normative_digest,
      finalization_receipt_digest: preview.finalization_receipt_digest,
      done_gate_summary_digest: preview.done_gate_summary_digest,
      scope_paths_digest: preview.scope_paths_digest,
      implementation_commit_set_digest: preview.implementation_commit_set_digest,
      final_scoped_tree_digest: preview.final_scoped_tree_digest
    }
  })
}

function failure(status, reasons, extra = {}) {
  return { status, ready: status === 'READY', valid: !['INVALID', 'ERROR'].includes(status), reasons: [...new Set(reasons)], ...extra }
}

export function prepareCompletion(root, storyId, expectedHead) {
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '') || !SHA.test(expectedHead ?? '')) return failure('INVALID', ['INVALID_INPUT'])
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (head !== expectedHead) return failure('STALE', ['EXPECTED_HEAD_MISMATCH'], { head })
    const gate = inspectCompletion(root, storyId, expectedHead)
    if (gate.terminal && gate.status === 'READY') {
      return { status: 'TERMINAL', ready: false, valid: true, reasons: [], gate, snapshot: gate.preview }
    }
    if (gate.status !== 'READY' || gate.recovery_classification !== 'APPROVAL_DURABLE_PENDING_COMPLETION') {
      return failure(gate.status === 'READY' ? 'BLOCKED' : gate.status, gate.reasons, { gate })
    }
    const planPath = planRelative(storyId)
    const plan = frontmatter(readText(root, planPath))
    const storyPath = storyPathFromPlan(root, plan)
    const dirty = dirtyPaths(root)
    if (dirty.length) return failure('BLOCKED', ['DIRTY_WORKTREE'], { gate, dirty })
    const nextStoryBytes = appendCompletionNote(replaceStoryStatus(readText(root, storyPath)))
    let nextPlanBytes = replaceLifecycle(readText(root, planPath), 'review', 'done')
    nextPlanBytes = replaceNextActionWithNull(nextPlanBytes)
    const nextSprintBytes = replaceSprintLifecycle(readText(root, SPRINT), plan.sprint_key)
    return {
      status: 'READY',
      ready: true,
      valid: true,
      reasons: [],
      gate,
      plan,
      storyPath,
      planPath,
      sprintPath: SPRINT,
      nextStoryBytes,
      nextPlanBytes,
      nextSprintBytes,
      fingerprint: fingerprint(root, storyPath, planPath, expectedHead, gate.preview)
    }
  } catch (error) {
    return failure('ERROR', [error.message])
  }
}

export function recordHumanApproval(root, storyId, expectedHead, approvalInput) {
  try {
    if (!explicitApprovalInput(approvalInput)) return failure('BLOCKED', ['HUMAN_APPROVAL_REQUIRED'])
    if (!/^\d+\.\d+$/.test(storyId ?? '') || !SHA.test(expectedHead ?? '')) return failure('INVALID', ['INVALID_INPUT'])
    const head = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (head !== expectedHead) return failure('STALE', ['EXPECTED_HEAD_MISMATCH'], { head })
    const gate = inspectCompletion(root, storyId, expectedHead, { allowApproval: true })
    if (!gate.preview || gate.lifecycle !== 'review' || gate.execution_status !== 'complete' || gate.next_action?.kind !== 'complete_story') {
      return failure(gate.status === 'READY' ? 'BLOCKED' : gate.status, gate.reasons, { gate })
    }
    if (gate.approval_fresh) return failure('STALE', ['HUMAN_APPROVAL_ALREADY_DURABLE'], { gate })
    const planPath = planRelative(storyId)
    const plan = frontmatter(readText(root, planPath))
    if (plan.human_approval !== undefined && plan.human_approval !== null) return failure('STALE', ['HUMAN_APPROVAL_ALREADY_PRESENT'], { gate })
    const dirty = dirtyPaths(root)
    if (dirty.length) return failure('BLOCKED', ['DIRTY_WORKTREE'], { gate, dirty })
    const approval = approvalRecordForSnapshot(gate.preview, expectedHead, approvalInput.approved_at ?? new Date().toISOString())
    const nextPlanBytes = replaceHumanApproval(readText(root, planPath), approval)
    writeTempThenRename(root, planPath, nextPlanBytes)
    const checked = validateStoryPlan(root, storyId)
    if (!checked.valid || checked.status !== 'READY') throw new Error('POST_APPROVAL_VALIDATION_FAILED:' + checked.reasons.join(','))
    const add = git(root, ['add', '--', planPath])
    if (add.status !== 0 || !exactStagedPaths(root, [planPath])) throw new Error('STAGED_APPROVAL_SCOPE_MISMATCH')
    const commit = git(root, ['commit', '-m', `chore(story-${storyId}): record Human approval for completion`, '--only', '--', planPath])
    if (commit.status !== 0) throw new Error('COMMIT_FAILED')
    const approvalCommit = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    const after = inspectCompletion(root, storyId, approvalCommit)
    return {
      status: 'APPROVAL_DURABLE_PENDING_COMPLETION',
      ready: false,
      valid: true,
      approval,
      snapshot: after.preview ?? gate.preview,
      commit: approvalCommit,
      gate: after
    }
  } catch (error) {
    return failure(error.message === 'COMMIT_FAILED' ? 'ERROR' : 'ERROR', [error.message])
  }
}

export function applyCompletion(root, storyId, expectedHead) {
  const prepared = prepareCompletion(root, storyId, expectedHead)
  if (prepared.status === 'TERMINAL') return prepared
  if (prepared.status !== 'READY') return prepared
  const fresh = prepareCompletion(root, storyId, expectedHead)
  if (fresh.status !== 'READY' || fresh.fingerprint !== prepared.fingerprint) {
    return failure('STALE', ['COMPLETION_GUARD_CHANGED'], { prepared: prepared.fingerprint, fresh: fresh.fingerprint ?? null })
  }
  const paths = [fresh.storyPath, fresh.planPath, fresh.sprintPath]
  try {
    writeTempThenRename(root, fresh.storyPath, fresh.nextStoryBytes)
    writeTempThenRename(root, fresh.planPath, fresh.nextPlanBytes)
    writeTempThenRename(root, fresh.sprintPath, fresh.nextSprintBytes)
    const checked = validateStoryPlan(root, storyId)
    if (!checked.valid || checked.status !== 'READY') throw new Error('POST_COMPLETION_VALIDATION_FAILED:' + checked.reasons.join(','))
    const add = git(root, ['add', '--', ...paths])
    if (add.status !== 0 || !exactStagedPaths(root, paths)) throw new Error('STAGED_COMPLETION_SCOPE_MISMATCH')
    const commit = git(root, ['commit', '-m', `docs(story-${storyId}): complete with Human approval`, '--only', '--', ...paths])
    if (commit.status !== 0) throw new Error('COMMIT_FAILED')
    const commitSha = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    return {
      status: 'DONE',
      ready: false,
      valid: true,
      lifecycle: 'done',
      execution_status: 'complete',
      next_action: null,
      snapshot: fresh.gate.preview,
      commit: commitSha,
      paths
    }
  } catch (error) {
    return failure(error.message === 'COMMIT_FAILED' ? 'UNCOMMITTED_COMPLETION' : 'ERROR', [error.message], {
      recovery: inspectCompletion(root, storyId, expectedHead)
    })
  }
}

function parseArguments(argv) {
  const [verb, storyId, flag, expectedHead, ...rest] = argv
  if (!['complete', 'approve'].includes(verb) || !/^\d+\.\d+$/.test(storyId ?? '') || flag !== '--expected-head' || !SHA.test(expectedHead ?? '')) {
    return { error: 'USAGE: approve|complete <epic.story> --expected-head <sha>' }
  }
  return { verb, storyId, expectedHead, rest }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return failure('INVALID', [parsed.error])
  const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  if (parsed.verb === 'approve') return recordHumanApproval(root, parsed.storyId, parsed.expectedHead, { action: 'approve_exact_scope', disclosures_acknowledged: true })
  return applyCompletion(root, parsed.storyId, parsed.expectedHead)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = result.status === 'DONE' || result.status === 'APPROVAL_DURABLE_PENDING_COMPLETION' ? 0 : 1
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'ERROR', valid: false, reasons: [error.message] }) + '\n')
    process.exitCode = 1
  }
}
