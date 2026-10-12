// Explicit cache contract probes, outside the *.test.mjs golden glob.
import assert from 'node:assert/strict'
import test from 'node:test'
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { fixture, candidate, preserved, STORY, PLAN, FINALIZATION } from '../../../../scripts/finalize-story-fixture.mjs'
import { git, write } from '../../../../scripts/v4-test-helpers.mjs'
import { frontmatter } from '../../../../scripts/check-story-plan.mjs'
import { receiptDigest } from '../../../../scripts/check-artifact-contract.mjs'
import { prepareFinalization } from '../../../../scripts/finalize-story.mjs'

const templates = () => readdirSync(tmpdir()).filter(name => name.startsWith('finalize-story-') && !name.startsWith('finalize-story-copy-'))
function files(root, relative = '', includeGit = false) {
  return Object.fromEntries(readdirSync(path.join(root, relative), { withFileTypes: true })
    .filter(entry => includeGit || entry.name !== '.git')
    .flatMap(entry => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? Object.entries(files(root, name, includeGit)) : [[name, readFileSync(path.join(root, name)).toString('hex')]]
    }).sort(([a], [b]) => a.localeCompare(b)))
}
function env(values, build) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try { return build() } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
function portable(f) {
  assert.ok(lstatSync(path.join(f.root, '.git')).isDirectory())
  assert.equal(git(f.root, 'rev-parse', '--git-common-dir'), '.git')
  assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
  assert.equal(git(f.root, 'status', '--porcelain=v1', '-z'), '')
  for (const relative of ['.git/worktrees', '.git/index.lock', '.git/v4-finalize-story.lock',
    '.git/noteflow-v4-transactions', '.git/noteflow-v4-finalization-recovery', FINALIZATION]) {
    assert.equal(existsSync(path.join(f.root, relative)), false, relative)
  }
  const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
  assert.equal(plan.slices[0].status, 'reviewed')
  assert.equal(plan.next_action.kind, 'finalize_story')
  for (const ref of Object.values(plan.slices[0].receipt_refs)) {
    assert.equal(receiptDigest(JSON.parse(readFileSync(path.join(f.root, ref.path), 'utf8'))), ref.digest)
  }
}

test('reviewed cache hits reuse one private template and preserve complete Git/Plan/receipt bytes', () => {
  const before = new Set(templates())
  const first = fixture(), second = fixture()
  try {
    assert.match(first.root, /finalize-story-copy-/, 'reviewed seed cache is missing')
    assert.notEqual(first.root, second.root)
    assert.equal(templates().filter(name => !before.has(name)).length, 1, 'builder should run once')
    portable(first); portable(second)
    assert.equal(first.head, second.head)
    assert.deepEqual(files(first.root), files(second.root))
    // Object database, config and refs are copied, not regenerated.
    const gitBytes = f => Object.fromEntries(Object.entries(files(path.join(f.root, '.git'), '', true)).filter(([name]) => name !== 'index'))
    assert.deepEqual(gitBytes(first), gitBytes(second))
    assert.equal(prepareFinalization(second.root, '9.1', second.head).status, 'READY')
  } finally { first.cleanup(); second.cleanup() }
})

test('consumer metadata, bytes, commits, closures and cleanup are isolated from template and siblings', () => {
  const first = fixture(), second = fixture(), third = fixture()
  try {
    assert.equal(Object.isFrozen(first), false)
    assert.equal(Object.isFrozen(first.expectedPaths), false)
    first.expectedPaths.push('consumer-only.txt')
    first.storyDigest = 'consumer-only'
    assert.deepEqual(second.expectedPaths, [FINALIZATION, PLAN, '_bmad-output/implementation-artifacts/sprint-status.yaml', STORY])
    assert.equal(second.storyDigest, third.storyDigest)
    write(first.root, 'seed.txt', 'consumer mutation\n')
    git(first.root, 'add', 'seed.txt'); git(first.root, 'commit', '-qm', 'consumer commit')
    assert.equal(git(second.root, 'rev-parse', 'HEAD'), third.head)
    assert.equal(readFileSync(path.join(second.root, 'seed.txt'), 'utf8'), 'seed\n')
    candidate(second)
    const state = preserved(second)
    assert.equal(state.head, second.head)
    assert.equal(state.files.length, 4)
    assert.equal(existsSync(path.join(second.root, FINALIZATION)), true)
    assert.equal(existsSync(path.join(third.root, FINALIZATION)), false)
    portable(third)
    first.cleanup()
    assert.equal(existsSync(first.root), false)
    assert.equal(existsSync(second.root), true)
    const next = fixture()
    try { assert.deepEqual(files(next.root), files(third.root)); assert.deepEqual(next.expectedPaths, third.expectedPaths) }
    finally { next.cleanup() }
  } finally { first.cleanup(); second.cleanup(); third.cleanup() }
})

