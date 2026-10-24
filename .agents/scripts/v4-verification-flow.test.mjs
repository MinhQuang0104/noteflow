import { PLAN, VERIFICATION_RECEIPT, REVIEW_RECEIPT, verificationTemplate, fixture, withSliceRisk, prepareVerification } from './v4-verification-fixture.mjs'
import { git } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { receiptDigest, validateReceipt } from './check-artifact-contract.mjs'
import { frontmatter, validate as validateStoryPlan } from './check-story-plan.mjs'
import { prepareAction, verifySlice } from './v4-action-kernel.mjs'

test('LOW PASS runs canonical and focused checks then persists only verification metadata', () => {
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: verificationTemplate(f, false)
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    assert.deepEqual(result.policy, { decision: 'PROGRESS', reasons: ['LOW_CANONICAL_PASS_NO_FLAGS'] })
    assert.equal(result.next_action.kind, 'finalize_story')
    assert.deepEqual(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.metadata_commit).split(/\r?\n/).sort(), [PLAN, VERIFICATION_RECEIPT].sort())
    const plan = frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8'))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(plan.slices[0].status, 'verified')
    assert.equal(plan.slices[0].receipt_refs.verification.digest, receiptDigest(receipt))
    assert.equal(Object.hasOwn(receipt, 'policy'), false)
    assert.equal(Object.hasOwn(plan.slices[0], 'policy'), false)
    assert.deepEqual(validateReceipt(f.root, plan, 'A', 'verification'), [])
    assert.equal(validateStoryPlan(f.root, '9.1').status, 'READY')
    assert.equal(git(f.root, 'status', '--porcelain'), '')
  } finally { f.cleanup() }
})

test('LOW slice within HIGH Story takes the NO_REVIEW path and requests can raise risk', () => {
  const f = fixture('HIGH', { sliceRisk: 'LOW' })
  try {
    const prepared = prepareVerification(f)
    assert.equal(prepared.preview.risk, 'LOW')
    const raised = prepareAction(f.root, { ...f.verifyRequest, risk: 'HIGH' })
    assert.equal(raised.preview.risk, 'HIGH', JSON.stringify(raised))
    const result = verifySlice(f.root, {
      ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: withSliceRisk(verificationTemplate(f, false), 'LOW'),
    })
    assert.equal(result.status, 'APPLIED', JSON.stringify(result))
    const receipt = JSON.parse(readFileSync(path.join(f.root, VERIFICATION_RECEIPT), 'utf8'))
    assert.equal(receipt.escalation.decision, 'NO_REVIEW')
    assert.equal(existsSync(path.join(f.root, REVIEW_RECEIPT)), false)
    assert.equal(frontmatter(readFileSync(path.join(f.root, PLAN), 'utf8')).slices[0].risk.level, 'LOW')
  } finally { f.cleanup() }
})
