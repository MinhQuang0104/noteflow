import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { validateEvidenceSet } from './prepare-change-evidence.mjs'

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
  assert.equal(result.body.changeEvidence.evidenceSet, undefined)
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
  assert.equal(result.body.changeEvidence.evidenceSet, undefined)
  assert.match(result.body.changeEvidence.paths[0].hunks[0].diffText, /@@ -0,0 \+1,2 @@\n\+first\n\+second/)
  assert.equal(after, before)
  assert.equal(run('git', ['ls-files', '--error-unmatch', 'new.txt'], root).status, 1)
})

test('new untracked text over line budget yields complete bounded evidence', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'large.txt'), Array.from({ length: 300 }, (_, i) => `line ${i}\n`).join(''))
  const result = evidence('working-tree-vs-HEAD', 'large.txt')
  assert.equal(result.code, 0, JSON.stringify(result.body))
  assert.equal(result.body.status, 'OK')
  const set = result.body.changeEvidence.evidenceSet
  assert.equal(set.paths[0].changeType, 'added')
  assert.equal(set.unitCount, 2)
  assert.ok(set.units.every(unit => unit.evidenceSetDigest === set.sourceDigest))
  assert.ok(set.units.every(unit => unit.diffLineCount <= 240))
  assert.doesNotThrow(() => validateEvidenceSet(set))
  const body = set.units.map(unit => unit.bodyText).join('\n')
  assert.equal(body, Array.from({ length: 300 }, (_, i) => `+line ${i}`).join('\n'))
})

test('newline marker remains with its preceding record at a chunk boundary', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'large.txt'), Array.from({ length: 239 }, (_, i) => `line ${i}\n`).join('') + 'last')
  const result = evidence('working-tree-vs-HEAD', 'large.txt')
  assert.equal(result.code, 0, JSON.stringify(result.body))
  const set = result.body.changeEvidence.evidenceSet
  assert.equal(set.units.length, 2)
  assert.match(set.units[1].bodyText, /\+last\n\\ No newline at end of file$/)
  assert.doesNotThrow(() => validateEvidenceSet(set))
})

test('tracked oversized hunk and tampered unit sequences are rejected', t => {
  const { root, evidence } = fixture(t)
  writeFileSync(path.join(root, 'tracked.txt'), Array.from({ length: 300 }, (_, i) => `changed ${i}\n`).join(''))
  const result = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(result.code, 0)
  const set = result.body.changeEvidence.evidenceSet
  assert.ok(set.unitCount > 1)
  assert.doesNotThrow(() => validateEvidenceSet(set))
  const mutate = fn => { const copy = structuredClone(set); fn(copy); assert.throws(() => validateEvidenceSet(copy)) }
  mutate(copy => copy.units.reverse())
  mutate(copy => copy.units.pop())
  mutate(copy => copy.units.splice(1, 0, structuredClone(copy.units[0])))
  mutate(copy => { copy.units[0].bodyText = copy.units[0].bodyText.replace('changed', 'altered') })
  mutate(copy => { copy.units[0].evidenceSetDigest = 'stale' })
})

test('multiple hunks on one oversized path retain complete ordered coverage', t => {
  const { root, evidence } = fixture(t)
  const original = Array.from({ length: 400 }, (_, i) => `line ${i}`)
  writeFileSync(path.join(root, 'tracked.txt'), `${original.join('\n')}\n`)
  assert.equal(run('git', ['add', 'tracked.txt'], root).status, 0)
  assert.equal(run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'long base'], root).status, 0)
  const changed = original.map((line, i) => i < 110 || i >= 290 ? `changed ${i}` : line)
  writeFileSync(path.join(root, 'tracked.txt'), `${changed.join('\n')}\n`)
  const result = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(result.code, 0)
  const set = result.body.changeEvidence.evidenceSet
  assert.equal(set.paths[0].hunks.length, 2)
  assert.deepEqual([...new Set(set.units.map(unit => unit.hunkIndex))], [0, 1])
  assert.doesNotThrow(() => validateEvidenceSet(set))
})

test('more than six hunks yield complete ordered evidence units while oversized multi-path groups require a path split', t => {
  const { root, evidence } = fixture(t)
  const original = Array.from({ length: 140 }, (_, i) => `line ${i}`)
  writeFileSync(path.join(root, 'tracked.txt'), `${original.join('\n')}\n`)
  assert.equal(run('git', ['add', 'tracked.txt'], root).status, 0)
  assert.equal(run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'hunk base'], root).status, 0)
  writeFileSync(path.join(root, 'tracked.txt'), `${original.map((v, i) => i % 20 === 0 ? `changed ${i}` : v).join('\n')}\n`)
  const manyHunks = evidence('working-tree-vs-HEAD', 'tracked.txt')
  assert.equal(manyHunks.code, 0, JSON.stringify(manyHunks.body))
  assert.equal(manyHunks.body.status, 'OK')
  const set = manyHunks.body.changeEvidence.evidenceSet
  assert.equal(set.paths[0].hunks.length, 7)
  assert.deepEqual([...new Set(set.units.map(unit => unit.hunkIndex))], [0, 1, 2, 3, 4, 5, 6])
  assert.ok(set.units.every(unit => unit.diffLineCount <= 240))
  assert.doesNotThrow(() => validateEvidenceSet(set))
  const incomplete = structuredClone(set)
  incomplete.units.splice(3, 1)
  assert.throws(() => validateEvidenceSet(incomplete))

  writeFileSync(path.join(root, 'small.txt'), 'small change\n')
  const multiPathHunkGroup = evidence('working-tree-vs-HEAD', 'tracked.txt', ['--path', 'small.txt'])
  assert.equal(multiPathHunkGroup.code, 2)
  assert.equal(multiPathHunkGroup.body.status, 'SPLIT_REQUIRED')

  writeFileSync(path.join(root, 'a.txt'), Array.from({length: 130}, (_, i) => `a ${i}\n`).join(''))
  writeFileSync(path.join(root, 'b.txt'), Array.from({length: 130}, (_, i) => `b ${i}\n`).join(''))
  const group = evidence('working-tree-vs-HEAD', 'a.txt', ['--path', 'b.txt'])
  assert.equal(group.code, 2)
  assert.equal(group.body.status, 'SPLIT_REQUIRED')
  for (const name of ['c.txt', 'd.txt', 'e.txt']) writeFileSync(path.join(root, name), 'new\n')
  const tooMany = evidence('working-tree-vs-HEAD', 'a.txt',
    ['--path', 'b.txt', '--path', 'c.txt', '--path', 'd.txt', '--path', 'e.txt'])
  assert.equal(tooMany.code, 2)
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
  writeFileSync(path.join(root, 'binary.dat'), Buffer.concat([Buffer.from([0]), Buffer.alloc(1000, 1)]))
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
