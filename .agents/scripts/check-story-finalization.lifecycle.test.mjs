import { PLAN, SPRINT, STORY, EPIC, digest, git, write, fixture, run, withFixture, expectStatus } from './check-story-finalization-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { receiptDigest } from './check-artifact-contract.mjs'

test('normative Story digest freshness is enforced', () => withFixture({}, f => {
  const file = path.join(f.root, STORY)
  writeFileSync(file, readFileSync(file, 'utf8').replace('bounded fixture story', 'changed fixture story'))
  expectStatus(run(f), 'STALE', 2, 'STORY_NORMATIVE_DIGEST_STALE')
}))

test('unsupported Plan schema is INVALID', () => withFixture({}, f => {
  const file = path.join(f.root, PLAN)
  writeFileSync(file, readFileSync(file, 'utf8').replace('schema_version: 2', 'schema_version: 3'))
  expectStatus(run(f), 'INVALID', 4, 'UNSUPPORTED_PLAN_SCHEMA')
}))

test('upstream Epic section freshness is enforced', () => withFixture({}, f => {
  const file = path.join(f.root, EPIC)
  writeFileSync(file, readFileSync(file, 'utf8').replace('Done.', 'Changed.'))
  expectStatus(run(f), 'STALE', 2, 'UPSTREAM_EPIC_WORKTREE_DRIFT')
}))

test('uncommitted completion metadata is a repairable partial transition', () => withFixture({}, f => {
  const file = path.join(f.root, STORY)
  writeFileSync(file, readFileSync(file, 'utf8').replace('### Completion Notes\n', '### Completion Notes\nPremature completion record.\n'))
  expectStatus(run(f), 'RECONCILIATION_REQUIRED', 1, 'COMPLETION_METADATA_BEFORE_REVIEW')
}))

test('finalization candidate without Plan advance is a repairable partial transition', () => withFixture({}, f => {
  write(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json', '{"candidate":true}\n')
  expectStatus(run(f), 'RECONCILIATION_REQUIRED', 1, 'FINALIZATION_CANDIDATE_WITHOUT_PLAN_ADVANCE')
}))

test('Plan review with sprint in-progress requires reconciliation', () => withFixture({ lifecycle: 'review' }, f => {
  expectStatus(run(f), 'RECONCILIATION_REQUIRED', 1, 'LIFECYCLE_PROJECTION_MISMATCH')
}))

test('sprint review with Plan in-progress requires reconciliation', () => withFixture({}, f => {
  const file = path.join(f.root, SPRINT)
  writeFileSync(file, readFileSync(file, 'utf8').replace('9-1-fixture: in-progress', '9-1-fixture: review'))
  expectStatus(run(f), 'RECONCILIATION_REQUIRED', 1, 'LIFECYCLE_PROJECTION_MISMATCH')
}))

test('review state without a finalization receipt is invalid', () => withFixture({ lifecycle: 'review', executionStatus: 'complete' }, f => {
  const file = path.join(f.root, SPRINT)
  writeFileSync(file, readFileSync(file, 'utf8').replace('9-1-fixture: in-progress', '9-1-fixture: review'))
  const story = path.join(f.root, STORY)
  writeFileSync(story, readFileSync(story, 'utf8').replace('status: in-progress', 'status: review'))
  const result = run(f)
  assert.equal(result.code, 4)
  assert.equal(result.json.status, 'INVALID')
  assert.ok(result.json.reasons.includes('FINALIZATION_REQUIRED'))
}))

test('stale Human approval is rejected by scope binding', () => withFixture({ humanApproval: {} }, f => {
  const result = run(f)
  expectStatus(result, 'STALE', 2, 'HUMAN_APPROVAL_STALE')
}))

test('Plan/sprint/story done mismatch fails closed', () => withFixture({ lifecycle: 'done', executionStatus: 'complete' }, f => {
  const story = path.join(f.root, STORY)
  writeFileSync(story, readFileSync(story, 'utf8').replace('status: in-progress', 'status: done'))
  const result = run(f)
  assert.equal(result.code, 1)
  assert.equal(result.json.status, 'RECONCILIATION_REQUIRED')
  assert.ok(result.json.reasons.includes('LIFECYCLE_PROJECTION_MISMATCH'))
}))

test('finalization helper is read-only and does not create a candidate receipt', () => withFixture({}, f => {
  const before = git(f.root, 'status', '--porcelain=v1', '--untracked-files=all')
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(git(f.root, 'status', '--porcelain=v1', '--untracked-files=all'), before)
  assert.equal(existsSync(path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json')), false)
}))

test('scope digests are stable across repeated read-only checks', () => withFixture({}, f => {
  const first = run(f)
  const second = run(f)
  expectStatus(first, 'READY', 0)
  expectStatus(second, 'READY', 0)
  assert.equal(first.json.scope_paths_digest, second.json.scope_paths_digest)
  assert.equal(first.json.implementation_commit_set_digest, second.json.implementation_commit_set_digest)
  assert.equal(first.json.final_scoped_tree_digest, second.json.final_scoped_tree_digest)
}))

test('schema-v2 fixture is READY with disclosures at finalization entry state', () => withFixture({
  slices: [{ id: 'A', path: 'src/a.txt', canonical: { applicability: 'NOT_APPLICABLE', status: 'INCOMPLETE', complete: false } }]
}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY_WITH_DISCLOSURES')
  assert.deepEqual(result.json.slices.map(slice => `${slice.id}:${slice.status}`), ['A:reviewed'])
  assert.deepEqual(result.json.ac_coverage.map(item => `${item.id}:${item.covered}`), ['AC-1:true', 'AC-2:true'])
  assert.equal(result.json.human_gate_required, true)
  assert.equal(result.json.human_approval_present, false)
  assert.equal(result.json.lifecycle_from, 'in-progress')
  assert.equal(result.json.lifecycle_target, 'review')
  assert.equal(result.json.scope.path_count, 1)
}))

test('kernel-produced judgment and ordered evidence prove review freshness', () => withFixture({ kernelReview: true }, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.slices[0].review_verdict, 'APPROVE')
  assert.equal(result.json.slices[0].review_freshness, 'FRESH_REUSED')
}))

