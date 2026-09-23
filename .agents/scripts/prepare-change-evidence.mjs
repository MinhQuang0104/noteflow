import { spawnSync } from 'node:child_process'
import path from 'node:path'

const EXIT = { OK: 0, NO_CHANGE: 1, SPLIT_REQUIRED: 2, UNSUPPORTED: 3, INVALID_INPUT: 4, ERROR: 5 }
const MAX_OUTPUT = 64 * 1024 * 1024
const MAX_PATHS = 4
const MAX_HUNKS = 6
const MAX_LINES = 240
const decoder = new TextDecoder('utf-8', { fatal: true })

class ProducerFailure extends Error {
  constructor(status, reason) {
    super(reason)
    this.status = status
  }
}

function fail(status, reason) {
  throw new ProducerFailure(status, reason)
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = EXIT[result.status]
}

function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd, shell: false, windowsHide: true, maxBuffer: MAX_OUTPUT, timeout: 120000,
  })
  if (result.error || result.status === null || result.signal) fail('ERROR', 'git execution failed')
  let stdout
  try {
    stdout = decoder.decode(result.stdout)
  } catch {
    fail('UNSUPPORTED', 'git output is not UTF-8 text')
  }
  return { status: result.status, stdout }
}

function parseArgs(args) {
  const options = { paths: [] }
  const singleton = new Set(['--comparison', '--base', '--head'])
  const seen = new Set()
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]
    if (!['--comparison', '--base', '--head', '--path'].includes(flag) ||
        value === undefined || !value || value.startsWith('--') ||
        (singleton.has(flag) && seen.has(flag))) {
      fail('INVALID_INPUT', 'invalid arguments')
    }
    seen.add(flag)
    if (flag === '--path') options.paths.push(value)
    else options[flag.slice(2)] = value
  }
  if (!options.paths.length || !['working-tree-vs-HEAD', 'explicit-pair'].includes(options.comparison)) {
    fail('INVALID_INPUT', 'comparison and at least one path are required')
  }
  if (options.comparison === 'explicit-pair' ? !options.base || !options.head : options.base || options.head) {
    fail('INVALID_INPUT', 'invalid comparison refs')
  }
  return options
}

function canonical(input) {
  if (!input || /[\u0000-\u001f\u007f]/.test(input) || path.isAbsolute(input) ||
      path.win32.isAbsolute(input) || /^[A-Za-z]:/.test(input) ||
      /[\*?\[\]!:]/.test(input)) fail('INVALID_INPUT', 'invalid path')
  const slash = input.replaceAll('\\', '/')
  const normalized = path.posix.normalize(slash)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') ||
      normalized.startsWith('/') || normalized.endsWith('/')) fail('INVALID_INPUT', 'invalid path')
  return normalized.replace(/^\.\//, '')
}

function resolveRef(ref, root) {
  if (!ref || /[\u0000-\u001f\u007f]/.test(ref) || ref.startsWith('-')) {
    fail('INVALID_INPUT', 'invalid ref')
  }
  const result = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], root)
  const oid = result.stdout.trim()
  if (result.status !== 0 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) {
    fail('INVALID_INPUT', 'invalid ref')
  }
  return oid
}

function trackedInWorkingComparison(root, oid, file) {
  const index = git(['--literal-pathspecs', 'ls-files', '-z', '--', file], root)
  if (index.status !== 0) fail('ERROR', 'git index check failed')
  if (index.stdout.split('\0').includes(file)) return true
  const committed = git(['cat-file', '-e', `${oid}:${file}`], root)
  if (committed.status === 0) return true
  if (committed.status === 1 || committed.status === 128) return false
  fail('ERROR', 'git object check failed')
}

