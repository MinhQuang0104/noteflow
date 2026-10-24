import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { applyRework } from './v4-action-kernel.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'

export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const STORY = 'docs/story.md'
export const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export const POINTER = '.agent-state/active-run.json'
export const RECEIPT_DIR = '_bmad-output/implementation-artifacts/receipts/story-9-1'
export const OLD_RECEIPT = `${RECEIPT_DIR}/D-implementation.json`
export const NEW_IMPLEMENTATION_RECEIPT = `${RECEIPT_DIR}/D-implementation-attempt-2.json`
export const NEW_VERIFICATION_RECEIPT = `${RECEIPT_DIR}/D-verification-attempt-2.json`
export const NEW_REVIEW_RECEIPT = `${RECEIPT_DIR}/D-review-attempt-2.json`
export const digest = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
export const pathDigest = paths => digest(`${[...new Set(paths)].sort().join('\n')}\n`)

export function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

export function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

export function storySource() {
  return [
    '---', 'story_id: "9.1"', 'title: Rework fixture', 'status: in-progress', '---',
    '# Rework fixture', '',
    '<!-- v4:story:start -->', 'A bounded rework fixture.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', '- AC-1: The original and rework attempts remain auditable.', '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', '- [ ] T-6 [AC-1]: Implement the current slice.', '- [ ] T-7 [AC-1]: Verify the successor slice.', '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: .agents/docs/v4-action-kernel.md#kernel', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', '- level: HIGH', '- invariant: append-only attempt history', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

export function planText(storyDigest, sliceText, nextKind, nextTarget) {
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', `current_slice: ${nextTarget}`,
    'risk:', '  level: HIGH', 'slices:', sliceText, 'blockers: []', 'unresolved_questions: []',
    'next_action:', `  kind: ${nextKind}`, `  target: ${nextTarget}`, '---', ''
  ].join('\n')
}

export function pendingSlices(successor = 'E') {
  return [
    '  - id: D', '    status: pending', '    task_refs: [T-6]', '    depends_on: []',
    `  - id: ${successor}`, '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

export function checkpointedSlices(baseline, checkpoint, subjectDigest, changedDigest, receiptDigestValue, successor = 'E') {
  return [
    '  - id: D', '    status: checkpointed', '    task_refs: [T-6]', '    depends_on: []',
    `    baseline_commit: ${baseline}`, `    checkpoint_commit: ${checkpoint}`,
    `    subject_digest: ${subjectDigest}`, `    changed_paths_sha256: ${changedDigest}`,
    '    receipt_refs:', '      implementation:', `        path: ${OLD_RECEIPT}`, `        digest: ${receiptDigestValue}`,
    `  - id: ${successor}`, '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

export function reworkSlices(f, successor = 'E') {
  const history = [
    '    attempt_history:', '      - attempt_id: 1', '        status: checkpointed',
    `        baseline_commit: ${f.baseline}`, `        checkpoint_commit: ${f.checkpoint}`,
    `        subject_digest: ${f.subjectDigest}`, `        changed_paths_sha256: ${f.changedDigest}`,
    '        receipt_refs:', '          implementation:', `            path: ${OLD_RECEIPT}`, `            digest: ${f.oldReceiptDigest}`
  ]
  const current = [
    '    current_attempt:', '      attempt_id: 2', '      receipt_refs:',
    '        implementation:', `          path: ${NEW_IMPLEMENTATION_RECEIPT}`,
    '        verification:', `          path: ${NEW_VERIFICATION_RECEIPT}`,
    '        review:', `          path: ${NEW_REVIEW_RECEIPT}`
  ]
  return [
    '  - id: D', '    status: pending', '    task_refs: [T-6]', '    depends_on: []', ...history, ...current,
    `  - id: ${successor}`, '    status: pending', '    task_refs: [T-7]', '    depends_on: [D]'
  ].join('\n')
}

export function fixture({ successor = 'E', extraPaths = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-rework-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  const files = {
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'src/sync.ts': 'old sync\n', 'src/sync.spec.ts': 'old test\n', 'src/untouched.txt': 'untouched\n'
  }
  for (const extra of extraPaths) files[extra] = 'old extra\n'
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  const story = storySource()
  const storyDigest = normativeDigest(inspectStory(story))
  write(root, STORY, story)
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, PLAN, planText(storyDigest, pendingSlices(successor), 'implement_slice', 'D'))
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Rework Fixture')
  git(root, 'config', 'user.email', 'v4-rework@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')

  write(root, 'src/sync.ts', 'old implementation\n')
  write(root, 'src/sync.spec.ts', 'old implementation test\n')
  for (const extra of extraPaths) write(root, extra, 'new extra\n')
  git(root, 'add', '--', 'src/sync.ts', 'src/sync.spec.ts', ...extraPaths)
  git(root, 'commit', '-qm', 'fixture D implementation')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const changedPaths = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', `${baseline}..${checkpoint}`).split(/\r?\n/).filter(Boolean)
  const changedDigest = pathDigest(changedPaths)
  const subjectDigest = digest(git(root, 'show', '-s', '--format=%s', checkpoint))
  const oldReceipt = {
    schema_version: 1, story_id: '9.1', slice_id: 'D', kind: 'implementation',
    checkpoint_commit: checkpoint, baseline_commit: baseline, subject_digest: subjectDigest,
    created_from_head: checkpoint, changed_paths_sha256: changedDigest, changed_paths: changedPaths,
    commands: [{ command: 'fixture D', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
  }
  const oldReceiptDigest = receiptDigest(oldReceipt)
  write(root, PLAN, planText(storyDigest, checkpointedSlices(baseline, checkpoint, subjectDigest, changedDigest, oldReceiptDigest, successor), 'verify_slice', 'D'))
  write(root, OLD_RECEIPT, `${JSON.stringify(oldReceipt, null, 2)}\n`)
  git(root, 'add', '--', PLAN, OLD_RECEIPT)
  git(root, 'commit', '-qm', 'fixture D metadata')
  const head = git(root, 'rev-parse', 'HEAD')
  const reworkTemplate = planText(storyDigest, reworkSlices({ baseline, checkpoint, subjectDigest, changedDigest, oldReceiptDigest }, successor), 'implement_slice', 'D')
  const request = {
    action: 'rework_slice', operation: 'prepare-rework', story_id: '9.1', slice_id: 'D', expected_head: head,
    transaction_id: 'fixture-rework-attempt-2', maintenance_authorization: 'V4_LITE_REWORK',
    old_checkpoint_commit: checkpoint, old_receipt_digest: oldReceiptDigest,
    findings: [{ id: 'finding-1', severity: 'HIGH', summary: 'D mapping is incomplete.' }],
    rework_paths: changedPaths, plan_template: reworkTemplate
  }
  return { root, cleanup, baseline, checkpoint, head, changedPaths, changedDigest, subjectDigest, oldReceiptDigest, request }
}

export function applyRequest(f, preview, extra = {}) {
  return applyRework(f.root, { ...f.request, operation: 'apply-rework', preview, ...extra })
}

export function state(f) {
  const identity = transactionIdentity(f.root, {
    action: 'rework_slice', story_id: '9.1', slice_id: 'D', transaction_id: f.request.transaction_id
  })
  return {
    head: git(f.root, 'rev-parse', 'HEAD'),
    count: git(f.root, 'rev-list', '--count', 'HEAD'),
    status: git(f.root, 'status', '--porcelain', '--untracked-files=all').split(/\r?\n/)
      .filter(line => line && !line.includes('.agent-state/v4-observations/')).join('\n'),
    index: git(f.root, 'diff', '--cached', '--binary'),
    plan: readFileSync(path.join(f.root, PLAN), 'utf8'),
    receipt: readFileSync(path.join(f.root, OLD_RECEIPT), 'utf8'),
    lock: existsSync(identity.lockPath) ? readFileSync(identity.lockPath, 'utf8') : null
  }
}
