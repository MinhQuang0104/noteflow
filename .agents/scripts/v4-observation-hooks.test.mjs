import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { compileActionContext } from './compile-v4-context.mjs'
import { checkpointImplementation } from './v4-action-kernel.mjs'
import { captureWorktreeSubject, executeCheck } from './v4-check-executor.mjs'
import {
  readObservationEvents,
  recordActionFinished,
  recordActionStarted,
  recordContextDelivered,
  recordSessionCheckpoint,
  recordSessionClosed,
  recordStoryCompleted,
  recordStoryReviewSnapshot,
} from './v4-observations.mjs'

function withFixture(callback, options = { schemaVersion: 2, state: 'pending' }) {
  const fixture = createV4Fixture(options)
  try { return callback(fixture) } finally { fixture.cleanup() }
}

function installContextSources(fixture) {
  const files = [
    'AGENTS.md', 'CLAUDE.md', '.agents/routing/task-router.md', '.agents/context/context-routing.md',
    '.agents/context/control-plane.md', '.agents/skills/v4-story-runner/SKILL.md', '.agents/docs/v4-artifact-contract.md',
    '.agents/skills/v4-story-runner/actions/implement-slice.md', '.agents/skills/v4-story-runner/references/implementation-techniques.md',
    '.agents/skills/v4-story-runner/references/recovery.md',
  ]
  for (const relative of files) {
    const file = path.join(fixture.root, relative)
    const directory = path.dirname(file)
    mkdirSync(directory, { recursive: true })
    writeFileSync(file, `# fixture ${relative}\n`)
  }
}

test('real action, check, and context paths emit bounded provenance events', () => withFixture(fixture => {
  installContextSources(fixture)
  const expectedHead = fixture.git(['rev-parse', 'HEAD'])
  const head = readFileSync(fixture.paths.activeRun, 'utf8')
  assert.match(head, /"status": "IDLE"/)
  const context = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', {
    expectedHead,
    invocationId: 'invocation-context-1',
    attemptId: 'context-attempt-1',
  })
  assert.equal(context.status, 'READY', JSON.stringify(context))
  const subject = captureWorktreeSubject(fixture.root, ['src/fixture.txt'])
  const check = executeCheck(fixture.root, {
    id: 'hook-check', classification: 'behavioral', required: true,
    argv: ['node', '-e', 'process.exit(0)'], cwd: '.',
    source: { kind: 'focused-manifest', path: '.agents/skills/v4-story-runner/actions/implement-slice.md' },
    referenced_paths: ['src/fixture.txt'], environment_identity: { name: 'fixture' },
    story_id: fixture.storyId, slice_id: 'A', action: 'verify_slice', attempt_id: 'check-attempt-1',
  }, subject)
  assert.equal(check.status, 'PASS')
  const action = checkpointImplementation(fixture.root, {
    action: 'implement_slice', operation: 'checkpoint', story_id: fixture.storyId, slice_id: 'A',
    expected_head: expectedHead, invocation_id: 'invocation-action-1', attempt_id: 'action-attempt-1',
  })
  assert.equal(action.status, 'ERROR')
  const events = readObservationEvents(fixture.root)
  const types = new Set(events.map(event => event.event_type))
  assert.equal(types.has('context_delivered'), true)
  assert.equal(types.has('check_finished'), true)
  assert.equal(types.has('action_started'), true)
  assert.equal(types.has('action_finished'), true)
  const contextEvent = events.find(event => event.event_type === 'context_delivered')
  assert.equal(contextEvent.payload.projection_fingerprint, context.projection.projection_fingerprint)
  assert.equal(Object.hasOwn(contextEvent.payload, 'raw_prompt'), false)
  assert.equal(Object.hasOwn(contextEvent.payload, 'product_text'), false)
}))

test('hook IDs are idempotent while a new attempt can create a new event', () => withFixture(fixture => {
  const input = {
    story_id: fixture.storyId, slice_id: 'A', action: 'verify_slice', invocation_id: 'invocation-1', attempt_id: 'attempt-1',
    payload: { result_status: 'PASS' }, provenance: { kind: 'test-hook', source: 'fixture' },
  }
  assert.equal(recordActionStarted(fixture.root, input).status, 'RECORDED')
  assert.equal(recordActionStarted(fixture.root, input).status, 'NOOP')
  assert.equal(recordActionFinished(fixture.root, input).status, 'RECORDED')
  assert.equal(recordActionFinished(fixture.root, input).status, 'NOOP')
  assert.equal(recordActionFinished(fixture.root, { ...input, attempt_id: 'attempt-2' }).status, 'RECORDED')
  assert.equal(readObservationEvents(fixture.root).length, 3)
}))

test('session checkpoints stay PARTIAL/UNKNOWN and close does not claim provider session truth', () => withFixture(fixture => {
  const checkpoint = recordSessionCheckpoint(fixture.root, {
    story_id: fixture.storyId, session_id: null, attempt_id: 'window-1',
    payload: { window_id: 'window-1', boundary: 'lead-yield', provider_session_id: null },
    provenance: { kind: 'host_observation', source: 'fixture' },
  })
  const closed = recordSessionClosed(fixture.root, {
    story_id: fixture.storyId, session_id: null, attempt_id: 'window-1-close',
    payload: { window_id: 'window-1', boundary: 'graceful-close', provider_session_id: null },
    provenance: { kind: 'host_observation', source: 'fixture' },
  })
  assert.equal(checkpoint.status, 'RECORDED')
  assert.equal(closed.status, 'RECORDED')
  const events = readObservationEvents(fixture.root, { story_id: fixture.storyId })
  assert.deepEqual(events.map(event => event.coverage), ['PARTIAL', 'PARTIAL'])
  assert.equal(events.every(event => event.session_id === null), true)
}))

test('review snapshot requires real finalization and completed event requires fresh approval', () => withFixture(fixture => {
  const rejectedSnapshot = recordStoryReviewSnapshot(fixture.root, {
    story_id: fixture.storyId, finalization_status: 'READY', attempt_id: 'finalize-1',
    payload: { result_status: 'READY' }, provenance: { kind: 'test', source: 'fixture' },
  })
  assert.equal(rejectedSnapshot.status, 'ERROR')
  const rejectedCompletion = recordStoryCompleted(fixture.root, {
    story_id: fixture.storyId, approval_present: false, approval_fresh: false, attempt_id: 'complete-1',
    payload: { result_status: 'DONE' }, provenance: { kind: 'test', source: 'fixture' },
  })
  assert.equal(rejectedCompletion.status, 'ERROR')
  const snapshot = recordStoryReviewSnapshot(fixture.root, {
    story_id: fixture.storyId, finalization_status: 'HUMAN_GATE_REQUIRED', attempt_id: 'finalize-2',
    payload: { result_status: 'HUMAN_GATE_REQUIRED' }, provenance: { kind: 'test', source: 'fixture' },
  })
  const completed = recordStoryCompleted(fixture.root, {
    story_id: fixture.storyId, approval_present: true, approval_fresh: true, attempt_id: 'complete-2',
    payload: { result_status: 'DONE' }, provenance: { kind: 'test', source: 'fixture' },
  })
  assert.equal(snapshot.status, 'RECORDED')
  assert.equal(completed.status, 'RECORDED')
  const types = readObservationEvents(fixture.root, { story_id: fixture.storyId }).map(event => event.event_type)
  assert.deepEqual(types.sort(), ['story_completed', 'story_review_snapshot'])
}))
