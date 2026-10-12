// Times only the portable reviewed seed; no finalization, recovery or executor construction.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fixture } from '../../../../scripts/finalize-story-fixture.mjs'

const records = []
function measure(mode, iteration) {
  if (mode === 'uncached') process.env.V4_TEST_NO_CACHE = '1'
  else delete process.env.V4_TEST_NO_CACHE
  const started = performance.now()
  const seed = fixture()
  const setupMs = performance.now() - started
  const cleanupStarted = performance.now()
  seed.cleanup()
  records.push({ mode, iteration, setupMs, cleanupMs: performance.now() - cleanupStarted })
}
const original = process.env.V4_TEST_NO_CACHE
try {
  measure('cold-cache', 0)
  for (let i = 1; i <= 10; i++) {
    for (const mode of i % 2 ? ['cached', 'uncached'] : ['uncached', 'cached']) measure(mode, i)
  }
} finally {
  if (original === undefined) delete process.env.V4_TEST_NO_CACHE
  else process.env.V4_TEST_NO_CACHE = original
}
const mean = mode => records.filter(row => row.mode === mode).reduce((sum, row) => sum + row.setupMs, 0) / 10
const cachedMs = mean('cached'), uncachedMs = mean('uncached')
assert.equal(records.length, 21)
const result = { variant: 'reviewed/default-no-arguments', samplesPerWarmMode: 10, coldCacheMs: records[0].setupMs,
  meanWarmCachedMs: cachedMs, meanUncachedMs: uncachedMs,
  meanSavingsMs: uncachedMs - cachedMs, savingsPercent: (uncachedMs - cachedMs) / uncachedMs * 100,
  scope: 'reviewed seed constructor only; cleanup recorded separately; no whole-file extrapolation', records }
writeFileSync(new URL('./seed-timing.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
