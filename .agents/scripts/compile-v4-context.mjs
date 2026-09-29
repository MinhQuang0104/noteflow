import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { separatedStory } from './v4-separated-plan.mjs'
import { recordContextDelivered } from './v4-observations.mjs'
import { selectExperience } from './v4-experience.mjs'

const SHA = /^[0-9a-f]{40,64}$/i
const ACTIONS = new Map([
  ['start_story', {
    target: 'story',
    document: '.agents/skills/v4-story-runner/actions/start-story.md',
    lazy: [],
    stop: [
      'Stop after the one durable start-story transaction and the explicit implement_slice successor is persisted.',
      'Do not execute implement_slice or alter a second Story action in this invocation.',
    ],
  }],
  ['reconcile_lifecycle', {
    target: 'story',
    document: '.agents/skills/v4-story-runner/actions/reconcile-lifecycle.md',
    lazy: ['.agents/skills/v4-story-runner/references/recovery.md'],
    stop: [
      'Stop after the bounded lifecycle reconciliation transaction or a recovery-required result.',
      'Do not implement a slice or infer missing execution evidence.',
    ],
  }],
  ['implement_slice', {
    target: 'slice',
    document: '.agents/skills/v4-story-runner/actions/implement-slice.md',
    lazy: [
      '.agents/skills/v4-story-runner/references/implementation-techniques.md',
      '.agents/skills/v4-story-runner/references/recovery.md',
    ],
    stop: [
      'Stop after the implementation checkpoint and metadata persistence with verify_slice for the same slice as successor.',
      'Do not execute verification, advance lifecycle, or implement another slice in this invocation.',
    ],
  }],
  ['verify_slice', {
    target: 'slice',
    document: '.agents/skills/v4-story-runner/actions/verify-slice.md',
    lazy: ['.agents/skills/v4-story-runner/references/recovery.md'],
    stop: [
      'Stop after fresh verification/review evidence and one explicit successor are durably recorded.',
      'Do not fix product code, execute the successor, or change the Human Gate in this invocation.',
    ],
  }],
  ['finalize_story', {
    target: 'story',
    document: '.agents/skills/v4-story-runner/actions/finalize-story.md',
    lazy: ['.agents/skills/v4-story-runner/references/recovery.md'],
    stop: [
      'Stop at review and the explicit Human Gate after finalization evidence is committed.',
      'Do not infer approval or perform review-to-done completion.',
    ],
  }],
  ['complete_story', {
    target: 'story',
    document: '.agents/skills/v4-story-runner/actions/complete-story.md',
    lazy: ['.agents/skills/v4-story-runner/references/recovery.md'],
    stop: [
      'Stop after the separately authorized exact-scope human approval transaction reaches done.',
      'Generic continuation, stale approval, or missing approval is never sufficient authority.',
    ],
  }],
])

const COMMON_INSTRUCTION_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/routing/task-router.md',
  '.agents/context/context-routing.md',
  '.agents/context/control-plane.md',
  '.agents/skills/v4-story-runner/SKILL.md',
  '.agents/docs/v4-artifact-contract.md',
]

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function digestValue(value) {
  return digestBytes(stableJson(value))
}

function normalizedPath(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function result(status, reasons = [], extra = {}) {
  return {
    status,
    ready: status === 'READY',
    valid: !['INVALID', 'ERROR'].includes(status),
    projection: null,
    reasons: [...new Set(reasons)],
    ...extra,
  }
}

function git(root, args) {
  const command = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  })
  if (command.error || command.status === null) throw new Error('GIT_UNAVAILABLE')
  return command
}

function gitText(root, args, failure) {
  const command = git(root, args)
  if (command.status !== 0) throw new Error(failure)
  return command.stdout.trim()
}

function safeRelative(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) return null
  const absolute = path.resolve(root, relative)
  if (!normalizedPath(absolute).startsWith(`${normalizedPath(root)}${path.sep}`)) return null
  return absolute
}

