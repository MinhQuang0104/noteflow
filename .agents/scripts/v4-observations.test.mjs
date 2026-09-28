import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import {
  createObservation,
  normalizeUsage,
  readObservationEvents,
  recordObservation,
  summarizeObservations,
} from './v4-observations.mjs'

const SCRIPT = fileURLToPath(new URL('./v4-observations.mjs', import.meta.url))

function withFixture(callback) {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try { return callback(fixture) } finally { fixture.cleanup() }
}

function event(fixture, overrides = {}) {
  return createObservation(fixture.root, {
    event_id: overrides.event_id ?? 'evt-1',
    event_type: overrides.event_type ?? 'diagnostic',
    source_kind: overrides.source_kind ?? 'test',
    source_id: overrides.source_id ?? 'fixture-test',
    story_id: overrides.story_id ?? fixture.storyId,
    payload: overrides.payload ?? { note: 'bounded synthetic evidence' },
    ...overrides,
  })
}

test('records one immutable event, repeats are NOOP, and conflicting payloads are rejected', () => withFixture(fixture => {
  const original = event(fixture)
  const first = recordObservation(fixture.root, original)
  const repeat = recordObservation(fixture.root, original)
  const conflict = recordObservation(fixture.root, event(fixture, { payload: { note: 'changed' } }))

  assert.equal(first.status, 'RECORDED')
  assert.equal(repeat.status, 'NOOP')
  assert.equal(conflict.status, 'CONFLICT')
  assert.equal(readObservationEvents(fixture.root).length, 1)
  assert.equal(JSON.parse(readFileSync(first.path, 'utf8')).event_id, 'evt-1')
}))

test('usage normalization keeps unknown values explicit and does not double-count parent exports or reasoning subsets', () => withFixture(fixture => {
  const parentUsage = normalizeUsage({
    usage_id: 'usage-parent',
    provider: 'openai',
    model: 'gpt-5.6-luna',
    effort: 'max',
    units: 'tokens',
    uncached_input_tokens: 100,
    cached_input_tokens: null,
    output_tokens: 40,
    reasoning_tokens: 10,
    output_includes_reasoning: true,
    input_includes_cached: 'unknown',
    context_bytes: { generated: 0, projected: 0, delivered: 0 },
    measurement_kind: 'provider',
    source_export_id: 'export-parent',
    unknown_reasons: { cached_input_tokens: 'provider_omitted', input_includes_cached: 'provider_semantics_unknown' },
  })
  const childUsage = normalizeUsage({
    ...parentUsage,
    usage_id: 'usage-child',
    source_export_id: 'export-child',
    parent_export_id: 'export-parent',
  })
  recordObservation(fixture.root, event(fixture, {
    event_id: 'usage-parent-event',
    event_type: 'usage_imported',
    payload: { usage: parentUsage },
  }))
  recordObservation(fixture.root, event(fixture, {
    event_id: 'usage-child-event',
    event_type: 'usage_imported',
    payload: { usage: childUsage },
  }))
  const contextUsage = normalizeUsage({
    usage_id: 'usage-context',
    units: 'tokens',
    measurement_kind: 'provider',
    uncached_input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    output_includes_reasoning: false,
    input_includes_cached: false,
    context_bytes: { generated: 12, projected: 20, delivered: null },
    unknown_reasons: { 'context_bytes.delivered': 'host_did_not_report' },
  })
  recordObservation(fixture.root, event(fixture, {
    event_id: 'usage-context-event',
    event_type: 'usage_imported',
    payload: { usage: contextUsage },
  }))

  const summary = summarizeObservations(readObservationEvents(fixture.root), { story_id: fixture.storyId })
  assert.equal(summary.totals.uncached_input_tokens, 100)
  assert.equal(summary.totals.output_tokens, 40)
  assert.equal(summary.totals.reasoning_tokens, 0)
  assert.equal(summary.totals.cached_input_tokens, null)
  assert.ok(summary.unknowns.includes('cached_input_tokens:provider_omitted'))
  assert.equal(summary.context_bytes.generated, 12)
  assert.equal(summary.context_bytes.projected, 20)
  assert.equal(summary.context_bytes.delivered, null)
  assert.ok(summary.unknowns.includes('context_bytes.delivered:host_did_not_report'))
  assert.equal(summary.usage_records, 2)
  assert.deepEqual(summary.sources, ['export-parent'])
}))

