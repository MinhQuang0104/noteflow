import { randomUUID, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  inspectStory,
  receiptDigest
} from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import {
  classifyFinalizationRecovery,
  inspectFinalization,
  stableDigest
} from './check-story-finalization.mjs'
import {
  finalizationDisposition,
  renderCompletionBlock,
  validateFinalizationReceipt
} from './finalization-contract.mjs'

const SHA = /^[0-9a-f]{40,64}$/
const CODES = {
  HUMAN_GATE_REQUIRED: 0,
  READY: 0,
  STALE: 2,
  BLOCKED: 3,
  INVALID: 4,
  UNCOMMITTED_FINALIZATION: 5,
  ERROR: 6
}
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'

function planRelative(storyId) {
  return '_bmad-output/implementation-artifacts/story-' + storyId.replace('.', '-') + '-plan.md'
}

function finalizationRelative(storyId) {
  return '_bmad-output/implementation-artifacts/receipts/story-' +
    storyId.replace('.', '-') + '/finalization.json'
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') ||
      relative.includes('\\') || path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  return absolute.startsWith(root + path.sep) ? absolute : null
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000
  })
  if (result.error || result.status === null) throw new Error('GIT_UNAVAILABLE')
  return result
}

function gitOutput(root, args, failure) {
  const result = git(root, args)
  if (result.status !== 0) throw new Error(failure)
  return result.stdout.trim()
}

function gitPaths(root, args, failure) {
  return gitOutput(root, args, failure).split(/\r?\n/).filter(Boolean).sort()
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readText(root, relative) {
  const file = safePath(root, relative)
  if (!file || !existsSync(file)) throw new Error('FILE_MISSING:' + relative)
  return readFileSync(file, 'utf8')
}

function replaceScalar(text, key, from, to) {
  const escaped = key.replace(/[.*+?^()|[\]\\$]/g, '\\$&')
  const pattern = new RegExp('^(' + escaped + ': )' + from + '(\\r?\\n|$)', 'gm')
  let count = 0
  const next = text.replace(pattern, (_, prefix, newline) => {
    count += 1
    return prefix + to + newline
  })
  if (count !== 1) throw new Error('PLAN_REPLACE_FAILED:' + key)
  return next
}

function replaceNextAction(text) {
  const pattern = /^next_action:\r?\n(?:  [^\r\n]*\r?\n)*/m
  if (!pattern.test(text)) throw new Error('NEXT_ACTION_REPLACE_FAILED')
  return text.replace(pattern, 'next_action:\n  kind: complete_story\n  target: story\n')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^()|[\]\\$]/g, '\\$&')
}

function replaceSprintLifecycle(text, key) {
  const pattern = new RegExp('^(  ' + escapeRegExp(key) + ': )in-progress(\\s*)$', 'gm')
  let count = 0
  const next = text.replace(pattern, (_, prefix, suffix) => {
    count += 1
    return prefix + 'review' + suffix
  })
  if (count !== 1) throw new Error('SPRINT_REPLACE_FAILED')
  return next
}

function upsertPlanBlock(text, name, block) {
  const pattern = new RegExp('^' + name + ':\\r?\\n(?:  [^\\r\\n]*\\r?\\n)*', 'm')
  if (pattern.test(text)) return text.replace(pattern, block)
  const anchor = /^next_action:\r?\n/m
  if (!anchor.test(text)) throw new Error('PLAN_INSERT_ANCHOR_MISSING:' + name)
  return text.replace(anchor, block + 'next_action:\n')
}

function updatePlanBytes(planText, receipt, receiptPath, expectedHead) {
  let next = replaceScalar(planText, 'lifecycle_snapshot', 'in-progress', 'review')
  next = replaceScalar(next, 'execution_status', 'in-progress', 'complete')
  const finalization = [
    'finalization:',
    '  receipt_ref: ' + receiptPath,
    '  receipt_digest: ' + receiptDigest(receipt),
    '  done_gate_disposition: ' + receipt.done_gate_disposition,
    '  scope_paths_digest: ' + receipt.scope_paths_digest,
    '  implementation_commit_set_digest: ' + receipt.implementation_commit_set_digest,
    '  final_scoped_tree_digest: ' + receipt.final_scoped_tree_digest,
    '  prepared_from_head: ' + expectedHead,
    ''
  ].join('\n')
  next = upsertPlanBlock(next, 'finalization', finalization)
  const approval = /^human_approval:\s*[^\r\n]*(?:\r?\n|$)/m
  next = approval.test(next)
    ? next.replace(approval, 'human_approval: null\n')
    : next.replace(/^next_action:\r?\n/m, 'human_approval: null\nnext_action:\n')
  return replaceNextAction(next)
}

