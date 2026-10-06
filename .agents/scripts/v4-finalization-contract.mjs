import { createHash } from 'node:crypto'

const DIGEST = /^sha256:[0-9a-f]{64}$/
const EVIDENCE_SET_DIGEST = /^(?:sha256:)?[0-9a-f]{64}$/
const REVIEW_DECISIONS = new Set(['APPROVE', 'NEED_MORE_EVIDENCE', 'CHANGES_REQUIRED'])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

export function digestValue(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')
}

export function canonicalPaths(paths) {
  return [...new Set((paths ?? []).map(item => String(item).trim().replaceAll('\\', '/').replace(/^\.\//, '')).filter(Boolean))].sort()
}

function exactList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index])
}

export function reviewDecision(review) {
  const judgment = review?.judgment
  const verdict = review?.verdict
  if (judgment !== undefined && !REVIEW_DECISIONS.has(judgment)) return { value: null, error: 'REVIEW_DECISION_INVALID' }
  if (verdict !== undefined && verdict !== 'APPROVE' && !REVIEW_DECISIONS.has(verdict)) return { value: null, error: 'REVIEW_DECISION_INVALID' }
  if (judgment !== undefined && verdict !== undefined && judgment !== verdict) return { value: null, error: 'REVIEW_DECISION_CONFLICT' }
  if (judgment === undefined && verdict === undefined) return { value: null, error: 'REVIEW_DECISION_MISSING' }
  return { value: judgment ?? verdict, error: null }
}

export function receiptKindsForAttemptStatus(status) {
  if (status === 'reviewed') return ['implementation', 'verification', 'review']
  if (status === 'verified') return ['implementation', 'verification']
  if (status === 'checkpointed') return ['implementation']
  return []
}

function validEvidenceRef(ref, expectedPaths) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.path !== 'string' || !expectedPaths.includes(ref.path)) return false
  if (ref.unit_index !== undefined) return Number.isInteger(ref.unit_index) && ref.unit_index >= 0 && EVIDENCE_SET_DIGEST.test(ref.evidence_set_digest ?? '')
  return Number.isInteger(ref.hunk_index) && ref.hunk_index >= 0 && DIGEST.test(ref.body_digest ?? '')
}

function orderedEvidenceRefs(refs, expectedPaths) {
  if (!Array.isArray(refs) || !refs.length || refs.some(ref => !validEvidenceRef(ref, expectedPaths))) return false
  const firstPaths = []
  for (const ref of refs) if (firstPaths.at(-1) !== ref.path) firstPaths.push(ref.path)
  if (!exactList(firstPaths, expectedPaths)) return false
  const unitRefs = refs.every(ref => ref.unit_index !== undefined)
  if (unitRefs) {
    const digests = [...new Set(refs.map(ref => ref.evidence_set_digest))]
    return digests.length === 1 && refs.every((ref, index) => ref.unit_index === index)
  }
  if (refs.some(ref => ref.unit_index !== undefined)) return false
  const seen = new Set()
  const nextHunk = new Map()
  for (const ref of refs) {
    const key = ref.path + ':' + ref.hunk_index
    if (seen.has(key) || ref.hunk_index !== (nextHunk.get(ref.path) ?? 0)) return false
    seen.add(key)
    nextHunk.set(ref.path, ref.hunk_index + 1)
  }
  return true
}

