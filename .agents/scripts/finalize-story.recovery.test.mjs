import { STORY, PLAN, fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'

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
