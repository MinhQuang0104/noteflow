import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest, validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { actionFingerprint, checkpointImplementation, prepareAction, recordSliceReview, verifySlice } from './v4-action-kernel.mjs'
import { inspectActionTransaction, transactionIdentity } from './v4-slice-transaction.mjs'
import { runV4Story } from './v4-story-runner.mjs'

const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const STORY = 'docs/story.md'
const IMPLEMENTATION_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json'
const VERIFICATION_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json'
const REVIEW_RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json'
const digest = value => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function storySource(risk) {
  return [
    '---', 'story_id: "9.1"', 'title: Fixture story', 'status: in-progress', '---',
    '# Fixture story', '',
    '<!-- v4:story:start -->', 'A bounded fixture story.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', '- AC-1: The fixture implementation is checkpointed.', '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', '- [ ] T-1 [AC-1]: Implement the fixture.', '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: .agents/docs/v4-action-kernel.md#kernel', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', `- level: ${risk}`, '- invariants: exact checkpoint and review scope', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

function v2Plan(storyDigest, risk, status = 'pending') {
  const checkpointed = status === 'checkpointed'
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', `  level: ${risk}`, 'slices:', '  - id: A', '    status: ' + status,
    '    task_refs: [T-1]', '    depends_on: []', '    blockers: []', '    unresolved_questions: []',
    'next_action:', '  kind: ' + (checkpointed ? 'verify_slice' : 'implement_slice'), '  target: A', '---', ''
  ].join('\n')
}

function implementationTemplate(risk) {
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: {{STORY_NORMATIVE_DIGEST}}', 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', `  level: ${risk}`, 'slices:', '  - id: A', '    status: checkpointed',
    '    task_refs: [T-1]', '    depends_on: []', '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:',
    '      implementation:', '        path: ' + IMPLEMENTATION_RECEIPT, '        digest: {{RECEIPT_DIGEST}}',
    '    blockers: []', '    unresolved_questions: []', 'next_action:', '  kind: verify_slice', '  target: A', '---', ''
  ].join('\n')
}

function verificationTemplate(fixture, includeReview) {
  const implementationDigest = fixture.implementationDigest
  const lines = [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + fixture.storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: {{CURRENT_SLICE}}',
    'risk:', `  level: ${fixture.risk}`, 'slices:', '  - id: A', '    status: {{TARGET_STATUS}}',
    '    task_refs: [T-1]', '    depends_on: []', '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:',
    '      implementation:', '        path: ' + IMPLEMENTATION_RECEIPT, '        digest: ' + implementationDigest,
    '      verification:', '        path: {{VERIFICATION_RECEIPT_PATH}}', '        digest: {{VERIFICATION_RECEIPT_DIGEST}}',
    '    verification:', '      status: {{VERIFICATION_STATUS}}', '      canonical:', '        status: {{CANONICAL_STATUS}}',
    '      escalation:', '        decision: {{ESCALATION_DECISION}}', '      progression_eligible: {{PROGRESSION_ELIGIBLE}}'
  ]
  if (includeReview) {
    const verificationIndex = lines.indexOf('    verification:')
    lines.splice(verificationIndex, 0,
      '      review:', '        path: {{REVIEW_RECEIPT_PATH}}', '        digest: {{REVIEW_RECEIPT_DIGEST}}')
    lines.push(
      '      review_disclosure: same-lead bounded review',
      '    review:', '      freshness: FRESH_CANDIDATE', '      judgment: {{REVIEW_JUDGMENT}}',
      '      reviewed_commit: {{REVIEWED_COMMIT}}', '      risk_context_digest: {{RISK_CONTEXT_DIGEST}}',
      '      reviewer: {{REVIEWER}}'
    )
  }
  lines.push('    blockers: []', '    unresolved_questions: []', 'next_action:',
    '  kind: {{NEXT_ACTION_KIND}}', '  target: {{NEXT_ACTION_TARGET}}', '---', '')
  return lines.join('\n')
}

