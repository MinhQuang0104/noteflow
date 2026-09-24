import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const producer = fileURLToPath(new URL('./prepare-change-evidence.mjs', import.meta.url))

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.ifError(result.error)
  return result
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'change-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(run('git', ['init', '-q'], root).status, 0)
  writeFileSync(path.join(root, 'tracked.txt'), 'before\n')
  assert.equal(run('git', ['add', 'tracked.txt'], root).status, 0)
  assert.equal(run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base'], root).status, 0)
  const base = run('git', ['rev-parse', 'HEAD'], root).stdout.trim()
  const evidence = (comparison, file, extra = []) => {
    const result = run(process.execPath, [producer, '--comparison', comparison, '--path', file, ...extra], root)
    return { code: result.status, body: JSON.parse(result.stdout) }
  }
  return { root, base, evidence }
}

test('tracked modified text remains reviewable', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'tracked.txt'), 'after\n')
  const result = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(result.code, 0)
  assert.equal(result.body.status, 'OK')
  assert.match(result.body.changeEvidence.paths[0].hunks[0].diffText, /-before\n\+after/)
})

test('tracked deletion remains reviewable', t => {
  const { root, evidence } = fixture(t)
  unlinkSync(path.join(root, 'tracked.txt'))
  const result = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(result.code, 0)
  assert.match(result.body.changeEvidence.paths[0].hunks[0].diffText, /@@ -1 \+0,0 @@\n-before/)
})

test('unchanged tracked path retains no-change outcome', t => {
  const { evidence } = fixture(t)
  const result = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(result.code, 1)
  assert.equal(result.body.status, 'NO_CHANGE')
})

test('new untracked text is an added delta without changing the index', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'new.txt'), 'first\nsecond\n')
  const before = run('git', ['ls-files', '--stage', '-z'], root).stdout
  const result = evidence('working-tree-vs-HEAD', 'new.txt')
  const after = run('git', ['ls-files', '--stage', '-z'], root).stdout
  assert.equal(result.code, 0)
  assert.equal(result.body.status, 'OK')
  assert.equal(result.body.changeEvidence.paths[0].changeType, 'added')
  assert.match(result.body.changeEvidence.paths[0].hunks[0].diffText, /@@ -0,0 \+1,2 @@\n\+first\n\+second/)
  assert.equal(after, before)
  assert.equal(run('git', ['ls-files', '--error-unmatch', 'new.txt'], root).status, 1)
})

test('new untracked text over line budget requires split', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'large.txt'), Array.from({ length: 300 }, (_, i) => `line ${i}\n`).join(''))
  const result = evidence('working-tree-vs-HEAD', 'large.txt')
  assert.equal(result.code, 2)
  assert.equal(result.body.status, 'SPLIT_REQUIRED')
})

test('new empty text file still has an added file delta', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'empty.txt'), '')
  const result = evidence('working-tree-vs-HEAD', 'empty.txt')
  assert.equal(result.code, 0)
  assert.equal(result.body.changeEvidence.paths[0].changeType, 'added')
  assert.deepEqual(result.body.changeEvidence.paths[0].hunks, [])
})

test('valid dot-prefixed name remains inside the repository', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, '..notes.txt'), 'note\n')
  const result = evidence('working-tree-vs-HEAD', '..notes.txt')
  assert.equal(result.code, 0)
  assert.equal(result.body.changeEvidence.paths[0].changeType, 'added')
})

test('new untracked binary is unsupported', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'binary.dat'), Buffer.from([0, 1, 2, 3]))
  const result = evidence('working-tree-vs-HEAD', 'binary.dat')
  assert.equal(result.code, 3)
  assert.equal(result.body.status, 'UNSUPPORTED')
  assert.equal(result.body.changeEvidence, undefined)
})

test('nonexistent path retains unsupported outcome', t => {
  const { evidence } = fixture(t)
  const result = evidence('working-tree-vs-HEAD', 'missing.txt')
  assert.equal(result.code, 3)
  assert.equal(result.body.status, 'UNSUPPORTED')
})

test('path traversal is rejected', t => {
  const { evidence } = fixture(t)
  const result = evidence('working-tree-vs-HEAD', '../outside.txt')
  assert.equal(result.code, 4)
  assert.equal(result.body.status, 'INVALID_INPUT')
})

test('explicit pair remains reviewable', t => {
  const { root, base, evidence } = fixture(t)
  writeFileSync(path.join(root, 'tracked.txt'), 'committed\n')
  assert.equal(run('git', ['add', 'tracked.txt'], root).status, 0)
  assert.equal(run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'head'], root).status, 0)
  const result = evidence('explicit-pair', 'tracked.txt', ['--base', base, '--head', 'HEAD'])
  assert.equal(result.code, 0)
  assert.match(result.body.changeEvidence.paths[0].hunks[0].diffText, /-before\n\+committed/)
})
