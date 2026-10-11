import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { compileActionContext } from './compile-v4-context.mjs'

const read = relative => readFileSync(relative, 'utf8')

test('AGY transport is available without selecting the historical V3 lane', () => {
  const reference = '.agents/skills/v4-story-runner/references/agy-transport.md'
  assert.ok(existsSync(reference), 'The V4 AGY transport reference must exist')
  const transport = read(reference).replace(/\s+/g, ' ')
  assert.match(read('.agents/skills/v4-story-runner/references/agy-executor.md'), /references\/agy-transport\.md/)
  assert.match(read('.agents/policies/orchestration-v3.md'), /\]\(\.\.\/skills\/v4-story-runner\/references\/agy-transport\.md\)/)
  for (const invariant of [
    /orca terminal create --worktree/,
    /orca terminal wait --for tui-idle/,
    /--return-preamble.*without `--inject`/,
    /Never resend blindly/,
    /worker_done,escalation,question/,
    /--dangerously-skip-permissions/,
    /only `orca orchestration ask`/,
    /three consecutive empty waits or 15 minutes/,
    /Screen output is diagnosis, never completion/,
    /HISTORY_REWRITTEN.*CONTRACT_MODIFIED/,
    /`INVALID`\/`ERROR` are never `PASS`/,
    /Correction contracts carry only VALID findings/,
    /At most three correction attempts per Task/,
    /never approves, merges, integrates or marks a Story done/,
  ]) assert.match(transport, invariant)
})

test('Story routing uses explicit V4 actions and preserves the historical owner stop', () => {
  const agents = read('AGENTS.md').replace(/\s+/g, ' ')
  const router = read('.agents/routing/task-router.md').replace(/\s+/g, ' ')
  const runner = read('.agents/skills/v4-story-runner/SKILL.md').replace(/\s+/g, ' ')
  assert.match(agents, /An explicit Story request uses the V4 Runner and exactly one action/)
  assert.doesNotMatch(agents, /Explicit V3\.1\/Orca requests|Story requests without V4 opt-in/)
  assert.match(agents, /A historical V3 run with a non-`IDLE` pointer stops for the owner/)
  assert.match(agents, /automatic V3 fallback stay disabled/)
  assert.match(agents, /`HUMAN_GATE` approval for exact scope/)
  assert.doesNotMatch(agents, /V3 `HUMAN_GATE`/)
  assert.match(agents, /compare `AGENTS\.md`, `task-router\.md`, and `v4-story-runner` with canonical main/)
  assert.match(agents, /compare against its pinned `controlPlaneCommit` instead/)
  assert.match(router, /explicit Story request uses V4 Runner plus one validated action/)
  assert.doesNotMatch(router, /Product\/Story work without V4 opt-in remains on V3/)
  assert.match(runner, /Enter only for an explicit Story request/)
  assert.match(runner, /Stop for the owner on unresolved authority.*exceeded V4 capability/)
  assert.doesNotMatch(runner, /explicit V4 request|Story by V4 Lite|V3\.1 may be recommended/)
  assert.match(read('CLAUDE.md'), /Explicit Story requests use V4 Runner \+ one action/)
  assert.match(agents, /An explicitly authorized schema-v2 Story uses `start-story\.md`/)
  assert.doesNotMatch(agents, /by V4 Lite/)
  const startStory = read('.agents/skills/v4-story-runner/actions/start-story.md').replace(/\s+/g, ' ')
  assert.match(startStory, /explicit human request to start a named schema-v2 Story\. /)
  assert.doesNotMatch(startStory, /Story by V4 Lite/)
  const help = read('.agents/skills/bmad/references/help.md').replace(/\s+/g, ' ')
  assert.doesNotMatch(help, /V3 execution/)
  assert.match(help, /For freeform work, follow root `AGENTS\.md`; `bmad-build` remains explicit-only/)
})

function seedInstructionSources(fixture) {
  const paths = [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/routing/task-router.md',
    '.agents/context/context-routing.md',
    '.agents/context/control-plane.md',
    '.agents/skills/v4-story-runner/SKILL.md',
    '.agents/docs/v4-artifact-contract.md',
    '.agents/skills/v4-story-runner/actions/implement-slice.md',
    '.agents/skills/v4-story-runner/references/implementation-techniques.md',
    '.agents/skills/v4-story-runner/references/agy-executor.md',
    '.agents/skills/v4-story-runner/references/recovery.md',
    '.agents/skills/v4-story-runner/references/autopilot.md',
  ]
  for (const relative of paths) {
    const file = path.join(fixture.root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `fixture instruction: ${relative}\n`)
  }
}

test('normal-action context keeps the compact routing and invariant contract', () => {
  const router = read('.agents/routing/task-router.md')
  const required = [...router.matchAll(/^- ([a-z_]+):/gim)].map(match => match[1])
  assert.deepEqual(required, [
    'authority',
    'runtime',
    'entry',
    'selection',
    'evidence',
    'successor',
    'stop',
  ])
  assert.match(router, /active|ambiguous|contradicted/i)
  assert.match(router, /Human Gate/i)
  assert.match(router, /recovery/i)

  const runner = read('.agents/skills/v4-story-runner/SKILL.md')
  for (const invariant of [
    /one durable (?:Story )?action/i,
    /exact scope/i,
    /RECOVERY_REQUIRED/i,
    /automatic[\s\S]{0,160}review[\s\S]{0,160}done[\s\S]{0,160}disabled/i,
    /never execute (?:the )?(?:successor|it)/i,
  ]) assert.match(runner, invariant)

  const implement = read('.agents/skills/v4-story-runner/actions/implement-slice.md')
  assert.match(implement, /two-commit/i)
  assert.match(implement, /exact (?:implementation )?path/i)
  assert.match(implement, /RECOVERY_REQUIRED/)
  assert.match(implement, /verify_slice/)

  const verify = read('.agents/skills/v4-story-runner/actions/verify-slice.md')
  assert.match(verify, /PASS[\s\S]{0,260}FAIL[\s\S]{0,260}INCOMPLETE[\s\S]{0,260}ERROR/)
  assert.match(verify, /REVIEW_REQUIRED/)
  assert.match(verify, /RECOVERY_REQUIRED/)
  assert.match(verify, /Human Gate/i)
})

test('projection preserves selected requirements and fail-closed freshness after context compaction', () => {
  const fixture = createV4Fixture({ schemaVersion: 2, state: 'pending' })
  try {
    seedInstructionSources(fixture)
    const expectedHead = fixture.git(['rev-parse', 'HEAD'])
    const ready = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', { expectedHead })
    assert.equal(ready.status, 'READY', JSON.stringify(ready))
    assert.deepEqual(ready.projection.requirements.tasks.map(item => item.id), ['T-1'])
    assert.deepEqual(ready.projection.requirements.acceptance_criteria.map(item => item.id), ['AC-1'])
    assert.match(ready.projection.requirements.story_risk.raw, /Human Gate authority/)
    assert.ok(ready.projection.stop_conditions.length >= 2)

    const staleStory = read(fixture.paths.story).replace('synthetic reader', 'stale reader')
    writeFileSync(fixture.paths.story, staleStory)
    const stale = compileActionContext(fixture.root, fixture.storyId, 'implement_slice', 'A', { expectedHead })
    assert.equal(stale.status, 'STALE')
    assert.equal(stale.projection, null)
    assert.ok(stale.reasons.includes('STORY_NORMATIVE_DIGEST_MISMATCH'))
  } finally {
    fixture.cleanup()
  }
})
