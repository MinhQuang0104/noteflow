import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { buildWorkerContract } from './build-worker-contract.mjs'
import { compileActionContext } from './compile-v4-context.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { inspectScope } from './check-worker-scope.mjs'
import { validateReceipt } from './check-artifact-contract.mjs'
import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'

const CONTRACT = '.orca-contract/contract.md'
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json'
const BUILDER = path.resolve('.agents/scripts/build-worker-contract.mjs')
const CONTRACT_TEMPLATE = readFileSync('.agents/templates/worker-contract.md', 'utf8')
const PRODUCT_PATHS = ['src/a.js', 'src/a.test.js']
const POLICY_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/routing/task-router.md',
  '.agents/context/control-plane.md',
  '.agents/context/context-routing.md',
  '.agents/skills/v4-story-runner/SKILL.md',
]
const RECIPE_PATHS = [
  '.agents/skills/v4-story-runner/actions/implement-slice.md',
  '.agents/skills/v4-story-runner/references/implementation-techniques.md',
]

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
  return file
}

function seedContext(fixture) {
  for (const relative of [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/routing/task-router.md',
    '.agents/context/context-routing.md',
    '.agents/context/control-plane.md',
    '.agents/skills/v4-story-runner/SKILL.md',
    '.agents/docs/v4-artifact-contract.md',
    '.agents/skills/v4-story-runner/actions/implement-slice.md',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md',
    '.agents/skills/v4-story-runner/references/agy-executor.md',
    '.agents/skills/v4-story-runner/references/recovery.md',
  ]) write(fixture.root, relative, `fixture instruction: ${relative}\n`)
  write(fixture.root, '.agents/templates/worker-contract.md', CONTRACT_TEMPLATE)
}

function configureAgyPlan(fixture) {
  const plan = readFileSync(fixture.paths.plan, 'utf8')
    .replace('lifecycle_snapshot: ready-for-dev', 'lifecycle_snapshot: in-progress')
    .replace('execution_status: ready-for-dev', 'execution_status: in-progress')
    .replace('current_slice: A\n', 'current_slice: A\nrisk:\n  level: LOW\n')
    .replace(
      '    depends_on: []\n',
      '    depends_on: []\n    executor: agy\n    scope:\n      paths: [src/]\n    verification_obligations: [node --test src/a.test.js]\n',
    )
  writeFileSync(fixture.paths.plan, plan)
  const sprint = readFileSync(fixture.paths.sprintStatus, 'utf8').replace('ready-for-dev', 'in-progress')
  writeFileSync(fixture.paths.sprintStatus, sprint)
  fixture.git(['add', '.'])
  fixture.git(['commit', '-qm', 'test(v4): establish AGY implementation baseline'])
  return fixture.git(['rev-parse', 'HEAD'])
}

function implementationTemplate() {
  return [
    '---',
    'schema_version: 2',
    'story_id: "9.1"',
    'story:',
    '  path: docs/story-9-1.md',
    '  normative_digest: {{STORY_NORMATIVE_DIGEST}}',
    'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress',
    'execution_status: in-progress',
    'current_slice: A',
    'risk:',
    '  level: LOW',
    'slices:',
    '  - id: A',
    '    status: checkpointed',
    '    task_refs: [T-1]',
    '    depends_on: []',
    '    executor: agy',
    '    scope:',
    '      paths: [src/]',
    '    verification_obligations: [node --test src/a.test.js]',
    '    baseline_commit: {{BASELINE_COMMIT}}',
    '    checkpoint_commit: {{CHECKPOINT_COMMIT}}',
    '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}',
    '    receipt_refs:',
    '      implementation:',
    `        path: ${RECEIPT}`,
    '        digest: {{RECEIPT_DIGEST}}',
    'blockers: []',
    'unresolved_questions: []',
    'next_action:',
    '  kind: verify_slice',
    '  target: A',
    '---',
    '',
  ].join('\n')
}

