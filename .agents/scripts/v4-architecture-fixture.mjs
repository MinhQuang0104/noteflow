import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'

const STORY_ID = '9.1'
const SPRINT_KEY = '9-1-fixture'
const STATE = new Map([
  ['pending', { lifecycle: 'ready-for-dev', execution: 'ready-for-dev', slice: 'pending', action: { kind: 'implement_slice', target: 'A' } }],
  ['checkpointed', { lifecycle: 'in-progress', execution: 'in-progress', slice: 'checkpointed', action: { kind: 'verify_slice', target: 'A' } }],
  ['review', { lifecycle: 'review', execution: 'complete', slice: 'reviewed', action: { kind: 'complete_story', target: 'story' } }],
  ['done', { lifecycle: 'done', execution: 'complete', slice: 'reviewed', action: null }],
])

function runGit(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 30_000,
  })
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim()
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return (result.stdout || '').trim()
}

function write(root, relative, content) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function storySource(state) {
  const status = state === 'review' ? 'review' : state === 'done' ? 'done' : 'ready-for-dev'
  return `---
story_id: "${STORY_ID}"
title: Fixture journal
status: ${status}
---

# Story ${STORY_ID}: Fixture journal

<!-- v4:story:start -->
As a synthetic reader, I can exercise a bounded control-plane fixture.
<!-- v4:story:end -->

<!-- v4:ac:start -->
- AC-1: The synthetic fixture preserves its action boundary.
<!-- v4:ac:end -->

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1]: Exercise the synthetic action boundary.
<!-- v4:tasks:end -->

<!-- v4:readiness:start -->
- result: ready
- dependencies: none
<!-- v4:readiness:end -->

<!-- v4:risk:start -->
- invariant: Synthetic fixture state never grants Human Gate authority.
<!-- v4:risk:end -->
`
}

function epicSource() {
  return `# Synthetic Epic\n\n### Story ${STORY_ID}: Fixture journal\n\nSynthetic source for control-plane tests.\n`
}

function v1Plan(state, epicDigest) {
  const shape = STATE.get(state)
  const action = shape.action
  const actionYaml = action ? `next_action:\n  kind: ${action.kind}\n  target: ${action.target}` : 'next_action: null'
  return `---
schema_version: 1
story_id: "${STORY_ID}"
source:
  path: docs/product/epics.md
  anchor: "#story-91-fixture-journal"
  section_digest: ${epicDigest}
sprint_key: ${SPRINT_KEY}
lifecycle_snapshot: ${shape.lifecycle}
execution_status: ${shape.execution}
current_slice: A
risk:
  level: LOW
slices:
  - id: A
    status: ${shape.slice}
    depends_on: []
blockers: []
unresolved_questions: []
${actionYaml}
---
`
}

function v2Plan(state, storyDigest) {
  const shape = STATE.get(state)
  const action = shape.action
  const actionYaml = action ? `next_action:\n  kind: ${action.kind}\n  target: ${action.target}` : 'next_action: null'
  const approval = state === 'done'
    ? `human_approval:\n  schema_version: 1\n  approver_type: human\n  decision: APPROVED\n  approved_action: complete_story\n  disclosures_acknowledged: true`
    : ''
  return `---
schema_version: 2
story_id: "${STORY_ID}"
story:
  path: docs/story-9-1.md
  normative_digest: ${storyDigest}
sprint_key: ${SPRINT_KEY}
lifecycle_snapshot: ${shape.lifecycle}
execution_status: ${shape.execution}
current_slice: A
slices:
  - id: A
    status: ${shape.slice}
    task_refs: [T-1]
    depends_on: []
blockers: []
unresolved_questions: []
${approval}${approval ? '\n' : ''}${actionYaml}
---
`
}

function writePointer(root) {
  return write(root, '.agent-state/active-run.json', `${JSON.stringify({
    schemaVersion: 1,
    activeRunId: null,
    storyId: null,
    status: 'IDLE',
    updatedAt: '2026-09-28T00:00:00.000Z',
  }, null, 2)}\n`)
}

