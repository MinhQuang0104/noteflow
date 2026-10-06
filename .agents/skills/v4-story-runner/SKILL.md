---
name: v4-story-runner
description: Use when a human explicitly asks to implement or continue a named BMAD Story by V4 Lite; route one bounded action through its contract.
---

# V4 Lite Story Runner — common entry

Routing/invariant context only; it never executes a Story action. Enter only for an explicit V4 request after read-only `.agent-state/active-run.json` check: continue on clear `IDLE` with no contradiction. Resolve Story identity from canonical artifacts, never chat or branch.

## Action selection

Read the validated Plan action and exactly one contract: `start_story` → `actions/start-story.md`; `reconcile_lifecycle` → `actions/reconcile-lifecycle.md`; `implement_slice` → `actions/implement-slice.md`; `verify_slice` → `actions/verify-slice.md`; `finalize_story` → `actions/finalize-story.md`; `complete_story` → `actions/complete-story.md`.

`finalize_story` stops at review/Human Gate; `complete_story` is disabled without fresh exact-scope human approval. Automatic approval, automatic review-to-done, generic continuation, `review_slice`, and automatic V3 fallback remain disabled.

## Shared bootstrap

1. Inspect Git status/branch/HEAD/common directories/worktree/inventory without mutation; failure is an error. When a linked worktree's branch names the Story (`story-<epic>-<story>`), act only from that worktree; the Runner returns `WRONG_CHECKOUT` elsewhere.
2. For an existing Plan run `check-story-plan.mjs check <epic.story>` and preserve JSON/status. Only `READY`/`RECONCILIATION_REQUIRED` are usable; `STALE`/`INVALID`/`ERROR` stop.
3. Read only referenced Story, Plan, sprint entry, action, and anchors; bind source, checkpoint, receipt, lifecycle, freshness, and exact scope. Load recovery only for partial/locked/recovery and techniques only for the selected recipe.

Resume from Plan, Git graph/worktree/index, sprint status, and product source, never chat. Product artifacts own Story/AC, Plan continuity, Git implementation, and sprint lifecycle. Missing Plan is `PLAN_MISSING` and stops mutation.

## Shared invariants

* One durable action per invocation; persist at most one explicit successor and never execute it in the same invocation.
* Pointer, validated Plan, Git state, exact scope, freshness, immutable receipts, and lifecycle helpers are authoritative.
* `PASS`, `FAIL`, `INCOMPLETE`, and `ERROR` keep meaning. `verify_slice` never fixes product code or turns incomplete/failed checks into authority; MEDIUM/HIGH review remains mandatory.
* Exact-path staging, two-commit durability, lock ownership, and recovery preserve partial work; recovery is `RECOVERY_REQUIRED`, not replay permission.
* Telemetry, projections, and experience cannot approve/complete/mutate truth; hook failure is a coverage gap, never a bypass or retry. Never reset, clean, stash, delete a foreign lock, or overwrite user work; same-Lead review is not Human Gate.

## Lazy context and stop

Default context is Story section, Plan, sprint entry, Git identity, current slice, and selected action. Do not eager-load repo, PRD, V3 policy, BMAD output, or skill library; load action-required skills only when needed.

Stop for unresolved authority, destructive/irreversible work without authorization, unclear lifecycle, external credentials, exceeded V4 capability, incomplete inventory, or repeated repair failure. V3.1 may be recommended when one bounded Lead action cannot represent the work, but is never invoked automatically.
