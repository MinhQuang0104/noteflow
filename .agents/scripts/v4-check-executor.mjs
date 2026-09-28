import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { recordCheckFinished } from './v4-observations.mjs'

const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 120_000
const EXCERPT_BYTES = 2 * 1024
const CLASSIFICATIONS = new Set(['behavioral', 'static', 'contract', 'map'])
const TRUSTED_SOURCES = new Set(['recipe', 'focused-manifest'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function digestValue(value) {
  return digest(stableJson(value))
}

function normalizedRoot(root) {
  try { return realpathSync(path.resolve(root)) } catch { return path.resolve(root) }
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function canonicalRelative(value, reason = 'UNSAFE_PATH') {
  if (typeof value !== 'string' || !value || value.includes('\0') ||
      path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) throw new Error(reason)
  const slash = value.replaceAll('\\', '/')
  const normalized = path.posix.normalize(slash)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) throw new Error(reason)
  return normalized.replace(/^\.\//, '')
}

function safePath(root, value, { allowParentNormalization = false } = {}) {
  if (typeof value !== 'string' || !value || value.includes('\0') ||
      path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) throw new Error('UNSAFE_PATH')
  if (!allowParentNormalization) canonicalRelative(value)
  const resolved = path.resolve(root, value)
  if (!inside(root, resolved) || (!allowParentNormalization && resolved === root && value !== '.' && value !== './')) throw new Error('UNSAFE_PATH')
  if (existsSync(resolved)) {
    if (lstatSync(resolved).isSymbolicLink()) throw new Error('SYMLINK_PATH')
    if (!inside(root, realpathSync(resolved))) throw new Error('UNSAFE_PATH')
  }
  return resolved
}

function pathList(value) {
  if (!Array.isArray(value)) throw new Error('SUBJECT_PATHS_REQUIRED')
  const paths = value.map(item => typeof item === 'string' ? item : item?.path)
  if (paths.some(item => typeof item !== 'string')) throw new Error('SUBJECT_PATHS_INVALID')
  return [...new Set(paths.map(item => canonicalRelative(item)))].sort()
}

function fileEntry(root, relative) {
  const file = safePath(root, relative)
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error('SUBJECT_PATH_MISSING')
  const bytes = readFileSync(file)
  return {
    path: relative,
    type: 'file',
    mode: statSync(file).mode & 0o777,
    bytes: bytes.byteLength,
    digest: digestBytes(bytes),
  }
}

export function captureWorktreeSubject(root, paths) {
  root = normalizedRoot(root)
  const canonical = pathList(paths)
  const entries = canonical.map(relative => fileEntry(root, relative))
  return {
    kind: 'worktree',
    paths: entries,
    manifest_digest: digestValue(entries),
  }
}

function validateSubject(root, subject) {
  if (!isObject(subject) || typeof subject.kind !== 'string') throw new Error('SUBJECT_IDENTITY_REQUIRED')
  if (subject.kind === 'commit' || subject.kind === 'tree') {
    if (!SHA.test(subject.value ?? '')) throw new Error('SUBJECT_IDENTITY_INVALID')
    return subject
  }
  if (subject.kind === 'worktree') {
    if (!DIGEST.test(subject.manifest_digest ?? '')) throw new Error('SUBJECT_IDENTITY_INVALID')
    const paths = pathList(subject.paths)
    if (paths.length !== subject.paths.length || subject.paths.some(item => item.path === undefined)) throw new Error('SUBJECT_PATHS_INVALID')
    return { ...subject, paths: subject.paths.map(item => ({ ...item })) }
  }
  throw new Error('SUBJECT_KIND_INVALID')
}

function nodeVersion() {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(process.version)
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value ?? '')
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null
}

function supportsVersionRange(version, range) {
  if (range === undefined || range === null) return true
  const match = /^>=([0-9]+)\.([0-9]+)\.([0-9]+)\s+<([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?$/.exec(range)
  if (!match) return false
  const current = typeof version === 'string' ? parseVersion(version) : version
  if (!current) return false
  const lower = [Number(match[1]), Number(match[2]), Number(match[3])]
  const upper = [Number(match[4]), Number(match[5] ?? 0), Number(match[6] ?? 0)]
  const compare = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
  return compare([current.major, current.minor, current.patch], lower) >= 0 &&
    compare([current.major, current.minor, current.patch], upper) < 0
}

function supportsNodeRange(range) {
  return supportsVersionRange(nodeVersion(), range)
}

function npmVersion() {
  const agentVersion = /npm\/(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent ?? '')?.[1]
  if (agentVersion) return agentVersion
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 })
  return result.status === 0 ? result.stdout.trim() : null
}

function redacted(value) {
  return value
    .replace(/(authorization|password|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, '$1=<redacted>')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1<redacted>')
}

function excerpt(output) {
  const safe = redacted(output || '').trim() || 'No output'
  return Buffer.from(safe, 'utf8').subarray(0, EXCERPT_BYTES).toString('utf8')
}

function forbiddenCommand(argv) {
  const joined = argv.join(' ').toLowerCase()
  if (argv[0] === 'npm' && argv[1] !== 'run') return 'UNSAFE_COMMAND'
  if (/\b(?:npm\s+(?:ci|install|uninstall|publish|exec)|git\s+(?:reset|clean|checkout|push|commit)|(?:rm|del|format|deploy)\b)/i.test(joined)) {
    return 'UNSAFE_COMMAND'
  }
  return null
}

function toolchain(range) {
  return {
    node_version: process.version,
    executable: process.execPath,
    platform: process.platform,
    arch: process.arch,
    supported_node_range: range ?? null,
    npm_version: null,
    supported_npm_range: null,
  }
}

function baseEvidence(spec, subject, environment, commandDigest = null) {
  return {
    schema_version: 1,
    check_id: spec?.id ?? null,
    classification: spec?.classification ?? null,
    required: spec?.required !== false,
    status: 'ERROR',
    exit_code: null,
    signal: null,
    duration_ms: 0,
    command_digest: commandDigest,
    output_digest: null,
    diagnostic_excerpt: 'No output',
    subject: subject ?? null,
    environment,
    toolchain: toolchain(spec?.supported_node_range),
    input_bindings: {
      referenced_paths: Array.isArray(spec?.referenced_paths) ? [...spec.referenced_paths] : [],
      source: spec?.source ?? null,
    },
    provenance: {
      executor: 'v4-check-executor',
      process_adapter: 'spawnSync',
      shell: false,
    },
    reasons: [],
  }
}

function errorEvidence(spec, subject, reason, extra = {}) {
  const environment = spec?.environment_identity
    ? { status: 'KNOWN', ...stableValue(spec.environment_identity) }
    : { status: 'UNKNOWN', reason: 'not_supplied' }
  const evidence = baseEvidence(spec, subject, environment)
  evidence.reasons = [reason]
  return { ...evidence, ...extra }
}

function validateSpec(root, spec, subject) {
  if (!isObject(spec) || typeof spec.id !== 'string' || !spec.id || spec.id.length > 256) throw new Error('CHECK_SPEC_INVALID')
  if (!Array.isArray(spec.argv) || !spec.argv.length || spec.argv.some(arg => typeof arg !== 'string' || !arg)) throw new Error('ARGV_INVALID')
  if (spec.shell !== undefined) throw new Error('SHELL_NOT_ALLOWED')
  if (!CLASSIFICATIONS.has(spec.classification)) throw new Error('CLASSIFICATION_INVALID')
  if (spec.required !== undefined && typeof spec.required !== 'boolean') throw new Error('REQUIRED_INVALID')
  if (!isObject(spec.source) || !TRUSTED_SOURCES.has(spec.source.kind)) throw new Error('UNTRUSTED_CHECK_SOURCE')
  if (spec.source.path !== undefined) canonicalRelative(spec.source.path)
  const forbidden = forbiddenCommand(spec.argv)
  if (forbidden) throw new Error(forbidden)
  let cwd
  try { cwd = safePath(root, spec.cwd ?? '.', { allowParentNormalization: true }) } catch { throw new Error('UNSAFE_CWD') }
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error('UNSAFE_CWD')
  const referencedPaths = (spec.referenced_paths ?? []).map(relative => {
    canonicalRelative(relative)
    safePath(root, relative)
    return canonicalRelative(relative)
  })
  if (new Set(referencedPaths).size !== referencedPaths.length) throw new Error('REFERENCED_PATHS_DUPLICATE')
  const timeout = spec.timeout_ms ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT_MS) throw new Error('TIMEOUT_INVALID')
  const outputCap = spec.output_cap_bytes ?? MAX_OUTPUT_BYTES
  if (!Number.isSafeInteger(outputCap) || outputCap <= 0 || outputCap > MAX_OUTPUT_BYTES) throw new Error('OUTPUT_CAP_INVALID')
  if (!supportsNodeRange(spec.supported_node_range)) throw new Error('UNSUPPORTED_NODE_VERSION')
  let npmVersionValue = null
  if (spec.supported_npm_range !== undefined || spec.argv[0] === 'npm') {
    npmVersionValue = npmVersion()
    if (!supportsVersionRange(npmVersionValue, spec.supported_npm_range)) throw new Error('UNSUPPORTED_NPM_VERSION')
  }
  const validatedSubject = validateSubject(root, subject)
  return { cwd, referencedPaths, timeout, outputCap, subject: validatedSubject, npmVersionValue }
}

function executable(argv) {
  let file = argv[0]
  let args = argv.slice(1)
  if (file === 'node') file = process.execPath
  if (file === 'npm' && process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (!existsSync(npmCli)) throw new Error('NPM_CLI_UNAVAILABLE')
    file = process.execPath
    args = [npmCli, ...args]
  }
  return { file, args }
}

export function executeCheck(root, spec, subject) {
  root = normalizedRoot(root)
  let validated
  try {
    validated = validateSpec(root, spec, subject)
  } catch (error) {
    return errorEvidence(spec, subject, error.message)
  }
  const environment = spec.environment_identity
    ? { status: 'KNOWN', ...stableValue(spec.environment_identity) }
    : { status: 'UNKNOWN', reason: 'not_supplied' }
  const commandDigest = digestValue({
    cwd: path.relative(root, validated.cwd).replaceAll('\\', '/') || '.',
    argv: spec.argv,
    environment,
    subject: validated.subject,
  })
  const evidence = baseEvidence(spec, validated.subject, environment, commandDigest)
  evidence.input_bindings.referenced_paths = validated.referencedPaths
  evidence.provenance.cwd = path.relative(root, validated.cwd).replaceAll('\\', '/') || '.'
  evidence.provenance.argv_digest = digestValue(spec.argv)
  evidence.toolchain.npm_version = validated.npmVersionValue
  evidence.toolchain.supported_npm_range = spec.supported_npm_range ?? null
  evidence.observed_at = new Date().toISOString()
  const started = Date.now()
  let processSpec
  try { processSpec = executable(spec.argv) } catch (error) {
    evidence.duration_ms = Date.now() - started
    evidence.reasons = [error.message]
    return evidence
  }
  let processResult
  try {
    processResult = spawnSync(processSpec.file, processSpec.args, {
      cwd: validated.cwd,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: validated.timeout,
      maxBuffer: validated.outputCap,
    })
  } catch (error) {
    evidence.duration_ms = Date.now() - started
    evidence.reasons = [error.message || 'PROCESS_LAUNCH_FAILED']
    return evidence
  }
  evidence.duration_ms = Date.now() - started
  const output = `${processResult.stdout || ''}\n${processResult.stderr || ''}`
  evidence.output_digest = digest(output)
  evidence.diagnostic_excerpt = excerpt(output)
  evidence.exit_code = Number.isInteger(processResult.status) ? processResult.status : null
  evidence.signal = processResult.signal ?? null
  if (processResult.error) {
    const reason = processResult.error.code === 'ETIMEDOUT' || processResult.signal
      ? 'TIMEOUT'
      : processResult.error.code === 'ENOENT' ? 'PROCESS_LAUNCH_FAILED' : 'PROCESS_EXECUTION_ERROR'
    evidence.reasons = [reason]
    return evidence
  }
  if (processResult.status === 0) {
    evidence.status = 'PASS'
    evidence.reasons = []
  } else {
    evidence.status = 'FAIL'
    evidence.reasons = ['NONZERO_EXIT']
  }
  evidence.observation = recordCheckFinished(root, {
    story_id: spec.story_id ?? null,
    slice_id: spec.slice_id ?? null,
    action: spec.action ?? 'verify_slice',
    invocation_id: spec.invocation_id ?? null,
    session_id: spec.session_id ?? null,
    attempt_id: spec.attempt_id ?? evidence.command_digest,
    payload: {
      check_id: evidence.check_id,
      status: evidence.status,
      exit_code: evidence.exit_code,
      subject: evidence.subject,
      command_digest: evidence.command_digest,
      output_digest: evidence.output_digest,
      reasons: evidence.reasons,
    },
    provenance: { kind: 'check_executor', source: 'v4-check-executor', command_digest: evidence.command_digest },
  })
  return evidence
}

export function validateCheckEvidence(root, evidence) {
  const reasons = []
  if (!isObject(evidence) || evidence.schema_version !== 1 || typeof evidence.check_id !== 'string' ||
      !['PASS', 'FAIL', 'ERROR'].includes(evidence.status) ||
      typeof evidence.command_digest !== 'string' || !DIGEST.test(evidence.command_digest) ||
      typeof evidence.output_digest !== 'string' || !DIGEST.test(evidence.output_digest) ||
      !isObject(evidence.toolchain) || typeof evidence.toolchain.node_version !== 'string' ||
      !isObject(evidence.subject) || !isObject(evidence.provenance) || evidence.provenance.shell !== false ||
      (!Number.isInteger(evidence.exit_code) && evidence.exit_code !== null)) {
    reasons.push('PROVENANCE_MISSING')
  }
  if (!reasons.length && evidence.status === 'PASS' && evidence.exit_code !== 0) reasons.push('RESULT_IDENTITY_CONFLICT')
  if (!reasons.length && evidence.status === 'FAIL' && (!Number.isInteger(evidence.exit_code) || evidence.exit_code === 0)) reasons.push('RESULT_IDENTITY_CONFLICT')
  if (!reasons.length && evidence.subject.kind === 'worktree') {
    try {
      const current = captureWorktreeSubject(root, evidence.subject.paths)
      if (current.manifest_digest !== evidence.subject.manifest_digest) reasons.push('SUBJECT_DRIFT')
    } catch {
      reasons.push('SUBJECT_UNAVAILABLE')
    }
  }
  if (reasons.includes('SUBJECT_DRIFT') || reasons.includes('SUBJECT_UNAVAILABLE')) return { status: 'STALE', reasons }
  return { status: reasons.length ? 'INVALID' : 'VALID', reasons }
}
