import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { checkpointImplementation, inspectActionTransaction, prepareAction } from './v4-action-kernel.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'
import * as kernel from './v4-action-kernel.mjs'
import { claimStory } from './story-registry.mjs'

const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const STORY = 'docs/story.md'
const EPIC = 'docs/product/epics.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const POINTER = '.agent-state/active-run.json'
const RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json'
const digest = value => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')

test('effective risk defaults to Story and uses only the requested slice risk', () => {
  const plan = { risk: { level: 'HIGH', flags: ['security'] }, current_slice: 'A', slices: [
    { id: 'A', risk: { level: 'LOW', flags: [] } }, { id: 'B' },
  ] }
  assert.equal(kernel.riskLevel(plan, {}), 'LOW')
  assert.equal(kernel.riskLevel(plan, { risk: 'MEDIUM' }), 'MEDIUM')
  assert.equal(kernel.riskLevel(plan, { slice_id: 'B' }), 'HIGH')
  assert.equal(kernel.riskLevel({ risk: { level: 'MEDIUM' } }, {}), 'MEDIUM')
  assert.throws(() => kernel.riskLevel(plan, { slice_id: 'B', risk: 'LOW' }), /RISK_DOWNGRADE_FORBIDDEN/)
})

test('Plan risk flags become canonical mandatory escalation flags', () => {
  assert.deepEqual(kernel.mandatoryJudgmentFlags({ risk: { level: 'HIGH', flags: ['security', 'idempotency', 'shared_boundary', 'public_contract'] } }), [
    'CONCURRENCY_STATE', 'PUBLIC_CONTRACT', 'SECURITY_AUTH'
  ])
})

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

function storySource() {
  return [
    '---', 'story_id: "9.1"', 'title: Fixture story', 'status: in-progress', '---',
    '# Fixture story', '',
    '<!-- v4:story:start -->', 'A bounded fixture story.', '<!-- v4:story:end -->',
    '<!-- v4:ac:start -->', '- AC-1: The fixture implementation is checkpointed.', '<!-- v4:ac:end -->',
    '<!-- v4:tasks:start -->', '- [ ] T-1 [AC-1]: Implement the fixture.', '<!-- v4:tasks:end -->',
    '<!-- v4:readiness:start -->', '- result: READY', '- dependencies: none', '<!-- v4:readiness:end -->',
    '<!-- v4:references:start -->', '- architecture: .agents/docs/v4-action-kernel.md#kernel', '<!-- v4:references:end -->',
    '<!-- v4:risk:start -->', '- level: HIGH', '- invariants: exact checkpoint and recovery', '<!-- v4:risk:end -->',
    ''
  ].join('\n')
}

function v2Plan(storyDigest, status, agy = false) {
  const checkpoint = status === 'checkpointed'
  const executionContract = agy
    ? ['    executor: agy', '    scope:', '      paths: [src/]', '    verification_obligations: [node --check src/feature.txt]']
    : []
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: ' + storyDigest, 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', '  level: HIGH', 'slices:', '  - id: A', '    status: ' + status,
    '    task_refs: [T-1]', '    depends_on: []', ...executionContract, 'blockers: []', 'unresolved_questions: []',
    'next_action:', '  kind: ' + (checkpoint ? 'verify_slice' : 'implement_slice'), '  target: A', '---', ''
  ].join('\n')
}

function v1Epic() {
  return '# Epic\n\n### Story 9.1: Fixture\n\n**Acceptance Criteria:**\n\nCheckpoint the fixture.\n\n### Story 9.2: Next\n'
}

function v1Plan(sourceDigest, status) {
  const checkpoint = status === 'checkpointed'
  return [
    '---', 'schema_version: 1', 'story_id: "9.1"', 'source:', '  path: ' + EPIC,
    '  anchor: "#story-91-fixture"', '  section_digest: ' + sourceDigest, 'sprint_key: 9-1-fixture',
    'execution_status: in-progress', 'lifecycle_snapshot: in-progress', 'current_slice: A',
    'risk:', '  level: HIGH', 'slices:', '  - id: A', '    status: ' + status, '    depends_on: []',
    'blockers: []', 'unresolved_questions: []', 'next_action:',
    '  kind: ' + (checkpoint ? 'verify_slice' : 'implement_slice'), '  target: A', '---', ''
  ].join('\n')
}

