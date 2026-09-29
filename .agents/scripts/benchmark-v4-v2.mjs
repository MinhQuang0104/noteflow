import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

export const BUNDLE_SCHEMA_VERSION = 2
const LEGACY_BUNDLE_SCHEMA_VERSION = 1
const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const VARIANTS = new Set(['baseline', 'candidate'])
const WORKLOADS = new Set(['L', 'M', 'H'])
const CASE_STATUSES = new Set(['PASS', 'FAIL', 'INCOMPLETE', 'ERROR', 'SKIPPED', 'STALE', 'BLOCKED', 'RECOVERY_REQUIRED'])
const ASSERTION_STATUSES = new Set(['PASS', 'FAIL', 'INCONCLUSIVE'])

export const CODES = { COMPARABLE: 0, INCOMPARABLE: 2, INVALID: 4, ERROR: 5 }

export const DEFAULT_SOURCE_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/routing/task-router.md',
  '.agents/context/control-plane.md',
  '.agents/context/verification-context.md',
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

export function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function numberOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function safeRelative(value) {
  return typeof value === 'string' && value && !value.includes('\0') &&
    !path.isAbsolute(value) && !path.win32.isAbsolute(value) && !/^[A-Za-z]:/.test(value) &&
    !value.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
}

function bundleError(reasons) {
  return { status: 'INVALID', reasons: [...new Set(reasons)] }
}

function validateSourceBindings(value) {
  if (!Array.isArray(value)) return ['SOURCE_BINDINGS_REQUIRED']
  const reasons = []
  const seen = new Set()
  for (const binding of value) {
    if (!isObject(binding) || !safeRelative(binding.path) || !DIGEST.test(binding.digest ?? '') ||
        !Number.isSafeInteger(binding.bytes) || binding.bytes < 0) {
      reasons.push('INVALID_SOURCE_BINDING')
      continue
    }
    if (seen.has(binding.path)) reasons.push(`DUPLICATE_SOURCE_BINDING:${binding.path}`)
    seen.add(binding.path)
  }
  return reasons
}

function validateEvidenceReference(value) {
  return isObject(value) && typeof value.kind === 'string' && value.kind &&
    typeof value.ref === 'string' && safeRelative(value.ref) && DIGEST.test(value.digest ?? '')
}

function validateCheckResult(value) {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return false
  const status = value.status ?? value.result
  if (!CASE_STATUSES.has(status)) return false
  if (value.exit_code !== undefined && value.exit_code !== null && !Number.isInteger(value.exit_code)) return false
  if (status === 'PASS' && value.exit_code !== undefined && value.exit_code !== null && value.exit_code !== 0) return false
  if ((status === 'FAIL' || status === 'ERROR') && value.exit_code === 0) return false
  return value.evidence_ref === undefined || value.evidence_ref === null || DIGEST.test(value.evidence_ref)
}

