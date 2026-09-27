import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'

const script = path.resolve('.agents/scripts/check-story-finalization.mjs')
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const STORY = 'docs/story-9-1.md'
const EPIC = 'docs/product/epics.md'
const digest = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const pathDigest = paths => digest([...new Set(paths)].sort().map(item => item.replaceAll('\\', '/')).join('\n') + '\n')

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

const storyText = `---
story_id: "9.1"
title: Fixture finalization story
status: in-progress
---

# Story 9.1: Fixture finalization story

## Story

<!-- v4:story:start -->
As a user, I want a bounded fixture story.
<!-- v4:story:end -->

## Readiness

<!-- v4:readiness:start -->
- result: READY
- dependencies: none
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: the first behavior is evidenced.
- AC-2: the second behavior is evidenced.
<!-- v4:ac:end -->

## Tasks

<!-- v4:tasks:start -->
- [x] T-1 [AC-1, AC-2]: implement the fixture behavior.
<!-- v4:tasks:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-91-fixture-finalization-story
- architecture: docs/architecture/fixture.md#ad-1
- ux: docs/ux/fixture.md#screen-1
<!-- v4:references:end -->

## Risk

<!-- v4:risk:start -->
- classification: MEDIUM
- invariant: fixture scope remains bounded.
<!-- v4:risk:end -->

## Dev Agent Record

<!-- v4:completion:start -->
### AC Evidence / Results

### Completion Notes

### File List

### Change Log
<!-- v4:completion:end -->
`

function canonicalSection() {
  return '### Story 9.1: Fixture finalization story\n\nDone.\n\n'
}

function receiptBase(storyId, sliceId, kind, baseline, checkpoint, subjectDigest, changedPathsSha256) {
  return {
    schema_version: 1,
    story_id: storyId,
    slice_id: sliceId,
    kind,
    checkpoint_commit: checkpoint,
    baseline_commit: baseline,
    subject_digest: subjectDigest,
    created_from_head: checkpoint,
    changed_paths_sha256: changedPathsSha256,
    commands: [{ command: `fixture ${kind}`, exit_code: 0, tool: 'fixture', environment: 'node-test' }]
  }
}

