import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import {
  proposeEvolution,
  evaluateEvolution,
  evolutionDigest,
  readEvolutionCandidates,
  validateAdoption,
  validateEvolutionCandidate,
} from './v4-evolution.mjs'
import {
  readObservationEvents,
  recordReflectionRequested,
} from './v4-observations.mjs'

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function digestFile(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
}

function withFixture(callback) {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try { return callback(fixture) } finally { fixture.cleanup() }
}

function candidateFor(fixture, overrides = {}) {
  const head = fixture.git(['rev-parse', 'HEAD'])
  return {
    schema_version: 1,
    candidate_id: overrides.candidate_id ?? 'evolution-fixture-1',
    hypothesis: 'A bounded control-plane projection can reduce repeated artifact reads while preserving verification obligations.',
    observed_problem: 'The bounded fixture repeats an artifact lookup across one action window.',
    evidence_refs: [{ kind: 'observation', ref: 'event-fixture-1', path: 'src/fixture.txt', digest: digestFile(fixture.paths.source) }],
    baseline_source_head: head,
    baseline_architecture_fingerprint: digestText(head),
    workload_class: 'M',
    proposed_scope: { paths: ['.agents/scripts/v4-evolution.mjs'], boundary: 'control-plane-only' },
    expected_effect: 'Reduce measured repeated reads while retaining deterministic verification and review gates.',
    quality_risks: ['A stale projection could hide a required source binding.'],
    evaluation_cases: [{ case_id: 'evolution-fixture-case', checks: ['deterministic-regression', 'quality-gate'] }],
    cost_accounting: { provider_usage: 'UNKNOWN', reflection_input_bytes: 1024 },
    stop_rollback: 'Stop adoption when any deterministic check or quality guard fails; revert the reviewed control-plane scope.',
    status: 'PROPOSED',
    provenance: { kind: 'evolution_proposal', source: 'fixture' },
    ...overrides,
  }
}

function proposalInput(fixture, candidate, overrides = {}) {
  const head = fixture.git(['rev-parse', 'HEAD'])
  return {
    repeated_issue: true,
    reflection_count: 0,
    source_head: head,
    architecture_fingerprint: digestText(head),
    workload_class: 'M',
    evidence_refs: candidate.evidence_refs,
    candidates: [candidate],
    ...overrides,
  }
}

test('one observation without a trigger is recorded but yields NO_CANDIDATE', () => withFixture(fixture => {
  const observation = recordReflectionRequested(fixture.root, {
    story_id: fixture.storyId,
    session_id: 'session-one',
    attempt_id: 'reflection-one',
    payload: { note: 'one observed issue, not a repeated pattern' },
    provenance: { kind: 'lead_observer', source: 'fixture' },
  })
  assert.equal(observation.status, 'RECORDED')
  const result = proposeEvolution(fixture.root, { observations: readObservationEvents(fixture.root), candidates: [] })
  assert.equal(result.status, 'NO_CANDIDATE')
  assert.ok(result.reasons.includes('TRIGGER_NOT_PRESENT'))
  assert.equal(readObservationEvents(fixture.root).length, 1)
}))

test('repeated issue creates at most three bounded candidates and never applies one', () => withFixture(fixture => {
  const candidate = candidateFor(fixture)
  const before = [
    readFileSync(fixture.paths.activeRun, 'utf8'),
    readFileSync(fixture.paths.story, 'utf8'),
    readFileSync(fixture.paths.plan, 'utf8'),
  ]
  const result = proposeEvolution(fixture.root, proposalInput(fixture, candidate))
  assert.equal(result.status, 'PROPOSED', JSON.stringify(result))
  assert.equal(result.candidates.length, 1)
  assert.equal(result.auto_apply, false)
  assert.equal(result.adoption, 'AWAITING_HUMAN')
  assert.equal(validateEvolutionCandidate(fixture.root, result.candidates[0]).status, 'VALID')
  assert.equal(readEvolutionCandidates(fixture.root).length, 1)
  assert.deepEqual([
    readFileSync(fixture.paths.activeRun, 'utf8'),
    readFileSync(fixture.paths.story, 'utf8'),
    readFileSync(fixture.paths.plan, 'utf8'),
  ], before)
}))

test('reflection and output budgets fail closed', () => withFixture(fixture => {
  const candidate = candidateFor(fixture)
  assert.equal(proposeEvolution(fixture.root, proposalInput(fixture, candidate, { reflection_count: 2 })).status, 'NO_CANDIDATE')
  const tooMany = Array.from({ length: 4 }, (_, index) => candidateFor(fixture, { candidate_id: `evolution-${index}` }))
  assert.equal(proposeEvolution(fixture.root, proposalInput(fixture, candidate, { candidates: tooMany })).status, 'BLOCKED')
  assert.equal(proposeEvolution(fixture.root, { repeated_issue: true, candidates: [candidate], summary: 'x'.repeat(13 * 1024) }).status, 'BLOCKED')
  const oversized = candidateFor(fixture, { hypothesis: 'x'.repeat(2500) })
  const oversizedResult = proposeEvolution(fixture.root, proposalInput(fixture, oversized))
  assert.equal(oversizedResult.status, 'NO_CANDIDATE')
  assert.equal(readEvolutionCandidates(fixture.root).length, 0)
}))