function validateCase(item) {
  const reasons = []
  if (!isObject(item) || typeof item.case_id !== 'string' || !item.case_id) return ['INVALID_CASE_ID']
  if (!WORKLOADS.has(item.workload_class)) reasons.push(`INVALID_WORKLOAD:${item.case_id}`)
  if (item.input_digest !== null && !DIGEST.test(item.input_digest ?? '')) reasons.push(`INVALID_INPUT_DIGEST:${item.case_id}`)
  if (typeof item.trial_id !== 'string' || !item.trial_id) reasons.push(`INVALID_TRIAL_ID:${item.case_id}`)
  if (!Array.isArray(item.check_results) || item.check_results.some(check => !validateCheckResult(check))) reasons.push(`INVALID_CHECK_RESULTS:${item.case_id}`)
  if (Array.isArray(item.check_results) && new Set(item.check_results.map(check => check.id)).size !== item.check_results.length) reasons.push(`DUPLICATE_CHECK_ID:${item.case_id}`)
  if (!isObject(item.instruction_bytes)) reasons.push(`INSTRUCTION_BYTES_REQUIRED:${item.case_id}`)
  if (item.observed_usage !== null && !isObject(item.observed_usage)) reasons.push(`INVALID_USAGE:${item.case_id}`)
  if (item.correction_cycles !== null && (!Number.isSafeInteger(item.correction_cycles) || item.correction_cycles < 0)) reasons.push(`INVALID_CORRECTION_CYCLES:${item.case_id}`)
  if (typeof item.coverage !== 'string' || !item.coverage) reasons.push(`INVALID_COVERAGE:${item.case_id}`)
  if (!Array.isArray(item.exclusions)) reasons.push(`INVALID_EXCLUSIONS:${item.case_id}`)
  if (item.coverage === 'COMPLETE_VERIFIED') {
    if (!DIGEST.test(item.input_digest ?? '')) reasons.push(`EXECUTION_INPUT_DIGEST_REQUIRED:${item.case_id}`)
    if (!SHA.test(item.source_head ?? '')) reasons.push(`EXECUTION_SOURCE_HEAD_REQUIRED:${item.case_id}`)
    if (!DIGEST.test(item.runner_digest ?? '')) reasons.push(`EXECUTION_RUNNER_DIGEST_REQUIRED:${item.case_id}`)
    if (!isObject(item.toolchain)) reasons.push(`EXECUTION_TOOLCHAIN_REQUIRED:${item.case_id}`)
    if (typeof item.started_at !== 'string' || typeof item.ended_at !== 'string') reasons.push(`EXECUTION_TIME_REQUIRED:${item.case_id}`)
    if (typeof item.cwd !== 'string' || !Array.isArray(item.argv) || !item.argv.length) reasons.push(`EXECUTION_COMMAND_REQUIRED:${item.case_id}`)
    if (!Array.isArray(item.evidence_refs) || !item.evidence_refs.length || item.evidence_refs.some(ref => !validateEvidenceReference(ref))) reasons.push(`EXECUTION_EVIDENCE_REQUIRED:${item.case_id}`)
    if (!isObject(item.actual_observations)) reasons.push(`ACTUAL_OBSERVATIONS_REQUIRED:${item.case_id}`)
    if (!Array.isArray(item.assertions) || !item.assertions.length || item.assertions.some(assertion => !isObject(assertion) || typeof assertion.id !== 'string' || !ASSERTION_STATUSES.has(assertion.status))) reasons.push(`ASSERTIONS_REQUIRED:${item.case_id}`)
    if (!isObject(item.required_check_coverage) || item.required_check_coverage.status !== 'COMPLETE' ||
        !Number.isSafeInteger(item.required_check_coverage.required) || !Number.isSafeInteger(item.required_check_coverage.observed) ||
        item.required_check_coverage.required < 1 || item.required_check_coverage.observed < item.required_check_coverage.required) reasons.push(`REQUIRED_CHECK_COVERAGE_INVALID:${item.case_id}`)
  }
  return reasons
}

function validateEvidence(value, corpusDigest) {
  const reasons = []
  if (!isObject(value)) return ['EVIDENCE_REQUIRED']
  if (value.run_id !== null && (typeof value.run_id !== 'string' || !safeRelative(value.run_id))) reasons.push('INVALID_EVIDENCE_RUN_ID')
  if (value.runner_digest !== null && !DIGEST.test(value.runner_digest ?? '')) reasons.push('INVALID_RUNNER_DIGEST')
  if (value.corpus_digest !== corpusDigest) reasons.push('EVIDENCE_CORPUS_MISMATCH')
  if (!['VERIFIED', 'UNVERIFIED', 'INCONCLUSIVE'].includes(value.status)) reasons.push('INVALID_EVIDENCE_STATUS')
  if (!['COMPLETE_VERIFIED', 'UNKNOWN', 'INCOMPLETE'].includes(value.coverage)) reasons.push('INVALID_EVIDENCE_COVERAGE')
  if (value.evidence_index !== undefined && (!Array.isArray(value.evidence_index) || value.evidence_index.some(item => !validateEvidenceReference({ kind: 'index', ...item })))) reasons.push('INVALID_EVIDENCE_INDEX')
  if (Array.isArray(value.evidence_index)) {
    const refs = value.evidence_index.map(item => item.ref)
    if (new Set(refs).size !== refs.length) reasons.push('DUPLICATE_EVIDENCE_INDEX_REF')
  }
  if (value.status === 'VERIFIED' && value.coverage === 'COMPLETE_VERIFIED') {
    if (typeof value.run_id !== 'string' || !value.run_id) reasons.push('VERIFIED_RUN_ID_REQUIRED')
    if (!DIGEST.test(value.runner_digest ?? '')) reasons.push('VERIFIED_RUNNER_DIGEST_REQUIRED')
    if (!Array.isArray(value.evidence_index) || !value.evidence_index.length) reasons.push('VERIFIED_EVIDENCE_INDEX_REQUIRED')
  }
  return reasons
}

