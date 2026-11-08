import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { childPrompt } from './v4-overnight.mjs'

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
const REFERENCE = '.agents/skills/v4-story-runner/references/runner-payloads.md'

test('runner payload recipes are a lazy reference for implement and verify and are named by the router and the overnight child prompt', () => {
  const compiler = read('.agents/scripts/compile-v4-context.mjs')
  for (const action of ['implement_slice', 'verify_slice']) {
    const block = compiler.slice(compiler.indexOf(`['${action}', {`), compiler.indexOf('stop:', compiler.indexOf(`['${action}', {`)))
    assert.match(block, /references\/runner-payloads\.md/, action)
  }
  assert.match(read('.agents/routing/task-router.md'), /`references\/runner-payloads\.md` only when building a Runner payload/)
  assert.match(childPrompt({ id: '2.4', worktree: 'W', generation: 1 }, { next_action: { kind: 'implement_slice' } }, 'a'.repeat(40)), /references\/runner-payloads\.md/)
})

test('runner payload recipes match the kernel tokens, limits and refusal codes they cite', () => {
  const reference = read(REFERENCE)
  const kernel = read('.agents/scripts/v4-action-kernel.mjs')
  const fixture = read('.agents/scripts/v4-verification-fixture.mjs')
  for (const token of ['BASELINE_COMMIT', 'CHECKPOINT_COMMIT', 'SUBJECT_DIGEST', 'CHANGED_PATHS_SHA256', 'RECEIPT_DIGEST']) {
    assert.ok(reference.includes(`{{${token}}}`), token)
    assert.ok(kernel.includes(token), token)
  }
  for (const token of ['CURRENT_SLICE', 'TARGET_STATUS', 'VERIFICATION_STATUS', 'CANONICAL_STATUS', 'ESCALATION_DECISION',
    'PROGRESSION_ELIGIBLE', 'REVIEW_JUDGMENT', 'REVIEWED_COMMIT', 'RISK_CONTEXT_DIGEST', 'REVIEWER', 'NEXT_ACTION_KIND', 'NEXT_ACTION_TARGET']) {
    assert.ok(reference.includes(`{{${token}}}`), token)
    assert.ok(fixture.includes(`{{${token}}}`), token)
  }
  for (const code of ['PREVIEW_REQUIRED', 'PLAN_TEMPLATE_REQUIRED', 'PLAN_TEMPLATE_UNRESOLVED', 'IMPLEMENTATION_SCOPE_NOT_DIRTY', 'DIRTY_SCOPE_MISMATCH']) {
    assert.ok(reference.includes(code), code)
    assert.ok(kernel.includes(`'${code}'`), code)
  }
  assert.match(read('.agents/scripts/v4-check-executor.mjs'), /const MAX_TIMEOUT_MS = 120_000/)
  assert.match(reference, /`timeout_ms` may not exceed 120000/)
  assert.match(read('.agents/scripts/check-slice-implementation.mjs'), /RESUME_SCOPE_MUST_EXACTLY_MATCH_RELEVANT_DIRTY_PATHS/)
  assert.match(read('.agents/scripts/v4-finalization-contract.mjs'), /export function digestValue/)
})
