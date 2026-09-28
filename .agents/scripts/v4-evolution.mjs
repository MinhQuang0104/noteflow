import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CANDIDATE_SCHEMA_VERSION = 1
const EVALUATION_SCHEMA_VERSION = 1
const ADOPTION_SCHEMA_VERSION = 1
const MAX_INPUT_BYTES = 12 * 1024
const MAX_OUTPUT_BYTES = 4 * 1024
const MAX_CANDIDATES = 3
const MAX_EVIDENCE_REFS = 16
const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const CANDIDATE_STATUSES = new Set(['PROPOSED', 'EVALUATING', 'INCONCLUSIVE', 'REJECTED', 'AWAITING_HUMAN', 'ADOPTED'])
const CONTROL_PLANE_PREFIXES = ['.agents/docs/', '.agents/scripts/', '.agents/verification/', '.agents/features/', '.agents/skills/', 'docs/agent-architecture/', 'docs/superpowers/plans/']
const FORBIDDEN_SCOPE_PREFIXES = ['src/', 'frontend/', 'backend/', 'contracts/', 'database/', 'AGENTS.md', 'CLAUDE.md', '.agent-state/active-run.json', '_bmad-output/']
const FORBIDDEN_TEXT = /(?:\bapply\b|\bauto[-_ ]?apply\b|\binstall\b|\bexecute\b|\brun\b[^\n]{0,96}\b(?:command|script|shell|npm|node|git)\b|\b(?:mutate|edit|write|overwrite)\b[^\n]{0,96}\b(?:policy|agent|story|plan|code|product)\b)/i

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

export function evolutionDigest(value) {
  return digestText(stableJson(value))
}

function byteLength(value) {
  return Buffer.byteLength(stableJson(value), 'utf8')
}

function invalid(reason, extra = {}) {
  return { status: 'INVALID', reason, ...extra }
}

function safeRelative(relative) {
  return typeof relative === 'string' && relative && !relative.includes('\0') && !relative.includes('\\') &&
    !path.isAbsolute(relative) && !path.win32.isAbsolute(relative) &&
    !relative.split('/').some(part => !part || part === '.' || part === '..')
}

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  if (result.error || result.status !== 0) throw new Error('GIT_HEAD_UNAVAILABLE')
  const head = result.stdout.trim()
  if (!SHA.test(head)) throw new Error('INVALID_GIT_HEAD')
  return head
}

function pathInside(root, relative) {
  if (!safeRelative(relative)) return null
  const absolute = path.resolve(root, relative)
  const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const normalizedAbsolute = process.platform === 'win32' ? absolute.toLowerCase() : absolute
  return normalizedAbsolute.startsWith(`${normalizedRoot}${path.sep}`) ? absolute : null
}

function fileDigest(root, relative) {
  const file = pathInside(root, relative)
  if (!file || !existsSync(file)) return null
  try {
    if (lstatSync(file).isSymbolicLink()) return null
    return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
  } catch {
    return null
  }
}

function architectureFingerprint(head) {
  return digestText(head)
}

function candidateDirectory(root) {
  return path.join(root, '.agent-state', 'v4-observations', 'candidates')
}

function candidateRelativePath(candidateId) {
  return `.agent-state/v4-observations/candidates/${candidateId}.json`
}

function allowedScopePath(relative) {
  if (!safeRelative(relative)) return false
  if (FORBIDDEN_SCOPE_PREFIXES.some(prefix => relative === prefix || relative.startsWith(prefix))) return false
  return CONTROL_PLANE_PREFIXES.some(prefix => relative.startsWith(prefix))
}

function boundedText(value, field, maxBytes = 2048) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) return `${field}_REQUIRED`
  if (Buffer.byteLength(value, 'utf8') > maxBytes) return `${field}_TOO_LARGE`
  if (FORBIDDEN_TEXT.test(value)) return `${field}_CONTAINS_APPLY_INSTRUCTION`
  return null
}

function normalizeEvidenceRefs(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EVIDENCE_REFS) return null
  const refs = []
  for (const item of value) {
    const refIsSafe = typeof item?.ref === 'string' &&
      ((SAFE_ID.test(item.ref) && !item.ref.includes('/') && !item.ref.includes('\\')) || safeRelative(item.ref))
    if (!isObject(item) || !refIsSafe) return null
    if (item.path !== undefined && !safeRelative(item.path)) return null
    if (item.digest !== undefined && !DIGEST.test(item.digest)) return null
    refs.push({ kind: item.kind ?? 'evidence', ref: item.ref, ...(item.path !== undefined ? { path: item.path } : {}), ...(item.digest !== undefined ? { digest: item.digest } : {}) })
  }
  return refs
}

