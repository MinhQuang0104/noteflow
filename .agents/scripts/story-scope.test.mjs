import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const moduleUrl = new URL('./story-scope.mjs', import.meta.url)
async function loader() {
  const loaded = await import(moduleUrl).catch(() => ({}))
  assert.equal(typeof loaded.loadHotPaths, 'function', 'hot-path loader must exist')
  return loaded.loadHotPaths
}

test('hot paths expose the paired contract and non-overridable control plane', async () => {
  const load = await loader(), config = load()
  assert.equal(config.schema, 'hot-paths-v1')
  assert.deepEqual(config.entries.filter(entry => entry.group === 'API contract (paired)').map(entry => entry.path),
    ['contracts/openapi.yaml', 'frontend/src/api/schema.generated.ts'])
  assert.deepEqual(config.entries.filter(entry => !entry.overridable).map(entry => entry.path), ['AGENTS.md', 'CLAUDE.md', '.agents/'])
  assert.ok(config.entries.some(entry => entry.path === 'backend/config/'))
})

test('loader rejects malformed, unsafe and duplicate normalized hot paths', async () => {
  const load = await loader(), root = mkdtempSync(path.join(tmpdir(), 'p6-hot-paths-'))
  try {
    const file = path.join(root, 'config.json')
    const entry = { path: 'src/', group: 'Fixture', overridable: true }
    for (const config of [
      { schema: 'unknown', entries: [entry] },
      { schema: 'hot-paths-v1', entries: [entry, entry] },
      { schema: 'hot-paths-v1', entries: [entry, { ...entry, path: 'src/./' }] },
      ...['../outside', 'C:/outside', '/outside', 'src\\file', ''].map(value => ({ schema: 'hot-paths-v1', entries: [{ ...entry, path: value }] })),
      { schema: 'hot-paths-v1', entries: [{ path: 'src/' }] }
    ]) {
      writeFileSync(file, JSON.stringify(config))
      assert.throws(() => load(file), /HOT_PATHS_INVALID/)
    }
    writeFileSync(file, JSON.stringify({ schema: 'hot-paths-v1', entries: [{ ...entry, path: 'src/./' }] }))
    assert.equal(load(file).entries[0].path, 'src/')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