test('candidate scope and stale baseline/evidence are rejected without product mutation', () => withFixture(fixture => {
  const candidate = candidateFor(fixture, { proposed_scope: { paths: ['AGENTS.md', 'src/product.js'] } })
  assert.equal(validateEvolutionCandidate(fixture.root, candidate).status, 'INVALID')
  const staleBaseline = candidateFor(fixture, { baseline_source_head: '0'.repeat(40) })
  const staleBaselineResult = validateEvolutionCandidate(fixture.root, staleBaseline)
  assert.equal(staleBaselineResult.status, 'STALE', JSON.stringify(staleBaselineResult))
  const staleEvidence = candidateFor(fixture, { evidence_refs: [{ kind: 'source', ref: 'source-1', path: 'src/fixture.txt', digest: 'sha256:' + '0'.repeat(64) }] })
  const staleEvidenceResult = validateEvolutionCandidate(fixture.root, staleEvidence)
  assert.equal(staleEvidenceResult.status, 'STALE', JSON.stringify(staleEvidenceResult))
  assert.equal(readEvolutionCandidates(fixture.root).length, 0)
}))

test('evaluation separates deterministic evidence, missing measurements, and self-rating', () => withFixture(fixture => {
  const candidate = candidateFor(fixture)
  const inconclusive = evaluateEvolution(candidate, {
    comparability: { verdict: 'COMPARABLE', reasons: [] },
    deterministic_checks: [{ id: 'fixture-check', status: 'PASS' }],
    quality_checks: [{ id: 'quality-check', status: 'PASS' }],
  })
  assert.equal(inconclusive.status, 'INCONCLUSIVE')
  assert.equal(inconclusive.recommendation, 'INCONCLUSIVE')
  assert.equal(inconclusive.metrics.token_savings.status, 'INCONCLUSIVE')
  const evaluated = evaluateEvolution(candidate, {
    comparability: { verdict: 'COMPARABLE', reasons: [] },
    deterministic_checks: [{ id: 'fixture-check', status: 'PASS' }],
    quality_checks: [{ id: 'quality-check', status: 'PASS' }],
    observed_usage: { baseline_tokens: 100, candidate_tokens: 90, measurement_kind: 'provider' },
    model_self_rating: 'excellent',
  })
  assert.equal(evaluated.status, 'EVALUATED')
  assert.equal(evaluated.recommendation, 'AWAITING_HUMAN')
  assert.ok(evaluated.reasons.includes('MODEL_SELF_RATING_NOT_AUTHORITATIVE'))
  const incomparable = evaluateEvolution(candidate, {
    comparability: { verdict: 'INCOMPARABLE', reasons: ['toolchain_mismatch'] },
    deterministic_checks: [{ id: 'fixture-check', status: 'PASS' }],
    quality_checks: [{ id: 'quality-check', status: 'PASS' }],
    observed_usage: { baseline_tokens: 100, candidate_tokens: 90, measurement_kind: 'provider' },
  })
  assert.equal(incomparable.status, 'INCONCLUSIVE')
  assert.ok(incomparable.reasons.includes('COMPARISON_NOT_COMPARABLE'))
}))

test('adoption validation requires exact human-bound candidate/evaluation/scope', () => withFixture(fixture => {
  const candidate = candidateFor(fixture)
  const proposed = proposeEvolution(fixture.root, proposalInput(fixture, candidate))
  const boundCandidate = proposed.candidates[0]
  const boundEvaluation = evaluateEvolution(boundCandidate, {
    comparability: { verdict: 'COMPARABLE', reasons: [] },
    deterministic_checks: [{ id: 'fixture-check', status: 'PASS' }],
    quality_checks: [{ id: 'quality-check', status: 'PASS' }],
    observed_usage: { baseline_tokens: 100, candidate_tokens: 90, measurement_kind: 'provider' },
  })
  const scope = boundCandidate.proposed_scope
  const record = {
    schema_version: 1,
    candidate_id: boundCandidate.candidate_id,
    candidate_digest: evolutionDigest(boundCandidate),
    evaluation_digest: evolutionDigest(boundEvaluation),
    reviewed_scope: scope,
    decision: 'APPROVED',
    decision_source: { kind: 'human', actor: 'fixture-human', recorded_at: '2026-09-28T00:00:00.000Z' },
  }
  assert.equal(validateAdoption(record, boundCandidate, boundEvaluation, scope).status, 'VALID')
  assert.equal(validateAdoption({ ...record, decision_source: { kind: 'model' } }, boundCandidate, boundEvaluation, scope).status, 'INVALID')
  assert.equal(validateAdoption({ ...record, evaluation_digest: digestText('stale') }, boundCandidate, boundEvaluation, scope).status, 'STALE')
  assert.equal(validateAdoption({ ...record, reviewed_scope: { paths: ['.agents/scripts/other.mjs'] } }, boundCandidate, boundEvaluation, scope).status, 'STALE')
}))
