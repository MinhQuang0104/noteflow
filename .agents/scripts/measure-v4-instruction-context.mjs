import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA = /^[0-9a-f]{40,64}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/i
const ACTIONS = new Set(['implement_slice', 'verify_slice'])

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function safeRelative(value) {
  return typeof value === 'string' && value && !value.includes('\0') && !path.isAbsolute(value) && !path.win32.isAbsolute(value) && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
}

function git(root, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: root, encoding, windowsHide: true, timeout: 20_000, maxBuffer: 64 * 1024 * 1024 })
  return result
}

function revisionAvailable(root, revision) {
  if (!SHA.test(revision ?? '')) return false
  return git(root, ['cat-file', '-e', `${revision}^{commit}`]).status === 0
}

function blobAt(root, revision, relative) {
  if (!safeRelative(relative)) return null
  const exists = git(root, ['cat-file', '-e', `${revision}:${relative}`])
  if (exists.status !== 0) return null
  const blob = git(root, ['show', `${revision}:${relative}`], 'buffer')
  if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) return null
  const identity = git(root, ['rev-parse', `${revision}:${relative}`])
  if (identity.status !== 0) return null
  return { bytes: blob.stdout, blob: identity.stdout.trim() }
}

function sourcePaths(source, action) {
  if (Array.isArray(source?.actions?.[action])) return source.actions[action]
  return Array.isArray(source?.paths) ? source.paths : []
}

function validateBasis(basis, action) {
  if (!basis || basis.schema_version !== 1 || typeof basis.method !== 'string' || !basis.method || typeof basis.basis_id !== 'string' || !basis.basis_id || !Array.isArray(basis.sources) || !ACTIONS.has(action)) return ['BASIS_INVALID']
  if (!Array.isArray(basis.actions) || !basis.actions.includes(action)) return [`ACTION_NOT_IN_BASIS:${action}`]
  return []
}

export function measureInstructionContext({ gitRoot, revision, basis, profile, action, inputDigest }) {
  const reasons = validateBasis(basis, action)
  if (!DIGEST.test(inputDigest ?? '')) return { status: 'INVALID', reasons: ['INPUT_DIGEST_REQUIRED'] }
  if (typeof profile !== 'string' || !profile.trim()) return { status: 'INVALID', reasons: ['PROFILE_REQUIRED'] }
  if (reasons.length) return { status: 'INVALID', reasons }
  gitRoot = path.resolve(gitRoot)
  if (!revisionAvailable(gitRoot, revision)) return { status: 'INCONCLUSIVE', reasons: ['REVISION_UNAVAILABLE'], revision, coverage: 'INCONCLUSIVE', required_instruction_bytes: null }
  const basisDigest = digestText(stableJson(basis))
  const selected = []
  const missing = []
  for (const source of basis.sources) {
    const paths = sourcePaths(source, action)
    let chosen = null
    for (const relative of paths) {
      const blob = blobAt(gitRoot, revision, relative)
      if (!blob) continue
      chosen = { relative, ...blob }
      break
    }
    if (!chosen) {
      if (source.required !== false) missing.push(`REQUIRED_SOURCE_MISSING:${source.id ?? 'unknown'}`)
      continue
    }
    const existing = selected.find(item => item.path === chosen.relative)
    const reason = typeof source.reason === 'string' ? source.reason : `required ${source.id ?? 'source'} for ${action}`
    if (existing) existing.roles.push({ source_id: source.id ?? null, inclusion_reason: reason })
    else selected.push({ path: chosen.relative, blob: chosen.blob, bytes: chosen.bytes.byteLength, digest: digestBytes(chosen.bytes), roles: [{ source_id: source.id ?? null, inclusion_reason: reason }] })
  }
  if (missing.length) return { status: 'INCONCLUSIVE', reasons: missing, method: basis.method, basis_id: basis.basis_id, basis_digest: basisDigest, profile, action, input_digest: inputDigest, revision, source_bindings: selected.sort((left, right) => left.path.localeCompare(right.path)), coverage: 'INCONCLUSIVE', required_instruction_bytes: null, projection_bytes: null }
  const sourceBindings = selected.sort((left, right) => left.path.localeCompare(right.path))
  const requiredInstructionBytes = sourceBindings.reduce((sum, item) => sum + item.bytes, 0)
  return {
    status: 'MEASURED',
    method: basis.method,
    basis_id: basis.basis_id,
    basis_digest: basisDigest,
    profile,
    action,
    input_digest: inputDigest,
    revision,
    source_bindings: sourceBindings,
    required_instruction_bytes: requiredInstructionBytes,
    projection_bytes: 0,
    coverage: 'COMPLETE',
    source_count: sourceBindings.length,
  }
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error('USAGE: --baseline-ref SHA --candidate-ref SHA --basis FILE --run-id ID --evidence-root DIRECTORY')
    values[flag.slice(2).replaceAll('-', '_')] = value
  }
  if (!values.baseline_ref || !values.candidate_ref || !values.basis || !values.run_id || !values.evidence_root) throw new Error('USAGE: --baseline-ref SHA --candidate-ref SHA --basis FILE --run-id ID --evidence-root DIRECTORY')
  return values
}

