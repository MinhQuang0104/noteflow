import { TWO_PATHS, persistApproval } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture, PLAN, SPRINT, STORY } from './completion-fixture.mjs'

for (const [label, edit, expected] of [
  ['Story-only done projection', f => f.write(STORY, f.read(STORY).replace('status: review', 'status: done')), 'PARTIAL_STORY_ONLY'],
  ['Plan-only done projection', f => f.write(PLAN, f.readPlan().replace('lifecycle_snapshot: "review"', 'lifecycle_snapshot: "done"').replace('next_action:\n  kind: "complete_story"\n  target: "story"', 'next_action: null')), 'PARTIAL_PLAN_ONLY'],
  ['sprint-only done projection', f => f.write(SPRINT, 'development_status:\n  9-1-fixture: done\n'), 'PARTIAL_SPRINT_ONLY']
]) test(`${label} requires reconciliation`, () => {
  const f = createCompletionFixture()
  try {
    edit(f)
    f.git('add', '.')
    f.git('commit', '-qm', 'partial completion projection')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'RECONCILIATION_REQUIRED', JSON.stringify(result))
    assert.equal(result.recovery_classification, expected)
  } finally {
    f.cleanup()
  }
})

test('product drift after durable approval is stale', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f)
    f.write('src/implementation.txt', 'drift after approval\n')
    f.git('add', 'src/implementation.txt')
    f.git('commit', '-qm', 'product drift')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL'))
  } finally {
    f.cleanup()
  }
})

test('uncommitted product drift after durable approval is stale', () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f)
    f.write('src/implementation.txt', 'uncommitted drift after approval\n')
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
    assert.ok(result.reasons.includes('PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL'))
  } finally {
    f.cleanup()
  }
})

test('exact-scope multi-path review evidence keeps completion at the Human Gate', () => {
  const f = createCompletionFixture({ implementationPaths: TWO_PATHS })
  try {
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'BLOCKED', JSON.stringify(result))
    assert.deepEqual(result.reasons, ['HUMAN_APPROVAL_REQUIRED'])
  } finally {
    f.cleanup()
  }
})

test('review receipt edited after Plan binding fails closed', () => {
  const f = createCompletionFixture()
  try {
    const review = JSON.parse(f.read('receipts/review.json'))
    f.write('receipts/review.json', JSON.stringify({ ...review, evidence_refs: [] }))
    f.git('add', '.')
    f.git('commit', '-qm', 'tamper review receipt')
    f.refreshHead()
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.ready, false, JSON.stringify(result))
    assert.notEqual(result.status, 'READY')
  } finally {
    f.cleanup()
  }
})
