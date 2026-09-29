import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import {
  buildCandidateBundle,
  compareBundles,
  normalizeComparisonBundle,
  writeCandidateBundle,
} from './benchmark-v4.mjs'
import { evaluateEvolution } from './v4-evolution.mjs'

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function caseFor(caseId = 'L-fixture', overrides = {}) {
  return {
    case_id: caseId,
    workload_class: 'L',
    input_digest: null,
    trial_id: 'trial-1',
    check_results: [{ id: 'fixture-check', status: 'PASS' }],
    instruction_bytes: { implement_slice: 1000, verify_slice: 1100 },
    observed_usage: null,
    correction_cycles: 0,
    coverage: 'DETERMINISTIC',
    exclusions: ['provider_usage_unavailable'],
    ...overrides,
  }
}

function bundle(variant, overrides = {}) {
  return {
    schema_version: 2,
    variant,
    source_head: variant === 'baseline' ? 'a'.repeat(40) : 'b'.repeat(40),
    architecture_fingerprint: variant === 'baseline' ? `sha256:${'a'.repeat(64)}` : `sha256:${'b'.repeat(64)}`,
    corpus_digest: `sha256:${'c'.repeat(64)}`,
    toolchain: { node: 'v24.21.0', npm: '11.6.4', git: '2.49.0.windows.1', platform: 'win32' },
    model: null,
    effort: null,
    source_paths: ['AGENTS.md'],
    source_bindings: [{ path: 'AGENTS.md', digest: `sha256:${'d'.repeat(64)}`, bytes: 10 }],
    evidence: {
      run_id: null,
      runner_digest: null,
      corpus_digest: `sha256:${'c'.repeat(64)}`,
      status: 'UNVERIFIED',
      coverage: 'UNKNOWN',
      evidence_index: [],
    },
    instruction_measurement: null,
    observed_usage: null,
    cases: [caseFor()],
    ...overrides,
  }
}

function candidateWithReasons(overrides = {}) {
  return bundle('candidate', {
    comparability_reasons: {
      source_head: 'The candidate is the post-upgrade checkout.',
      architecture_fingerprint: 'The architecture fingerprint intentionally changed.',
    },
    ...overrides,
  })
}

test('comparison rejects identity differences without explicit comparability reasons', () => {
  const baseline = bundle('baseline')
  const candidate = bundle('candidate')
  const rejected = compareBundles(baseline, candidate)
  assert.equal(rejected.status, 'INCOMPARABLE')
  assert.ok(rejected.comparability.reasons.includes('source_head_MISMATCH_REQUIRES_EXPLICIT_REASON'))
  assert.ok(rejected.comparability.reasons.includes('architecture_fingerprint_MISMATCH_REQUIRES_EXPLICIT_REASON'))

  const comparable = compareBundles(baseline, candidateWithReasons())
  assert.equal(comparable.status, 'COMPARABLE', JSON.stringify(comparable))
  assert.equal(comparable.comparability.explicit_differences.length, 2)
  assert.equal(comparable.metrics.token_usage.status, 'INCONCLUSIVE')

  const modelMismatch = compareBundles(baseline, candidateWithReasons({ model: 'fixture-model' }))
  assert.equal(modelMismatch.status, 'INCOMPARABLE')
  const modelExplained = compareBundles(baseline, candidateWithReasons({
    model: 'fixture-model',
    comparability_reasons: {
      source_head: 'source changed with the candidate',
      architecture_fingerprint: 'architecture changed with the candidate',
      model: 'The paired run used an explicitly different model; no quality claim is made.',
    },
  }))
  assert.equal(modelExplained.status, 'INCOMPARABLE')
  assert.ok(modelExplained.comparability.reasons.includes('model_MISMATCH'))

  const workloadMismatch = compareBundles(baseline, candidateWithReasons({ cases: [caseFor('L-fixture', { workload_class: 'M' })] }))
  assert.equal(workloadMismatch.status, 'INCOMPARABLE')
  assert.ok(workloadMismatch.comparability.reasons.includes('CASE_WORKLOAD_CLASS_MISMATCH:L-fixture'))
})

