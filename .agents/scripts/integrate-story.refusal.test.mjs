import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createIntegrationFixture, assertTemporary } from './integration-test-fixture.mjs'
import { createV4Fixture } from './v4-architecture-fixture.mjs'

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

test('foreign canonical repository and a non-main checkout are refused without ref changes', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture(), other = createV4Fixture()
  try {
    assertTemporary(other.root)
    const base = fixture.git('rev-parse', 'HEAD'), otherHead = other.git(['rev-parse', 'HEAD'])
    assert.deepEqual(integrate(fixture.f.root, '9.1', 1, other.root).reasons, ['WRONG_REPOSITORY'])
    assert.equal(other.git(['rev-parse', 'HEAD']), otherHead)
    fixture.git('checkout', '-b', 'owner-branch')
    assert.deepEqual(run(integrate, fixture).reasons, ['CANONICAL_NOT_CLEAN'])
    assert.equal(fixture.git('rev-parse', 'main'), base); cleanScratch(fixture)
  } finally { fixture.cleanup(); other.cleanup() }
})

test('not-done Story and invalid integration checks fail before main or registry changes', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    const planPath = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
    const original = fixture.f.readPlan(), record = readFileSync(fixture.locations.record, 'utf8')
    fixture.f.write(planPath, original.replace('lifecycle_snapshot: done', 'lifecycle_snapshot: review'))
    assert.deepEqual(run(integrate, fixture).reasons, ['STORY_NOT_DONE'])
    fixture.f.write(planPath, original)
    fixture.write('.agents/config/integration-checks.json', '{"schema":"integration-checks-v1","checks":[]}')
    fixture.git('add', '.agents/config/integration-checks.json'); fixture.git('commit', '-qm', 'invalid check config')
    const base = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.deepEqual(result.reasons, ['INTEGRATION_CHECKS_INVALID'])
    assert.equal(fixture.git('rev-parse', 'HEAD'), base)
    assert.equal(readFileSync(fixture.locations.record, 'utf8'), record); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})