function normalizeScope(scope) {
  const source = Array.isArray(scope) ? { paths: scope } : scope
  if (!isObject(source) || !Array.isArray(source.paths) || !source.paths.length) return null
  const paths = [...new Set(source.paths)]
  if (paths.some(item => !allowedScopePath(item))) return null
  return {
    paths: paths.sort(),
    boundary: typeof source.boundary === 'string' ? source.boundary : 'control-plane-only',
    ...(source.files !== undefined ? { files: source.files } : {}),
  }
}

function requiredEvaluationCases(value) {
  if (!Array.isArray(value) || !value.length || value.length > 16) return null
  const cases = []
  for (const item of value) {
    if (!isObject(item) || typeof item.case_id !== 'string' || !SAFE_ID.test(item.case_id) || item.case_id.includes('/')) return null
    if (!Array.isArray(item.checks) && !Array.isArray(item.obligations)) return null
    cases.push({ ...item })
  }
  return cases
}

function normalizeCandidate(candidate, envelope, root) {
  if (!isObject(candidate)) return null
  const sourceHead = candidate.baseline_source_head ?? candidate.baseline?.source_head ?? envelope.source_head ?? gitHead(root)
  const fingerprint = candidate.baseline_architecture_fingerprint ?? candidate.baseline?.architecture_fingerprint ?? envelope.architecture_fingerprint ?? architectureFingerprint(sourceHead)
  const evidenceRefs = normalizeEvidenceRefs(candidate.evidence_refs ?? envelope.evidence_refs)
  const scope = normalizeScope(candidate.proposed_scope ?? candidate.affected_scope ?? candidate.scope)
  const evaluationCases = requiredEvaluationCases(candidate.evaluation_cases)
  if (!evidenceRefs || !scope || !evaluationCases) return null
  return {
    schema_version: CANDIDATE_SCHEMA_VERSION,
    candidate_id: candidate.candidate_id,
    hypothesis: candidate.hypothesis,
    observed_problem: candidate.observed_problem,
    evidence_refs: evidenceRefs,
    baseline_source_head: sourceHead,
    baseline_architecture_fingerprint: fingerprint,
    workload_class: candidate.workload_class ?? envelope.workload_class,
    proposed_scope: scope,
    expected_effect: candidate.expected_effect,
    quality_risks: candidate.quality_risks,
    evaluation_cases: evaluationCases,
    cost_accounting: candidate.cost_accounting ?? { provider_usage: 'UNKNOWN' },
    stop_rollback: candidate.stop_rollback,
    status: candidate.status ?? 'PROPOSED',
    provenance: candidate.provenance ?? {
      kind: 'evolution_proposal',
      source: 'v4-evolution',
      trigger: envelope.human_request === true || envelope.request_source === 'human' ? 'human_request' : 'repeated_observation',
    },
  }
}