test('comparison keeps per-case coverage and unverified quality separate', () => {
  const baseline = bundle('baseline', {
    cases: [
      caseFor('L-fixture'),
      caseFor('M-fixture', { workload_class: 'M', instruction_bytes: { implement_slice: 2000, verify_slice: 2100 } }),
      caseFor('H-fixture', { workload_class: 'H', instruction_bytes: { implement_slice: 3000, verify_slice: 3100 } }),
    ],
  })
  const candidate = candidateWithReasons({
    cases: [
      caseFor('L-fixture', { instruction_bytes: { implement_slice: 900, verify_slice: 1000 } }),
      caseFor('M-fixture', { workload_class: 'M', instruction_bytes: { implement_slice: 1800, verify_slice: 1900 } }),
      caseFor('H-fixture', { workload_class: 'H', instruction_bytes: { implement_slice: 3200, verify_slice: 3300 }, check_results: [{ id: 'fault-injection', status: 'FAIL' }] }),
    ],
  })
  const result = compareBundles(baseline, candidate)
  assert.equal(result.status, 'COMPARABLE')
  assert.equal(result.cases.length, 3)
  assert.equal(result.metrics.instruction_bytes.status, 'INCONCLUSIVE')
  assert.equal(result.metrics.token_usage.status, 'INCONCLUSIVE')
  assert.equal(result.metrics.quality, 'INCONCLUSIVE')
  assert.equal(result.cases.find(item => item.case_id === 'H-fixture').coverage.candidate, 'DETERMINISTIC')
})

test('normalization rejects malformed bundles and the compare CLI emits JSON only', () => {
  const invalid = normalizeComparisonBundle({ schema_version: 1, variant: 'other' }, 'baseline')
  assert.equal(invalid.status, 'INVALID')
  assert.ok(invalid.reasons.includes('INVALID_BUNDLE_VARIANT'))

  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try {
    const baselineFile = path.join(fixture.root, 'benchmark-baseline.json')
    const candidateFile = path.join(fixture.root, 'benchmark-candidate.json')
    writeFileSync(baselineFile, `${JSON.stringify(bundle('baseline'))}\n`)
    writeFileSync(candidateFile, `${JSON.stringify(candidateWithReasons())}\n`)
    const cli = spawnSync(process.execPath, [
      path.resolve(process.cwd(), '.agents/scripts/benchmark-v4.mjs'),
      'compare', '--baseline', baselineFile, '--candidate', candidateFile,
    ], { cwd: fixture.root, encoding: 'utf8', windowsHide: true })
    assert.equal(cli.status, 0, cli.stderr)
    const output = JSON.parse(cli.stdout)
    assert.equal(output.status, 'COMPARABLE')
    assert.equal(typeof output.metrics.token_usage.status, 'string')
  } finally {
    fixture.cleanup()
  }
})

test('L/M/H candidate bundle and fault guards use isolated fixtures without Story lifecycle mutation', () => {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try {
    const corpusPath = path.resolve(process.cwd(), '.agents/scripts/fixtures/v4-architecture/corpus.json')
    const target = path.join(fixture.root, '.agents/scripts/fixtures/v4-architecture/corpus.json')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(corpusPath))
    const before = {
      story: readFileSync(fixture.paths.story, 'utf8'),
      plan: readFileSync(fixture.paths.plan, 'utf8'),
      pointer: readFileSync(fixture.paths.activeRun, 'utf8'),
    }
    const candidate = buildCandidateBundle(fixture.root, { source_paths: [], run_id: 'builder-regression' })
    assert.deepEqual(candidate.cases.map(item => item.workload_class), ['L', 'M', 'H'])
    assert.deepEqual(candidate.cases.map(item => item.case_id), ['L-mapped-low', 'M-mixed-medium', 'H-stale-recovery'])
    assert.ok(candidate.cases.every(item => item.exclusions.includes('real_story_quality_unmeasured')))
    const stored = writeCandidateBundle(fixture.root, candidate)
    assert.equal(stored.status, 'RECORDED')
    assert.equal(writeCandidateBundle(fixture.root, candidate).status, 'NOOP')
    assert.deepEqual({
      story: readFileSync(fixture.paths.story, 'utf8'),
      plan: readFileSync(fixture.paths.plan, 'utf8'),
      pointer: readFileSync(fixture.paths.activeRun, 'utf8'),
    }, before)
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
    assert.equal(corpus.cases.find(item => item.workload_class === 'L').expected, 'PASS_NO_REVIEW')
    assert.equal(corpus.cases.find(item => item.workload_class === 'M').expected, 'INCOMPLETE_REVIEW_REQUIRED')
    assert.equal(corpus.cases.find(item => item.workload_class === 'H').expected, 'STALE_RECOVERY_REQUIRED')
  } finally {
    fixture.cleanup()
  }
})

