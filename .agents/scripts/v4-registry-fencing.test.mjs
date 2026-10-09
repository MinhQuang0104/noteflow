import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import { claimStory, assertLeadGeneration, registryPaths } from './story-registry.mjs'
import { autopilotStatus, recordAutopilot, runV4Story } from './v4-story-runner.mjs'
import * as kernel from './v4-action-kernel.mjs'
import { executeSliceTransaction, executeMetadataTransaction, snapshotWorkingFiles, transactionHash, transactionIdentity } from './v4-slice-transaction.mjs'
import { runLifecycleTransaction, lifecyclePaths } from './v4-lifecycle-transaction.mjs'
import { applyFinalization } from './finalize-story.mjs'

const RUNNER = fileURLToPath(new URL('./v4-story-runner.mjs', import.meta.url))
const authority = { action: 'authorize_autopilot', story_id: '9.1', lead_vendor: 'codex',
  budgets: { max_slices: 1, max_rework_per_slice: 1, max_minutes_per_slice: 30 } }
const claim = root => claimStory(root, '9.1', { worktree: root, leadVendor: 'codex', session: 'original' })
const takeover = root => claimStory(root, '9.1', { takeover: true, leadVendor: 'claude', session: 'replacement' })
const head = f => f.git(['rev-parse', 'HEAD'])
function authorizedFixture() {
  const f = createV4Fixture()
  assert.equal(claim(f.root).status, 'APPLIED')
  assert.equal(recordAutopilot(f.root, '9.1', head(f), { authorization: authority }).status, 'AUTHORIZED')
  return f
}

test('Runner and autopilot-status require the current generation and claimed worktree', () => {
  const f = authorizedFixture()
  try {
    const current = head(f), bytes = readFileSync(f.paths.plan, 'utf8'), before = f.gitStatus()
    const input = { story_id: '9.1', action: 'implement_slice', slice_id: 'A', expected_head: current }
    assert.deepEqual(runV4Story(f.root, '9.1', { expectedHead: current, operation: 'checkpoint', input }).reasons, ['REGISTRY_CLAIM_REQUIRED'])
    assert.deepEqual(autopilotStatus(f.root, '9.1', current).reasons, ['REGISTRY_CLAIM_REQUIRED'])
    assert.equal(autopilotStatus(f.root, '9.1', current, 1).status, 'CONTINUE')
    assert.equal(takeover(f.root).record.generation, 2)
    assert.deepEqual(runV4Story(f.root, '9.1', { expectedHead: current, leadGeneration: 1, operation: 'checkpoint', input }).reasons, ['GENERATION_FENCED'])
    assert.deepEqual(autopilotStatus(f.root, '9.1', current, 1).reasons, ['GENERATION_FENCED'])
    const cli = spawnSync(process.execPath, [RUNNER, 'autopilot-status', '9.1', '--expected-head', current, '--lead-generation', '2'], { cwd: f.root, encoding: 'utf8', windowsHide: true })
    assert.equal(cli.status, 0, cli.stdout)
    assert.equal(JSON.parse(cli.stdout).status, 'CONTINUE')
    const recordFile = registryPaths(f.root, '9.1').record
    const record = JSON.parse(readFileSync(recordFile, 'utf8'))
    record.worktree = path.join(f.root, 'another worktree')
    writeFileSync(recordFile, JSON.stringify(record))
    assert.deepEqual(autopilotStatus(f.root, '9.1', current, 2).reasons, ['REGISTRY_CLAIM_REQUIRED'])
    assert.equal(readFileSync(f.paths.plan, 'utf8'), bytes)
    assert.deepEqual(f.gitStatus(), before)
    assert.equal(head(f), current)
  } finally { f.cleanup() }
})

test('all named Lead kernel operations reject a superseded generation before writes', () => {
  const f = authorizedFixture()
  try {
    assert.equal(takeover(f.root).status, 'APPLIED')
    const current = head(f), before = f.gitStatus(), bytes = readFileSync(f.paths.plan, 'utf8')
    for (const operation of [kernel.checkpointImplementation, kernel.verifySlice, kernel.recordSliceReview, kernel.prepareRework, kernel.applyRework]) {
      const result = operation(f.root, { story_id: '9.1', slice_id: 'A', lead_generation: 1, expected_head: current })
      assert.equal(result.status, 'STALE', JSON.stringify(result))
      assert.deepEqual(result.reasons, ['GENERATION_FENCED'])
    }
    assert.equal(readFileSync(f.paths.plan, 'utf8'), bytes)
    assert.deepEqual(f.gitStatus(), before)
    assert.equal(head(f), current)
  } finally { f.cleanup() }
})

