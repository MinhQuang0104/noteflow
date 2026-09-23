import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

function finish(code, message) {
  const stream = code >= 2 ? process.stderr : process.stdout
  stream.write(`${message}\n`)
  process.exit(code)
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.code === 'ENOENT' ? 'git unavailable' : 'git command failed')
  }
  return result.stdout.trim()
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function safeAnchor(root, anchor) {
  if (typeof anchor !== 'string' || !anchor.trim() || /[\u0000-\u001f]/.test(anchor) ||
      anchor.includes('\\') || path.isAbsolute(anchor) || path.win32.isAbsolute(anchor) ||
      /^[A-Za-z]:/.test(anchor) || anchor.split('/').includes('..')) {
    return null
  }
  const resolved = path.resolve(root, anchor)
  return resolved !== root && inside(root, resolved) ? resolved : null
}

if (process.argv.length !== 4 || process.argv[2] !== 'check') {
  finish(3, 'ERROR usage: node .agents/scripts/check-feature-map.mjs check <feature-map-path>')
}

let root
try {
  root = realpathSync(git(['rev-parse', '--show-toplevel'], process.cwd()))
} catch {
  finish(3, 'ERROR cannot determine repository root')
}

const mapPath = path.resolve(root, process.argv[3])
if (!inside(root, mapPath)) finish(2, 'INVALID_MAP unsafe feature map path')
if (path.extname(mapPath) !== '.json') finish(2, 'INVALID_MAP feature map must be JSON')
if (!existsSync(mapPath)) finish(2, 'INVALID_MAP feature map not found')

let mapRealPath
let map
try {
  mapRealPath = realpathSync(mapPath)
  if (!inside(root, mapRealPath)) finish(2, 'INVALID_MAP unsafe feature map path')
  map = JSON.parse(readFileSync(mapPath, 'utf8'))
} catch (error) {
  if (error instanceof SyntaxError) finish(2, 'INVALID_MAP malformed JSON')
  finish(3, 'ERROR cannot read feature map')
}

if (map === null || typeof map !== 'object' || Array.isArray(map)) {
  finish(2, 'INVALID_MAP top-level value must be an object')
}
if (typeof map.id !== 'string' || !map.id.trim()) {
  finish(2, 'INVALID_MAP id must be a nonempty string')
}
if (map.anchor_blobs === null || typeof map.anchor_blobs !== 'object' ||
    Array.isArray(map.anchor_blobs) || Object.keys(map.anchor_blobs).length === 0) {
  finish(2, 'INVALID_MAP anchor_blobs must be a nonempty object')
}

const anchors = Object.keys(map.anchor_blobs).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
const checked = []
for (const anchor of anchors) {
  const resolved = safeAnchor(root, anchor)
  if (!resolved || resolved === mapPath) finish(2, `INVALID_MAP unsafe anchor path: ${anchor}`)
  if (!/^[0-9a-fA-F]{40}$/.test(map.anchor_blobs[anchor])) {
    finish(2, `INVALID_MAP invalid anchor hash: ${anchor}`)
  }
  checked.push({ anchor, resolved, expected: map.anchor_blobs[anchor].toLowerCase() })
}

const stale = []
for (const { anchor, resolved, expected } of checked) {
  try {
    const real = realpathSync(resolved)
    if (!inside(root, real) || real === mapRealPath) {
      finish(2, `INVALID_MAP unsafe anchor path: ${anchor}`)
    }
    if (!statSync(resolved).isFile()) finish(2, `INVALID_MAP anchor is not a file: ${anchor}`)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      stale.push(`MISSING ${anchor}`)
      continue
    }
    finish(3, `ERROR cannot inspect anchor: ${anchor}`)
  }
  try {
    if (git(['hash-object', '--', resolved], root).toLowerCase() !== expected) {
      stale.push(`MISMATCH ${anchor}`)
    }
  } catch {
    finish(3, `ERROR cannot hash anchor: ${anchor}`)
  }
}

finish(stale.length ? 1 : 0, stale.length ? `STALE\n${stale.join('\n')}` : 'VALID')
