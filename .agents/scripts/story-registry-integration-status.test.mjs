import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRegistryFixture } from './registry-test-fixture.mjs'
import { createIntegrationFixture, assertTemporary } from './integration-test-fixture.mjs'
import { claimStory, heartbeatStory, registryStatus } from './story-registry.mjs'
import { integrateStory } from './integrate-story.mjs'

test('status shows held hot paths and an integrating Story without changing its record', () => {
  const f = createRegistryFixture()
  try {
    writeFileSync(f.paths.plan, readFileSync(f.paths.plan, 'utf8').replace('src/fixture.txt', 'backend/config/fixture.php'))
    const claim = claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'status' })
    assert.equal(claim.status, 'APPLIED', JSON.stringify(claim))
    assert.equal(heartbeatStory(f.root, '9.1', 1, 'INTEGRATING').status, 'APPLIED')
    const status = registryStatus(f.root)
    assert.equal(status.status, 'READY')
    assert.equal(status.records[0].integrationStatus, 'INTEGRATING')
    assert.deepEqual(status.records[0].hotPaths.map(item => item.path), ['backend/config/'])
    assert.equal(heartbeatStory(f.root, '9.1', 1, 'IMPLEMENTING').status, 'APPLIED')
    assert.equal(registryStatus(f.root).records[0].integrationStatus, null)
  } finally { f.cleanup() }
})

test('done is ready to integrate only while its completion evidence is READY', () => {
  const fixture = createIntegrationFixture()
  try {
    const bytes = readFileSync(fixture.locations.record, 'utf8')
    assert.equal(registryStatus(fixture.f.root).records[0].integrationStatus, 'READY_TO_INTEGRATE')
    assert.equal(readFileSync(fixture.locations.record, 'utf8'), bytes)
    writeFileSync(path.join(fixture.f.root, 'src/implementation.txt'), 'unverified change\n')
    assert.equal(registryStatus(fixture.f.root).records[0].integrationStatus, null)
    assert.equal(readFileSync(fixture.locations.record, 'utf8'), bytes)
  } finally { fixture.cleanup() }
})

test('merge-conflict status survives scratch cleanup and ignores another generation', () => {
  const fixture = createIntegrationFixture()
  try {
    assertTemporary(fixture.f.root); assertTemporary(fixture.canonical)
    fixture.write('src/implementation.txt', 'conflicting main change\n')
    fixture.git('add', 'src/implementation.txt'); fixture.git('commit', '-qm', 'fixture conflict')
    assert.deepEqual(integrateStory(fixture.f.root, '9.1', 1, fixture.canonical).reasons, ['MERGE_CONFLICT'])
    const status = registryStatus(fixture.f.root)
    assert.equal(status.records[0].integrationStatus, 'MERGE_CONFLICT')
    assert.deepEqual(status.records[0].integrationPaths, ['src/implementation.txt'])
    const marker = path.join(fixture.locations.directory, 'integration/9.1.json')
    const value = JSON.parse(readFileSync(marker, 'utf8'))
    writeFileSync(marker, JSON.stringify({ ...value, generation: 2 }))
    assert.equal(registryStatus(fixture.f.root).records[0].integrationStatus, 'READY_TO_INTEGRATE')
  } finally { fixture.cleanup() }
})
