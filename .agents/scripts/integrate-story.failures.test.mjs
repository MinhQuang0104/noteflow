import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createIntegrationFixture, assertTemporary } from './integration-test-fixture.mjs'

const URL = new globalThis.URL('./integrate-story.mjs', import.meta.url)
async function implementation() {
  const module = await import(URL).catch(() => ({}))
  assert.equal(typeof module.integrateStory, 'function', 'integration command must exist')
  return module.integrateStory
}
function run(integrate, fixture, generation = 1) {
  assertTemporary(fixture.f.root); assertTemporary(fixture.canonical)
  return integrate(fixture.f.root, '9.1', generation, fixture.canonical)
}
function cleanScratch(fixture) {
  assert.equal(fixture.f.git('worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).length, 2)
  assert.equal(existsSync(path.join(fixture.locations.directory, 'integration.lock')), false)
}

test('merge conflicts report paths and preserve main and claim', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    fixture.write('src/implementation.txt', 'conflicting main implementation\n')
    fixture.git('add', 'src/implementation.txt'); fixture.git('commit', '-qm', 'main conflict')
    const base = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['MERGE_CONFLICT'])
    assert.deepEqual(result.paths, ['src/implementation.txt'])
    assert.equal(fixture.git('rev-parse', 'HEAD'), base)
    assert.ok(existsSync(fixture.locations.record)); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})

test('failing integration check retains logs and leaves main unchanged', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    fixture.setChecks([{ id: 'failure', argv: [process.execPath, '-e', "console.log('fixture failure');process.exit(17)"] }])
    const base = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['INTEGRATION_CHECK_FAILED'])
    assert.match(readFileSync(result.logs[0].path, 'utf8'), /fixture failure/)
    assert.equal(result.logs[0].exitCode, 17)
    assert.equal(fixture.git('rev-parse', 'HEAD'), base); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})