function writeEvidence(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  const serialized = `${JSON.stringify(value, null, 2)}\n`
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== serialized) throw new Error('EVIDENCE_CONFLICT')
    return
  }
  writeFileSync(file, serialized, { flag: 'wx' })
}

function summarize(revision, results, basis, profile, inputDigest) {
  const status = results.every(item => item.status === 'MEASURED') ? 'MEASURED' : 'INCONCLUSIVE'
  return {
    status,
    method: basis.method,
    basis_id: basis.basis_id,
    basis_digest: digestText(stableJson(basis)),
    profile,
    input_digest: inputDigest,
    source_revision: revision,
    actions: Object.fromEntries(results.map(item => [item.action, { required_instruction_bytes: item.required_instruction_bytes, projection_bytes: item.projection_bytes, coverage: item.coverage, source_bindings: item.source_bindings ?? [], reasons: item.reasons ?? [] }])),
    reasons: results.flatMap(item => item.reasons ?? []),
  }
}

export function measureInstructionPair({ gitRoot, baselineRef, candidateRef, basis, profile = basis.profile ?? 'v4-lite-normal-action', inputDigest, evidenceRoot = null, runId = null }) {
  const actions = basis.actions ?? ['implement_slice', 'verify_slice']
  const baselineResults = actions.map(action => measureInstructionContext({ gitRoot, revision: baselineRef, basis, profile, action, inputDigest }))
  const candidateResults = actions.map(action => measureInstructionContext({ gitRoot, revision: candidateRef, basis, profile, action, inputDigest }))
  const baseline = summarize(baselineRef, baselineResults, basis, profile, inputDigest)
  const candidate = summarize(candidateRef, candidateResults, basis, profile, inputDigest)
  const result = { schema_version: 1, run_id: runId, status: baseline.status === 'MEASURED' && candidate.status === 'MEASURED' ? 'MEASURED' : 'INCONCLUSIVE', baseline, candidate, basis: { method: basis.method, basis_id: basis.basis_id, basis_digest: digestText(stableJson(basis)), profile, input_digest: inputDigest } }
  if (evidenceRoot) {
    writeEvidence(path.join(evidenceRoot, 'baseline-instruction-measurement.json'), baseline)
    writeEvidence(path.join(evidenceRoot, 'candidate-instruction-measurement.json'), candidate)
    writeEvidence(path.join(evidenceRoot, 'instruction-measurement.json'), result)
  }
  return result
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const root = process.cwd()
    const basis = JSON.parse(readFileSync(path.resolve(root, args.basis), 'utf8'))
    const corpus = readFileSync(path.join(root, '.agents/scripts/fixtures/v4-architecture/corpus.json'))
    const inputDigest = digestText(stableJson({ corpus_digest: digestBytes(corpus), basis_id: basis.basis_id }))
    const result = measureInstructionPair({ gitRoot: root, baselineRef: args.baseline_ref, candidateRef: args.candidate_ref, basis, inputDigest, evidenceRoot: path.resolve(args.evidence_root), runId: args.run_id })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.status === 'MEASURED' ? 0 : 2
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'ERROR', reasons: [error.message] })}\n`)
    process.exitCode = 2
  }
}
