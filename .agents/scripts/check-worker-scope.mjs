import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Mechanical V3 worker scope gate: every path changed since the dispatch base must
// fall inside the contract's allowed scope. It never accepts work; PASS only means
// no out-of-scope path was observed and Lead review still decides.

const SCHEMA = 'worker-scope-v1'
const EXIT = { PASS: 0, FAIL: 1, INVALID: 4, ERROR: 5 }
const SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const CONTRACT_PATH = '.orca-contract/contract.md'
const MAX_OUTPUT = 64 * 1024 * 1024
const USAGE = 'USAGE: check --worktree <path> --base <sha> --allow <path|dir/> [--allow ...] [--contract-sha256 <hex>] [--forbid-commits]'

function git(root, args) {
  return spawnSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: root, shell: false, windowsHide: true, maxBuffer: MAX_OUTPUT, timeout: 120000, encoding: 'utf8'
  })
}

function requiredGit(root, args, reason) {
  const result = git(root, args)
  if (result.error || result.status !== 0) throw new ScopeError(reason)
  return result.stdout
}

class ScopeError extends Error {}

function nulList(text) {
  return text.split('\0').filter(Boolean)
}

// Allowed entries are repo-relative: an exact file, or a directory ending in '/'.
export function normalizeAllowed(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) return null
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return null
  const isDir = value.endsWith('/')
  const normalized = path.posix.normalize(value)
  if (normalized === '.' || normalized === './' || normalized.split('/').includes('..')) return null
  return isDir ? normalized.replace(/\/?$/, '/') : normalized
}

export function isAllowed(file, allowed) {
  return allowed.some(entry => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))
}

function changedPaths(root, base) {
  const entries = new Map()
  const add = (file, source) => {
    if (!entries.has(file)) entries.set(file, new Set())
    entries.get(file).add(source)
  }
  // Base vs working tree covers worker commits, staged and unstaged tracked edits.
  // --no-renames reports both sides of a rename, so moving a file out of scope fails.
  const tracked = nulList(requiredGit(root, ['diff', '--name-status', '-z', '--no-renames', base], 'GIT_DIFF_FAILED'))
  for (let index = 0; index + 1 < tracked.length; index += 2) {
    add(tracked[index + 1], tracked[index].startsWith('D') ? 'deleted' : 'tracked')
  }
  for (const file of nulList(requiredGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], 'GIT_UNTRACKED_FAILED'))) {
    add(file, 'untracked')
  }
  return [...entries].map(([file, sources]) => ({ path: file, sources: [...sources].sort() }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

function contractDigest(root) {
  const file = path.join(root, CONTRACT_PATH)
  if (!existsSync(file)) return null
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function inspectScope(worktree, base, allowedInput, options = {}) {
  const result = {
    schema: SCHEMA, status: 'ERROR', worktree, base, head: null, commitsSinceBase: null,
    allowed: [], changed: [], violations: [], reasons: [], limitations: ['gitignored paths are not inspected']
  }
  const allowed = allowedInput.map(normalizeAllowed)
  if (!SHA.test(base ?? '') || !allowed.length || allowed.includes(null) ||
      (options.contractSha256 != null && !SHA256.test(options.contractSha256))) {
    result.status = 'INVALID'
    result.reasons.push(USAGE)
    return result
  }
  result.allowed = [...new Set(allowed)].sort()
  try {
    const top = git(worktree, ['rev-parse', '--show-toplevel'])
    if (top.error || top.status !== 0) throw new ScopeError('NOT_A_GIT_WORKTREE')
    const root = path.resolve(top.stdout.trim())
    requiredGit(root, ['cat-file', '-e', `${base}^{commit}`], 'BASE_COMMIT_MISSING')
    result.head = requiredGit(root, ['rev-parse', 'HEAD'], 'HEAD_UNAVAILABLE').trim()
    const ancestor = git(root, ['merge-base', '--is-ancestor', base, 'HEAD'])
    if (ancestor.error || ancestor.status === null || ancestor.status > 1) throw new ScopeError('ANCESTRY_CHECK_FAILED')
    if (ancestor.status === 1) result.violations.push({ path: null, reason: 'HISTORY_REWRITTEN' })
    result.commitsSinceBase = Number(requiredGit(root, ['rev-list', '--count', `${base}..HEAD`], 'COMMIT_COUNT_FAILED').trim())
    if (options.forbidCommits && result.commitsSinceBase > 0) {
      result.violations.push({ path: null, reason: 'COMMITS_FORBIDDEN' })
    }
    result.changed = changedPaths(root, base)
    for (const entry of result.changed) {
      if (entry.path === CONTRACT_PATH && entry.sources.includes('untracked')) continue
      if (!isAllowed(entry.path, result.allowed)) {
        result.violations.push({ path: entry.path, reason: entry.sources.includes('deleted') ? 'OUT_OF_SCOPE_DELETE' : 'OUT_OF_SCOPE_CHANGE' })
      }
    }
    if (options.contractSha256 != null) {
      const digest = contractDigest(root)
      if (digest !== options.contractSha256) {
        result.violations.push({ path: CONTRACT_PATH, reason: digest === null ? 'CONTRACT_MISSING' : 'CONTRACT_MODIFIED' })
      }
    }
    result.status = result.violations.length ? 'FAIL' : 'PASS'
  } catch (error) {
    if (!(error instanceof ScopeError)) throw error
    result.status = 'ERROR'
    result.reasons.push(error.message)
  }
  return result
}

export function parseArguments(argv) {
  const [verb, ...rest] = argv
  const parsed = { worktree: null, base: null, allowed: [], contractSha256: null, forbidCommits: false }
  if (verb !== 'check') return null
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index]
    if (flag === '--forbid-commits') {
      parsed.forbidCommits = true
      continue
    }
    const value = rest[++index]
    if (value === undefined) return null
    if (flag === '--worktree' && parsed.worktree === null) parsed.worktree = value
    else if (flag === '--base' && parsed.base === null) parsed.base = value
    else if (flag === '--allow') parsed.allowed.push(value)
    else if (flag === '--contract-sha256' && parsed.contractSha256 === null) parsed.contractSha256 = value
    else return null
  }
  return parsed.worktree && parsed.base ? parsed : null
}

function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (!parsed) {
    return { schema: SCHEMA, status: 'INVALID', violations: [], reasons: [USAGE] }
  }
  return inspectScope(path.resolve(parsed.worktree), parsed.base, parsed.allowed, {
    contractSha256: parsed.contractSha256, forbidCommits: parsed.forbidCommits
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let result
  try {
    result = main()
  } catch {
    result = { schema: SCHEMA, status: 'ERROR', violations: [], reasons: ['UNEXPECTED_FAILURE'] }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = EXIT[result.status]
}
