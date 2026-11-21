import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, prepareVerification, makeReviewEvidence, scopeDigest } from './v4-verification-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { validateObligationEvidence, validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { recordSliceReview, verifySlice } from './v4-action-kernel.mjs'
import { runV4Story } from './v4-story-runner.mjs'

// Story 4.1 run 6: a verify child reported PASS while the Plan's post-checkpoint
// e2e obligation had not been run. Each obligation must now cite evidence.
const OBLIGATIONS = ['focused fixture check passes', 'full e2e suite passes after the slice checkpoint']
const E2E = { command: 'local.ps1 e2e', exit_code: 0, tool: 'playwright', environment: 'fixture' }
const ledger = (overrides = {}) => [
  { obligation: OBLIGATIONS[0], evidence: [{ check: 'focused-fixture' }] },
  { obligation: OBLIGATIONS[1], evidence: [{ command: 1 }] }
].map((item, index) => ({ ...item, ...(overrides[index] ?? {}) }))

function reviewSetup(f) {
  const prepared = prepareVerification(f)
  const pendingResult = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview })
  assert.equal(pendingResult.status, 'REVIEW_REQUIRED', JSON.stringify(pendingResult))
  const evidence = makeReviewEvidence(f, prepared.preview)
  const review = extra => ({
    judgment: 'APPROVE', reviewer: 'same-lead', pending_fingerprint: pendingResult.pending.fingerprint,
    scope_paths: f.changedPaths, scope_digest: scopeDigest(evidence), change_evidence: evidence,
    answers: pendingResult.pending.review_questions.map(item => ({ id: item.id, answer: 'confirmed' })),
    commands: [{ command: 'same-lead review', exit_code: 0, tool: 'reviewer', environment: 'fixture' }, E2E],
    ...extra
  })
  const request = extra => ({
    ...f.verifyRequest, operation: 'record-review', preview: prepared.preview, pending: pendingResult.pending,
    plan_template: verificationTemplate(f, true), review: review(extra)
  })
  return { prepared, pending: pendingResult.pending, review, request }
}

test('obligation ledger validator requires every Plan obligation in order with passing evidence', () => {
  const sources = { checks: [{ check_id: 'focused-fixture', status: 'PASS' }, { check_id: 'lint', status: 'FAIL' }], commands: [{ exit_code: 0 }, E2E, { exit_code: 1 }] }
  assert.deepEqual(validateObligationEvidence(ledger(), OBLIGATIONS, sources), [])
  assert.deepEqual(validateObligationEvidence(undefined, [], sources), [])
  assert.deepEqual(validateObligationEvidence([], undefined, sources), [])
  for (const [label, value] of [
    ['missing', undefined], ['empty', []], ['one entry', ledger().slice(0, 1)], ['reordered', ledger().reverse()],
    ['altered text', ledger({ 1: { obligation: 'full e2e suite passes' } })],
    ['failed command', ledger({ 1: { evidence: [{ command: 2 }] } })],
    ['unknown command', ledger({ 1: { evidence: [{ command: 9 }] } })],
    ['failed check', ledger({ 0: { evidence: [{ check: 'lint' }] } })],
    ['unknown check', ledger({ 0: { evidence: [{ check: 'other' }] } })],
    ['one of two refs failing', ledger({ 1: { evidence: [{ command: 1 }, { command: 2 }] } })]
  ]) assert.deepEqual(validateObligationEvidence(value, OBLIGATIONS, sources), ['PLAN_OBLIGATION_UNEVIDENCED'], label)
  for (const [label, value] of [
    ['not an array', {}], ['no evidence', ledger({ 0: { evidence: [] } })],
    ['two keys in a ref', ledger({ 0: { evidence: [{ check: 'focused-fixture', command: 0 }] } })],
    ['negative index', ledger({ 1: { evidence: [{ command: -1 }] } })],
    ['unknown ref kind', ledger({ 1: { evidence: [{ receipt: 'x' }] } })],
    ['non-string obligation', ledger({ 0: { obligation: 1 } })]
  ]) assert.deepEqual(validateObligationEvidence(value, OBLIGATIONS, sources), ['PLAN_OBLIGATION_EVIDENCE_INVALID'], label)
  assert.deepEqual(validateObligationEvidence(ledger({ 0: { evidence: [{ check: 'other' }] } }), OBLIGATIONS, { ...sources, checks: null }), [])
})

