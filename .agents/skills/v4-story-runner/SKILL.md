---
name: v4-story-runner
description: Use when a human explicitly asks to implement or continue a named BMAD Story by V4 Lite; route one bounded action through the matching action contract.
---

# V4 Lite Story Runner — common entry

## Entry and current authority

This file is routing glue and invariant context. It does not execute a Story
action. Use it only for an explicit human request routed by `AGENTS.md`; a
preparation-only request may inspect or prepare artifacts but does not authorize
mutation. Read the canonical `.agent-state/active-run.json` pointer first and
continue only when it is clearly `IDLE` and uncontradicted. Resolve the Story ID
from canonical artifacts, never from chat history or branch name.

Select exactly one action document by the validated Plan action:

| Plan action | Contract |
| --- | --- |
| `start_story` | `actions/start-story.md` |
| `reconcile_lifecycle` | `actions/reconcile-lifecycle.md` |
| `implement_slice` | `actions/implement-slice.md` |
| `verify_slice` | `actions/verify-slice.md` |
| `finalize_story` | `actions/finalize-story.md` |
| `complete_story` | `actions/complete-story.md` |

`finalize_story` stops at `review`/Human Gate; `complete_story` remains disabled
without a separate fresh exact-scope human approval. Generic continuation never
grants either authority.

The selected action document owns its bounded procedure; this common entry only
routes, checks shared invariants, and decides which references are lazy.

## Shared bootstrap

1. Inspect Git status, branch, HEAD, Git/common directories, worktree context,
   and inventory without mutation. Inventory failure is an error, never clean.
2. For an existing Plan, run `check-story-plan.mjs check <epic.story>` and
   preserve its JSON and exit status. `READY` and
   `RECONCILIATION_REQUIRED` are valid read-only outcomes; `STALE`, `INVALID`,
   and `ERROR` stop progression.
3. Read only the referenced Story section, Plan, sprint entry, and selected
   action context. Verify source, checkpoint, receipt, and lifecycle bindings.
4. Load `references/recovery.md` only for an observed partial/locked/recovery
   condition. Load `references/implementation-techniques.md` only when the
   selected action requires its compact recipe.

Resume from Plan + Git commit graph + working tree/index + sprint-status + product source, never chat history. A Story Plan records execution continuity; `docs/product/epics.md` owns Story/AC, referenced architecture/UX docs own their decisions, Git owns implementation truth, and `sprint-status.yaml` owns lifecycle truth.

If no Plan exists, inspect the Story section and only necessary references for bounded readiness, dependencies, risk, and slice boundaries. A later mutation-enabled Runner must create a lightweight Plan before product changes; this foundation reports `PLAN_MISSING` and stops. Do not duplicate AC text or load all BMAD artifacts.

## Action contracts

The detailed procedures live in the selected action documents. In particular,
`actions/start-story.md` owns the schema-v2 start gate and exact lifecycle
transaction; `actions/implement-slice.md` owns implementation preflight and the
two-commit contract; `actions/verify-slice.md` owns canonical checks, escalation,
and bounded review; `actions/finalize-story.md` and
`actions/complete-story.md` own the separate finalization and Human Gate
transactions. `actions/reconcile-lifecycle.md` owns lifecycle reconciliation.

Each action document is subordinate to the shared invariants below and must
persist at most one explicit successor before stopping.

## Shared action invariants

- One durable Story action per invocation. Persist at most one explicit
  successor and stop; never execute the successor in the same loop.
- The canonical pointer, validated Plan, Git state, exact scope, freshness,
  receipts, and existing lifecycle helpers remain authoritative.
- `review_slice`, automatic approval, generic continuation authority,
  automatic `review → done`, and automatic V3 fallback remain disabled.
- `verify_slice` never changes product code or turns a failed/incomplete check
  into authorization to fix or reimplement. MEDIUM/HIGH review escalation stays
  mandatory; canonical `PASS`, `FAIL`, `INCOMPLETE`, and `ERROR` keep meaning.
- Receipt references are immutable. Exact path staging and recovery preserve
  partial work; never infer ownership from commit messages or chat history.
- Telemetry, context projections, and learned experience are derived/advisory;
  they cannot approve, complete, or mutate product or policy truth.
- Real action, check, and context boundaries may emit bounded observation hook
  events. Hook write failures are coverage gaps only: they never bypass a
  gate, authorize a retry, or rerun a completed action. Emit a session
  checkpoint before yielding and keep provider-session closure unknown unless
  a real boundary is observed. Emit a review snapshot only after finalization
  reaches Human Gate, and a completion event only with fresh human approval.
- Never reset, clean, stash, delete a foreign lock, or overwrite user work.

The selected action document owns its read-only gate, semantic boundary,
two-commit or exact-lifecycle transaction, and stop behavior:

- `implement_slice`: `actions/implement-slice.md`
- `verify_slice`: `actions/verify-slice.md`
- `reconcile_lifecycle`: `actions/reconcile-lifecycle.md`
- `finalize_story`: `actions/finalize-story.md`
- `complete_story`: `actions/complete-story.md`

The action may load `references/recovery.md` or
`references/implementation-techniques.md` only under their stated triggers.

## Lazy context and skills

Default context is the Story section, Plan, one sprint entry, Git identity, and current slice. Load architecture/UX anchors, feature maps, direct source/consumer/tests, BMAD workflows, and Superpowers skills only for a concrete action. Do not eager-load PRD, architecture, `_bmad-output`, V3 policy, or the skill library; do not scan the whole repo.

- `implement_slice`: `test-driven-development`.
- Unexpected failure: `systematic-debugging`.
- Test design difficulty: `writing-good-tests` only if installed and truly necessary.
- Pre-checkpoint completion claim: `verification-before-completion`.
- Review feedback: `receiving-code-review`.

Use skills that exist; an unavailable optional skill is not invented as a file. Record a skill only when it affects a durable decision or checkpoint.

## Stop and fallback

Stop for unresolved product ambiguity, missing architecture authority, destructive or irreversible behavior without authorization, unclear lifecycle authority, external credentials/permissions, exceeded V4 capability, repeated repair failure, incomplete Git inventory, or missing integration authority. Same-Lead semantic review is not itself a Human Gate.

V3.1 may be recommended only when safe single-Lead bounded execution cannot represent the work, such as required independent parallel workers or a large coordinated cross-domain change. Record the reason and remaining scope in the Plan when mutation is authorized. Do not invoke Orca, AGY, workers, V3 recovery, or V3 fallback automatically.
