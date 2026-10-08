import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { frontmatter } from './check-story-plan.mjs'
import { compileActionContext } from './compile-v4-context.mjs'

const SHA = /^[0-9a-f]{40,64}$/i
const CONTRACT_SCHEMA = 'worker-contract-v1'
const TEMPLATE_PATH = '.agents/templates/worker-contract.md'
const WORKER_EVIDENCE_ROOT = '.agent-state/v4-auto'
const EXIT = { READY: 0, BLOCKED: 3, INVALID: 4, ERROR: 5 }

class InvalidContractInput extends Error {}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function lf(value) {
  return String(value).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

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

function gitRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  })
  if (result.error || result.status !== 0) throw new Error('GIT_ROOT_UNAVAILABLE')
  return path.resolve(result.stdout.trim())
}

function textFlag(value, name) {
  if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new InvalidContractInput(`${name}_REQUIRED`)
  return value
}

function parseAttempt(value) {
  if (!/^[1-9][0-9]*$/.test(value ?? '')) throw new InvalidContractInput('ATTEMPT_INVALID')
  const attempt = Number(value)
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new InvalidContractInput('ATTEMPT_INVALID')
  return attempt
}

export function parseArguments(argv) {
  if (argv[0] !== 'build' || !/^\d+\.\d+$/.test(argv[1] ?? '') || !argv[2]) {
    throw new InvalidContractInput('USAGE: build <story-id> <slice-id> --expected-head <sha> --attempt <n> --run-id <id> --task-id <id> --preamble-file <path> --out <path> [--correction-of <path> --finding <id>]')
  }
  const values = {
    storyId: argv[1],
    sliceId: argv[2],
    expectedHead: null,
    attempt: null,
    runId: null,
    taskId: null,
    preambleFile: null,
    out: null,
    correctionOf: null,
    findings: [],
  }
  const flags = new Set(['--expected-head', '--attempt', '--run-id', '--task-id', '--preamble-file', '--out', '--correction-of', '--finding'])
  for (let index = 3; index < argv.length; index++) {
    const flag = argv[index]
    if (!flags.has(flag)) throw new InvalidContractInput('UNKNOWN_FLAG')
    const value = argv[++index]
    if (!value) throw new InvalidContractInput(`${flag.slice(2).replaceAll('-', '_').toUpperCase()}_REQUIRED`)
    if (flag === '--expected-head') {
      if (values.expectedHead !== null || !SHA.test(value)) throw new InvalidContractInput('EXPECTED_HEAD_INVALID')
      values.expectedHead = value
    } else if (flag === '--attempt') {
      if (values.attempt !== null) throw new InvalidContractInput('ATTEMPT_DUPLICATE')
      values.attempt = parseAttempt(value)
    } else if (flag === '--run-id') {
      if (values.runId !== null) throw new InvalidContractInput('RUN_ID_DUPLICATE')
      values.runId = textFlag(value, 'RUN_ID')
    } else if (flag === '--task-id') {
      if (values.taskId !== null) throw new InvalidContractInput('TASK_ID_DUPLICATE')
      values.taskId = textFlag(value, 'TASK_ID')
    } else if (flag === '--preamble-file') {
      if (values.preambleFile !== null) throw new InvalidContractInput('PREAMBLE_FILE_DUPLICATE')
      values.preambleFile = textFlag(value, 'PREAMBLE_FILE')
    } else if (flag === '--out') {
      if (values.out !== null) throw new InvalidContractInput('OUT_DUPLICATE')
      values.out = textFlag(value, 'OUT')
    } else if (flag === '--correction-of') {
      if (values.correctionOf !== null) throw new InvalidContractInput('CORRECTION_BASELINE_DUPLICATE')
      values.correctionOf = textFlag(value, 'CORRECTION_BASELINE')
    } else if (flag === '--finding') {
      values.findings.push(textFlag(value, 'FINDING'))
    }
  }
  if (values.expectedHead === null) throw new InvalidContractInput('EXPECTED_HEAD_REQUIRED')
  if (values.attempt === null) throw new InvalidContractInput('ATTEMPT_REQUIRED')
  if (values.runId === null) throw new InvalidContractInput('RUN_ID_REQUIRED')
  if (values.taskId === null) throw new InvalidContractInput('TASK_ID_REQUIRED')
  if (values.preambleFile === null) throw new InvalidContractInput('PREAMBLE_FILE_REQUIRED')
  if (values.out === null) throw new InvalidContractInput('OUT_REQUIRED')
  if (values.findings.length && values.correctionOf === null) throw new InvalidContractInput('CORRECTION_BASELINE_REQUIRED')
  if (values.correctionOf !== null && !values.findings.length) throw new InvalidContractInput('CORRECTION_FINDINGS_REQUIRED')
  return values
}

