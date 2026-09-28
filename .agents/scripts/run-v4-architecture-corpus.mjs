import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { verifyChangedPaths } from './check-verification.mjs'
import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { checkpointImplementation, prepareAction } from './v4-action-kernel.mjs'

const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const VARIANTS = new Set(['baseline', 'candidate'])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  if (result.error || result.status !== 0) throw new Error(`GIT_FAILED:${args[0]}`)
  return result.stdout.trim()
}

function safeRunId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)
}

function write(root, relative, content) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

function writeImmutable(file, content) {
  mkdirSync(path.dirname(file), { recursive: true })
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === content) return 'NOOP'
    throw new Error(`EVIDENCE_CONFLICT:${path.basename(file)}`)
  }
  writeFileSync(file, content, { flag: 'wx' })
  return 'RECORDED'
}

function corpusFor(root) {
  const file = path.join(root, '.agents/scripts/fixtures/v4-architecture/corpus.json')
  const bytes = readFileSync(file)
  const parsed = JSON.parse(bytes.toString('utf8'))
  if (parsed.schema_version !== 2 || parsed.method !== 'v4-architecture-corpus-v1' || !Array.isArray(parsed.cases) || parsed.cases.length !== 3) throw new Error('CORPUS_LMH_REQUIRED')
  if (new Set(parsed.cases.map(item => item.case_id)).size !== 3) throw new Error('CORPUS_CASE_IDS_REQUIRED')
  return { bytes, parsed }
}

function escalation(root, sourceRoot, risk, verification) {
  const script = path.join(sourceRoot, '.agents/scripts/check-escalation.mjs')
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ risk, verification, judgmentFlags: [] }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status === null || !result.stdout?.trim()) throw new Error('ESCALATION_EXECUTION_ERROR')
  try { return JSON.parse(result.stdout.trim()) } catch { throw new Error('ESCALATION_OUTPUT_INVALID') }
}

function verificationFixture(root) {
  const featureId = 'corpus-feature'
  const recipePath = '.agents/verification/corpus-feature.json'
  const mapPath = '.agents/features/corpus-feature.json'
  const registryPath = '.agents/verification/registry.json'
  write(root, mapPath, `${JSON.stringify({ schema_version: 2, id: featureId, covered_paths: ['src/fixture.txt'], anchor_blobs: { 'src/fixture.txt': '0'.repeat(40) } }, null, 2)}\n`)
  const recipe = {
    schema_version: 1,
    featureId,
    featureMap: mapPath,
    cwd: '.',
    checks: [
      { id: 'map', classification: 'map', required: true, argv: [process.execPath, '-e', "process.stdout.write('VALID')"], cwd: '.', environment: { name: 'corpus-fixture' }, source: { kind: 'recipe', path: recipePath }, referenced_paths: ['src/fixture.txt'] },
      { id: 'behavior', classification: 'behavioral', required: true, argv: [process.execPath, '-e', 'process.exit(0)'], cwd: '.', environment: { name: 'corpus-fixture' }, source: { kind: 'recipe', path: recipePath }, referenced_paths: ['src/fixture.txt'] },
    ],
  }
  write(root, recipePath, `${JSON.stringify(recipe, null, 2)}\n`)
  write(root, registryPath, `${JSON.stringify({ schema_version: 1, recipes: [{ featureId, path: recipePath, enabled: true }] }, null, 2)}\n`)
  return { featureId }
}

function runMappedCase(sourceRoot, caseRecord) {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try {
    const storyBefore = readFileSync(fixture.paths.story, 'utf8')
    const planBefore = readFileSync(fixture.paths.plan, 'utf8')
    const pointerBefore = readFileSync(fixture.paths.activeRun, 'utf8')
    const feature = verificationFixture(fixture.root)
    const changedPaths = caseRecord.input.changed_paths
    const verification = verifyChangedPaths(fixture.root, feature.featureId, changedPaths, { subject: { kind: 'fixture', value: 'corpus' } })
    const escalationResult = escalation(fixture.root, sourceRoot, caseRecord.risk, verification)
    const actual = {
      canonical_status: verification.status,
      complete: verification.complete,
      unmatched_paths: verification.unmatchedPaths ?? [],
      checks: verification.checks ?? [],
      escalation_decision: escalationResult.decision,
      escalation_reasons: escalationResult.reasons,
    }
    const expected = caseRecord.workload_class === 'L'
      ? [
          ['canonical-pass', verification.status === 'PASS'],
          ['required-checks-executed', verification.checks?.length === 2 && verification.checks.every(item => item.status === 'PASS')],
          ['low-risk-no-review', escalationResult.decision === 'NO_REVIEW'],
        ]
      : [
          ['raw-incomplete-preserved', verification.status === 'INCOMPLETE'],
          ['unmapped-path-preserved', actual.unmatched_paths.includes('src/unmapped.txt')],
          ['medium-risk-review-required', escalationResult.decision === 'REVIEW_REQUIRED'],
        ]
    const assertions = expected.map(([id, pass]) => ({ id, status: pass ? 'PASS' : 'FAIL', observed: pass }))
    assertFixtureUnchanged(fixture, storyBefore, planBefore, pointerBefore)
    return { actual, assertions, checkResults: verification.checks ?? [], required: 2, cwd: fixture.root, argv: ['verifyChangedPaths', feature.featureId, ...changedPaths] }
  } finally {
    fixture.cleanup()
  }
}

