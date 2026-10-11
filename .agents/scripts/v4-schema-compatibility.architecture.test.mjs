import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as registry from './story-registry.mjs'
import { createV4Fixture } from './v4-architecture-fixture.mjs'
import { createRegistryFixture } from './registry-test-fixture.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'
import { frontmatter, validate as readPlan, validateAutopilot } from './check-story-plan.mjs'
import { readReceipt, receiptDigest } from './check-artifact-contract.mjs'
import { validateFinalizationReceipt } from './finalization-contract.mjs'
import { reviewReceiptDialect } from './v4-finalization-contract.mjs'
import { recordAutopilot } from './v4-story-runner.mjs'
import { recordHumanApproval } from './complete-story.mjs'
import { inspectCompletion } from './check-story-completion.mjs'

const directory = fileURLToPath(new URL('.', import.meta.url))
const sources = readdirSync(directory).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && !name.includes('fixture'))
  .map(name => ({ name, text: readFileSync(path.join(directory, name), 'utf8') }))
const constants = new Map(sources.flatMap(source => [...source.text.matchAll(/\bconst\s+(\w*SCHEMA_VERSION)\s*=\s*(\d+)\b/g)]
  .map(match => [match[1], Number(match[2])])) )
function version(value) {
  const result = /^\d+$/.test(value) ? Number(value) : constants.get(value)
  assert.ok(Number.isSafeInteger(result), `schema constant ${value} must resolve to a version`)
  return result
}

test('registry writer has a version-keyed reader and retains the v1 reader', () => {
  assert.equal(typeof registry.REGISTRY_READERS?.[registry.REGISTRY_SCHEMA_VERSION], 'function')
  assert.equal(typeof registry.REGISTRY_READERS?.[1], 'function')
  const f = createRegistryFixture()
  try {
    const claimed = registry.claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'schema-test' })
    assert.equal(claimed.status, 'APPLIED')
    assert.deepEqual(registry.REGISTRY_READERS[registry.REGISTRY_SCHEMA_VERSION](claimed.record, '9.1'), claimed.record)
    const legacy = { ...claimed.record, schemaVersion: 1 }
    assert.deepEqual(registry.REGISTRY_READERS[1](legacy, '9.1'), legacy)
    assert.equal(registry.REGISTRY_READERS[1]({ ...legacy, schemaVersion: 99 }, '9.1'), null)
  } finally { f.cleanup() }
})

