import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8').replace(/\s+/g, ' ')

test('authority keeps the one-successor rule outside autopilot', () => {
  // P3 once replaced this sentence instead of qualifying it, leaving AGENTS.md
  // silent about successor execution when no autopilot authorization exists.
  const agents = read('AGENTS.md')
  assert.match(agents, /without that authorization, one invocation may persist one successor but never execute it/)
  assert.match(agents, /`complete_story`, owner review and Human Gate stay manual/)
  const router = read('.agents/routing/task-router.md')
  assert.match(router, /must stop before executing it unless `autopilot-status` returns `CONTINUE`/)
})

test('autopilot allowlist keeps git read-only', () => {
  const reference = read('.agents/skills/v4-story-runner/references/autopilot.md')
  assert.doesNotMatch(reference, /"Bash\(git \*\)"/)
  for (const command of ['push', 'reset', 'clean', 'stash', 'commit']) {
    assert.doesNotMatch(reference, new RegExp(`"Bash\\(git ${command}`), command)
  }
  assert.match(reference, /"Bash\(orca terminal \*\)"/)
})
