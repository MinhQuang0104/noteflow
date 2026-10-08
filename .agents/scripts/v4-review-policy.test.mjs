import test from 'node:test'
import assert from 'node:assert/strict'
import { decideReviewOutcome } from './v4-review-policy.mjs'

const pass = { status: 'PASS', complete: true, canonical: { status: 'PASS' }, checks: [{ status: 'PASS' }] }
const lead = { type: 'lead', vendor: 'codex', independent: true }
const human = { type: 'human', vendor: null, independent: false }
const defaults = { risk: { level: 'LOW', flags: [] }, executor: 'lead', reviewer: null,
  findings: [], verification: pass, focusedEvidence: [{ status: 'PASS' }], attemptId: 1, autopilot: false }

for (const [name, input, decision] of [
  ['LOW canonical PASS without flags', {}, 'PROGRESS'],
  ['MEDIUM independent lead', { risk: 'MEDIUM', executor: 'agy', reviewer: lead }, 'APPROVE_ALLOWED'],
  ['MEDIUM same lead', { risk: 'MEDIUM', reviewer: { ...lead, independent: false } }, 'HUMAN_REVIEW_REQUIRED'],
  ['HIGH independent lead', { risk: 'HIGH', executor: 'agy', reviewer: lead }, 'HUMAN_REVIEW_REQUIRED'],
  ['HIGH same lead', { risk: 'HIGH', reviewer: { ...lead, independent: false } }, 'HUMAN_REVIEW_REQUIRED'],
  ['HIGH human', { risk: 'HIGH', reviewer: human }, 'APPROVE_ALLOWED'],
  ['VALID correction at attempt 3', { findings: [{ class: 'VALID' }], attemptId: 3 }, 'REWORK'],
  ['VALID correction exhausted at attempt 4', { findings: [{ class: 'VALID' }], attemptId: 4 }, 'HUMAN_REQUIRED'],
  ['spec ambiguity', { findings: [{ class: 'SPEC_AMBIGUITY' }] }, 'HUMAN_REQUIRED'],
  ['human decision', { findings: [{ class: 'NEEDS_HUMAN_DECISION' }] }, 'HUMAN_REQUIRED'],
  ['mixed VALID and ambiguity', { findings: [{ class: 'VALID' }, { class: 'SPEC_AMBIGUITY' }] }, 'HUMAN_REQUIRED'],
  ['false positives are closed', { risk: 'HIGH', reviewer: human, findings: [{ class: 'FALSE_POSITIVE' }] }, 'APPROVE_ALLOWED'],
  ['FAIL', { verification: { ...pass, status: 'FAIL' } }, 'BLOCKED'],
  ['ERROR', { verification: { ...pass, status: 'ERROR' } }, 'BLOCKED'],
  ['incomplete coverage', { verification: { ...pass, status: 'INCOMPLETE', complete: false } }, 'BLOCKED'],
  ['incomplete PASS', { verification: { ...pass, complete: false } }, 'BLOCKED'],
  ['canonical FAIL', { verification: { ...pass, canonical: { status: 'FAIL' } } }, 'BLOCKED'],
  ['focused FAIL', { risk: 'MEDIUM', executor: 'agy', reviewer: lead, focusedEvidence: [{ status: 'FAIL' }] }, 'BLOCKED'],
  ['focused ERROR', { focusedEvidence: [{ status: 'ERROR' }] }, 'BLOCKED'],
  ['focused missing', { focusedEvidence: [{ status: 'SKIPPED' }] }, 'BLOCKED'],
  ['focused empty', { risk: 'MEDIUM', executor: 'agy', reviewer: lead, focusedEvidence: [] }, 'BLOCKED'],
  ['focused omitted', { risk: 'MEDIUM', executor: 'agy', reviewer: lead, focusedEvidence: undefined }, 'BLOCKED'],
  ['failed checks outrank rework', { verification: { ...pass, status: 'FAIL' }, findings: [{ class: 'VALID' }] }, 'BLOCKED'],
  ['MEDIUM human unspecified', { risk: 'MEDIUM', reviewer: human }, 'HUMAN_REQUIRED'],
  ['LOW flagged unspecified', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] } }, 'HUMAN_REQUIRED'],
  ['LOW reviewed unspecified', { reviewer: lead, executor: 'agy' }, 'HUMAN_REQUIRED'],
  ['MEDIUM no reviewer unspecified', { risk: 'MEDIUM' }, 'HUMAN_REQUIRED'],
]) test(`review policy: ${name}`, () => {
  const request = { ...defaults, ...input }
  const before = JSON.stringify(request)
  const result = decideReviewOutcome(request)
  assert.equal(result.decision, decision)
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasons'])
  assert.ok(result.reasons.length)
  if (name.includes('unspecified')) assert.deepEqual(result.reasons, ['POLICY_CASE_UNSPECIFIED'])
  assert.deepEqual(decideReviewOutcome(request), result)
  assert.equal(JSON.stringify(request), before)
})

test('independence is computed from executor, never asserted by the caller', () => {
  assert.equal(decideReviewOutcome({ ...defaults, risk: 'MEDIUM', reviewer: lead }).decision, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(decideReviewOutcome({ ...defaults, risk: 'MEDIUM', executor: 'agy', reviewer: { ...lead, independent: false } }).decision, 'APPROVE_ALLOWED')
})