test('validated canonical recipe provenance infers applicability without relabeling INCOMPLETE', () => withFixture({
  canonicalProvenance: true,
  slices: [{ id: 'A', path: 'src/a.txt', canonical: { status: 'INCOMPLETE', complete: false } }]
}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY_WITH_DISCLOSURES')
  assert.equal(result.json.canonical_disclosures[0].applicability, 'APPLICABLE')
  assert.equal(result.json.canonical_disclosures[0].status, 'INCOMPLETE')
}))

test('CRLF-only Epic checkout representation remains fresh against the canonical Git blob', () => withFixture({}, f => {
  git(f.root, 'config', 'core.autocrlf', 'true')
  const file = path.join(f.root, EPIC)
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\n', '\r\n'))
  expectStatus(run(f), 'READY', 0)
}))

test('conflicting kernel judgment and legacy verdict reject idempotently without finalization mutation', () => withFixture({ kernelReview: true }, f => {
  const receiptPath = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json')
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  receipt.verdict = 'CHANGES_REQUIRED'
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
  const planPath = path.join(f.root, PLAN)
  const planBefore = readFileSync(planPath, 'utf8')
  writeFileSync(planPath, planBefore.replace(/digest: sha256:[0-9a-f]+(?=\n    verification:)/, 'digest: ' + receiptDigest(receipt)))
  const statusBefore = git(f.root, 'status', '--porcelain=v1', '--untracked-files=all')
  const first = run(f)
  const second = run(f)
  expectStatus(first, 'RECONCILIATION_REQUIRED', 1, 'REVIEW_DECISION_CONFLICT:A')
  expectStatus(second, 'RECONCILIATION_REQUIRED', 1, 'REVIEW_DECISION_CONFLICT:A')
  assert.deepEqual(second.json, first.json)
  assert.equal(git(f.root, 'status', '--porcelain=v1', '--untracked-files=all'), statusBefore)
}))
