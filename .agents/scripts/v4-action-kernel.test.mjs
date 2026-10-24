import { PLAN, SPRINT, POINTER, RECEIPT, fixture, checkpointRequest } from './v4-kernel-fixture.mjs'
import { git, write, digest } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { receiptDigest } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { checkpointImplementation, inspectActionTransaction, prepareAction } from './v4-action-kernel.mjs'
import * as kernel from './v4-action-kernel.mjs'
import { transactionIdentity } from './v4-slice-transaction.mjs'
import { claimStory } from './story-registry.mjs'

test('effective risk defaults to Story and uses only the requested slice risk', () => {
  const plan = { risk: { level: 'HIGH', flags: ['security'] }, current_slice: 'A', slices: [
    { id: 'A', risk: { level: 'LOW', flags: [] } }, { id: 'B' },
  ] }
  assert.equal(kernel.riskLevel(plan, {}), 'LOW')
  assert.equal(kernel.riskLevel(plan, { risk: 'MEDIUM' }), 'MEDIUM')
  assert.equal(kernel.riskLevel(plan, { slice_id: 'B' }), 'HIGH')
  assert.equal(kernel.riskLevel({ risk: { level: 'MEDIUM' } }, {}), 'MEDIUM')
  assert.throws(() => kernel.riskLevel(plan, { slice_id: 'B', risk: 'LOW' }), /RISK_DOWNGRADE_FORBIDDEN/)
})

test('Plan risk flags become canonical mandatory escalation flags', () => {
  assert.deepEqual(kernel.mandatoryJudgmentFlags({ risk: { level: 'HIGH', flags: ['security', 'idempotency', 'shared_boundary', 'public_contract'] } }), [
    'CONCURRENCY_STATE', 'PUBLIC_CONTRACT', 'SECURITY_AUTH'
  ])
})

test('implementation metadata cannot remove or alter autopilot authority', () => {
  const f = fixture('v2')
  try {
    const declared = '    scope:\n      paths: [src/feature.txt]\n'
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('    depends_on: []', '    depends_on: []\n' + declared.trimEnd()))
    f.request.plan_template = f.request.plan_template.replace('    depends_on: []', '    depends_on: []\n' + declared.trimEnd())
    git(f.root, 'add', PLAN)
    git(f.root, 'commit', '-qm', 'fixture registry scope')
    f.head = git(f.root, 'rev-parse', 'HEAD')
    f.request.expected_head = f.head
    assert.equal(claimStory(f.root, '9.1', { worktree: f.root, leadVendor: 'codex', session: 'fixture' }).status, 'APPLIED')
    f.request.lead_generation = 1
    const plan = readFileSync(path.join(f.root, PLAN), 'utf8')
    const authority = ['autopilot:', '  schema_version: 1', '  authorized_at: "2026-10-08T00:00:00.000Z"',
      `  authorized_plan_digest: ${digest(plan)}`, `  authorized_head: ${f.head}`,
      '  budgets:', '    max_slices: 1', '    max_rework_per_slice: 0', '    max_minutes_per_slice: 30',
      '  lead_vendor: codex', '  revoked: false', ''].join('\n')
    write(f.root, PLAN, plan.replace('blockers: []', authority + 'blockers: []'))
    git(f.root, 'add', PLAN)
    git(f.root, 'commit', '-qm', 'fixture autopilot authority')
    f.request.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.notEqual(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.ok(result.reasons.includes('AUTOPILOT_AUTHORITY_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('schema v2 commits implementation then Plan plus receipt', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(result.next_action, { kind: 'verify_slice', target: 'A' })
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.checkpoint_commit).split(/\r?\n/), ['src/feature.txt'])
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, RECEIPT].sort())
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '3')
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const receipt = JSON.parse(readFileSync(path.join(f.root, RECEIPT), 'utf8'))
    assert.equal(plan.slices[0].receipt_refs.implementation.digest, receiptDigest(receipt))
    assert.equal(receipt.checkpoint_commit, result.checkpoint_commit)
    assert.equal(receipt.worker, undefined)
    assert.equal(inspectActionTransaction(f.root, prepared.preview.transaction_id).status, 'COMPLETE')
  } finally { f.cleanup() }
})

test('a CRLF or mixed-EOL plan template commits as LF under core.autocrlf', () => {
  // Windows checkouts with core.autocrlf=true hand the Lead a CRLF Plan; a
  // template mixing its CRLF lines with new LF lines once failed with
  // COMMITTED_METADATA_MISMATCH because Git normalized the committed blob (G5).
  const f = fixture('v2', { autocrlf: true })
  try {
    const lines = f.request.plan_template.split('\n')
    f.request.plan_template = lines.slice(0, 10).join('\r\n') + '\r\n' + lines.slice(10).join('\n')
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    const working = readFileSync(path.join(f.root, PLAN), 'utf8')
    assert.equal(working.includes('\r'), false)
    assert.equal(git(f.root, 'show', `${result.metadata_commit}:${PLAN}`), working.trimEnd())
    assert.equal(git(f.root, 'status', '--porcelain'), '')
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    assert.equal(inspectActionTransaction(f.root, prepared.preview.transaction_id).status, 'COMPLETE')
  } finally { f.cleanup() }
})

