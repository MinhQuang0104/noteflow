# NoteFlow V4 Lite architecture upgrade validation

Status: INDEPENDENT_REVIEWED — PASS_ORIGINAL_SCOPE for the original
deterministic migration acceptance; human adoption remains pending. The
deterministic results below are historical
implementer-reported evidence; Batch A independent review found valid open
findings F01-F03. This report does not claim provider optimization or human
adoption of the migration.

Batch A has reopened the original U2/T11 acceptance. The prior numbers and
limitations are preserved for traceability, but they are not independent
acceptance until the evidence contract, corpus execution and measurement basis
are repaired and re-reviewed.

## Scope and isolation

The work was executed in the managed isolated worktree
`C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note`.
The canonical workspace remained outside this checkout and its V3 pointer was
read-only checked as `IDLE` before work began. No Story 1.5/product code,
OpenAPI contract, sprint status, durable Story receipt, or V3 runtime state was
changed.

The implementation covers the six plan capabilities:

| Area | Implemented evidence |
| --- | --- |
| U1 mechanical action plumbing | V4 action kernel, exact-scope transactions, verification executor, recovery and Runner routing |
| U2 bounded context | Action-specific context projection with provenance, dependency dispositions, and experience advice after normative requirements |
| U3 lane/authority routing | V4 Lite explicit routing remains separate from the IDLE-checked V3 fallback |
| U4 multi-recipe verification | Registry aggregate, changed-path coverage, canonical/focused checks, escalation and frontend recipe fixtures |
| U5 observation ledger | Atomic event/usage ledger, bounded action/check/context hooks, session checkpoint/close coverage, measured/partial/unknown semantics |
| U6 learning/evolution boundary | Source-bound experience, stale exclusion, bounded proposals/evaluation, exact human adoption validation, no apply path |

## Executed checks

- `node --test .agents/scripts/benchmark-v4.test.mjs` — 4 pass, 0 fail.
- `node --test .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-observation-hooks.test.mjs` — 10 pass, 0 fail, 13.192 s.
- `node --test .agents/scripts/v4-experience.test.mjs .agents/scripts/compile-v4-context.test.mjs` — 9 pass, 0 fail, 20.180 s.
- `node --test .agents/scripts/v4-observation-hooks.test.mjs .agents/scripts/v4-observations.test.mjs .agents/scripts/v4-story-runner.test.mjs` — 21 pass, 0 fail, 36.494 s.
- Full control-plane suite `node --test .agents/scripts/*.test.mjs` — 405 tests, 404 pass, 0 fail, 1 skipped, 278.132 s. The one skip is the existing Windows symlink-creation limitation; executor symlink rejection remains implemented and tested through the available path.
- Frontend recipe gates were executed under the required Node 24 engine during T04: type-check passed; journal-focused tests passed 26; today-focused tests passed 4; contract check passed; isolated `npm ci` installed 355 packages and audited 356 with 0 vulnerabilities. No frontend files changed during T05–T11.
- `git diff --check` passed. Root `npm test` is intentionally not a gate because the metadata-only root package has no `test` script; the control-plane suite above is the plan-defined test gate.

## Benchmark interpretation

The fixed corpus contains the required L/M/H guard scenarios:

- L mapped/LOW: `PASS_NO_REVIEW`.
- M mixed/MEDIUM: `INCOMPLETE_REVIEW_REQUIRED`.
- H stale-recovery/HIGH: `STALE_RECOVERY_REQUIRED`.

`benchmark-v4.mjs compare --baseline <json> --candidate <json>` compares
normalized bundles without calling a provider or creating a Story. It rejects
source/model/toolchain/workload mismatches unless an explicit comparability
reason is present, preserves per-case metric coverage, and reports instruction
bytes separately from provider usage. The candidate bundle is stored only in
the ignored derived path
`.agent-state/v4-observations/evaluations/architecture-upgrade-candidate.json`.

The final compare result was `COMPARABLE` with explicit disclosures for the
post-upgrade source HEAD, architecture fingerprint, and source bindings.
Across the three fixed cases, implement context measured 30,565 baseline bytes
versus 37,740 candidate bytes (delta +21,525 aggregate), and verify context
measured 30,565 versus 37,983 (delta +22,254 aggregate). These are measured
context-source deltas, not a savings claim; the candidate is larger in this
bundle. Deterministic fixture checks were PASS and quality status remained
separate. Provider token usage is unavailable, so token savings and real-Story
quality impact remain `INCONCLUSIVE`. Passing fixture checks are deterministic
non-regression evidence, not proof of universal Story quality.

## Remaining limitations and rollback

There is no provider export, paired empirical pilot, or three-repetition
quality study. Session observation cannot claim every application crash or
provider close. Experience and proposal stores are disposable; stale source
or architecture identity excludes them. Human adoption is a separate decision
and has not been synthesized by this run.

Rollback is the normal Git operation selected by the human for this isolated
migration scope. Derived observations, experience, candidates, evaluations,
and the ignored candidate bundle may be deleted/rebuilt without changing
product or Story truth. No automatic rollback, merge, deploy, or Story
completion action is provided.

## State labels

1. **Implementation verified:** deterministic obligations and negative paths
   pass as recorded above.
2. **Optimization measured:** only deterministic instruction-byte metrics are
   measured; provider token savings are inconclusive.
3. **Human adopted:** not claimed. A human must approve the exact migration or
   candidate scope separately.

## R07–R08 final independent review

The final reviewer run is
20260928T112130Z-0e4c6b939f2a186399b483718601e86b44a694b5, tested and
reviewed at source HEAD
0e4c6b939f2a186399b483718601e86b44a694b5. The normative implementation
commit remains 09b9dd961f3919e5c91b5742dcbe4bc0ac2abc92; later changes in the
tested HEAD before handoff were report/evidence-only.

Fresh final results:

- Full control-plane suite: 419 tests, 418 pass, 0 fail, 0 cancelled, 1
  skipped. The skip is the Windows symlink-creation limitation and is retained
  as a limitation, not counted as a pass.
- Frontend recipe gates under Node v24.21.0 / npm 11.6.4: type-check exit 0;
  five focused files, 30 tests passed; contract check exit 0.
- L/M/H corpus: VERIFIED; L PASS/NO_REVIEW, M raw
  INCOMPLETE/REVIEW_REQUIRED, H stale/recovery
  STALE/RECOVERY_REQUIRED/CHECKPOINTED/NOOP, with all required assertions
  passing.
- Common-basis measurement: B 65,359 bytes for each normal action; candidate
  45,551 (implement_slice, 30.31%) and 45,580 (verify_slice, 30.26%). The 30%
  criterion and basis were not changed.
- F01, F02 and F03: independently VERIFIED_FIXED.

The candidate self-integrity path returned verified evidence and deterministic
quality for the fresh fixture bundle. The legacy historical baseline was
deliberately not upgraded: compare returned INCOMPARABLE/INCONCLUSIVE, and
the evolution consumer returned INCONCLUSIVE, not AWAITING_HUMAN.

Independent verdict: PASS_ORIGINAL_SCOPE. This is limited to deterministic
implementation acceptance. Provider token usage, paired baseline L/M/H quality,
real-Story quality, empirical pilot, rollout, merge and human adoption remain
unknown, unrun or pending. The report/evidence package is in
docs/agent-architecture/reviews/v4-acceptance-2026-09-28/; no approval or
adoption record was created.
