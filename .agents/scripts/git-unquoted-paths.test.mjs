import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const VIETNAMESE = '2-2-xem-challenge-và-done-nhanh-từ-hôm-nay.md'
const PATH_PARSING_SCRIPTS = [
  'complete-story.mjs', 'check-story-completion.mjs', 'check-story-finalization.mjs',
  'check-slice-verification.mjs', 'reconcile-story-lifecycle.mjs', 'v4-story-runner.mjs',
]

test('git name-only output keeps non-ASCII Story file names raw only with core.quotepath=false (Story 2.2 F-22-3)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'quotepath-'))
  try {
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    git('init', '-q')
    git('config', 'core.quotepath', 'true')
    writeFileSync(path.join(root, VIETNAMESE), 'story\n')
    git('add', '--', VIETNAMESE)
    assert.notEqual(git('diff', '--cached', '--name-only').stdout.trim(), VIETNAMESE)
    assert.equal(git('-c', 'core.quotepath=false', 'diff', '--cached', '--name-only').stdout.trim(), VIETNAMESE)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('every lifecycle script that parses newline git path output disables path quoting', () => {
  for (const script of PATH_PARSING_SCRIPTS) {
    const source = readFileSync(new URL(`./${script}`, import.meta.url), 'utf8')
    const helpers = source.match(/spawnSync\('git',\s*[^\n]*/g) ?? []
    assert.ok(helpers.length > 0, script)
    for (const helper of helpers.filter(line => !line.includes("'hash-object'"))) {
      assert.match(helper, /'-c',\s*'core\.quotepath=false'/, `${script}: ${helper}`)
    }
  }
})