export function reviewEvidenceFreshness(review, expectedPaths, expectedCommit, expectedRiskDigest) {
  const decision = reviewDecision(review)
  if (decision.error || decision.value !== 'APPROVE') return { status: 'INVALID', reason: decision.error ?? 'REVIEW_NOT_APPROVED' }
  if (review.reviewed_commit !== expectedCommit) return { status: 'STALE', reason: 'REVIEWED_COMMIT_MISMATCH' }
  if (!DIGEST.test(expectedRiskDigest ?? '') || review.risk_context_digest !== expectedRiskDigest) return { status: 'STALE', reason: 'RISK_CONTEXT_DIGEST_MISMATCH' }
  const paths = canonicalPaths(expectedPaths)
  if (!exactList(paths, expectedPaths) || !orderedEvidenceRefs(review.evidence_refs, paths)) return { status: 'INVALID', reason: 'REVIEW_EVIDENCE_INVALID' }
  const refs = review.evidence_refs
  const expectedScope = refs.every(ref => ref.unit_index !== undefined)
    ? digestValue({ paths, source: refs[0].evidence_set_digest })
    : digestValue({ paths, refs })
  if (!DIGEST.test(review.scope_digest ?? '') || review.scope_digest !== expectedScope) return { status: 'STALE', reason: 'REVIEW_SCOPE_DIGEST_MISMATCH' }
  const declared = typeof review.freshness === 'string' ? review.freshness : review.freshness?.status
  if (declared !== undefined && !['FRESH_CANDIDATE', 'FRESH_REUSED', 'FRESH'].includes(declared)) return { status: 'INVALID', reason: 'REVIEW_FRESHNESS_INVALID' }
  return { status: declared ?? 'FRESH_REUSED', reason: null }
}

// Review receipts written by the V4 action kernel carry exact-scope bindings
// (`judgment`, ordered `evidence_refs`, `scope_digest`) and are schema 2.
// Schema 1 receipts exist in two shapes: kernel-era receipts that already carry
// those bindings, and legacy receipts (`verdict` plus declared `freshness`, no
// `scope_digest` key) written before the binding contract. Legacy receipts are admissible only when
// Git ancestry proves they predate that contract; callers enforce the ancestry.
export const REVIEW_RECEIPT_SCHEMA_VERSION = 2
export const LEGACY_REVIEW_RECEIPT_CUTOFF = 'f58969aadad06163d35169ed8cbfb58264103122'

export function reviewReceiptDialect(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return 'invalid'
  // The kernel always writes the scope_digest key; legacy producers never did.
  const bound = Object.hasOwn(review, 'scope_digest')
  if (review.schema_version === REVIEW_RECEIPT_SCHEMA_VERSION) {
    return review.judgment !== undefined && review.verdict === undefined && Array.isArray(review.evidence_refs) &&
      typeof review.scope_digest === 'string' ? 'bound' : 'invalid'
  }
  if (review.schema_version !== 1) return 'invalid'
  if (bound) return 'bound'
  return review.verdict !== undefined && review.freshness !== undefined ? 'legacy' : 'invalid'
}

export function legacyReviewFreshness(review, expectedCommit, expectedRiskDigest) {
  const decision = reviewDecision(review)
  if (decision.error || decision.value !== 'APPROVE') return { status: 'INVALID', reason: decision.error ?? 'REVIEW_NOT_APPROVED' }
  if (review.reviewed_commit !== expectedCommit) return { status: 'STALE', reason: 'REVIEWED_COMMIT_MISMATCH' }
  if (!DIGEST.test(expectedRiskDigest ?? '') || review.risk_context_digest !== expectedRiskDigest) return { status: 'STALE', reason: 'RISK_CONTEXT_DIGEST_MISMATCH' }
  const declared = typeof review.freshness === 'string' ? review.freshness : review.freshness?.status
  if (!['FRESH_CANDIDATE', 'FRESH_REUSED', 'FRESH'].includes(declared)) return { status: 'INVALID', reason: 'REVIEW_FRESHNESS_INVALID' }
  return { status: declared, reason: null }
}

export function inferCanonicalApplicability(canonical, expectedPaths) {
  if (canonical?.applicability === 'APPLICABLE' || canonical?.applicability === 'NOT_APPLICABLE') return canonical.applicability
  const paths = canonicalPaths(expectedPaths)
  const changed = canonicalPaths(canonical?.changedPaths)
  const matched = canonicalPaths(canonical?.matchedPaths)
  const unmatched = canonicalPaths(canonical?.unmatchedPaths)
  const dependencyOnly = canonicalPaths(canonical?.dependencyOnlyPaths)
  if (!canonical || typeof canonical.featureId !== 'string' || !canonical.featureId || !exactList(changed, paths)) return null
  if ([...matched, ...unmatched, ...dependencyOnly].some(item => !paths.includes(item))) return null
  if (!exactList([...new Set([...matched, ...unmatched])].sort(), paths)) return null
  if (dependencyOnly.some(item => !unmatched.includes(item))) return null
  return 'APPLICABLE'
}
