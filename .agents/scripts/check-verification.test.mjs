import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { verifyChangedPaths } from './check-verification.mjs'

const PASS_COMMAND = ['node', '-e', 'process.stdout.write("PASS\\n")']
const VALID_MAP_COMMAND = ['node', '-e', 'process.stdout.write("VALID\\n")']
const FAIL_COMMAND = ['node', '-e', 'process.exit(7)']

function writeJson(root, relative, value) {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function createRegistryFixture({ failure = false, environmentUnavailable = false, invalidRegistry = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'v4-verification-'))
  const checkCommand = environmentUnavailable
    ? ['node', '-e', 'process.stderr.write("ERR_MODULE_NOT_FOUND\\n"); process.exit(1)']
    : failure ? FAIL_COMMAND : PASS_COMMAND
  const makeRecipe = featureId => ({
    schema_version: 1,
    featureId,
    featureMap: `.agents/features/${featureId}.json`,
    cwd: '.',
    checks: [
      { id: 'map', cwd: '.', argv: VALID_MAP_COMMAND },
      { id: 'shared', argv: checkCommand },
    ],
  })
  const makeMap = (featureId, covered, dependency) => ({
    schema_version: 2,
    id: featureId,
    covered_paths: [covered],
    anchor_blobs: {
      [covered]: '0000000000000000000000000000000000000000',
      [dependency]: '1111111111111111111111111111111111111111',
    },
  })
  writeJson(root, '.agents/features/alpha.json', makeMap('alpha', 'src/a.ts', 'src/shared.ts'))
  writeJson(root, '.agents/features/beta.json', makeMap('beta', 'src/b.ts', 'src/shared.ts'))
  writeJson(root, '.agents/verification/alpha.json', makeRecipe('alpha'))
  writeJson(root, '.agents/verification/beta.json', makeRecipe('beta'))
  writeJson(root, '.agents/verification/registry.json', {
    schema_version: 1,
    recipes: invalidRegistry
      ? [
          { featureId: 'alpha', path: '.agents/verification/alpha.json', enabled: true },
          { featureId: 'alpha', path: '.agents/verification/missing.json', enabled: true },
        ]
      : [
          { featureId: 'alpha', path: '.agents/verification/alpha.json', enabled: true },
          { featureId: 'beta', path: '.agents/verification/beta.json', enabled: true },
        ],
  })
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('routes mapped-only, unmapped-only, and mixed scope without dropping changed paths', () => {
  const fixture = createRegistryFixture()
  try {
    const mapped = verifyChangedPaths(fixture.root, 'auto', ['src/a.ts'], { subject: 'fixture' })
    assert.equal(mapped.status, 'PASS')
    assert.deepEqual(mapped.changedPaths, ['src/a.ts'])
    assert.deepEqual(mapped.matchedPaths, ['src/a.ts'])
    assert.deepEqual(mapped.unmatchedPaths, [])
    assert.equal(mapped.recipes, undefined)

    const unmapped = verifyChangedPaths(fixture.root, 'auto', ['src/unknown.ts'], { subject: 'fixture' })
    assert.equal(unmapped.status, 'INCOMPLETE')
    assert.deepEqual(unmapped.changedPaths, ['src/unknown.ts'])
    assert.deepEqual(unmapped.matchedPaths, [])
    assert.deepEqual(unmapped.unmatchedPaths, ['src/unknown.ts'])
    assert.deepEqual(unmapped.escalationReasons, ['NO_APPLICABLE_RECIPE'])

    const mixed = verifyChangedPaths(fixture.root, 'auto', ['src/unknown.ts', 'src/a.ts'], { subject: 'fixture' })
    assert.equal(mixed.status, 'INCOMPLETE')
    assert.deepEqual(mixed.changedPaths, ['src/a.ts', 'src/unknown.ts'])
    assert.deepEqual(mixed.matchedPaths, ['src/a.ts'])
    assert.deepEqual(mixed.unmatchedPaths, ['src/unknown.ts'])
    assert.ok(mixed.escalationReasons.includes('UNMAPPED_CHANGED_PATH'))
    assert.equal(mixed.featureId, 'alpha')
  } finally {
    fixture.cleanup()
  }
})

test('aggregates multiple recipes, preserves raw recipe output, and deduplicates shared checks', () => {
  const fixture = createRegistryFixture()
  try {
    const aggregate = verifyChangedPaths(fixture.root, 'auto', ['src/a.ts', 'src/b.ts'], { subject: 'fixture' })
    assert.equal(aggregate.schema_version, 2)
    assert.equal(aggregate.status, 'PASS')
    assert.equal(aggregate.complete, true)
    assert.deepEqual(aggregate.matchedPaths, ['src/a.ts', 'src/b.ts'])
    assert.deepEqual(aggregate.unmatchedPaths, [])
    assert.equal(aggregate.recipes.length, 2)
    assert.equal(aggregate.recipes[0].checks.length, 2)
    assert.equal(aggregate.recipes[1].checks.length, 2)
    assert.equal(aggregate.checks.length, 2)
    assert.equal(aggregate.recipes[0].checks[1].evidence_ref, aggregate.recipes[1].checks[1].evidence_ref)
    assert.equal(aggregate.checks[1].status, 'PASS')
  } finally {
    fixture.cleanup()
  }
})

test('dependency-only changes trigger affected recipes but never count as covered', () => {
  const fixture = createRegistryFixture()
  try {
    const result = verifyChangedPaths(fixture.root, 'auto', ['src/shared.ts'], { subject: 'fixture' })
    assert.equal(result.schema_version, 2)
    assert.equal(result.status, 'INCOMPLETE')
    assert.deepEqual(result.matchedPaths, ['src/shared.ts'])
    assert.deepEqual(result.unmatchedPaths, ['src/shared.ts'])
    assert.deepEqual(result.recipes.map(recipe => recipe.dependencyOnlyPaths), [['src/shared.ts'], ['src/shared.ts']])
    assert.ok(result.escalationReasons.includes('UNMAPPED_CHANGED_PATH'))
  } finally {
    fixture.cleanup()
  }
})

test('invalid registry and execution failures remain errors or failures', () => {
  const invalid = createRegistryFixture({ invalidRegistry: true })
  const failing = createRegistryFixture({ failure: true })
  const unavailable = createRegistryFixture({ environmentUnavailable: true })
  try {
    const invalidResult = verifyChangedPaths(invalid.root, 'auto', ['src/a.ts'], { subject: 'fixture' })
    assert.equal(invalidResult.status, 'ERROR')
    assert.ok(invalidResult.escalationReasons.includes('INVALID_REGISTRY'))

    const failed = verifyChangedPaths(failing.root, 'alpha', ['src/a.ts'], { subject: 'fixture' })
    assert.equal(failed.status, 'FAIL')
    assert.equal(failed.complete, true)
    assert.equal(failed.checks.find(check => check.id === 'shared').status, 'FAIL')
    assert.equal(failed.status === 'PASS', false)

    const unavailableResult = verifyChangedPaths(unavailable.root, 'alpha', ['src/a.ts'], { subject: 'fixture' })
    assert.equal(unavailableResult.status, 'ERROR')
    assert.ok(unavailableResult.escalationReasons.includes('CHECK_ENVIRONMENT_UNAVAILABLE'))
  } finally {
    invalid.cleanup()
    failing.cleanup()
    unavailable.cleanup()
  }
})

test('legacy challenge-list selection remains available through the registry contract', () => {
  const fixture = createRegistryFixture()
  try {
    const registry = JSON.parse(readFileSync(path.join(fixture.root, '.agents/verification/registry.json'), 'utf8'))
    registry.recipes.push({ featureId: 'legacy', path: '.agents/verification/alpha.json', enabled: false })
    writeJson(fixture.root, '.agents/verification/registry.json', registry)
    const result = verifyChangedPaths(fixture.root, 'alpha', ['src/a.ts'], { subject: 'fixture' })
    assert.equal(result.featureId, 'alpha')
    assert.equal(result.status, 'PASS')
  } finally {
    fixture.cleanup()
  }
})