function relativePath(root, absolute) {
  return path.relative(root, absolute).replaceAll('\\', '/')
}

function readSource(root, relative) {
  const file = safeRelative(root, relative)
  if (!file || !existsSync(file) || lstatSync(file).isSymbolicLink()) throw new Error(`SOURCE_MISSING:${relative}`)
  const text = readFileSync(file, 'utf8')
  return { file, text, bytes: Buffer.byteLength(text, 'utf8') }
}

function sourceBinding(root, relative, role, loaded = true, extra = {}) {
  const source = readSource(root, relative)
  return {
    path: relative,
    role,
    digest: digestBytes(source.text),
    bytes: source.bytes,
    loaded,
    ...extra,
  }
}

function canonicalPointer(root) {
  const porcelain = gitText(root, ['worktree', 'list', '--porcelain'], 'CANONICAL_WORKTREE_UNAVAILABLE')
  const canonical = /^worktree (.+)$/m.exec(porcelain)?.[1]?.trim()
  if (!canonical) throw new Error('CANONICAL_WORKTREE_UNAVAILABLE')
  const pointerPath = path.join(path.resolve(canonical), '.agent-state', 'active-run.json')
  if (!existsSync(pointerPath)) throw new Error('V3_POINTER_MISSING')
  let pointer
  try { pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) } catch { throw new Error('V3_POINTER_INVALID') }
  if (pointer?.schemaVersion !== 1 || pointer.status !== 'IDLE' ||
      pointer.activeRunId !== null || pointer.storyId !== null) throw new Error('V3_POINTER_NOT_IDLE')
  return { path: pointerPath, pointer }
}

function storyAction(action) {
  return ['start_story', 'reconcile_lifecycle', 'finalize_story', 'complete_story'].includes(action)
}

function selectSlice(plan, action, sliceId) {
  const requiresSlice = !storyAction(action)
  const selected = sliceId ?? (requiresSlice ? plan.current_slice : null)
  if (requiresSlice && (!selected || selected !== plan.current_slice)) throw new Error('SLICE_MISMATCH')
  if (!requiresSlice && sliceId !== undefined && sliceId !== null) throw new Error('UNEXPECTED_SLICE')
  if (selected && !plan.slices?.some(slice => slice?.id === selected)) throw new Error('SLICE_MISMATCH')
  return selected
}

function dependencyDisposition(plan, dependencyId) {
  const dependency = plan.slices.find(item => item.id === dependencyId)
  if (dependency.status === 'reviewed') {
    return { id: dependencyId, status: dependency.status, eligible: true, reason: 'REVIEWED' }
  }
  if (dependency.status !== 'verified') {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'STATUS_NOT_REVIEWED_OR_VERIFIED' }
  }
  if (dependency.verification?.progression_eligible !== true) {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'PROGRESSION_NOT_ELIGIBLE' }
  }
  if (dependency.review?.required === true) {
    return { id: dependencyId, status: dependency.status, eligible: false, reason: 'REQUIRED_REVIEW_REMAINS' }
  }
  return { id: dependencyId, status: dependency.status, eligible: true, reason: 'VERIFIED_PROGRESSION_ELIGIBLE' }
}

function knownField(value, name, sourcePath, property) {
  if (Array.isArray(value) && value.length) {
    return { status: 'KNOWN', [property]: [...value], source: { path: sourcePath, field: name } }
  }
  return {
    status: 'UNKNOWN',
    [property]: null,
    source: null,
    reason: `${name} is not declared by the validated artifact; no allowlist is inferred from memory.`,
  }
}

function actionSources(root, action) {
  const spec = ACTIONS.get(action)
  const lazy = spec.lazy.map(relative => ({
    path: relative,
    trigger: relative.endsWith('recovery.md')
      ? 'Load only when a partial, locked, or recovery-required transaction is observed.'
      : 'Load only when the selected action requires its compact implementation technique or review recipe.',
  }))
  const paths = [...COMMON_INSTRUCTION_PATHS, spec.document]
  const bindings = paths.map(relative => sourceBinding(root, relative, relative === spec.document ? 'action' : 'instruction'))
  const lazyBindings = lazy.map(item => sourceBinding(root, item.path, 'lazy-reference', false))
  return { spec, bindings: [...bindings, ...lazyBindings], lazy }
}

