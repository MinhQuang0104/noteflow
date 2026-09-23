const RISKS = new Set(['LOW', 'MEDIUM', 'HIGH'])
const VERIFICATION_STATUSES = new Set(['PASS', 'FAIL', 'INCOMPLETE', 'ERROR'])
const CHECK_STATUSES = new Set(['PASS', 'FAIL', 'ERROR', 'SKIPPED'])
const FLAGS = new Set([
  'PUBLIC_CONTRACT',
  'SECURITY_AUTH',
  'MIGRATION_DESTRUCTIVE',
  'CONCURRENCY_STATE',
  'UNEXPLAINED_SCOPE',
  'AMBIGUOUS_REQUIREMENTS',
])
const MAX_INPUT = 1024 * 1024

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function result(decision, risk, reasons, exitCode) {
  process.stdout.write(`${JSON.stringify({ decision, risk, reasons: [...new Set(reasons)].sort() })}\n`)
  process.exitCode = exitCode
}

function invalid(risk, reason) {
  result('REVIEW_REQUIRED', risk, [reason], 2)
}

function reasonCode(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return code || null
}

async function readInput() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > MAX_INPUT) throw new Error('INVALID_INPUT')
  }
  return JSON.parse(input)
}

function decide(input) {
  const risk = object(input) && RISKS.has(input.risk) ? input.risk : null
  if (!object(input) || !risk || !object(input.verification) ||
      !VERIFICATION_STATUSES.has(input.verification.status) ||
      typeof input.verification.complete !== 'boolean' ||
      !Array.isArray(input.verification.escalationReasons) ||
      !Array.isArray(input.verification.checks) ||
      !Array.isArray(input.judgmentFlags)) {
    invalid(risk, 'INVALID_INPUT')
    return
  }

  const evidence = input.verification
  if (!input.judgmentFlags.every(flag => typeof flag === 'string' && FLAGS.has(flag))) {
    invalid(risk, 'UNKNOWN_JUDGMENT_FLAG')
    return
  }
  if (!evidence.escalationReasons.every(reason => reasonCode(reason)) ||
      !evidence.checks.every(check => object(check) && CHECK_STATUSES.has(check.status))) {
    invalid(risk, 'INVALID_INPUT')
    return
  }

  const conflictingPass = evidence.status === 'PASS' &&
    (!evidence.complete || evidence.escalationReasons.length > 0 ||
     evidence.checks.length === 0 || evidence.checks.some(check => check.status !== 'PASS'))
  const conflictingOther = (evidence.status === 'INCOMPLETE' || evidence.status === 'ERROR') && evidence.complete
  if (conflictingPass || conflictingOther) {
    invalid(risk, 'CONFLICTING_VERIFICATION_EVIDENCE')
    return
  }

  const reasons = []
  if (risk === 'MEDIUM') reasons.push('MEDIUM_COVERAGE_JUDGMENT')
  if (risk === 'HIGH') reasons.push('HIGH_RISK_REVIEW')
  if (evidence.status !== 'PASS') reasons.push(`VERIFICATION_${evidence.status}`)
  for (const flag of input.judgmentFlags) reasons.push(`JUDGMENT_${flag}`)
  for (const reason of evidence.escalationReasons) reasons.push(`VERIFICATION_${reasonCode(reason)}`)

  result(reasons.length ? 'REVIEW_REQUIRED' : 'NO_REVIEW', risk, reasons, reasons.length ? 1 : 0)
}

try {
  decide(await readInput())
} catch (error) {
  if (error instanceof SyntaxError || error?.message === 'INVALID_INPUT') invalid(null, 'INVALID_INPUT')
  else result('REVIEW_REQUIRED', null, ['TOOL_ERROR'], 3)
}
