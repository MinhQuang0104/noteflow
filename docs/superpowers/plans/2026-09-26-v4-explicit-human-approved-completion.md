# V4 Explicit Human-approved Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable schema-v2 `complete_story` only after a structured, exact-scope Human approval and move all lifecycle projections atomically from `review` to terminal `done`.

**Architecture:** A pure completion gate recomputes the finalization snapshot, validates the durable Plan approval, and classifies stale, partial, blocked, and terminal states without writes. The V4 Runner has a bounded structured approval action and a separate `complete_story` transaction; the latter commits only Story, Plan, and sprint metadata after fresh guards. Schema-v1 and the existing finalization-to-review edge remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, Git CLI, repository-local YAML/frontmatter parsers, SHA-256 digests.

**Spec:** `docs/superpowers/specs/2026-09-26-v4-finalization-human-gate-design.md` plus the Step 110 contract in the user request.

## Global Constraints

- Do not execute `finalize_story` or `complete_story` on actual Story 2.3.
- Do not write actual Story 2.3 artifacts, approval, finalization receipt, or product code.
- Use temporary Git fixture repositories for every mutation test.
- Preserve the immutable finalization receipt, Story normative digest, slice receipts, checkpoints, and AC evidence substance.
- Accept only structured explicit approval; `continue`, `next`, `go on`, `proceed`, and `ok` are not approval.
- Keep one durable action per invocation and keep V3 fallback, Orca, AGY, subagents, standalone review, and automatic approval disabled.
- Preserve schema-v1 rules and use `next_action: null` only for a fully consistent schema-v2 terminal Plan.
- Keep the existing untracked `_bmad/scripts/tests/__pycache__/` out of staging.

---

### Task 1: Completion contract and read-only gate

**Files:**
- Create: `.agents/scripts/check-story-completion.mjs`
- Create: `.agents/scripts/check-story-completion.test.mjs`
- Modify: `.agents/scripts/finalization-contract.mjs`

**Interfaces:**
- `inspectCompletion(root, storyId, expectedHead): CompletionResult`
- `completionSnapshot(root, storyId, expectedHead): HumanGateSnapshot`
- `approvalRecordForSnapshot(snapshot, approvedCommit, approvedAt): HumanApproval`
- `doneGateSummaryDigest(snapshot): string`

- [x] **Step 1: Write failing fixture tests** for review without approval, exact approval, generic continuation, every mismatched binding, missing/tampered receipt, product drift, and the terminal healthy state.
- [x] **Step 2: Run** `node --test .agents/scripts/check-story-completion.test.mjs` and confirm the missing helper/export failure.
- [x] **Step 3: Implement** pure digest/binding functions and a read-only gate with statuses `READY`, `RECONCILIATION_REQUIRED`, `STALE`, `BLOCKED`, `INVALID`, and `ERROR`.
- [x] **Step 4: Run** the focused completion tests and confirm the gate emits the exact preview fields, retains no sensitive identity, and never writes.

### Task 2: Schema-v2 approval and terminal Plan validation

**Files:**
- Modify: `.agents/scripts/v4-separated-plan.mjs`
- Modify: `.agents/scripts/check-story-plan.test.mjs`
- Modify: `.agents/scripts/dual-schema.test.mjs`
- Modify: `.agents/scripts/finalization-plan-state.test.mjs`

**Interfaces:**
- Review Plans accept an optional exact `human_approval` record and still require `complete_story` as the successor.
- Done Plans require consistent Story/Plan/sprint `done`, `execution_status: complete`, retained exact approval, valid finalization binding, and `next_action: null`.
- Schema-v1 keeps its existing action set and validation behavior.

- [x] **Step 1: Add failing tests** for valid approval, wrong approval fields, missing approval, terminal `next_action: null`, invalid terminal projections, and schema-v1 `complete_story`/terminal rejection.
- [x] **Step 2: Run** `node --test .agents/scripts/check-story-plan.test.mjs .agents/scripts/dual-schema.test.mjs .agents/scripts/finalization-plan-state.test.mjs` and confirm red tests.
- [x] **Step 3: Implement** strict approval shape/binding validation and the canonical schema-v2 terminal state.
- [x] **Step 4: Re-run** the focused validator suite and confirm schema-v1 remains unchanged.