function actionFiles(root) {
  const files = {
    'AGENTS.md': '# corpus fixture policy\n',
    'CLAUDE.md': '# corpus fixture provider policy\n',
    '.agents/routing/task-router.md': '# corpus fixture routing\n',
    '.agents/context/control-plane.md': '# corpus fixture control plane\n',
    '.agents/context/context-routing.md': '# corpus fixture context\n',
    '.agents/skills/v4-story-runner/SKILL.md': '# corpus fixture runner\n',
    '.agents/skills/v4-story-runner/actions/implement-slice.md': '# corpus fixture implementation action\n',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md': '# corpus fixture techniques\n',
  }
  for (const [relative, content] of Object.entries(files)) write(root, relative, content)
  const paths = Object.keys(files)
  return paths
}

function actionTemplate(fixture) {
  const story = readFileSync(fixture.paths.story, 'utf8')
  const storyDigest = normativeDigest(inspectStory(story))
  return [
    '---', 'schema_version: 2', `story_id: "${fixture.storyId}"`, 'story:', '  path: docs/story-9-1.md', `  normative_digest: ${storyDigest}`,
    'sprint_key: 9-1-fixture', 'lifecycle_snapshot: in-progress', 'execution_status: in-progress', 'current_slice: A',
    'slices:', '  - id: A', '    status: checkpointed', '    task_refs: [T-1]', '    depends_on: []',
    '    baseline_commit: {{BASELINE_COMMIT}}', '    checkpoint_commit: {{CHECKPOINT_COMMIT}}', '    subject_digest: {{SUBJECT_DIGEST}}',
    '    changed_paths_sha256: {{CHANGED_PATHS_SHA256}}', '    receipt_refs:', '      implementation:',
    '        path: _bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json', '        digest: {{RECEIPT_DIGEST}}',
    'blockers: []', 'unresolved_questions: []', 'next_action:', '  kind: verify_slice', '  target: A', '---', '',
  ].join('\n')
}

function actionFixture() {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  write(fixture.root, '_bmad-output/implementation-artifacts/sprint-status.yaml', 'development_status:\n  9-1-fixture: in-progress\n')
  const initialPlan = readFileSync(fixture.paths.plan, 'utf8')
    .replace('lifecycle_snapshot: ready-for-dev', 'lifecycle_snapshot: in-progress')
    .replace('execution_status: ready-for-dev', 'execution_status: in-progress')
  write(fixture.root, path.relative(fixture.root, fixture.paths.plan), initialPlan)
  const files = actionFiles(fixture.root)
  fixture.git(['add', '--', ...files, path.relative(fixture.root, fixture.paths.plan), path.relative(fixture.root, fixture.paths.sprintStatus)])
  fixture.git(['commit', '-m', 'test(v4): add corpus action fixture'])
  write(fixture.root, 'src/fixture.txt', 'implemented by corpus\n')
  const expectedHead = fixture.git(['rev-parse', 'HEAD'])
  const policyPaths = ['AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/control-plane.md', '.agents/context/context-routing.md', '.agents/skills/v4-story-runner/SKILL.md']
  const recipePaths = ['.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md']
  const request = {
    action: 'implement_slice', operation: 'prepare', story_id: fixture.storyId, slice_id: 'A', expected_head: expectedHead,
    transaction_id: `corpus-${Math.random().toString(16).slice(2)}`, owned_paths: ['src/fixture.txt'], plan_template: actionTemplate(fixture),
    policy_paths: policyPaths, recipe_paths: recipePaths,
    commands: [{ command: 'node --check src/fixture.txt', exit_code: 0, tool: 'Node.js', environment: 'fixture' }],
    semantic_coverage: { status: 'MEASURED', task_refs: ['T-1'], note: 'corpus exact scope' }, selected_tasks: ['T-1'], selected_acceptance_criteria: ['AC-1'], red_green: { applicable: false, reason: 'corpus fixture' },
  }
  return { fixture, request }
}