function updateStoryStatus(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!front) throw new Error('INVALID_STORY_FRONTMATTER')
  const status = /^status:\s*[^\r\n]+$/m
  if (!status.test(front[1])) throw new Error('STORY_STATUS_MISSING')
  const nextFront = front[1].replace(status, 'status: review')
  return text.slice(0, front.index) +
    text.slice(front.index, front.index + front[0].length).replace(front[1], nextFront) +
    text.slice(front.index + front[0].length)
}

function completionBody(preview, story, storyText) {
  let body = renderCompletionBlock(preview, story)
  const marker = /## Dev Agent Record\r?\n[\s\S]*?<!-- v4:completion:start -->/
  if (marker.test(storyText)) body = body.replace(/^### Dev Agent Record\r?\n\r?\n/, '')
  return body
}

function updateStoryCompletion(text, body) {
  const start = '<!-- v4:completion:start -->'
  const end = '<!-- v4:completion:end -->'
  const starts = text.split(start).length - 1
  const ends = text.split(end).length - 1
  if (starts > 1 || ends > 1 || starts !== ends) throw new Error('INVALID_COMPLETION_SECTION')
  if (starts === 1) {
    const startIndex = text.indexOf(start) + start.length
    const endIndex = text.indexOf(end)
    return text.slice(0, startIndex) + '\n' + body + '\n' + text.slice(endIndex)
  }
  return text.trimEnd() + '\n\n## Dev Agent Record\n\n' + start + '\n' + body + '\n' + end + '\n'
}

function protectedPaths(storyId, storyPath, scopePaths) {
  return new Set([
    planRelative(storyId),
    storyPath,
    SPRINT,
    finalizationRelative(storyId),
    ...scopePaths
  ])
}

function preconditionDirtyPaths(root, protectedSet) {
  const staged = gitPaths(root,
    ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'],
    'GIT_STAGED_PATHS_FAILED')
  const unstaged = gitPaths(root,
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'],
    'GIT_UNSTAGED_PATHS_FAILED')
  const untracked = gitPaths(root,
    ['ls-files', '--others', '--exclude-standard', '--'],
    'GIT_UNTRACKED_PATHS_FAILED')
  return {
    staged,
    relevant: [...new Set([...unstaged, ...untracked].filter(item => protectedSet.has(item)))].sort()
  }
}

function receiptFor(helper, plan, expectedHead) {
  const disposition = finalizationDisposition(helper.done_gate_disposition)
  if (!disposition) throw new Error('DONE_GATE_DISPOSITION_NOT_FINALIZABLE')
  return {
    schema_version: 1,
    kind: 'story_finalization',
    story_id: plan.story_id,
    story_normative_digest: plan.story.normative_digest,
    upstream_epic_digest: plan.upstream_epic?.section_digest ?? null,
    prepared_from_head: expectedHead,
    slice_set_digest: helper.slice_set_digest,
    receipt_set_digest: helper.receipt_set_digest,
    ac_coverage_digest: stableDigest(helper.ac_coverage),
    canonical_disclosures_digest: stableDigest(helper.canonical_disclosures),
    scope_path_count: helper.scope.path_count,
    scope_paths_digest: helper.scope_paths_digest,
    implementation_commit_set_digest: helper.implementation_commit_set_digest,
    final_scoped_tree_digest: helper.final_scoped_tree_digest,
    paths_digest: helper.scope_paths_digest,
    commit_set_digest: helper.implementation_commit_set_digest,
    scoped_tree_digest: helper.final_scoped_tree_digest,
    done_gate_disposition: disposition,
    lifecycle_from: 'in-progress',
    lifecycle_target: 'review',
    slice_summaries: helper.slices
  }
}

export function buildFinalizationPreview(root, storyId, expectedHead) {
  const helper = inspectFinalization(root, storyId, expectedHead)
  if (helper.status !== 'READY') {
    const error = new Error('FINALIZATION_NOT_READY:' + helper.status)
    error.result = helper
    throw error
  }
  const planPath = planRelative(storyId)
  const receiptPath = finalizationRelative(storyId)
  const planText = readText(root, planPath)
  const plan = frontmatter(planText)
  const storyText = readText(root, plan.story.path)
  const story = inspectStory(storyText)
  const receipt = receiptFor(helper, plan, expectedHead)
  const completion = completionBody({
    helper,
    receipt,
    receiptDigest: receiptDigest(receipt),
    finalizationPath: receiptPath,
    scope: helper.scope
  }, story, storyText)
  const nextStoryBytes = updateStoryCompletion(updateStoryStatus(storyText), completion)
  const nextPlanBytes = updatePlanBytes(planText, receipt, receiptPath, expectedHead)
  const nextSprintBytes = replaceSprintLifecycle(readText(root, SPRINT), plan.sprint_key)
  const nextPlan = frontmatter(nextPlanBytes)
  const receiptValidation = validateFinalizationReceipt(root, nextPlan, receiptPath, receipt)
  if (receiptValidation.errors.length) throw new Error('FINALIZATION_RECEIPT_INVALID:' + receiptValidation.errors.join(','))
  return {
    helper,
    plan,
    story,
    receipt,
    receiptPath,
    storyPath: plan.story.path,
    planPath,
    sprintPath: SPRINT,
    completionBody: completion,
    nextStoryBytes,
    nextPlanBytes,
    nextSprintBytes,
    fingerprint: stableDigest({
      expectedHead,
      story: hashBytes(Buffer.from(storyText)),
      plan: hashBytes(Buffer.from(planText)),
      sprint: hashBytes(Buffer.from(readText(root, SPRINT))),
      helper: {
        story_normative_digest: helper.story_normative_digest,
        slice_set_digest: helper.slice_set_digest,
        receipt_set_digest: helper.receipt_set_digest,
        scope_paths_digest: helper.scope_paths_digest,
        implementation_commit_set_digest: helper.implementation_commit_set_digest,
        final_scoped_tree_digest: helper.final_scoped_tree_digest
      }
    })
  }
}

function prepareFailure(status, reasons, extra = {}) {
  return {
    status,
    ready: status === 'READY',
    valid: !['INVALID', 'ERROR'].includes(status),
    reasons: [...new Set(reasons)],
    ...extra
  }
}

export function prepareFinalization(root, storyId, expectedHead) {
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '') || !SHA.test(expectedHead ?? '')) {
      return prepareFailure('INVALID', ['INVALID_INPUT'])
    }
    const currentHead = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (currentHead !== expectedHead) return prepareFailure('STALE', ['EXPECTED_HEAD_MISMATCH'], { head: currentHead })
    const recovery = classifyFinalizationRecovery(root, storyId, expectedHead)
    if (recovery.classification !== 'CLEAN_BASE') {
      const status = recovery.classification === 'ORPHAN_FINALIZATION_RECEIPT' ? 'BLOCKED'
        : recovery.classification === 'STALE' ? 'STALE' : 'INVALID'
      return prepareFailure(status, [recovery.classification, ...recovery.reasons], { recovery })
    }
    const helper = inspectFinalization(root, storyId, expectedHead)
    if (helper.status !== 'READY') {
      return prepareFailure(helper.status, helper.reasons, { helper })
    }
    const plan = frontmatter(readText(root, planRelative(storyId)))
    const dirty = preconditionDirtyPaths(root, protectedPaths(
      storyId,
      plan.story.path,
      helper.scope?.paths?.map(item => item.path) ?? []
    ))
    if (dirty.staged.length) return prepareFailure('BLOCKED', ['DIRTY_INDEX'], { dirty })
    if (dirty.relevant.length) return prepareFailure('BLOCKED', ['RELEVANT_WORKTREE_DRIFT'], { dirty })
    const preview = buildFinalizationPreview(root, storyId, expectedHead)
    return {
      status: 'READY',
      ready: true,
      valid: true,
      reasons: [],
      head: currentHead,
      helper,
      preview,
      fingerprint: preview.fingerprint
    }
  } catch (error) {
    return prepareFailure('ERROR', [error.message])
  }
}

