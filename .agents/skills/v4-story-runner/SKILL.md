---
name: v4-story-runner
description: Use when a human explicitly asks to implement or continue a named BMAD Story by V4 Lite; currently validates the persisted Story Plan and reports read-only readiness.
---

# V4 Lite Story Runner

## Entry and current authority

Use only for an explicit V4 Lite Story request routed by root `AGENTS.md`. This foundation permits **read-only readiness only**. Do not edit a Story Plan, sprint status, product code, Git index, or commits. Do not run an implementation action until a later human-authorized policy change enables mutation. Read the canonical `.agent-state/active-run.json` pointer first; proceed only when clearly IDLE and uncontradicted. Do not start or take over V3 runtime state.

Resolve an explicit Story ID against `docs/product/epics.md`. For “continue Story” without an ID, find unfinished persisted Plans and proceed only if exactly one matches. If zero or multiple match, request the ID. Never choose from chat history or branch name.

## Bootstrap and resume

1. Inspect Git status, branch, HEAD, and worktree context without mutation. Resolve the Story ID and expected Plan path.
2. For an existing Plan, run `node .agents/scripts/check-story-plan.mjs check <epic.story>` and preserve its JSON and exit status. `READY` and `RECONCILIATION_REQUIRED` are valid read-only outcomes; `STALE`, `INVALID`, and `ERROR` stop progression.
3. Read only the referenced Story section, the Plan, and its sprint entry. Verify Git baseline/checkpoint evidence and take `next_action` from the validated Plan.
4. Load only current slice context needed for that action. Report readiness and stop at this foundation boundary. A `reconcile_lifecycle` action is reported, never executed here.

Resume from Plan + Git + sprint-status + product source, never chat history. A Story Plan records execution continuity; `docs/product/epics.md` owns Story/AC, referenced architecture/UX docs own their decisions, Git owns implementation truth, and `sprint-status.yaml` owns lifecycle truth.

If no Plan exists, inspect the Story section and only necessary references for bounded readiness, dependencies, risk, and slice boundaries. A later mutation-enabled Runner must create a lightweight Plan before product changes; this foundation reports `PLAN_MISSING` and stops. Do not duplicate AC text or load all BMAD artifacts.

## Future action protocol, not enabled here

The Plan may name `plan_slice`, `implement_slice`, `verify_slice`, `review_slice`, `resolve_blocker`, `reconcile_lifecycle`, `request_gate`, or `finalize_story`. A mutation-enabled Runner will take one action, persist durable evidence, validate again, and advance. Limit repairs of the same underlying failure to about three attempts; then reassess or request a decision. HIGH risk calls for deeper same-Lead review and targeted tests, not an automatic human stop.

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
