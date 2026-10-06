import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { classifyFinalizationRecovery } from './check-story-finalization.mjs'
import { stableFinalizationDigest } from './finalization-contract.mjs'
import { gitFailure } from './finalize-story.mjs'

test('Git timeout diagnostics preserve timeout phase, status, signal and subprocess output', () => {
  const failure = gitFailure({ command: ['git', 'add', '--', 'docs/đọc.md'], status: null, signal: 'SIGTERM',
    error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), stdout: 'partial out', stderr: 'partial err', timeout_ms: 10000 }, 'stage')
  assert.deepEqual(failure, { phase: 'stage', command: ['git', 'add', '--', 'docs/đọc.md'], status: null, signal: 'SIGTERM',
    error: { name: 'Error', code: 'ETIMEDOUT', message: 'timed out' }, stdout: 'partial out', stderr: 'partial err', timeout_ms: 10000, timeout_phase: 'stage' })
})

const STORY = 'docs/story.md'
const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const RECEIPT = '_bmad-output/implementation-artifacts/receipts/story-9-1/finalization.json'

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
  const root = mkdtempSync(path.join(tmpdir(), 'finalization-recovery-'))
  write(root, STORY, '---\nstory_id: "9.1"\ntitle: Fixture\nstatus: in-progress\n---\n\n# Story\n')
  write(root, PLAN, '---\nschema_version: 2\nstory_id: "9.1"\nstory:\n  path: docs/story.md\n  normative_digest: sha256:' + 'a'.repeat(64) + '\nupstream_epic:\n  path: docs/product/epics.md\n  section_digest: sha256:' + 'b'.repeat(64) + '\nsprint_key: 9-1-fixture\nlifecycle_snapshot: in-progress\nexecution_status: in-progress\nnext_action:\n  kind: finalize_story\n  target: story\n---\n')
  write(root, SPRINT, 'development_status:\n  9-1-fixture: in-progress\n')
  write(root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: null, storyId: null, status: 'IDLE' }))
  write(root, 'seed.txt', 'seed\n')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return { root, head: git(root, 'rev-parse', 'HEAD'), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function setState(f, state) {
  const storyStatus = state.storyReview ? 'review' : 'in-progress'
  const lifecycle = state.planReview ? 'review' : 'in-progress'
  const execution = state.planReview ? 'complete' : 'in-progress'
  const action = state.planReview ? 'complete_story' : 'finalize_story'
  let finalization = ''
  if (state.receipt) {
    const receipt = {
      schema_version: 1,
      kind: 'story_finalization',
      story_id: '9.1',
      story_normative_digest: 'sha256:' + 'a'.repeat(64),
      upstream_epic_digest: 'sha256:' + 'b'.repeat(64),
      prepared_from_head: f.head,
      slice_set_digest: 'sha256:' + 'c'.repeat(64),
      receipt_set_digest: 'sha256:' + 'd'.repeat(64),
      ac_coverage_digest: 'sha256:' + 'e'.repeat(64),
      canonical_disclosures_digest: 'sha256:' + 'f'.repeat(64),
      scope_path_count: 0,
      scope_paths_digest: 'sha256:' + '0'.repeat(64),
      implementation_commit_set_digest: 'sha256:' + '1'.repeat(64),
      final_scoped_tree_digest: 'sha256:' + '2'.repeat(64),
      done_gate_disposition: 'SATISFIED',
      lifecycle_from: 'in-progress',
      lifecycle_target: 'review'
    }
    write(f.root, RECEIPT, JSON.stringify(receipt))
    finalization = 'finalization:\n  receipt_ref: ' + RECEIPT + '\n  receipt_digest: ' +
      stableFinalizationDigest(receipt) + '\n  done_gate_disposition: SATISFIED\n  scope_paths_digest: ' +
      receipt.scope_paths_digest + '\n  implementation_commit_set_digest: ' + receipt.implementation_commit_set_digest +
      '\n  final_scoped_tree_digest: ' + receipt.final_scoped_tree_digest + '\n  prepared_from_head: ' + f.head + '\n'
  }
  write(f.root, STORY, '---\nstory_id: "9.1"\ntitle: Fixture\nstatus: ' + storyStatus + '\n---\n\n# Story\n')
  write(f.root, PLAN, '---\nschema_version: 2\nstory_id: "9.1"\nstory:\n  path: docs/story.md\n  normative_digest: sha256:' + 'a'.repeat(64) + '\nupstream_epic:\n  path: docs/product/epics.md\n  section_digest: sha256:' + 'b'.repeat(64) + '\nsprint_key: 9-1-fixture\nlifecycle_snapshot: ' + lifecycle + '\nexecution_status: ' + execution + '\n' + finalization + 'next_action:\n  kind: ' + action + '\n  target: story\n---\n')
  write(f.root, SPRINT, 'development_status:\n  9-1-fixture: ' + (state.sprintReview ? 'review' : 'in-progress') + '\n')
}

function commitState(f) {
  git(f.root, 'add', '.')
  git(f.root, 'commit', '-qm', 'state')
  f.head = git(f.root, 'rev-parse', 'HEAD')
}

function approvalBlock(f) {
  const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPT), 'utf8'))
  const receiptDigest = stableFinalizationDigest(receipt)
  return [
    'human_approval:',
    '  schema_version: 1',
    '  story_id: "9.1"',
    '  approver_type: human',
    '  decision: APPROVED',
    '  approved_at: "2026-09-26T12:00:00.000Z"',
    '  story_normative_digest: sha256:' + 'a'.repeat(64),
    '  finalization_receipt_digest: ' + receiptDigest,
    '  done_gate_summary_digest: sha256:' + '1'.repeat(64),
    '  scope_paths_digest: ' + receipt.scope_paths_digest,
    '  implementation_commit_set_digest: ' + receipt.implementation_commit_set_digest,
    '  final_scope_digest: ' + receipt.final_scoped_tree_digest,
    '  final_scoped_tree_digest: ' + receipt.final_scoped_tree_digest,
    '  approved_review_head: ' + f.head,
    '  approved_commit: ' + f.head,
    '  approved_action: complete_story',
    '  disclosures_acknowledged: true',
    ''
  ].join('\n')
}

