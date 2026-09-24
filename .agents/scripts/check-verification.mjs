import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUS_CODE = { PASS: 0, FAIL: 1, INCOMPLETE: 2, ERROR: 3 }
const FEATURE = 'challenge-list'
const RECIPE = '.agents/verification/challenge-list.json'
const RECIPES = [{ featureId: FEATURE, path: RECIPE, checkIds: 'map,type-check,mapped-tests' }]
const MAX_OUTPUT = 4 * 1024 * 1024

function emit(evidence) {
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  process.exitCode = STATUS_CODE[evidence.status]
}

function errorEvidence(reason, changedPaths = [], featureId = FEATURE) {
  return {
    featureId, changedPaths, matchedPaths: [], status: 'ERROR', complete: false,
    map: { status: 'ERROR', expectedChangedAnchors: [], unexplainedDrift: [], missingAnchors: [] },
    checks: [], escalationReasons: [reason],
  }
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

function run(argv, cwd) {
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
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: MAX_OUTPUT, timeout: 120000,
  })
  if (result.error || result.status === null) throw new Error('PROCESS_EXECUTION_ERROR')
  return { exitCode: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}` }
}

function summary(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const diagnostic = lines.find(line => /(?:error TS\d+|Error:|FAIL |Test Files |Tests )/.test(line))
  return (diagnostic || lines.at(-1) || 'No output').slice(0, 240)
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
  if (recipe.featureId !== entry.featureId || !Array.isArray(recipe.checks) ||
      recipe.checks.map(check => check.id).join(',') !== entry.checkIds ||
      !recipe.checks.every(check => Array.isArray(check.argv) && check.argv.every(arg => typeof arg === 'string' && arg))) {
    throw new Error('INVALID_RECIPE')
  }
  const map = JSON.parse(readFileSync(repoPath(root, recipe.featureMap), 'utf8'))
  if (map.id !== entry.featureId || !map.anchor_blobs || typeof map.anchor_blobs !== 'object' ||
      Array.isArray(map.anchor_blobs) || !Object.keys(map.anchor_blobs).length) throw new Error('INVALID_MAP')
  for (const anchor of Object.keys(map.anchor_blobs)) {
    if (canonical(anchor) !== anchor) throw new Error('INVALID_MAP')
  }
  return { recipe, map }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 4 || args[0] !== 'check' || ![FEATURE, 'auto'].includes(args[1]) ||
      args.length % 2 !== 0 || args.slice(2).some((value, index) =>
        index % 2 === 0 ? value !== '--changed' : value === '--changed')) {
    return errorEvidence('USAGE: check challenge-list --changed <path> [--changed <path> ...]')
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
  let recipe, map
  try {
    if (args[1] === 'auto') {
      const applicable = RECIPES.map(entry => loadRecipe(root, entry))
        .filter(({ map: featureMap }) => changedPaths.some(changed =>
          Object.hasOwn(featureMap.anchor_blobs, changed)))
      if (!applicable.length) {
        return {
          featureId: null, changedPaths, matchedPaths: [], applicability: 'NOT_APPLICABLE',
          status: 'INCOMPLETE', complete: false, checks: [],
          escalationReasons: ['NO_APPLICABLE_RECIPE'],
        }
      }
      if (applicable.length > 1) {
        return errorEvidence('MULTIPLE_APPLICABLE_RECIPES', changedPaths, null)
      }
      recipe = applicable[0].recipe
      map = applicable[0].map
    } else {
      const selected = loadRecipe(root, RECIPES[0])
      recipe = selected.recipe
      map = selected.map
    }
  } catch {
    return errorEvidence('INVALID_RECIPE_OR_MAP', changedPaths, args[1] === 'auto' ? null : FEATURE)
  }
  const anchors = Object.keys(map.anchor_blobs)
  const mapped = new Set(anchors)
  const matchedPaths = changedPaths.filter(changed => mapped.has(changed))
  const unmappedPaths = changedPaths.filter(changed => !mapped.has(changed))
  const evidence = {
    featureId: FEATURE, changedPaths, matchedPaths, status: 'INCOMPLETE', complete: false,
    map: { status: 'SKIPPED', expectedChangedAnchors: [], unexplainedDrift: [], missingAnchors: [] },
    checks: recipe.checks.map(check => ({ id: check.id, status: 'SKIPPED', exitCode: null, summary: 'Not run' })),
    escalationReasons: [],
  }
  if (!matchedPaths.length) evidence.escalationReasons.push('NO_MAPPED_CHANGE')
  if (unmappedPaths.length) evidence.escalationReasons.push('UNMAPPED_CHANGED_PATH')
  if (!matchedPaths.length) return evidence

  let mapRun
  try {
    const mapCheck = recipe.checks[0]
    mapRun = run(mapCheck.argv, repoPath(root, mapCheck.cwd))
    evidence.map = classifyMapResult(mapRun.exitCode, mapRun.output, changedPaths, anchors)
    const expectedOnly = evidence.map.status === 'STALE' &&
      !evidence.map.unexplainedDrift.length && !evidence.map.missingAnchors.length
    evidence.checks[0] = {
      id: 'map', status: evidence.map.status === 'VALID' || expectedOnly ? 'PASS' :
        evidence.map.status === 'STALE' ? 'FAIL' : 'ERROR', exitCode: mapRun.exitCode,
      summary: evidence.map.status,
    }
  } catch {
    evidence.status = 'ERROR'
    evidence.escalationReasons.push('VALIDATOR_ERROR')
    return evidence
  }
  if (evidence.map.status === 'INVALID_MAP' || evidence.map.status === 'ERROR') {
    evidence.status = 'ERROR'
    evidence.escalationReasons.push(evidence.map.status)
    return evidence
  }
  if (evidence.map.missingAnchors.length) {
    evidence.escalationReasons.push('MISSING_ANCHOR')
    return evidence
  }
  if (evidence.map.unexplainedDrift.length) evidence.escalationReasons.push('UNEXPLAINED_DRIFT')

  let failed = false
  for (let index = 1; index < recipe.checks.length; index++) {
    const check = recipe.checks[index]
    try {
      const result = run(check.argv, repoPath(root, check.cwd || recipe.cwd))
      const status = result.exitCode === 0 ? 'PASS' : 'FAIL'
      if (status === 'FAIL') failed = true
      evidence.checks[index] = { id: check.id, status, exitCode: result.exitCode, summary: summary(result.output) }
    } catch {
      evidence.checks[index] = { id: check.id, status: 'ERROR', exitCode: null, summary: 'PROCESS_EXECUTION_ERROR' }
      evidence.escalationReasons.push('CHECK_EXECUTION_ERROR')
    }
  }
  if (evidence.escalationReasons.includes('CHECK_EXECUTION_ERROR')) evidence.status = 'ERROR'
  else if (evidence.escalationReasons.length) evidence.status = 'INCOMPLETE'
  else evidence.status = failed ? 'FAIL' : 'PASS'
  evidence.complete = evidence.status === 'PASS' || evidence.status === 'FAIL'
  return evidence
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  emit(main())
}
