---
name: v4-story-runner
description: Use when a human explicitly asks to implement or continue a named BMAD Story by V4 Lite; validates readiness and may run the bounded lifecycle reconciliation helper.
---

# V4 Lite Story Runner

## Entry and current authority

Use only for an explicit V4 Lite Story request routed by root `AGENTS.md`. This phase permits read-only readiness plus two bounded actions: `reconcile_lifecycle` and `verify_slice`. Lifecycle reconciliation runs only through `.agents/scripts/reconcile-story-lifecycle.mjs`; that helper alone may edit the Story Plan and sprint status, stage those two files, and commit them after a successful check and all apply guards. Slice verification may update durable verification/review freshness fields in the Story Plan after the full verification flow below, but does not authorize product-code changes. Read the canonical `.agent-state/active-run.json` pointer first; proceed only when clearly IDLE and uncontradicted. Do not start or take over V3 runtime state.

Resolve an explicit Story ID against `docs/product/epics.md`. For “continue Story” without an ID, find unfinished persisted Plans and proceed only if exactly one matches. If zero or multiple match, request the ID. Never choose from chat history or branch name.

## Bootstrap and resume

1. Inspect Git status, branch, HEAD, and worktree context without mutation. Resolve the Story ID and expected Plan path.
2. For an existing Plan, run `node .agents/scripts/check-story-plan.mjs check <epic.story>` and preserve its JSON and exit status. `READY` and `RECONCILIATION_REQUIRED` are valid read-only outcomes; `STALE`, `INVALID`, and `ERROR` stop progression.
3. Read only the referenced Story section, the Plan, and its sprint entry. Verify Git baseline/checkpoint evidence and take `next_action` from the validated Plan.
4. For `reconcile_lifecycle`, run the helper's `check` with explicit Story ID, from/to state and expected HEAD. Inspect its JSON preview and proceed only on `READY` with `applicable: true`. Obtain the explicit successor action from the authorized Story context; the helper validates its structure but does not choose its meaning. Pass the exact previewed hashes and successor to `apply`, then preserve its commit SHA and revalidate the Plan. Never infer approval for `review → done`; durable human approval is required.
5. For `verify_slice`, first run `node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>`. Treat it only as the read-only scope/freshness manifest. Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`; `RERUN_REQUIRED` means the scope is usable but required focused checks must run. Run the required focused verification without changing product code, then run canonical `.agents/scripts/check-verification.mjs` with every manifest path passed explicitly. Forward canonical output unchanged with Story/slice risk to `.agents/scripts/check-escalation.mjs`; if review is required, use bounded change evidence and the targeted reviewer contract. Classify prior review freshness without silently reusing a review whose prerequisites are incomplete. Only after all required outputs exist may the Runner durably update the Story Plan's structured verification, review freshness, progression eligibility, and explicit successor action. Revalidate the Plan after the update. This authority does not execute the successor action in the same loop.

Resume from Plan + Git + sprint-status + product source, never chat history. A Story Plan records execution continuity; `docs/product/epics.md` owns Story/AC, referenced architecture/UX docs own their decisions, Git owns implementation truth, and `sprint-status.yaml` owns lifecycle truth.

If no Plan exists, inspect the Story section and only necessary references for bounded readiness, dependencies, risk, and slice boundaries. A later mutation-enabled Runner must create a lightweight Plan before product changes; this foundation reports `PLAN_MISSING` and stops. Do not duplicate AC text or load all BMAD artifacts.

## Other actions, not enabled here

The Plan may name `plan_slice`, `implement_slice`, `verify_slice`, `review_slice`, `resolve_blocker`, `reconcile_lifecycle`, `request_gate`, or `finalize_story`. Only `reconcile_lifecycle` and `verify_slice` can execute in this phase. `implement_slice`, `review_slice`, `finalize_story`, and automatic `review → done` remain disabled as Runner loops. A successful real verification may persist one of those actions as the explicit successor but may not execute it. Limit repairs of the same underlying failure to about three attempts; then reassess or request a decision. HIGH risk calls for deeper same-Lead review and targeted tests, not an automatic human stop.

When enabled, pass explicit changed paths to `.agents/scripts/check-verification.mjs`; forward its exact output with Story/slice risk to `.agents/scripts/check-escalation.mjs`. Do not turn `INCOMPLETE` into `PASS`. For `REVIEW_REQUIRED`, use `.agents/scripts/prepare-change-evidence.mjs` and `.agents/review/targeted-reviewer-contract.md`. Respect four-path groups, producer-managed oversized units, complete coverage, and no whole-file fallback.

## Lazy context and skills

Default context is the Story section, Plan, one sprint entry, Git identity, and current slice. Load architecture/UX anchors, feature maps, direct source/consumer/tests, BMAD workflows, and Superpowers skills only for a concrete action. Do not eager-load PRD, architecture, `_bmad-output`, V3 policy, or the skill library; do not scan the whole repo.

- Implementation: `test-driven-development`.
- Unexpected failure: `systematic-debugging`.
- Test design: `writing-good-tests` if available and useful.
- Completion claim: `verification-before-completion`.
- Review feedback: `receiving-code-review`.

Use skills that exist; an unavailable optional skill is not invented as a file. Record a skill only when it affects a durable decision or checkpoint.

## Stop and fallback

Stop for unresolved product ambiguity, missing architecture authority, destructive or irreversible behavior without authorization, unclear lifecycle authority, external credentials/permissions, exceeded V4 capability, repeated repair failure, or missing integration authority. Same-Lead semantic review is not itself a human gate.

V3.1 is a fallback candidate only when safe single-Lead bounded execution cannot represent the work, such as required independent parallel workers or a large coordinated cross-domain change. Record the reason and remaining scope in the Plan when mutation is later authorized. Do not invoke Orca, AGY, workers, or V3 recovery automatically.
