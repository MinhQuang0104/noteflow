// Explicit probe: outside the *.test.mjs golden-suite glob.
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import * as verification from '../../../../scripts/v4-verification-fixture.mjs'
import { git, write } from '../../../../scripts/v4-test-helpers.mjs'
import { frontmatter } from '../../../../scripts/check-story-plan.mjs'
import { prepareAction } from '../../../../scripts/v4-action-kernel.mjs'
import { transactionIdentity } from '../../../../scripts/v4-slice-transaction.mjs'

const helperUrl = pathToFileURL(path.resolve('.agents/scripts/v4-test-seed-cache.mjs')).href
const fivePaths = ['src/feature.txt', 'src/feature-a.txt', 'src/feature-b.txt', 'src/feature-c.txt', 'src/feature-d.txt'].sort()
const variants = [
  ['LOW', {}], ['MEDIUM', {}], ['HIGH', {}],
  ['HIGH', { sliceRisk: 'LOW' }], ['HIGH', { sliceRisk: 'MEDIUM' }],
  ['HIGH', { changedPaths: fivePaths }],
]

function files(root, relative = '') {
  return Object.fromEntries(readdirSync(path.join(root, relative), { withFileTypes: true })
    .filter(entry => entry.name !== '.git')
    .flatMap(entry => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? Object.entries(files(root, name)) : [[name, readFileSync(path.join(root, name)).toString('hex')]]
    }).sort(([a], [b]) => a.localeCompare(b)))
}

function noCache(build) {
  const before = process.env.V4_TEST_NO_CACHE
  process.env.V4_TEST_NO_CACHE = '1'
  try { return build() } finally {
    if (before === undefined) delete process.env.V4_TEST_NO_CACHE
    else process.env.V4_TEST_NO_CACHE = before
  }
}

test('portable seed API stops before action and copies the complete independent Git repo', () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  const first = verification.verificationSeed('LOW')
  const second = verification.verificationSeed('LOW')
  try {
    assert.notEqual(first.root, second.root)
    assert.ok(lstatSync(path.join(first.root, '.git')).isDirectory())
    assert.equal(git(first.root, 'rev-parse', '--git-common-dir'), '.git')
    assert.equal(git(first.root, 'rev-list', '--count', 'HEAD'), '1')
    assert.equal(first.initialHead, second.initialHead)
    assert.equal(git(second.root, 'status', '--porcelain'), '?? src/feature.txt')
    assert.equal(frontmatter(readFileSync(path.join(second.root, verification.PLAN), 'utf8')).slices[0].status, 'pending')
    assert.equal(existsSync(path.join(second.root, verification.IMPLEMENTATION_RECEIPT)), false)
    assert.equal(existsSync(path.join(second.root, '.git/noteflow-v4-transactions')), false)
    assert.deepEqual(readdirSync(path.join(second.root, '.agent-state')), ['active-run.json'])
    assert.equal(Object.isFrozen(first.changedPaths), false)
    assert.equal(Object.isFrozen(first.implementationRequest), false)
    first.implementationRequest.policy_paths.push('consumer-only.md')
    first.changedPaths.push('consumer-only.txt')
    write(first.root, 'src/base.txt', 'only the first copy\n')
    git(first.root, 'add', 'src/base.txt')
    git(first.root, 'commit', '-qm', 'isolated copy')
    assert.deepEqual(second.changedPaths, ['src/feature.txt'])
    assert.equal(second.implementationRequest.policy_paths.includes('consumer-only.md'), false)
    assert.equal(readFileSync(path.join(second.root, 'src/base.txt'), 'utf8'), 'base\n')
    assert.equal(git(second.root, 'rev-list', '--count', 'HEAD'), '1')
    first.cleanup()
    assert.equal(existsSync(first.root), false)
    assert.equal(existsSync(second.root), true)
    const third = verification.verificationSeed('LOW')
    try { assert.deepEqual(files(third.root), files(second.root)) } finally { third.cleanup() }
  } finally { first.cleanup(); second.cleanup() }
})