test('cached and original builders are byte/digest/HEAD/status equivalent with controlled commit clock', () => {
  env({ GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' }, () => {
    const cached = fixture(), uncached = env({ V4_TEST_NO_CACHE: '1' }, fixture)
    try {
      portable(cached); portable(uncached)
      assert.equal(cached.head, uncached.head)
      assert.equal(cached.storyDigest, uncached.storyDigest)
      assert.deepEqual(cached.expectedPaths, uncached.expectedPaths)
      assert.deepEqual(files(cached.root), files(uncached.root))
      assert.deepEqual(git(cached.root, 'log', '--format=raw'), git(uncached.root, 'log', '--format=raw'))
      assert.deepEqual(prepareFinalization(cached.root, '9.1', cached.head), prepareFinalization(uncached.root, '9.1', uncached.head))
      const a = candidate(cached), b = candidate(uncached)
      assert.deepEqual(a, b)
      assert.deepEqual(files(cached.root), files(uncached.root))
    } finally { cached.cleanup(); uncached.cleanup() }
  })
})

test('fallback bypasses the cache and unproven argument variants keep the original builder', () => {
  const copies = [env({ V4_TEST_NO_CACHE: '1' }, fixture), env({ V4_TEST_NO_CACHE: '1' }, fixture), fixture({ unknown: true }), fixture(undefined)]
  try {
    assert.equal(new Set(copies.map(f => f.root)).size, 4)
    for (const f of copies) { assert.doesNotMatch(f.root, /finalize-story-copy-/); portable(f) }
  } finally { copies.forEach(f => f.cleanup()) }
})

test('environment inputs separate keys and restoration returns to the original cached seed', () => {
  const base = fixture()
  const alternate = env({ GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z' }, fixture)
  const restored = fixture()
  try { assert.notEqual(alternate.head, base.head); assert.equal(restored.head, base.head); portable(alternate) }
  finally { base.cleanup(); alternate.cleanup(); restored.cleanup() }
})

test('unproven external Git hook configuration uses the original builder', () => {
  const hooks = mkdtempSync(path.join(tmpdir(), 'finalize-hooks-probe-'))
  try {
    env({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks }, () => {
      const f = fixture()
      try { assert.doesNotMatch(f.root, /finalize-story-copy-/); portable(f) }
      finally { f.cleanup() }
    })
  } finally { rmSync(hooks, { recursive: true, force: true }) }
})

test('source changes invalidate only the reviewed seed cache in an isolated scripts sandbox', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'finalize-source-probe-'))
  try {
    cpSync(path.resolve('.agents/scripts'), path.join(sandbox, 'scripts'), { recursive: true })
    const url = pathToFileURL(path.join(sandbox, 'scripts/finalize-story-fixture.mjs')).href
    const source = `import { fixture } from ${JSON.stringify(url)};
      import { appendFileSync, readdirSync } from 'node:fs'; import { tmpdir } from 'node:os';
      const names=()=>readdirSync(tmpdir()).filter(n=>n.startsWith('finalize-story-')&&!n.startsWith('finalize-story-copy-'));
      const before=new Set(names()); const a=fixture(); const b=fixture();
      const hit=names().filter(n=>!before.has(n)).length;
      appendFileSync(${JSON.stringify(path.join(sandbox, 'scripts/v4-test-helpers.mjs'))}, '\\n// isolated source mutation\\n');
      const c=fixture(); const invalidated=names().filter(n=>!before.has(n)).length;
      a.cleanup(); b.cleanup(); c.cleanup(); console.log(JSON.stringify({hit,invalidated}));`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    const row = result.stdout.split('\n').find(line => line.startsWith('{'))
    assert.deepEqual(JSON.parse(row), { hit: 1, invalidated: 2 })
  } finally { rmSync(sandbox, { recursive: true, force: true }) }
})

test('after/exit removes private reviewed templates while consumer cleanup removes only its copy', () => {
  const url = pathToFileURL(path.resolve('.agents/scripts/finalize-story-fixture.mjs')).href
  const source = `import { fixture } from ${JSON.stringify(url)};
    import { readdirSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path';
    const before=new Set(readdirSync(tmpdir())); const f=fixture(); f.cleanup();
    console.log(JSON.stringify(readdirSync(tmpdir()).filter(n=>!before.has(n)&&n.startsWith('finalize-story-')).map(n=>path.join(tmpdir(),n))));`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  const row = result.stdout.split('\n').find(line => line.startsWith('['))
  const roots = JSON.parse(row)
  assert.equal(roots.length, 1, 'consumer cleanup must retain the private template until after/exit')
  for (const root of roots) assert.equal(existsSync(root), false, root)
})