function writeTempThenRename(root, relative, bytes) {
  const file = safePath(root, relative)
  if (!file) throw new Error('INVALID_WRITE_PATH:' + relative)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temp, bytes, { flag: 'wx' })
    renameSync(temp, file)
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
}

function exactStagedPaths(root, expected) {
  return gitPaths(root,
    ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'],
    'GIT_STAGED_PATHS_FAILED').sort()
    .join('\n') === [...expected].sort().join('\n')
}

function humanGateSnapshot(preview, commit) {
  const helper = preview.helper
  return {
    story_id: preview.plan.story_id,
    story_title: preview.story.title,
    story_normative_digest: preview.receipt.story_normative_digest,
    finalization_receipt_digest: receiptDigest(preview.receipt),
    final_scope_path_count: helper.scope.path_count,
    scope_paths_digest: helper.scope_paths_digest,
    implementation_commit_set_digest: helper.implementation_commit_set_digest,
    final_scoped_tree_digest: helper.final_scoped_tree_digest,
    ac_coverage_summary: helper.ac_coverage_summary,
    canonical_verification_disclosures: helper.canonical_disclosures,
    lifecycle: 'review',
    requested_next_action: { kind: 'complete_story', target: 'story' },
    commit
  }
}

export function applyFinalization(root, storyId, expectedHead) {
  const prepared = prepareFinalization(root, storyId, expectedHead)
  if (prepared.status !== 'READY') return prepared
  const fresh = prepareFinalization(root, storyId, expectedHead)
  if (fresh.status !== 'READY' || fresh.fingerprint !== prepared.fingerprint) {
    return prepareFailure('STALE', ['FINALIZATION_GUARD_CHANGED'], {
      prepared: prepared.fingerprint,
      fresh: fresh.fingerprint ?? null
    })
  }
  const preview = fresh.preview
  const paths = [preview.storyPath, preview.receiptPath, preview.planPath, preview.sprintPath]
  try {
    const receiptValidation = validateFinalizationReceipt(
      root,
      frontmatter(preview.nextPlanBytes),
      preview.receiptPath,
      preview.receipt
    )
    if (receiptValidation.errors.length) throw new Error('FINALIZATION_RECEIPT_INVALID:' + receiptValidation.errors.join(','))
    writeTempThenRename(root, preview.storyPath, preview.nextStoryBytes)
    writeTempThenRename(root, preview.receiptPath, JSON.stringify(preview.receipt, null, 2) + '\n')
    writeTempThenRename(root, preview.planPath, preview.nextPlanBytes)
    writeTempThenRename(root, preview.sprintPath, preview.nextSprintBytes)
    const checkedPlan = validateStoryPlan(root, storyId)
    if (!checkedPlan.valid || checkedPlan.status !== 'READY') {
      throw new Error('POST_WRITE_VALIDATION_FAILED:' + checkedPlan.reasons.join(','))
    }
    const add = git(root, ['add', '--', ...paths])
    if (add.status !== 0 || !exactStagedPaths(root, paths)) throw new Error('STAGED_SCOPE_MISMATCH')
    const commitMessage = 'docs(story-' + storyId + '): finalize for Human Gate'
    const commit = git(root, ['commit', '-m', commitMessage, '--only', '--', ...paths])
    if (commit.status !== 0) throw new Error('COMMIT_FAILED')
    const commitSha = gitOutput(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    return {
      status: 'HUMAN_GATE_REQUIRED',
      ready: false,
      valid: true,
      lifecycle: 'review',
      execution_status: 'complete',
      next_action: { kind: 'complete_story', target: 'story' },
      snapshot: humanGateSnapshot(preview, commitSha),
      commit: commitSha,
      paths
    }
  } catch (error) {
    return {
      status: error.message === 'COMMIT_FAILED' ? 'UNCOMMITTED_FINALIZATION' : 'ERROR',
      ready: false,
      valid: false,
      reasons: [error.message],
      recovery: classifyFinalizationRecovery(root, storyId, expectedHead)
    }
  }
}

function parseArguments(argv) {
  const [verb, storyId, flag, expectedHead, ...rest] = argv
  if (verb !== 'finalize' || !/^\d+\.\d+$/.test(storyId ?? '') ||
      flag !== '--expected-head' || !SHA.test(expectedHead ?? '') || rest.length) {
    return { error: 'USAGE: finalize <epic.story> --expected-head <sha>' }
  }
  return { storyId, expectedHead }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) return prepareFailure('INVALID', [parsed.error])
  const root = path.resolve(gitOutput(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  return applyFinalization(root, parsed.storyId, parsed.expectedHead)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = main()
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = CODES[result.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'ERROR', valid: false, ready: false, reasons: [error.message] }) + '\n')
    process.exitCode = CODES.ERROR
  }
}