test('cache hits build once, preserve dirty index state, separate keys and bypass unknown variants', async () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  const { createPortableSeedCache } = await import(helperUrl)
  const built = []
  const seed = createPortableSeedCache({
    prefix: 'v4-probe-copy-',
    key: input => input.unknown ? null : input.variant,
    build: input => {
      const root = mkdtempSync(path.join(tmpdir(), 'v4-probe-template-'))
      built.push(root)
      write(root, 'tracked.txt', 'base\n')
      git(root, 'init', '-q')
      git(root, 'config', 'user.name', 'Probe')
      git(root, 'config', 'user.email', 'probe@example.com')
      git(root, 'config', 'core.autocrlf', 'false')
      git(root, 'add', '.')
      git(root, 'commit', '-qm', 'base')
      write(root, 'tracked.txt', input.variant + '\n')
      return { root, cleanup: () => rmSync(root, { recursive: true, force: true }), data: { paths: ['tracked.txt'] } }
    }
  })
  const copies = []
  try {
    copies.push(seed({ variant: 'A' }), seed({ variant: 'A' }))
    assert.equal(built.length, 1)
    copies.push(seed({ variant: 'B' }))
    assert.equal(built.length, 2)
    copies.push(seed({ variant: 'A', unknown: true }), seed({ variant: 'A', unknown: true }))
    assert.equal(built.length, 4)
    copies.push(noCache(() => seed({ variant: 'A' })))
    assert.equal(built.length, 5)
    assert.equal(git(copies[0].root, 'status', '--porcelain'), 'M tracked.txt')
    assert.equal(readFileSync(path.join(copies[2].root, 'tracked.txt'), 'utf8'), 'B\n')
    copies[0].data.paths.push('consumer mutation')
    assert.deepEqual(copies[1].data.paths, ['tracked.txt'])
    assert.equal(existsSync(path.join(built[0], '.git/index.lock')), false)
  } finally { for (const copy of copies) copy.cleanup() }
})