function blocked(reason, options) {
  return {
    schema: CONTRACT_SCHEMA,
    status: 'BLOCKED',
    reasons: [reason],
    contract_path: null,
    contract_sha256: null,
    allow: [],
    base: options.expectedHead,
    attempt: options.attempt,
  }
}

function invalid(reason, options = {}) {
  return {
    schema: CONTRACT_SCHEMA,
    status: 'INVALID',
    reasons: [reason],
    contract_path: null,
    contract_sha256: null,
    allow: [],
    base: options.expectedHead ?? null,
    attempt: options.attempt ?? null,
  }
}

function storySlice(root, storyId, sliceId) {
  const planPath = path.join(root, `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`)
  if (!existsSync(planPath)) throw new InvalidContractInput('PLAN_MISSING')
  const plan = frontmatter(readFileSync(planPath, 'utf8'))
  const slice = plan.slices?.find(item => item?.id === sliceId)
  if (!slice) throw new InvalidContractInput('SLICE_MISSING')
  return { planPath, slice }
}

function storyPath(projection) {
  return projection.source_bindings.find(binding => binding.role === 'story')?.path ?? null
}

function requirementLines(projection) {
  const tasks = projection.requirements.tasks.map(task =>
    `- ${task.id}: ${task.text} (ACs: ${task.ac_refs.join(', ')})`)
  const acs = projection.requirements.acceptance_criteria.map(ac => `- ${ac.id}: ${ac.text}`)
  return [...tasks, ...acs].join('\n')
}

// The worker reads only its Story and the AGENTS.md worker role. The Lead's
// runner, action and recovery documents are never worker context: they would
// invite the worker to run Lead-only steps such as prepare or checkpoint.
function contextLines(source) {
  return [
    `${source} (Story; the ACs/Tasks above are its bounded excerpt)`,
    'AGENTS.md: "Worker role" section only; do not open Lead runner, action or policy documents.',
  ].join('\n')
}

function checkText(item) {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object' && typeof item.command === 'string') return item.command
  return stableJson(item)
}

function checkLines(projection) {
  return projection.known_scope.checks.items.map(item => `- ${checkText(item)}`).join('\n')
}

function referenceLines(projection) {
  const references = projection.requirements.declared_references ?? []
  const risk = projection.requirements.story_risk?.raw ?? ''
  const lines = references.map(item => `- ${item.kind}: ${item.ref}`)
  if (risk) lines.push(`- Story risk/invariants: ${risk.replaceAll('\n', ' ')}`)
  return lines.length ? lines.join('\n') : '- None projected.'
}

function workerRootPath(options) {
  return `${WORKER_EVIDENCE_ROOT}/workers/${options.taskId}`
}

function workerReportPath(options) {
  return `${workerRootPath(options)}/report-attempt-${options.attempt}.json`
}

