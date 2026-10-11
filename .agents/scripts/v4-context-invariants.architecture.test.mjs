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