function candidateShapeError(candidate) {
  if (!isObject(candidate) || candidate.schema_version !== CANDIDATE_SCHEMA_VERSION) return 'INVALID_CANDIDATE_SCHEMA'
  if (typeof candidate.candidate_id !== 'string' || !SAFE_ID.test(candidate.candidate_id) || candidate.candidate_id.includes('/')) return 'CANDIDATE_ID_REQUIRED'
  for (const [field, maxBytes] of [['hypothesis', 2048], ['observed_problem', 2048], ['expected_effect', 2048], ['stop_rollback', 2048]]) {
    const error = boundedText(candidate[field], field, maxBytes)
    if (error) return error
  }
  if (typeof candidate.workload_class !== 'string' || !candidate.workload_class) return 'WORKLOAD_CLASS_REQUIRED'
  if (!CANDIDATE_STATUSES.has(candidate.status)) return 'INVALID_CANDIDATE_STATUS'
  if (!Array.isArray(candidate.quality_risks) || !candidate.quality_risks.length) return 'QUALITY_RISKS_REQUIRED'
  if (candidate.quality_risks.some(item => typeof item !== 'string' || boundedText(item, 'quality_risk', 1024))) return 'INVALID_QUALITY_RISK'
  if (!Array.isArray(candidate.evidence_refs) || !candidate.evidence_refs.length) return 'EVIDENCE_REQUIRED'
  if (!normalizeEvidenceRefs(candidate.evidence_refs)) return 'INVALID_EVIDENCE_REFS'
  if (!normalizeScope(candidate.proposed_scope)) return 'INVALID_PROPOSED_SCOPE'
  if (!requiredEvaluationCases(candidate.evaluation_cases)) return 'EVALUATION_CASES_REQUIRED'
  if (!isObject(candidate.cost_accounting) || !isObject(candidate.provenance)) return 'COST_AND_PROVENANCE_REQUIRED'
  if (byteLength(candidate) > MAX_OUTPUT_BYTES) return 'CANDIDATE_OUTPUT_TOO_LARGE'
  const forbidden = JSON.stringify(candidate)
  if (FORBIDDEN_TEXT.test(forbidden)) return 'CANDIDATE_CONTAINS_APPLY_INSTRUCTION'
  return null
}

function validateEvidenceRefs(root, refs) {
  for (const ref of refs) {
    if (ref.path && ref.digest) {
      const actual = fileDigest(root, ref.path)
      if (actual === null) return { status: 'STALE', reason: 'EVIDENCE_SOURCE_MISSING', ref: ref.ref }
      if (actual !== ref.digest) return { status: 'STALE', reason: 'EVIDENCE_SOURCE_DIGEST_STALE', ref: ref.ref }
    }
  }
  return { status: 'VALID' }
}

export function validateEvolutionCandidate(root, candidate) {
  try {
    root = path.resolve(root)
    const shapeError = candidateShapeError(candidate)
    if (shapeError) return { status: 'INVALID', reason: shapeError, candidate_id: candidate?.candidate_id ?? null }
    if (!SHA.test(candidate.baseline_source_head ?? '') || !DIGEST.test(candidate.baseline_architecture_fingerprint ?? '')) {
      return { status: 'INVALID', reason: 'BASELINE_IDENTITY_REQUIRED', candidate_id: candidate.candidate_id }
    }
    const currentHead = gitHead(root)
    if (candidate.baseline_source_head !== currentHead || candidate.baseline_architecture_fingerprint !== architectureFingerprint(currentHead)) {
      return { status: 'STALE', reason: 'BASELINE_ARCHITECTURE_DRIFT', candidate_id: candidate.candidate_id }
    }
    const refs = validateEvidenceRefs(root, candidate.evidence_refs)
    if (refs.status !== 'VALID') return { ...refs, candidate_id: candidate.candidate_id }
    return { status: 'VALID', candidate_id: candidate.candidate_id, scope: candidate.proposed_scope, lifecycle: candidate.status }
  } catch (error) {
    return { status: 'INVALID', reason: error instanceof Error ? error.message : String(error), candidate_id: candidate?.candidate_id ?? null }
  }
}

function writeCandidate(root, candidate) {
  const directory = candidateDirectory(root)
  const file = path.join(directory, `${candidate.candidate_id}.json`)
  const serialized = `${stableJson(candidate)}\n`
  mkdirSync(directory, { recursive: true })
  if (existsSync(file)) {
    try {
      if (readFileSync(file, 'utf8') === serialized) return { status: 'NOOP', path: file }
      return { status: 'CONFLICT', reason: 'CANDIDATE_ID_CONFLICT', path: file }
    } catch {
      return { status: 'INVALID', reason: 'CANDIDATE_STORE_CORRUPT', path: file }
    }
  }
  const temp = `${file}.${candidate.candidate_id}.tmp`
  try {
    writeFileSync(temp, serialized, { flag: 'wx' })
    renameSync(temp, file)
    return { status: 'RECORDED', path: file }
  } catch (error) {
    return { status: error?.code === 'EEXIST' ? 'CONFLICT' : 'ERROR', reason: error?.code === 'EEXIST' ? 'CANDIDATE_ID_CONFLICT' : 'CANDIDATE_WRITE_FAILED', path: file }
  }
}

