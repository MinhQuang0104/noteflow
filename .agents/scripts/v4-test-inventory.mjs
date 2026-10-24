import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Lists the top-level test names that `npm run test:v4` registers, without running any test body,
// so a split or move cannot silently drop a test. Nested subtests are not listed.
const DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
export const NAMES_PATH = path.join(DIRECTORY, 'v4-test-names.json')
export const INVENTORY_TEST = 'V4 test inventory matches the committed top-level test name list'
const STATE = Symbol.for('v4-test-inventory')
const RECORDER = `const state = globalThis[Symbol.for('v4-test-inventory')]
export function test(name, options, fn) {
  state.names.push({ file: state.file, name: typeof name === 'string' ? name : typeof name === 'function' ? name.name : String(name?.name) })
}
test.test = test
export const it = test
export function after(fn) { state.after.push(fn) }
export function before() {}
export function beforeEach() {}
export function afterEach() {}
export function describe() { throw new Error('v4-test-inventory does not list describe/suite blocks') }
export const suite = describe
export default test
`

export function testFiles(directory = DIRECTORY) {
  return readdirSync(directory).filter(name => name.endsWith('.test.mjs')).sort()
}

export async function collect(directory = DIRECTORY) {
  const state = globalThis[STATE] = { names: [], after: [], file: null }
  const recorder = `data:text/javascript,${encodeURIComponent(RECORDER)}`
  registerHooks({ resolve: (specifier, context, next) => specifier === 'node:test' ? { url: recorder, shortCircuit: true } : next(specifier, context) })
  try {
    for (const file of testFiles(directory)) {
      state.file = file
      await import(pathToFileURL(path.join(directory, file)).href)
    }
  } finally {
    for (const fn of state.after.reverse()) await fn()
  }
  return state.names
}

export function listTestNames(directory = DIRECTORY) {
  // The child loads this module before any test file, so the inventory test importing it is not a cycle.
  const script = `const m = await import(${JSON.stringify(import.meta.url)})
const names = await m.collect(${JSON.stringify(directory)})
process.stdout.write('\\n' + JSON.stringify({ names }) + '\\n')`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', windowsHide: true, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 })
  const line = result.stdout?.split('\n').findLast(value => value.startsWith('{"names":'))
  if (result.status !== 0 || !line) throw new Error(`test inventory failed: ${result.error?.message ?? ''}${result.stderr ?? ''}`)
  return JSON.parse(line).names
}

export function compareTestNames(actual, expected) {
  const counts = new Map()
  for (const name of expected) counts.set(name, (counts.get(name) ?? 0) + 1)
  const extra = []
  for (const { file, name } of actual) {
    if (counts.get(name)) counts.set(name, counts.get(name) - 1)
    else extra.push({ file, name })
  }
  const missing = [...counts].flatMap(([name, count]) => Array(count).fill(name))
  return { actual: actual.length, expected: expected.length, missing, extra }
}

export function committedNames() {
  return JSON.parse(readFileSync(NAMES_PATH, 'utf8'))
}

export function inventoryNames(directory = DIRECTORY) {
  return listTestNames(directory).filter(entry => entry.name !== INVENTORY_TEST)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--write') {
    const names = inventoryNames().map(entry => entry.name).sort()
    writeFileSync(NAMES_PATH, `${JSON.stringify(names, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify({ status: 'WRITTEN', count: names.length })}\n`)
  } else {
    const result = compareTestNames(inventoryNames(), committedNames())
    const drift = result.missing.length > 0 || result.extra.length > 0
    process.stdout.write(`${JSON.stringify({ status: drift ? 'DRIFT' : 'MATCH', ...result })}\n`)
    process.exitCode = drift ? 1 : 0
  }
}
