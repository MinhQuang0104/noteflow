import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUS_CODE = { PASS: 0, FAIL: 1, INCOMPLETE: 2, ERROR: 3 }
const REGISTRY = '.agents/verification/registry.json'
const MAX_OUTPUT = 4 * 1024 * 1024

function emit(evidence) {
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  process.exitCode = STATUS_CODE[evidence.status]
}

function errorEvidence(reason, changedPaths = [], featureId = null) {
  return {
    featureId, changedPaths, matchedPaths: [], coveredPaths: [], unmatchedPaths: changedPaths,
    status: 'ERROR', complete: false,
    map: { status: 'ERROR', expectedChangedAnchors: [], unexplainedDrift: [], missingAnchors: [] },
    checks: [], escalationReasons: [reason],
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function digestValue(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`
}

function within(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function canonical(input) {
  if (typeof input !== 'string' || !input.trim() || /[\u0000-\u001f]/.test(input) ||
      path.isAbsolute(input) || path.win32.isAbsolute(input) || /^[A-Za-z]:/.test(input)) {
    throw new Error('INVALID_CHANGED_PATH')
  }
  const slash = input.replaceAll('\\', '/')
  const normalized = path.posix.normalize(slash)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error('INVALID_CHANGED_PATH')
  }
  return normalized.replace(/^\.\//, '')
}

function repoPath(root, input) {
  if (input === '.') return root
  const relative = canonical(input)
  const resolved = path.resolve(root, relative)
  if (!within(root, resolved) || resolved === root) throw new Error('UNSAFE_RECIPE_PATH')
  if (existsSync(resolved) && !within(root, realpathSync(resolved))) throw new Error('UNSAFE_RECIPE_PATH')
  return resolved
}

function run(argv, cwd, environment = null) {
  let executable = argv[0]
  let args = argv.slice(1)
  if (executable === 'node') executable = process.execPath
  if (executable === 'npm' && process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (!existsSync(npmCli)) throw new Error('NPM_CLI_UNAVAILABLE')
    executable = process.execPath
    args = [npmCli, ...args]
  }
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: MAX_OUTPUT,
    timeout: 120000,
    ...(environment ? { env: { ...process.env, ...environment } } : {}),
  })
  if (result.error || result.status === null) throw new Error('PROCESS_EXECUTION_ERROR')
  return { exitCode: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}` }
}

function summary(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const diagnostic = lines.find(line => /(?:error TS\d+|Error:|FAIL |Test Files |Tests )/.test(line))
  return (diagnostic || lines.at(-1) || 'No output').slice(0, 240)
}

function environmentUnavailable(output) {
  return /(?:not recognized as an internal or external command|command not found|ERR_MODULE_NOT_FOUND|Cannot find module|NPM_CLI_UNAVAILABLE)/i.test(output)
}

export function classifyMapResult(exitCode, output, changedPaths, anchors) {
  const changed = new Set(changedPaths)
  const mapped = new Set(anchors)
  const result = { status: 'ERROR', expectedChangedAnchors: [], unexplainedDrift: [], missingAnchors: [] }
  const lines = output.trim().split(/\r?\n/).filter(Boolean)
  if (exitCode === 0 && lines.length === 1 && lines[0] === 'VALID') {
    result.status = 'VALID'
  } else if (exitCode === 1 && lines[0] === 'STALE' && lines.length > 1) {
    result.status = 'STALE'
    for (const line of lines.slice(1)) {
      const match = /^(MISMATCH|MISSING) (.+)$/.exec(line)
      if (!match || !mapped.has(match[2])) throw new Error('UNPARSEABLE_MAP_RESULT')
      if (match[1] === 'MISSING') result.missingAnchors.push(match[2])
      else if (changed.has(match[2])) result.expectedChangedAnchors.push(match[2])
      else result.unexplainedDrift.push(match[2])
    }
  } else if (exitCode === 2 && lines[0]?.startsWith('INVALID_MAP ')) {
    result.status = 'INVALID_MAP'
  } else if (exitCode === 3 && lines[0]?.startsWith('ERROR ')) {
    result.status = 'ERROR'
  } else {
    throw new Error('UNPARSEABLE_MAP_RESULT')
  }
  for (const key of ['expectedChangedAnchors', 'unexplainedDrift', 'missingAnchors']) {
    result[key] = [...new Set(result[key])].sort()
  }
  return result
}

function loadRecipe(root, entry) {
  const recipe = JSON.parse(readFileSync(repoPath(root, entry.path), 'utf8'))
  if ((recipe.schema_version !== undefined && recipe.schema_version !== 1) ||
      recipe.featureId !== entry.featureId || !Array.isArray(recipe.checks) || !recipe.checks.length ||
      recipe.checks[0]?.id !== 'map' || new Set(recipe.checks.map(check => check?.id)).size !== recipe.checks.length ||
      !recipe.checks.every(check => check && typeof check.id === 'string' &&
        Array.isArray(check.argv) && check.argv.length && check.argv.every(arg => typeof arg === 'string' && arg) &&
        (check.cwd === undefined || typeof check.cwd === 'string') &&
        (check.environment === undefined || (check.environment && typeof check.environment === 'object' && !Array.isArray(check.environment))))) {
    throw new Error('INVALID_RECIPE')
  }
  const map = JSON.parse(readFileSync(repoPath(root, recipe.featureMap), 'utf8'))
  if (map.id !== entry.featureId || !map.anchor_blobs || typeof map.anchor_blobs !== 'object' ||
      Array.isArray(map.anchor_blobs) || !Object.keys(map.anchor_blobs).length) throw new Error('INVALID_MAP')
  const anchors = Object.keys(map.anchor_blobs)
  for (const anchor of anchors) {
    if (canonical(anchor) !== anchor || !/^[0-9a-f]{40}$/i.test(map.anchor_blobs[anchor])) throw new Error('INVALID_MAP')
  }
  let coveredPaths
  if (map.schema_version === 2) {
    if (!Array.isArray(map.covered_paths) || !map.covered_paths.length ||
        new Set(map.covered_paths).size !== map.covered_paths.length ||
        map.covered_paths.some(item => canonical(item) !== item || !Object.hasOwn(map.anchor_blobs, item))) throw new Error('INVALID_MAP')
    coveredPaths = [...map.covered_paths].sort()
  } else if (map.schema_version === undefined || map.schema_version === 1) {
    coveredPaths = [...anchors].sort()
  } else {
    throw new Error('INVALID_MAP')
  }
  return {
    featureId: entry.featureId,
    entry,
    recipe,
    map,
    anchors: anchors.sort(),
    coveredPaths,
    dependencyPaths: anchors.filter(anchor => !coveredPaths.includes(anchor)).sort(),
  }
}

function loadRegistry(root) {
  const registry = JSON.parse(readFileSync(repoPath(root, REGISTRY), 'utf8'))
  if (registry?.schema_version !== 1 || !Array.isArray(registry.recipes) || !registry.recipes.length) {
    throw new Error('INVALID_REGISTRY')
  }
  const entries = registry.recipes.filter(entry => entry?.enabled !== false)
  if (!entries.length || entries.some(entry => !entry || typeof entry.featureId !== 'string' || !entry.featureId ||
      typeof entry.path !== 'string' || !entry.path || typeof entry.enabled !== 'boolean' ||
      !safeRegistryPath(entry.path))) throw new Error('INVALID_REGISTRY')
  const ids = entries.map(entry => entry.featureId)
  const paths = entries.map(entry => entry.path)
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) throw new Error('INVALID_REGISTRY')
  return entries.map(entry => loadRecipe(root, entry))
}

