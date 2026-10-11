import { STORY, PLAN, FINALIZATION, fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git, write, digest } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest, receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
import { stableDigest } from './check-story-finalization.mjs'
import * as finalizer from './finalize-story.mjs'
import { buildFinalizationPreview, applyFinalization, prepareFinalization } from './finalize-story.mjs'
import { lifecyclePaths } from './v4-lifecycle-transaction.mjs'
// Exercise a genuinely committed executor, independently of the dirty TDD checkout.
const executorFixture = mkdtempSync(path.join(tmpdir(), 'finalization-executor-'))
cpSync(path.dirname(fileURLToPath(import.meta.url)), path.join(executorFixture, '.agents/scripts'), { recursive: true })
git(executorFixture, 'init', '-q')
git(executorFixture, 'config', 'user.email', 'test@example.com')
git(executorFixture, 'config', 'user.name', 'Test')
git(executorFixture, 'add', '.')
git(executorFixture, 'commit', '-qm', 'committed recovery executor fixture')
const recovery = await import(pathToFileURL(path.join(executorFixture, '.agents/scripts/finalization-recovery.mjs')).href)
after(() => rmSync(executorFixture, { recursive: true, force: true }))


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

test('Git add failure retains subprocess diagnostics rather than reporting a scope mismatch', () => {
  const f = fixture()
  try {
    write(f.root, '.git/index.lock', 'foreign index lock')
    const result = applyFinalization(f.root, '9.1', f.head)
    assert.equal(result.reasons[0], 'GIT_ADD_FAILED', JSON.stringify(result))
    assert.equal(result.git_failure.phase, 'stage')
    assert.equal(result.git_failure.status, 128)
    assert.match(result.git_failure.stderr, /index\.lock/)
    assert.equal(result.git_failure.timeout_ms, 10000)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'diff', '--cached', '--name-only'), '')
    assert.ok(result.lifecycle_transaction?.journal_path, JSON.stringify(result))
    assert.ok(existsSync(result.lifecycle_transaction.journal_path))
    assert.ok(existsSync(result.lifecycle_transaction.lock_path))
  } finally { f.cleanup() }
})

