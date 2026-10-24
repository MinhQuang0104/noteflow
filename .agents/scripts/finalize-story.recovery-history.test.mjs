import { PLAN, FINALIZATION, fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git, write, digest } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { receiptDigest } from './check-artifact-contract.mjs'
import { stableDigest } from './check-story-finalization.mjs'

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

function request(f) {
  return { story_id: '9.1', expected_head: f.head, executor_commit: git(executorFixture, 'rev-parse', 'HEAD'),
    transaction_id: 'fixture-finalization-recovery', maintenance_authorization: 'V4_LITE_FINALIZATION_RECOVERY' }
}

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
