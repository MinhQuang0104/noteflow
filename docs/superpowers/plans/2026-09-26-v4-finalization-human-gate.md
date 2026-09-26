# V4 Finalization to Human Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Enable one durable V4 'finalize_story' action that records completion evidence and moves a reviewed schema-v2 Story to an explicit Human Gate without executing 'complete_story'.

**Architecture:** A pure finalization contract validates immutable receipt data. A transaction module prepares completion-only Story content, receipt, Plan, and sprint bytes, then commits exact paths after fresh guards. A Runner authority module consumes the read-only finalization helper and exposes only the authorized review transition; validators and recovery classify post-finalization and partial states.

**Tech Stack:** Node.js ESM, node:test, Git CLI, repository-local YAML/frontmatter parsers, SHA-256 digests.

**Spec:** docs/superpowers/specs/2026-09-26-v4-finalization-human-gate-design.md

## Global Constraints

- Do not execute finalization on actual Story 2.3; only run its read-only checks.
- Do not change actual Story 2.3, its Plan, sprint status, receipts, or product scope.
- Do not use broad Git staging; stage exact infrastructure paths only.
- Do not write Human approval, execute 'complete_story', enable automatic Human Gate, or add a review-to-done automatic edge.
- Preserve schema-v1 validation and existing lifecycle regression semantics.
- Preserve canonical INCOMPLETE evidence and never relabel it as plain PASS.
- Keep the pre-existing untracked pycache out of all staging.

---

### Task 1: Finalization contract and completion renderer

**Files:**
- Create: .agents/scripts/finalization-contract.mjs
- Create: .agents/scripts/finalization-contract.test.mjs

**Interfaces:**
- stableFinalizationDigest(value): string
- validateFinalizationReceipt(root, plan, receiptPath): { receipt, errors }
- renderCompletionBlock(preview, story): string
- finalizationDisposition(helperDisposition): string

- [x] **Step 1: Write the failing contract tests**

```js
test('receipt digest is stable and excludes approval', () => {
  const receipt = makeReceipt()
  assert.equal('human_approval' in receipt, false)
  assert.match(stableFinalizationDigest(receipt), /^sha256:[0-9a-f]{64}$/)
})

test('completion renderer labels fallback evidence and canonical disclosure separately', () => {
  const block = renderCompletionBlock(previewWithFallbackDisclosure(), storyFixture())
  assert.match(block, /AC-1/)
  assert.match(block, /fallback/i)
  assert.match(block, /INCOMPLETE/)
  assert.match(block, /File List/)
  assert.doesNotMatch(block, /php artisan|npm\\.cmd|node \\.agents/)
})
```

- [x] **Step 2:** Run node --test .agents/scripts/finalization-contract.test.mjs and confirm the missing-module failure.
- [x] **Step 3:** Implement stable sorted-key hashing, receipt binding validation, disposition mapping, and compact completion rendering.
- [x] **Step 4:** Re-run the focused test and confirm it passes.

The renderer must preserve AC IDs, include representative evidence and receipt identities, label fallback evidence, keep canonical disposition separate, derive File List from helper scope, and omit full command logs.

### Task 2: Schema-v2 review state and complete_story

**Files:**
- Modify: .agents/scripts/v4-separated-plan.mjs
- Modify: .agents/scripts/check-story-plan.test.mjs
- Modify: .agents/scripts/dual-schema.test.mjs

**Interfaces:**
- next_action.kind: complete_story is valid only with target: story in schema-v2.
- Review state requires lifecycle review, execution complete, every slice reviewed, a valid finalization receipt, and absent/null Human approval.
- Schema-v1 keeps its existing action set and rules.

- [x] **Step 1:** Add failing fixtures for a valid review Plan, missing receipt, mismatched receipt digest, and schema-v1 complete_story.
- [x] **Step 2:** Run node --test .agents/scripts/check-story-plan.test.mjs .agents/scripts/dual-schema.test.mjs; confirm the new fixtures fail.
- [x] **Step 3:** Add schema-v2-only action, receipt, and finalization validation.
- [x] **Step 4:** Re-run the same command and confirm all existing schema tests still pass.

### Task 3: Read-only readiness and crash recovery

**Files:**
- Modify: .agents/scripts/check-story-finalization.mjs
- Modify: .agents/scripts/check-story-finalization.test.mjs
- Modify: .agents/scripts/check-story-finalization.architecture.test.mjs

**Interfaces:**
- Keep inspectFinalization(root, storyId, expectedHead) read-only and preserve pre-finalization READY_WITH_DISCLOSURES.
- Export classifyFinalizationRecovery(root, storyId, expectedHead).
- Classify UNCOMMITTED_FINALIZATION, ORPHAN_FINALIZATION_RECEIPT, PARTIAL_PLAN_ONLY, PARTIAL_SPRINT_ONLY, PARTIAL_STORY_ONLY, and healthy HUMAN_GATE_PENDING.

