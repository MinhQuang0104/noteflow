import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXIT = { OK: 0, NO_CHANGE: 1, SPLIT_REQUIRED: 2, UNSUPPORTED: 3, INVALID_INPUT: 4, ERROR: 5 }
const MAX_OUTPUT = 64 * 1024 * 1024
const MAX_INLINE_PATHS = 4
const MAX_EVIDENCE_SET_PATHS = 16
const MAX_HUNKS = 6
const MAX_LINES = 240
const decoder = new TextDecoder('utf-8', { fatal: true })
const SET_SCHEMA = 'change-evidence-set-v1'

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

function untrackedFile(root, file) {
  const absolute = path.resolve(root, file)
  let stat
  let real
  try {
    stat = lstatSync(absolute)
    real = realpathSync(absolute)
  } catch (error) {
    if (error.code === 'ENOENT') fail('UNSUPPORTED', `untracked path: ${file}`)
    fail('ERROR', `working-tree file check failed: ${file}`)
  }
  const relative = path.relative(root, real)
  if (!stat.isFile() || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('UNSUPPORTED', `unsupported working-tree path: ${file}`)
  }
  return { absolute, empty: stat.size === 0 }
}

function parsePatch(patch, file, allowEmptyAddition = false) {
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
  let sawNewFileMode = false

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
    if (/^new file mode 100(?:644|755)$/.test(line)) {
      sawNewFileMode = true
      continue
    }
    if (line.startsWith('index ') || /^deleted file mode 100(?:644|755)$/.test(line)) continue
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
  if (!hunks.length && allowEmptyAddition && sawFileHeader && sawNewFileMode && !sawOldName && !sawNewName) {
    return hunks
  }
  if (!hunks.length) fail('UNSUPPORTED', `non-reviewable patch: ${file}`)
  return hunks
}

function digest(source) {
  return createHash('sha256').update(JSON.stringify(source), 'utf8').digest('hex')
}

function recordsFor(hunk) {
  const [header, ...lines] = hunk.diffText.split('\n')
  const records = []
  for (const line of lines) {
    if (line === '\\ No newline at end of file') {
      if (!records.length || records.at(-1).length !== 1) fail('ERROR', 'orphan newline marker')
      records.at(-1).push(line)
    } else records.push([line])
  }
  return { header, records }
}

function consumption(records) {
  let oldLines = 0
  let newLines = 0
  for (const record of records) {
    const prefix = record[0][0]
    if (prefix === ' ' || prefix === '-') oldLines++
    if (prefix === ' ' || prefix === '+') newLines++
  }
  return { oldLines, newLines }
}

function partition(records) {
  const chunks = []
  let chunk = []
  let lineCount = 0
  for (const record of records) {
    if (lineCount + record.length > MAX_LINES - 1 && chunk.length) {
      chunks.push(chunk)
      chunk = []
      lineCount = 0
    }
    if (record.length > MAX_LINES - 1) fail('ERROR', 'diff record exceeds unit budget')
    chunk.push(record)
    lineCount += record.length
  }
  if (chunk.length) chunks.push(chunk)
  return chunks
}

function makeEvidenceSet(provenance, requestedPaths, paths) {
  const source = { schema: SET_SCHEMA, provenance, requestedPaths, paths }
  const sourceDigest = digest(source)
  const metadata = []
  const units = []
  for (const entry of paths) {
    const pathMeta = { path: entry.path, ...(entry.changeType ? { changeType: entry.changeType } : {}), hunks: [] }
    entry.hunks.forEach((hunk, hunkIndex) => {
      const { header, records } = recordsFor(hunk)
      pathMeta.hunks.push({ header, oldStart: hunk.oldStart, oldLines: hunk.oldLines,
        newStart: hunk.newStart, newLines: hunk.newLines, bodyLineCount: records.flat().length })
      const chunks = partition(records)
      let start = 0
      chunks.forEach((chunk, hunkUnitIndex) => {
        const body = chunk.flat()
        units.push({ evidenceSetDigest: sourceDigest, path: entry.path,
          ...(entry.changeType ? { changeType: entry.changeType } : {}), hunkIndex,
          originalOldStart: hunk.oldStart, originalOldLines: hunk.oldLines,
          originalNewStart: hunk.newStart, originalNewLines: hunk.newLines,
          unitIndex: units.length, hunkUnitIndex, hunkUnitCount: chunks.length,
          bodyStart: start, bodyEnd: start + body.length, ...consumption(chunk),
          diffLineCount: 1 + body.length, bodyText: body.join('\n') })
        start += body.length
      })
    })
    metadata.push(pathMeta)
  }
  const set = { schema: SET_SCHEMA, provenance, requestedPaths, sourceDigest,
    unitCount: units.length, paths: metadata, units }
  validateEvidenceSet(set)
  return set
}