function v2Template(agy = false) {
  const executionContract = agy
    ? ['    executor: agy', '    scope:', '      paths: [src/]', '    verification_obligations: [node --check src/feature.txt]']
    : []
  return [
    '---', 'schema_version: 2', 'story_id: "9.1"', 'story:', '  path: ' + STORY,
    '  normative_digest: {{STORY_NORMATIVE_DIGEST}}', 'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'risk:', '  level: HIGH', 'slices:', '  - id: A', '    status: checkpointed',
    '    task_refs: [T-1]', '    depends_on: []', ...executionContract, '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:',
    '      implementation:', '        path: ' + RECEIPT, '        digest: {{RECEIPT_DIGEST}}',
    'blockers: []', 'unresolved_questions: []', 'next_action:',
    '  kind: verify_slice', '  target: A', '---', ''
  ].join('\n')
}

function v1Template() {
  return [
    '---', 'schema_version: 1', 'story_id: "9.1"', 'source:', '  path: ' + EPIC,
    '  anchor: "#story-91-fixture"', '  section_digest: {{SOURCE_DIGEST}}', 'sprint_key: 9-1-fixture',
    'execution_status: in-progress', 'lifecycle_snapshot: in-progress', 'current_slice: A',
    'risk:', '  level: HIGH', 'slices:', '  - id: A', '    status: checkpointed', '    depends_on: []',
    '    baseline_commit: {{BASELINE_COMMIT}}', '    checkpoint_commit: {{CHECKPOINT_COMMIT}}',
    '    implementation:', '      changed_paths:', '        - src/feature.txt',
    '      changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '      focused_checks:',
    '        - command: node --check src/feature.txt', '          result: PASS', '          exit_code: 0',
    '      red_green:', '        applicable: false', '        reason: fixture evidence',
    'blockers: []', 'unresolved_questions: []', 'next_action:', '  kind: verify_slice', '  target: A', '---', ''
  ].join('\n')
}

function fixture(kind, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-kernel-'))
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  const files = {
    '.gitignore': '.agent-state/v4-observations/\n',
    'AGENTS.md': '# fixture policy\n', 'CLAUDE.md': '# provider policy\n',
    '.agents/routing/task-router.md': '# routing\n', '.agents/context/control-plane.md': '# control\n',
    '.agents/context/context-routing.md': '# context\n', '.agents/skills/v4-story-runner/SKILL.md': '# runner\n',
    '.agents/skills/v4-story-runner/actions/implement-slice.md': '# recipe\n',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md': '# techniques\n',
    '.agent-state/active-run.json': JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }) + '\n',
    'src/base.txt': 'base\n'
  }
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  let sourceDigest
  if (kind === 'v2') {
    const story = storySource()
    sourceDigest = normativeDigest(inspectStory(story))
    write(root, STORY, story)
    write(root, PLAN, v2Plan(sourceDigest, 'pending', options.executor === 'agy'))
  } else {
    const epic = v1Epic()
    sourceDigest = digest(epic.slice(epic.indexOf('### Story 9.1:'), epic.indexOf('### Story 9.2:')))
    write(root, EPIC, epic)
    write(root, PLAN, v1Plan(sourceDigest, 'pending'))
  }
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  git(root, 'init', '-q')
  git(root, 'checkout', '-qb', 'main')
  git(root, 'config', 'user.name', 'V4 Fixture')
  git(root, 'config', 'user.email', 'v4-fixture@example.com')
  git(root, 'config', 'core.autocrlf', options.autocrlf ? 'true' : 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  const head = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/feature.txt', 'implemented\n')
  const request = {
    action: 'implement_slice', operation: 'prepare', story_id: '9.1', slice_id: 'A',
    expected_head: head, transaction_id: 'fixture-' + kind, owned_paths: ['src/feature.txt'],
    plan_template: kind === 'v2' ? v2Template(options.executor === 'agy') : v1Template(),
    policy_paths: ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md',
      '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md'],
    recipe_paths: ['.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md'],
    commands: [{ command: 'node --check src/feature.txt', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: ['T-1'], note: 'fixture exact scope' },
    selected_tasks: ['T-1'], selected_acceptance_criteria: ['AC-1'],
    red_green: { applicable: false, reason: 'fixture evidence' }
  }
  return { root, head, request, cleanup }
}