for (const mode of ['implementation', 'metadata', 'lifecycle']) {
  test(`${mode} transaction rechecks generation after acquiring its lock`, () => {
    const f = authorizedFixture()
    try {
      const current = head(f)
      const descriptor = { action: mode === 'implementation' ? 'implement_slice' : 'verify_slice', story_id: '9.1', slice_id: 'A',
        transaction_id: `fence-${mode}`, expected_head: current, checkpoint_commit: current,
        preview_fingerprint: transactionHash('fence-preview'), implementation_paths: ['src/fixture.txt'], metadata_paths: ['meta/receipt.json'],
        buildMetadata: () => ({ paths: ['meta/receipt.json'], files: { 'meta/receipt.json': '{}\n' } }),
        validateMetadata: () => {}, validateFinal: () => {} }
      const locations = mode === 'lifecycle' ? lifecyclePaths(f.root, '9.1') : transactionIdentity(f.root, descriptor)
      let checked = false, mutated = false
      const assertFence = root => {
        assert.equal(existsSync(locations.lockPath), true)
        assert.equal(takeover(root).record.generation, 2)
        checked = true
        assertLeadGeneration(root, '9.1', 1)
      }
      let result
      if (mode === 'implementation') {
        writeFileSync(f.paths.source, 'new implementation\n')
        descriptor.snapshot = snapshotWorkingFiles(f.root, descriptor.implementation_paths)
        result = executeSliceTransaction(f.root, { ...descriptor, assertFence })
      } else if (mode === 'metadata') result = executeMetadataTransaction(f.root, { ...descriptor, assertFence })
      else result = runLifecycleTransaction(f.root, { storyId: '9.1', action: 'finalize_story', expectedHead: current, assertFence }, () => { mutated = true; return { status: 'APPLIED' } })
      assert.equal(checked, true)
      assert.equal(mutated, false)
      assert.equal(result.status, 'STALE', JSON.stringify(result))
      assert.deepEqual(result.reasons, ['GENERATION_FENCED'])
      assert.equal(existsSync(locations.lockPath), false)
      assert.equal(existsSync(path.join(f.root, 'meta/receipt.json')), false)
      assert.equal(head(f), current)
      assert.equal(f.git(['diff', '--cached', '--name-only']), '')
    } finally { f.cleanup() }
  })
}

test('finalize_story passes its optional fence through to the lifecycle lock', () => {
  const f = createCompletionFixture()
  try {
    const current = f.git('rev-parse', 'HEAD'), locations = lifecyclePaths(f.root, '9.1')
    let checked = false
    const result = applyFinalization(f.root, '9.1', current, { assertFence: () => {
      checked = true
      assert.equal(existsSync(locations.lockPath), true)
      throw Object.assign(new Error('GENERATION_FENCED'), { fenceStatus: 'STALE' })
    } })
    assert.equal(checked, true)
    assert.equal(result.status, 'STALE')
    assert.deepEqual(result.reasons, ['GENERATION_FENCED'])
    assert.equal(existsSync(locations.lockPath), false)
    assert.equal(f.git('rev-parse', 'HEAD'), current)
  } finally { f.cleanup() }
})

test('owner authorization, revocation, exact approval and completion never require a claim', () => {
  const f = createCompletionFixture()
  try {
    let current = f.git('rev-parse', 'HEAD')
    const authorized = runV4Story(f.root, '9.1', { expectedHead: current, autopilotAuthorization: authority })
    assert.equal(authorized.status, 'AUTHORIZED', JSON.stringify(authorized))
    current = f.git('rev-parse', 'HEAD')
    const approved = runV4Story(f.root, '9.1', { expectedHead: current, approveExactScope: true })
    assert.equal(approved.status, 'APPROVAL_DURABLE_PENDING_COMPLETION', JSON.stringify(approved))
    const completed = runV4Story(f.root, '9.1', { expectedHead: f.git('rev-parse', 'HEAD') })
    assert.equal(completed.status, 'DONE', JSON.stringify(completed))
    assert.equal(existsSync(registryPaths(f.root, '9.1').record), false)
  } finally { f.cleanup() }
  const other = createV4Fixture()
  try {
    assert.equal(runV4Story(other.root, '9.1', { expectedHead: head(other), autopilotAuthorization: authority }).status, 'AUTHORIZED')
    assert.equal(runV4Story(other.root, '9.1', { expectedHead: head(other), revokeAutopilot: true }).status, 'APPLIED')
    assert.equal(existsSync(registryPaths(other.root, '9.1').record), false)
  } finally { other.cleanup() }
})

test('read-only preparation, owner review and maintenance recovery do not consult a claim', () => {
  const f = authorizedFixture()
  try {
    const current = head(f)
    const input = { story_id: '9.1', slice_id: 'A', action: 'implement_slice', expected_head: current }
    const results = [kernel.prepareAction(f.root, input),
      kernel.recordSliceReview(f.root, { ...input, review: { reviewer: { type: 'human' } } }),
      kernel.checkpointImplementation(f.root, { ...input, recovery_authorized: true }),
      runV4Story(f.root, '9.1', { expectedHead: current, operation: 'record-owner-review', input })]
    for (const result of results) {
      assert.ok(!result.reasons?.includes('REGISTRY_CLAIM_REQUIRED'), JSON.stringify(result))
      assert.ok(!result.reasons?.includes('GENERATION_FENCED'), JSON.stringify(result))
    }
    assert.equal(head(f), current)
  } finally { f.cleanup() }
})