function verificationRegistry() {
  const map = { schema_version: 2, id: 'fixture-feature', covered_paths: ['src/feature.txt'], anchor_blobs: { 'src/feature.txt': '0'.repeat(40) } }
  const recipe = {
    schema_version: 1,
    featureId: 'fixture-feature',
    featureMap: '.agents/features/fixture-feature.json',
    checks: [
      { id: 'map', argv: ['node', '-e', "process.stdout.write('VALID\\n')"], cwd: '.', environment: {} },
      { id: 'behavior', argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment: {} }
    ]
  }
  const registry = { schema_version: 1, recipes: [{ featureId: 'fixture-feature', path: '.agents/verification/fixture-feature.json', enabled: true }] }
  return { map, recipe, registry }
}

function fixture(risk) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-verification-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  const story = storySource(risk)
  const storyDigest = normativeDigest(inspectStory(story))
  const files = {
    '.gitignore': '.agent-state/\n',
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agents/skills/v4-story-runner/actions/implement-slice.md': '# implementation\n',
    '.agents/skills/v4-story-runner/actions/verify-slice.md': '# verification\n',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md': '# techniques\n',
    '.agents/scripts/check-escalation.mjs': readFileSync(path.resolve(process.cwd(), '.agents/scripts/check-escalation.mjs'), 'utf8'),
    '.agents/scripts/prepare-change-evidence.mjs': readFileSync(path.resolve(process.cwd(), '.agents/scripts/prepare-change-evidence.mjs'), 'utf8'),
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'src/base.txt': 'base\n', [STORY]: story, [PLAN]: v2Plan(storyDigest, risk),
    '.agents/verification/registry.json': JSON.stringify(verificationRegistry().registry, null, 2) + '\n',
    '.agents/verification/fixture-feature.json': JSON.stringify(verificationRegistry().recipe, null, 2) + '\n',
    '.agents/features/fixture-feature.json': JSON.stringify(verificationRegistry().map, null, 2) + '\n',
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
  const initialHead = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/feature.txt', 'implemented\n')
  const implementationRequest = {
    action: 'implement_slice', operation: 'prepare', story_id: '9.1', slice_id: 'A', expected_head: initialHead,
    transaction_id: `implementation-${risk.toLowerCase()}`, owned_paths: ['src/feature.txt'],
    plan_template: implementationTemplate(risk),
    policy_paths: ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md',
      '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md'],
    recipe_paths: ['.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md'],
    commands: [{ command: 'node --check src/feature.txt', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: ['T-1'], note: 'fixture exact scope' },
    selected_tasks: ['T-1'], selected_acceptance_criteria: ['AC-1'], red_green: { applicable: false, reason: 'fixture' }
  }
  const preparedImplementation = prepareAction(root, implementationRequest)
  assert.equal(preparedImplementation.status, 'READY', JSON.stringify(preparedImplementation))
  const checkpointed = checkpointImplementation(root, { ...implementationRequest, operation: 'checkpoint', preview: preparedImplementation.preview })
  assert.equal(checkpointed.status, 'CHECKPOINTED', JSON.stringify(checkpointed))
  const plan = frontmatter(readFileSync(path.join(root, PLAN), 'utf8'))
  const implementationDigest = plan.slices[0].receipt_refs.implementation.digest
  const head = git(root, 'rev-parse', 'HEAD')
  const checkSpecs = [{
    id: 'focused-fixture', classification: 'behavioral', required: true,
    argv: ['node', '-e', 'process.exit(0)'], cwd: '.', environment_identity: { name: 'fixture' },
    source: { kind: 'focused-manifest', path: '.agents/skills/v4-story-runner/actions/verify-slice.md' },
    referenced_paths: ['src/feature.txt']
  }]
  const verifyRequest = {
    action: 'verify_slice', operation: 'prepare', story_id: '9.1', slice_id: 'A', expected_head: head,
    transaction_id: `verification-${risk.toLowerCase()}`, canonical_selector: 'fixture-feature', check_specs: checkSpecs,
    policy_paths: implementationRequest.policy_paths,
    recipe_paths: ['.agents/skills/v4-story-runner/actions/verify-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md', '.agents/verification/registry.json'],
  }
  return { root, cleanup, risk, storyDigest, implementationDigest, head, verifyRequest, checkSpecs }
}