test('implementation metadata cannot remove or alter autopilot authority', () => {
  const f = fixture('v2')
  try {
    const declared = '    scope:\n      paths: [src/feature.txt]\n'
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('    depends_on: []', '    depends_on: []\n' + declared.trimEnd()))
    f.request.plan_template = f.request.plan_template.replace('    depends_on: []', '    depends_on: []\n' + declared.trimEnd())
    git(f.root, 'add', PLAN)
    git(f.root, 'commit', '-qm', 'fixture registry scope')
    f.head = git(f.root, 'rev-parse', 'HEAD')
    f.request.expected_head = f.head
    assert.equal(claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'fixture' }).status, 'APPLIED')
    f.request.lead_generation = 1
    const plan = readFileSync(path.join(f.root, PLAN), 'utf8')
    const authority = ['autopilot:', '  schema_version: 1', '  authorized_at: "2026-10-08T00:00:00.000Z"',
      `  authorized_plan_digest: ${digest(plan)}`, `  authorized_head: ${f.head}`,
      '  budgets:', '    max_slices: 1', '    max_rework_per_slice: 0', '    max_minutes_per_slice: 30',
      '  lead_vendor: codex', '  revoked: false', ''].join('\n')
    write(f.root, PLAN, plan.replace('blockers: []', authority + 'blockers: []'))
    git(f.root, 'add', PLAN)
    git(f.root, 'commit', '-qm', 'fixture autopilot authority')
    f.request.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.notEqual(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AUTOPILOT_AUTHORITY_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

function agyWorker() {
  return {
    executor: 'agy',
    orca: { run_id: 'run-fixture', task_id: 'task-fixture', dispatch_ids: ['ctx_fixture'] },
    attempt: 1,
    contract_sha256: 'a'.repeat(64),
    worker_report_sha256: 'b'.repeat(64),
    lead_vendor: 'codex'
  }
}

function agyFixture() {
  const f = fixture('v2', { executor: 'agy' })
  f.request.worker = agyWorker()
  return f
}

function checkpointRequest(fixture, preview, extra = {}) {
  return { ...fixture.request, operation: 'checkpoint', preview, ...extra }
}

async function maintenanceExecutor() {
  const root = mkdtempSync(path.join(tmpdir(), 'v4-maintenance-executor-'))
  cpSync(path.dirname(fileURLToPath(import.meta.url)), path.join(root, '.agents/scripts'), { recursive: true })
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  for (const relative of ['.agents/docs/v4-artifact-contract.md', '.agents/skills/v4-story-runner/references/recovery.md']) {
    write(root, relative, readFileSync(path.join(sourceRoot, relative)))
  }
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'Executor Fixture')
  git(root, 'config', 'user.email', 'executor@example.com')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'authorized maintenance executor fixture')
  const api = await import(pathToFileURL(path.join(root, '.agents/scripts/v4-action-kernel.mjs')).href)
  const runner = await import(pathToFileURL(path.join(root, '.agents/scripts/v4-story-runner.mjs')).href)
  return { root, api, runner, commit: git(root, 'rev-parse', 'HEAD'), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function protectedKernelState(f, failed) {
  const file = relative => existsSync(path.resolve(f.root, relative)) ? readFileSync(path.resolve(f.root, relative)).toString('base64') : null
  return { head: git(f.root, 'rev-parse', 'HEAD'), index: file('.git/index'), plan: file(PLAN), story: file(STORY),
    product: file('src/feature.txt'), receipt: file(RECEIPT), journal: file(failed.journal_path), lock: file(failed.lock_path) }
}

test('separate committed executor repairs a legacy staged checkpoint only through explicit bounded Runner recovery', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const f = fixture('v2'), executor = await maintenanceExecutor()
  try {
    git(f.root, 'config', 'core.autocrlf', 'true')
    write(f.root, 'src/feature.txt', 'implemented\r\n')
    const original = prepareAction(f.root, f.request)
    // An actual legacy preview binds raw bytes only; reproduce the old
    // EOL mismatch before the journal ever records a checkpoint.
    for (const snapshot of Object.values(original.preview.snapshot)) { delete snapshot.git_blob; delete snapshot.git_context }
    delete original.preview.fingerprint
    original.preview.fingerprint = kernel.actionFingerprint(original.preview)
    const failed = checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED')
    assert.ok(failed.reasons.includes('STAGED_CONTENT_MISMATCH:src/feature.txt'))
    const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
      maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
      fresh_checks: [{ command: 'fresh focused fixture checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
    const before = protectedKernelState(f, failed)
    const ready = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: input.operation, input })
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    assert.deepEqual(protectedKernelState(f, failed), before)
    const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview }
    const result = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: apply.operation, input: apply })
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(result.next_action, { kind: 'verify_slice', target: 'A' })
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.equal(plan.lifecycle_snapshot, 'in-progress')
    assert.equal(plan.human_approval, undefined)
    assert.equal(plan.finalization, undefined)
    assert.equal(JSON.parse(readFileSync(path.join(f.root, RECEIPT))).commands.at(-1).command, 'fresh focused fixture checks')
    assert.equal(executor.runner.runV4Story(f.root, '9.1', { expectedHead: result.metadata_commit, operation: apply.operation, input: apply }).status, 'NOOP')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
  } finally { f.cleanup(); executor.cleanup() }
})