test('all admitted variants match uncached seed bytes, requests and fresh copy-local checkpoints', () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  // Fix only Git dates in this probe so separately built histories can be compared byte-for-byte.
  const dates = [process.env.GIT_AUTHOR_DATE, process.env.GIT_COMMITTER_DATE]
  process.env.GIT_AUTHOR_DATE = process.env.GIT_COMMITTER_DATE = '2026-10-12T00:00:00Z'
  try {
    for (const [risk, options] of variants) {
      const cached = verification.verificationSeed(risk, options)
      const uncached = noCache(() => verification.verificationSeed(risk, options))
      try {
        assert.deepEqual(files(cached.root), files(uncached.root))
        assert.equal(git(cached.root, 'status', '--porcelain'), git(uncached.root, 'status', '--porcelain'))
        assert.equal(git(cached.root, 'ls-files', '--stage'), git(uncached.root, 'ls-files', '--stage'))
        assert.equal(git(cached.root, 'rev-parse', 'HEAD^{tree}'), git(uncached.root, 'rev-parse', 'HEAD^{tree}'))
        const { expected_head: a, ...left } = cached.implementationRequest
        const { expected_head: b, ...right } = uncached.implementationRequest
        assert.deepEqual(left, right)
        assert.equal(prepareAction(cached.root, cached.implementationRequest).status, 'READY')
        assert.equal(prepareAction(uncached.root, uncached.implementationRequest).status, 'READY')
      } finally { cached.cleanup(); uncached.cleanup() }
      const first = verification.fixture(risk, options)
      const second = noCache(() => verification.fixture(risk, options))
      try {
        assert.equal(git(first.root, 'rev-list', '--count', 'HEAD'), '3')
        assert.equal(git(second.root, 'rev-list', '--count', 'HEAD'), '3')
        assert.equal(git(first.root, 'status', '--porcelain'), '')
        assert.equal(git(second.root, 'status', '--porcelain'), '')
        assert.equal(first.head, second.head)
        const durable = f => Object.fromEntries(Object.entries(files(f.root)).filter(([name]) => !name.startsWith('.agent-state/v4-observations/')))
        assert.deepEqual(durable(first), durable(second))
        assert.deepEqual(first.verifyRequest, second.verifyRequest)
        const events = f => readdirSync(path.join(f.root, '.agent-state/v4-observations/events')).map(name =>
          JSON.parse(readFileSync(path.join(f.root, '.agent-state/v4-observations/events', name), 'utf8')))
        const firstEvents = events(first), secondEvents = events(second)
        assert.equal(firstEvents.length, 2)
        assert.equal(secondEvents.length, 2)
        assert.notEqual(firstEvents[0].repository_id, secondEvents[0].repository_id)
        assert.notEqual(firstEvents[0].worktree_id, secondEvents[0].worktree_id)
        const identity = transactionIdentity(first.root, { action: 'implement_slice', story_id: '9.1', slice_id: 'A', transaction_id: `implementation-${risk.toLowerCase()}` })
        const journal = JSON.parse(readFileSync(identity.journalPath, 'utf8'))
        assert.equal(journal.worktree, first.root)
        assert.equal(journal.repository, path.join(first.root, '.git'))
        assert.equal(journal.phase, 'COMPLETE')
        assert.equal(existsSync(identity.lockPath), false)
        assert.equal(verification.prepareVerification(first).status, 'READY')
        assert.equal(verification.prepareVerification(second).status, 'READY')
        // Metadata must retain the original within-fixture aliases while isolating consumers.
        assert.equal(first.verifyRequest.check_specs, first.checkSpecs)
        assert.equal(first.checkSpecs[0].referenced_paths, first.changedPaths)
        first.checkSpecs[0].environment_identity.name = 'mutable consumer'
        assert.equal(second.checkSpecs[0].environment_identity.name, 'fixture')
      } finally { first.cleanup(); second.cleanup() }
      const reused = verification.verificationSeed(risk, options)
      try {
        assert.equal(git(reused.root, 'rev-list', '--count', 'HEAD'), '1')
        assert.equal(existsSync(path.join(reused.root, '.git/noteflow-v4-transactions')), false)
        assert.deepEqual(readdirSync(path.join(reused.root, '.agent-state')), ['active-run.json'])
      } finally { reused.cleanup() }
    }
  } finally {
    for (const [key, value] of [['GIT_AUTHOR_DATE', dates[0]], ['GIT_COMMITTER_DATE', dates[1]]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('unproven accessor variants execute the old builder on every call', () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  let reads = 0
  const options = { get sliceRisk() { reads++; return 'LOW' } }
  const first = verification.verificationSeed('HIGH', options)
  const second = verification.verificationSeed('HIGH', options)
  try {
    assert.equal(reads, 4) // Original builder reads sliceRisk for pending Plan and implementation template.
    assert.deepEqual(files(first.root), files(second.root))
  } finally { first.cleanup(); second.cleanup() }
})

test('seed source byte changes invalidate a warm variant in the same cwd', () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  const cwd = process.cwd()
  const sourceRoot = mkdtempSync(path.join(tmpdir(), 'v4-probe-source-'))
  const relative = '.agents/scripts/check-escalation.mjs'
  for (const name of ['check-escalation.mjs', 'prepare-change-evidence.mjs']) {
    write(sourceRoot, `.agents/scripts/${name}`, readFileSync(path.join(cwd, '.agents/scripts', name)))
  }
  let first, second
  try {
    process.chdir(sourceRoot)
    first = verification.verificationSeed('LOW')
    const original = readFileSync(path.join(sourceRoot, relative), 'utf8')
    write(sourceRoot, relative, original + '\n// probe source change\n')
    second = verification.verificationSeed('LOW')
    assert.equal(readFileSync(path.join(first.root, relative), 'utf8'), original)
    assert.equal(readFileSync(path.join(second.root, relative), 'utf8'), original + '\n// probe source change\n')
  } finally {
    process.chdir(cwd)
    first?.cleanup(); second?.cleanup()
    rmSync(sourceRoot, { recursive: true, force: true })
  }
})

test('process exit removes private templates and fixture cleanup removes only consumer roots', () => {
  assert.equal(typeof verification.verificationSeed, 'function', 'pre-action seed cache is missing')
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createPortableSeedCache } from ${JSON.stringify(helperUrl)};
    import { mkdtempSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { git, write } from ${JSON.stringify(pathToFileURL(path.resolve('.agents/scripts/v4-test-helpers.mjs')).href)};
    let template;
    const seed = createPortableSeedCache({ prefix: 'v4-exit-copy-', key: () => 'base', build: () => {
      template = mkdtempSync(path.join(tmpdir(), 'v4-exit-template-'));
      write(template, 'base.txt', 'base'); git(template, 'init', '-q');
      git(template, 'config', 'user.name', 'Probe'); git(template, 'config', 'user.email', 'probe@example.com');
      git(template, 'add', '.'); git(template, 'commit', '-qm', 'base');
      return { root: template, cleanup: () => rmSync(template, { recursive: true, force: true }) };
    }});
    const copy = seed({}); copy.cleanup(); console.log('ROOTS:' + JSON.stringify([template, copy.root]));
    process.exit(0);
  `], { encoding: 'utf8', windowsHide: true })
  assert.equal(child.status, 0, child.stderr)
  const roots = JSON.parse(child.stdout.match(/^ROOTS:(.+)$/m)[1])
  for (const root of roots) assert.equal(existsSync(root), false, root)
})
