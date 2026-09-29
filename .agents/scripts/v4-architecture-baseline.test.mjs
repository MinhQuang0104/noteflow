import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'

import { buildComparisonBundle, createV4Fixture } from './v4-architecture-fixture.mjs'
import { validate as validateStoryPlan } from './check-story-plan.mjs'

test('creates a synthetic canonical fixture without touching the caller checkout', () => {
  const fixture = createV4Fixture({ schemaVersion: 1, state: 'pending' })
  try {
    assert.notEqual(fixture.root, process.cwd())
    assert.equal(fixture.root, fixture.canonicalRoot)
    assert.equal(fixture.storyId, '9.1')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.state, 'pending')
    assert.ok(existsSync(fixture.paths.plan))
    assert.ok(existsSync(fixture.paths.story))
    assert.ok(existsSync(fixture.paths.activeRun))
    assert.equal(JSON.parse(readFileSync(fixture.paths.activeRun, 'utf8')).status, 'IDLE')
    assert.deepEqual(fixture.gitStatus(), [])
  } finally {
    fixture.cleanup()
  }
})

test('creates a linked worktree with a distinct canonical root and an IDLE pointer', () => {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'review', worktree: 'linked' })
  try {
    assert.notEqual(fixture.root, fixture.canonicalRoot)
    assert.equal(fixture.schemaVersion, 2)
    assert.equal(fixture.state, 'review')
    assert.equal(fixture.canonicalPointer.status, 'IDLE')
    assert.equal(fixture.localPointer.status, 'IDLE')
    assert.equal(fixture.nextAction.kind, 'complete_story')
    assert.equal(fixture.humanApproval, null)
    assert.ok(fixture.gitStatus().every(item => !item.includes('Story-9-1-live')))
  } finally {
    fixture.cleanup()
  }
})

test('fixture states preserve the one-action boundary and explicit Human Gate', () => {
  const expected = new Map([
    ['pending', 'implement_slice'],
    ['checkpointed', 'verify_slice'],
    ['review', 'complete_story'],
    ['done', null],
  ])

  for (const [state, action] of expected) {
    const fixture = createV4Fixture({ schemaVersion: 2, state })
    try {
      assert.equal(fixture.nextAction?.kind ?? null, action)
      assert.equal(fixture.state, state)
      if (state !== 'done') assert.equal(fixture.humanApproval, null)
    } finally {
      fixture.cleanup()
    }
  }
})

test('baseline guards expose stale source, wrong slice, and staged-scope drift', () => {
  const staleSource = createV4Fixture({ schemaVersion: 1, state: 'pending' })
  try {
    writeFileSync(staleSource.paths.epic, `${readFileSync(staleSource.paths.epic, 'utf8')}\nchanged\n`)
    const result = validateStoryPlan(staleSource.root, staleSource.storyId)
    assert.equal(result.status, 'STALE')
    assert.ok(result.reasons.includes('SOURCE_DIGEST_MISMATCH'))
  } finally {
    staleSource.cleanup()
  }

  const wrongSlice = createV4Fixture({ schemaVersion: 1, state: 'pending' })
  try {
    const plan = readFileSync(wrongSlice.paths.plan, 'utf8').replace('current_slice: A', 'current_slice: Z')
    writeFileSync(wrongSlice.paths.plan, plan)
    const result = validateStoryPlan(wrongSlice.root, wrongSlice.storyId)
    assert.equal(result.status, 'INVALID')
    assert.ok(result.reasons.includes('INVALID_CURRENT_SLICE'))
  } finally {
    wrongSlice.cleanup()
  }

  const staged = createV4Fixture({ schemaVersion: 1, state: 'pending' })
  try {
    writeFileSync(staged.paths.source, 'staged drift\n')
    staged.git(['add', '--', 'src/fixture.txt'])
    assert.deepEqual(staged.gitStatus(), ['M  src/fixture.txt'])
  } finally {
    staged.cleanup()
  }
})

test('corpus scenarios are stable and separated by risk and coverage class', async () => {
  const corpus = await import('./fixtures/v4-architecture/corpus.json', { with: { type: 'json' } })
  const cases = corpus.default.cases
  assert.deepEqual(cases.map(item => item.case_id), [
    'L-mapped-low',
    'M-mixed-medium',
    'H-stale-recovery',
  ])
  assert.deepEqual(cases.map(item => item.risk), ['LOW', 'MEDIUM', 'HIGH'])
  assert.deepEqual(cases.map(item => item.expected), [
    'PASS_NO_REVIEW',
    'INCOMPLETE_REVIEW_REQUIRED',
    'STALE_RECOVERY_REQUIRED',
  ])
})

test('baseline bundles keep usage unknown and preserve source/instruction provenance', () => {
  const bundle = buildComparisonBundle({
    variant: 'baseline',
    sourceHead: 'a'.repeat(40),
    architectureFingerprint: `sha256:${'b'.repeat(64)}`,
    corpusDigest: `sha256:${'c'.repeat(64)}`,
    toolchain: { node: 'v24.21.0', git: '2.49.0' },
    sourcePaths: ['AGENTS.md', '.agents/routing/task-router.md'],
    sourceBindings: [{ path: 'AGENTS.md', digest: `sha256:${'d'.repeat(64)}`, bytes: 42 }],
    cases: [{
      case_id: 'L-mapped-low',
      workload_class: 'L',
      check_results: [{ id: 'control-plane-suite', status: 'PASS', tests: 340 }],
      instruction_bytes: { implement_slice: 1200, verify_slice: 1300 },
    }],
  })

  assert.equal(bundle.schema_version, 1)
  assert.equal(bundle.variant, 'baseline')
  assert.equal(bundle.observed_usage, null)
  assert.deepEqual(bundle.source_paths, ['.agents/routing/task-router.md', 'AGENTS.md'])
  assert.deepEqual(bundle.source_bindings, [{ path: 'AGENTS.md', digest: `sha256:${'d'.repeat(64)}`, bytes: 42 }])
  assert.deepEqual(bundle.cases[0].observed_usage, null)
  assert.deepEqual(bundle.cases[0].instruction_bytes, { implement_slice: 1200, verify_slice: 1300 })
  assert.equal(bundle.cases[0].coverage, 'DETERMINISTIC')
  assert.deepEqual(bundle.cases[0].exclusions, ['provider_usage_unavailable'])
})