test('staged recovery binds authority, evidence, executor and target without rejection writes', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const executor = await maintenanceExecutor()
  try {
    for (const label of ['Plan', 'Story', 'policy', 'recipe', 'pointer', 'executor', 'evidence', 'authorization', 'cross-worktree', 'fingerprint', 'semantic coverage']) {
      const f = fixture('v2')
      try {
        const original = prepareAction(f.root, f.request)
        const failed = checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
        const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
          maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
          fresh_checks: [{ command: 'fresh checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
        const ready = executor.api.prepareStagedRecovery(f.root, input)
        assert.equal(ready.status, 'READY', JSON.stringify(ready))
        const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview }
        if (label === 'Plan') write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8') + '\nchanged\n')
        if (label === 'Story') write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8') + '\nchanged\n')
        if (label === 'policy') write(f.root, 'AGENTS.md', 'changed policy\n')
        if (label === 'recipe') write(f.root, f.request.recipe_paths[0], 'changed recipe\n')
        if (label === 'pointer') write(f.root, POINTER, JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE', changed: true }))
        if (label === 'executor') apply.executor_commit = '0'.repeat(40)
        if (label === 'evidence') apply.fresh_checks[0].exit_code = 1
        if (label === 'authorization') { delete apply.maintenance_authorization; apply.recovery_authorized = true }
        if (label === 'cross-worktree') apply.recovery_preview = { ...ready.preview, worktree: path.join(f.root, 'foreign') }
        if (label === 'fingerprint') apply.original_preview = { ...original.preview, fingerprint: 'sha256:' + '0'.repeat(64) }
        if (label === 'semantic coverage') apply.semantic_coverage = { status: 'invented' }
        const before = protectedKernelState(f, failed)
        const result = executor.api.applyStagedRecovery(f.root, apply)
        assert.ok(!['CHECKPOINTED', 'NOOP', 'RECOVERY_REQUIRED'].includes(result.status), label + ': ' + JSON.stringify(result))
        assert.deepEqual(protectedKernelState(f, failed), before, label)
      } finally { f.cleanup() }
    }
  } finally { executor.cleanup() }
})

for (const interruption of ['AFTER_WRITE', 'AFTER_FIRST_METADATA_WRITE']) test('bounded Runner retries its own partial metadata ' + interruption + ', rejects foreign metadata and never duplicates commits', async () => {
  assert.equal(typeof kernel.prepareStagedRecovery, 'function')
  const f = fixture('v2'), executor = await maintenanceExecutor()
  try {
    const original = prepareAction(f.root, f.request)
    checkpointImplementation(f.root, checkpointRequest(f, original.preview, { fail_at: 'after-stage' }))
    const input = { ...f.request, operation: 'prepare-staged-recovery', original_preview: original.preview,
      maintenance_authorization: 'V4_LITE_STAGED_RECOVERY', executor_commit: executor.commit,
      fresh_checks: [{ command: 'fresh checks', exit_code: 0, tool: 'Node.js', environment: 'isolated fixture' }] }
    const ready = executor.api.prepareStagedRecovery(f.root, input)
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    const apply = { ...input, operation: 'apply-staged-recovery', recovery_preview: ready.preview, fail_at: interruption }
    const interrupted = executor.runner.runV4Story(f.root, '9.1', { expectedHead: f.head, operation: apply.operation, input: apply })
    assert.equal(interrupted.status, 'RECOVERY_REQUIRED', JSON.stringify(interrupted))
    const currentHead = git(f.root, 'rev-parse', 'HEAD')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '2')
    if (interruption === 'AFTER_FIRST_METADATA_WRITE') {
      assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).next_action.kind, 'implement_slice', 'new receipt is written before Plan')
      assert.equal(existsSync(path.join(f.root, RECEIPT)), true)
    }
    const intended = readFileSync(path.join(f.root, PLAN))
    write(f.root, PLAN, 'foreign Plan\n')
    const before = protectedKernelState(f, interrupted)
    delete apply.fail_at
    const rejected = executor.runner.runV4Story(f.root, '9.1', { expectedHead: currentHead, operation: apply.operation, input: apply })
    assert.ok(!['CHECKPOINTED', 'NOOP', 'RECOVERY_REQUIRED'].includes(rejected.status), JSON.stringify(rejected))
    assert.deepEqual(protectedKernelState(f, interrupted), before)
    write(f.root, PLAN, intended)
    const resumed = executor.runner.runV4Story(f.root, '9.1', { expectedHead: currentHead, operation: apply.operation, input: apply })
    assert.equal(resumed.status, 'CHECKPOINTED', JSON.stringify(resumed))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.equal(executor.runner.runV4Story(f.root, '9.1', { expectedHead: resumed.metadata_commit, operation: apply.operation, input: apply }).status, 'NOOP')
  } finally { f.cleanup(); executor.cleanup() }
})

