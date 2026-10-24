import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

test('held integration lock is preserved and reports busy', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    const lock = path.join(fixture.locations.directory, 'integration.lock')
    writeFileSync(lock, 'other owner\n')
    const base = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.equal(result.status, 'CONFLICT', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['INTEGRATION_BUSY'])
    assert.equal(readFileSync(lock, 'utf8'), 'other owner\n')
    assert.equal(fixture.git('rev-parse', 'HEAD'), base)
  } finally { fixture.cleanup() }
})

test('checks cannot mutate the scratch tree or supersede the held generation', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    fixture.setChecks([{ id: 'dirty', argv: [process.execPath, '-e', "require('fs').writeFileSync('scratch-dirty.txt','changed')"] }])
    const base = fixture.git('rev-parse', 'HEAD')
    assert.deepEqual(run(integrate, fixture).reasons, ['INTEGRATION_CHECK_DIRTY'])
    const code = `const f=require('fs'),r=${JSON.stringify(fixture.locations.record)},v=JSON.parse(f.readFileSync(r));v.generation++;f.writeFileSync(r,JSON.stringify(v));`
    fixture.setChecks([{ id: 'fence', argv: [process.execPath, '-e', code] }])
    const secondBase = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.deepEqual(result.reasons, ['GENERATION_FENCED'])
    assert.equal(fixture.git('rev-parse', 'HEAD'), secondBase)
    assert.notEqual(secondBase, base); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})
