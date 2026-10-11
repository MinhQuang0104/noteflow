import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { frontmatter } from './check-story-plan.mjs'
import { inspectCompletion } from './check-story-completion.mjs'
import { checkLeadGeneration, comparableWorktree, heartbeatStory, registryPaths, releaseStory } from './story-registry.mjs'

const failure = (status, reason, extra = {}) => ({ status, reasons: [reason], ...extra })
function git(root, args, required = true) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024 })
  if (required && (result.error || result.status !== 0)) throw new Error(`GIT_FAILED:${args[0]}`)
  return result
}
const output = (root, args) => git(root, args).stdout.trim()
const cleanMain = root => output(root, ['branch', '--show-current']) === 'main' && output(root, ['status', '--porcelain']) === ''

export function loadIntegrationChecks(root) {
  let config
  try { config = JSON.parse(readFileSync(path.join(root, '.agents/config/integration-checks.json'), 'utf8')) }
  catch { throw new Error('INTEGRATION_CHECKS_INVALID') }
  const ids = new Set()
  if (config?.schema !== 'integration-checks-v1' || !Array.isArray(config.checks) || !config.checks.length) throw new Error('INTEGRATION_CHECKS_INVALID')
  for (const check of config.checks) {
    if (typeof check.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(check.id) || ids.has(check.id) ||
        !Array.isArray(check.argv) || !check.argv.length || check.argv.some(arg => typeof arg !== 'string' || !arg || /[\r\n\0]/.test(arg))) {
      throw new Error('INTEGRATION_CHECKS_INVALID')
    }
    ids.add(check.id)
  }
  return config.checks
}