function projectionStory(root, plan, storyId) {
  if (plan.schema_version !== 2) {
    return {
      story: null,
      storyPath: plan.source?.path ?? null,
      reason: 'SCHEMA_V1_NORMATIVE_PROJECTION_REQUIRES_EXPLICIT_TASK_AND_AC_FIELDS',
    }
  }
  const separated = separatedStory(root, plan)
  if (separated.error) return { story: null, storyPath: plan.story?.path ?? null, reason: separated.error }
  if (separated.story.story_id !== storyId) return { story: null, storyPath: plan.story.path, reason: 'STORY_ID_MISMATCH' }
  if (normativeDigest(separated.story) !== plan.story.normative_digest) {
    return { story: null, storyPath: plan.story.path, reason: 'STORY_NORMATIVE_DIGEST_MISMATCH' }
  }
  return { story: separated.story, storyPath: plan.story.path, reason: null }
}

function selectedRequirements(story, slice, storyPath) {
  const taskRefs = Array.isArray(slice?.task_refs) ? slice.task_refs : []
  if (!taskRefs.length) throw new Error('MISSING_TASK_REFS')
  const tasks = taskRefs.map(id => story.tasks.find(task => task.id === id))
  if (tasks.some(task => !task)) throw new Error('UNKNOWN_TASK_REF')
  const acIds = [...new Set(tasks.flatMap(task => task.ac_refs))]
  const acceptanceCriteria = acIds.map(id => story.ac.find(ac => ac.id === id))
  if (acceptanceCriteria.some(ac => !ac)) throw new Error('UNKNOWN_AC_REF')
  const source = { path: storyPath, sections: ['ac', 'tasks', 'risk', 'references'] }
  return {
    tasks: tasks.map(task => ({ id: task.id, ac_refs: [...task.ac_refs], text: task.text })),
    acceptance_criteria: acceptanceCriteria.map(ac => ({ id: ac.id, text: ac.text })),
    story_risk: { raw: story.risk ?? '', source },
    declared_references: story.references.map(reference => ({ ...reference, source })),
  }
}

function knownScope(slice, plan, planPath) {
  const scope = slice?.scope
  const subject = slice?.verification?.subject
  const filePaths = Array.isArray(scope?.paths) ? scope.paths :
    Array.isArray(subject?.changed_paths) ? subject.changed_paths : null
  const consumers = Array.isArray(slice?.consumers) ? slice.consumers :
    Array.isArray(plan.consumers) ? plan.consumers : null
  const checks = Array.isArray(slice?.verification_obligations) ? slice.verification_obligations :
    Array.isArray(plan.checks) ? plan.checks : null
  return {
    file_scope: knownField(filePaths, 'file_scope', planPath, 'paths'),
    consumers: knownField(consumers, 'consumers', planPath, 'items'),
    checks: knownField(checks, 'checks', planPath, 'items'),
  }
}

