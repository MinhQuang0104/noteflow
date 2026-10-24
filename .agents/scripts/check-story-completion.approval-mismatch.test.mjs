import { digest, persistApproval } from './check-story-completion-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectCompletion } from './check-story-completion.mjs'
import { createCompletionFixture } from './completion-fixture.mjs'

for (const [field, mutate] of [
  ['story digest', { story_normative_digest: digest('1') }],
  ['receipt digest', { finalization_receipt_digest: digest('1') }],
  ['Done Gate digest', { done_gate_summary_digest: digest('1') }],
  ['scope digest', { scope_paths_digest: digest('1') }],
  ['approved review HEAD', { approved_review_head: '0'.repeat(40) }],
  ['approved HEAD', { approved_commit: '0'.repeat(40) }]
]) test(`approval ${field} mismatch is stale`, () => {
  const f = createCompletionFixture()
  try {
    persistApproval(f, mutate)
    const result = inspectCompletion(f.root, '9.1', f.head)
    assert.equal(result.status, 'STALE', JSON.stringify(result))
  } finally {
    f.cleanup()
  }
})