export function integrateStory(root, storyId, generation, canonicalInput) {
  let locations, lock, token, scratchParent, scratch, logs = [], owned = false
  try {
    if (!/^\d+\.\d+$/.test(storyId ?? '') || !Number.isSafeInteger(generation) || generation < 1 ||
        typeof canonicalInput !== 'string' || !canonicalInput) return failure('INVALID', 'INTEGRATION_USAGE')
    root = path.resolve(root)
    const canonical = path.resolve(canonicalInput), loaded = checkLeadGeneration(root, storyId, generation)
    if (loaded.status !== 'READY') return loaded
    locations = registryPaths(root, storyId)
    if (comparableWorktree(registryPaths(canonical).common) !== comparableWorktree(locations.common)) return failure('BLOCKED', 'WRONG_REPOSITORY')
    if (!cleanMain(canonical)) return failure('BLOCKED', 'CANONICAL_NOT_CLEAN')
    const branch = output(root, ['branch', '--show-current']), storyHead = output(root, ['rev-parse', 'HEAD'])
    if (!branch || branch === 'main' || branch !== loaded.record.branch) return failure('STALE', 'STORY_BRANCH_MOVED')
    const plan = frontmatter(readFileSync(path.join(root, `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`), 'utf8'))
    if (plan.lifecycle_snapshot !== 'done') return failure('BLOCKED', 'STORY_NOT_DONE')
    const completion = inspectCompletion(root, storyId, storyHead)
    if (completion.status !== 'READY') return { status: completion.status, reasons: completion.reasons }
    const checks = loadIntegrationChecks(canonical), base = output(canonical, ['rev-parse', 'refs/heads/main'])
    mkdirSync(locations.directory, { recursive: true })
    lock = path.join(locations.directory, 'integration.lock')
    token = JSON.stringify({ storyId, generation, token: randomUUID() }) + '\n'
    try { writeFileSync(lock, token, { flag: 'wx' }); owned = true }
    catch (error) { if (error.code === 'EEXIST') return failure('CONFLICT', 'INTEGRATION_BUSY'); throw error }
    const attempts = path.join(locations.directory, 'integration'), logDirectory = path.join(attempts, `${storyId}-${randomUUID()}`)
    mkdirSync(logDirectory, { recursive: true })
    const marker = path.join(attempts, `${storyId}.json`)
    const mark = (status, extra = {}) => {
      const temporary = `${marker}.${randomUUID()}.tmp`
      writeFileSync(temporary, JSON.stringify({ storyId, generation, status, base, logs, ...extra }) + '\n', { flag: 'wx' })
      renameSync(temporary, marker)
    }
    const blocked = result => {
      mark(result.reasons[0] === 'MERGE_CONFLICT' ? 'MERGE_CONFLICT' : 'BLOCKED', { reasons: result.reasons, paths: result.paths ?? [] })
      const heartbeat = heartbeatStory(root, storyId, generation, 'BLOCKED')
      return heartbeat.status === 'APPLIED' ? result : { ...heartbeat, integrationResult: result }
    }
    const heartbeat = heartbeatStory(root, storyId, generation, 'INTEGRATING')
    if (heartbeat.status !== 'APPLIED') return heartbeat
    mark('INTEGRATING')
    scratchParent = mkdtempSync(path.join(tmpdir(), 'integrate-story-'))
    scratch = path.join(scratchParent, 'scratch')
    git(root, ['worktree', 'add', '--detach', scratch, base])
    const merge = git(scratch, ['merge', '--no-ff', branch, '-m', `merge(story-${storyId}): integrate`], false)
    writeFileSync(path.join(logDirectory, 'merge.log'), (merge.stdout ?? '') + (merge.stderr ?? ''))
    if (merge.error || merge.status !== 0) {
      const paths = output(scratch, ['diff', '--name-only', '--diff-filter=U', '-z']).split('\0').filter(Boolean).sort()
      if (existsSync(path.join(output(scratch, ['rev-parse', '--absolute-git-dir']), 'MERGE_HEAD'))) git(scratch, ['merge', '--abort'])
      return blocked(failure('BLOCKED', 'MERGE_CONFLICT', { paths, logDirectory }))
    }
    const mergeCommit = output(scratch, ['rev-parse', 'HEAD'])
    for (const check of checks) {
      const argv = check.argv.map(arg => arg.replaceAll('<story-id>', storyId).replaceAll('<merge-head>', mergeCommit))
      const executable = argv[0] === 'node' ? process.execPath : argv[0]
      const result = spawnSync(executable, argv.slice(1), { cwd: scratch, encoding: 'utf8', windowsHide: true,
        shell: process.platform === 'win32' && executable === 'npm', timeout: 1800000, maxBuffer: 64 * 1024 * 1024 })
      const logPath = path.join(logDirectory, `${check.id}.log`)
      writeFileSync(logPath, (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.message}` : ''))
      logs.push({ id: check.id, argv, exitCode: result.status, path: logPath })
      if (result.error || result.status !== 0) return blocked(failure('BLOCKED', 'INTEGRATION_CHECK_FAILED', { logs }))
    }
    if (output(scratch, ['rev-parse', 'HEAD']) !== mergeCommit || output(scratch, ['status', '--porcelain']) !== '') {
      return blocked(failure('BLOCKED', 'INTEGRATION_CHECK_DIRTY', { logs }))
    }
    const mergedCompletion = inspectCompletion(scratch, storyId, mergeCommit)
    if (mergedCompletion.status !== 'READY') return blocked({ status: mergedCompletion.status, reasons: mergedCompletion.reasons, logs })
    const fence = checkLeadGeneration(root, storyId, generation)
    if (fence.status !== 'READY') return fence
    if (output(root, ['rev-parse', 'HEAD']) !== storyHead || output(root, ['branch', '--show-current']) !== branch) return blocked(failure('STALE', 'STORY_BRANCH_MOVED', { logs }))
    if (output(canonical, ['rev-parse', 'refs/heads/main']) !== base) return blocked(failure('STALE', 'MAIN_MOVED', { logs }))
    if (!cleanMain(canonical)) return blocked(failure('BLOCKED', 'CANONICAL_NOT_CLEAN', { logs }))
    const advanced = git(canonical, ['merge', '--ff-only', mergeCommit], false)
    if (advanced.error || advanced.status !== 0) return blocked(failure('STALE', 'MAIN_MOVED', { logs }))
    mark('MERGED', { mergeCommit })
    const released = releaseStory(root, storyId, generation, 'merged')
    if (released.status !== 'APPLIED') return { ...released, mainChanged: true, mergeCommit, logs }
    return { status: 'APPLIED', reasons: [], storyId, base, mergeCommit, logs }
  } catch (error) { return failure('ERROR', error.message, { logs }) }
  finally {
    try {
      if (scratch && existsSync(scratch)) git(root, ['worktree', 'remove', '--force', scratch])
      if (scratchParent) rmSync(scratchParent, { recursive: true, force: true })
    } finally { if (owned && existsSync(lock) && readFileSync(lock, 'utf8') === token) unlinkSync(lock) }
  }
}

function main(argv) {
  const [command, storyId, ...tail] = argv, options = {}
  if (command !== 'integrate' || tail.length !== 4) return failure('INVALID', 'INTEGRATION_USAGE')
  for (let i = 0; i < tail.length; i += 2) {
    if (!['--generation', '--canonical'].includes(tail[i]) || options[tail[i]] !== undefined || !tail[i + 1]) return failure('INVALID', 'INTEGRATION_USAGE')
    options[tail[i]] = tail[i + 1]
  }
  if (!/^[1-9]\d*$/.test(options['--generation'] ?? '')) return failure('INVALID', 'INTEGRATION_USAGE')
  return integrateStory(path.resolve(output(process.cwd(), ['rev-parse', '--show-toplevel'])), storyId,
    Number(options['--generation']), options['--canonical'])
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let result
  try { result = main(process.argv.slice(2)) } catch (error) { result = failure('ERROR', error.message) }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exitCode = { APPLIED: 0, READY: 0, STALE: 2, BLOCKED: 3, CONFLICT: 3, INVALID: 4, ERROR: 5 }[result.status] ?? 5
}