function buildProjection(root, storyId, action, selectedSliceId, expectedHead, plan, planPath, story, storyPath, pointer, sourceInfo, experienceAdvice = []) {
  const spec = sourceInfo.spec
  const slice = selectedSliceId ? plan.slices.find(item => item.id === selectedSliceId) : null
  const requirements = story && slice
    ? selectedRequirements(story, slice, storyPath)
    : {
        tasks: [],
        acceptance_criteria: [],
        story_risk: { raw: plan.risk ?? '', source: { path: planPath, sections: ['risk'] } },
        declared_references: [],
      }
  const dependencyIds = Array.isArray(slice?.depends_on) ? slice.depends_on : []
  const dependencyDispositions = dependencyIds.map(id => dependencyDisposition(plan, id))
  const planSource = sourceBinding(root, planPath, 'plan', true, { normative_digest: plan.story?.normative_digest ?? null })
  const storySource = story
    ? sourceBinding(root, storyPath, 'story', true, { normative_digest: normativeDigest(story) })
    : null
  const sourceBindings = [
    ...sourceInfo.bindings,
    planSource,
    ...(storySource ? [storySource] : []),
  ].sort((left, right) => left.path.localeCompare(right.path))
  const actionInstructionPaths = [
    '.agents/skills/v4-story-runner/SKILL.md',
    spec.document,
  ]
  const outputContractRef = {
    path: '.agents/docs/v4-artifact-contract.md',
    section: 'Story/Plan, receipt, and exact-scope evidence contract',
  }
  const projectionBase = {
    schema_version: 1,
    identity: {
      story_id: storyId,
      action,
      slice_id: selectedSliceId,
      validated_next_action: { ...plan.next_action },
      expected_head: expectedHead,
      actual_head: expectedHead,
      canonical_pointer: {
        status: pointer.status,
        path: relativePath(root, pointer.path),
      },
    },
    source_bindings: sourceBindings,
    requirements,
    dependency_dispositions: dependencyDispositions,
    blockers: Array.isArray(plan.blockers) ? plan.blockers.map(item => ({ ...item })) : [],
    questions: Array.isArray(plan.unresolved_questions) ? plan.unresolved_questions.map(item => ({ ...item })) : [],
    action_instruction_paths: actionInstructionPaths,
    lazy_reference_paths: sourceInfo.lazy,
    known_scope: knownScope(slice, plan, planPath),
    output_contract_ref: outputContractRef,
    stop_conditions: [...spec.stop],
    experience_advice: experienceAdvice,
  }
  const projectionBytes = Buffer.byteLength(stableJson(projectionBase), 'utf8')
  const instructionBytes = sourceInfo.bindings
    .filter(binding => binding.loaded)
    .reduce((total, binding) => total + binding.bytes, 0)
  return {
    ...projectionBase,
    projection_fingerprint: digestValue(projectionBase),
    byte_counters: {
      projection_bytes: projectionBytes,
      instruction_dependency_bytes: instructionBytes,
      loaded_instruction_paths: sourceInfo.bindings.filter(binding => binding.loaded).map(binding => binding.path).sort(),
      lazy_reference_bytes: 0,
    },
  }
}