- [x] **Step 1:** Add temp-repository tests for each recovery classification and committed review without approval.
- [x] **Step 2:** Run node --test .agents/scripts/check-story-finalization.test.mjs .agents/scripts/check-story-finalization.architecture.test.mjs; confirm red tests.
- [x] **Step 3:** Implement read-only projection/hash checks without deleting or repairing partial artifacts.
- [x] **Step 4:** Re-run the focused helper tests and confirm green.

### Task 4: Pure preview and exact finalization transaction

**Files:**
- Create: .agents/scripts/finalize-story.mjs
- Create: .agents/scripts/finalize-story.test.mjs

**Interfaces:**
- buildFinalizationPreview(root, storyId, expectedHead)
- prepareFinalization(root, storyId, expectedHead)
- applyFinalization(root, storyId, expectedHead)
- FINALIZATION_COMMIT_MESSAGE(storyId)

- [x] **Step 1:** Write failing fixture tests for normative digest stability, completion-only Story changes, receipt/Plan scope binding, wrong HEAD, dirty scope, and four exact paths in one commit.
- [x] **Step 2:** Run node --test .agents/scripts/finalize-story.test.mjs and confirm the missing-implementation failure.
- [x] **Step 3:** Implement the pure preview.

The preview changes only Story status/completion markers, Plan lifecycle/execution/finalization/next-action/approval fields, and the sprint Story entry. The receipt contains Story/upstream/slice/receipt/AC/disclosure/scope bindings, prepared_from_head, lifecycle_from/target, and no approval field. The final disposition is SATISFIED_WITH_DISCLOSURES when the helper returns READY_WITH_DISCLOSURES.

- [x] **Step 4:** Implement fresh guards, unique temporary files, exact renames, exact staging, staged-set validation, and git commit --only with the four paths.
- [x] **Step 5:** Re-run the focused transaction tests and confirm HUMAN_GATE_REQUIRED, lifecycle review, complete_story successor, no approval, and one commit.

### Task 5: Runner authority and lifecycle guard

**Files:**
- Create: .agents/scripts/v4-story-runner.mjs
- Create: .agents/scripts/v4-story-runner.test.mjs
- Modify: .agents/scripts/reconcile-story-lifecycle.mjs
- Modify: .agents/scripts/reconcile-story-lifecycle.test.mjs

**Interfaces:**
- authorizeAction(root, storyId, action, expectedHead)
- runAction(root, storyId, expectedHead)

- [x] **Step 1:** Add failing tests for finalize preconditions, wrong action/HEAD/helper status, one action per invocation, Human Gate snapshot, and complete_story/continue rejection.
- [x] **Step 2:** Run node --test .agents/scripts/v4-story-runner.test.mjs .agents/scripts/reconcile-story-lifecycle.test.mjs; confirm red tests.
- [x] **Step 3:** Implement finalization authorization and invoke only the finalization transaction. Existing reconcile/implement/verify behavior must remain delegated and unaffected.
- [x] **Step 4:** Keep review -> done Human-authority-only and ensure lifecycle reconciliation never independently authorizes done.
- [x] **Step 5:** Re-run the focused Runner/lifecycle tests and confirm green.

### Task 6: Authority docs and complete matrix

**Files:**
- Modify: .agents/skills/v4-story-runner/SKILL.md
- Modify: .agents/routing/task-router.md
- Modify: .agents/docs/v4-artifact-contract.md
- Modify: .agents/scripts/check-story-finalization.architecture.test.mjs
- Extend: the focused fixture test files from Tasks 1–5 with the requested matrix.

- [x] **Step 1:** Update authority docs to say enabled reconcile_lifecycle, implement_slice, verify_slice, and finalize_story -> review; disabled standalone review_slice, complete_story execution, automatic Human Gate, automatic review-to-done, and V3 fallback.
- [x] **Step 2:** Add architecture assertions for immutable receipt, explicit approval, generic-continue rejection, and canonical disclosure preservation.
- [x] **Step 3:** Run node --test .agents/scripts/*.test.mjs; fix only root causes and keep assertions strict.
- [x] **Step 4:** Run node --check on every new mjs file and git diff --check.

### Task 7: Actual Story 2.3 read-only audit and single commit

**Files:**
- No actual Story 2.3 file may change.

- [x] **Step 1:** Capture entry hashes for the Story, Plan, sprint status, Story 2.3 receipts, and product scope.
- [x] **Step 2:** Run node .agents/scripts/check-story-plan.mjs check 2.3; require READY, lifecycle in-progress, execution in-progress, and next action finalize_story:story.
- [x] **Step 3:** Run node .agents/scripts/check-story-finalization.mjs check 2.3 --expected-head <new-head>; require READY_WITH_DISCLOSURES, all slices reviewed, and no finalization receipt.
- [x] **Step 4:** Assert the Story 2.3 finalization receipt does not exist, and compare all protected hashes to entry values.
- [x] **Step 5:** Inspect exact changed paths, stage only infrastructure/runtime/test/doc files, verify git diff --cached --name-only, and create exactly feat(agent): enable V4 finalization to Human Gate.
- [x] **Step 6:** Run the full tests and actual read-only checks again against the committed HEAD before reporting PASS.