function verifiedCase(caseId = 'L-fixture', overrides = {}) {
  return {
    case_id: caseId,
    workload_class: 'L',
    input_digest: `sha256:${'1'.repeat(64)}`,
    trial_id: 'trial-1',
    source_head: 'a'.repeat(40),
    runner_digest: `sha256:${'2'.repeat(64)}`,
    toolchain: { node: 'v24.21.0', platform: 'win32' },
    started_at: '2026-09-28T00:00:00.000Z',
    ended_at: '2026-09-28T00:00:01.000Z',
    cwd: 'C:/fixture',
    argv: ['node', 'runner'],
    evidence_refs: [{ kind: 'raw-result', ref: `cases/${caseId}.json`, digest: `sha256:${'3'.repeat(64)}` }],
    actual_observations: { canonical_status: 'PASS' },
    assertions: [{ id: 'scenario-result', status: 'PASS' }],
    required_check_coverage: { status: 'COMPLETE', required: 1, observed: 1 },
    check_results: [{ id: 'fixture-check', status: 'PASS', exit_code: 0, evidence_ref: `sha256:${'4'.repeat(64)}` }],
    instruction_bytes: {},
    observed_usage: null,
    correction_cycles: 0,
    coverage: 'COMPLETE_VERIFIED',
    exclusions: ['provider_usage_unavailable'],
    ...overrides,
  }
}

function verifiedBundle(variant, overrides = {}) {
  const sourceHead = variant === 'baseline' ? 'a'.repeat(40) : 'b'.repeat(40)
  const sourceDigest = variant === 'baseline' ? 'd' : 'e'
  return {
    schema_version: 2,
    variant,
    source_head: sourceHead,
    architecture_fingerprint: `sha256:${variant === 'baseline' ? 'a' : 'b'.repeat(1)}${'a'.repeat(63)}`,
    corpus_digest: `sha256:${'c'.repeat(64)}`,
    toolchain: { node: 'v24.21.0', platform: 'win32' },
    model: null,
    effort: null,
    source_paths: ['AGENTS.md'],
    source_bindings: [{ path: 'AGENTS.md', digest: `sha256:${sourceDigest.repeat(64)}`, bytes: 10 }],
    evidence: {
      run_id: `${variant}-run-1`,
      runner_digest: `sha256:${'2'.repeat(64)}`,
      corpus_digest: `sha256:${'c'.repeat(64)}`,
      status: 'VERIFIED',
      coverage: 'COMPLETE_VERIFIED',
      evidence_index: [{ ref: 'cases/L-fixture.json', digest: `sha256:${'3'.repeat(64)}` }],
    },
    instruction_measurement: null,
    observed_usage: null,
    cases: [verifiedCase('L-fixture', {
      source_head: sourceHead,
      evidence_refs: [{ kind: 'raw-result', ref: 'cases/L-fixture.json', digest: `sha256:${'3'.repeat(64)}` }],
      instruction_bytes: { implement_slice: 1000, verify_slice: 1100 },
    })],
    comparability_reasons: {
      source_head: 'The paired checkout is expected to differ.',
      architecture_fingerprint: 'The architecture fingerprint is revision-bound.',
      source_bindings: 'Source bindings are revision-bound.',
    },
    ...overrides,
  }
}

test('R02 regression: missing case results are UNKNOWN and never synthesize PASS', () => {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try {
    const corpusPath = path.resolve(process.cwd(), '.agents/scripts/fixtures/v4-architecture/corpus.json')
    const target = path.join(fixture.root, '.agents/scripts/fixtures/v4-architecture/corpus.json')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(corpusPath))
    const candidate = buildCandidateBundle(fixture.root, { source_paths: [] })
    assert.equal(candidate.schema_version, 2)
    assert.deepEqual(candidate.cases.map(item => item.check_results), [[], [], []])
    assert.deepEqual(candidate.cases.map(item => item.correction_cycles), [null, null, null])
    assert.deepEqual(candidate.cases.map(item => item.coverage), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'])
    assert.ok(candidate.cases.every(item => !item.check_results.some(check => check.status === 'PASS')))
  } finally {
    fixture.cleanup()
  }
})

test('R02 regression: unbound evidence is inconclusive even when raw labels say PASS', () => {
  const baseline = verifiedBundle('baseline')
  const candidate = verifiedBundle('candidate', {
    evidence: { ...verifiedBundle('candidate').evidence, status: 'UNVERIFIED', coverage: 'UNKNOWN' },
  })
  const result = compareBundles(baseline, candidate)
  assert.notEqual(result.metrics.quality, 'PASS')
  assert.ok(result.limitations.some(item => item.toLowerCase().includes('evidence')))
})

