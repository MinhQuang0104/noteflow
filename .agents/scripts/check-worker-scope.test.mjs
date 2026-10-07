import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { inspectScope, isAllowed, normalizeAllowed, parseArguments } from './check-worker-scope.mjs'

const SCRIPT = fileURLToPath(new URL('./check-worker-scope.mjs', import.meta.url))

function createWorktree() {
  const root = mkdtempSync(path.join(tmpdir(), 'worker-scope-'))
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
      { cwd: root, encoding: 'utf8', shell: false })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const write = (file, content = 'x\n') => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  git('init', '-q')
  write('.gitignore', 'ignored/\n')
  write('src/app.js', 'app\n')
  write('docs/readme.md', 'docs\n')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  return { root, base, git, write, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const check = (f, allowed = ['src/'], options = {}) => inspectScope(f.root, f.base, allowed, options)
const reasons = result => result.violations.map(item => `${item.reason}:${item.path}`)

test('allowed entries normalize to repo-relative files or directories and reject escapes', () => {
  assert.equal(normalizeAllowed('src/'), 'src/')
  assert.equal(normalizeAllowed('./src/app.js'), 'src/app.js')
  for (const bad of ['', '../x', 'a/../../b', '/etc/passwd', 'C:/x', 'src\\app.js', '.', './']) {
    assert.equal(normalizeAllowed(bad), null, bad)
  }
  assert.equal(isAllowed('src/app.js', ['src/']), true)
  assert.equal(isAllowed('srcx/app.js', ['src/']), false)
  assert.equal(isAllowed('src/app.js', ['src/app.js']), true)
  assert.equal(isAllowed('src/app.jsx', ['src/app.js']), false)
})

test('in-scope tracked, staged and untracked changes pass', () => {
  const f = createWorktree()
  try {
    f.write('src/app.js', 'changed\n')
    f.write('src/new.js')
    f.write('src/staged.js')
    f.git('add', 'src/staged.js')
    const result = check(f)
    assert.equal(result.status, 'PASS', JSON.stringify(result))
    assert.deepEqual(result.changed.map(item => item.path), ['src/app.js', 'src/new.js', 'src/staged.js'])
    assert.equal(result.commitsSinceBase, 0)
  } finally {
    f.cleanup()
  }
})

test('out-of-scope untracked file and tracked deletion fail', () => {
  const f = createWorktree()
  try {
    f.write('notes.txt')
    unlinkSync(path.join(f.root, 'docs/readme.md'))
    const result = check(f)
    assert.equal(result.status, 'FAIL')
    assert.deepEqual(reasons(result), ['OUT_OF_SCOPE_DELETE:docs/readme.md', 'OUT_OF_SCOPE_CHANGE:notes.txt'])
  } finally {
    f.cleanup()
  }
})

test('worker commits are inspected and can be forbidden', () => {
  const f = createWorktree()
  try {
    f.write('src/app.js', 'committed\n')
    f.git('commit', '-q', '-am', 'worker commit')
    assert.equal(check(f).status, 'PASS')
    const forbidden = check(f, ['src/'], { forbidCommits: true })
    assert.equal(forbidden.status, 'FAIL')
    assert.deepEqual(reasons(forbidden), ['COMMITS_FORBIDDEN:null'])
    f.write('docs/readme.md', 'committed out of scope\n')
    f.git('commit', '-q', '-am', 'out of scope')
    assert.deepEqual(reasons(check(f)), ['OUT_OF_SCOPE_CHANGE:docs/readme.md'])
  } finally {
    f.cleanup()
  }
})

test('renaming a file into scope still fails for its out-of-scope source', () => {
  const f = createWorktree()
  try {
    f.git('mv', 'docs/readme.md', 'src/readme.md')
    assert.deepEqual(reasons(check(f)), ['OUT_OF_SCOPE_DELETE:docs/readme.md'])
  } finally {
    f.cleanup()
  }
})

test('rewritten history fails even when the tree is in scope', () => {
  const f = createWorktree()
  try {
    f.git('commit', '-q', '--amend', '-m', 'rewritten base')
    const result = check(f)
    assert.equal(result.status, 'FAIL')
    assert.ok(reasons(result).includes('HISTORY_REWRITTEN:null'))
  } finally {
    f.cleanup()
  }
})

test('the delivered contract file is exempt only while unmodified', () => {
  const f = createWorktree()
  try {
    f.write('.orca-contract/contract.md', 'contract\n')
    const digest = createHash('sha256').update('contract\n').digest('hex')
    assert.equal(check(f, ['src/'], { contractSha256: digest }).status, 'PASS')
    f.write('.orca-contract/contract.md', 'tampered\n')
    assert.deepEqual(reasons(check(f, ['src/'], { contractSha256: digest })), ['CONTRACT_MODIFIED:.orca-contract/contract.md'])
    f.write('.orca-contract/extra.md')
    assert.ok(reasons(check(f)).includes('OUT_OF_SCOPE_CHANGE:.orca-contract/extra.md'))
  } finally {
    f.cleanup()
  }
})

test('invalid inputs and missing repositories fail closed', () => {
  const f = createWorktree()
  try {
    assert.equal(inspectScope(f.root, 'abc', ['src/']).status, 'INVALID')
    assert.equal(inspectScope(f.root, f.base, []).status, 'INVALID')
    assert.equal(inspectScope(f.root, f.base, ['../outside']).status, 'INVALID')
    assert.equal(inspectScope(f.root, f.base, ['src/'], { contractSha256: 'nothex' }).status, 'INVALID')
    assert.equal(inspectScope(f.root, 'f'.repeat(40), ['src/']).status, 'ERROR')
    const outside = mkdtempSync(path.join(tmpdir(), 'worker-scope-none-'))
    try {
      assert.equal(inspectScope(outside, f.base, ['src/']).status, 'ERROR')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
    assert.equal(parseArguments(['check', '--worktree', f.root]), null)
    assert.equal(parseArguments(['check', '--worktree', f.root, '--base', f.base, '--bogus', 'x']), null)
  } finally {
    f.cleanup()
  }
})

test('CLI emits one JSON result with a status exit code', () => {
  const f = createWorktree()
  try {
    f.write('notes.txt')
    const run = spawnSync(process.execPath, [SCRIPT, 'check', '--worktree', f.root, '--base', f.base, '--allow', 'src/'],
      { encoding: 'utf8', shell: false })
    assert.equal(run.status, 1)
    const result = JSON.parse(run.stdout)
    assert.equal(result.schema, 'worker-scope-v1')
    assert.equal(result.status, 'FAIL')
    const usage = spawnSync(process.execPath, [SCRIPT, 'check'], { encoding: 'utf8', shell: false })
    assert.equal(usage.status, 4)
    assert.equal(JSON.parse(usage.stdout).status, 'INVALID')
  } finally {
    f.cleanup()
  }
})