test('schema v2 commits implementation then Plan plus receipt', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(result.next_action, { kind: 'verify_slice', target: 'A' })
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.checkpoint_commit).split(/\r?\n/), ['src/feature.txt'])
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, RECEIPT].sort())
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPT), 'utf8'))
    assert.equal(plan.slices[0].receipt_refs.implementation.digest, receiptDigest(receipt))
    assert.equal(receipt.checkpoint_commit, result.checkpoint_commit)
    assert.equal(receipt.worker, undefined)
    assert.equal(inspectActionTransaction(f.root, prepared.preview.transaction_id).status, 'COMPLETE')
  } finally { f.cleanup() }
})

test('a CRLF or mixed-EOL plan template commits as LF under core.autocrlf', () => {
  // Windows checkouts with core.autocrlf=true hand the Lead a CRLF Plan; a
  // template mixing its CRLF lines with new LF lines once failed with
  // COMMITTED_METADATA_MISMATCH because Git normalized the committed blob (G5).
  const f = fixture('v2', { autocrlf: true })
  try {
    const lines = f.request.plan_template.split('\n')
    f.request.plan_template = lines.slice(0, 10).join('\r\n') + '\r\n' + lines.slice(10).join('\n')
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    const working = readFileSync(path.join(f.root, PLAN), 'utf8')
    assert.equal(working.includes('\r'), false)
    assert.equal(git(f.root, 'show', `${result.metadata_commit}:${PLAN}`), working.trimEnd())
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    assert.equal(inspectActionTransaction(f.root, prepared.preview.transaction_id).status, 'COMPLETE')
  } finally { f.cleanup() }
})

