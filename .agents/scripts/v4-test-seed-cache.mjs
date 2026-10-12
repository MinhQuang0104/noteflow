import assert from 'node:assert/strict'
import { cpSync, existsSync, lstatSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after } from 'node:test'

function gitOutput(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function freezeMetadata(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freezeMetadata(child, seen)
  return Object.freeze(value)
}

// Builders own only portable pre-action repositories and pure metadata. Functions
// are recreated by consumers; cleanup is the sole builder closure retained privately.
export function createPortableSeedCache({ prefix, key, build }) {
  const templates = new Map()
  const cleanupTemplates = () => {
    for (const template of templates.values()) template.cleanup()
    templates.clear()
  }
  after(cleanupTemplates)
  process.once('exit', cleanupTemplates)

  return input => {
    if (process.env.V4_TEST_NO_CACHE === '1') return build(input)
    const cacheKey = key(input)
    if (cacheKey === null) return build(input)
    assert.equal(typeof cacheKey, 'string')
    if (!templates.has(cacheKey)) {
      const seed = build(input)
      try {
        assert.ok(lstatSync(path.join(seed.root, '.git')).isDirectory(), 'seed must have its own .git directory')
        for (const relative of ['.git/noteflow-v4-transactions', '.git/worktrees', '.git/index.lock']) {
          assert.equal(existsSync(path.join(seed.root, relative)), false, `nonportable seed state: ${relative}`)
        }
        const { root, cleanup, ...metadata } = seed
        templates.set(cacheKey, Object.freeze({
          root, cleanup, metadata: freezeMetadata(structuredClone(metadata)),
          head: gitOutput(root, 'rev-parse', 'HEAD'),
          status: gitOutput(root, 'status', '--porcelain=v1', '-z')
        }))
      } catch (error) { seed.cleanup(); throw error }
    }
    const template = templates.get(cacheKey)
    const root = mkdtempSync(path.join(tmpdir(), prefix))
    const cleanup = () => rmSync(root, { recursive: true, force: true })
    try {
      cpSync(template.root, root, { recursive: true })
      const refresh = spawnSync('git', ['update-index', '--refresh'], { cwd: root, encoding: 'utf8', windowsHide: true })
      assert.ok(refresh.status === 0 || (refresh.status === 1 && refresh.stdout.includes(': needs update') && refresh.stderr === ''),
        `index refresh failed: ${refresh.error ?? refresh.stderr}`)
      assert.equal(gitOutput(root, 'status', '--porcelain=v1', '-z'), template.status, 'seed status changed after copy')
      assert.equal(gitOutput(root, 'rev-parse', 'HEAD'), template.head, 'seed HEAD changed after copy')
      return { root, cleanup, ...structuredClone(template.metadata) }
    } catch (error) { cleanup(); throw error }
  }
}