function runHighCase() {
  const stale = actionFixture()
  try {
    const prepared = prepareAction(stale.fixture.root, stale.request)
    if (prepared.status !== 'READY') throw new Error(`H_STALE_PREPARE:${JSON.stringify(prepared)}`)
    write(stale.fixture.root, 'AGENTS.md', '# stale policy after preview\n')
    const staleResult = checkpointImplementation(stale.fixture.root, { ...stale.request, operation: 'checkpoint', preview: prepared.preview })
    const staleActual = { status: staleResult.status, reasons: staleResult.reasons ?? [] }
    const staleAssertions = [
      { id: 'stale-preview-rejected', status: staleResult.status === 'STALE' ? 'PASS' : 'FAIL', observed: staleResult.status },
      { id: 'stale-drift-left-uncommitted', status: stale.fixture.git(['rev-parse', 'HEAD']) === prepared.preview.expected_head ? 'PASS' : 'FAIL', observed: stale.fixture.git(['rev-parse', 'HEAD']) },
    ]
    const staleCheckResults = [
      { id: 'stale-preview-rejected', status: staleResult.status === 'STALE' ? 'PASS' : 'FAIL', exit_code: staleResult.status === 'STALE' ? 0 : 1, evidence_ref: digestText(stableJson(staleResult)) },
      { id: 'stale-preview-no-mutation', status: stale.fixture.git(['rev-parse', 'HEAD']) === prepared.preview.expected_head ? 'PASS' : 'FAIL', exit_code: stale.fixture.git(['rev-parse', 'HEAD']) === prepared.preview.expected_head ? 0 : 1, evidence_ref: digestText(stableJson({ head: stale.fixture.git(['rev-parse', 'HEAD']), expected: prepared.preview.expected_head })) },
    ]
    return { staleActual, staleAssertions, staleCheckResults }
  } finally {
    stale.fixture.cleanup()
  }
}

function runRecoveryCase() {
  const recovery = actionFixture()
  try {
    const prepared = prepareAction(recovery.fixture.root, recovery.request)
    if (prepared.status !== 'READY') throw new Error(`H_RECOVERY_PREPARE:${JSON.stringify(prepared)}`)
    const failed = checkpointImplementation(recovery.fixture.root, { ...recovery.request, operation: 'checkpoint', preview: prepared.preview, fail_at: 'after-commit1' })
    const recovered = checkpointImplementation(recovery.fixture.root, { ...recovery.request, operation: 'checkpoint', preview: prepared.preview, recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit })
    const replay = checkpointImplementation(recovery.fixture.root, { ...recovery.request, operation: 'checkpoint', preview: prepared.preview, recovery_authorized: true, recovery_checkpoint: failed.checkpoint_commit })
    const actual = { initial_status: failed.status, initial_reasons: failed.reasons ?? [], recovered_status: recovered.status, recovered_reasons: recovered.reasons ?? [], replay_status: replay.status, replay_reasons: replay.reasons ?? [], checkpoint_commit: failed.checkpoint_commit, metadata_commit: recovered.metadata_commit }
    const assertions = [
      { id: 'interruption-requires-recovery', status: failed.status === 'RECOVERY_REQUIRED' ? 'PASS' : 'FAIL', observed: failed.status },
      { id: 'authorized-recovery-completes', status: recovered.status === 'CHECKPOINTED' ? 'PASS' : 'FAIL', observed: recovered.status },
      { id: 'recovery-replay-is-noop', status: replay.status === 'NOOP' ? 'PASS' : 'FAIL', observed: replay.status },
    ]
    return { actual, assertions, checkResults: [
      { id: 'recovery-interruption', status: failed.status, exit_code: null, evidence_ref: digestText(stableJson(failed)) },
      { id: 'recovery-authorized', status: recovered.status === 'CHECKPOINTED' ? 'PASS' : 'FAIL', exit_code: recovered.status === 'CHECKPOINTED' ? 0 : 1, evidence_ref: digestText(stableJson(recovered)) },
    ], required: 2, cwd: recovery.fixture.root, argv: ['prepareAction', 'checkpointImplementation', 'recovery'],
    }
  } finally {
    recovery.fixture.cleanup()
  }
}

function assertFixtureUnchanged(fixture, story, plan, pointer) {
  if (readFileSync(fixture.paths.story, 'utf8') !== story || readFileSync(fixture.paths.plan, 'utf8') !== plan || readFileSync(fixture.paths.activeRun, 'utf8') !== pointer) throw new Error('CORPUS_FIXTURE_LIFECYCLE_MUTATION')
}

