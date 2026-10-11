import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import * as kernel from './v4-action-kernel.mjs'

import { git, write, digest } from './v4-test-helpers.mjs'

export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const STORY = 'docs/story.md'
export const EPIC = 'docs/product/epics.md'
export const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export const POINTER = '.agent-state/active-run.json'
export const RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json'

export function storySource() {
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

export function v2Plan(storyDigest, status, agy = false) {
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

export function v1Epic() {
  return '# Epic\n\n### Story 9.1: Fixture\n\n**Acceptance Criteria:**\n\nCheckpoint the fixture.\n\n### Story 9.2: Next\n'
}

export function v1Plan(sourceDigest, status) {
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

export function v2Template(agy = false) {
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

export function v1Template() {
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

export function fixture(kind, options = {}) {
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

export function agyWorker() {
  return {
    executor: 'agy',
    orca: { run_id: 'run-fixture', task_id: 'task-fixture', dispatch_ids: ['ctx_fixture'] },
    attempt: 1,
    contract_sha256: 'a'.repeat(64),
    worker_report_sha256: 'b'.repeat(64),
    lead_vendor: 'codex'
  }
}

export function agyFixture() {
  const f = fixture('v2', { executor: 'agy' })
  f.request.worker = agyWorker()
  return f
}

export function checkpointRequest(fixture, preview, extra = {}) {
  return { ...fixture.request, operation: 'checkpoint', preview, ...extra }
}

export async function maintenanceExecutor() {
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

export function protectedKernelState(f, failed) {
  const file = relative => existsSync(path.resolve(f.root, relative)) ? readFileSync(path.resolve(f.root, relative)).toString('base64') : null
  return { head: git(f.root, 'rev-parse', 'HEAD'), index: file('.git/index'), plan: file(PLAN), story: file(STORY),
    product: file('src/feature.txt'), receipt: file(RECEIPT), journal: file(failed.journal_path), lock: file(failed.lock_path) }
}