function safeRegistryPath(relative) {
  try {
    return canonical(relative) === relative && relative.endsWith('.json')
  } catch {
    return false
  }
}

function executeCheck(root, selected, check, subject, cache) {
  const environment = check.environment ?? selected.recipe.environment ?? null
  const cwd = repoPath(root, check.cwd || selected.recipe.cwd || '.')
  const key = digestValue({
    cwd: path.relative(root, cwd).replaceAll('\\', '/') || '.',
    argv: check.argv,
    environment,
    subject,
  })
  if (cache.has(key)) return { ...cache.get(key), evidence_ref: key }
  let observation
  try {
    const processResult = run(check.argv, cwd, environment)
    observation = { exitCode: processResult.exitCode, output: processResult.output, error: null }
  } catch (error) {
    observation = { exitCode: null, output: '', error: error.message }
  }
  cache.set(key, observation)
  return { ...observation, evidence_ref: key }
}

function pushReason(evidence, reason) {
  if (!evidence.escalationReasons.includes(reason)) evidence.escalationReasons.push(reason)
}

function runRecipe(root, selected, changedPaths, subject, cache) {
  const { recipe, anchors, coveredPaths } = selected
  const mapped = new Set(anchors)
  const covered = new Set(coveredPaths)
  const matchedPaths = changedPaths.filter(changed => mapped.has(changed))
  const coveredChangedPaths = changedPaths.filter(changed => covered.has(changed))
  const unmatchedPaths = changedPaths.filter(changed => !covered.has(changed))
  const dependencyOnlyPaths = changedPaths.filter(changed => mapped.has(changed) && !covered.has(changed))
  const evidence = {
    schema_version: 1,
    featureId: selected.featureId,
    changedPaths,
    matchedPaths,
    coveredPaths: coveredChangedPaths,
    unmatchedPaths,
    dependencyOnlyPaths,
    map: { status: 'SKIPPED', expectedChangedAnchors: [], unexplainedDrift: [], missingAnchors: [] },
    checks: recipe.checks.map(check => ({ id: check.id, status: 'SKIPPED', exitCode: null, summary: 'Not run' })),
    escalationReasons: [],
    status: 'INCOMPLETE',
    complete: false,
  }
  if (!matchedPaths.length) pushReason(evidence, 'NO_MAPPED_CHANGE')
  if (unmatchedPaths.length) pushReason(evidence, 'UNMAPPED_CHANGED_PATH')
  if (dependencyOnlyPaths.length) pushReason(evidence, 'DEPENDENCY_ONLY_CHANGED_PATH')
  if (!matchedPaths.length) return evidence

  const mapCheck = recipe.checks[0]
  const mapRun = executeCheck(root, selected, mapCheck, subject, cache)
  try {
    evidence.map = classifyMapResult(mapRun.exitCode, mapRun.output, changedPaths, anchors)
    const expectedOnly = evidence.map.status === 'STALE' &&
      !evidence.map.unexplainedDrift.length && !evidence.map.missingAnchors.length
    evidence.checks[0] = {
      id: mapCheck.id,
      status: evidence.map.status === 'VALID' || expectedOnly ? 'PASS' :
        evidence.map.status === 'STALE' ? 'FAIL' : 'ERROR',
      exitCode: mapRun.exitCode,
      summary: evidence.map.status,
      evidence_ref: mapRun.evidence_ref,
    }
  } catch {
    evidence.status = 'ERROR'
    pushReason(evidence, 'VALIDATOR_ERROR')
    return evidence
  }
  if (evidence.map.status === 'INVALID_MAP' || evidence.map.status === 'ERROR') {
    evidence.status = 'ERROR'
    pushReason(evidence, evidence.map.status)
    return evidence
  }
  if (evidence.map.missingAnchors.length) pushReason(evidence, 'MISSING_ANCHOR')
  if (evidence.map.unexplainedDrift.length) pushReason(evidence, 'UNEXPLAINED_DRIFT')

  let failed = false
  for (let index = 1; index < recipe.checks.length; index++) {
    const check = recipe.checks[index]
    const checkRun = executeCheck(root, selected, check, subject, cache)
    if (checkRun.error) {
      evidence.checks[index] = {
        id: check.id, status: 'ERROR', exitCode: null,
        summary: checkRun.error === 'PROCESS_EXECUTION_ERROR' ? checkRun.error : 'PROCESS_EXECUTION_ERROR',
        evidence_ref: checkRun.evidence_ref,
      }
      pushReason(evidence, 'CHECK_EXECUTION_ERROR')
      continue
    }
    if (environmentUnavailable(checkRun.output)) {
      evidence.checks[index] = {
        id: check.id, status: 'ERROR', exitCode: checkRun.exitCode,
        summary: 'ENVIRONMENT_UNAVAILABLE', evidence_ref: checkRun.evidence_ref,
      }
      pushReason(evidence, 'CHECK_ENVIRONMENT_UNAVAILABLE')
      continue
    }
    const status = checkRun.exitCode === 0 ? 'PASS' : 'FAIL'
    if (status === 'FAIL') failed = true
    evidence.checks[index] = {
      id: check.id, status, exitCode: checkRun.exitCode,
      summary: summary(checkRun.output), evidence_ref: checkRun.evidence_ref,
    }
  }
  if (evidence.escalationReasons.some(reason => ['CHECK_EXECUTION_ERROR', 'CHECK_ENVIRONMENT_UNAVAILABLE'].includes(reason))) evidence.status = 'ERROR'
  else if (evidence.escalationReasons.length) evidence.status = 'INCOMPLETE'
  else evidence.status = failed ? 'FAIL' : 'PASS'
  evidence.complete = evidence.status === 'PASS' || evidence.status === 'FAIL'
  return evidence
}

