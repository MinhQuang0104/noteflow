import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { inspectFinalization } from './check-story-finalization.mjs'
import { actionFingerprint } from './v4-action-kernel.mjs'
import { runV4Story } from './v4-story-runner.mjs'

import { git, write, digest } from './v4-test-helpers.mjs'

export const STORY = 'docs/story.md'
export const EPIC = 'docs/product/epics.md'
export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const RECEIPTS = '_bmad-output/implementation-artifacts/receipts/story-9-1'
export const SCRIPTS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
export const POLICY_PATHS = ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md',
  '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md']
export const readPlan = f => readFileSync(path.join(f.root, PLAN), 'utf8')
export const head = f => git(f.root, 'rev-parse', 'HEAD')

export function storySource(slices) {
  return [
    '---', 'story_id: "9.1"', 'title: Fixture story', 'status: in-progress', '---',
    '# Fixture story', '',
    '<!-- v4:story:start -->', 'A bounded fixture story.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', ...slices.map((slice, index) => `- AC-${index + 1}: Slice ${slice.id} is evidenced.`), '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', ...slices.map((slice, index) => `- [ ] T-${index + 1} [AC-${index + 1}]: Implement slice ${slice.id}.`), '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: docs/architecture/fixture.md#ad-1', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', '- level: MEDIUM', '- invariants: exact checkpoint and review scope', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

export function planText(f, blocks, current, nextKind, nextTarget, storyDigest = f.storyDigest) {
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest,
    'upstream_epic:', '  path: ' + EPIC, '  section_digest: ' + f.epicDigest,
    'sprint_key: 9-1-fixture', 'lifecycle_snapshot: in-progress', 'execution_status: in-progress',
    'current_slice: ' + current, 'risk:', '  level: MEDIUM', 'slices:',
    ...f.slices.map(slice => blocks[slice.id]),
    'blockers: []', 'unresolved_questions: []',
    'next_action:', '  kind: ' + nextKind, '  target: ' + nextTarget, '---', ''
  ].join('\n')
}

export function head4(slice) {
  return [
    '  - id: ' + slice.id, null, '    task_refs: [' + slice.task + ']',
    '    depends_on: [' + (slice.dependsOn ?? []).join(', ') + ']',
    '    risk:', '      level: ' + slice.risk, '      flags: []'
  ]
}

export function pendingBlock(slice) {
  const lines = head4(slice)
  lines[1] = '    status: pending'
  return lines.join('\n')
}

export function checkpointBlock(slice) {
  const lines = head4(slice)
  lines[1] = '    status: checkpointed'
  return [...lines,
    '    baseline_commit: {{BASELINE_COMMIT}}', '    checkpoint_commit: {{CHECKPOINT_COMMIT}}',
    '    subject_digest: {{SUBJECT_DIGEST}}', '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}',
    '    receipt_refs:', '      implementation:', `        path: ${RECEIPTS}/${slice.id}-implementation.json`,
    '        digest: {{RECEIPT_DIGEST}}'].join('\n')
}

export function verificationBlock(slice, implementationDigest, includeReview) {
  const lines = head4(slice)
  lines[1] = '    status: {{TARGET_STATUS}}'
  lines.push('    baseline_commit: {{BASELINE_COMMIT}}', '    checkpoint_commit: {{CHECKPOINT_COMMIT}}',
    '    subject_digest: {{SUBJECT_DIGEST}}', '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}',
    '    receipt_refs:', '      implementation:', `        path: ${RECEIPTS}/${slice.id}-implementation.json`,
    '        digest: ' + implementationDigest,
    '      verification:', '        path: {{VERIFICATION_RECEIPT_PATH}}', '        digest: {{VERIFICATION_RECEIPT_DIGEST}}')
  if (includeReview) lines.push('      review:', '        path: {{REVIEW_RECEIPT_PATH}}', '        digest: {{REVIEW_RECEIPT_DIGEST}}')
  lines.push('    verification:', '      status: {{VERIFICATION_STATUS}}', '      canonical:', '        status: {{CANONICAL_STATUS}}',
    '      escalation:', '        decision: {{ESCALATION_DECISION}}', '      progression_eligible: {{PROGRESSION_ELIGIBLE}}')
  if (includeReview) {
    lines.push('    review:', '      freshness: FRESH_CANDIDATE', '      judgment: {{REVIEW_JUDGMENT}}',
      '      reviewed_commit: {{REVIEWED_COMMIT}}', '      risk_context_digest: {{RISK_CONTEXT_DIGEST}}',
      '      reviewer: {{REVIEWER}}')
  }
  return lines.join('\n')
}

// The persisted text of every slice, exactly as the kernel committed it.
export function persistedBlocks(f) {
  const text = readPlan(f).replaceAll('\r\n', '\n')
  const body = text.split('\nslices:\n')[1].split('\nblockers: []\n')[0]
  return Object.fromEntries(body.split(/\n(?=  - id: )/).map(block => [/^  - id: (\S+)/.exec(block)[1], block]))
}

export function fixture(slices) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-no-review-e2e-'))
  const changedPaths = slices.map(slice => slice.path).sort()
  const story = storySource(slices)
  const epicSection = '### Story 9.1: Fixture story\n\nDone.\n\n'
  const f = {
    root, slices, storyDigest: normativeDigest(inspectStory(story)), epicDigest: digest(epicSection),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
  const recipe = {
    schema_version: 1, featureId: 'fixture-feature', featureMap: '.agents/features/fixture-feature.json',
    checks: [
      { id: 'map', argv: ['node', '-e', "process.stdout.write('VALID\\n')"], cwd: '.', environment: {} },
      { id: 'behavior', argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment: {} }
    ]
  }
  const files = {
    '.gitignore': '.agent-state/\n',
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agents/skills/v4-story-runner/actions/implement-slice.md': '# implementation\n',
    '.agents/skills/v4-story-runner/actions/verify-slice.md': '# verification\n',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md': '# techniques\n',
    '.agents/scripts/check-escalation.mjs': readFileSync(path.join(SCRIPTS, 'check-escalation.mjs'), 'utf8'),
    '.agents/scripts/prepare-change-evidence.mjs': readFileSync(path.join(SCRIPTS, 'prepare-change-evidence.mjs'), 'utf8'),
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'docs/architecture/fixture.md': '# AD-1\n',
    [EPIC]: '# Epic\n\n' + epicSection + '### Story 9.2: Next\n',
    'src/base.txt': 'base\n', [STORY]: story,
    [PLAN]: planText(f, Object.fromEntries(slices.map(slice => [slice.id, pendingBlock(slice)])), slices[0].id, 'implement_slice', slices[0].id),
    '.agents/verification/registry.json': JSON.stringify({ schema_version: 1,
      recipes: [{ featureId: 'fixture-feature', path: '.agents/verification/fixture-feature.json', enabled: true }] }, null, 2) + '\n',
    '.agents/verification/fixture-feature.json': JSON.stringify(recipe, null, 2) + '\n',
    '.agents/features/fixture-feature.json': JSON.stringify({ schema_version: 2, id: 'fixture-feature', covered_paths: changedPaths,
      anchor_blobs: Object.fromEntries(changedPaths.map(item => [item, '0'.repeat(40)])) }, null, 2) + '\n',
    '_bmad-output/implementation-artifacts/sprint-status.yaml': 'development_status:\n  9-1-fixture: in-progress\n'
  }
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Fixture')
  git(root, 'config', 'user.email', 'v4-fixture@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  return f
}

export function run(f, options) {
  return runV4Story(f.root, '9.1', { expectedHead: head(f), ...options })
}

export function implement(f, slice) {
  write(f.root, slice.path, `implemented ${slice.id}\n`)
  const blocks = { ...persistedBlocks(f), [slice.id]: checkpointBlock(slice) }
  const input = {
    action: 'implement_slice', story_id: '9.1', slice_id: slice.id, expected_head: head(f),
    transaction_id: `implementation-${slice.id.toLowerCase()}`, owned_paths: [slice.path],
    plan_template: planText(f, blocks, slice.id, 'verify_slice', slice.id, '{{STORY_NORMATIVE_DIGEST}}'),
    policy_paths: POLICY_PATHS,
    recipe_paths: ['.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md'],
    commands: [{ command: 'node --check fixture', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: [slice.task], note: 'fixture exact scope' },
    selected_tasks: [slice.task], selected_acceptance_criteria: [slice.task.replace('T-', 'AC-')],
    red_green: { applicable: false, reason: 'fixture' }
  }
  const prepared = run(f, { operation: 'prepare', input })
  assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
  const checkpointed = run(f, { operation: 'checkpoint', input: { ...input, preview: prepared.preview } })
  assert.equal(checkpointed.status, 'CHECKPOINTED', JSON.stringify(checkpointed))
}

// One verify_slice step: prepare, then verify; returns the verify result and
// the request needed to continue with record-review.
export function verify(f, slice, extra = {}) {
  const implementationDigest = frontmatter(readPlan(f)).slices.find(item => item.id === slice.id).receipt_refs.implementation.digest
  const request = {
    action: 'verify_slice', story_id: '9.1', slice_id: slice.id, expected_head: head(f),
    transaction_id: `verification-${slice.id.toLowerCase()}`, canonical_selector: 'fixture-feature',
    check_specs: [{
      id: `focused-${slice.id.toLowerCase()}`, classification: 'behavioral', required: true,
      argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment_identity: { name: 'fixture' },
      source: { kind: 'focused-manifest', path: '.agents/skills/v4-story-runner/actions/verify-slice.md' },
      referenced_paths: [slice.path]
    }],
    policy_paths: POLICY_PATHS,
    recipe_paths: ['.agents/skills/v4-story-runner/actions/verify-slice.md',
      '.agents/skills/v4-story-runner/references/implementation-techniques.md', '.agents/verification/registry.json'],
    ...extra
  }
  const prepared = run(f, { operation: 'prepare', input: request })
  assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
  const index = f.slices.findIndex(item => item.id === slice.id)
  const successor = f.slices[index + 1]
  const template = includeReview => {
    const blocks = { ...persistedBlocks(f), [slice.id]: verificationBlock(slice, implementationDigest, includeReview) }
    return planText(f, blocks, '{{CURRENT_SLICE}}', '{{NEXT_ACTION_KIND}}', '{{NEXT_ACTION_TARGET}}')
  }
  const result = run(f, { operation: 'verify', input: { ...request, preview: prepared.preview, plan_template: template(false) } })
  return { result, request, preview: prepared.preview, template, successor }
}

export function changeEvidence(f, preview) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, 'prepare-change-evidence.mjs'), '--comparison', 'explicit-pair',
    '--base', preview.baseline_commit, '--head', preview.checkpoint_commit,
    ...preview.changed_paths.flatMap(relative => ['--path', relative])], { cwd: f.root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()).changeEvidence
}