test('APPROVE without a complete obligation ledger is refused without mutation', () => {
  const f = fixture('HIGH', { obligations: OBLIGATIONS })
  try {
    const { pending, request } = reviewSetup(f)
    assert.deepEqual(pending.verification_obligations, OBLIGATIONS)
    for (const [extra, status, reason] of [
      [{}, 'BLOCKED', 'PLAN_OBLIGATION_UNEVIDENCED'],
      [{ obligation_evidence: ledger().slice(0, 1) }, 'BLOCKED', 'PLAN_OBLIGATION_UNEVIDENCED'],
      [{ obligation_evidence: ledger({ 1: { evidence: [{ command: 5 }] } }) }, 'BLOCKED', 'PLAN_OBLIGATION_UNEVIDENCED'],
      [{ obligation_evidence: ledger({ 1: { evidence: [] } }) }, 'INVALID', 'PLAN_OBLIGATION_EVIDENCE_INVALID']
    ]) {
      const result = recordSliceReview(f.root, request(extra))
      assert.equal(result.status, status, JSON.stringify(result))
      assert.deepEqual(result.reasons, [reason])
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
      assert.equal(git(f.root, 'status', '--porcelain'), '')
    }
    const failedE2e = request({ obligation_evidence: ledger() })
    failedE2e.review.commands[1] = { ...E2E, exit_code: 1 }
    assert.deepEqual(recordSliceReview(f.root, failedE2e).reasons, ['PLAN_OBLIGATION_UNEVIDENCED'])
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
  } finally { f.cleanup() }
})

test('APPROVE with a complete obligation ledger persists it in the review receipt', () => {
  const f = fixture('HIGH', { obligations: OBLIGATIONS })
  try {
    const { request } = reviewSetup(f)
    const result = recordSliceReview(f.root, request({ obligation_evidence: ledger() }))
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.obligation_evidence, ledger())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    assert.deepEqual(plan.slices[0].verification_obligations, OBLIGATIONS)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'review'), [])
    assert.deepEqual(validateReceipt(f.root, { ...plan, slices: [{ ...plan.slices[0], verification_obligations: OBLIGATIONS.slice(1) }] }, 'A', 'review'),
      ['PLAN_OBLIGATION_UNEVIDENCED'])
  } finally { f.cleanup() }
})

test('CHANGES_REQUIRED needs no obligation ledger', () => {
  const f = fixture('HIGH', { obligations: OBLIGATIONS })
  try {
    const { request } = reviewSetup(f)
    const result = recordSliceReview(f.root, request({ judgment: 'CHANGES_REQUIRED' }))
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['CHANGES_REQUIRED'])
  } finally { f.cleanup() }
})

test('Runner owner review APPROVE is held to the same obligation ledger', () => {
  const f = fixture('HIGH', { obligations: OBLIGATIONS })
  try {
    const { request } = reviewSetup(f)
    const owner = extra => runV4Story(f.root, '9.1', { expectedHead: f.head, operation: 'record-owner-review',
      input: { ...request({ reviewer: undefined, ...extra }), operation: undefined } })
    const refused = owner({})
    assert.equal(refused.status, 'BLOCKED', JSON.stringify(refused))
    assert.deepEqual(refused.reasons, ['PLAN_OBLIGATION_UNEVIDENCED'])
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    const applied = owner({ obligation_evidence: ledger() })
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, REVIEW_RECEIPT), 'utf8')).obligation_evidence, ledger())
  } finally { f.cleanup() }
})

test('LOW NO_REVIEW pass must cite a PASS check for every obligation and records the ledger', () => {
  const obligations = ['focused fixture check passes']
  const f = fixture('LOW', { obligations })
  try {
    const prepared = prepareVerification(f)
    const verify = extra => verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false), ...extra
    })
    for (const extra of [{}, { obligation_evidence: [{ obligation: obligations[0], evidence: [{ command: 0 }] }] }]) {
      const refused = verify(extra)
      assert.equal(refused.status, 'BLOCKED', JSON.stringify(refused))
      assert.deepEqual(refused.reasons, ['PLAN_OBLIGATION_UNEVIDENCED'])
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
      assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    }
    const evidence = [{ obligation: obligations[0], evidence: [{ check: 'focused-fixture' }] }]
    const applied = verify({ obligation_evidence: evidence })
    assert.equal(applied.status, 'APPLIED', JSON.stringify(applied))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.deepEqual(receipt.obligation_evidence, evidence)
    assert.deepEqual(validateReceipt(f.root, frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')), 'A', 'verification'), [])
  } finally { f.cleanup() }
})
