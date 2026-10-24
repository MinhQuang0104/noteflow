import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIntegrationFixture, assertTemporary } from './integration-test-fixture.mjs'
import { inspectCompletion } from './check-story-completion.mjs'

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

test('clean CLI integration fast-forwards to the tested merge and preserves approval', async () => {
  await implementation()
  const fixture = createIntegrationFixture()
  try {
    assertTemporary(fixture.f.root); assertTemporary(fixture.canonical)
    const branchHead = fixture.f.head, base = fixture.git('rev-parse', 'HEAD')
    const child = spawnSync(process.execPath, [fileURLToPath(URL), 'integrate', '9.1', '--generation', '1', '--canonical', fixture.canonical],
      { cwd: fixture.f.root, encoding: 'utf8', windowsHide: true })
    assert.ok(child.stdout.trim(), child.stderr)
    const result = JSON.parse(child.stdout)
    assert.equal(child.status, 0, child.stdout)
    assert.equal(result.status, 'APPLIED', child.stdout)
    assert.equal(fixture.git('rev-parse', 'HEAD'), result.mergeCommit)
    assert.equal(fixture.git('show', '-s', '--format=%s', 'HEAD'), 'merge(story-9.1): integrate')
    assert.deepEqual(fixture.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').slice(1), [base, branchHead])
    assert.equal(fixture.f.git('rev-parse', 'HEAD'), branchHead)
    assert.equal(inspectCompletion(fixture.canonical, '9.1', result.mergeCommit).status, 'READY')
    assert.equal(existsSync(fixture.locations.record), false)
    cleanScratch(fixture)
  } finally { fixture.cleanup() }
})
