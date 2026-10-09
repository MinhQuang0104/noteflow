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
  const codexGit = [...reference.matchAll(/prefix_rule\(pattern=\["git", ([^\]]*)\]/g)].map(match => match[1])
  assert.ok(codexGit.length > 0)
  for (const tail of codexGit) {
    assert.match(tail, /^"(status|diff|log|show|rev-parse|ls-files|merge-base)"$|^"worktree", "list"$/, tail)
  }
  assert.match(reference, /prefix_rule\(pattern=\["orca", "terminal"\], decision="allow"\)/)
  assert.match(reference, /prefix_rule\(pattern=\["node", "\.agents\/scripts\/story-registry\.mjs"\], decision="allow"\)/)
})

test('a held registry mutation lock is reported, never deleted by a Lead', () => {
  const reference = read('.agents/skills/v4-story-runner/references/autopilot.md')
  assert.match(reference, /`REGISTRY_MUTATION_LOCKED`[\s\S]{0,200}never delete the lock yourself/)
  assert.match(reference, /Only the owner removes it/)
})

test('committed Claude settings equal the documented autopilot allowlist', () => {
  const raw = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
  const documented = JSON.parse(/Claude Code `\.claude\/settings\.json`[\s\S]*?```json\s*([\s\S]*?)```/
    .exec(raw('.agents/skills/v4-story-runner/references/autopilot.md'))[1])
  const settings = JSON.parse(raw('.claude/settings.json'))
  assert.deepEqual(settings, documented)
  for (const entry of settings.permissions.allow) {
    if (entry.startsWith('Bash(git ')) {
      assert.match(entry, /^Bash\(git (status|diff|log|show|rev-parse|ls-files|merge-base|worktree list) \*\)$/, entry)
    }
  }
})
