import test from 'node:test'
import assert from 'node:assert/strict'
import { autopilotDecisionAllowed, decideReviewOutcome } from './v4-review-policy.mjs'

const pass = { status: 'PASS', complete: true, canonical: { status: 'PASS' }, checks: [{ status: 'PASS' }] }
const lead = { type: 'lead', vendor: 'codex', independent: true }
const human = { type: 'human', vendor: null, independent: false }
const defaults = { risk: { level: 'LOW', flags: [] }, executor: 'lead', reviewer: null,
  findings: [], verification: pass, focusedEvidence: [{ status: 'PASS' }], attemptId: 1, autopilot: false }

test('autopilot binding accepts only the exact P2 decision', () => {
  assert.equal(autopilotDecisionAllowed({ decision: 'APPROVE_ALLOWED' }, 'APPROVE_ALLOWED'), true)
  assert.equal(autopilotDecisionAllowed({ decision: 'REWORK' }, 'APPROVE_ALLOWED'), false)
  assert.equal(autopilotDecisionAllowed(null, 'REWORK'), false)
})

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
  ['MEDIUM human review', { risk: 'MEDIUM', reviewer: human }, 'APPROVE_ALLOWED'],
  ['LOW flagged without reviewer', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] } }, 'BLOCKED'],
  ['LOW structured review', { reviewer: lead, executor: 'agy' }, 'APPROVE_ALLOWED'],
  ['MEDIUM no reviewer', { risk: 'MEDIUM' }, 'BLOCKED'],
]) test(`review policy: ${name}`, () => {
  const request = { ...defaults, ...input }
  const before = JSON.stringify(request)
  const result = decideReviewOutcome(request)
  assert.equal(result.decision, decision)
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasons'])
  assert.ok(result.reasons.length)
  assert.deepEqual(decideReviewOutcome(request), result)
  assert.equal(JSON.stringify(request), before)
})

test('independence is computed from executor, never asserted by the caller', () => {
  assert.equal(decideReviewOutcome({ ...defaults, risk: 'MEDIUM', reviewer: lead }).decision, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(decideReviewOutcome({ ...defaults, risk: 'MEDIUM', executor: 'agy', reviewer: { ...lead, independent: false } }).decision, 'APPROVE_ALLOWED')
})

const policyRows = [
  ['LOW no flags without reviewer', { risk: { level: 'LOW', flags: [] }, reviewer: null }, 'PROGRESS', 'LOW_CANONICAL_PASS_NO_FLAGS'],
  ['LOW no flags with lead', { risk: { level: 'LOW', flags: [] }, reviewer: lead }, 'APPROVE_ALLOWED', 'LOW_REVIEWED'],
  ['LOW no flags with human', { risk: { level: 'LOW', flags: [] }, reviewer: human }, 'APPROVE_ALLOWED', 'LOW_REVIEWED'],
  ['MEDIUM without reviewer', { risk: 'MEDIUM', reviewer: null }, 'BLOCKED', 'REVIEW_MISSING'],
  ['MEDIUM independent lead', { risk: 'MEDIUM', executor: 'agy', reviewer: lead }, 'APPROVE_ALLOWED', 'INDEPENDENT_LEAD_REVIEW'],
  ['MEDIUM same lead', { risk: 'MEDIUM', executor: 'lead', reviewer: { ...lead, independent: false } }, 'HUMAN_REVIEW_REQUIRED', 'SAME_LEAD_REVIEW'],
  ['MEDIUM human', { risk: 'MEDIUM', reviewer: human }, 'APPROVE_ALLOWED', 'HUMAN_MEDIUM_RISK_REVIEW'],
  ['HIGH without reviewer', { risk: 'HIGH', reviewer: null }, 'BLOCKED', 'REVIEW_MISSING'],
  ['HIGH lead', { risk: 'HIGH', reviewer: lead }, 'HUMAN_REVIEW_REQUIRED', 'HIGH_RISK_REQUIRES_HUMAN_REVIEW'],
  ['HIGH human', { risk: 'HIGH', reviewer: human }, 'APPROVE_ALLOWED', 'HUMAN_HIGH_RISK_REVIEW'],
  ...['LOW', 'MEDIUM', 'HIGH'].map(level => [`legacy string ${level}`, { risk: level, reviewer: 'reviewer' }, 'HUMAN_REQUIRED', 'LEGACY_REVIEWER_UNCLASSIFIED']),
  ['flagged LOW without reviewer', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] }, reviewer: null }, 'BLOCKED', 'REVIEW_MISSING'],
  ['flagged LOW independent lead', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] }, executor: 'agy', reviewer: lead }, 'APPROVE_ALLOWED', 'INDEPENDENT_LEAD_REVIEW'],
  ['flagged LOW same lead', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] }, executor: 'lead', reviewer: { ...lead, independent: false } }, 'HUMAN_REVIEW_REQUIRED', 'SAME_LEAD_REVIEW'],
  ['flagged LOW human', { risk: { level: 'LOW', flags: ['PUBLIC_CONTRACT'] }, reviewer: human }, 'APPROVE_ALLOWED', 'HUMAN_MEDIUM_RISK_REVIEW'],
  ['unknown risk', { risk: 'CRITICAL', reviewer: human }, 'HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED'],
  ['unknown reviewer type', { risk: 'MEDIUM', reviewer: { type: 'other' } }, 'HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED'],
  ['invalid attempt id', { findings: [{ class: 'VALID' }], attemptId: 0 }, 'HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED'],
  ['unknown finding class', { findings: [{ class: 'UNKNOWN' }] }, 'HUMAN_REQUIRED', 'POLICY_CASE_UNSPECIFIED'],
]

for (const [name, input, decision, reason] of policyRows) test(`completed review policy table: ${name}`, () => {
  assert.deepEqual(decideReviewOutcome({ ...defaults, ...input }), { decision, reasons: [reason] })
})