function validateV2Bundle(input, expectedVariant = null) {
  if (!isObject(input)) return bundleError(['BUNDLE_OBJECT_REQUIRED'])
  const reasons = []
  if (input.schema_version !== BUNDLE_SCHEMA_VERSION) reasons.push('INVALID_BUNDLE_SCHEMA')
  if (!VARIANTS.has(input.variant) || (expectedVariant && input.variant !== expectedVariant)) reasons.push('INVALID_BUNDLE_VARIANT')
  if (!SHA.test(input.source_head ?? '')) reasons.push('INVALID_SOURCE_HEAD')
  for (const field of ['architecture_fingerprint', 'corpus_digest']) if (!DIGEST.test(input[field] ?? '')) reasons.push(`INVALID_${field.toUpperCase()}`)
  if (!isObject(input.toolchain)) reasons.push('TOOLCHAIN_REQUIRED')
  if (input.model !== null && typeof input.model !== 'string') reasons.push('INVALID_MODEL')
  if (input.effort !== null && typeof input.effort !== 'string') reasons.push('INVALID_EFFORT')
  if (!Array.isArray(input.source_paths) || input.source_paths.some(relative => !safeRelative(relative))) reasons.push('SOURCE_PATHS_REQUIRED')
  reasons.push(...validateSourceBindings(input.source_bindings))
  reasons.push(...validateEvidence(input.evidence, input.corpus_digest))
  if (!Array.isArray(input.cases) || !input.cases.length) reasons.push('CASES_REQUIRED')
  else for (const item of input.cases) reasons.push(...validateCase(item))
  if (input.observed_usage !== null && !isObject(input.observed_usage)) reasons.push('INVALID_BUNDLE_USAGE')
  if (input.instruction_measurement !== null && !isObject(input.instruction_measurement)) reasons.push('INVALID_INSTRUCTION_MEASUREMENT')
  if (reasons.length) return bundleError(reasons)
  const ids = input.cases.map(item => item.case_id)
  if (new Set(ids).size !== ids.length) return bundleError(['DUPLICATE_CASE_ID'])
  return { status: 'VALID', bundle: clone(input) }
}

function validateLegacyBundle(input, expectedVariant = null) {
  if (!isObject(input)) return bundleError(['BUNDLE_OBJECT_REQUIRED'])
  const reasons = []
  if (input.schema_version !== LEGACY_BUNDLE_SCHEMA_VERSION) reasons.push('INVALID_BUNDLE_SCHEMA')
  if (!VARIANTS.has(input.variant) || (expectedVariant && input.variant !== expectedVariant)) reasons.push('INVALID_BUNDLE_VARIANT')
  if (!SHA.test(input.source_head ?? '')) reasons.push('INVALID_SOURCE_HEAD')
  for (const field of ['architecture_fingerprint', 'corpus_digest']) if (!DIGEST.test(input[field] ?? '')) reasons.push(`INVALID_${field.toUpperCase()}`)
  if (!Array.isArray(input.cases) || !input.cases.length) reasons.push('CASES_REQUIRED')
  if (reasons.length) return bundleError(reasons)
  const ids = input.cases.map(item => item?.case_id)
  if (ids.some(item => typeof item !== 'string' || !item) || new Set(ids).size !== ids.length) return bundleError(['INVALID_LEGACY_CASES'])
  return { status: 'LEGACY_UNVERIFIED', reasons: ['LEGACY_BUNDLE_SCHEMA', 'EVIDENCE_PROVENANCE_MISSING'], bundle: clone(input), legacy: true }
}

export function normalizeComparisonBundle(input, expectedVariant = null) {
  if (input?.schema_version === LEGACY_BUNDLE_SCHEMA_VERSION) return validateLegacyBundle(input, expectedVariant)
  return validateV2Bundle(input, expectedVariant)
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
  const disclosureFields = new Set(['source_head', 'architecture_fingerprint', 'source_paths', 'source_bindings'])
  for (const [field, key] of [['source_head', 'source_head'], ['architecture_fingerprint', 'architecture_fingerprint'], ['corpus_digest', 'corpus_digest'], ['toolchain', 'toolchain'], ['model', 'model'], ['effort', 'effort'], ['source_paths', 'source_paths'], ['source_bindings', 'source_bindings']]) {
    if (stableJson(baseline[field] ?? null) === stableJson(candidate[field] ?? null)) continue
    if (disclosureFields.has(field)) {
      const reason = explicitReason(candidate, key)
      if (reason) disclosures.push({ field: key, reason })
      else differences.push(`${key}_MISMATCH_REQUIRES_EXPLICIT_REASON`)
    } else differences.push(`${key}_MISMATCH`)
  }
  return { differences, disclosures }
}