function unionPaths(results, field) {
  return [...new Set(results.flatMap(result => result[field] ?? []))].sort()
}

function aggregateResults(results, changedPaths) {
  const matchedPaths = unionPaths(results, 'matchedPaths')
  const coveredPaths = unionPaths(results, 'coveredPaths')
  const unmatchedPaths = changedPaths.filter(pathValue => !coveredPaths.includes(pathValue))
  const checks = []
  const byEvidence = new Map()
  for (const recipe of results) {
    for (const check of recipe.checks) {
      if (!check.evidence_ref) continue
      const existing = byEvidence.get(check.evidence_ref)
      if (existing) {
        existing.recipe_refs.push(recipe.featureId)
      } else {
        const aggregateCheck = { ...check, recipe_refs: [recipe.featureId] }
        byEvidence.set(check.evidence_ref, aggregateCheck)
        checks.push(aggregateCheck)
      }
    }
  }
  const escalationReasons = []
  const addReason = reason => { if (!escalationReasons.includes(reason)) escalationReasons.push(reason) }
  if (unmatchedPaths.length) addReason('UNMAPPED_CHANGED_PATH')
  for (const recipe of results) {
    for (const reason of recipe.escalationReasons) {
      if (!['NO_MAPPED_CHANGE', 'UNMAPPED_CHANGED_PATH', 'DEPENDENCY_ONLY_CHANGED_PATH'].includes(reason)) addReason(reason)
    }
  }
  const hasError = results.some(recipe => recipe.status === 'ERROR') ||
    checks.some(check => check.status === 'ERROR')
  const hasBehavioralFailure = results.some(recipe => recipe.checks.some(check => check.id !== 'map' && check.status === 'FAIL'))
  const status = hasError ? 'ERROR' : hasBehavioralFailure ? 'FAIL' : escalationReasons.length ? 'INCOMPLETE' : 'PASS'
  return {
    schema_version: 2,
    featureId: null,
    changedPaths,
    matchedPaths,
    coveredPaths,
    unmatchedPaths,
    recipes: results,
    checks,
    escalationReasons,
    status,
    complete: status === 'PASS' || status === 'FAIL',
  }
}

