import { runCli, autopilotInput, prepareFinalizeAutopilotFixture, PLAN } from './v4-story-runner-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { frontmatter, validateAutopilot } from './check-story-plan.mjs'

// Story 4.2: the slice time budget ran from the slice's first commit and counted
// the idle hours between nights (532 of 90 minutes); nothing could extend it.
const extension = (extra = {}) => JSON.stringify({ action: 'extend_autopilot', story_id: '9.1', slice_id: 'A', minutes: 45, ...extra })

function authorized() {
  const f = prepareFinalizeAutopilotFixture()
  const recorded = runCli(f.root, ['run', '9.1', '--expected-head', f.head, '--authorize-autopilot', JSON.stringify(autopilotInput())])
  assert.equal(recorded.status, 0, recorded.stdout)
  return f
}

const status = f => JSON.parse(runCli(f.root, ['autopilot-status', '9.1', '--expected-head', f.git('rev-parse', 'HEAD')]).stdout)

test('owner extension opens a fresh time window for the current slice in a Plan-only commit', () => {
  const f = authorized()
  try {
    assert.equal(frontmatter(f.readPlan()).current_slice, 'A')
    const before = f.git('rev-parse', 'HEAD')
    const result = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', before, '--extend-autopilot', extension()]).stdout)
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.equal(f.git('rev-parse', 'HEAD~1'), before)
    assert.equal(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), PLAN)
    assert.equal(f.git('log', '-1', '--format=%s'), 'chore(story-9.1): extend autopilot time for slice A')
    const autopilot = frontmatter(f.readPlan()).autopilot
    assert.equal(autopilot.revoked, false)
    assert.deepEqual(autopilot.time_extensions.map(item => [item.slice_id, item.minutes]), [['A', 45]])
    assert.deepEqual(validateAutopilot(f.root, PLAN, autopilot), [])
    const continued = status(f)
    assert.equal(continued.status, 'CONTINUE', JSON.stringify(continued))
    assert.equal(continued.budgets_remaining.time.max_minutes, 45)
    assert.equal(continued.budgets_remaining.time.extended_at, autopilot.time_extensions[0].granted_at)
    assert.ok(continued.budgets_remaining.time.elapsed_minutes < 5)

    const second = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', f.git('rev-parse', 'HEAD'), '--extend-autopilot', extension({ minutes: 120 })]).stdout)
    assert.equal(second.status, 'APPLIED', JSON.stringify(second))
    assert.deepEqual(frontmatter(f.readPlan()).autopilot.time_extensions.map(item => item.minutes), [45, 120])
    assert.equal(status(f).budgets_remaining.time.max_minutes, 120)
  } finally { f.cleanup() }
})

test('an elapsed extension stops on BUDGET_TIME until the owner grants a new one', () => {
  const f = authorized()
  try {
    const text = f.readPlan().replace(/^  revoked: false$/m,
      '  revoked: false\n  time_extensions:\n    - slice_id: "A"\n      minutes: 5\n      granted_at: "2020-01-01T00:00:00.000Z"')
    f.write(PLAN, text)
    f.git('add', PLAN)
    f.git('commit', '-qm', 'fixture: an old extension')
    const stopped = status(f)
    assert.equal(stopped.status, 'STOP', JSON.stringify(stopped))
    assert.deepEqual(stopped.reasons, ['BUDGET_TIME'])
    const result = JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', f.git('rev-parse', 'HEAD'), '--extend-autopilot', extension()]).stdout)
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.equal(status(f).status, 'CONTINUE')
  } finally { f.cleanup() }
})

test('extension refuses another slice, bad input, a missing or revoked authorization and mixed operations', () => {
  const f = prepareFinalizeAutopilotFixture()
  try {
    const run = (...args) => JSON.parse(runCli(f.root, ['run', '9.1', '--expected-head', f.git('rev-parse', 'HEAD'), ...args]).stdout)
    assert.deepEqual(run('--extend-autopilot', extension()).reasons, ['NO_AUTOPILOT_AUTHORIZATION'])
    assert.equal(run('--authorize-autopilot', JSON.stringify(autopilotInput())).status, 'AUTHORIZED')
    const head = f.git('rev-parse', 'HEAD')
    for (const [value, reason] of [
      [extension({ slice_id: 'B' }), 'AUTOPILOT_EXTENSION_SLICE_NOT_CURRENT'],
      [extension({ minutes: 4 }), 'AUTOPILOT_EXTENSION_INVALID'],
      [extension({ minutes: 241 }), 'AUTOPILOT_EXTENSION_INVALID'],
      [extension({ story_id: '9.2' }), 'AUTOPILOT_EXTENSION_INVALID'],
      [extension({ action: 'authorize_autopilot' }), 'AUTOPILOT_EXTENSION_INVALID'],
      [extension({ budgets: {} }), 'AUTOPILOT_EXTENSION_INVALID']
    ]) assert.deepEqual(run('--extend-autopilot', value).reasons, [reason], value)
    assert.deepEqual(run('--extend-autopilot', extension(), '--revoke-autopilot').reasons?.[0], 'USAGE: run <epic.story> [--expected-head <sha>] [--operation <operation> --input <file>] [--approve-exact-scope] [--authorize-autopilot <json> | --revoke-autopilot | --extend-autopilot <json>]')
    assert.equal(f.git('rev-parse', 'HEAD'), head)
    assert.equal(run('--revoke-autopilot').status, 'APPLIED')
    assert.deepEqual(run('--extend-autopilot', extension()).reasons, ['AUTOPILOT_REVOKED'])
  } finally { f.cleanup() }
})

test('Plan validation rejects malformed time extensions', () => {
  const f = authorized()
  try {
    const autopilot = frontmatter(f.readPlan()).autopilot
    const good = { slice_id: 'A', minutes: 30, granted_at: '2026-11-21T00:00:00.000Z' }
    assert.deepEqual(validateAutopilot(f.root, PLAN, { ...autopilot, time_extensions: [good] }), [])
    for (const bad of [[], [{ ...good, minutes: 300 }], [{ ...good, granted_at: 'yesterday' }], [{ ...good, extra: 1 }], [{ ...good, slice_id: '' }], {}])
      assert.deepEqual(validateAutopilot(f.root, PLAN, { ...autopilot, time_extensions: bad }), ['AUTOPILOT_INVALID'], JSON.stringify(bad))
  } finally { f.cleanup() }
})