function runCase(sourceRoot, caseRecord, sourceHead, runnerDigest) {
  const started = new Date().toISOString()
  const inputDigest = digestText(stableJson(caseRecord.input))
  let execution
  if (caseRecord.case_id === 'H-stale-recovery') {
    const stale = runHighCase()
    const recovery = runRecoveryCase()
    const actual = { stale: stale.staleActual, recovery: recovery.actual }
    const assertions = [...stale.staleAssertions, ...recovery.assertions]
    execution = { actual, assertions, checkResults: [...stale.staleCheckResults, ...recovery.checkResults], required: stale.staleCheckResults.length + recovery.required, cwd: sourceRoot, argv: ['runHighCase', 'stale', 'recovery'] }
  } else {
    const mapped = runMappedCase(sourceRoot, caseRecord)
    execution = { actual: mapped.actual, assertions: mapped.assertions, checkResults: mapped.checkResults.map(item => ({ id: item.id, status: item.status, exit_code: item.exitCode ?? null, evidence_ref: digestText(stableJson(item)) })), required: mapped.required, cwd: mapped.cwd, argv: mapped.argv }
  }
  const ended = new Date().toISOString()
  return {
    case_id: caseRecord.case_id,
    workload_class: caseRecord.workload_class,
    input_digest: inputDigest,
    trial_id: `${caseRecord.case_id}-${sourceHead.slice(0, 12)}`,
    source_head: sourceHead,
    runner_digest: runnerDigest,
    toolchain: { node: process.version, platform: process.platform, arch: process.arch },
    started_at: started,
    ended_at: ended,
    cwd: execution.cwd,
    argv: execution.argv,
    actual_observations: execution.actual,
    assertions: execution.assertions,
    required_check_coverage: { status: execution.checkResults.length >= execution.required ? 'COMPLETE' : 'INCOMPLETE', required: execution.required, observed: execution.checkResults.length },
    check_results: execution.checkResults,
    instruction_bytes: {},
    observed_usage: null,
    correction_cycles: null,
    coverage: execution.assertions.every(item => item.status === 'PASS') && execution.checkResults.length >= execution.required ? 'COMPLETE_VERIFIED' : 'INCOMPLETE',
    exclusions: ['provider_usage_unavailable', 'real_story_quality_unmeasured'],
  }
}

export function runArchitectureCorpus({ sourceRoot, expectedHead, variant, runId, evidenceRoot }) {
  sourceRoot = path.resolve(sourceRoot)
  evidenceRoot = path.resolve(evidenceRoot)
  if (!VARIANTS.has(variant)) throw new Error('INVALID_VARIANT')
  if (!SHA.test(expectedHead ?? '') || git(sourceRoot, ['rev-parse', 'HEAD']) !== expectedHead) throw new Error('SOURCE_HEAD_MISMATCH')
  if (!safeRunId(runId)) throw new Error('INVALID_RUN_ID')
  if (variant === 'baseline' && !existsSync(path.join(sourceRoot, '.agents/scripts/v4-action-kernel.mjs'))) throw new Error('BASELINE_RUNNER_UNSUPPORTED')
  const corpus = corpusFor(sourceRoot)
  const runnerDigest = digestBytes(readFileSync(fileURLToPath(import.meta.url)))
  const cases = corpus.parsed.cases.map(item => runCase(sourceRoot, item, expectedHead, runnerDigest))
  const evidenceIndex = []
  for (const item of cases) {
    const relative = path.join('cases', `${item.case_id}.json`).replaceAll('\\', '/')
    const artifact = { ...item, evidence_refs: undefined }
    delete artifact.evidence_refs
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`
    const file = path.join(evidenceRoot, relative)
    writeImmutable(file, serialized)
    const digest = digestBytes(readFileSync(file))
    item.evidence_refs = [{ kind: 'raw-result', ref: relative, digest }]
    evidenceIndex.push({ kind: 'raw-result', ref: relative, digest })
  }
  const result = {
    run_id: runId,
    variant,
    source_head: expectedHead,
    runner_digest: runnerDigest,
    corpus_digest: digestBytes(corpus.bytes),
    corpus_method: corpus.parsed.method,
    evidence_root: evidenceRoot,
    cases,
    evidence_index: evidenceIndex,
    status: cases.every(item => item.coverage === 'COMPLETE_VERIFIED') ? 'VERIFIED' : 'INCONCLUSIVE',
  }
  writeImmutable(path.join(evidenceRoot, 'corpus-run.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error('USAGE: --source-root ROOT --expected-head SHA --variant baseline|candidate --run-id ID --evidence-root DIRECTORY')
    values[flag.slice(2).replaceAll('-', '_')] = value
  }
  if (!values.source_root || !values.expected_head || !values.variant || !values.run_id || !values.evidence_root) throw new Error('USAGE: --source-root ROOT --expected-head SHA --variant baseline|candidate --run-id ID --evidence-root DIRECTORY')
  return values
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const result = runArchitectureCorpus({ sourceRoot: args.source_root, expectedHead: args.expected_head, variant: args.variant, runId: args.run_id, evidenceRoot: args.evidence_root })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', reasons: [error.message] })}\n`)
    process.exitCode = 2
  }
}
