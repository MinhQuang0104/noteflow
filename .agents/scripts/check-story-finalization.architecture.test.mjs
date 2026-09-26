import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(relative, 'utf8')

test('finalization helper is present and read-only', () => {
  const helper = read('.agents/scripts/check-story-finalization.mjs')
  assert.match(helper, /export function inspectFinalization/)
  assert.match(helper, /const CODES = \{ READY: 0, RECONCILIATION_REQUIRED: 1, STALE: 2, BLOCKED: 3, INVALID: 4, ERROR: 5 \}/)
  assert.doesNotMatch(helper, /writeFileSync|appendFileSync/)
  assert.doesNotMatch(helper, /git['"]\s*,\s*\[\s*['"](?:add|commit)/)
  assert.match(helper, /complete_story/)
})

test('Human Gate remains explicit and bound to immutable scope evidence', () => {
  const helper = read('.agents/scripts/check-story-finalization.mjs')
  assert.match(helper, /human_gate_required: true/)
  assert.match(helper, /human_approval_present: false/)
  assert.match(helper, /HUMAN_APPROVAL_STALE/)
  assert.match(helper, /scope_paths_digest/)
  assert.match(helper, /final_scoped_tree_digest/)
})

test('V4 runner enables finalization only through the Human Gate', () => {
  const runner = read('.agents/skills/v4-story-runner/SKILL.md')
  const router = read('.agents/routing/task-router.md')
  for (const text of [runner, router]) {
    assert.match(text, /finalize_story[\s\S]{0,220}(review|Human Gate)/i)
    assert.match(text, /complete_story[\s\S]{0,220}disabled/i)
  }
  assert.match(runner, /automatic[\s\S]{0,160}review[\s\S]{0,160}done[\s\S]{0,160}disabled/i)
})

test('artifact contract records disclosure and lifecycle authority', () => {
  const contract = read('.agents/docs/v4-artifact-contract.md')
  assert.match(contract, /READY_WITH_DISCLOSURES/)
  assert.match(contract, /not relabeled as `PASS`/)
  assert.match(contract, /sprint status/i)
  assert.match(contract, /never enables `finalize_story` or infers approval/)
})
