import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { pathListDigest } from './check-story-finalization.mjs'
import { buildFinalizationPreview, applyFinalization, prepareFinalization } from './finalize-story.mjs'

const STORY = 'docs/story-9-1.md'
const EPIC = 'docs/product/epics.md'
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const FINALIZATION = '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json'
const storyText = [
  '---',
  'story_id: "9.1"',
  'title: Fixture finalization story',
  'status: in-progress',
  '---',
  '',
  '# Story 9.1: Fixture finalization story',
  '',
  '## Story',
  '',
  '<!-- v4:story:start -->',
  'As a user, I want a bounded fixture story.',
  '<!-- v4:story:end -->',
  '',
  '## Readiness',
  '',
  '<!-- v4:readiness:start -->',
  '- result: READY',
  '- dependencies: none',
  '<!-- v4:readiness:end -->',
  '',
  '## Acceptance Criteria',
  '',
  '<!-- v4:ac:start -->',
  '- AC-1: the first behavior is evidenced.',
  '- AC-2: the second behavior is evidenced.',
  '<!-- v4:ac:end -->',
  '',
  '## Tasks',
  '',
  '<!-- v4:tasks:start -->',
  '- [x] T-1 [AC-1, AC-2]: implement the fixture behavior.',
  '<!-- v4:tasks:end -->',
  '',
  '## References',
  '',
  '<!-- v4:references:start -->',
  '- product: docs/product/epics.md#story-91-fixture-finalization-story',
  '- architecture: docs/architecture/fixture.md#ad-1',
  '<!-- v4:references:end -->',
  '',
  '## Risk',
  '',
  '<!-- v4:risk:start -->',
  '- classification: MEDIUM',
  '- invariant: fixture scope remains bounded.',
  '<!-- v4:risk:end -->',
  ''
].join('\n')

function digest(value) {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')
}