function renderContract(template, projection, options) {
  const source = storyPath(projection)
  if (!source) throw new InvalidContractInput('STORY_SOURCE_NOT_PROJECTED')
  const scope = projection.known_scope.file_scope.paths
  if (!Array.isArray(scope) || !scope.length) throw new InvalidContractInput('SCOPE_UNKNOWN')
  const checks = projection.known_scope.checks.items
  if (!Array.isArray(checks) || !checks.length) throw new InvalidContractInput('CHECKS_UNKNOWN')

  // Worker evidence lives under the gitignored .agent-state/ tree so it never
  // enters the scope gate, the dirty-path check, or the implementation commit.
  const workerRoot = workerRootPath(options)
  const reportPath = workerReportPath(options)
  const artifactPath = `${workerRoot}/artifacts`
  const values = new Map([
    ['<task-id>', options.taskId],
    ['<run-id>', options.runId],
    ['<positive integer>', String(options.attempt)],
    ['<N>', String(options.attempt)],
    ['<durable Task ID and bounded scope; survives terminal/session replacement>', `Task ${options.taskId}; Story ${projection.identity.story_id}; Slice ${projection.identity.slice_id}`],
    ['<generation>', 'not applicable (V4 Lead)'],
    ['<execution mode / runtime / Run / Task / Dispatch-if-any / worker-or-terminal / worktree IDs>', `V3.2 Antigravity loop; Run ${options.runId}; Task ${options.taskId}; Dispatch IDs supplied by Orca; isolated worker worktree`],
    ['<bounded outcome>', `Implement the projected Story ${projection.identity.story_id} slice ${projection.identity.slice_id} and stop after worker_done.`],
    ['<repo-relative path>', source],
    ['<pinned Git commit>', options.expectedHead],
    ['<optional ref>', 'none'],
    ['<IDs and precise section references; bounded excerpts only>', requirementLines(projection)],
    ['<minimal paths/sections>', contextLines(source)],
    ['<approved decision references and invariants>', referenceLines(projection)],
    ['<scope exclusions; no policy/requirement/integration changes>', 'No policy, Story/Plan requirement, lifecycle, receipt, integration, or authority-file changes. Keep all writes within the expected scope.'],
    ['<worktree; repo-relative exact files or `dir/` entries, one per\n  line, passed verbatim as `--allow` to `.agents/scripts/check-worker-scope.mjs`>', scope.join('\n')],
    ['<full commit SHA the scope gate compares against>', options.expectedHead],
    ['<yes|no>', 'no'],
    ['<existing exact commands and working directories; each\n  dry-run by the Lead at the dispatch base, with its observed exit code>', checkLines(projection)],
    ['<ambiguity, scope conflict, missing dependency, repeated failure>', 'Ambiguity, scope conflict, missing dependency, local permission/trust/sign-in prompt, or repeated verification failure.'],
    ['<assigned verified worktree path>', 'this worker worktree root (repo-relative paths below; gitignored, outside the expected scope)'],
    ['<canonical run directory>', WORKER_EVIDENCE_ROOT],
    ['<assigned-path>', reportPath],
    ['<worker artifact directory>', artifactPath],
    ['<attempt-specific log paths>', `${workerRoot}/logs/attempt-${options.attempt}`],
    ['<file-digest>', 'SHA256_HEX_OF_THAT_REPORT_FILE'],
    // The shared template's trailer points V3 workers at V3 policy; a V4 AGY
    // worker follows only the AGENTS.md worker role.
    ['Follow root AGENTS.md and V3 policy.', 'Follow only the AGENTS.md "Worker role" section.'],
  ])
  if (options.correctionOf !== null) {
    values.set('<previous report path/SHA-256/reviewed\n  diffIdentity; stable review finding IDs; delta manifest location>', `${options.correctionOf}; findings: ${options.findings.join(', ')}`)
  } else {
    values.set('<previous report path/SHA-256/reviewed\n  diffIdentity; stable review finding IDs; delta manifest location>', 'None; initial attempt.')
  }
  values.set('<baseCommit; observed head; existing exact diffIdentity convention;\n  changed-file manifest location including untracked content/deletions>', `Base ${options.expectedHead}; Lead records observed head and exact diffIdentity; manifest includes tracked, staged, unstaged, untracked, and deleted paths.`)

  let rendered = lf(template)
  for (const [placeholder, replacement] of values) rendered = rendered.replaceAll(placeholder, lf(replacement))
  const unresolved = [...new Set([...rendered.matchAll(/<[^>\r\n]+>/g)].map(match => match[0]))]
  if (unresolved.length) throw new InvalidContractInput(`CONTRACT_TEMPLATE_PLACEHOLDER_UNFILLED:${unresolved.join(',')}`)
  return rendered
}

export function buildWorkerContract(root, options) {
  const context = compileActionContext(root, options.storyId, 'implement_slice', options.sliceId, {
    expectedHead: options.expectedHead,
  })
  if (context.status !== 'READY') return blocked('CONTEXT_NOT_READY', options)
  const projection = context.projection
  if (projection.known_scope.file_scope.status !== 'KNOWN') return blocked('SCOPE_UNKNOWN', options)
  if (projection.known_scope.checks.status !== 'KNOWN') return blocked('CHECKS_UNKNOWN', options)
  const { slice } = storySlice(root, options.storyId, options.sliceId)
  if ((slice.executor ?? 'lead') !== 'agy') return blocked('NOT_AGY_SLICE', options)

  const preamblePath = path.resolve(process.cwd(), options.preambleFile)
  const outPath = path.resolve(process.cwd(), options.out)
  const preamble = lf(readFileSync(preamblePath, 'utf8'))
  const template = readFileSync(path.join(root, TEMPLATE_PATH), 'utf8')
  const rendered = renderContract(template, projection, options)
  const bytes = Buffer.from(`${preamble}\n\n${rendered}`, 'utf8')
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, bytes)
  return {
    schema: CONTRACT_SCHEMA,
    status: 'READY',
    contract_path: outPath,
    contract_sha256: sha256(bytes),
    report_path: workerReportPath(options),
    allow: [...projection.known_scope.file_scope.paths],
    base: options.expectedHead,
    attempt: options.attempt,
  }
}

function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let options
  try { options = parseArguments(argv) }
  catch (error) { return invalid(error.message) }
  try {
    const root = gitRoot(cwd)
    return buildWorkerContract(root, options)
  } catch (error) {
    if (error instanceof InvalidContractInput) return invalid(error.message, options)
    return { schema: CONTRACT_SCHEMA, status: 'ERROR', reasons: [error.message], contract_path: null, contract_sha256: null, allow: [], base: options.expectedHead, attempt: options.attempt }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = main()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = EXIT[result.status] ?? EXIT.ERROR
}