export function proposeEvolution(root, boundedEvidence) {
  try {
    root = path.resolve(root)
    if (!isObject(boundedEvidence)) return { status: 'INVALID', candidates: [], reasons: ['BOUNDED_EVIDENCE_REQUIRED'] }
    if (byteLength(boundedEvidence) > MAX_INPUT_BYTES) return { status: 'BLOCKED', candidates: [], reasons: ['REFLECTION_INPUT_TOO_LARGE'] }
    const trigger = boundedEvidence.repeated_issue === true || boundedEvidence.repeated_observation === true ||
      boundedEvidence.human_request === true || boundedEvidence.request_source === 'human'
    if (!trigger) return { status: 'NO_CANDIDATE', candidates: [], reasons: ['TRIGGER_NOT_PRESENT'] }
    if ((boundedEvidence.reflection_count ?? 0) > 1 || boundedEvidence.reflection_round > 1) {
      return { status: 'NO_CANDIDATE', candidates: [], reasons: ['REFLECTION_BUDGET_EXCEEDED'] }
    }
    const raw = boundedEvidence.candidates ?? boundedEvidence.proposals ?? boundedEvidence.reflection?.candidates
    if (!Array.isArray(raw) || !raw.length) return { status: 'NO_CANDIDATE', candidates: [], reasons: ['NO_BOUNDED_CANDIDATE'] }
    if (raw.length > MAX_CANDIDATES) return { status: 'BLOCKED', candidates: [], reasons: ['CANDIDATE_LIMIT_EXCEEDED'] }
    const candidates = []
    const rejected = []
    for (const item of raw) {
      const candidate = normalizeCandidate(item, boundedEvidence, root)
      if (!candidate) {
        rejected.push({ reason: 'CANDIDATE_NORMALIZATION_FAILED' })
        continue
      }
      const validation = validateEvolutionCandidate(root, candidate)
      if (validation.status !== 'VALID') {
        rejected.push({ candidate_id: candidate.candidate_id, ...validation })
        continue
      }
      if (byteLength(candidate) > MAX_OUTPUT_BYTES) {
        rejected.push({ candidate_id: candidate.candidate_id, reason: 'CANDIDATE_OUTPUT_TOO_LARGE' })
        continue
      }
      const stored = writeCandidate(root, candidate)
      if (stored.status === 'RECORDED' || stored.status === 'NOOP') candidates.push(candidate)
      else rejected.push({ candidate_id: candidate.candidate_id, reason: stored.reason, status: stored.status })
    }
    if (!candidates.length) return { status: 'NO_CANDIDATE', candidates: [], rejected, reasons: ['NO_VALID_CANDIDATE'] }
    return {
      status: 'PROPOSED',
      candidates,
      rejected,
      trigger: boundedEvidence.human_request === true || boundedEvidence.request_source === 'human' ? 'human_request' : 'repeated_observation',
      limits: { max_candidates: MAX_CANDIDATES, max_input_bytes: MAX_INPUT_BYTES, max_output_bytes: MAX_OUTPUT_BYTES },
      auto_apply: false,
      adoption: 'AWAITING_HUMAN',
    }
  } catch (error) {
    return { status: 'ERROR', candidates: [], reasons: [error instanceof Error ? error.message : String(error)] }
  }
}

function comparisonUsage(comparison) {
  if (comparison?.observed_usage) return comparison.observed_usage
  const cases = Array.isArray(comparison?.cases) ? comparison.cases : []
  const usages = cases.flatMap(item => [item.baseline_usage, item.candidate_usage, item.observed_usage]).filter(Boolean)
  return usages.length ? usages : null
}

function comparisonIdentity(comparison) {
  if (comparison?.comparability && typeof comparison.comparability === 'object') return comparison.comparability
  const baseline = comparison?.baseline ?? {}
  const candidate = comparison?.candidate ?? {}
  const reasons = []
  for (const field of ['workload_class', 'input_digest', 'model', 'effort', 'toolchain']) {
    if (stableJson(baseline[field] ?? null) !== stableJson(candidate[field] ?? null)) reasons.push(`${field}_MISMATCH`)
  }
  return { verdict: reasons.length ? 'INCOMPARABLE' : 'COMPARABLE', reasons }
}

function allPass(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every(item => (item.status ?? item.result) === 'PASS')
}

