import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  authorizeCommand, baselineViolations, captureBaseline, childResult, coveredPaths, humanEvidence,
  prepare, run, runStory, uncoveredSlicePaths, validateQueue,
} from './v4-overnight.mjs'

const OWNER_OPERATIONS = /--approve-exact-scope|record-owner-review|--authorize-autopilot|--revoke-autopilot|complete_story|complete-story|integrate-story|--takeover|\bpush\b/

function planText(extra = '') {
  return `---\nschema_version: 2\nstory_id: "9.1"\nslices:\n  - id: A\n    status: pending\n    scope:\n      paths: [backend/app/Feature.php]\n${extra}---\n# Plan\n`
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'overnight-'))
  const worktree = path.join(root, 'wt')
  const write = (base, relative, text) => {
    mkdirSync(path.dirname(path.join(base, relative)), { recursive: true })
    writeFileSync(path.join(base, relative), text)
  }
  write(root, '.agent-state/active-run.json', '{"status":"IDLE"}')
  write(root, '.agents/config/overnight-settings.json', '{"permissions":{"allow":[],"deny":[]}}')
  write(root, '.git/config', '[core]\n')
  write(root, '.git/hooks/pre-commit.sample', '#!/bin/sh\n')
  write(root, '.agents/verification/registry.json', JSON.stringify({ schema_version: 1, recipes: [{ featureId: 'f', path: '.agents/verification/f.json', enabled: true }] }))
  write(root, '.agents/verification/f.json', JSON.stringify({ featureId: 'f', featureMap: '.agents/features/f.json', checks: [{ id: 'map', argv: ['x'] }] }))
  write(root, '.agents/features/f.json', JSON.stringify({ schema_version: 2, id: 'f', covered_paths: ['backend/app/Feature.php'], anchor_blobs: { 'backend/app/Feature.php': 'a'.repeat(40) } }))
  write(root, '_bmad-output/implementation-artifacts/story-9-1-plan.md', planText())
  write(worktree, '_bmad-output/implementation-artifacts/story-9-1-plan.md', planText())
  return { root, worktree, write, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function fakeContext(f, script = {}) {
  const calls = []
  const state = { main: 'm'.repeat(40), heads: [...(script.heads ?? ['1'.repeat(40)])], statuses: [...(script.statuses ?? [])], children: [...(script.children ?? [])] }
  let head = state.heads[0]
  const exec = (command, args, options = {}) => {
    calls.push({ command, args, cwd: options.cwd, input: options.input })
    if (command === 'git') {
      const joined = args.filter(arg => arg !== '--no-optional-locks').join(' ')
      if (joined === 'rev-parse --git-common-dir') return ok(path.join(f.root, '.git'))
      if (joined === 'rev-parse refs/heads/main') return ok(state.main)
      if (joined === 'rev-parse HEAD') return ok(head)
      if (joined === 'status --porcelain') return ok('')
      if (joined === 'branch --show-current') return ok('main')
      if (joined === 'worktree list --porcelain') return ok(script.worktrees ?? `worktree ${f.root}\nbranch refs/heads/main\n`)
      return { status: 1, stdout: '', stderr: 'unexpected git', error: null }
    }
    if (command === 'docker') return ok(script.docker === false ? '' : '27.0', script.docker === false ? 1 : 0)
    if (command === 'claude') {
      const child = state.children.shift() ?? { status: 'DONE' }
      child.effect?.(state)
      if (state.heads.length > 1) { state.heads.shift(); head = state.heads[0] }
      return ok(JSON.stringify({ result: `did work\nOVERNIGHT_RESULT ${child.status} ${child.reason ?? 'ok'}`, permission_denials: [] }))
    }
    if (command === process.execPath) {
      const [scriptPath, ...rest] = args
      const name = path.basename(scriptPath)
      if (name === 'v4-story-runner.mjs' && rest[0] === 'autopilot-status') return ok(JSON.stringify(state.statuses.shift() ?? { status: 'STOP', reasons: ['HUMAN_GATE'], next_action: { kind: 'complete_story' } }))
      if (name === 'story-registry.mjs' && rest[0] === 'status') return ok(JSON.stringify({ status: 'READY', records: [{ storyId: '9.1', generation: 1, lead: { sessionId: 's' }, worktree: f.worktree }] }))
      if (name === 'story-registry.mjs' && rest[0] === 'heartbeat') return ok('{"status":"APPLIED"}')
      return ok('{"status":"ERROR","reasons":["UNEXPECTED_SCRIPT"]}')
    }
    return { status: 1, stdout: '', stderr: `unexpected ${command}`, error: null }
  }
  const story = { id: '9.1', worktree: f.worktree, generation: 1, session: 's', checks: script.checks ?? [] }
  const ctx = {
    root: f.root, exec, now: () => new Date('2026-11-09T00:00:00Z'), claude: 'claude', orca: 'orca', npm: ['npm'],
    deadline: script.deadline ?? new Date('2026-11-09T07:00:00Z'), maxActions: 10, childTimeoutMs: 1000, stories: [story],
  }
  return { ctx, calls, state, story }
}

function ok(stdout, status = 0) {
  return { status, stdout: `${stdout}\n`, stderr: '', error: null }
}

const cont = (kind, slice = 'A') => ({ status: 'CONTINUE', next_action: { kind, slice_id: slice }, reasons: [] })

test('overnight queue validation rejects malformed, duplicate and unknown-key entries', () => {
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2.4', budgets: { max_rework_per_slice: 2 }, checks: ['npm run type-check'] }] }), [])
  assert.deepEqual(validateQueue({ schemaVersion: 2, stories: [] }), ['QUEUE_INVALID'])
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2-4' }] }), ['QUEUE_ENTRY_INVALID:2-4'])
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2.4' }, { id: '2.4' }] }), ['QUEUE_DUPLICATE:2.4'])
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2.4', planDigest: 'x' }] }), ['QUEUE_ENTRY_INVALID:2.4'])
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2.4', budgets: { minutes: 9 } }] }), ['QUEUE_BUDGETS_INVALID:2.4'])
  assert.deepEqual(validateQueue({ schemaVersion: 1, stories: [{ id: '2.4', checks: [''] }] }), ['QUEUE_CHECKS_INVALID:2.4'])
})

test('overnight prepare refuses a Story whose slice scope is not covered by a recipe without creating a worktree', () => {
  const f = fixture()
  try {
    assert.deepEqual(uncoveredSlicePaths({ slices: [{ id: 'A', scope: { paths: ['backend/app/Feature.php'] } }] }, coveredPaths(f.root)), [])
    f.write(f.root, '_bmad-output/implementation-artifacts/story-9-1-plan.md', planText().replace('[backend/app/Feature.php]', '[backend/app/Feature.php, backend/app/Other.php]'))
    f.write(f.root, '.agent-state/overnight/queue.json', JSON.stringify({ schemaVersion: 1, stories: [{ id: '9.1' }, { id: '9.2' }] }))
    const { ctx, calls } = fakeContext(f)
    const result = prepare(ctx, path.join(f.root, '.agent-state/overnight/queue.json'))
    assert.equal(result.status, 'READY')
    assert.deepEqual(result.stories.map(story => [story.id, story.status, story.reasons]), [
      ['9.1', 'REFUSED', ['RECIPE_COVERAGE_MISSING']], ['9.2', 'REFUSED', ['PLAN_MISSING']]])
    assert.deepEqual(result.stories[0].uncovered, ['A:backend/app/Other.php'])
    assert.equal(calls.some(call => call.command === 'orca'), false)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, '.agent-state/overnight/state.json'), 'utf8')).stories, [])
    const earlier = { id: '8.1', worktree: f.worktree, generation: 3, session: 'old' }
    f.write(f.root, '.agent-state/overnight/state.json', JSON.stringify({ schemaVersion: 1, stories: [earlier] }))
    f.write(f.root, '.agent-state/overnight/queue.json', JSON.stringify({ schemaVersion: 1, stories: [{ id: '8.1' }, { id: '9.2' }] }))
    const again = prepare(ctx, path.join(f.root, '.agent-state/overnight/queue.json'))
    assert.deepEqual(again.stories.map(story => story.status), ['ALREADY_PREPARED', 'REFUSED'])
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, '.agent-state/overnight/state.json'), 'utf8')).stories, [earlier])
  } finally { f.cleanup() }
})

