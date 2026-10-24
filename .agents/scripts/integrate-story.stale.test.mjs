import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
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

test('main moved during checks is stale and is never replaced by the scratch merge', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    const code = `const f=require('fs'),p=require('path'),c=require('child_process'),r=${JSON.stringify(fixture.canonical)};f.writeFileSync(p.join(r,'main-moved.txt'),'owner move');for(const a of [['add','main-moved.txt'],['commit','-qm','owner moved main']])c.execFileSync('git',a,{cwd:r});`
    fixture.setChecks([{ id: 'main-move', argv: [process.execPath, '-e', code] }])
    const base = fixture.git('rev-parse', 'HEAD'), result = run(integrate, fixture)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['MAIN_MOVED'])
    assert.notEqual(fixture.git('rev-parse', 'HEAD'), base)
    assert.equal(fixture.git('show', '-s', '--format=%s', 'HEAD'), 'owner moved main'); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})

test('dirty canonical checkout and stale generation refuse integration before mutation', async () => {
  const integrate = await implementation(), fixture = createIntegrationFixture()
  try {
    const base = fixture.git('rev-parse', 'HEAD')
    assert.deepEqual(run(integrate, fixture, 2).reasons, ['GENERATION_FENCED'])
    fixture.write('owner-work.txt', 'uncommitted work\n')
    assert.deepEqual(run(integrate, fixture).reasons, ['CANONICAL_NOT_CLEAN'])
    assert.equal(fixture.git('rev-parse', 'HEAD'), base); cleanScratch(fixture)
  } finally { fixture.cleanup() }
})