export function evaluateEvolution(candidate, comparison = {}) {
  const identity = comparisonIdentity(comparison)
  const deterministicChecks = comparison.deterministic_checks ?? comparison.check_results ?? []
  const qualityChecks = comparison.quality_checks ?? comparison.quality_findings ?? []
  const usage = comparisonUsage(comparison)
  const tokenSavings = usage
    ? { status: 'MEASURED', value: comparison.token_savings ?? null, coverage: 'MEASURED' }
    : { status: 'INCONCLUSIVE', value: null, coverage: 'UNKNOWN', reason: 'PROVIDER_USAGE_UNAVAILABLE' }
  const quality = allPass(qualityChecks)
    ? { status: 'PASS', checks: qualityChecks }
    : { status: 'INCOMPLETE', checks: qualityChecks, reason: qualityChecks.length ? 'QUALITY_CHECK_FAILED_OR_INCOMPLETE' : 'QUALITY_CHECKS_REQUIRED' }
  const modelSelfRating = comparison.model_self_rating ?? candidate?.model_self_rating
  const reasons = [...(identity.reasons ?? [])]
  if (modelSelfRating !== undefined) reasons.push('MODEL_SELF_RATING_NOT_AUTHORITATIVE')
  if (identity.verdict !== 'COMPARABLE') reasons.push('COMPARISON_NOT_COMPARABLE')
  if (!usage) reasons.push('MEASUREMENT_MISSING')
  if (quality.status !== 'PASS') reasons.push('QUALITY_EVIDENCE_INCOMPLETE')
  const eligible = identity.verdict === 'COMPARABLE' && usage && allPass(deterministicChecks) && quality.status === 'PASS'
  return {
    schema_version: EVALUATION_SCHEMA_VERSION,
    candidate_id: candidate?.candidate_id ?? null,
    candidate_digest: digestText(stableJson(candidate ?? null)),
    status: eligible ? 'EVALUATED' : 'INCONCLUSIVE',
    comparability: identity,
    deterministic_checks: deterministicChecks,
    quality,
    metrics: { token_savings: tokenSavings },
    model_self_rating: modelSelfRating ?? null,
    reasons: [...new Set(reasons)],
    recommendation: eligible ? 'AWAITING_HUMAN' : 'INCONCLUSIVE',
    auto_apply: false,
  }
}

function scopeEqual(left, right) {
  return stableJson(left) === stableJson(right)
}

export function validateAdoption(record, candidate, evaluation, scope) {
  try {
    if (!isObject(record) || record.schema_version !== ADOPTION_SCHEMA_VERSION) return { status: 'INVALID', reason: 'INVALID_ADOPTION_SCHEMA' }
    if (!isObject(candidate) || !isObject(evaluation) || !isObject(scope)) return { status: 'INVALID', reason: 'ADOPTION_INPUT_REQUIRED' }
    if (record.candidate_id !== candidate.candidate_id || record.candidate_digest !== digestText(stableJson(candidate))) return { status: 'STALE', reason: 'CANDIDATE_BINDING_STALE' }
    if (record.evaluation_digest !== digestText(stableJson(evaluation))) return { status: 'STALE', reason: 'EVALUATION_BINDING_STALE' }
    if (!scopeEqual(scope, candidate.proposed_scope) || !scopeEqual(record.reviewed_scope, scope)) return { status: 'STALE', reason: 'ADOPTION_SCOPE_STALE' }
    if (!isObject(record.decision_source) || record.decision_source.kind !== 'human') return { status: 'INVALID', reason: 'HUMAN_DECISION_REQUIRED' }
    if (!['APPROVED', 'REJECTED'].includes(record.decision)) return { status: 'INVALID', reason: 'DECISION_REQUIRED' }
    if (record.decision === 'APPROVED' && evaluation.recommendation !== 'AWAITING_HUMAN') return { status: 'INVALID', reason: 'EVALUATION_NOT_ADOPTABLE' }
    return { status: 'VALID', candidate_id: candidate.candidate_id, decision: record.decision, auto_apply: false }
  } catch (error) {
    return { status: 'INVALID', reason: error instanceof Error ? error.message : String(error) }
  }
}

export function readEvolutionCandidates(root) {
  const directory = candidateDirectory(path.resolve(root))
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.json'))
    .map(item => {
      try { return JSON.parse(readFileSync(path.join(directory, item.name), 'utf8')) } catch { return null }
    })
    .filter(Boolean)
}
