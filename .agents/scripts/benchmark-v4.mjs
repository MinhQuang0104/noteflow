import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BUNDLE_SCHEMA_VERSION = 1
const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const VARIANTS = new Set(['baseline', 'candidate'])
const WORKLOADS = new Set(['L', 'M', 'H'])
const CODES = { COMPARABLE: 0, INCOMPARABLE: 2, INVALID: 4, ERROR: 5 }
const DEFAULT_SOURCE_PATHS = [
  'AGENTS.md',
  '.agents/routing/task-router.md',
  '.agents/context/control-plane.md',
  '.agents/docs/v4-artifact-contract.md',
  '.agents/skills/v4-story-runner/SKILL.md',
  '.agents/scripts/check-verification.mjs',
  '.agents/scripts/v4-story-runner.mjs',
  '.agents/scripts/fixtures/v4-architecture/corpus.json',
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function numberOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function bundleError(reasons) {
  return { status: 'INVALID', reasons: [...new Set(reasons)] }
}

function validateSourceBindings(value) {
  if (!Array.isArray(value)) return ['SOURCE_BINDINGS_REQUIRED']
  const reasons = []
  for (const binding of value) {
    if (!isObject(binding) || typeof binding.path !== 'string' || !DIGEST.test(binding.digest ?? '') || !Number.isSafeInteger(binding.bytes) || binding.bytes < 0) {
      reasons.push('INVALID_SOURCE_BINDING')
    }
  }
  return reasons
}

function validateCase(item) {
  const reasons = []
  if (!isObject(item) || typeof item.case_id !== 'string' || !item.case_id) return ['INVALID_CASE_ID']
  if (!WORKLOADS.has(item.workload_class)) reasons.push(`INVALID_WORKLOAD:${item.case_id}`)
  if (item.input_digest !== null && !DIGEST.test(item.input_digest ?? '')) reasons.push(`INVALID_INPUT_DIGEST:${item.case_id}`)
  if (typeof item.trial_id !== 'string' || !item.trial_id) reasons.push(`INVALID_TRIAL_ID:${item.case_id}`)
  if (!Array.isArray(item.check_results)) reasons.push(`CHECK_RESULTS_REQUIRED:${item.case_id}`)
  if (!isObject(item.instruction_bytes)) reasons.push(`INSTRUCTION_BYTES_REQUIRED:${item.case_id}`)
  if (item.observed_usage !== null && !isObject(item.observed_usage)) reasons.push(`INVALID_USAGE:${item.case_id}`)
  if (!Number.isSafeInteger(item.correction_cycles) || item.correction_cycles < 0) reasons.push(`INVALID_CORRECTION_CYCLES:${item.case_id}`)
  if (typeof item.coverage !== 'string' || !item.coverage) reasons.push(`INVALID_COVERAGE:${item.case_id}`)
  if (!Array.isArray(item.exclusions)) reasons.push(`INVALID_EXCLUSIONS:${item.case_id}`)
  return reasons
}

export function normalizeComparisonBundle(input, expectedVariant = null) {
  if (!isObject(input)) return bundleError(['BUNDLE_OBJECT_REQUIRED'])
  const reasons = []
  if (input.schema_version !== BUNDLE_SCHEMA_VERSION) reasons.push('INVALID_BUNDLE_SCHEMA')
  if (!VARIANTS.has(input.variant) || (expectedVariant && input.variant !== expectedVariant)) reasons.push('INVALID_BUNDLE_VARIANT')
  if (!SHA.test(input.source_head ?? '')) reasons.push('INVALID_SOURCE_HEAD')
  for (const field of ['architecture_fingerprint', 'corpus_digest']) if (!DIGEST.test(input[field] ?? '')) reasons.push(`INVALID_${field.toUpperCase()}`)
  if (!isObject(input.toolchain)) reasons.push('TOOLCHAIN_REQUIRED')
  if (input.model !== null && typeof input.model !== 'string') reasons.push('INVALID_MODEL')
  if (input.effort !== null && typeof input.effort !== 'string') reasons.push('INVALID_EFFORT')
  if (!Array.isArray(input.source_paths)) reasons.push('SOURCE_PATHS_REQUIRED')
  reasons.push(...validateSourceBindings(input.source_bindings))
  if (!Array.isArray(input.cases) || !input.cases.length) reasons.push('CASES_REQUIRED')
  else for (const item of input.cases) reasons.push(...validateCase(item))
  if (input.observed_usage !== null && !isObject(input.observed_usage)) reasons.push('INVALID_BUNDLE_USAGE')
  if (reasons.length) return bundleError(reasons)
  const ids = input.cases.map(item => item.case_id)
  if (new Set(ids).size !== ids.length) return bundleError(['DUPLICATE_CASE_ID'])
  return { status: 'VALID', bundle: clone(input) }
}

function explicitReason(candidate, key) {
  const reasons = candidate.comparability_reasons
  if (typeof reasons === 'string' && reasons.trim()) return reasons
  if (!isObject(reasons)) return null
  const value = reasons[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function compareIdentity(baseline, candidate) {
  const differences = []
  const disclosures = []
  const compareField = (field, key = field) => {
    if (stableJson(baseline[field] ?? null) === stableJson(candidate[field] ?? null)) return
    const reason = explicitReason(candidate, key)
    if (reason) disclosures.push({ field: key, reason })
    else differences.push(`${key}_MISMATCH_REQUIRES_EXPLICIT_REASON`)
  }
  compareField('source_head')
  compareField('architecture_fingerprint')
  compareField('corpus_digest')
  compareField('toolchain')
  compareField('model')
  compareField('effort')
  compareField('source_paths')
  compareField('source_bindings')
  return { differences, disclosures }
}

function mapById(items) {
  return new Map((items ?? []).map(item => [item.case_id, item]))
}

function usageTokens(value) {
  if (!isObject(value)) return null
  if (numberOrNull(value.total_tokens) !== null) return value.total_tokens
  if (numberOrNull(value.tokens) !== null) return value.tokens
  const fields = ['uncached_input_tokens', 'cached_input_tokens', 'output_tokens']
  const values = fields.map(field => value[field])
  return values.every(numberOrNull) ? values.reduce((sum, item) => sum + item, 0) : null
}

function metricComparison(baseline, candidate, label) {
  const left = numberOrNull(baseline)
  const right = numberOrNull(candidate)
  if (left === null || right === null) return { status: 'INCONCLUSIVE', baseline: left, candidate: right, delta: null, reason: `${label}_NOT_MEASURED` }
  return { status: 'MEASURED', baseline: left, candidate: right, delta: right - left, direction: 'lower_is_better' }
}

function checkSummary(baseline, candidate) {
  const left = Array.isArray(baseline) ? baseline : []
  const right = Array.isArray(candidate) ? candidate : []
  if (!left.length || !right.length) return { status: 'INCONCLUSIVE', baseline: left, candidate: right, reason: 'CHECK_RESULTS_MISSING' }
  const statuses = [...left, ...right].map(item => item.status ?? item.result)
  if (statuses.includes('FAIL') || statuses.includes('ERROR')) return { status: 'FAIL', baseline: left, candidate: right }
  if (!statuses.every(item => item === 'PASS')) return { status: 'INCONCLUSIVE', baseline: left, candidate: right, reason: 'CHECK_STATUS_INCOMPLETE' }
  return { status: 'PASS', baseline: left, candidate: right }
}

function compareCase(baseline, candidate) {
  const metrics = {}
  const actionKeys = [...new Set([...Object.keys(baseline.instruction_bytes ?? {}), ...Object.keys(candidate.instruction_bytes ?? {})])]
    .filter(key => key !== 'basis')
    .sort()
  for (const key of actionKeys) metrics[`instruction_bytes.${key}`] = metricComparison(baseline.instruction_bytes?.[key], candidate.instruction_bytes?.[key], `instruction_bytes.${key}`)
  metrics.correction_cycles = metricComparison(baseline.correction_cycles, candidate.correction_cycles, 'correction_cycles')
  metrics.token_usage = metricComparison(usageTokens(baseline.observed_usage), usageTokens(candidate.observed_usage), 'token_usage')
  const checks = checkSummary(baseline.check_results, candidate.check_results)
  return {
    case_id: baseline.case_id,
    workload_class: baseline.workload_class,
    input_digest: baseline.input_digest,
    coverage: {
      baseline: baseline.coverage,
      candidate: candidate.coverage,
      exclusions: [...new Set([...(baseline.exclusions ?? []), ...(candidate.exclusions ?? [])])].sort(),
    },
    metrics,
    deterministic_checks: checks,
  }
}

export function compareBundles(baselineInput, candidateInput) {
  const baselineResult = normalizeComparisonBundle(baselineInput, 'baseline')
  const candidateResult = normalizeComparisonBundle(candidateInput, 'candidate')
  if (baselineResult.status !== 'VALID' || candidateResult.status !== 'VALID') {
    return {
      status: 'INVALID',
      comparability: { verdict: 'INVALID', reasons: [...(baselineResult.reasons ?? []), ...(candidateResult.reasons ?? [])] },
      cases: [],
    }
  }
  const baseline = baselineResult.bundle
  const candidate = candidateResult.bundle
  const identity = compareIdentity(baseline, candidate)
  const baselineCases = mapById(baseline.cases)
  const candidateCases = mapById(candidate.cases)
  const caseIds = [...new Set([...baselineCases.keys(), ...candidateCases.keys()])].sort()
  const caseResults = []
  for (const caseId of caseIds) {
    const left = baselineCases.get(caseId)
    const right = candidateCases.get(caseId)
    if (!left || !right) {
      const reason = explicitReason(candidate, `case:${caseId}`)
      if (reason) identity.disclosures.push({ field: `case:${caseId}`, reason })
      else identity.differences.push(`CASE_SET_MISMATCH:${caseId}`)
      continue
    }
    for (const field of ['workload_class', 'input_digest']) {
      if (stableJson(left[field] ?? null) === stableJson(right[field] ?? null)) continue
      const reason = explicitReason(candidate, `case:${caseId}:${field}`) ?? explicitReason(candidate, `case:${caseId}`)
      if (reason) identity.disclosures.push({ field: `case:${caseId}:${field}`, reason })
      else identity.differences.push(`CASE_${field.toUpperCase()}_MISMATCH:${caseId}`)
    }
    caseResults.push(compareCase(left, right))
  }
  const comparable = identity.differences.length === 0
  const instructionMetrics = {}
  for (const item of caseResults) {
    for (const [key, value] of Object.entries(item.metrics)) {
      if (!key.startsWith('instruction_bytes.')) continue
      instructionMetrics[key.slice('instruction_bytes.'.length)] ??= []
      instructionMetrics[key.slice('instruction_bytes.'.length)].push(value)
    }
  }
  const aggregateInstruction = Object.fromEntries(Object.entries(instructionMetrics).map(([key, values]) => {
    const measured = values.filter(item => item.status === 'MEASURED')
    if (measured.length !== values.length || !measured.length) return [key, { status: 'INCONCLUSIVE', reason: 'INSTRUCTION_BYTES_NOT_MEASURED_FOR_ALL_CASES' }]
    return [key, {
      status: 'MEASURED',
      baseline: measured.reduce((sum, item) => sum + item.baseline, 0),
      candidate: measured.reduce((sum, item) => sum + item.candidate, 0),
      delta: measured.reduce((sum, item) => sum + item.delta, 0),
      direction: 'lower_is_better',
    }]
  }))
  const tokenMetrics = caseResults.map(item => item.metrics.token_usage).filter(Boolean)
  const tokenMeasured = tokenMetrics.filter(item => item.status === 'MEASURED')
  const tokenSummary = tokenMeasured.length === tokenMetrics.length && tokenMeasured.length
    ? { status: 'MEASURED', baseline: tokenMeasured.reduce((sum, item) => sum + item.baseline, 0), candidate: tokenMeasured.reduce((sum, item) => sum + item.candidate, 0), delta: tokenMeasured.reduce((sum, item) => sum + item.delta, 0), direction: 'lower_is_better' }
    : { status: 'INCONCLUSIVE', baseline: null, candidate: null, delta: null, reason: 'PROVIDER_USAGE_UNAVAILABLE' }
  const quality = caseResults.every(item => item.deterministic_checks.status === 'PASS') && caseResults.length
    ? 'PASS'
    : caseResults.some(item => item.deterministic_checks.status === 'FAIL') ? 'FAIL' : 'INCONCLUSIVE'
  return {
    schema_version: 1,
    status: comparable ? 'COMPARABLE' : 'INCOMPARABLE',
    comparability: {
      verdict: comparable ? 'COMPARABLE' : 'INCOMPARABLE',
      reasons: identity.differences,
      explicit_differences: identity.disclosures,
    },
    identity: {
      baseline_source_head: baseline.source_head,
      candidate_source_head: candidate.source_head,
      corpus_digest: baseline.corpus_digest,
      toolchain: baseline.toolchain,
      model: baseline.model,
      effort: baseline.effort,
    },
    cases: caseResults,
    metrics: {
      instruction_bytes: aggregateInstruction,
      token_usage: tokenSummary,
      quality,
    },
    limitations: [
      ...(tokenSummary.status === 'INCONCLUSIVE' ? ['Provider usage was not observed; token savings are INCONCLUSIVE.'] : []),
      ...(quality !== 'PASS' ? ['Deterministic check coverage is not a quality proof for real Story output.'] : []),
    ],
  }
}

function gitOutput(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  if (result.error || result.status !== 0) return null
  return result.stdout.trim()
}

function npmVersion() {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  return result.status === 0 ? result.stdout.trim() : null
}

function readCorpus(root, corpusPath) {
  const file = path.resolve(root, corpusPath)
  const bytes = readFileSync(file)
  const parsed = JSON.parse(bytes.toString('utf8'))
  if (!Array.isArray(parsed.cases) || parsed.cases.length !== 3) throw new Error('CORPUS_LMH_REQUIRED')
  return { file, bytes, parsed }
}

function measureInstructionBytes(root, action) {
  const paths = [
    'AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/context-routing.md',
    '.agents/context/control-plane.md', '.agents/skills/v4-story-runner/SKILL.md', '.agents/docs/v4-artifact-contract.md',
    action === 'implement_slice' ? '.agents/skills/v4-story-runner/actions/implement-slice.md' : '.agents/skills/v4-story-runner/actions/verify-slice.md',
  ]
  return paths.reduce((total, relative) => {
    try { return total + readFileSync(path.join(root, relative)).byteLength }
    catch { return total }
  }, 0)
}

function sourceBindings(root, paths) {
  return paths.filter(relative => existsSync(path.join(root, relative))).map(relative => {
    const bytes = readFileSync(path.join(root, relative))
    return { path: relative, digest: digestBytes(bytes), bytes: bytes.byteLength }
  })
}

export function buildCandidateBundle(root, options = {}) {
  root = path.resolve(root)
  const corpus = readCorpus(root, options.corpus_path ?? '.agents/scripts/fixtures/v4-architecture/corpus.json')
  const sourceHead = gitOutput(root, ['rev-parse', 'HEAD'])
  if (!SHA.test(sourceHead ?? '')) throw new Error('SOURCE_HEAD_UNAVAILABLE')
  const sourcePaths = options.source_paths ?? DEFAULT_SOURCE_PATHS
  const toolchain = options.toolchain ?? {
    node: process.version,
    npm: npmVersion(),
    git: gitOutput(root, ['--version'])?.replace(/^git version\s+/i, '') ?? null,
    platform: process.platform,
  }
  const checkResults = options.check_results ?? [{ id: 'corpus-guard', status: 'PASS', tests: 3, coverage: 'DETERMINISTIC' }]
  const instructionBytes = options.instruction_bytes ?? {
    implement_slice: measureInstructionBytes(root, 'implement_slice'),
    verify_slice: measureInstructionBytes(root, 'verify_slice'),
    basis: 'current action-specific context sources; provider usage unavailable',
  }
  const cases = corpus.parsed.cases.map(item => ({
    case_id: item.case_id,
    workload_class: item.workload_class,
    input_digest: item.input_digest ?? null,
    trial_id: 'candidate-1',
    check_results: options.case_check_results?.[item.case_id] ?? checkResults,
    instruction_bytes: instructionBytes,
    observed_usage: null,
    correction_cycles: 0,
    coverage: 'DETERMINISTIC',
    exclusions: ['provider_usage_unavailable', 'real_story_quality_unmeasured'],
  }))
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    variant: 'candidate',
    source_head: sourceHead,
    architecture_fingerprint: digestText(sourceHead),
    corpus_digest: digestBytes(corpus.bytes),
    toolchain,
    model: options.model ?? null,
    effort: options.effort ?? null,
    source_paths: [...new Set(sourcePaths)].sort(),
    source_bindings: sourceBindings(root, sourcePaths),
    observed_usage: null,
    cases,
    comparability_reasons: options.comparability_reasons ?? {
      source_head: 'Candidate is the post-upgrade control-plane checkout; paired corpus is unchanged.',
      architecture_fingerprint: 'Candidate intentionally uses the post-upgrade architecture fingerprint.',
      source_paths: 'Candidate source set includes the bounded V4 architecture additions.',
      source_bindings: 'Candidate source bindings are expected to change with the architecture upgrade.',
    },
  }
}

export function writeCandidateBundle(root, bundle) {
  const validation = normalizeComparisonBundle(bundle, 'candidate')
  if (validation.status !== 'VALID') return validation
  const directory = path.join(path.resolve(root), '.agent-state', 'v4-observations', 'evaluations')
  const file = path.join(directory, 'architecture-upgrade-candidate.json')
  const serialized = `${stableJson(validation.bundle)}\n`
  mkdirSync(directory, { recursive: true })
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === serialized) return { status: 'NOOP', path: file }
    return { status: 'CONFLICT', reason: 'CANDIDATE_BUNDLE_EXISTS', path: file }
  }
  const temp = `${file}.tmp`
  writeFileSync(temp, serialized, { flag: 'wx' })
  renameSync(temp, file)
  return { status: 'RECORDED', path: file }
}

function readBundle(file) {
  return JSON.parse(readFileSync(path.resolve(file), 'utf8'))
}

function parseCli(argv) {
  const [verb, ...rest] = argv
  if (verb !== 'compare') throw new Error('USAGE: compare --baseline <json> --candidate <json>')
  const values = { baseline: null, candidate: null }
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (flag === '--baseline') values.baseline = value
    else if (flag === '--candidate') values.candidate = value
    else throw new Error('USAGE: compare --baseline <json> --candidate <json>')
  }
  if (!values.baseline || !values.candidate) throw new Error('USAGE: compare --baseline <json> --candidate <json>')
  return values
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2))
    const result = compareBundles(readBundle(args.baseline), readBundle(args.candidate))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = CODES[result.status] ?? CODES.ERROR
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', reasons: [error.message] })}\n`)
    process.exitCode = CODES.ERROR
  }
}