function mapById(items) {
  return new Map((items ?? []).map(item => [item.case_id, item]))
}

function usageTokens(value) {
  if (!isObject(value) || value.status !== 'MEASURED' || !DIGEST.test(value.evidence_digest ?? '') || typeof value.measurement_id !== 'string' || !value.measurement_id) return null
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

function verifyEvidenceRefs(bundle, evidenceRoot) {
  if (bundle.evidence?.status !== 'VERIFIED' || bundle.evidence?.coverage !== 'COMPLETE_VERIFIED') return { status: 'INCONCLUSIVE', reasons: ['EVIDENCE_NOT_VERIFIED'] }
  const index = new Map((bundle.evidence.evidence_index ?? []).map(item => [item.ref, item.digest]))
  const seenRefs = new Map()
  for (const item of bundle.cases) {
    if (item.coverage !== 'COMPLETE_VERIFIED') return { status: 'INCONCLUSIVE', reasons: [`CASE_EVIDENCE_INCOMPLETE:${item.case_id}`] }
    for (const ref of item.evidence_refs ?? []) {
      if (seenRefs.has(ref.ref) && seenRefs.get(ref.ref) !== item.case_id) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_REF_REUSED:${ref.ref}`] }
      seenRefs.set(ref.ref, item.case_id)
      if (index.get(ref.ref) !== ref.digest) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_INDEX_MISMATCH:${item.case_id}`] }
      if (!evidenceRoot) return { status: 'INCONCLUSIVE', reasons: ['EVIDENCE_ROOT_REQUIRED'] }
      const root = path.resolve(evidenceRoot)
      const file = path.resolve(root, ref.ref)
      if (!safeRelative(ref.ref) || !file.startsWith(`${root}${path.sep}`) || !existsSync(file) || lstatSync(file).isSymbolicLink()) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_REF_UNAVAILABLE:${item.case_id}`] }
      if (digestBytes(readFileSync(file)) !== ref.digest) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_DIGEST_MISMATCH:${item.case_id}`] }
      if (ref.kind === 'raw-result') {
        try {
          const raw = JSON.parse(readFileSync(file, 'utf8'))
          if (raw.case_id !== item.case_id) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_CASE_MISMATCH:${item.case_id}`] }
          if (raw.input_digest !== item.input_digest || raw.source_head !== item.source_head) return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_SOURCE_MISMATCH:${item.case_id}`] }
        } catch {
          return { status: 'INCONCLUSIVE', reasons: [`EVIDENCE_PAYLOAD_INVALID:${item.case_id}`] }
        }
      }
    }
    if (!item.assertions?.length || item.assertions.some(assertion => assertion.status !== 'PASS')) return { status: 'INCONCLUSIVE', reasons: [`ASSERTION_INCOMPLETE:${item.case_id}`] }
  }
  return { status: 'VERIFIED', reasons: [] }
}

function caseCheckSummary(baseline, candidate, evidenceStatus) {
  if (evidenceStatus.status !== 'VERIFIED') return { status: 'INCONCLUSIVE', reason: 'EVIDENCE_NOT_VERIFIED' }
  const assertions = [...(baseline.assertions ?? []), ...(candidate.assertions ?? [])]
  if (assertions.some(item => item.status === 'FAIL')) return { status: 'FAIL', baseline: baseline.check_results, candidate: candidate.check_results, assertions }
  if (!assertions.length || !assertions.every(item => item.status === 'PASS')) return { status: 'INCONCLUSIVE', baseline: baseline.check_results, candidate: candidate.check_results, assertions, reason: 'ASSERTION_STATUS_INCOMPLETE' }
  return { status: 'PASS', baseline: baseline.check_results, candidate: candidate.check_results, assertions }
}

