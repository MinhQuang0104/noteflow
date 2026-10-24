import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createCompletionFixture } from './completion-fixture.mjs'
import { claimStory } from './story-registry.mjs'

export const RUNNER = fileURLToPath(new URL('./v4-story-runner.mjs', import.meta.url))

export function runCli(root, args) {
  if (args[0] === 'autopilot-status' && !args.includes('--lead-generation')) args = [...args, '--lead-generation', '1']
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  })
}

export const PLAN = '_bmad-output/implementation-artifacts/story-9-1-plan.md'

export const autopilotInput = (budgets = { max_slices: 2, max_rework_per_slice: 1, max_minutes_per_slice: 30 }) =>
  ({ action: 'authorize_autopilot', story_id: '9.1', budgets, lead_vendor: 'codex' })

export function prepareFinalizeAutopilotFixture() {
  const f = createCompletionFixture()
  f.write(PLAN, f.readPlan().replace('kind: "complete_story"', 'kind: "finalize_story"'))
  f.git('add', PLAN)
  f.git('commit', '-qm', 'prepare autopilot status fixture')
  f.refreshHead()
  assert.equal(claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'fixture' }).status, 'APPLIED')
  return f
}