function prepareVerification(f) {
  const result = prepareAction(f.root, f.verifyRequest)
  assert.equal(result.status, 'READY', JSON.stringify(result))
  return result
}

function makeReviewEvidence(f, preview) {
  const script = path.resolve(process.cwd(), '.agents/scripts/prepare-change-evidence.mjs')
  const result = spawnSync(process.execPath, [script, '--comparison', 'explicit-pair', '--base', preview.baseline_commit,
    '--head', preview.checkpoint_commit, '--path', 'src/feature.txt'], { cwd: f.root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()).changeEvidence
}

function scopeDigest(changeEvidence) {
  const refs = changeEvidence.paths[0].hunks.map((hunk, hunkIndex) => {
    const body = typeof hunk.diffText === 'string' ? hunk.diffText : hunk.diffText.join('\n')
    return { path: 'src/feature.txt', hunk_index: hunkIndex, body_digest: actionFingerprint(body) }
  })
  return actionFingerprint({ paths: ['src/feature.txt'], refs })
}

test('LOW PASS runs canonical and focused checks then persists only verification metadata', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false)
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.equal(result.next_action.kind, 'finalize_story')
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(plan.slices[0].status, 'verified')
    assert.equal(plan.slices[0].receipt_refs.verification.digest, receiptDigest(receipt))
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('HIGH PASS stops at REVIEW_REQUIRED with immutable pending evidence and no commit', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    assert.equal(result.status, 'REVIEW_REQUIRED', JSON.stringify(result))
    assert.equal(result.pending.verification_status, 'PASS')
    assert.equal(result.pending.review_questions.length > 0, true)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(result.pending.fingerprint, actionFingerprint(Object.fromEntries(Object.entries(result.pending).filter(([key]) => key !== 'fingerprint'))))
  } finally { f.cleanup() }
})

test('same-Lead APPROVE requires exact bounded evidence and persists verification plus review receipts', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
      scope_paths: ['src/feature.txt'], scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const result = recordSliceReview(f.root, {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      plan_template: verificationTemplate(f, true), review
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.slices[0].status, 'reviewed')
    assert.ok(plan.slices[0].receipt_refs.review.digest)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('CHANGES_REQUIRED blocks and stale policy rejects continuation without mutation', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const common = {
      ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
      review: {
        judgment: 'CHANGES_REQUIRED', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
        scope_digest: scopeDigest(evidence), change_evidence: evidence,
        answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'not approved' })),
        commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
      }
    }
    const blockedResult = recordSliceReview(f.root, common)
    assert.equal(blockedResult.status, 'BLOCKED', JSON.stringify(blockedResult))
    assert.equal(blockedResult.reasons[0], 'CHANGES_REQUIRED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    write(f.root, 'AGENTS.md', '# changed policy\n')
    const staleResult = recordSliceReview(f.root, common)
    assert.equal(staleResult.status, 'STALE', JSON.stringify(staleResult))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('NEED_MORE_EVIDENCE permits one bounded round and rejects a second round', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
    const evidence = makeReviewEvidence(f, prepared.preview)
    const review = {
      judgment: 'NEED_MORE_EVIDENCE', pending_fingerprint: pendingResult.pending.fingerprint, scope_paths: ['src/feature.txt'],
      scope_digest: scopeDigest(evidence), change_evidence: evidence,
      answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'need one more bounded check' })),
      commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }]
    }
    const next = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending, review })
    assert.equal(next.status, 'REVIEW_REQUIRED', JSON.stringify(next))
    assert.equal(next.pending.evidence_round, 1)
    const second = recordSliceReview(f.root, { ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: next.pending, review: { ...review, pending_fingerprint: next.pending.fingerprint } })
    assert.equal(second.status, 'BLOCKED', JSON.stringify(second))
    assert.equal(second.reasons[0], 'EVIDENCE_BUDGET_EXHAUSTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('verification metadata recovery resumes an interrupted commit without replay', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const first = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), fail_at: 'after-commit-hook'
    })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    const recovered = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), recovery_authorized: true,
      recovery_checkpoint: first.checkpoint_commit
    })
    assert.equal(recovered.status, 'NOOP', JSON.stringify(recovered))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('wrong verification successor is rejected before creating a transaction or lock', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false).replace('{{NEXT_ACTION_KIND}}', 'verify_slice').replace('{{NEXT_ACTION_TARGET}}', 'A')
    })
    assert.ok(result.reasons.includes('SUCCESSOR_PROJECTION_MISMATCH'), JSON.stringify(result))
    assert.equal(inspectActionTransaction(f.root, f.verifyRequest.transaction_id).status, 'NOT_FOUND')
    assert.equal(existsSync(transactionIdentity(f.root, f.verifyRequest).lockPath), false)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