test('NUL-delimited Git path parsing preserves Unicode, quotes and embedded newlines', () => {
  assert.equal(typeof finalizer.parseGitPaths, 'function')
  assert.deepEqual(finalizer.parseGitPaths('docs/đọc.md\0docs/"quoted".md\0docs/line\nbreak.md\0'),
    ['docs/"quoted".md', 'docs/line\nbreak.md', 'docs/đọc.md'].sort())
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

test('direct finalization rejects a non-IDLE canonical pointer before mutation', () => {
  const f = fixture()
  try {
    write(f.root, '.agent-state/active-run.json', JSON.stringify({ schemaVersion: 1, activeRunId: 'other', storyId: '9.1', status: 'RUNNING' }))
    const result = applyFinalization(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('V3_POINTER_NOT_IDLE'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally {
    f.cleanup()
  }
})

test('direct finalization rejects a Story-owned worktree from the wrong checkout', () => {
  const f = fixture()
  const linked = path.join(f.root, 'linked-story')
  try {
    git(f.root, 'worktree', 'add', '-qb', 'story-9-1-v4', linked, f.head)
    const result = applyFinalization(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('WRONG_CHECKOUT'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally {
    git(f.root, 'worktree', 'remove', '--force', linked)
    f.cleanup()
  }
})

test('direct finalization rejects a concurrent lifecycle lock without removing it', () => {
  const f = fixture()
  try {
    const locations = lifecyclePaths(f.root, '9.1')
    mkdirSync(locations.directory, { recursive: true })
    const foreignLock = JSON.stringify({ transaction_id: 'other', story_id: '9.1' }) + '\n'
    writeFileSync(locations.lockPath, foreignLock)
    const result = applyFinalization(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('LIFECYCLE_SCOPE_LOCKED'), JSON.stringify(result))
    assert.equal(readFileSync(locations.lockPath, 'utf8'), foreignLock)
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

function request(f) {
  return { story_id: '9.1', expected_head: f.head, executor_commit: git(executorFixture, 'rev-parse', 'HEAD'),
    transaction_id: 'fixture-finalization-recovery', maintenance_authorization: 'V4_LITE_FINALIZATION_RECOVERY' }
}

test('recovery prepare is read-only, LF/CRLF projection is proven and apply consumes unchanged candidates once', () => {
  assert.equal(typeof recovery.prepareFinalizationRecovery, 'function')
  const f = fixture()
  try {
    candidate(f, true)
    const input = request(f), before = preserved(f)
    const prepared = recovery.prepareFinalizationRecovery(f.root, input)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.deepEqual(preserved(f), before)
    assert.equal(prepared.recovery_preview.paths.length, 4)
    const apply = { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint }
    const result = recovery.applyFinalizationRecovery(f.root, apply)
    assert.equal(result.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(result))
    assert.deepEqual(preserved(f).files, before.files)
    assert.equal(git(f.root, 'rev-parse', 'HEAD^'), f.head)
    assert.equal(git(f.root, 'diff', '--cached', '--name-only'), '')
    assert.deepEqual(git(f.root, 'show', '--pretty=format:', '--name-only', 'HEAD').split(/\r?\n/).filter(Boolean).sort(), f.expectedPaths.sort())
    const count = git(f.root, 'rev-list', '--count', 'HEAD')
    const repeated = recovery.applyFinalizationRecovery(f.root, apply)
    assert.equal(repeated.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(repeated))
    assert.equal(repeated.commit, result.commit)
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), count)
    assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).human_approval, null)
  } finally { f.cleanup() }
})

for (const scenario of ['fingerprint', 'cross-story', 'executor', 'candidate-tamper', 'extra-path',
  'index-drift', 'index-lock', 'foreign-lock', 'idle', 'receipt-tamper', 'scope-omission', 'stale-head']) {
  test('recovery rejects ' + scenario + ' preserving HEAD/index/files/locks', () => {
    assert.equal(typeof recovery.applyFinalizationRecovery, 'function')
    const f = fixture()
    try {
      candidate(f)
      const input = request(f), prepared = recovery.prepareFinalizationRecovery(f.root, input)
      assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
      const apply = { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint }
      if (scenario === 'fingerprint') apply.fingerprint = 'sha256:' + '0'.repeat(64)
      if (scenario === 'cross-story') apply.story_id = '9.2'
      if (scenario === 'executor') apply.executor_commit = '0'.repeat(40)
      if (scenario === 'candidate-tamper') write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8') + '\ntamper\n')
      if (scenario === 'extra-path') write(f.root, 'src/extra.txt', 'extra\n')
      if (scenario === 'index-drift') git(f.root, 'update-index', '--assume-unchanged', 'seed.txt')
      if (scenario === 'index-lock') write(f.root, '.git/index.lock', 'foreign Git writer')
      if (scenario === 'foreign-lock') write(f.root, '.git/v4-finalize-story.lock', '{"transaction_id":"foreign"}')
      if (scenario === 'idle') write(f.root, '.agent-state/active-run.json', '{"status":"RUNNING"}')
      if (scenario === 'receipt-tamper') write(f.root, FINALIZATION, readFileSync(path.join(f.root, FINALIZATION), 'utf8').replace('"scope_path_count": 1', '"scope_path_count": 0'))
      if (scenario === 'scope-omission') { apply.recovery_preview = { ...apply.recovery_preview, paths: apply.recovery_preview.paths.slice(1) }; apply.fingerprint = stableDigest(apply.recovery_preview) }
      if (scenario === 'stale-head') git(f.root, 'commit', '--allow-empty', '-qm', 'concurrent commit')
      const before = preserved(f)
      const result = recovery.applyFinalizationRecovery(f.root, apply)
      assert.notEqual(result.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(result))
      assert.notEqual(result.status, 'READY')
      assert.deepEqual(preserved(f), before)
      assert.equal(existsSync(path.join(f.root, '.git/noteflow-v4-finalization-recovery/fixture-finalization-recovery.json')), false)
    } finally { f.cleanup() }
  })
}

test('recovery projection rejects a re-signed candidate and executor code drift before mutation', () => {
  const f = fixture()
  try {
    candidate(f)
    const input = request(f)
    write(f.root, STORY, readFileSync(path.join(f.root, STORY), 'utf8') + '\nforeign completion text\n')
    const before = preserved(f)
    const invalid = recovery.prepareFinalizationRecovery(f.root, input)
    assert.equal(invalid.status, 'REJECTED', JSON.stringify(invalid))
    assert.match(invalid.reasons[0], /PROJECTION_MISMATCH|CANDIDATE_GATE_REJECTED/)
    assert.deepEqual(preserved(f), before)
    const executorFile = path.join(executorFixture, '.agents/scripts/finalization-recovery.mjs')
    const original = readFileSync(executorFile)
    try {
      writeFileSync(executorFile, Buffer.concat([original, Buffer.from('\n// uncommitted executor mutation\n')]))
      const drift = recovery.prepareFinalizationRecovery(f.root, input)
      assert.equal(drift.reasons[0], 'EXECUTOR_SOURCE_NOT_COMMITTED', JSON.stringify(drift))
      assert.deepEqual(preserved(f), before)
    } finally { writeFileSync(executorFile, original) }
  } finally { f.cleanup() }
})

test('recovery preserves canonical INCOMPLETE and explicit manual NOT_RUN disclosure', () => {
  const f = fixture()
  try {
    const verificationPath = '_bmad-output/implementation-artifacts/receipts/story-9-1/A-verification.json'
    const old = JSON.parse(readFileSync(path.join(f.root, verificationPath), 'utf8'))
    const next = { ...old, canonical: { applicability: 'APPLICABLE', status: 'INCOMPLETE', complete: false, reasons: ['UNMAPPED_CHANGED_PATH'] },
      done_gate_disclosure: { required: true, coverage_authority: 'focused checks', manual_screen_reader: 'NOT_RUN' } }
    write(f.root, verificationPath, JSON.stringify(next, null, 2) + '\n')
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8')
      .replace(receiptDigest(old), receiptDigest(next)).replace('canonical_status: PASS', 'canonical_status: INCOMPLETE')
      .replace('done_gate_disclosure_required: false', 'done_gate_disclosure_required: true') + '\nManual screen reader: NOT_RUN\n')
    git(f.root, 'add', '.')
    git(f.root, 'commit', '-qm', 'honest disclosures')
    f.head = git(f.root, 'rev-parse', 'HEAD')
    candidate(f)
    const input = request(f), prepared = recovery.prepareFinalizationRecovery(f.root, input)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = recovery.applyFinalizationRecovery(f.root, { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint })
    assert.equal(result.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(result))
    assert.equal(result.canonical_disclosures[0].status, 'INCOMPLETE')
    assert.equal(result.canonical_disclosures[0].complete, false)
    assert.match(readFileSync(path.join(f.root, PLAN), 'utf8'), /Manual screen reader: NOT_RUN/)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, verificationPath), 'utf8')), next)
  } finally { f.cleanup() }
})

test('recovery binds D original and rework implementations without inventing historical verification', () => {
  const f = fixture()
  try {
    const prefix = '_bmad-output/implementation-artifacts/receipts/story-9-1/'
    const original = { ...JSON.parse(readFileSync(path.join(f.root, prefix + 'A-implementation.json'), 'utf8')), slice_id: 'D', attempt_id: 1 }
    write(f.root, prefix + 'D-implementation.json', JSON.stringify(original, null, 2) + '\n')
    const baseline = f.head
    write(f.root, 'src/implementation.txt', 'implementation\nrework\n')
    git(f.root, 'add', 'src/implementation.txt')
    git(f.root, 'commit', '-qm', 'D rework implementation')
    const checkpoint = git(f.root, 'rev-parse', 'HEAD')
    let planText = readFileSync(path.join(f.root, PLAN), 'utf8').replace('current_slice: A', 'current_slice: D').replace('  - id: A', '  - id: D')
      .replace('    baseline_commit: ' + original.baseline_commit, '    baseline_commit: ' + baseline)
      .replaceAll(original.checkpoint_commit, checkpoint)
    for (const kind of ['implementation', 'verification', 'review']) {
      const old = JSON.parse(readFileSync(path.join(f.root, prefix + 'A-' + kind + '.json'), 'utf8'))
      const next = { ...old, slice_id: 'D', attempt_id: 2, baseline_commit: baseline, checkpoint_commit: checkpoint, created_from_head: checkpoint }
      if (kind === 'review') next.reviewed_commit = checkpoint
      const relative = prefix + 'D-' + kind + '-attempt-2.json'
      write(f.root, relative, JSON.stringify(next, null, 2) + '\n')
      planText = planText.replace(prefix + 'A-' + kind + '.json', relative).replace(receiptDigest(old), receiptDigest(next))
    }
    planText = planText.replace('    depends_on: []\n', [
      '    depends_on: []', '    current_attempt:', '      attempt_id: 2', '      receipt_refs:',
      ...['implementation', 'verification', 'review'].flatMap(kind => [
        '        ' + kind + ':', '          path: ' + prefix + 'D-' + kind + '-attempt-2.json'
      ]),
      '    attempt_history:', '      - attempt_id: 1', '        status: checkpointed',
      '        baseline_commit: ' + original.baseline_commit, '        checkpoint_commit: ' + original.checkpoint_commit,
      '        subject_digest: ' + original.subject_digest, '        changed_paths_sha256: ' + original.changed_paths_sha256,
      '        receipt_refs:', '          implementation:', '            path: ' + prefix + 'D-implementation.json',
      '            digest: ' + receiptDigest(original), ''
    ].join('\n'))
    write(f.root, PLAN, planText)
    git(f.root, 'add', '.')
    git(f.root, 'commit', '-qm', 'D reviewed with historical checkpoint obligation')
    f.head = git(f.root, 'rev-parse', 'HEAD')
    const projection = candidate(f)
    const expected = stableDigest([
      { slice_id: 'D', attempt_id: 1, checkpoint_commit: original.checkpoint_commit },
      { slice_id: 'D', attempt_id: 2, checkpoint_commit: checkpoint }
    ])
    assert.equal(projection.receipt.implementation_commit_set_digest, expected)
    const input = request(f), prepared = recovery.prepareFinalizationRecovery(f.root, input)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.equal(prepared.recovery_preview.implementation_commit_set_digest, expected)
    assert.equal(existsSync(path.join(f.root, prefix + 'D-verification.json')), false)
    const apply = { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint }
    const omitted = { ...prepared.recovery_preview, implementation_commit_set_digest: stableDigest([{ slice_id: 'D', attempt_id: 2, checkpoint_commit: checkpoint }]) }
    const before = preserved(f)
    const rejected = recovery.applyFinalizationRecovery(f.root, { ...apply, recovery_preview: omitted, fingerprint: stableDigest(omitted) })
    assert.equal(rejected.status, 'REJECTED', JSON.stringify(rejected))
    assert.deepEqual(preserved(f), before)
    const result = recovery.applyFinalizationRecovery(f.root, apply)
    assert.equal(result.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(result))
    assert.equal(JSON.parse(readFileSync(path.join(f.root, FINALIZATION), 'utf8')).implementation_commit_set_digest, expected)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, prefix + 'D-implementation.json'), 'utf8')), original)
  } finally { f.cleanup() }
})

