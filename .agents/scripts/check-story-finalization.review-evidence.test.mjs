import { digest, git, write, run, withFixture, expectStatus } from './check-story-finalization-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// The persisted NO_REVIEW shape (P2.2): `verified`, no review receipt, no Plan
// review block; only the verification receipt records the escalation.
const noReviewSlice = extra => ({ id: 'A', path: 'src/a.txt', status: 'verified', reviewReceipt: false, reviewBlock: false, ...extra })

for (const [label, escalation] of [
  ['REVIEW_REQUIRED decision', { decision: 'REVIEW_REQUIRED', risk: 'LOW', reasons: ['JUDGMENT_PUBLIC_CONTRACT'] }],
  ['raised MEDIUM risk', { decision: 'NO_REVIEW', risk: 'MEDIUM', reasons: [] }]
]) {
  test(`LOW slice with ${label} requires review`, () => withFixture({
    slices: [noReviewSlice({ risk: { level: 'LOW' }, escalation })]
  }, f => {
    const result = run(f)
    expectStatus(result, 'BLOCKED', 3, 'REVIEW_RECEIPT_REQUIRED:A')
    assert.ok(result.json.reasons.includes('SLICE_NOT_REVIEWED:A'), JSON.stringify(result.json))
  }))
}

test('declared slice risk without persisted escalation stops finalization', () => withFixture({
  slices: [noReviewSlice({ risk: { level: 'LOW' }, escalation: null })]
}, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'ESCALATION_EVIDENCE_MISSING:A')
  assert.ok(result.json.reasons.includes('SLICE_NOT_FINAL_READY:A'), JSON.stringify(result.json))
}))

test('review verdict and blocking findings are enforced', () => withFixture({ reviewVerdict: 'REQUEST_CHANGES', findingsTotal: 1, findingsBlocking: 1 }, f => {
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.includes('REVIEW_NOT_APPROVED:A'))
  assert.ok(result.json.reasons.includes('REVIEW_BLOCKING_FINDINGS:A'))
}))

test('stale review freshness blocks finalization', () => withFixture({ reviewFreshness: 'STALE' }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'REVIEW_FRESHNESS_INVALID:A')
}))

test('missing canonical disclosure blocks finalization', () => withFixture({
  slices: [{ id: 'A', path: 'src/a.txt', canonical: { applicability: 'APPLICABLE', status: 'INCOMPLETE', complete: false } }],
  disclosureRequired: false
}, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'CANONICAL_DISCLOSURE_REQUIRED:A')
}))

test('receipt digest tamper is STALE', () => withFixture({}, f => {
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json')
  const value = JSON.parse(readFileSync(file, 'utf8'))
  value.commands[0].command = 'tampered'
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  expectStatus(run(f), 'STALE', 2, 'RECEIPT_DIGEST_MISMATCH')
}))

test('structured AC evidence covers every AC', () => withFixture({}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.deepEqual(result.json.ac_coverage.map(item => item.id), ['AC-1', 'AC-2'])
  assert.ok(result.json.ac_coverage.every(item => item.covered && item.evidence.some(evidence => evidence.mode === 'structured')))
}))

test('legacy focused evidence fallback is labeled', () => withFixture({ structuredAc: false }, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.ok(result.json.ac_coverage.every(item => item.evidence.some(evidence => evidence.mode === 'fallback')))
}))

test('uncovered AC blocks finalization', () => withFixture({ structuredAc: false }, f => {
  const file = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json')
  const value = JSON.parse(readFileSync(file, 'utf8'))
  value.focused_checks = []
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  expectStatus(run(f), 'STALE', 2, 'RECEIPT_DIGEST_MISMATCH')
}))

test('duplicate paths across ordered slices are deduplicated and later Story slice owns them', () => withFixture({ slices: [
  { id: 'A', path: 'src/shared.txt', canonical: { applicability: 'NOT_APPLICABLE', status: 'PASS', complete: true } },
  { id: 'B', path: 'src/shared.txt', dependsOn: 'A', canonical: { applicability: 'NOT_APPLICABLE', status: 'PASS', complete: true } }
] }, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.scope.path_count, 1)
  assert.deepEqual(result.json.scope.paths[0].contributor_slices, ['A', 'B'])
  assert.equal(result.json.scope.paths[0].latest_slice, 'B')
}))

test('outside-Story product drift is STALE', () => withFixture({}, f => {
  write(f.root, 'src/a.txt', 'outside-story drift\n')
  git(f.root, 'add', 'src/a.txt')
  git(f.root, 'commit', '-qm', 'unrelated product drift')
  const result = run({ ...f, head: git(f.root, 'rev-parse', 'HEAD') })
  expectStatus(result, 'STALE', 2, 'OUTSIDE_STORY_DRIFT')
}))

test('working tree drift on final scope is STALE', () => withFixture({}, f => {
  write(f.root, 'src/a.txt', 'working drift\n')
  expectStatus(run(f), 'STALE', 2, 'WORKING_SCOPE_DRIFT')
}))

test('explicit unrelated pycache noise does not affect scope readiness', () => withFixture({}, f => {
  write(f.root, '_bmad/scripts/tests/__pycache__/test_agent_architecture.cpython-314.pyc', 'noise')
  expectStatus(run(f), 'READY', 0)
  assert.deepEqual(run(f).json.scope.excluded_worktree_paths, ['_bmad/scripts/tests/__pycache__/test_agent_architecture.cpython-314.pyc'])
}))