test('R02 regression: contradictory checks and tampered raw evidence cannot become quality PASS', () => {
  const invalid = normalizeComparisonBundle({ ...verifiedBundle('candidate'), cases: [verifiedCase('L-fixture', { check_results: [{ id: 'duplicate', status: 'PASS', exit_code: 0 }, { id: 'duplicate', status: 'PASS', exit_code: 1 }] })] }, 'candidate')
  assert.equal(invalid.status, 'INVALID')
  assert.ok(invalid.reasons.includes('INVALID_CHECK_RESULTS:L-fixture'))

  const evidenceRoot = mkdtempSync(path.join(os.tmpdir(), 'v4-bundle-evidence-'))
  try {
    const makeBundle = (variant) => {
      const sourceHead = variant === 'baseline' ? 'a'.repeat(40) : 'b'.repeat(40)
      const inputDigest = `sha256:${'1'.repeat(64)}`
      const ref = `${variant}/cases/L-fixture.json`
      const raw = { case_id: 'L-fixture', input_digest: inputDigest, source_head: sourceHead, actual: 'bound' }
      const file = path.join(evidenceRoot, ref)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, `${JSON.stringify(raw)}\n`)
      const digest = digestBytes(readFileSync(file))
      return verifiedBundle(variant, {
        evidence: { ...verifiedBundle(variant).evidence, evidence_index: [{ ref, digest }] },
        cases: [verifiedCase('L-fixture', { source_head: sourceHead, input_digest: inputDigest, evidence_refs: [{ kind: 'raw-result', ref, digest }] })],
      })
    }
    const baseline = makeBundle('baseline')
    const candidate = makeBundle('candidate')
    assert.equal(compareBundles(baseline, candidate, { evidenceRoot }).evidence.status, 'VERIFIED')
    writeFileSync(path.join(evidenceRoot, 'candidate/cases/L-fixture.json'), '{"case_id":"L-fixture","tampered":true}\n')
    const tampered = compareBundles(baseline, candidate, { evidenceRoot })
    assert.equal(tampered.metrics.quality, 'INCONCLUSIVE')
    assert.ok(tampered.evidence.reasons.includes('EVIDENCE_DIGEST_MISMATCH:L-fixture'))
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true })
  }
})

test('R04 regression: instruction metrics require one shared basis and are not multiplied by L/M/H rows', () => {
  const measurement = (profile = 'v4-lite-normal-action') => ({
    status: 'MEASURED',
    method: 'normal-action-instruction-source-v1',
    basis_id: 'basis-1',
    basis_digest: `sha256:${'4'.repeat(64)}`,
    profile,
    input_digest: `sha256:${'5'.repeat(64)}`,
    actions: {
      implement_slice: { required_instruction_bytes: 100, projection_bytes: 0, coverage: 'COMPLETE' },
      verify_slice: { required_instruction_bytes: 120, projection_bytes: 0, coverage: 'COMPLETE' },
    },
  })
  const cases = [
    verifiedCase('L-fixture'),
    verifiedCase('M-fixture', { workload_class: 'M' }),
    verifiedCase('H-fixture', { workload_class: 'H' }),
  ]
  const baseline = verifiedBundle('baseline', { cases, instruction_measurement: measurement() })
  const candidate = verifiedBundle('candidate', { cases, instruction_measurement: measurement() })
  const result = compareBundles(baseline, candidate)
  assert.equal(result.metrics.instruction_bytes.implement_slice.baseline, 100)
  assert.equal(result.metrics.instruction_bytes.implement_slice.candidate, 100)
  assert.equal(result.metrics.instruction_bytes.verify_slice.baseline, 120)

  const mismatched = compareBundles(baseline, { ...candidate, instruction_measurement: measurement('other-profile') })
  assert.equal(mismatched.metrics.instruction_bytes.status, 'INCONCLUSIVE')
  assert.equal(mismatched.metrics.instruction_bytes.reason, 'INSTRUCTION_BASIS_MISMATCH')
})

test('R02 regression: evolution rejects empty caller usage and missing evidence binding', () => {
  const result = evaluateEvolution({ candidate_id: 'synthetic-candidate' }, {
    comparability: { verdict: 'COMPARABLE', reasons: [] },
    deterministic_checks: [{ id: 'synthetic-check', status: 'PASS' }],
    quality_checks: [{ id: 'synthetic-quality', status: 'PASS' }],
    observed_usage: {},
  })
  assert.equal(result.status, 'INCONCLUSIVE')
  assert.equal(result.recommendation, 'INCONCLUSIVE')
  assert.equal(result.metrics.token_savings.status, 'INCONCLUSIVE')
  assert.ok(result.reasons.includes('EVIDENCE_BINDING_REQUIRED'))
})