for (const phase of ['LOCKED', 'STAGED', 'COMMITTING', 'COMMIT_RETURNED', 'COMMITTED']) {
  test('recovery interruption at ' + phase + ' resumes explicitly without duplicate commit', () => {
    assert.equal(typeof recovery.applyFinalizationRecovery, 'function')
    const f = fixture()
    try {
      candidate(f)
      const input = request(f), prepared = recovery.prepareFinalizationRecovery(f.root, input)
      const apply = { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint }
      const bytes = preserved(f).files
      const first = recovery.applyFinalizationRecovery(f.root, apply, { onPhase(current) {
        if (current === phase) throw new Error('fixture interruption')
      } })
      assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
      assert.deepEqual(preserved(f).files, bytes)
      const retry = recovery.applyFinalizationRecovery(f.root, apply)
      assert.equal(retry.status, 'HUMAN_GATE_REQUIRED', JSON.stringify(retry))
      assert.equal(git(f.root, 'rev-parse', 'HEAD^'), f.head)
      const again = recovery.applyFinalizationRecovery(f.root, apply)
      assert.equal(again.commit, retry.commit)
      assert.deepEqual(preserved(f).files, bytes)
    } finally { f.cleanup() }
  })
}

for (const scenario of ['staged-drift', 'unbound-staging', 'journal-tamper']) {
  test('explicit retry rejects ' + scenario + ' preserving the partial journal and owned lock', () => {
    const f = fixture()
    try {
      candidate(f)
      const input = request(f), prepared = recovery.prepareFinalizationRecovery(f.root, input)
      assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
      const apply = { ...input, recovery_preview: prepared.recovery_preview, fingerprint: prepared.fingerprint }
      const first = recovery.applyFinalizationRecovery(f.root, apply, { onPhase(phase) {
        if (phase === (scenario === 'staged-drift' ? 'STAGED' : scenario === 'journal-tamper' ? 'LOCKED' : 'STAGING')) throw new Error('fixture interruption')
      } })
      assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
      if (scenario === 'staged-drift') git(f.root, 'update-index', '--assume-unchanged', 'seed.txt')
      if (scenario === 'journal-tamper') {
        const journal = path.join(f.root, '.git/noteflow-v4-finalization-recovery/fixture-finalization-recovery.json')
        const bytes = JSON.parse(readFileSync(journal, 'utf8'))
        writeFileSync(journal, JSON.stringify({ ...bytes, schema: 'untrusted-journal' }) + '\n')
      }
      const before = preserved(f)
      const result = recovery.applyFinalizationRecovery(f.root, apply)
      assert.equal(result.status, 'REJECTED', JSON.stringify(result))
      assert.match(result.reasons[0], scenario === 'staged-drift' ? /INDEX/ : scenario === 'journal-tamper' ? /JOURNAL/ : /UNBOUND_STAGING/)
      assert.deepEqual(preserved(f), before)
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    } finally { f.cleanup() }
  })
}

test('prepare rejects product drift hidden by an assume-unchanged index flag', () => {
  const f = fixture()
  try {
    candidate(f)
    git(f.root, 'update-index', '--assume-unchanged', 'src/implementation.txt')
    write(f.root, 'src/implementation.txt', 'hidden product mutation\n')
    const before = preserved(f)
    const result = recovery.prepareFinalizationRecovery(f.root, request(f))
    assert.equal(result.status, 'REJECTED', JSON.stringify(result))
    assert.deepEqual(preserved(f), before)
  } finally { f.cleanup() }
})
