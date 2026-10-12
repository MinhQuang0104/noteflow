import test from 'node:test'
import assert from 'node:assert/strict'
import { verificationSeed } from '../../../../scripts/v4-verification-fixture.mjs'

test('unproven Proxy options preserve per-call builder reads', () => {
  let reads = 0
  const options = new Proxy({ changedPaths: ['src/feature.txt'] }, {
    get(target, key, receiver) {
      return key === 'changedPaths' ? [`src/variant-${++reads}.txt`] : Reflect.get(target, key, receiver)
    }
  })
  const first = verificationSeed('LOW', options)
  const second = verificationSeed('LOW', options)
  try {
    assert.equal(reads, 2)
    assert.deepEqual(first.changedPaths, ['src/variant-1.txt'])
    assert.deepEqual(second.changedPaths, ['src/variant-2.txt'])
  } finally { first.cleanup(); second.cleanup() }
})

test('unproven Proxy arrays do not consume iterators while deciding a cache key', () => {
  let iterations = 0
  const changedPaths = new Proxy(['src/feature.txt'], {
    get(target, key, receiver) {
      return key === Symbol.iterator ? function* () { yield `src/iteration-${++iterations}.txt` } : Reflect.get(target, key, receiver)
    }
  })
  const first = verificationSeed('LOW', { changedPaths })
  const second = verificationSeed('LOW', { changedPaths })
  try {
    assert.equal(iterations, 2)
    assert.deepEqual(first.changedPaths, ['src/iteration-1.txt'])
    assert.deepEqual(second.changedPaths, ['src/iteration-2.txt'])
  } finally { first.cleanup(); second.cleanup() }
})

test('unproven risk objects never execute toJSON for a cache key', () => {
  let jsonCalls = 0
  const risk = new String('LOW')
  Object.defineProperty(risk, 'toJSON', { value: () => { jsonCalls++; return 'LOW' } })
  const first = verificationSeed(risk)
  const second = verificationSeed(risk)
  try {
    assert.equal(jsonCalls, 0)
    assert.equal(first.risk, risk)
    assert.equal(second.risk, risk)
  } finally { first.cleanup(); second.cleanup() }
})