test('summary preserves measured, partial, and unknown coverage without making lifecycle decisions', () => withFixture(fixture => {
  recordObservation(fixture.root, event(fixture, {
    event_id: 'measured',
    event_type: 'action_finished',
    coverage: 'MEASURED',
  }))
  recordObservation(fixture.root, event(fixture, {
    event_id: 'partial',
    event_type: 'session_checkpoint',
    coverage: 'PARTIAL',
  }))
  recordObservation(fixture.root, event(fixture, {
    event_id: 'unknown',
    event_type: 'diagnostic',
    coverage: 'UNKNOWN',
  }))

  const summary = summarizeObservations(readObservationEvents(fixture.root), { story_id: fixture.storyId })
  assert.equal(summary.coverage, 'UNKNOWN')
  assert.equal(summary.event_count, 3)
  assert.equal('lifecycle' in summary, false)
  assert.equal('progression_eligible' in summary, false)
}))

test('rejects traversal, foreign repository, secrets, oversized payloads, and malformed usage', () => withFixture(fixture => {
  const cases = [
    [event(fixture, { event_id: '../escape' }), 'INVALID_EVENT_ID'],
    [event(fixture, { event_id: 'foreign', repository_id: 'sha256:' + 'f'.repeat(64) }), 'REPOSITORY_ID_MISMATCH'],
    [event(fixture, { event_id: 'secret', payload: { authorization: 'Bearer hidden' } }), 'SECRET_FIELD'],
    [event(fixture, { event_id: 'oversized', payload: { text: 'x'.repeat(64 * 1024) } }), 'EVENT_TOO_LARGE'],
  ]
  for (const [candidate, reason] of cases) {
    const result = recordObservation(fixture.root, candidate)
    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, reason)
  }
  assert.throws(() => normalizeUsage({ units: 'dollars' }), /INVALID_USAGE_UNITS/)
  assert.throws(() => normalizeUsage({ units: 'tokens', measurement_kind: 'provider', usage_id: 'negative', output_tokens: -1 }), /INVALID_USAGE_NUMBER/)
}))

test('write failures report a coverage gap and never mutate the runtime pointer', () => withFixture(fixture => {
  const observationDirectory = path.join(fixture.root, '.agent-state/v4-observations')
  writeFileSync(observationDirectory, 'not-a-directory')
  const result = recordObservation(fixture.root, event(fixture, { event_id: 'write-failure' }))

  assert.equal(result.status, 'ERROR')
  assert.equal(result.reason, 'OBSERVATION_WRITE_FAILED')
  assert.equal(result.coverage, 'UNKNOWN')
  assert.equal(JSON.parse(readFileSync(fixture.paths.activeRun, 'utf8')).status, 'IDLE')
}))

test('CLI records normalized events and summarizes by Story', () => withFixture(fixture => {
  const input = path.join(os.tmpdir(), `v4-observation-${process.pid}.json`)
  const candidate = event(fixture, { event_id: 'cli-event', event_type: 'session_checkpoint' })
  writeFileSync(input, JSON.stringify(candidate))
  try {
    const record = spawnSync(process.execPath, [SCRIPT, 'record', '--input', input], {
      cwd: fixture.root, encoding: 'utf8', windowsHide: true,
    })
    assert.equal(record.status, 0)
    assert.equal(JSON.parse(record.stdout).status, 'RECORDED')
    const summary = spawnSync(process.execPath, [SCRIPT, 'summarize', '--story', fixture.storyId], {
      cwd: fixture.root, encoding: 'utf8', windowsHide: true,
    })
    assert.equal(summary.status, 0)
    assert.equal(JSON.parse(summary.stdout).event_count, 1)
  } finally {
    try { writeFileSync(input, '') } catch { /* best effort cleanup */ }
  }
}))
