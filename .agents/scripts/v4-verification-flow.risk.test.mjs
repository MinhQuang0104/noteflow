import { PLAN, verificationTemplate, fixture, withSliceRisk, prepareVerification } from './v4-verification-fixture.mjs'
import { git, write } from './v4-test-helpers.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { prepareAction, verifySlice } from './v4-action-kernel.mjs'

test('verification metadata cannot add, remove or change committed slice risk', () => {
  for (const [original, changed] of [['LOW', undefined], ['LOW', 'MEDIUM']]) {
    const f = fixture('HIGH', { sliceRisk: original })
    try {
      const prepared = prepareVerification(f)
      const result = verifySlice(f.root, {
        ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
        plan_template: withSliceRisk(verificationTemplate(f, false), changed),
      })
      assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
    } finally { f.cleanup() }
  }
  const f = fixture('LOW')
  try {
    const prepared = prepareVerification(f)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview,
      plan_template: withSliceRisk(verificationTemplate(f, false), 'LOW') })
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

test('verification metadata cannot change another slice risk', () => {
  const f = fixture('LOW')
  try {
    const other = '  - id: B\n    status: pending\n    task_refs: [T-1]\n    depends_on: [A]\n'
    const before = readFileSync(path.join(f.root, PLAN), 'utf8')
    write(f.root, PLAN, before.replace('next_action:', `${other}next_action:`))
    git(f.root, 'add', '--', PLAN)
    git(f.root, 'commit', '-qm', 'fixture another pending slice')
    f.verifyRequest.expected_head = git(f.root, 'rev-parse', 'HEAD')
    const prepared = prepareVerification(f)
    const template = verificationTemplate(f, false).replace('next_action:', `${other}    risk: \n      level: LOW\n      flags: []\nnext_action:`)
    const result = verifySlice(f.root, { ...f.verifyRequest, operation: 'verify', preview: prepared.preview, plan_template: template })
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
  } finally { f.cleanup() }
})

for (const plannedRisk of ['MEDIUM', 'HIGH']) test(`caller cannot lower a ${plannedRisk} Plan risk before verification preview`, () => {
  const f = fixture(plannedRisk)
  try {
    const result = prepareAction(f.root, { ...f.verifyRequest, risk: 'LOW' })
    assert.notEqual(result.status, 'READY', JSON.stringify(result))
    assert.ok(result.reasons.includes('RISK_DOWNGRADE_FORBIDDEN'), JSON.stringify(result))
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.head)
  } finally { f.cleanup() }
})
