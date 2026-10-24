import { PLAN, git, write, fixture, state } from './v4-rework-fixture.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { prepareRework } from './v4-action-kernel.mjs'

test('rework cannot add, remove or change committed slice risk', () => {
  for (const [originalRisk, newRisk] of [[null, 'LOW'], ['LOW', null], ['LOW', 'MEDIUM']]) {
    const f = fixture()
    try {
      const marker = '    depends_on: []'
      const riskText = level => `${marker}\n    risk: \n      level: ${level}\n      flags: []`
      if (originalRisk) {
        write(f.root, PLAN, readFileSync(path.join(f.root, PLAN), 'utf8').replace(marker, riskText(originalRisk)))
        git(f.root, 'add', '--', PLAN)
        git(f.root, 'commit', '-qm', 'fixture committed slice risk')
        f.request.expected_head = git(f.root, 'rev-parse', 'HEAD')
      }
      const template = newRisk ? f.request.plan_template.replace(marker, riskText(newRisk)) : f.request.plan_template
      const before = state(f)
      const result = prepareRework(f.root, { ...f.request, plan_template: template })
      assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
      assert.deepEqual(state(f), before)
    } finally { f.cleanup() }
  }
})

test('rework cannot change another slice risk', () => {
  const f = fixture()
  try {
    const before = state(f)
    const result = prepareRework(f.root, { ...f.request, plan_template: f.request.plan_template.replace(
      '  - id: E\n', '  - id: E\n    risk: \n      level: LOW\n      flags: []\n') })
    assert.ok(result.reasons.includes('SLICE_EXECUTION_CONTRACT_CHANGED'), JSON.stringify(result))
    assert.deepEqual(state(f), before)
  } finally { f.cleanup() }
})
