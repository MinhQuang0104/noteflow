// Advisory in P2; callers own enforcement when autopilot is enabled.
// This module deliberately has no I/O and grants only the table's permissions.
export function decideReviewOutcome({ risk, executor, reviewer, findings = [], verification,
  focusedEvidence = [], attemptId = 1, autopilot = false } = {}) {
  const outcome = (decision, reason) => ({ decision, reasons: [reason] })
  const level = typeof risk === 'string' ? risk : risk?.level
  const flags = typeof risk === 'string' ? [] : risk?.flags ?? []
  if (!verification || verification.status !== 'PASS' || verification.complete !== true ||
      verification.canonical?.status !== 'PASS' ||
      !Array.isArray(verification.checks) || !verification.checks.length ||
      verification.checks.some(check => check?.status !== 'PASS') ||
      !Array.isArray(focusedEvidence) || !focusedEvidence.length || focusedEvidence.some(check => check?.status !== 'PASS')) {
    return outcome('BLOCKED', 'VERIFICATION_NOT_APPROVABLE')
  }
  if (!Array.isArray(findings) || findings.some(finding =>
    !['VALID', 'FALSE_POSITIVE', 'SPEC_AMBIGUITY', 'NEEDS_HUMAN_DECISION'].includes(finding?.class))) {
    return outcome('HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED')
  }
  if (findings.some(finding => ['SPEC_AMBIGUITY', 'NEEDS_HUMAN_DECISION'].includes(finding.class))) {
    return outcome('HUMAN_REQUIRED', 'REVIEW_FINDINGS_REQUIRE_HUMAN')
  }
  if (findings.some(finding => finding.class === 'VALID')) {
    if (!Number.isInteger(attemptId) || attemptId < 1) return outcome('HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED')
    return attemptId < 4 ? outcome('REWORK', 'VALID_FINDINGS_CORRECTION_ALLOWED')
      : outcome('HUMAN_REQUIRED', 'REWORK_ATTEMPTS_EXHAUSTED')
  }
  if (typeof reviewer === 'string') return outcome('HUMAN_REQUIRED', 'LEGACY_REVIEWER_UNCLASSIFIED')
  const effectiveLevel = level === 'LOW' && Array.isArray(flags) && flags.length > 0 ? 'MEDIUM' : level
  if (effectiveLevel === 'LOW' && reviewer == null && Array.isArray(flags) && flags.length === 0) {
    return outcome('PROGRESS', 'LOW_CANONICAL_PASS_NO_FLAGS')
  }
  if (effectiveLevel === 'LOW' && (reviewer?.type === 'lead' || reviewer?.type === 'human')) {
    return outcome('APPROVE_ALLOWED', 'LOW_REVIEWED')
  }
  if (effectiveLevel === 'MEDIUM' && reviewer == null) return outcome('BLOCKED', 'REVIEW_MISSING')
  if (effectiveLevel === 'MEDIUM' && reviewer?.type === 'human') {
    return outcome('APPROVE_ALLOWED', 'HUMAN_MEDIUM_RISK_REVIEW')
  }
  if (effectiveLevel === 'MEDIUM' && reviewer?.type === 'lead') {
    return executor === 'agy' ? outcome('APPROVE_ALLOWED', 'INDEPENDENT_LEAD_REVIEW')
      : outcome('HUMAN_REVIEW_REQUIRED', 'SAME_LEAD_REVIEW')
  }
  if (effectiveLevel === 'HIGH' && reviewer == null) return outcome('BLOCKED', 'REVIEW_MISSING')
  if (effectiveLevel === 'HIGH' && reviewer?.type === 'lead') return outcome('HUMAN_REVIEW_REQUIRED', 'HIGH_RISK_REQUIRES_HUMAN_REVIEW')
  if (effectiveLevel === 'HIGH' && reviewer?.type === 'human') return outcome('APPROVE_ALLOWED', 'HUMAN_HIGH_RISK_REVIEW')
  return outcome('HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED')
}

// Autopilot does not change the P2 table. It binds a durable action to the
// decision returned by that table, so callers can require the exact decision
// without treating a caller-supplied boolean as authority.
export function autopilotDecisionAllowed(policy, requiredDecision) {
  return policy?.decision === requiredDecision
}