export function validateEvidenceSet(set) {
  const invalid = () => { throw new Error('invalid or incomplete evidence set') }
  const validPath = value => {
    try { return typeof value === 'string' && canonical(value) === value } catch { return false }
  }
  const provenanceValid = set?.provenance && typeof set.provenance === 'object' &&
    set.provenance.producer === 'prepare-change-evidence-v1' &&
    ['working-tree-vs-HEAD', 'explicit-pair'].includes(set.provenance.comparison) &&
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(set.provenance.base ?? '') &&
    (set.provenance.comparison === 'explicit-pair'
      ? /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(set.provenance.head ?? '')
      : set.provenance.head === 'working-tree')
  const requestedPaths = set?.requestedPaths
  const orderedPaths = set?.paths?.map(item => item?.path)
  if (set?.schema !== SET_SCHEMA || !Array.isArray(set.requestedPaths) ||
      !Array.isArray(set.paths) || !Array.isArray(set.units) ||
      !provenanceValid || set.unitCount !== set.units.length || !Number.isSafeInteger(set.unitCount) || set.unitCount < 0 ||
      !/^[0-9a-f]{64}$/.test(set.sourceDigest ?? '') || requestedPaths.length < 1 ||
      requestedPaths.length > MAX_EVIDENCE_SET_PATHS || requestedPaths.some(pathValue => !validPath(pathValue)) ||
      new Set(requestedPaths).size !== requestedPaths.length ||
      JSON.stringify(requestedPaths) !== JSON.stringify([...requestedPaths].sort()) ||
      JSON.stringify(requestedPaths) !== JSON.stringify(orderedPaths) ||
      set.paths.some(entry => !entry || typeof entry !== 'object' || !Array.isArray(entry.hunks) ||
        (entry.changeType !== undefined && entry.changeType !== 'added'))) invalid()
  const reconstructed = []
  let nextUnit = 0
  for (const entry of set.paths) {
    const hunks = []
    for (const [hunkIndex, meta] of entry.hunks.entries()) {
      const related = []
      while (nextUnit < set.units.length && set.units[nextUnit].path === entry.path &&
             set.units[nextUnit].hunkIndex === hunkIndex) related.push(set.units[nextUnit++])
      if (!related.length) invalid()
      const lines = []
      for (const [hunkUnitIndex, unit] of related.entries()) {
        const body = unit.bodyText.split('\n')
        if (unit.evidenceSetDigest !== set.sourceDigest || unit.unitIndex !== nextUnit - related.length + hunkUnitIndex ||
            unit.hunkUnitIndex !== hunkUnitIndex || unit.hunkUnitCount !== related.length ||
            unit.changeType !== entry.changeType || unit.bodyStart !== lines.length ||
            unit.bodyEnd !== lines.length + body.length || unit.diffLineCount !== body.length + 1 ||
            unit.diffLineCount > MAX_LINES || unit.originalOldStart !== meta.oldStart ||
            unit.originalOldLines !== meta.oldLines || unit.originalNewStart !== meta.newStart ||
            unit.originalNewLines !== meta.newLines) invalid()
        const observed = consumption(body.filter(line => line !== '\\ No newline at end of file').map(line => [line]))
        if (unit.oldLines !== observed.oldLines || unit.newLines !== observed.newLines) invalid()
        lines.push(...body)
      }
      if (lines.length !== meta.bodyLineCount) invalid()
      const hunk = { oldStart: meta.oldStart, oldLines: meta.oldLines,
        newStart: meta.newStart, newLines: meta.newLines,
        diffText: [meta.header, ...lines].join('\n') }
      const parsed = parsePatch(`diff --git a/${entry.path} b/${entry.path}\n--- a/${entry.path}\n+++ b/${entry.path}\n${hunk.diffText}`, entry.path)
      if (parsed.length !== 1 || JSON.stringify(parsed[0]) !== JSON.stringify(hunk)) invalid()
      const canonicalChunks = partition(recordsFor(hunk).records)
      if (canonicalChunks.length !== related.length || canonicalChunks.some((chunk, i) =>
          chunk.flat().join('\n') !== related[i].bodyText)) invalid()
      hunks.push(hunk)
    }
    reconstructed.push(entry.changeType ? { path: entry.path, changeType: entry.changeType, hunks } : { path: entry.path, hunks })
  }
  if (nextUnit !== set.units.length || digest({ schema: SET_SCHEMA, provenance: set.provenance,
    requestedPaths: set.requestedPaths, paths: reconstructed }) !== set.sourceDigest) invalid()
  return true
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const requestedPaths = options.paths.map(canonical)
  if (new Set(requestedPaths).size !== requestedPaths.length) fail('INVALID_INPUT', 'duplicate path')
  const paths = [...requestedPaths].sort()
  if (paths.length > MAX_EVIDENCE_SET_PATHS) fail('SPLIT_REQUIRED', 'evidence set path limit: more than 16 paths')
  const rootResult = git(['rev-parse', '--show-toplevel'], process.cwd())
  if (rootResult.status !== 0 || !rootResult.stdout.trim()) fail('ERROR', 'repository root unavailable')
  const root = rootResult.stdout.trim()
  const base = resolveRef(options.comparison === 'explicit-pair' ? options.base : 'HEAD', root)
  const head = options.comparison === 'explicit-pair' ? resolveRef(options.head, root) : 'working-tree'
  const comparisonArgs = options.comparison === 'explicit-pair' ? [base, head] : [base]
  const evidencePaths = []
  let totalLines = 0
  for (const file of paths) {
    const added = options.comparison === 'working-tree-vs-HEAD' && !trackedInWorkingComparison(root, base, file)
    const addedFile = added ? untrackedFile(root, file) : null
    const result = git([
      '--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-renames',
      '--no-color', '--no-relative', '--no-indent-heuristic', '--diff-algorithm=myers',
      '--unified=3', '--src-prefix=a/', '--dst-prefix=b/',
      ...(added ? ['--no-index', '--', '/dev/null', addedFile.absolute] : [...comparisonArgs, '--', file]),
    ], root)
    if (result.status !== (added ? 1 : 0)) fail('ERROR', `git diff failed: ${file}`)
    const hunks = parsePatch(result.stdout, file, addedFile?.empty)
    totalLines += hunks.reduce((sum, hunk) => sum + hunk.diffText.split('\n').length, 0)
    evidencePaths.push(added ? { path: file, changeType: 'added', hunks } : { path: file, hunks })
  }
  const provenance = { producer: 'prepare-change-evidence-v1', comparison: options.comparison, base, head }
  const hasOversizedHunkGroup = evidencePaths.some(entry => entry.hunks.length > MAX_HUNKS)
  if (paths.length > MAX_INLINE_PATHS || totalLines > MAX_LINES || hasOversizedHunkGroup) {
    return { status: 'OK', changeEvidence: { evidenceSet: makeEvidenceSet(provenance, paths, evidencePaths) } }
  }
  return {
    status: 'OK',
    changeEvidence: {
      provenance,
      paths: evidencePaths,
    },
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    emit(main())
  } catch (error) {
    if (error instanceof ProducerFailure) emit({ status: error.status, reason: error.message })
    else emit({ status: 'ERROR', reason: 'unexpected producer failure' })
  }
}
