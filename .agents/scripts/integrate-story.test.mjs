import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIntegrationFixture, assertTemporary } from './integration-test-fixture.mjs'
import { inspectCompletion } from './check-story-completion.mjs'
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