function addApproval(f, commit = true, stale = false) {
  const block = approvalBlock(f)
  const text = f.staleApproval ? block.replace(/^  finalization_receipt_digest: .*$/m, '  finalization_receipt_digest: sha256:' + 'f'.repeat(64)) : block
  write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('next_action:\n', text + 'next_action:\n'))
  if (commit) commitState(f)
}

test('healthy committed review without approval is HUMAN_GATE_PENDING', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'HUMAN_GATE_PENDING', JSON.stringify(result))
    assert.equal(result.healthy, true)
  } finally {
    f.cleanup()
  }
})

test('uncommitted Story transition is UNCOMMITTED_FINALIZATION', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true })
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'UNCOMMITTED_FINALIZATION')
  } finally {
    f.cleanup()
  }
})

for (const [label, state, expected] of [
  ['Story-only partial', { storyReview: true }, 'PARTIAL_STORY_ONLY'],
  ['Plan-only partial', { planReview: true }, 'PARTIAL_PLAN_ONLY'],
  ['sprint-only partial', { sprintReview: true }, 'PARTIAL_SPRINT_ONLY']
]) {
  test(label + ' is classified without cleanup', () => {
    const f = fixture()
    try {
      setState(f, state)
      commitState(f)
      const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
      assert.equal(result.classification, expected, JSON.stringify(result))
    } finally {
      f.cleanup()
    }
  })
}

test('orphan receipt is classified without deletion', () => {
  const f = fixture()
  try {
    setState(f, { receipt: true })
    commitState(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'ORPHAN_FINALIZATION_RECEIPT', JSON.stringify(result))
    assert.equal(readFileSync(path.join(f.root, RECEIPT), 'utf8').length > 0, true)
  } finally {
    f.cleanup()
  }
})

test('committed receipt tamper is detected', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    const file = path.join(f.root, RECEIPT)
    writeFileSync(file, readFileSync(file, 'utf8').replace('"done_gate_disposition":"SATISFIED"', '"done_gate_disposition":"SATISFIED_WITH_DISCLOSURES"'))
    git(f.root, 'add', RECEIPT)
    git(f.root, 'commit', '-qm', 'tamper receipt')
    f.head = git(f.root, 'rev-parse', 'HEAD')
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'TAMPERED_FINALIZATION_RECEIPT', JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})

test('uncommitted durable approval bytes are APPROVAL_PREVIEW_ONLY', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    addApproval(f, false)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'APPROVAL_PREVIEW_ONLY', JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})

test('durable approval with review projections is APPROVAL_DURABLE_PENDING_COMPLETION', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    addApproval(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'APPROVAL_DURABLE_PENDING_COMPLETION', JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})

for (const [label, field] of [
  ['Story', 'story'],
  ['Plan', 'plan'],
  ['sprint', 'sprint']
]) test(`${label}-only done projection is PARTIAL_${field.toUpperCase()}_ONLY`, () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    if (field === 'story') write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8').replace('status: review', 'status: done'))
    if (field === 'plan') write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('lifecycle_snapshot: review', 'lifecycle_snapshot: done').replace('next_action:\n  kind: complete_story\n  target: story', 'next_action: null'))
    if (field === 'sprint') write(f.root, SPRINT, readFileSync(path.join(f.root, SPRINT), 'utf8').replace('review', 'done'))
    commitState(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, `PARTIAL_${field.toUpperCase()}_ONLY`, JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})

test('stale approval is classified without repair', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    f.staleApproval = true
    addApproval(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'STALE_APPROVAL', JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})

test('fully consistent done projections are terminal healthy', () => {
  const f = fixture()
  try {
    setState(f, { storyReview: true, planReview: true, sprintReview: true, receipt: true })
    commitState(f)
    addApproval(f)
    write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8').replace('status: review', 'status: done'))
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('lifecycle_snapshot: review', 'lifecycle_snapshot: done').replace('next_action:\n  kind: complete_story\n  target: story', 'next_action: null'))
    write(f.root, SPRINT, readFileSync(path.join(f.root, SPRINT), 'utf8').replace('review', 'done'))
    commitState(f)
    const result = classifyFinalizationRecovery(f.root, '9.1', f.head)
    assert.equal(result.classification, 'TERMINAL_HEALTHY', JSON.stringify(result))
    assert.equal(result.healthy, true)
  } finally {
    f.cleanup()
  }
})