### Task 3: Approval persistence and complete_story transaction

**Files:**
- Modify: `.agents/scripts/v4-story-runner.mjs`
- Modify: `.agents/scripts/v4-story-runner.test.mjs`
- Create: `.agents/scripts/complete-story.mjs`
- Create: `.agents/scripts/complete-story.test.mjs`

**Interfaces:**
- `recordHumanApproval(root, storyId, expectedHead, approvalInput): ApprovalResult`
- `prepareCompletion(root, storyId, expectedHead): CompletionPreparation`
- `applyCompletion(root, storyId, expectedHead): CompletionResult`
- `routeAction(input): RouteResult` accepts `complete_story` only with a fresh durable approval and preserves a one-action stop condition.

- [x] **Step 1: Add failing tests** for exact structured approval, approval preview-only, durable approval pending completion, missing approval, and all generic continuation strings.
- [x] **Step 2: Run** `node --test .agents/scripts/v4-story-runner.test.mjs .agents/scripts/complete-story.test.mjs` and confirm red tests.
- [x] **Step 3: Implement** explicit approval capture that recomputes/presents the exact snapshot, writes only Plan approval metadata, commits that one action, and never executes completion in the same call.
- [x] **Step 4: Add failing transaction tests** for review-to-done projections, exact three-path staging, preserved receipt/digest, terminal null action, stale approval, wrong next action, in-progress/done idempotence, and finalization receipt tamper.
- [x] **Step 5: Implement** fresh guards and atomic completion commit; fail closed on product/scope/receipt/disclosure/review drift.
- [x] **Step 6: Run** the focused Runner/transaction suites and inspect the exact fixture diffs.

### Task 4: Recovery, lifecycle authority, and documentation

**Files:**
- Modify: `.agents/scripts/check-story-finalization.mjs`
- Modify: `.agents/scripts/finalization-recovery.test.mjs`
- Modify: `.agents/scripts/reconcile-story-lifecycle.mjs`
- Modify: `.agents/scripts/reconcile-story-lifecycle.test.mjs`
- Modify: `.agents/skills/v4-story-runner/SKILL.md`
- Modify: `.agents/routing/task-router.md`
- Modify: `.agents/docs/v4-artifact-contract.md`

**Interfaces:**
- Recovery classifications add `APPROVAL_PREVIEW_ONLY`, `APPROVAL_DURABLE_PENDING_COMPLETION`, `STALE_APPROVAL`, and terminal healthy state while retaining non-mutating behavior.
- Lifecycle reconciliation may repair projections but cannot create approval or authorize `review -> done`.

- [x] **Step 1: Add failing recovery/authority tests** for Story-only, Plan-only, sprint-only, stale approval, approval preview, durable pending, fully consistent done, and no-auto-approval cases.
- [x] **Step 2: Run** the focused recovery/lifecycle tests and confirm red tests.
- [x] **Step 3: Implement** recovery classifications and explicit documentation of the enabled/disabled action surface.
- [x] **Step 4: Re-run** recovery/lifecycle tests and ensure no reconciliation path manufactures approval.

### Task 5: Full verification and single infrastructure commit

**Files:**
- Modify: only the infrastructure/runtime/test/docs paths above.

- [x] **Step 1: Run** `node --check` on every changed `.mjs` file and `git diff --check`.
- [x] **Step 2: Run** the explicit multi-file `node --test` batches; all 182 baseline/validator cases and 124 affected finalization/approval cases passed.
- [ ] **Step 3: Run** actual Story 2.3 read-only checks: `check-story-plan`, `check-story-finalization`, completion gate, receipt absence, and protected hash comparisons.
- [x] **Step 4: Inspect** `git diff` and ensure only infrastructure/runtime/test/docs paths changed; preserve the pre-existing pycache.
- [ ] **Step 5: Stage exact paths only and create one commit:** `feat(agent): require explicit Human approval for Story completion`.
- [ ] **Step 6: Re-run** the full tests and actual Story 2.3 read-only checks at the committed HEAD; report evidence before claiming PASS.
