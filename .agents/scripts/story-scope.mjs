import { readFileSync } from 'node:fs'
import { normalizeAllowed } from './check-worker-scope.mjs'

export function loadHotPaths(file = new URL('../config/hot-paths.json', import.meta.url)) {
  let config
  try { config = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('HOT_PATHS_INVALID') }
  if (config?.schema !== 'hot-paths-v1' || !Array.isArray(config.entries)) throw new Error('HOT_PATHS_INVALID')
  const seen = new Set()
  const entries = config.entries.map(entry => {
    const normalized = normalizeAllowed(entry?.path)
    if (normalized === null || typeof entry.group !== 'string' || !entry.group.trim() ||
        typeof entry.overridable !== 'boolean' || seen.has(normalized)) throw new Error('HOT_PATHS_INVALID')
    seen.add(normalized)
    return { path: normalized, group: entry.group, overridable: entry.overridable }
  })
  return { ...config, entries }
}