function compareInstructionMeasurements(baseline, candidate) {
  const left = baseline.instruction_measurement
  const right = candidate.instruction_measurement
  if (!isObject(left) || !isObject(right)) return { status: 'INCONCLUSIVE', reason: 'INSTRUCTION_MEASUREMENT_MISSING' }
  const identityFields = ['method', 'basis_id', 'basis_digest', 'profile', 'input_digest']
  const mismatches = identityFields.filter(field => stableJson(left[field] ?? null) !== stableJson(right[field] ?? null))
  if (mismatches.length) return { status: 'INCONCLUSIVE', reason: 'INSTRUCTION_BASIS_MISMATCH', basis_mismatches: mismatches }
  if (left.status !== 'MEASURED' || right.status !== 'MEASURED') return { status: 'INCONCLUSIVE', reason: 'INSTRUCTION_MEASUREMENT_NOT_MEASURED' }
  const actions = [...new Set([...Object.keys(left.actions ?? {}), ...Object.keys(right.actions ?? {})])].sort()
  const metrics = {}
  for (const action of actions) metrics[action] = metricComparison(left.actions?.[action]?.required_instruction_bytes, right.actions?.[action]?.required_instruction_bytes, `instruction_bytes.${action}`)
  return { status: 'MEASURED', basis: { method: left.method, basis_id: left.basis_id, basis_digest: left.basis_digest, profile: left.profile, input_digest: left.input_digest }, actions: metrics }
}

function compareLegacy(baselineResult, candidateResult) {
  const reasons = [...new Set([...(baselineResult.reasons ?? []), ...(candidateResult.reasons ?? [])])]
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    status: 'INCOMPARABLE',
    comparability: { verdict: 'INCONCLUSIVE', reasons },
    identity: {},
    cases: [],
    evidence: { status: 'INCONCLUSIVE', reasons },
    metrics: {
      instruction_bytes: { status: 'INCONCLUSIVE', reason: 'LEGACY_BUNDLE_UNVERIFIED' },
      token_usage: { status: 'INCONCLUSIVE', baseline: null, candidate: null, delta: null, reason: 'LEGACY_BUNDLE_UNVERIFIED' },
      quality: 'INCONCLUSIVE',
    },
    limitations: ['Legacy bundle v1 is readable for history but lacks v2 execution provenance and measurement basis.'],
  }
}

