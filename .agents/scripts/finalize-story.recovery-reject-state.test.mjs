import { STORY, FINALIZATION, fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

for (const scenario of ['index-lock', 'foreign-lock', 'idle', 'receipt-tamper', 'scope-omission', 'stale-head']) {
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