export function compileActionContext(root, storyId, action, sliceId, options = {}) {
  try {
    if (!/^[0-9]+\.[0-9]+$/.test(storyId ?? '') || !ACTIONS.has(action)) {
      return result('INVALID', ['INVALID_INPUT'])
    }
    const expectedHead = options.expectedHead
    if (!SHA.test(expectedHead ?? '')) return result('INVALID', ['EXPECTED_HEAD_REQUIRED'])
    root = path.resolve(root)
    const actualRoot = path.resolve(gitText(root, ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
    if (normalizedPath(actualRoot) !== normalizedPath(root)) return result('INVALID', ['ROOT_NOT_TOPLEVEL'])
    const actualHead = gitText(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE')
    if (actualHead !== expectedHead) return result('STALE', ['EXPECTED_HEAD_MISMATCH'], { actualHead, expectedHead })
    const pointer = canonicalPointer(root)
    const actionInfo = ACTIONS.get(action)
    const planPath = `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
    const planSource = readSource(root, planPath)
    let plan
    try { plan = frontmatter(planSource.text) } catch { return result('INVALID', ['INVALID_PLAN_FRONTMATTER']) }
    const validation = validateStoryPlan(root, storyId)
    if (validation.status !== 'READY') {
      const status = validation.status === 'STALE' ? 'STALE' : 'BLOCKED'
      return result(status, validation.reasons.length ? validation.reasons : ['PLAN_NOT_READY'], {
        validation,
        actualHead,
        expectedHead,
      })
    }
    if (!plan.next_action || plan.next_action.kind !== action) {
      return result('BLOCKED', ['ACTION_MISMATCH'], { actualHead, expectedHead, validation })
    }
    const selectedSliceId = selectSlice(plan, action, sliceId)
    const expectedTarget = storyAction(action) ? 'story' : selectedSliceId
    if (plan.next_action.target !== expectedTarget) {
      return result('BLOCKED', ['ACTION_TARGET_MISMATCH'], { actualHead, expectedHead, validation })
    }
    const storyProjection = projectionStory(root, plan, storyId)
    if (storyProjection.reason) {
      const status = storyProjection.reason.includes('DIGEST') ? 'STALE' : 'INVALID'
      return result(status, [storyProjection.reason], { actualHead, expectedHead, validation })
    }
    const sourceInfo = actionSources(root, action)
    const experienceSelection = selectExperience(root, {
      story_id: storyId,
      slice_id: selectedSliceId,
      action,
      risk: storyProjection.story?.risk ?? null,
      current_head: actualHead,
    })
    const projection = buildProjection(
      root,
      storyId,
      action,
      selectedSliceId,
      expectedHead,
      plan,
      planPath,
      storyProjection.story,
      storyProjection.storyPath,
      pointer,
      sourceInfo,
      experienceSelection.status === 'OK' ? experienceSelection.entries : [],
    )
    const observation = recordContextDelivered(root, {
      story_id: storyId,
      slice_id: selectedSliceId,
      action,
      invocation_id: options.invocationId ?? null,
      session_id: options.sessionId ?? null,
      attempt_id: options.attemptId ?? projection.projection_fingerprint,
      payload: {
        projection_fingerprint: projection.projection_fingerprint,
        byte_counters: projection.byte_counters,
        source_head: actualHead,
      },
      provenance: { kind: 'context_compiler', source: 'compile-v4-context', projection: projection.projection_fingerprint },
    })
    return result('READY', [], { projection, actualHead, expectedHead, validation, observation })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const blocked = ['V3_POINTER_NOT_IDLE', 'V3_POINTER_MISSING', 'V3_POINTER_INVALID', 'SLICE_MISMATCH', 'UNEXPECTED_SLICE'].includes(reason)
    const stale = reason === 'EXPECTED_HEAD_MISMATCH' || reason.includes('DIGEST_MISMATCH')
    return result(stale ? 'STALE' : blocked ? 'BLOCKED' : 'INVALID', [reason])
  }
}

function cliArgs(argv) {
  if (argv[0] !== 'check' || !/^\d+\.\d+$/.test(argv[1] ?? '')) throw new Error('USAGE: check <story-id> --action <action> [--slice <slice>] --expected-head <sha>')
  const values = { storyId: argv[1], action: null, slice: undefined, expectedHead: null }
  for (let index = 2; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value) throw new Error('USAGE: check <story-id> --action <action> [--slice <slice>] --expected-head <sha>')
    if (flag === '--action') values.action = value
    else if (flag === '--slice') values.slice = value
    else if (flag === '--expected-head') values.expectedHead = value
    else throw new Error('USAGE: check <story-id> --action <action> [--slice <slice>] --expected-head <sha>')
  }
  if (!values.action || !values.expectedHead) throw new Error('USAGE: check <story-id> --action <action> [--slice <slice>] --expected-head <sha>')
  return values
}

const CODES = { READY: 0, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 }

function main() {
  const input = cliArgs(process.argv.slice(2))
  const root = path.resolve(gitText(process.cwd(), ['rev-parse', '--show-toplevel'], 'GIT_ROOT_UNAVAILABLE'))
  return compileActionContext(root, input.storyId, input.action, input.slice, { expectedHead: input.expectedHead })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const output = main()
    process.stdout.write(`${JSON.stringify(output)}\n`)
    process.exitCode = CODES[output.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', ready: false, valid: false, projection: null, reasons: [error.message] })}\n`)
    process.exitCode = CODES.ERROR
  }
}