test('overnight authorize command is printed for the owner with the Runner authorization shape', () => {
  const command = authorizeCommand('2.4', 'a'.repeat(40), { max_rework_per_slice: 2 })
  assert.match(command, /^node \.agents\/scripts\/v4-story-runner\.mjs run 2\.4 --expected-head a{40} --authorize-autopilot '/)
  assert.deepEqual(JSON.parse(/'(.+)'$/.exec(command)[1]), { action: 'authorize_autopilot', story_id: '2.4', budgets: { max_rework_per_slice: 2 }, lead_vendor: 'claude' })
})

test('overnight child result parsing takes the last result line and defaults to unknown', () => {
  assert.deepEqual(childResult('x\nOVERNIGHT_RESULT DONE first\nmore\nOVERNIGHT_RESULT HUMAN_REVIEW_REQUIRED same lead review'), { status: 'HUMAN_REVIEW_REQUIRED', reason: 'same lead review' })
  assert.deepEqual(childResult('no marker'), { status: 'UNKNOWN', reason: 'no result line' })
})

test('overnight human evidence changes only when human, approval or autopilot records change', () => {
  const f = fixture()
  try {
    const file = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
    const before = humanEvidence(f.worktree, '9.1')
    f.write(f.worktree, file, planText().replace('status: pending', 'status: checkpointed'))
    assert.equal(humanEvidence(f.worktree, '9.1'), before)
    f.write(f.worktree, file, planText('human_approval:\n  decision: APPROVED\n'))
    assert.notEqual(humanEvidence(f.worktree, '9.1'), before)
    f.write(f.worktree, file, planText())
    f.write(f.worktree, '_bmad-output/implementation-artifacts/receipts/story-9-1/A-review.json', '{"reviewer":{"type":"human"}}')
    assert.notEqual(humanEvidence(f.worktree, '9.1'), before)
  } finally { f.cleanup() }
})

test('overnight baseline flags main moves, forged human evidence, git hooks and Story settings changes', () => {
  const f = fixture()
  try {
    const { ctx, state, story } = fakeContext(f)
    const before = captureBaseline(ctx, [story])
    assert.deepEqual(baselineViolations(before, captureBaseline(ctx, [story])), [])
    state.main = 'n'.repeat(40)
    f.write(f.root, '.git/hooks/post-commit', '#!/bin/sh\nevil\n')
    f.write(f.worktree, '_bmad-output/implementation-artifacts/story-9-1-plan.md', planText('human_approval:\n  decision: APPROVED\n'))
    f.write(f.worktree, '.claude/settings.local.json', '{"permissions":{"allow":["Bash(*)"]}}')
    assert.deepEqual(baselineViolations(before, captureBaseline(ctx, [story])), ['MAIN', 'GIT_HOOKS', 'HUMAN_EVIDENCE:9.1', 'STORY_SETTINGS:9.1'])
  } finally { f.cleanup() }
})

test('overnight story loop runs one restricted child per CONTINUE and stops at the reported human stop', () => {
  const f = fixture()
  try {
    const { ctx, calls, story } = fakeContext(f, {
      heads: ['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)],
      statuses: [cont('implement_slice'), cont('verify_slice')],
      children: [{ status: 'DONE' }, { status: 'HUMAN_REVIEW_REQUIRED', reason: 'SAME_LEAD_REVIEW' }],
      checks: ['npm run type-check'],
    })
    const baseline = captureBaseline(ctx, [story])
    const log = runStory(ctx, story, mkdtempSync(path.join(f.root, 'run-')), baseline, { value: 0 })
    assert.deepEqual(log.stop, { kind: 'HUMAN_STOP', reasons: ['HUMAN_REVIEW_REQUIRED'], detail: 'SAME_LEAD_REVIEW', next_action: { kind: 'verify_slice', slice_id: 'A' } })
    assert.deepEqual(log.actions.map(action => [action.kind, action.status]), [['implement_slice', 'DONE'], ['verify_slice', 'HUMAN_REVIEW_REQUIRED']])
    const children = calls.filter(call => call.command === 'claude')
    assert.equal(children.length, 2)
    for (const child of children) {
      assert.deepEqual(child.args.slice(0, 4), ['-p', '--restricted', '--tools', 'Bash,Read,Edit,Write,Glob,Grep'])
      assert.equal(child.args[child.args.indexOf('--settings') + 1], path.join(f.root, '.agents/config/overnight-settings.json'))
      assert.ok(child.args.includes('--permission-prompts') && child.args.includes('none') && child.args.includes('--strict-mcp-config'))
      assert.deepEqual(child.args.slice(child.args.indexOf('--allowedTools') + 1), ['Bash(npm run type-check)'])
      assert.equal(child.cwd, f.worktree)
      assert.match(child.input, /--lead-generation 1/)
    }
    const heartbeats = calls.filter(call => call.args[0]?.endsWith('story-registry.mjs') && call.args[1] === 'heartbeat').map(call => call.args.at(-1))
    assert.deepEqual(heartbeats, ['IMPLEMENTING', 'REVIEWING', 'WAITING_HUMAN'])
    assert.equal(calls.some(call => OWNER_OPERATIONS.test(call.args.join(' '))), false)
  } finally { f.cleanup() }
})

test('overnight story loop stops on kernel STOP, no progress, deadline and baseline violation', () => {
  const f = fixture()
  try {
    let { ctx, story } = fakeContext(f, { statuses: [{ status: 'STOP', reasons: ['HUMAN_GATE'], next_action: { kind: 'complete_story' } }] })
    let baseline = captureBaseline(ctx, [story])
    assert.equal(runStory(ctx, story, f.root, baseline, { value: 0 }).stop.kind, 'HUMAN_STOP')

    ;({ ctx, story } = fakeContext(f, { statuses: [cont('implement_slice'), cont('implement_slice')] }))
    assert.deepEqual(runStory(ctx, story, f.root, captureBaseline(ctx, [story]), { value: 0 }).stop.reasons, ['NO_PROGRESS'])

    ;({ ctx, story } = fakeContext(f, { statuses: [cont('implement_slice')], deadline: new Date('2026-11-08T00:00:00Z') }))
    assert.deepEqual(runStory(ctx, story, f.root, captureBaseline(ctx, [story]), { value: 0 }).stop, { kind: 'DEADLINE', reasons: ['DEADLINE_REACHED'] })

    ;({ ctx, story } = fakeContext(f, { heads: ['1'.repeat(40), '2'.repeat(40)], statuses: [cont('implement_slice'), cont('verify_slice')],
      children: [{ status: 'DONE', effect: state => { state.main = 'x'.repeat(40) } }] }))
    baseline = captureBaseline(ctx, [story])
    assert.deepEqual(runStory(ctx, story, f.root, baseline, { value: 0 }).stop, { kind: 'RUN_STOP', reasons: ['MAIN'] })
  } finally { f.cleanup() }
})

test('overnight run writes a report and spawns nothing when preflight fails or nothing is prepared', () => {
  const f = fixture()
  try {
    let { ctx, calls } = fakeContext(f)
    let result = run(ctx)
    assert.equal(result.status, 'RUN_STOPPED')
    assert.match(readFileSync(result.report, 'utf8'), /NOT_PREPARED/)
    f.write(f.root, '.agent-state/overnight/state.json', JSON.stringify({ schemaVersion: 1, stories: [{ id: '9.1', worktree: f.worktree, generation: 1, session: 's' }] }))
    ;({ ctx, calls } = fakeContext(f, { docker: false }))
    result = run(ctx)
    assert.equal(result.status, 'RUN_STOPPED')
    assert.match(readFileSync(result.report, 'utf8'), /DOCKER_UNAVAILABLE/)
    assert.equal(calls.some(call => call.command === 'claude'), false)
    ;({ ctx, calls } = fakeContext(f, { statuses: [{ status: 'STOP', reasons: ['HUMAN_GATE'], next_action: { kind: 'complete_story' } }] }))
    result = run(ctx)
    assert.equal(result.status, 'DONE')
    const report = readFileSync(result.report, 'utf8')
    assert.match(report, /### Story 9\.1: HUMAN_STOP/)
    assert.match(report, /Next action: complete_story/)
    assert.ok(existsSync(result.report.replace('report.md', 'report.json')))
    f.write(f.root, '.agent-state/overnight/state.json', JSON.stringify({ schemaVersion: 1, stories: [
      { id: '9.1', worktree: f.worktree, generation: 1, session: 's' }, { id: '7.7', worktree: f.worktree, generation: 2, session: 'x' }] }))
    ;({ ctx, calls } = fakeContext(f))
    result = run(ctx)
    assert.match(readFileSync(result.report, 'utf8'), /### Story 7\.7: RELEASED/)
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, '.agent-state/overnight/state.json'), 'utf8')).stories.map(story => story.id), ['9.1'])
  } finally { f.cleanup() }
})