for (const failure of ['after-write', 'after-metadata-stage']) {
  test(`verification recovery resumes ${failure} without regenerating evidence`, () => {
    const f = fixture('LOW')
    try {
      const prepared = prepareVerification(f)
      const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
      const first = verifySlice(f.root, { ...input, fail_at: failure })
      assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
      const receiptBytes = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
      const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
      assert.equal(recovered.status, 'APPLIED', JSON.stringify(recovered))
      assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), receiptBytes)
      assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
      assert.equal(git(f.root, 'status', '--porcelain'), '')
      assert.equal(verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit }).status, 'NOOP')
    } finally { f.cleanup() }
  })
}

test('interrupted metadata recovery rejects a changed receipt and preserves partial state', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
    const first = verifySlice(f.root, { ...input, fail_at: 'after-write' })
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    receipt.commands[0].environment = 'tampered'
    write(f.root, VERIFICATION_RECEIPT, JSON.stringify(receipt) + '\n')
    const before = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
    const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
    assert.equal(recovered.status, 'RECOVERY_REQUIRED', JSON.stringify(recovered))
    assert.ok(recovered.reasons.includes('RECOVERY_METADATA_CONTENT_MISMATCH'), JSON.stringify(recovered))
    assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), before)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.ok(existsSync(first.lock_path))
  } finally { f.cleanup() }
})

function legacyMetadataFailure(f) {
  const request = { action: 'verify_slice', story_id: '9.1', slice_id: 'A', transaction_id: 'legacy-prewrite', recovery_checkpoint: f.head, maintenance_paths: [] }
  const identity = transactionIdentity(f.root, request)
  const lock = { schema_version: 1, repository: identity.repository, worktree: identity.worktree, action: 'verify_slice', story_id: '9.1', slice_id: 'A', transaction_id: request.transaction_id, scope_key: identity.scopeKey, created_at: '2026-10-01T00:00:00.000Z' }
  const journal = { ...lock, expected_head: f.head, checkpoint_commit: f.head, implementation_paths: [], metadata_paths: [PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT].sort(), preview_fingerprint: digest('legacy-preview'), lock_identity: lock, phase: 'RECOVERY_REQUIRED', error: 'SUCCESSOR_PROJECTION_MISMATCH', recovery_required: true, initial_inventory: { staged: [], unstaged: [], untracked: [] }, lock_path: identity.lockPath, journal_path: identity.journalPath, _path: identity.journalPath }
  mkdirSync(identity.transactionRoot, { recursive: true })
  const journalBytes = JSON.stringify(journal, null, 2) + '\n'
  const lockBytes = JSON.stringify(lock, null, 2) + '\n'
  writeFileSync(identity.journalPath, journalBytes)
  writeFileSync(identity.lockPath, lockBytes)
  const run = (operation, extra = {}) => runV4Story(f.root, '9.1', { expectedHead: f.head, operation, input: { ...request, ...extra } })
  return { request, identity, journalBytes, lockBytes, run }
}