test('repository checkouts keep V4 Story artifacts LF', () => {
  // The kernel fix covers templates; .gitattributes keeps fresh worktree
  // checkouts LF so Leads never start from a CRLF Plan (G5 F-G5-1).
  const repository = fileURLToPath(new URL('../..', import.meta.url))
  for (const file of [PLAN, SPRINT, RECEIPT]) {
    assert.equal(git(repository, 'check-attr', 'eol', '--', file), `${file}: eol: lf`)
  }
})

test('AGY prepare and checkpoint bind worker evidence and the scope gate', () => {
  const f = agyFixture()
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(prepared.preview.worker.executor, 'agy')
    assert.equal(prepared.preview.scope_gate.status, 'PASS')
    assert.deepEqual(prepared.preview.scope_gate.allowed, ['src/'])
    assert.deepEqual(prepared.preview.scope_gate.changed, ['src/feature.txt'])
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPT), 'utf8'))
    assert.deepEqual(receipt.worker, { ...agyWorker(), scope_gate: prepared.preview.scope_gate })
  } finally { f.cleanup() }
})

test('AGY worker evidence is required, forbidden for lead, and shape-validated', () => {
  const missing = agyFixture()
  try {
    const request = { ...missing.request }
    delete request.worker
    const result = prepareAction(missing.root, request)
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_REQUIRED'))
  } finally { missing.cleanup() }

  const forbidden = fixture('v2')
  try {
    const result = prepareAction(forbidden.root, { ...forbidden.request, worker: agyWorker() })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_FORBIDDEN'))
  } finally { forbidden.cleanup() }

  const invalid = agyFixture()
  try {
    const result = prepareAction(invalid.root, { ...invalid.request, worker: { ...agyWorker(), orca: { ...agyWorker().orca, dispatch_ids: [] } } })
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.ok(result.reasons.includes('WORKER_EVIDENCE_INVALID'))
  } finally { invalid.cleanup() }
})

