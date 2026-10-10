import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { normalizeAllowed } from './check-worker-scope.mjs'
const canonicalScopePath = entry => typeof entry === 'string' && normalizeAllowed(entry) === entry

export function loadHotPaths(file = new URL('../config/hot-paths.json', import.meta.url)) {
  let config
  try { config = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('HOT_PATHS_INVALID') }
  if (config?.schema !== 'hot-paths-v1' || !Array.isArray(config.entries)) throw new Error('HOT_PATHS_INVALID')
  if (config.resources !== undefined && (!Array.isArray(config.resources) ||
      config.resources.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) ||
      new Set(config.resources).size !== config.resources.length)) throw new Error('HOT_PATHS_INVALID')
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

export function overlaps(a, b) {
  return a.some(left => b.some(right => left === right ||
    (left.endsWith('/') && right.startsWith(left)) || (right.endsWith('/') && left.startsWith(right))))
}

export function declaredScope(plan) {
  const paths = []
  for (const slice of plan.slices ?? []) {
    const entries = slice.scope?.paths
    if (['pending', 'active', 'blocked'].includes(slice.status) && (!Array.isArray(entries) || !entries.length)) {
      throw new Error('SCOPE_UNDECLARED')
    }
    if (entries !== undefined) {
      if (!Array.isArray(entries) || entries.some(entry => !canonicalScopePath(entry))) throw new Error('SCOPE_UNDECLARED')
      paths.push(...entries)
    }
  }
  return [...new Set(paths)].sort()
}

export function heldHotPaths(scope, config = loadHotPaths()) {
  return config.entries.filter(entry => overlaps(scope, [entry.path]))
}

export function validateResources(resources, config = loadHotPaths()) {
  if (resources === undefined) return []
  if (!Array.isArray(resources) || new Set(resources).size !== resources.length ||
      resources.some(name => !(config.resources ?? []).includes(name))) throw new Error('RESOURCES_INVALID')
  return [...resources].sort()
}