function parsePatch(patch, file) {
  if (!patch) fail('NO_CHANGE', `no reviewable hunk: ${file}`)
  const lines = patch.endsWith('\n') ? patch.slice(0, -1).split('\n') : patch.split('\n')
  const hunks = []
  let current = null
  let oldSeen = 0
  let newSeen = 0
  let sawFileHeader = false
  let sawOldName = false
  let sawNewName = false
  let sawHunk = false

  function finishHunk() {
    if (!current) return
    if (oldSeen !== current.oldLines || newSeen !== current.newLines) {
      fail('UNSUPPORTED', `inconsistent hunk: ${file}`)
    }
    current.diffText = current.diffText.join('\n')
    hunks.push(current)
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (sawFileHeader || sawHunk) fail('UNSUPPORTED', `multiple patches: ${file}`)
      sawFileHeader = true
      continue
    }
    if (!sawFileHeader) fail('UNSUPPORTED', `unexpected patch: ${file}`)
    if (line.startsWith('@@ ')) {
      if (!sawOldName || !sawNewName) fail('UNSUPPORTED', `missing file headers: ${file}`)
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(line)
      if (!match) fail('UNSUPPORTED', `invalid hunk header: ${file}`)
      finishHunk()
      current = {
        oldStart: Number(match[1]), oldLines: Number(match[2] ?? 1),
        newStart: Number(match[3]), newLines: Number(match[4] ?? 1),
        diffText: [line],
      }
      if (![current.oldStart, current.oldLines, current.newStart, current.newLines].every(Number.isSafeInteger)) {
        fail('UNSUPPORTED', `invalid hunk range: ${file}`)
      }
      oldSeen = 0
      newSeen = 0
      sawHunk = true
      continue
    }
    if (current) {
      if (line === '\\ No newline at end of file') {
        if (current.diffText.length < 2) fail('UNSUPPORTED', `invalid newline marker: ${file}`)
      } else if (line.startsWith(' ')) {
        oldSeen++
        newSeen++
      } else if (line.startsWith('-')) {
        oldSeen++
      } else if (line.startsWith('+')) {
        newSeen++
      } else {
        fail('UNSUPPORTED', `unexpected hunk line: ${file}`)
      }
      current.diffText.push(line)
      continue
    }
    if (line.startsWith('index ') || /^new file mode 100(?:644|755)$/.test(line) ||
        /^deleted file mode 100(?:644|755)$/.test(line)) continue
    if (line.startsWith('--- ')) {
      if (sawOldName || sawNewName) fail('UNSUPPORTED', `invalid file headers: ${file}`)
      sawOldName = true
      continue
    }
    if (line.startsWith('+++ ')) {
      if (!sawOldName || sawNewName) fail('UNSUPPORTED', `invalid file headers: ${file}`)
      sawNewName = true
      continue
    }
    fail('UNSUPPORTED', `non-reviewable patch: ${file}`)
  }
  finishHunk()
  if (!hunks.length) fail('UNSUPPORTED', `non-reviewable patch: ${file}`)
  return hunks
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const paths = [...new Set(options.paths.map(canonical))].sort()
  if (paths.length > MAX_PATHS) fail('SPLIT_REQUIRED', 'more than 4 paths')
  const rootResult = git(['rev-parse', '--show-toplevel'], process.cwd())
  if (rootResult.status !== 0 || !rootResult.stdout.trim()) fail('ERROR', 'repository root unavailable')
  const root = rootResult.stdout.trim()
  const base = resolveRef(options.comparison === 'explicit-pair' ? options.base : 'HEAD', root)
  const head = options.comparison === 'explicit-pair' ? resolveRef(options.head, root) : 'working-tree'
  const comparisonArgs = options.comparison === 'explicit-pair' ? [base, head] : [base]
  const evidencePaths = []
  let totalLines = 0
  for (const file of paths) {
    if (options.comparison === 'working-tree-vs-HEAD' && !trackedInWorkingComparison(root, base, file)) {
      fail('UNSUPPORTED', `untracked path: ${file}`)
    }
    const result = git([
      '--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-renames',
      '--no-color', '--no-relative', '--no-indent-heuristic', '--diff-algorithm=myers',
      '--unified=3', '--src-prefix=a/', '--dst-prefix=b/',
      ...comparisonArgs, '--', file,
    ], root)
    if (result.status !== 0) fail('ERROR', `git diff failed: ${file}`)
    const hunks = parsePatch(result.stdout, file)
    if (hunks.length > MAX_HUNKS) fail('SPLIT_REQUIRED', `more than 6 hunks: ${file}`)
    totalLines += hunks.reduce((sum, hunk) => sum + hunk.diffText.split('\n').length, 0)
    if (totalLines > MAX_LINES) fail('SPLIT_REQUIRED', 'more than 240 diff lines')
    evidencePaths.push({ path: file, hunks })
  }
  return {
    status: 'OK',
    changeEvidence: {
      provenance: { producer: 'prepare-change-evidence-v1', comparison: options.comparison, base, head },
      paths: evidencePaths,
    },
  }
}

try {
  emit(main())
} catch (error) {
  if (error instanceof ProducerFailure) emit({ status: error.status, reason: error.message })
  else emit({ status: 'ERROR', reason: 'unexpected producer failure' })
}