test('AGY scope gate blocks out-of-scope files, worker commits, and deletions', () => {
  const outside = agyFixture()
  try {
    write(outside.root, 'docs/outside.txt', 'outside\n')
    const result = prepareAction(outside.root, outside.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
    assert.ok(result.scope_gate.violations.some(item => item.path === 'docs/outside.txt'))
  } finally { outside.cleanup() }

  const committed = agyFixture()
  try {
    git(committed.root, 'add', 'src/feature.txt')
    git(committed.root, 'commit', '-qm', 'worker commit')
    const result = prepareAction(committed.root, committed.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
  } finally { committed.cleanup() }

  const deleted = agyFixture()
  try {
    deleted.request.owned_paths = ['src/base.txt', 'src/feature.txt']
    rmSync(path.join(deleted.root, 'src/feature.txt'))
    rmSync(path.join(deleted.root, 'src/base.txt'))
    const result = prepareAction(deleted.root, deleted.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_DELETE_UNSUPPORTED'))
  } finally { deleted.cleanup() }
})

test('AGY scope gate re-check becomes stale when the tree changes after prepare', () => {
  const f = agyFixture()
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    write(f.root, 'docs/outside.txt', 'outside after prepare\n')
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_CHANGED'))
  } finally { f.cleanup() }
})

test('AGY metadata cannot change the execution contract during checkpoint', () => {
  const f = agyFixture()
  try {
    const altered = f.request.plan_template.replace('    executor: agy\n', '')
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'))
  } finally { f.cleanup() }
})

test('checkpoint metadata cannot add committed slice risk', () => {
  const f = fixture('v2')
  try {
    const altered = f.request.plan_template.replace('    depends_on: []', '    depends_on: []\n    risk: \n      level: LOW\n      flags: []')
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('checkpoint metadata cannot change another slice risk', () => {
  const f = fixture('v2')
  try {
    const other = '  - id: B\n    status: pending\n    task_refs: [T-1]\n    depends_on: [A]\n'
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('blockers: []', `${other}blockers: []`))
    git(f.root, 'add', '--', PLAN)
    git(f.root, 'commit', '-qm', 'fixture other pending slice')
    f.request.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const altered = f.request.plan_template.replace('blockers: []', `${other}    risk: \n      level: LOW\n      flags: []\nblockers: []`)
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('schema v1 metadata commit is Plan-only', () => {
  const f = fixture('v1')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/), [PLAN])
    assert.equal(existsSync(path.join(f.root, RECEIPT)), false)
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('stale worktree/policy and wrong identity fail closed', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.notEqual(prepareAction(f.root, { ...f.request, expected_head: '0'.repeat(40) }).status, 'READY')
    write(f.root, 'src/feature.txt', 'changed after preview\n')
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'STALE')
    assert.notEqual(prepareAction(f.root, { ...f.request, action: 'verify_slice' }).status, 'READY')
    assert.notEqual(prepareAction(f.root, { ...f.request, slice_id: 'B' }).status, 'READY')
  } finally { f.cleanup() }
  const dirty = fixture('v2')
  try {
    write(dirty.root, 'src/unknown.txt', 'unknown\n')
    git(dirty.root, 'add', 'src/unknown.txt')
    assert.notEqual(prepareAction(dirty.root, dirty.request).status, 'READY')
  } finally { dirty.cleanup() }
  const active = fixture('v2')
  try {
    write(active.root, POINTER, JSON.stringify({ schemaVersion: 1, activeRunId: 'active', storyId: '9.1', status: 'RUNNING' }) + '\n')
    assert.notEqual(prepareAction(active.root, active.request).status, 'READY')
  } finally { active.cleanup() }
})

test('same-scope lock blocks concurrent invocation', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const identity = transactionIdentity(f.root, { action: 'implement_slice', story_id: '9.1', slice_id: 'A', transaction_id: prepared.preview.transaction_id })
    mkdirSync(path.dirname(identity.lockPath), { recursive: true })
    writeFileSync(identity.lockPath, JSON.stringify({ transaction_id: 'other', scope_key: identity.scopeKey }) + '\n')
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('TRANSACTION_SCOPE_LOCKED'))
  } finally { f.cleanup() }
})

test('metadata cannot smuggle a completion or finalization authority', () => {
  const f = fixture('v2')
  try {
    const result = prepareAction(f.root, { ...f.request, plan_template: f.request.plan_template.replace('kind: verify_slice', 'kind: complete_story') })
    assert.notEqual(result.status, 'READY')
    assert.ok(result.reasons.includes('COMPLETION_AUTHORITY_FORBIDDEN'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('commit-1 failure preserves journal and explicit recovery finishes without replay', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { fail_at: 'after-commit1' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), failed.checkpoint_commit)
    assert.ok(existsSync(failed.lock_path))
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'BLOCKED')
    const recovered = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit
    }))
    assert.equal(recovered.status, 'CHECKPOINTED', JSON.stringify(recovered))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    const noop = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit
    }))
    assert.equal(noop.status, 'NOOP', JSON.stringify(noop))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
  } finally { f.cleanup() }
})

test('metadata write failure preserves the partial Plan and requires recovery', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const failed = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { fail_at: 'after-write' }))
    assert.equal(failed.status, 'RECOVERY_REQUIRED', JSON.stringify(failed))
    assert.ok(existsSync(failed.lock_path))
    assert.ok(existsSync(failed.journal_path))
    assert.ok(git(f.root, 'status', '--porcelain').includes(PLAN))
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'BLOCKED')
  } finally { f.cleanup() }
})

test('mixed approval input cannot authorize implementation', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      approval: { action: 'approve_exact_scope', disclosures_acknowledged: true }
    }))
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})