export function compareBundles(baselineInput, candidateInput, options = {}) {
  const baselineResult = normalizeComparisonBundle(baselineInput, 'baseline')
  const candidateResult = normalizeComparisonBundle(candidateInput, 'candidate')
  if (baselineResult.status === 'INVALID' || candidateResult.status === 'INVALID') {
    return { schema_version: BUNDLE_SCHEMA_VERSION, status: 'INVALID', comparability: { verdict: 'INVALID', reasons: [...(baselineResult.reasons ?? []), ...(candidateResult.reasons ?? [])] }, cases: [] }
  }
  if (baselineResult.status === 'LEGACY_UNVERIFIED' || candidateResult.status === 'LEGACY_UNVERIFIED') return compareLegacy(baselineResult, candidateResult)
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
      identity.differences.push(`CASE_SET_MISMATCH:${caseId}`)
      continue
    }
    for (const field of ['workload_class', 'input_digest']) if (stableJson(left[field] ?? null) !== stableJson(right[field] ?? null)) identity.differences.push(`CASE_${field.toUpperCase()}_MISMATCH:${caseId}`)
    caseResults.push({
      case_id: left.case_id,
      workload_class: left.workload_class,
      input_digest: left.input_digest,
      coverage: { baseline: left.coverage, candidate: right.coverage },
      actual_observations: { baseline: left.actual_observations ?? null, candidate: right.actual_observations ?? null },
      assertions: { baseline: left.assertions ?? [], candidate: right.assertions ?? [] },
      metrics: {
        correction_cycles: metricComparison(left.correction_cycles, right.correction_cycles, 'correction_cycles'),
        token_usage: metricComparison(usageTokens(left.observed_usage), usageTokens(right.observed_usage), 'token_usage'),
      },
      deterministic_checks: { status: 'PENDING' },
    })
  }
  const baselineEvidence = verifyEvidenceRefs(baseline, options.evidenceRoot)
  const candidateEvidence = verifyEvidenceRefs(candidate, options.evidenceRoot)
  const evidenceStatus = baselineEvidence.status === 'VERIFIED' && candidateEvidence.status === 'VERIFIED'
    ? { status: 'VERIFIED', reasons: [] }
    : { status: 'INCONCLUSIVE', reasons: [...new Set([...baselineEvidence.reasons, ...candidateEvidence.reasons])] }
  for (const item of caseResults) item.deterministic_checks = caseCheckSummary(baselineCases.get(item.case_id), candidateCases.get(item.case_id), evidenceStatus)
  const instructionMeasurement = compareInstructionMeasurements(baseline, candidate)
  const tokenMetrics = caseResults.map(item => item.metrics.token_usage)
  const tokenMeasured = tokenMetrics.filter(item => item.status === 'MEASURED')
  const tokenSummary = tokenMeasured.length === tokenMetrics.length && tokenMeasured.length
    ? { status: 'MEASURED', baseline: tokenMeasured.reduce((sum, item) => sum + item.baseline, 0), candidate: tokenMeasured.reduce((sum, item) => sum + item.candidate, 0), delta: tokenMeasured.reduce((sum, item) => sum + item.delta, 0), direction: 'lower_is_better' }
    : { status: 'INCONCLUSIVE', baseline: null, candidate: null, delta: null, reason: 'PROVIDER_USAGE_UNAVAILABLE_OR_UNVERIFIED' }
  const quality = evidenceStatus.status !== 'VERIFIED' ? 'INCONCLUSIVE' : caseResults.every(item => item.deterministic_checks.status === 'PASS') && caseResults.length ? 'PASS' : caseResults.some(item => item.deterministic_checks.status === 'FAIL') ? 'FAIL' : 'INCONCLUSIVE'
  const limitations = []
  if (evidenceStatus.status !== 'VERIFIED') limitations.push(...evidenceStatus.reasons.map(reason => `Evidence: ${reason}`))
  if (instructionMeasurement.status !== 'MEASURED') limitations.push(`Instruction measurement: ${instructionMeasurement.reason}`)
  if (tokenSummary.status !== 'MEASURED') limitations.push('Provider usage was not observed or was not provenance-bound; token savings are INCONCLUSIVE.')
  if (quality !== 'PASS') limitations.push('Deterministic scenario assertion coverage is not a quality proof for real Story output.')
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    status: identity.differences.length ? 'INCOMPARABLE' : 'COMPARABLE',
    comparability: { verdict: identity.differences.length ? 'INCOMPARABLE' : 'COMPARABLE', reasons: identity.differences, explicit_differences: identity.disclosures },
    identity: { baseline_source_head: baseline.source_head, candidate_source_head: candidate.source_head, corpus_digest: baseline.corpus_digest, toolchain: baseline.toolchain, model: baseline.model, effort: baseline.effort },
    evidence: { status: evidenceStatus.status, baseline: baselineEvidence, candidate: candidateEvidence, reasons: evidenceStatus.reasons },
    cases: caseResults,
    metrics: { instruction_bytes: instructionMeasurement.status === 'MEASURED' ? instructionMeasurement.actions : instructionMeasurement, instruction_basis: instructionMeasurement.basis ?? null, token_usage: tokenSummary, quality },
    limitations: [...new Set(limitations)],
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
  if (!Array.isArray(parsed.cases) || parsed.cases.length !== 3 || new Set(parsed.cases.map(item => item?.case_id)).size !== 3) throw new Error('CORPUS_LMH_REQUIRED')
  return { file, bytes, parsed }
}

function sourceBindings(root, paths) {
  return paths.filter(relative => existsSync(path.join(root, relative))).map(relative => {
    const bytes = readFileSync(path.join(root, relative))
    return { path: relative, digest: digestBytes(bytes), bytes: bytes.byteLength }
  })
}

function minimalCase(item, variant, instructionMeasurement) {
  return { case_id: item.case_id, workload_class: item.workload_class, input_digest: null, trial_id: `${variant}-unexecuted`, check_results: [], instruction_bytes: instructionMeasurement?.actions ?? {}, observed_usage: null, correction_cycles: null, coverage: 'UNKNOWN', exclusions: ['case_execution_missing', 'provider_usage_unavailable', 'real_story_quality_unmeasured'] }
}

