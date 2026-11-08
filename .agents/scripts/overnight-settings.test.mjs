import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
const settings = JSON.parse(read('.agents/config/overnight-settings.json'))
const { allow, deny } = settings.permissions

test('overnight child settings allow only listed kernel scripts and no broad runners', () => {
  assert.deepEqual(Object.keys(settings), ['permissions'])
  assert.equal(new Set(allow).size, allow.length)
  assert.equal(new Set(deny).size, deny.length)
  for (const broad of ['Bash(node .agents/scripts/*)', 'Bash(node --test *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(git *)', 'Bash(*)']) {
    assert.equal(allow.includes(broad), false, broad)
  }
  for (const rule of allow) {
    const script = /^Bash\(node (\.agents\/scripts\/[a-z0-9-]+\.mjs) /.exec(rule)?.[1]
    if (script) assert.equal(existsSync(`${repo}${script}`), true, script)
  }
  assert.equal(allow.some(rule => /story-registry\.mjs (claim|release)/.test(rule)), false)
})

test('overnight child settings deny every owner operation, history rewrite, eval and secret read', () => {
  const runnerUsage = /const CLI_USAGE = '([^']+)'/.exec(read('.agents/scripts/v4-story-runner.mjs'))[1]
  for (const ownerFlag of ['--approve-exact-scope', '--authorize-autopilot', '--revoke-autopilot']) {
    assert.match(runnerUsage, new RegExp(ownerFlag))
    assert.ok(deny.includes(`Bash(*${ownerFlag}*)`), ownerFlag)
  }
  for (const rule of [
    'Bash(*record-owner-review*)', 'Bash(*complete_story*)', 'Bash(*complete-story.mjs*)', 'Bash(*--takeover*)',
    'Bash(*integrate-story.mjs*)', 'Bash(*start-story.mjs*)', 'Bash(*story-registry.mjs claim*)', 'Bash(*story-registry.mjs release*)',
    'Bash(*git push*)', 'Bash(*git reset*)', 'Bash(*git update-ref*)', 'Bash(*git checkout*)', 'Bash(*git commit*)',
    'Bash(*node -e*)', 'Bash(*node --eval*)', 'Bash(*-Command*)', 'Bash(*npm install*)',
    'Read(**/.env)', 'Edit(.agents/**)', 'Edit(.claude/**)', 'Edit(AGENTS.md)', 'Edit(_bmad-output/**)',
  ]) assert.ok(deny.includes(rule), rule)
})

test('AGY contract move uses the K7 helper instead of inline node eval', () => {
  const executor = read('.agents/skills/v4-story-runner/references/agy-executor.md')
  assert.match(executor, /node \.agents\/scripts\/move-worker-contract\.mjs move <absolute worktree> <task-id> <n>/)
  assert.doesNotMatch(executor, /node -e/)
  assert.ok(allow.includes('Bash(node .agents/scripts/move-worker-contract.mjs *)'))
})

// M3 pilot 2026-11-08: the first child could not run any backend check.
test('overnight child settings allow the spelled check commands and docker exec only into test containers', () => {
  for (const rule of [
    'Bash(powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 test)',
    'Bash(powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 e2e)',
    'Bash(MSYS_NO_PATHCONV=1 docker exec -w /workspace/backend noteflow-test-* php artisan test *)',
    'Bash(npm --prefix frontend run *)',
  ]) assert.ok(allow.includes(rule), rule)
  for (const rule of allow.filter(item => item.includes('docker exec'))) {
    assert.match(rule, /^Bash\(MSYS_NO_PATHCONV=1 docker exec -w \/workspace\/backend noteflow-test-\* (php artisan test|vendor\/bin\/pint|composer analyse)/, rule)
  }
  assert.equal(allow.some(rule => /^Bash\((MSYS_NO_PATHCONV=1 )?docker (exec|run) \*/.test(rule)), false)
})