function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'story-finalization-'))
  const story = inspectStory(storyText)
  const storyDigest = normativeDigest(story)
  const section = canonicalSection()
  const epicDigest = digest(section)
  const slices = options.slices ?? [{ id: 'A', path: 'src/a.txt', canonical: { applicability: 'APPLICABLE', status: 'PASS', complete: true } }]
  const sliceCommits = []

  write(root, STORY, storyText)
  write(root, EPIC, `# Epic\n\n${section}### Story 9.2: Next\n`)
  write(root, 'docs/architecture/fixture.md', '# AD-1\n')
  write(root, 'docs/ux/fixture.md', '# Screen 1\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, SPRINT, 'development_status:\n  epic-9: in-progress\n  9-1-fixture: in-progress\n')
  write(root, 'seed.txt', 'seed\n')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture baseline')
  let previous = git(root, 'rev-parse', 'HEAD')

  for (const slice of slices) {
    write(root, slice.path, `${slice.id}\n`)
    git(root, 'add', slice.path)
    git(root, 'commit', '-qm', `fixture ${slice.id}`)
    const checkpoint = git(root, 'rev-parse', 'HEAD')
    const changedPaths = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', `${previous}..${checkpoint}`)
      .split(/\r?\n/).filter(Boolean)
    sliceCommits.push({ ...slice, baseline: previous, checkpoint, changedPaths })
    previous = checkpoint
  }

  const receiptEntries = []
  const sliceYaml = []
  for (const slice of sliceCommits) {
    const changedPathsSha256 = pathDigest(slice.changedPaths)
    const subjectDigest = options.subjectDigest ?? changedPathsSha256
    const receiptDir = `_bmad-output/implementation-artifacts/receipts/story-9-1`
    const implementation = receiptBase('9.1', slice.id, 'implementation', slice.baseline, slice.checkpoint, subjectDigest, changedPathsSha256)
    implementation.changed_paths = slice.changedPaths
    const verification = receiptBase('9.1', slice.id, 'verification', slice.baseline, slice.checkpoint, subjectDigest, changedPathsSha256)
    verification.changed_paths = slice.changedPaths
    verification.focused_checks = [
      { id: `${slice.id.toLowerCase()}-focused`, result: 'PASS', exit_code: 0, subject_digest: subjectDigest, changed_paths_sha256: changedPathsSha256 }
    ]
    const canonical = slice.canonical ?? { applicability: 'NOT_APPLICABLE', status: 'PASS', complete: true }
    verification.canonical = {
      applicability: canonical.applicability,
      status: canonical.status,
      complete: canonical.complete,
      escalationReasons: canonical.status === 'PASS' ? [] : ['FIXTURE_DISCLOSURE']
    }
    verification.progression_eligible = options.progressionEligible ?? true
    verification.done_gate_disclosure = {
      required: options.disclosureRequired ?? canonical.status !== 'PASS',
      canonical_disposition: canonical.status,
      coverage_authority: 'focused checks'
    }
    if (options.structuredAc !== false) {
      verification.ac_evidence = [
        { id: `${slice.id.toLowerCase()}-ac-1`, ac: 'AC-1', result: 'PASS', summary: 'fixture AC-1' },
        { id: `${slice.id.toLowerCase()}-ac-2`, ac: 'AC-2', result: 'PASS', summary: 'fixture AC-2' }
      ]
    }
    const review = receiptBase('9.1', slice.id, 'review', slice.baseline, slice.checkpoint, subjectDigest, changedPathsSha256)
    review.required = true
    review.verdict = options.reviewVerdict ?? 'APPROVE'
    review.findings_total = options.findingsTotal ?? 0
    review.findings_blocking = options.findingsBlocking ?? 0
    review.reviewed_commit = slice.checkpoint
    review.freshness = { status: options.reviewFreshness ?? 'FRESH_CANDIDATE', reasons: [] }

    const refs = {}
    for (const [kind, receipt] of [['implementation', implementation], ['verification', verification], ['review', review]]) {
      const relative = `${receiptDir}/${slice.id}-${kind}.json`
      write(root, relative, `${JSON.stringify(receipt, null, 2)}\n`)
      refs[kind] = { path: relative, digest: receiptDigest(receipt) }
      receiptEntries.push({ kind, relative })
    }

    const disclosure = canonical.status !== 'PASS'
    sliceYaml.push(`  - id: ${slice.id}
    status: ${options.sliceStatus ?? 'reviewed'}
    depends_on: [${slice.dependsOn ?? ''}]
    task_refs: [T-1]
    baseline_commit: ${slice.baseline}
    checkpoint_commit: ${slice.checkpoint}
    subject_digest: ${subjectDigest}
    changed_paths_sha256: ${changedPathsSha256}
    receipt_refs:
      implementation:
        path: ${refs.implementation.path}
        digest: ${refs.implementation.digest}
      verification:
        path: ${refs.verification.path}
        digest: ${refs.verification.digest}
      review:
        path: ${refs.review.path}
        digest: ${refs.review.digest}
    verification:
      canonical_applicability: ${canonical.applicability}
      canonical_status: ${canonical.status}
      progression_eligible: ${verification.progression_eligible}
      done_gate_disclosure_required: ${disclosure}
    review:
      required: true
      verdict: ${review.verdict}
      reviewed_commit: ${review.reviewed_commit}
      freshness: ${options.reviewFreshness ?? 'FRESH_CANDIDATE'}`)
  }

  const plan = `---
schema_version: 2
story_id: "9.1"
story:
  path: ${STORY}
  normative_digest: ${storyDigest}
upstream_epic:
  path: ${EPIC}
  section_digest: ${epicDigest}
sprint_key: 9-1-fixture
lifecycle_snapshot: ${options.lifecycle ?? 'in-progress'}
execution_status: ${options.executionStatus ?? 'in-progress'}
current_slice: ${sliceCommits.at(-1).id}
risk:
  level: MEDIUM
slices:
${sliceYaml.join('\n')}
blockers: ${options.blockers ? '\n  - id: fixture-blocker\n    reason: fixture blocker' : '[]'}
unresolved_questions: ${options.question ? '\n  - id: fixture-question\n    question: fixture question' : '[]'}
next_action:
  kind: ${options.nextAction ?? 'finalize_story'}
  target: story
${options.humanApproval ? `human_approval:
  approved_by: Human
  approved_at: 2026-09-26T00:00:00Z
  approved_commit: ${options.humanApproval.approvedCommit ?? sliceCommits.at(-1).checkpoint}
  story_normative_digest: ${options.humanApproval.storyNormativeDigest ?? storyDigest}
  scope_paths_digest: ${options.humanApproval.scopePathsDigest ?? 'sha256:' + '0'.repeat(64)}
` : ''}---
`
  write(root, PLAN, plan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture metadata')
  const head = git(root, 'rev-parse', 'HEAD')
  return { root, head, storyDigest, sliceCommits, receiptEntries, plan }
}

function run(f, extra = []) {
  const result = spawnSync(process.execPath, [script, 'check', '9.1', '--expected-head', f.head, ...extra], {
    cwd: f.root, encoding: 'utf8', windowsHide: true
  })
  assert.ok(result.stdout, result.stderr)
  return { code: result.status, json: JSON.parse(result.stdout) }
}

function withFixture(options, callback) {
  const f = fixture(options)
  try { callback(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

function expectStatus(result, status, code, reason) {
  assert.equal(result.code, code, JSON.stringify(result.json))
  assert.equal(result.json.status, status, JSON.stringify(result.json))
  if (reason) assert.ok(result.json.reasons.includes(reason), JSON.stringify(result.json))
}

test('clean reviewed fixture is READY with a compact preview', () => withFixture({}, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY')
  assert.equal(result.json.human_gate_required, true)
  assert.equal(result.json.human_approval_present, false)
  assert.equal(result.json.lifecycle_from, 'in-progress')
  assert.equal(result.json.lifecycle_target, 'review')
  assert.equal(result.json.scope.path_count, 1)
}))

test('canonical disclosures produce READY with READY_WITH_DISCLOSURES without relabeling', () => withFixture({ slices: [{ id: 'A', path: 'src/a.txt', canonical: { applicability: 'NOT_APPLICABLE', status: 'INCOMPLETE', complete: false } }] }, f => {
  const result = run(f)
  expectStatus(result, 'READY', 0)
  assert.equal(result.json.done_gate_disposition, 'READY_WITH_DISCLOSURES')
  assert.equal(result.json.canonical_disclosures[0].status, 'INCOMPLETE')
  assert.equal(result.json.canonical_disclosures[0].applicability, 'NOT_APPLICABLE')
  assert.equal(result.json.canonical_disclosures[0].complete, false)
}))

test('all slices must be reviewed', () => withFixture({ sliceStatus: 'verified' }, f => {
  const result = run(f)
  expectStatus(result, 'BLOCKED', 3, 'SLICE_NOT_REVIEWED:A')
}))

test('progression false blocks finalization', () => withFixture({ progressionEligible: false }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'PROGRESSION_NOT_ELIGIBLE:A')
}))

test('blockers and unresolved questions block finalization', () => withFixture({ blockers: true }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'BLOCKERS_PRESENT')
}))

test('unresolved questions block finalization', () => withFixture({ question: true }, f => {
  expectStatus(run(f), 'BLOCKED', 3, 'UNRESOLVED_QUESTIONS_PRESENT')
}))

test('missing verification receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('VERIFICATION_RECEIPT')))
}))

test('missing implementation receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-implementation.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('IMPLEMENTATION_RECEIPT')))
}))

test('missing required review receipt is blocked', () => withFixture({}, f => {
  const receipt = path.join(f.root, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json')
  rmSync(receipt)
  const result = run(f)
  assert.equal(result.code, 3)
  assert.equal(result.json.status, 'BLOCKED')
  assert.ok(result.json.reasons.some(reason => reason.includes('REVIEW_RECEIPT')))
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
  expectStatus(run(f), 'STALE', 2, 'UPSTREAM_EPIC_DIGEST_STALE')
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