export function verifyChangedPaths(root, selector, inputPaths, options = {}) {
  let changedPaths
  try {
    if (!Array.isArray(inputPaths) || !inputPaths.length) return errorEvidence('NO_CHANGED_PATHS')
    changedPaths = [...new Set(inputPaths.map(canonical))].sort()
  } catch {
    return errorEvidence('INVALID_CHANGED_PATH')
  }
  let entries
  try {
    entries = loadRegistry(root)
  } catch {
    return errorEvidence('INVALID_REGISTRY', changedPaths, selector === 'auto' ? null : selector)
  }
  let applicable
  if (selector === 'auto') {
    applicable = entries.filter(entry => changedPaths.some(changed => entry.anchors.includes(changed)))
    if (!applicable.length) {
      return {
        featureId: null, changedPaths, matchedPaths: [], coveredPaths: [], unmatchedPaths: changedPaths,
        applicability: 'NOT_APPLICABLE', status: 'INCOMPLETE', complete: false, checks: [],
        escalationReasons: ['NO_APPLICABLE_RECIPE'],
      }
    }
  } else {
    applicable = entries.filter(entry => entry.featureId === selector)
    if (!applicable.length) return errorEvidence('UNKNOWN_FEATURE', changedPaths, selector)
  }
  const subject = options.subject ?? null
  const cache = new Map()
  const results = applicable.map(entry => runRecipe(root, entry, changedPaths, subject, cache))
  return results.length === 1 ? results[0] : aggregateResults(results, changedPaths)
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 4 || args[0] !== 'check' || args.length % 2 !== 0 ||
      args.slice(2).some((value, index) => index % 2 === 0 ? value !== '--changed' : value === '--changed')) {
    return errorEvidence('USAGE: check <feature|auto> --changed <path> [--changed <path> ...]')
  }
  let changedPaths
  try {
    changedPaths = [...new Set(args.filter((_, index) => index >= 3 && index % 2 === 1).map(canonical))].sort()
  } catch {
    return errorEvidence('INVALID_CHANGED_PATH')
  }
  let root
  try {
    const git = run(['git', 'rev-parse', '--show-toplevel'], process.cwd())
    if (git.exitCode !== 0) throw new Error('GIT_ROOT_UNAVAILABLE')
    root = realpathSync(git.output.trim())
  } catch {
    return errorEvidence('GIT_ROOT_UNAVAILABLE', changedPaths)
  }
  let result
  try {
    result = verifyChangedPaths(root, args[1], changedPaths, {
      subject: { head: run(['git', 'rev-parse', 'HEAD'], root).output.trim() },
    })
  } catch {
    result = errorEvidence('VERIFICATION_ERROR', changedPaths, args[1] === 'auto' ? null : args[1])
  }
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  emit(main())
}
