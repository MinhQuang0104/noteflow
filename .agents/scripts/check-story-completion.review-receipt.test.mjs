import { digest, TWO_PATHS } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'

for (const [label, options] of [
  ['missing evidence refs', { mutateReview: review => { delete review.evidence_refs; return review } }],
  ['missing risk context', { mutateReview: review => { delete review.risk_context_digest; return review } }],
  ['missing scope digest', { mutateReview: review => { delete review.scope_digest; return review } }],
  ['stale risk context', { mutateReview: review => ({ ...review, risk_context_digest: digest('1') }) }],
  ['stale scope digest', { mutateReview: review => ({ ...review, scope_digest: digest('1') }) }],
  ['tampered evidence body digest', { mutateReview: review => ({ ...review, evidence_refs: review.evidence_refs.map(ref => ({ ...ref, body_digest: 'not-a-digest' })) }) }],
  ['duplicated evidence hunk', { mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: [...evidenceRefs, evidenceRefs[0]] }) }],
  ['reordered multi-path evidence', { implementationPaths: TWO_PATHS, mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: [...evidenceRefs].reverse() }) }],
  ['partial multi-path evidence', { implementationPaths: TWO_PATHS, mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: evidenceRefs.slice(0, 1) }) }],
  ['cross-scope evidence', { mutateReview: (review, { evidenceRefs }) => ({ ...review, evidence_refs: evidenceRefs.map(ref => ({ ...ref, path: 'src/other.txt' })) }) }]
]) test(`review receipt with ${label} fails closed`, () => {
  const f = createCompletionFixture(options)
  try {
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.ready, false, JSON.stringify(result))
    assert.notEqual(result.status, 'READY')
    assert.ok(result.reasons.includes('REVIEW_FRESHNESS_INVALID:A'), JSON.stringify(result.reasons))
  } finally {
    f.cleanup()
  }
})
