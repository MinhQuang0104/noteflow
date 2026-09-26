# Project Agent Instructions

## Authority and routing

Explicit human direction binds. BMAD owns approved product intent; do not reinterpret it silently. Codex and Claude are replaceable Leads. Runtime state lives in canonical `.agent-state/`, never in conversation. This file routes context; V3 policy governs V3 execution over incompatible generic instructions.

## V4 Lite migration lane

Only explicitly human-authorized V4 Lite architecture or control-plane migration work may use this lane: agent instructions, context routing, feature-map, verification or worker-contract infrastructure, and orchestration architecture. Excludes product implementation, Story execution, normal bugs, features, and V3.1 worker execution.

Before migration work, read only the canonical `.agent-state/active-run.json` pointer, without mutation. Proceed outside V3 bootstrap only if it is clearly IDLE and no directly observed state contradicts it. Then load `.agents/routing/task-router.md`. If active, ambiguous, or contradicted, stop and report the conflict to the human; do not resume, reconcile, take over, or mutate V3 runtime state. Do not invoke Orca, Antigravity/AGY, V3 workers, subagents, or V3 recovery/reconciliation merely to satisfy V3 bootstrap requirements. This lane does not change V3.1 worker rules, lease/generation fencing, recovery, reconciliation, Human Gate, or Story development.

## Normal V3 / Story entry

An explicit human request to implement or continue a named Story **by V4 Lite** may enter `.agents/skills/v4-story-runner/SKILL.md` after the canonical `.agent-state/active-run.json` pointer is read-only checked as clearly IDLE. The V4 Story Runner authorizes routing, Plan validation, read-only readiness, and one bounded action per invocation: `reconcile_lifecycle` through `.agents/scripts/reconcile-story-lifecycle.mjs`, `implement_slice` through the read-only implementation preflight/recovery gate and its two-commit durability contract, `verify_slice` under the Runner's freshness, deterministic verification, escalation, review-freshness, and durable Plan-update guards, or `finalize_story` through the exact finalization transaction to `review`/Human Gate. `review_slice` and `complete_story` execution, automatic approval, automatic review-to-done, and automatic V3 fallback remain disabled; a successful action may persist one explicit successor but may not execute it in the same invocation. If the pointer is active, ambiguous, or contradicted, stop; do not take over a V3 run. This opt-in is separate from the V4 Lite migration lane above.

Explicit V3.1/Orca requests and Story execution without an explicit V4 Lite lane continue through `.agents/policies/orchestration-v3.md` and its shared Lead bootstrap. Approved or `ready-for-dev` BMAD Stories in that lane use `story-development` as the sole repository execution router. V3.1 remains the fallback. Do not invoke Orca or AGY from the V4 readiness path.

## Story risk and retry

Classify each Story before implementation:

- **LOW:** localized; no public contract, authentication/security, migration, concurrency, destructive operation, or irreversible side effect.
- **MEDIUM:** multi-file/module behavior, state changes, API consumer changes, or meaningful integration within approved boundaries.
- **HIGH:** authentication, authorization, security, migration/backfill, destructive data change, concurrency, idempotency, backup/restore, shared architecture boundary, public API/OpenAPI contract, time/search invariant, cross-module write/refactor, irreversible external effect, ambiguous Story/AC, or incomplete/failing verification.

LOW requires standard implementation and evidence. MEDIUM adds consumer and unhappy-path checks. HIGH requires deeper Lead adversarial review and targeted tests, not automatically another agent: identify affected architecture decisions and invariants; try to falsify important invariants; inspect callers, consumers, unhappy paths, and applicable rollback/recovery; add executable negative, concurrency, or security tests where applicable; support findings with evidence. Classify findings `VALID`, `FALSE_POSITIVE`, `SPEC_AMBIGUITY`, or `NEEDS_HUMAN_DECISION`. Never invent product behavior to resolve ambiguity.

On verification failure, reproduce, find the root cause, add a regression test where appropriate, make the smallest fix, rerun affected checks, then rerun the final gate. If the same underlying failure recurs about three times, stop patching and reassess architecture, Story clarity, environment, and dependencies/configuration. Escalate changes to approved intent or architecture; do not add reviewers as a workaround.

## Deterministic Done Gate

A Story is complete only when every AC has evidence; applicable deterministic checks were run recently and pass; the final diff was inspected with no unintended scope; architecture decisions and domain invariants hold; no unresolved HIGH/MEDIUM issue remains; BMAD Story and sprint/status lifecycle are synchronized; and the V3 HUMAN_GATE records human approval for the exact final integration scope. Worker DONE and Lead ACCEPTED do not complete a run.

Evidence priority: executable acceptance/integration tests > contract tests > typecheck/static analysis > lint > build > smoke/E2E > runtime assertions > documented manual evidence > LLM judgment. Use existing checks; never claim planned or unexecuted checks passed. Record each AC with check name, command, and result; give concise manual evidence and explain why deterministic testing is impractical.

## Checkout safety

Before Story work, inspect Git status, branch, and worktree list. In a linked worktree, compare its `AGENTS.md`, V3 policy, and `story-development` policy with canonical main; report stale policy before implementation. Never update ignored worktree copies as a proxy for canonical policy.
