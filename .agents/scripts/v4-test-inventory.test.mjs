import test from 'node:test'
import assert from 'node:assert/strict'

import { INVENTORY_TEST, committedNames, compareTestNames, inventoryNames } from './v4-test-inventory.mjs'

test(INVENTORY_TEST, () => {
  const result = compareTestNames(inventoryNames(), committedNames())
  assert.deepEqual({ missing: result.missing, extra: result.extra }, { missing: [], extra: [] },
    'a test was added, removed, renamed or duplicated; if intended, run `node .agents/scripts/v4-test-inventory.mjs --write` and review the v4-test-names.json diff')
  assert.equal(result.actual, result.expected)
})