function write(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'finalize-story-'))
  const storyDigest = normativeDigest(inspectStory(storyText))
  const epicSection = '### Story 9.1: Fixture finalization story\n\nDone.\n\n'
  write(root, STORY, storyText)
  write(root, EPIC, '# Epic\n\n' + epicSection + '### Story 9.2: Next\n')
  write(root, 'docs/architecture/fixture.md', '# AD-1\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, 'seed.txt', 'seed\n')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'baseline')
  const baseline = git(root, 'rev-parse', 'HEAD')
  write(root, 'src/implementation.txt', 'implementation\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'checkpoint')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const changedPathsSha256 = pathListDigest(['src/implementation.txt'])
  const subjectDigest = digest('fixture-subject')
  const refs = {}
  for (const kind of ['implementation', 'verification', 'review']) {
    const receipt = {
      schema_version: 1,
      story_id: '9.1',
      slice_id: 'A',
      kind,
      checkpoint_commit: checkpoint,
      baseline_commit: baseline,
      subject_digest: subjectDigest,
      created_from_head: checkpoint,
      changed_paths_sha256: changedPathsSha256,
      commands: [{ command: 'fixture check', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
    }
    if (kind === 'implementation') receipt.changed_paths = ['src/implementation.txt']
    if (kind === 'verification') {
      receipt.changed_paths = ['src/implementation.txt']
      receipt.focused_checks = [{ id: 'focused', result: 'PASS', exit_code: 0, summary: 'fixture checks passed' }]
      receipt.canonical = { applicability: 'APPLICABLE', status: 'PASS', complete: true }
      receipt.progression_eligible = true
      receipt.ac_evidence = [
        { id: 'ac-1', ac: 'AC-1', result: 'PASS', summary: 'first behavior evidenced' },
        { id: 'ac-2', ac: 'AC-2', result: 'PASS', summary: 'second behavior evidenced' }
      ]
      receipt.done_gate_disclosure = { required: false, coverage_authority: 'focused checks' }
    }
    if (kind === 'review') {
      receipt.required = true
      receipt.verdict = 'APPROVE'
      receipt.findings_total = 0
      receipt.findings_blocking = 0
      receipt.reviewed_commit = checkpoint
      receipt.freshness = { status: 'FRESH_CANDIDATE', reasons: [] }
    }
    const relative = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-' + kind + '.json'
    write(root, relative, JSON.stringify(receipt, null, 2) + '\n')
    refs[kind] = { path: relative, digest: receiptDigest(receipt) }
  }
  const plan = [
    '---',
    'schema_version: 2',
    'story_id: "9.1"',
    'story:',
    '  path: ' + STORY,
    '  normative_digest: ' + storyDigest,
    'upstream_epic:',
    '  path: ' + EPIC,
    '  section_digest: ' + digest(epicSection),
    'sprint_key: 9-1-fixture',
    'lifecycle_snapshot: in-progress',
    'execution_status: in-progress',
    'current_slice: A',
    'risk:',
    '  level: MEDIUM',
    'slices:',
    '  - id: A',
    '    status: reviewed',
    '    depends_on: []',
    '    task_refs: [T-1]',
    '    baseline_commit: ' + baseline,
    '    checkpoint_commit: ' + checkpoint,
    '    subject_digest: ' + subjectDigest,
    '    changed_paths_sha256: ' + changedPathsSha256,
    '    receipt_refs:',
    '      implementation:',
    '        path: ' + refs.implementation.path,
    '        digest: ' + refs.implementation.digest,
    '      verification:',
    '        path: ' + refs.verification.path,
    '        digest: ' + refs.verification.digest,
    '      review:',
    '        path: ' + refs.review.path,
    '        digest: ' + refs.review.digest,
    '    verification:',
    '      canonical_applicability: APPLICABLE',
    '      canonical_status: PASS',
    '      progression_eligible: true',
    '      done_gate_disclosure_required: false',
    '    review:',
    '      required: true',
    '      verdict: APPROVE',
    '      reviewed_commit: ' + checkpoint,
    '      freshness: FRESH_CANDIDATE',
    'blockers: []',
    'unresolved_questions: []',
    'next_action:',
    '  kind: finalize_story',
    '  target: story',
    '---',
    ''
  ].join('\n')
  write(root, PLAN, plan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'reviewed fixture')
  return {
    root,
    head: git(root, 'rev-parse', 'HEAD'),
    storyDigest,
    expectedPaths: [FINALIZATION, PLAN, SPRINT, STORY],
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}

test('preview preserves normative Story digest and derives File List from helper scope', () => {
  const f = fixture()
  try {
    const preview = buildFinalizationPreview(f.root, '9.1', f.head)
    assert.equal(normativeDigest(inspectStory(preview.nextStoryBytes)), f.storyDigest)
    assert.match(preview.completionBody, /AC Evidence \/ Results/)
    assert.match(preview.completionBody, /src\/implementation\.txt/)
    assert.equal(preview.receipt.prepared_from_head, f.head)
    assert.equal(preview.receipt.scope_paths_digest, preview.helper.scope_paths_digest)
  } finally {
    f.cleanup()
  }
})

test('prepare is read-only and wrong expected HEAD is rejected', () => {
  const f = fixture()
  try {
    const before = git(f.root, 'status', '--porcelain=v1', '--untracked-files=all')
    assert.equal(prepareFinalization(f.root, '9.1', f.head).status, 'READY')
    assert.equal(git(f.root, 'status', '--porcelain=v1', '--untracked-files=all'), before)
    assert.equal(prepareFinalization(f.root, '9.1', '0'.repeat(40)).status, 'STALE')
  } finally {
    f.cleanup()
  }
})

test('finalization writes exact paths in one commit and stops at Human Gate', () => {
  const f = fixture()
  try {
    const result = applyFinalization(f.root, '9.1', f.head)
    assert.equal(result.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'show', '--pretty=format:', '--name-only', 'HEAD').split(/\r?\n/).filter(Boolean).sort(), f.expectedPaths.sort())
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const story = readFileSync(path.join(f.root, STORY), 'utf8')
    const receipt = JSON.parse(readFileSync(path.join(f.root, FINALIZATION), 'utf8'))
    assert.equal(plan.lifecycle_snapshot, 'review')
    assert.equal(plan.execution_status, 'complete')
    assert.equal(plan.next_action.kind, 'complete_story')
    assert.equal(plan.human_approval, null)
    assert.equal(story.includes('status: review'), true)
    assert.equal(Object.hasOwn(receipt, 'human_approval'), false)
    assert.equal(result.snapshot.lifecycle, 'review')
    assert.equal(result.snapshot.requested_next_action.kind, 'complete_story')
  } finally {
    f.cleanup()
  }
})