test('Runner retires only the unwritten legacy transaction and preserves its journal and lock evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview }).status, 'BLOCKED')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'ABORTED', JSON.stringify(result))
    assert.equal(readFileSync(result.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(result.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(existsSync(legacy.identity.lockPath), false)
    assert.equal(inspectActionTransaction(f.root, legacy.request.transaction_id).status, 'ABORTED')
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true }).status, 'NOOP')
  } finally { f.cleanup() }
})

for (const fault of ['wrong-checkpoint', 'foreign-lock', 'dirty-product', 'dirty-metadata', 'staged-work', 'non-idle']) {
  test(`unwritten retirement rejects ${fault} without changing recovery evidence`, () => {
    const f = fixture('HIGH')
    try {
      const legacy = legacyMetadataFailure(f)
      if (fault === 'wrong-checkpoint') legacy.request.recovery_checkpoint = 'f'.repeat(40)
      if (fault === 'foreign-lock') writeFileSync(legacy.identity.lockPath, legacy.lockBytes.replace('legacy-prewrite', 'foreign-owner'))
      if (fault === 'dirty-product') write(f.root, 'src/base.txt', 'user work\n')
      if (fault === 'dirty-metadata') write(f.root, VERIFICATION_RECEIPT, '{}\n')
      if (fault === 'staged-work') { write(f.root, 'user.txt', 'staged\n'); git(f.root, 'add', 'user.txt') }
      if (fault === 'non-idle') write(f.root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, status: 'RUNNING', activeRunId: 'other', storyId: '9.2' }))
      const lockBefore = readFileSync(legacy.identity.lockPath, 'utf8')
      const statusBefore = git(f.root, 'status', '--porcelain')
      const result = legacy.run('prepare-recovery-abort')
      assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
      assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
      assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), lockBefore)
      assert.equal(git(f.root, 'status', '--porcelain'), statusBefore)
    } finally { f.cleanup() }
  })
}

test('retirement binds maintenance changes and rejects a stale preview', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const maintenance = '.agents/scripts/v4-repair.mjs'
    write(f.root, maintenance, '// authorized tooling repair\n')
    legacy.request.maintenance_paths = [maintenance]
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(f.root, maintenance, '// changed after preview\n')
    const result = legacy.run('abort-unwritten-metadata', { preview: prepared.preview, recovery_authorized: true })
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.equal(readFileSync(legacy.identity.journalPath, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(legacy.identity.lockPath, 'utf8'), legacy.lockBytes)
  } finally { f.cleanup() }
})

test('retirement resumes interrupted owned-lock archival without replacing evidence', () => {
  const f = fixture('HIGH')
  try {
    const legacy = legacyMetadataFailure(f)
    const prepared = legacy.run('prepare-recovery-abort')
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const input = { preview: prepared.preview, recovery_authorized: true }
    const first = legacy.run('abort-unwritten-metadata', { ...input, fail_at: 'AFTER_ABORT_JOURNAL' })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.ok(existsSync(legacy.identity.lockPath))
    const recovered = legacy.run('abort-unwritten-metadata', input)
    assert.equal(recovered.status, 'ABORTED', JSON.stringify(recovered))
    assert.equal(readFileSync(recovered.archive_journal_path, 'utf8'), legacy.journalBytes)
    assert.equal(readFileSync(recovered.archive_lock_path, 'utf8'), legacy.lockBytes)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})
