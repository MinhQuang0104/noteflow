import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runArchitectureCorpus } from './run-v4-architecture-corpus.mjs'

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test('R03 runner executes actual L/M/H scenarios and records bound evidence', () => {
  const sourceRoot = process.cwd()
  const evidenceRoot = mkdtempSync(path.join(os.tmpdir(), 'v4-corpus-evidence-'))
  const sourceHead = gitHead(sourceRoot)
  const beforeStatus = spawnSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true }).stdout
  try {
    const result = runArchitectureCorpus({
      sourceRoot,
      expectedHead: sourceHead,
      variant: 'candidate',
      runId: `r03-test-${sourceHead.slice(0, 12)}`,
      evidenceRoot,
    })
    assert.equal(result.source_head, sourceHead)
    assert.equal(result.cases.length, 3)
    assert.ok(result.runner_digest.startsWith('sha256:'))
    assert.ok(result.corpus_digest.startsWith('sha256:'))
    assert.ok(result.cases.every(item => item.input_digest?.startsWith('sha256:')))
    assert.ok(result.cases.every(item => item.coverage === 'COMPLETE_VERIFIED'))

    const low = result.cases.find(item => item.case_id === 'L-mapped-low')
    assert.equal(low.actual_observations.canonical_status, 'PASS')
    assert.equal(low.actual_observations.escalation_decision, 'NO_REVIEW')
    assert.ok(low.assertions.every(item => item.status === 'PASS'))

    const medium = result.cases.find(item => item.case_id === 'M-mixed-medium')
    assert.equal(medium.actual_observations.canonical_status, 'INCOMPLETE')
    assert.equal(medium.actual_observations.escalation_decision, 'REVIEW_REQUIRED')
    assert.ok(medium.actual_observations.unmatched_paths.includes('src/unmapped.txt'))
    assert.ok(medium.assertions.every(item => item.status === 'PASS'))

    const high = result.cases.find(item => item.case_id === 'H-stale-recovery')
    assert.equal(high.actual_observations.stale.status, 'STALE')
    assert.equal(high.actual_observations.recovery.initial_status, 'RECOVERY_REQUIRED')
    assert.equal(high.actual_observations.recovery.recovered_status, 'CHECKPOINTED')
    assert.equal(high.actual_observations.recovery.replay_status, 'NOOP')
    assert.ok(high.assertions.every(item => item.status === 'PASS'))
    assert.deepEqual(high.check_results.map(item => item.id), [
      'stale-preview-rejected',
      'stale-preview-no-mutation',
      'recovery-interruption',
      'recovery-authorized',
    ])
    assert.equal(high.required_check_coverage.required, 4)
    assert.equal(high.required_check_coverage.observed, 4)

    for (const item of result.cases) {
      for (const ref of item.evidence_refs) {
        assert.ok(existsSync(path.join(evidenceRoot, ref.ref)))
        assert.equal(readFileSync(path.join(evidenceRoot, ref.ref)).byteLength > 0, true)
      }
    }
    assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true }).stdout, beforeStatus)
    assert.deepEqual(result.evidence_index.map(item => item.ref).sort(), result.cases.flatMap(item => item.evidence_refs.map(ref => ref.ref)).sort())
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true })
  }
})

test('R03 CLI rejects a source-head mismatch before creating evidence', () => {
  const evidenceRoot = mkdtempSync(path.join(os.tmpdir(), 'v4-corpus-mismatch-'))
  try {
    const result = spawnSync(process.execPath, [
      path.resolve(process.cwd(), '.agents/scripts/run-v4-architecture-corpus.mjs'),
      '--source-root', process.cwd(), '--expected-head', '0'.repeat(40), '--variant', 'candidate',
      '--run-id', 'r03-mismatch', '--evidence-root', evidenceRoot,
    ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}${result.stderr}`, /SOURCE_HEAD_MISMATCH/)
    assert.deepEqual(readdirSync(evidenceRoot), [])
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true })
  }
})