export function scopeDigest(evidence, file) {
  if (evidence.evidenceSet) {
    return actionFingerprint({ paths: evidence.evidenceSet.paths.map(item => item.path), source: evidence.evidenceSet.sourceDigest })
  }
  const refs = evidence.paths[0].hunks.map((hunk, hunkIndex) => {
    const body = typeof hunk.diffText === 'string' ? hunk.diffText : hunk.diffText.join('\n')
    return { path: file, hunk_index: hunkIndex, body_digest: actionFingerprint(body) }
  })
  return actionFingerprint({ paths: [file], refs })
}

export function recordReview(f, slice, step) {
  assert.equal(step.result.status, 'REVIEW_REQUIRED', JSON.stringify(step.result))
  const pending = step.result.pending
  const evidence = changeEvidence(f, step.preview)
  const review = {
    judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pending.fingerprint,
    scope_paths: [slice.path], scope_digest: scopeDigest(evidence, slice.path), change_evidence: evidence,
    answers: pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
    commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
  }
  const result = run(f, { operation: 'record-review', input: {
    ...step.request, preview: step.preview, pending, plan_template: step.template(true), review
  } })
  assert.equal(result.status, 'APPLIED', JSON.stringify(result))
  return result
}

// Runner finalize -> Human Gate -> structured approval -> complete_story -> done.
export function finalizeAndComplete(f) {
  const finalized = run(f, {})
  assert.equal(finalized.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(finalized))
  assert.equal(frontmatter(readPlan(f)).next_action.kind, 'complete_story')
  const approval = run(f, { approveExactScope: true })
  assert.equal(frontmatter(readPlan(f)).human_approval?.story_id, '9.1', JSON.stringify(approval))
  const completed = run(f, {})
  assert.equal(completed.status, 'DONE', JSON.stringify(completed))
  const plan = frontmatter(readPlan(f))
  assert.equal(plan.lifecycle_snapshot, 'done')
  assert.equal(plan.next_action, null)
  assert.equal(git(f.root, 'status', '--porcelain'), '')
}

// Hand-written tamper: turn a reviewed slice back into `verified` without its
// review receipt, as if review had been skipped.
export function stripReview(f, sliceId) {
  const blocks = persistedBlocks(f)
  const block = blocks[sliceId]
    .replace('    status: reviewed', '    status: verified')
    .replace(/\n      review:\n        path: .*\n        digest: .*/, '')
    .replace(/\n    review:(\n      .*)*/, '\n    review:\n      required: false')
  const text = readPlan(f).replace(blocks[sliceId], block)
  assert.notEqual(text, readPlan(f))
  write(f.root, PLAN, text)
  git(f.root, 'add', '--', PLAN)
  git(f.root, 'commit', '-qm', 'tamper: drop review')
  return frontmatter(readPlan(f)).slices.find(slice => slice.id === sliceId)
}

export function finalizationReasons(f) {
  const result = inspectFinalization(f.root, '9.1', head(f))
  assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
  return result.reasons
}
