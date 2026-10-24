import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'

export const script = path.resolve('.agents/scripts/check-story-finalization.mjs')
export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export const STORY = 'docs/story-9-1.md'
export const EPIC = 'docs/product/epics.md'
export const digest = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
export const stableValue = value => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])])) : value
export const stableDigest = value => digest(JSON.stringify(stableValue(value)))
export const pathDigest = paths => digest([...new Set(paths)].sort().map(item => item.replaceAll('\\', '/')).join('\n') + '\n')

export function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

export function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

export const storyText = `---
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

export function canonicalSection() {
  return '### Story 9.1: Fixture finalization story\n\nDone.\n\n'
}

export function receiptBase(storyId, sliceId, kind, baseline, checkpoint, subjectDigest, changedPathsSha256) {
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

export function fixture(options = {}) {
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
    verification.canonical = options.canonicalProvenance ? {
      featureId: 'fixture-feature',
      changedPaths: slice.changedPaths,
      matchedPaths: slice.changedPaths.slice(0, 1),
      unmatchedPaths: slice.changedPaths.slice(1),
      dependencyOnlyPaths: [],
      status: 'INCOMPLETE',
      complete: false,
      escalationReasons: ['UNMAPPED_CHANGED_PATH']
    } : {
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
    if (slice.risk) verification.escalation = slice.escalation === null ? undefined :
      (slice.escalation ?? { decision: 'NO_REVIEW', risk: slice.risk.level, reasons: [] })
    if (options.structuredAc !== false) {
      verification.ac_evidence = [
        { id: `${slice.id.toLowerCase()}-ac-1`, ac: 'AC-1', result: 'PASS', summary: 'fixture AC-1' },
        { id: `${slice.id.toLowerCase()}-ac-2`, ac: 'AC-2', result: 'PASS', summary: 'fixture AC-2' }
      ]
    }
    const review = receiptBase('9.1', slice.id, 'review', slice.baseline, slice.checkpoint, subjectDigest, changedPathsSha256)
    review.required = true
    if (options.kernelReview) {
      review.judgment = options.reviewVerdict ?? 'APPROVE'
      const evidenceRefs = slice.changedPaths.map((file, hunkIndex) => ({
        path: file,
        hunk_index: hunkIndex,
        body_digest: digest('fixture:' + slice.id + ':' + file)
      }))
      review.evidence_refs = evidenceRefs
      review.scope_digest = stableDigest({ paths: [...slice.changedPaths].sort(), refs: evidenceRefs })
      review.risk_context_digest = digest(JSON.stringify({ level: 'MEDIUM' }))
    } else {
      review.verdict = options.reviewVerdict ?? 'APPROVE'
      review.freshness = { status: options.reviewFreshness ?? 'FRESH_CANDIDATE', reasons: [] }
    }
    if (!review.evidence_refs) {
      const evidenceRefs = slice.changedPaths.map((file, hunkIndex) => ({
        path: file,
        hunk_index: hunkIndex,
        body_digest: digest('fixture:' + slice.id + ':' + file)
      }))
      review.evidence_refs = evidenceRefs
      review.scope_digest = stableDigest({ paths: [...slice.changedPaths].sort(), refs: evidenceRefs })
    }
    review.risk_context_digest ??= digest(JSON.stringify({ level: 'MEDIUM' }))
    if (slice.reviewRiskDigest) review.risk_context_digest = slice.reviewRiskDigest
    review.findings_total = options.findingsTotal ?? 0
    review.findings_blocking = options.findingsBlocking ?? 0
    review.reviewed_commit = slice.checkpoint

    const refs = {}
    for (const [kind, receipt] of [['implementation', implementation], ['verification', verification],
      ...(slice.reviewReceipt === false ? [] : [['review', review]])]) {
      const relative = `${receiptDir}/${slice.id}-${kind}.json`
      write(root, relative, `${JSON.stringify(receipt, null, 2)}\n`)
      refs[kind] = { path: relative, digest: receiptDigest(receipt) }
      receiptEntries.push({ kind, relative })
    }

    const disclosure = canonical.status !== 'PASS'
    sliceYaml.push(`  - id: ${slice.id}
    status: ${slice.status ?? options.sliceStatus ?? 'reviewed'}
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
${refs.review ? `      review:
        path: ${refs.review.path}
        digest: ${refs.review.digest}
` : ''}${slice.risk ? `    risk:
      level: ${slice.risk.level}
${slice.risk.flags ? `      flags: [${slice.risk.flags.join(', ')}]
` : ''}` : ''}    verification:
      ${canonical.applicability === undefined ? 'canonical_status: INCOMPLETE\n      ' : 'canonical_applicability: ' + canonical.applicability + '\n      canonical_status: ' + canonical.status + '\n      '}progression_eligible: ${verification.progression_eligible}
      done_gate_disclosure_required: ${options.canonicalProvenance ? 'true' : disclosure}${slice.reviewBlock === false ? '' : `
    review:
      required: ${slice.reviewRequired ?? true}
      verdict: ${review.verdict ?? 'APPROVE'}
      reviewed_commit: ${review.reviewed_commit}
      ${options.kernelReview ? '' : 'freshness: ' + (options.reviewFreshness ?? 'FRESH_CANDIDATE')}`}`)
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

export function run(f, extra = []) {
  const result = spawnSync(process.execPath, [script, 'check', '9.1', '--expected-head', f.head, ...extra], {
    cwd: f.root, encoding: 'utf8', windowsHide: true
  })
  assert.ok(result.stdout, result.stderr)
  return { code: result.status, json: JSON.parse(result.stdout) }
}

export function withFixture(options, callback) {
  const f = fixture(options)
  try { callback(f) } finally { rmSync(f.root, { recursive: true, force: true }) }
}

export function expectStatus(result, status, code, reason) {
  assert.equal(result.code, code, JSON.stringify(result.json))
  assert.equal(result.json.status, status, JSON.stringify(result.json))
  if (reason) assert.ok(result.json.reasons.includes(reason), JSON.stringify(result.json))
}
