import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { stableFinalizationDigest } from './finalization-contract.mjs'
import { validate } from './check-story-plan.mjs'

const STORY = 'docs/story-9-1.md'
const EPIC = 'docs/product/epics.md'
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const FINALIZATION = '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json'
const storyText = [
  '---',
  'story_id: "9.1"',
  'title: Fixture finalization story',
  'status: review',
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
  '<!-- v4:ac:end -->',
  '',
  '## Tasks',
  '',
  '<!-- v4:tasks:start -->',
  '- [x] T-1 [AC-1]: implement the fixture behavior.',
  '<!-- v4:tasks:end -->',
  '',
  '## References',
  '',
  '<!-- v4:references:start -->',
  '- product: docs/product/epics.md#story-91-fixture-finalization-story',
  '<!-- v4:references:end -->',
  '',
  '## Risk',
  '',
  '<!-- v4:risk:start -->',
  '- classification: LOW',
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
  const root = mkdtempSync(path.join(tmpdir(), 'finalization-plan-'))
  const storyDigest = normativeDigest(inspectStory(storyText))
  const epicSection = '### Story 9.1: Fixture finalization story\n\nDone.\n\n'
  write(root, STORY, storyText)
  write(root, EPIC, '# Epic\n\n' + epicSection + '### Story 9.2: Next\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, SPRINT, 'development_status:\n  9-1-fixture: review\n')
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
  const changedPathsSha256 = digest('src/implementation.txt\n')
  const receiptBase = kind => ({
    schema_version: 1,
    story_id: '9.1',
    slice_id: 'A',
    kind,
    checkpoint_commit: checkpoint,
    baseline_commit: baseline,
    subject_digest: storyDigest,
    created_from_head: checkpoint,
    changed_paths_sha256: changedPathsSha256,
    commands: [{ command: 'fixture check', exit_code: 0, tool: 'fixture', environment: 'node-test' }]
  })
  const refs = {}
  for (const kind of ['implementation', 'verification', 'review']) {
    const receipt = receiptBase(kind)
    if (kind === 'verification') {
      receipt.focused_checks = [{ id: 'focused', result: 'PASS', exit_code: 0 }]
      receipt.progression_eligible = true
    }
    if (kind === 'review') {
      receipt.verdict = 'APPROVE'
      receipt.reviewed_commit = checkpoint
      receipt.freshness = 'FRESH'
    }
    const relative = 'receipts/' + kind + '.json'
    write(root, relative, JSON.stringify(receipt))
    refs[kind] = { path: relative, digest: receiptDigest(receipt) }
  }
  const finalizationReceipt = {
    schema_version: 1,
    kind: 'story_finalization',
    story_id: '9.1',
    story_normative_digest: storyDigest,
    upstream_epic_digest: digest(epicSection),
    prepared_from_head: checkpoint,
    slice_set_digest: stableFinalizationDigest([{ id: 'A', status: 'reviewed' }]),
    receipt_set_digest: stableFinalizationDigest(Object.values(refs)),
    ac_coverage_digest: stableFinalizationDigest([{ id: 'AC-1', covered: true }]),
    canonical_disclosures_digest: stableFinalizationDigest([]),
    scope_path_count: 1,
    scope_paths_digest: stableFinalizationDigest(['src/implementation.txt']),
    implementation_commit_set_digest: stableFinalizationDigest([{ slice_id: 'A', checkpoint_commit: checkpoint }]),
    final_scoped_tree_digest: stableFinalizationDigest([{ path: 'src/implementation.txt', blob: git(root, 'rev-parse', checkpoint + ':src/implementation.txt') }]),
    done_gate_disposition: 'SATISFIED',
    lifecycle_from: 'in-progress',
    lifecycle_target: 'review'
  }
  write(root, FINALIZATION, JSON.stringify(finalizationReceipt))
  const finalizationDigest = stableFinalizationDigest(finalizationReceipt)
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
    'lifecycle_snapshot: review',
    'execution_status: complete',
    'current_slice: A',
    'risk:',
    '  level: LOW',
    'slices:',
    '  - id: A',
    '    status: reviewed',
    '    depends_on: []',
    '    task_refs: [T-1]',
    '    baseline_commit: ' + baseline,
    '    checkpoint_commit: ' + checkpoint,
    '    subject_digest: ' + storyDigest,
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
    '    review:',
    '      required: true',
    '      verdict: APPROVE',
    '      reviewed_commit: ' + checkpoint,
    '      freshness: FRESH',
    'blockers: []',
    'unresolved_questions: []',
    'finalization:',
    '  receipt_ref: ' + FINALIZATION,
    '  receipt_digest: ' + finalizationDigest,
    '  done_gate_disposition: SATISFIED',
    '  scope_paths_digest: ' + finalizationReceipt.scope_paths_digest,
    '  implementation_commit_set_digest: ' + finalizationReceipt.implementation_commit_set_digest,
    '  final_scoped_tree_digest: ' + finalizationReceipt.final_scoped_tree_digest,
    '  prepared_from_head: ' + checkpoint,
    'next_action:',
    '  kind: complete_story',
    '  target: story',
    'human_approval: null',
    '---',
    ''
  ].join('\n')
  write(root, PLAN, plan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'review fixture')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('schema-v2 review state validates finalization receipt and complete_story successor', () => {
  const f = fixture()
  try {
    const result = validate(f.root, '9.1')
    assert.equal(result.status, 'READY', JSON.stringify(result))
    assert.deepEqual(result.nextAction, { kind: 'complete_story', target: 'story' })
  } finally {
    f.cleanup()
  }
})