function initializeRepository(root, options) {
  mkdirSync(root, { recursive: true })
  runGit(root, ['init', '--initial-branch=main'])
  runGit(root, ['config', 'user.email', 'v4-fixture@example.invalid'])
  runGit(root, ['config', 'user.name', 'V4 Fixture'])

  const story = storySource(options.state)
  const epic = epicSource()
  const gitignorePath = write(root, '.gitignore', '.agent-state/\n')
  const storyPath = write(root, 'docs/story-9-1.md', story)
  const epicPath = write(root, 'docs/product/epics.md', epic)
  const storyDigest = normativeDigest(inspectStory(story))
  const epicSection = epic.slice(epic.indexOf(`### Story ${STORY_ID}:`))
  const epicDigest = digest(epicSection)
  const planPath = options.schemaVersion === 2
    ? write(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md', v2Plan(options.state, storyDigest))
    : write(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md', v1Plan(options.state, epicDigest))
  const sprintPath = write(root, '_bmad-output/implementation-artifacts/sprint-status.yaml',
    `development_status:\n  ${SPRINT_KEY}: ${STATE.get(options.state).lifecycle}\n`)
  const sourcePath = write(root, 'src/fixture.txt', 'synthetic fixture source\n')
  writePointer(root)
  runGit(root, ['add', '--', '.gitignore', 'docs/story-9-1.md', 'docs/product/epics.md', planPath.slice(root.length + 1), sprintPath.slice(root.length + 1), sourcePath.slice(root.length + 1), gitignorePath.slice(root.length + 1)])
  runGit(root, ['commit', '-m', 'test(v4): create isolated architecture fixture'])
  return { storyPath, epicPath, planPath, sprintPath, sourcePath, storyDigest, epicDigest }
}

export function createV4Fixture(options = {}) {
  const schemaVersion = options.schemaVersion ?? 2
  const state = options.state ?? 'pending'
  const worktree = options.worktree ?? 'canonical'
  if (![1, 2].includes(schemaVersion)) throw new Error('Unsupported fixture schema version')
  if (!STATE.has(state)) throw new Error(`Unsupported fixture state: ${state}`)
  if (!['canonical', 'linked'].includes(worktree)) throw new Error(`Unsupported fixture worktree: ${worktree}`)

  const base = mkdtempSync(path.join(os.tmpdir(), 'v4-architecture-'))
  const canonicalRoot = path.join(base, 'canonical')
  const files = initializeRepository(canonicalRoot, { schemaVersion, state })
  let root = canonicalRoot
  let linkedRoot = null
  if (worktree === 'linked') {
    linkedRoot = path.join(base, 'linked')
    runGit(canonicalRoot, ['worktree', 'add', '-b', 'fixture-linked', linkedRoot, 'HEAD'])
    writePointer(linkedRoot)
    root = linkedRoot
  }
  const localActiveRun = path.join(root, '.agent-state/active-run.json')
  const canonicalActiveRun = path.join(canonicalRoot, '.agent-state/active-run.json')
  const shape = STATE.get(state)
  const humanApproval = state === 'done' ? { decision: 'APPROVED', approved_action: 'complete_story' } : null

  return {
    root,
    canonicalRoot,
    storyId: STORY_ID,
    schemaVersion,
    state,
    nextAction: shape.action,
    humanApproval,
    canonicalPointer: JSON.parse(readFileSync(canonicalActiveRun, 'utf8')),
    localPointer: JSON.parse(readFileSync(localActiveRun, 'utf8')),
    paths: {
      story: path.join(root, path.relative(canonicalRoot, files.storyPath)),
      epic: path.join(root, path.relative(canonicalRoot, files.epicPath)),
      plan: path.join(root, path.relative(canonicalRoot, files.planPath)),
      sprintStatus: path.join(root, path.relative(canonicalRoot, files.sprintPath)),
      activeRun: localActiveRun,
      source: path.join(root, path.relative(canonicalRoot, files.sourcePath)),
    },
    gitStatus() {
      const output = runGit(root, ['status', '--short'])
      return output ? output.split(/\r?\n/).filter(Boolean) : []
    },
    git(args) {
      return runGit(root, args)
    },
    cleanup() {
      if (linkedRoot) {
        try { runGit(canonicalRoot, ['worktree', 'remove', '--force', linkedRoot]) } catch { /* cleanup is best effort */ }
      }
      rmSync(base, { recursive: true, force: true })
    },
  }
}

export function gitIdentity(root) {
  return {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    root: execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  }
}

export function buildComparisonBundle({
  variant,
  sourceHead,
  architectureFingerprint,
  corpusDigest,
  toolchain,
  sourcePaths = [],
  sourceBindings = [],
  cases = [],
}) {
  if (!['baseline', 'candidate'].includes(variant)) throw new Error('Invalid comparison variant')
  if (!/^[0-9a-f]{40,64}$/.test(sourceHead ?? '')) throw new Error('Invalid comparison source head')
  if (!/^sha256:[0-9a-f]{64}$/.test(architectureFingerprint ?? '')) throw new Error('Invalid architecture fingerprint')
  if (!/^sha256:[0-9a-f]{64}$/.test(corpusDigest ?? '')) throw new Error('Invalid corpus digest')
  return {
    schema_version: 1,
    variant,
    source_head: sourceHead,
    architecture_fingerprint: architectureFingerprint,
    corpus_digest: corpusDigest,
    toolchain: { ...toolchain },
    model: null,
    effort: null,
    source_paths: [...new Set(sourcePaths)].sort(),
    source_bindings: sourceBindings
      .map(item => ({ path: item.path, digest: item.digest, bytes: item.bytes }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    observed_usage: null,
    cases: cases.map(item => ({
      case_id: item.case_id,
      workload_class: item.workload_class,
      input_digest: item.input_digest ?? null,
      trial_id: item.trial_id ?? `${variant}-1`,
      check_results: item.check_results ?? [],
      instruction_bytes: item.instruction_bytes ?? {},
      observed_usage: null,
      correction_cycles: item.correction_cycles ?? 0,
      coverage: item.coverage ?? 'DETERMINISTIC',
      exclusions: item.exclusions ?? ['provider_usage_unavailable'],
    })),
  }
}