test('every emitted receipt schema has a reader, including legacy receipts', () => {
  const writers = sources.flatMap(source => [...source.text.matchAll(/(?:\b\w*[Rr]eceipt\s*=\s*[^;]{0,100}?|function\s+\w*[Rr]eceipt\w*\([^)]*\)\s*\{[\s\S]{0,300}?return\s*)\{\s*schema_version:\s*(\d+|\w*SCHEMA_VERSION)\s*,[\s\S]{0,220}?kind:\s*['"]([^'"]+)['"]/g)]
    .map(match => ({ file: source.name, version: version(match[1]), kind: match[2] })))
  for (const kind of ['implementation', 'verification', 'review', 'story_finalization']) {
    assert.ok(writers.some(writer => writer.kind === kind), `discover ${kind} writer`)
    writers.push({ file: 'legacy receipt', version: 1, kind })
  }
  const f = createCompletionFixture()
  try {
    const plan = frontmatter(f.readPlan()), slice = plan.slices[0]
    const originals = Object.fromEntries(Object.entries(slice.receipt_refs).map(([kind, ref]) => [kind, JSON.parse(f.read(ref.path))]))
    for (const writer of writers) {
      const label = `${writer.file}: ${writer.kind} v${writer.version}`
      if (writer.kind === 'story_finalization') {
        const receipt = { ...f.finalization, schema_version: writer.version }
        assert.equal(validateFinalizationReceipt(f.root, plan, 'receipts/finalization.json', receipt).errors
          .includes('INVALID_FINALIZATION_SCHEMA_VERSION'), false, label)
      } else {
        assert.ok(['implementation', 'verification', 'review'].includes(writer.kind), `add reader coverage for ${label}`)
        const ref = slice.receipt_refs[writer.kind]
        const receipt = { ...originals[writer.kind], schema_version: writer.version }
        if (writer.kind === 'review' && writer.version === 2) {
          receipt.judgment = 'APPROVE'
          delete receipt.verdict
        }
        f.write(ref.path, JSON.stringify(receipt))
        ref.digest = receiptDigest(receipt)
        assert.equal(readReceipt(f.root, plan, slice.id, writer.kind).errors.includes('INVALID_RECEIPT_IDENTITY'), false, label)
        if (writer.kind === 'review') assert.notEqual(reviewReceiptDialect(receipt), 'invalid', label)
      }
    }
  } finally { f.cleanup() }
})

test('Plan helper schema versions and nested authority records have readers', () => {
  const helperSources = sources.filter(source => /story-plan|v4-action-kernel|v4-story-runner|complete-story|check-story-completion/.test(source.name))
  const planVersions = new Set([1, 2])
  for (const source of helperSources) {
    for (const match of source.text.matchAll(/(?:plan|descriptor|originalPlan)\.schema_version\s*(?:===|!==)\s*(\d+|\w*SCHEMA_VERSION)/g)) planVersions.add(version(match[1]))
  }
  for (const schemaVersion of planVersions) {
    assert.ok([1, 2].includes(schemaVersion), `add a fixture and reader for Plan v${schemaVersion}`)
    const f = createV4Fixture({ schemaVersion })
    try { assert.equal(readPlan(f.root, '9.1').valid, true, `Plan v${schemaVersion}`) }
    finally { f.cleanup() }
  }
  const f = createV4Fixture({ schemaVersion: 2 })
  try {
    const head = f.git(['rev-parse', 'HEAD'])
    assert.equal(recordAutopilot(f.root, '9.1', head, { authorization: {
      action: 'authorize_autopilot', story_id: '9.1', lead_vendor: 'codex', budgets: {}
    } }).status, 'AUTHORIZED')
    const plan = frontmatter(readFileSync(f.paths.plan, 'utf8'))
    assert.deepEqual(validateAutopilot(f.root, path.relative(f.root, f.paths.plan).replaceAll('\\', '/'), plan.autopilot), [])
    for (const match of helperSources.find(source => source.name === 'v4-story-runner.mjs').text.matchAll(/schema_version:\s*(\d+|\w*SCHEMA_VERSION)/g)) {
      assert.deepEqual(validateAutopilot(f.root, path.relative(f.root, f.paths.plan).replaceAll('\\', '/'),
        { ...plan.autopilot, schema_version: version(match[1]) }), [], 'autopilot writer version has a reader')
    }
    writeFileSync(f.paths.plan, readFileSync(f.paths.plan, 'utf8').replace('schema_version: 2', 'schema_version: 99'))
    assert.ok(readPlan(f.root, '9.1').reasons.includes('UNSUPPORTED_SCHEMA'))
  } finally { f.cleanup() }
  const completion = createCompletionFixture()
  try {
    assert.equal(recordHumanApproval(completion.root, '9.1', completion.head,
      { action: 'approve_exact_scope', disclosures_acknowledged: true }).status, 'APPROVAL_DURABLE_PENDING_COMPLETION')
    const approvedHead = completion.refreshHead()
    const before = completion.readPlan(), approval = frontmatter(before).human_approval
    assert.ok(approval)
    const approvalSource = helperSources.find(source => source.name === 'check-story-completion.mjs').text
    const emitted = [...approvalSource.slice(approvalSource.indexOf('export function approvalRecordForSnapshot')).matchAll(/schema_version:\s*(\d+|\w*SCHEMA_VERSION)/g)]
    assert.ok(emitted.length)
    for (const match of emitted) {
      completion.write('_bmad-output/implementation-artifacts/story-9-1-plan.md', before.replace(
        /human_approval:\s*\r?\n  schema_version: \d+/, `human_approval:\n  schema_version: ${version(match[1])}`))
      assert.equal(inspectCompletion(completion.root, '9.1', approvedHead).reasons.includes('INVALID_HUMAN_APPROVAL_SCHEMA_VERSION'), false)
    }
  } finally { completion.cleanup() }
})