test('repository checkouts keep V4 Story artifacts LF', () => {
  // The kernel fix covers templates; .gitattributes keeps fresh worktree
  // checkouts LF so Leads never start from a CRLF Plan (G5 F-G5-1).
  const repository = fileURLToPath(new URL('../..', import.meta.url))
  for (const file of [PLAN, SPRINT, RECEIPT]) {
    assert.equal(git(repository, 'check-attr', 'eol', '--', file), `${file}: eol: lf`)
  }
})

test('checkpoint metadata cannot add committed slice risk', () => {
  const f = fixture('v2')
  try {
    const altered = f.request.plan_template.replace('    depends_on: []', '    depends_on: []\n    risk: \n      level: LOW\n      flags: []')
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.equal(result.status, 'RECOVERY_REQUIRED', JSON.stringify(result))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('checkpoint metadata cannot change another slice risk', () => {
  const f = fixture('v2')
  try {
    const other = '  - id: B\n    status: pending\n    task_refs: [T-1]\n    depends_on: [A]\n'
    write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace('blockers: []', `${other}blockers: []`))
    git(f.root, 'add', '--', PLAN)
    git(f.root, 'commit', '-qm', 'fixture other pending slice')
    f.request.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const altered = f.request.plan_template.replace('blockers: []', `${other}    risk: \n      level: LOW\n      flags: []\nblockers: []`)
    const prepared = prepareAction(f.root, { ...f.request, plan_template: altered })
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, { plan_template: altered }))
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('schema v1 metadata commit is Plan-only', () => {
  const f = fixture('v1')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result))
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/), [PLAN])
    assert.equal(existsSync(path.join(f.root, RECEIPT)), false)
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
  } finally { f.cleanup() }
})

test('stale worktree/policy and wrong identity fail closed', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    assert.notEqual(prepareAction(f.root, { ...f.request, expected_head: '0'.repeat(40) }).status, 'READY')
    write(f.root, 'src/feature.txt', 'changed after preview\n')
    assert.equal(checkpointImplementation(f.root, checkpointRequest(f, prepared.preview)).status, 'STALE')
    assert.notEqual(prepareAction(f.root, { ...f.request, action: 'verify_slice' }).status, 'READY')
    assert.notEqual(prepareAction(f.root, { ...f.request, slice_id: 'B' }).status, 'READY')
  } finally { f.cleanup() }
  const dirty = fixture('v2')
  try {
    write(dirty.root, 'src/unknown.txt', 'unknown\n')
    git(dirty.root, 'add', 'src/unknown.txt')
    assert.notEqual(prepareAction(dirty.root, dirty.request).status, 'READY')
  } finally { dirty.cleanup() }
  const active = fixture('v2')
  try {
    write(active.root, POINTER, JSON.stringify({ schemaVersion: 1, activeRunId: 'active', storyId: '9.1', status: 'RUNNING' }) + '\n')
    assert.notEqual(prepareAction(active.root, active.request).status, 'READY')
  } finally { active.cleanup() }
})

test('same-scope lock blocks concurrent invocation', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const identity = transactionIdentity(f.root, { action: 'implement_slice', story_id: '9.1', slice_id: 'A', transaction_id: prepared.preview.transaction_id })
    mkdirSync(path.dirname(identity.lockPath), { recursive: true })
    writeFileSync(identity.lockPath, JSON.stringify({ transaction_id: 'other', scope_key: identity.scopeKey }) + '\n')
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview))
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.ok(result.reasons.includes('TRANSACTION_SCOPE_LOCKED'))
  } finally { f.cleanup() }
})

test('metadata cannot smuggle a completion or finalization authority', () => {
  const f = fixture('v2')
  try {
    const result = prepareAction(f.root, { ...f.request, plan_template: f.request.plan_template.replace('kind: verify_slice', 'kind: complete_story') })
    assert.notEqual(result.status, 'READY')
    assert.ok(result.reasons.includes('COMPLETION_AUTHORITY_FORBIDDEN'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})

test('mixed approval input cannot authorize implementation', () => {
  const f = fixture('v2')
  try {
    const prepared = prepareAction(f.root, f.request)
    assert.equal(prepared.status, 'READY', JSON.stringify(prepared))
    const result = checkpointImplementation(f.root, checkpointRequest(f, prepared.preview, {
      approval: { action: 'approve_exact_scope', disclosures_acknowledged: true }
    }))
    assert.equal(result.status, 'INVALID', JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})
