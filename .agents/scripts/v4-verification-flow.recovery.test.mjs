import { VERIFICATION_RECEIPT, verificationTemplate, fixture, prepareVerification } from './v4-verification-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { verifySlice } from './v4-action-kernel.mjs'
import { inspectActionTransaction, transactionIdentity } from './v4-slice-transaction.mjs'

test('verification metadata recovery resumes an interrupted commit without replay', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const first = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), fail_at: 'after-commit-hook'
    })
    assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    const recovered = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false), recovery_authorized: true,
      recovery_checkpoint: first.checkpoint_commit
    })
    assert.equal(recovered.status, 'NOOP', JSON.stringify(recovered))
    assert.equal(recovered.policy.decision, 'PROGRESS')
    assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('wrong verification successor is rejected before creating a transaction or lock', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false).replace('{{NEXT_ACTION_KIND}}', 'verify_slice').replace('{{NEXT_ACTION_TARGET}}', 'A')
    })
    assert.ok(result.reasons.includes('SUCCESSOR_PROJECTION_MISMATCH'), JSON.stringify(result))
    assert.equal(inspectActionTransaction(f.root, f.verifyRequest.transaction_id).status, 'NOT_FOUND')
    assert.equal(existsSync(transactionIdentity(f.root, f.verifyRequest).lockPath), false)
    assert.equal(existsSync(path.join(f.root, VERIFICATION_RECEIPT)), false)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

for (const failure of ['after-write', 'after-metadata-stage']) {
  test(`verification recovery resumes ${failure} without regenerating evidence`, () => {
    const f = fixture('LOW')
    try {
      const prepared = prepareVerification(f)
      const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
      const first = verifySlice(f.root, { ...input, fail_at: failure })
      assert.equal(first.status, 'RECOVERY_REQUIRED', JSON.stringify(first))
      const receiptBytes = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
      const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
      assert.equal(recovered.status, 'APPLIED', JSON.stringify(recovered))
      assert.equal(recovered.policy.decision, 'PROGRESS')
      assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), receiptBytes)
      assert.equal(git(f.root, 'rev-list', '--count', 'HEAD'), '4')
      assert.equal(git(f.root, 'status', '--porcelain'), '')
      assert.equal(verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit }).status, 'NOOP')
    } finally { f.cleanup() }
  })
}

test('interrupted metadata recovery rejects a changed receipt and preserves partial state', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const input = { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: verificationTemplate(f, false) }
    const first = verifySlice(f.root, { ...input, fail_at: 'after-write' })
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    receipt.commands[0].environment = 'tampered'
    write(f.root, VERIFICATION_RECEIPT, JSON.stringify(receipt) + '\n')
    const before = readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8')
    const recovered = verifySlice(f.root, { ...input, recovery_authorized: true, recovery_checkpoint: first.checkpoint_commit })
    assert.equal(recovered.status, 'RECOVERY_REQUIRED', JSON.stringify(recovered))
    assert.ok(recovered.reasons.includes('RECOVERY_METADATA_CONTENT_MISMATCH'), JSON.stringify(recovered))
    assert.equal(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'), before)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.ok(existsSync(first.lock_path))
  } finally { f.cleanup() }
})

test('structured alternate verification recovery rejects open findings before transaction mutation', () => {
  const f = fixture('HIGH')
  try {
    const prepared = prepareVerification(f)
    const identity = transactionIdentity(f.root, f.verifyRequest)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      recovery_authorized: true, recovery_checkpoint: f.head,
      review: { judgment: 'APPROVE', reviewer: { type: 'lead', vendor: 'codex', independent: false },
        findings: [{ id: 'F1', class: 'VALID', summary: 'Open', paths: ['src/feature.txt'] }] }
    })
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['REVIEW_FINDINGS_OPEN'])
    assert.equal(inspectActionTransaction(f.root, f.verifyRequest.transaction_id).status, 'NOT_FOUND')
    assert.equal(existsSync(identity.lockPath), false)
    assert.equal(existsSync(identity.journalPath), false)
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})