export function buildCandidateBundle(root, options = {}) {
  root = path.resolve(root)
  const corpus = readCorpus(root, options.corpus_path ?? '.agents/scripts/fixtures/v4-architecture/corpus.json')
  const sourceHead = gitOutput(root, ['rev-parse', 'HEAD'])
  if (!SHA.test(sourceHead ?? '')) throw new Error('SOURCE_HEAD_UNAVAILABLE')
  const sourcePaths = options.source_paths ?? DEFAULT_SOURCE_PATHS
  const toolchain = options.toolchain ?? { node: process.version, npm: npmVersion(), git: gitOutput(root, ['--version'])?.replace(/^git version\s+/i, '') ?? null, platform: process.platform }
  const run = options.corpus_run ?? null
  const executions = new Map((options.case_results ?? options.caseResults ?? []).map(item => [item.case_id, item]))
  const corpusCaseIds = new Set(corpus.parsed.cases.map(item => item.case_id))
  if ([...executions.keys()].some(caseId => !corpusCaseIds.has(caseId))) throw new Error('CASE_INVENTORY_MISMATCH')
  const cases = corpus.parsed.cases.map(item => {
    const execution = executions.get(item.case_id)
    if (!execution) return minimalCase(item, options.variant ?? 'candidate', options.instruction_measurement)
    return { ...clone(execution), case_id: item.case_id, workload_class: item.workload_class, instruction_bytes: execution.instruction_bytes ?? options.instruction_measurement?.actions ?? {}, observed_usage: execution.observed_usage ?? null, correction_cycles: execution.correction_cycles ?? null, exclusions: execution.exclusions ?? ['provider_usage_unavailable', 'real_story_quality_unmeasured'] }
  })
  const complete = run?.status === 'VERIFIED' && cases.length === corpus.parsed.cases.length && cases.every(item => item.coverage === 'COMPLETE_VERIFIED')
  const evidence = options.evidence ?? { run_id: options.run_id ?? null, runner_digest: run?.runner_digest ?? null, corpus_digest: digestBytes(corpus.bytes), status: complete ? 'VERIFIED' : 'UNVERIFIED', coverage: complete ? 'COMPLETE_VERIFIED' : 'UNKNOWN', evidence_index: run?.evidence_index ?? [] }
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    variant: options.variant ?? 'candidate',
    source_head: sourceHead,
    architecture_fingerprint: digestText(sourceHead),
    corpus_digest: digestBytes(corpus.bytes),
    toolchain,
    model: options.model ?? null,
    effort: options.effort ?? null,
    source_paths: [...new Set(sourcePaths)].sort(),
    source_bindings: sourceBindings(root, sourcePaths),
    evidence,
    instruction_measurement: options.instruction_measurement ?? null,
    observed_usage: options.observed_usage ?? null,
    cases,
    comparability_reasons: options.comparability_reasons ?? { source_head: 'The paired checkout is expected to differ.', architecture_fingerprint: 'The architecture fingerprint is revision-bound.', source_paths: 'The architecture changes the bounded source set.', source_bindings: 'Source bindings are revision-bound.' },
  }
}

function runIdFrom(bundle, explicit) {
  const runId = explicit ?? bundle?.evidence?.run_id
  return typeof runId === 'string' && safeRelative(runId) ? runId : null
}

export function writeCandidateBundle(root, bundle, options = {}) {
  const validation = validateV2Bundle(bundle, 'candidate')
  if (validation.status !== 'VALID') return validation
  const runId = runIdFrom(bundle, options.runId)
  if (!runId) return { status: 'INVALID', reason: 'RUN_ID_REQUIRED' }
  const directory = path.join(path.resolve(root), '.agent-state', 'v4-observations', 'evaluations', 'acceptance', runId)
  const file = path.join(directory, 'candidate-bundle.json')
  const serialized = `${stableJson(validation.bundle)}\n`
  mkdirSync(directory, { recursive: true })
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === serialized) return { status: 'NOOP', path: file }
    return { status: 'CONFLICT', reason: 'CANDIDATE_BUNDLE_CONFLICT', path: file }
  }
  const temp = `${file}.${runId}.tmp`
  try {
    writeFileSync(temp, serialized, { flag: 'wx' })
    renameSync(temp, file)
    return { status: 'RECORDED', path: file }
  } catch (error) {
    return { status: error?.code === 'EEXIST' ? 'CONFLICT' : 'ERROR', reason: error?.code === 'EEXIST' ? 'CANDIDATE_BUNDLE_CONFLICT' : 'CANDIDATE_BUNDLE_WRITE_FAILED', path: file }
  }
}
