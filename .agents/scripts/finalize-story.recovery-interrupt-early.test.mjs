import { fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

for (const phase of ['LOCKED', 'STAGED', 'COMMITTING']) {
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
