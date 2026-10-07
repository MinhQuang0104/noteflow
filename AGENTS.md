# Project Agent Instructions

## Authority and routing

Explicit human direction binds. BMAD owns approved product intent; Codex and Claude are replaceable Leads. Canonical `.agent-state/` is runtime state; V3 policy governs V3 work over incompatible generic guidance.

## Worker role

A prompt carrying an Orca worker preamble or a V3 worker contract makes the agent a worker, never a Lead. Follow only that contract plus the safety rules below: skip Lead routing, lanes, bootstrap, `.agent-state/`, and Story lifecycle. The contract's expected scope bounds every write; anything outside it, or destructive, irreversible, or credential-bearing, is an `escalation`, never an attempt. Questions go through `orca orchestration ask`; never a local prompt. Worker DONE never claims acceptance.

## V4 Lite migration lane

Only an explicit human request may use this lane for agent instructions, routing, feature maps, verification/worker contracts, or orchestration architecture; it excludes product, normal bugs/features, Story execution, and V3.1 workers. Before migration read only `.agent-state/active-run.json`, without mutation; continue only on clear `IDLE` with no contradiction, then read the router. Otherwise stop/report. Do not resume, reconcile, take over, mutate V3 runtime, or invoke Orca, AGY, V3 workers, or recovery. This lane does not change V3.1 leases, generations, recovery, reconciliation, Human Gate, or Story rules. A control-plane change may drive a Story only after the full `npm run test:v4` suite passes on its exact commit; focused subsets are not enough.

## Story and provider routing

The router selects the lane before bootstrap. A schema-v2 Story explicitly authorized by V4 Lite uses `start-story.md`: read-only readiness, fingerprint-bound apply, one lifecycle commit, then `implement_slice`; it never implements the successor or fabricates evidence.

An explicit Story request **by V4 Lite** uses the Runner and exactly one action. Plan validation, freshness, exact scope, two-commit durability, recovery, review escalation, and Human Gate remain authoritative. `review_slice`, automatic approval, generic continuation, automatic review-to-done, and automatic V3 fallback stay disabled; one invocation may persist one successor but never execute it.

Explicit V3.1/Orca requests and Story requests without V4 opt-in use `.agents/policies/orchestration-v3.md` and `story-development`; do not invoke V3 from V4 readiness or migration.

## Risk and retry

`LOW` is localized without public/auth/security/migration/concurrency/destructive/irreversible risk; `MEDIUM` changes modules, state, consumers, or integration; `HIGH` includes those risks plus shared/public boundaries, time/search invariants, cross-module writes, ambiguous AC, or incomplete verification. LOW uses standard evidence; MEDIUM adds consumer/unhappy-path checks; HIGH adds adversarial invariant and applicable negative/security/concurrency/contract/recovery tests. Findings are `VALID`, `FALSE_POSITIVE`, `SPEC_AMBIGUITY`, or `NEEDS_HUMAN_DECISION`; never invent behavior. On failure reproduce, add a regression, make the smallest fix, rerun; after about three repeats, stop and escalate.

## Deterministic Done Gate

A Story is complete only with every AC evidenced, recent deterministic checks, inspected exact diff, valid invariants, no unresolved HIGH/MEDIUM issue, synchronized lifecycle, and V3 `HUMAN_GATE` approval for exact scope. Worker DONE/Lead ACCEPTED is not completion; never claim an unrun check passed.

## Checkout safety

Before Story work inspect status, branch, and worktrees. In a linked worktree compare `AGENTS.md`, V3 policy, and `story-development` with canonical main; report stale policy. Never reset, clean, stash, or update ignored policy copies as a proxy for canonical policy.