export function inferredResources(checks = []) {
  const resources = new Set()
  for (const check of checks) {
    const command = (typeof check === 'string' ? check :
      typeof check?.command === 'string' ? check.command : Array.isArray(check?.argv) ? check.argv.join(' ') : '').toLowerCase().replaceAll('\\', '/')
    const cwd = String(check?.cwd ?? check?.directory ?? '').toLowerCase().replaceAll('\\', '/')
    if (/\bartisan\s+test\b|\bphpunit\b|\bpest\b|\blocal\.ps1["']?\s+test\b/.test(command) ||
        ((/(^|\/)backend(\/|$)/.test(cwd) || /\bbackend\//.test(command)) && /\btest(?:s)?\b/.test(command))) resources.add('backend-test-db')
    if (/\be2e\b|\bplaywright\s+test\b/.test(command)) resources.add('e2e-db')
  }
  return [...resources].sort()
}

export function sliceResources(plan, slice) {
  return [...new Set([...validateResources(plan.resources),
    ...inferredResources(slice.verification_obligations ?? plan.checks ?? [])])].sort()
}

export function declaredResources(plan) {
  return [...new Set([...validateResources(plan.resources),
    ...(plan.slices ?? []).flatMap(slice => inferredResources(slice.verification_obligations ?? plan.checks ?? []))])].sort()
}

export function resourceConflicts(storyId, resources, records) {
  validateResources(resources)
  const conflicts = records.filter(record => record.storyId !== storyId).flatMap(record => {
    const held = validateResources(record.resources)
    const shared = resources.filter(name => held.includes(name))
    return shared.length ? [{ storyId: record.storyId, resources: shared }] : []
  })
  return conflicts.length ? { status: 'CONFLICT', reasons: ['RESOURCE_CONFLICT'], storyId, conflicts }
    : { status: 'READY', reasons: [] }
}

export function scopeConflicts(storyId, scope, records, config = loadHotPaths()) {
  const hot = heldHotPaths(scope, config)
  const forbidden = hot.filter(entry => !entry.overridable)
  if (forbidden.length) return { status: 'CONFLICT', reasons: ['HOT_PATH_NON_OVERRIDABLE'],
    storyId, conflicts: [{ storyId, paths: forbidden.map(entry => entry.path) }] }
  const scopeHits = [], hotHits = []
  for (const record of records) {
    if (record.storyId === storyId) continue
    if (!Array.isArray(record.declaredScope) || !record.declaredScope.length || record.declaredScope.some(entry => !canonicalScopePath(entry))) {
      return { status: 'BLOCKED', reasons: ['SCOPE_UNDECLARED'], storyId: record.storyId }
    }
    const paths = scope.filter(entry => overlaps([entry], record.declaredScope))
    if (paths.length) scopeHits.push({ storyId: record.storyId, paths, heldPaths: record.declaredScope.filter(entry => overlaps(scope, [entry])) })
    const sharedHot = hot.filter(entry => overlaps(record.declaredScope, [entry.path])).map(entry => entry.path)
    if (sharedHot.length) hotHits.push({ storyId: record.storyId, paths: sharedHot })
  }
  return scopeHits.length || hotHits.length
    ? { status: 'CONFLICT', reasons: [scopeHits.length ? 'SCOPE_OVERLAP' : 'HOT_PATH_CONFLICT'], storyId,
        conflicts: scopeHits.length ? scopeHits : hotHits, hotConflicts: hotHits }
    : { status: 'READY', reasons: [] }
}

export function overrideCovers(override, result) {
  if (result.status === 'READY') return true
  if (!override || !['SCOPE_OVERLAP', 'HOT_PATH_CONFLICT'].includes(result.reasons[0])) return false
  return [...result.conflicts, ...(result.hotConflicts ?? [])].every(conflict =>
    override.conflicts.some(saved => saved.storyId === conflict.storyId &&
      conflict.paths.every(entry => saved.paths.some(held => held === entry || (held.endsWith('/') && entry.startsWith(held)))) &&
      (conflict.heldPaths ?? []).every(entry => (saved.heldPaths ?? []).includes(entry))))
}

export async function checkSlice(root, storyId, sliceId) {
  const { readRegistryRecord, registryPaths, comparableWorktree } = await import('./story-registry.mjs')
  const { frontmatter } = await import('./check-story-plan.mjs')
  try {
    const loaded = readRegistryRecord(root, storyId)
    if (loaded.status !== 'READY') return loaded
    if (comparableWorktree(root) !== comparableWorktree(loaded.record.worktree)) return { status: 'BLOCKED', reasons: ['WRONG_CHECKOUT'] }
    const plan = frontmatter(readFileSync(path.join(root, `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`), 'utf8'))
    const slice = plan.slices?.find(item => item.id === sliceId), scope = slice?.scope?.paths
    if (!Array.isArray(scope) || !scope.length || scope.some(entry => !canonicalScopePath(entry))) return { status: 'BLOCKED', reasons: ['SCOPE_UNDECLARED'] }
    if (scope.some(entry => !loaded.record.declaredScope.some(held => held === entry || (held.endsWith('/') && entry.startsWith(held))))) {
      return { status: 'BLOCKED', reasons: ['SCOPE_UNDECLARED'] }
    }
    const records = [], locations = registryPaths(root)
    for (const name of existsSync(locations.stories) ? readdirSync(locations.stories).filter(name => name.endsWith('.json')) : []) {
      const item = readRegistryRecord(root, name.slice(0, -5))
      if (item.status !== 'READY') return item
      records.push(item.record)
    }
    const result = scopeConflicts(storyId, scope, records)
    const resources = sliceResources(plan, slice)
    if (resources.some(name => !(loaded.record.resources ?? []).includes(name))) return { status: 'BLOCKED', reasons: ['RESOURCE_UNDECLARED'] }
    const resourceResult = resourceConflicts(storyId, resources, records)
    if (resourceResult.status !== 'READY') return resourceResult
    return overrideCovers(loaded.record.overlapOverride, result) ? { status: 'READY', reasons: [], storyId, sliceId } : result
  } catch (error) { return { status: 'ERROR', reasons: [error.message] } }
}

async function main(argv) {
  const [command, storyId, sliceId, ...extra] = argv
  let result = { status: 'INVALID', reasons: ['SCOPE_USAGE'] }
  if (command === 'check-slice' && /^\d+\.\d+$/.test(storyId ?? '') && sliceId && !extra.length) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true })
    result = top.status === 0 ? await checkSlice(path.resolve(top.stdout.trim()), storyId, sliceId) : { status: 'ERROR', reasons: ['GIT_UNAVAILABLE'] }
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Finish evaluating this module before importing registry -> scope again.
  main(process.argv.slice(2)).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = { READY: 0, CONFLICT: 3, BLOCKED: 3, INVALID: 4, ERROR: 5 }[result.status] ?? 5
  }).catch(error => {
    process.stdout.write(JSON.stringify({ status: 'ERROR', reasons: [error.message] }) + '\n')
    process.exitCode = 5
  })
}