function runBuilder(fixture, baseline) {
  const preamble = write(fixture.root, 'preamble.txt', 'V4 E2E preamble\n')
  const output = path.join(fixture.root, CONTRACT)
  const args = [
    'build', '9.1', 'A',
    '--expected-head', baseline,
    '--attempt', '1',
    '--run-id', 'run-v4-e2e',
    '--task-id', 'task-v4-e2e',
    '--preamble-file', 'preamble.txt',
    '--out', CONTRACT,
  ]
  const result = spawnSync(process.execPath, [BUILDER, ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const json = JSON.parse(result.stdout)
  assert.equal(json.status, 'READY', JSON.stringify(json))
  assert.equal(json.base, baseline)
  assert.deepEqual(json.allow, ['src/'])
  rmSync(preamble)
  return { json, output }
}

function writeWorkerFiles(fixture) {
  write(fixture.root, 'src/a.js', 'export const answer = 42\n')
  write(fixture.root, 'src/a.test.js', [
    "import test from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { answer } from './a.js'",
    '',
    "test('AGY E2E worker output is verifiable', () => assert.equal(answer, 42))",
    '',
  ].join('\n'))
  const verification = spawnSync(process.execPath, ['--test', 'src/a.test.js'], {
    cwd: fixture.root,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(verification.status, 0, `${verification.stderr}\n${verification.stdout}`)
}

function requestFor(fixture, baseline, contractSha, transactionId) {
  return {
    action: 'implement_slice',
    operation: 'prepare',
    story_id: fixture.storyId,
    slice_id: 'A',
    expected_head: baseline,
    transaction_id: transactionId,
    owned_paths: PRODUCT_PATHS,
    plan_template: implementationTemplate(),
    policy_paths: POLICY_PATHS,
    recipe_paths: RECIPE_PATHS,
    commands: [{ command: 'node --test src/a.test.js', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: ['T-1'], note: 'AGY E2E exact scope' },
    selected_tasks: ['T-1'],
    selected_acceptance_criteria: ['AC-1'],
    red_green: { applicable: false, reason: 'fixture evidence' },
    worker: {
      executor: 'agy',
      orca: { run_id: 'run-v4-e2e', task_id: 'task-v4-e2e', dispatch_ids: ['ctx_v4_e2e'] },
      attempt: 1,
      contract_sha256: contractSha,
      worker_report_sha256: 'b'.repeat(64),
      lead_vendor: 'codex',
    },
  }
}

function setupScenario(transactionId) {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  seedContext(fixture)
  const baseline = configureAgyPlan(fixture)
  const built = runBuilder(fixture, baseline)
  const request = requestFor(fixture, baseline, built.json.contract_sha256, transactionId)
  return { fixture, baseline, built, request }
}

test('AGY executor completes the bounded worker-to-checkpoint flow', () => {
  const scenario = setupScenario('agy-e2e-happy')
  try {
    const initialPlan = validateStoryPlan(scenario.fixture.root, scenario.fixture.storyId)
    assert.equal(initialPlan.status, 'READY', JSON.stringify(initialPlan))
    assert.deepEqual(initialPlan.nextAction, { kind: 'implement_slice', target: 'A' })
    const context = compileActionContext(scenario.fixture.root, scenario.fixture.storyId, 'implement_slice', 'A', {
      expectedHead: scenario.baseline,
    })
    assert.equal(context.status, 'READY', JSON.stringify(context))
    assert.deepEqual(context.projection.identity.validated_next_action, { kind: 'implement_slice', target: 'A' })

    writeWorkerFiles(scenario.fixture)
    // The worker writes its report where the contract assigns it. That path is
    // gitignored, so neither the scope gate nor prepare may see it.
    const reportPath = scenario.built.json.report_path
    assert.equal(reportPath, '.agent-state/v4-auto/workers/task-v4-e2e/report-attempt-1.json')
    assert.ok(readFileSync(scenario.built.output, 'utf8').includes(`--report-path ${reportPath}`))
    const reportBytes = '{"schemaVersion":1,"status":"DONE"}\n'
    write(scenario.fixture.root, reportPath, reportBytes)
    scenario.request.worker.worker_report_sha256 = createHash('sha256').update(reportBytes).digest('hex')
    const gate = inspectScope(scenario.fixture.root, scenario.baseline, ['src/'], {
      forbidCommits: true,
      contractSha256: scenario.built.json.contract_sha256,
    })
    assert.equal(gate.status, 'PASS', JSON.stringify(gate))
    assert.equal(gate.violations.length, 0)
    assert.ok(!gate.changed.some(item => item.path.startsWith('.agent-state/')))
    rmSync(scenario.built.output)

    const prepared = prepareAction(scenario.fixture.root, scenario.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(prepared.preview.executor, 'agy')
    assert.equal(prepared.preview.scope_gate.status, 'PASS')

    const checkpointed = checkpointImplementation(scenario.fixture.root, {
      ...scenario.request,
      operation: 'checkpoint',
      preview: prepared.preview,
    })
    assert.equal(checkpointed.status, 'CHECKPOINTED', JSON.stringify(checkpointed))
    assert.deepEqual(checkpointed.next_action, { kind: 'verify_slice', target: 'A' })
    assert.equal(scenario.fixture.git(['rev-list', '--count', `${scenario.baseline}..HEAD`]), '2')

    const plan = frontmatter(readFileSync(scenario.fixture.paths.plan, 'utf8'))
    assert.deepEqual(plan.next_action, { kind: 'verify_slice', target: 'A' })
    assert.equal(plan.slices[0].executor, 'agy')
    assert.equal(plan.slices[0].scope.paths[0], 'src/')
    assert.equal(plan.slices[0].verification_obligations[0], 'node --test src/a.test.js')
    assert.equal(plan.slices[0].receipt_refs.implementation.path, RECEIPT)
    assert.deepEqual(validateReceipt(scenario.fixture.root, plan, 'A', 'implementation'), [])
    const receipt = JSON.parse(readFileSync(path.join(scenario.fixture.root, RECEIPT), 'utf8'))
    assert.equal(receipt.worker.executor, 'agy')
    assert.equal(receipt.worker.scope_gate.status, 'PASS')
    assert.equal(receipt.worker.scope_gate.base, scenario.baseline)
    assert.deepEqual(receipt.worker.scope_gate.allowed, ['src/'])
    assert.deepEqual(validateStoryPlan(scenario.fixture.root, scenario.fixture.storyId).status, 'READY')
  } finally { scenario.fixture.cleanup() }
})

test('AGY scope gate blocks an out-of-scope worker change', () => {
  const scenario = setupScenario('agy-e2e-outside')
  try {
    writeWorkerFiles(scenario.fixture)
    write(scenario.fixture.root, 'docs/outside.txt', 'out of scope\n')
    const result = prepareAction(scenario.fixture.root, scenario.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
    assert.ok(result.scope_gate.violations.some(item => item.path === 'docs/outside.txt'))
  } finally { scenario.fixture.cleanup() }
})

test('AGY scope gate blocks a worker commit since the dispatch base', () => {
  const scenario = setupScenario('agy-e2e-commit')
  try {
    writeWorkerFiles(scenario.fixture)
    scenario.fixture.git(['add', '--', ...PRODUCT_PATHS])
    scenario.fixture.git(['commit', '-qm', 'worker commit must be rejected'])
    const result = prepareAction(scenario.fixture.root, scenario.request)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AGY_SCOPE_GATE_FAIL'))
    assert.ok(result.scope_gate.violations.some(item => item.reason === 'COMMITS_FORBIDDEN'))
  } finally { scenario.fixture.cleanup() }
})

test('AGY prepare rejects a delivered contract left in the worktree', () => {
  const scenario = setupScenario('agy-e2e-contract-left')
  try {
    writeWorkerFiles(scenario.fixture)
    const gate = inspectScope(scenario.fixture.root, scenario.baseline, ['src/'], {
      forbidCommits: true,
      contractSha256: scenario.built.json.contract_sha256,
    })
    assert.equal(gate.status, 'PASS', JSON.stringify(gate))
    assert.equal(existsSync(scenario.built.output), true)
    const result = prepareAction(scenario.fixture.root, scenario.request)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('DIRTY_SCOPE_MISMATCH'))
  } finally { scenario.fixture.cleanup() }
})
