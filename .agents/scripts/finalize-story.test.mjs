import { STORY, PLAN, FINALIZATION, fixture, candidate, preserved } from './finalize-story-fixture.mjs'
import { git, write, digest } from './v4-test-helpers.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { inspectStory, normativeDigest } from './check-artifact-contract.mjs'
import { frontmatter } from './check-story-plan.mjs'
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

function request(f) {
  return { story_id: '9.1', expected_head: f.head, executor_commit: git(executorFixture, 'rev-parse', 'HEAD'),
    transaction_id: 'fixture-finalization-recovery', maintenance_authorization: 'V4_LITE_FINALIZATION_RECOVERY' }
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
