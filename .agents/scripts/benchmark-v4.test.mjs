import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
    schema_version: 1,
    variant,
    source_head: variant === 'baseline' ? 'a'.repeat(40) : 'b'.repeat(40),
    architecture_fingerprint: variant === 'baseline' ? `sha256:${'a'.repeat(64)}` : `sha256:${'b'.repeat(64)}`,
    corpus_digest: `sha256:${'c'.repeat(64)}`,
    toolchain: { node: 'v24.21.0', npm: '11.6.4', git: '2.49.0.windows.1', platform: 'win32' },
    model: null,
    effort: null,
    source_paths: ['AGENTS.md'],
    source_bindings: [{ path: 'AGENTS.md', digest: `sha256:${'d'.repeat(64)}`, bytes: 10 }],
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
  assert.equal(modelExplained.status, 'COMPARABLE')

  const workloadMismatch = compareBundles(baseline, candidateWithReasons({ cases: [caseFor('L-fixture', { workload_class: 'M' })] }))
  assert.equal(workloadMismatch.status, 'INCOMPARABLE')
  assert.ok(workloadMismatch.comparability.reasons.includes('CASE_WORKLOAD_CLASS_MISMATCH:L-fixture'))
})

test('comparison keeps per-case metric coverage and quality failures separate', () => {
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
  assert.equal(result.metrics.instruction_bytes.implement_slice.status, 'MEASURED')
  assert.equal(result.metrics.instruction_bytes.implement_slice.delta, -100)
  assert.equal(result.metrics.token_usage.status, 'INCONCLUSIVE')
  assert.equal(result.metrics.quality, 'FAIL')
  assert.ok(result.cases.find(item => item.case_id === 'H-fixture').coverage.exclusions.includes('provider_usage_unavailable'))
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
    const candidate = buildCandidateBundle(fixture.root, { source_paths: [] })
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
