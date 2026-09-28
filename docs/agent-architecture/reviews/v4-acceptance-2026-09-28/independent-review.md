# NoteFlow V4 — Independent Review Batch A (R00–R01)

## Review status

- Batch: A only.
- Reviewed source: B..H0, with H0 = 7529540ad9bcbf0389d0b00bc83d1575dea1422a.
- Base: B = d8e813660e44c54785466836e5c0eda658529b74.
- Reviewer disposition: CHANGES_REQUIRED_FOR_NEXT_BATCH.
- Final R08 acceptance verdict: not issued in Batch A.
- Independent reviewer scope: source, tests, contracts, historical bundles and reports only; no implementation fix was made.

The canonical pointer was read before the lane bootstrap and again before
writing the report. It was IDLE with activeRunId and storyId both null. MAIN
and W were not reset, cleaned, stashed, merged or pushed.

## R00 — Snapshot and acceptance reopening

W is the clean detached H0 worktree named by the plan. B is an ancestor of H0
with 14 commits between them. The B..H0 inventory is 59 files,
9,571 insertions and 206 deletions. git diff --check passed.

The original plan bytes in MAIN match P0:
7122633a96aef9bf1bee072ea56e47ec7ab3e50662f93a56db79356994841687.
The copy in W is a different document revision whose status says COMPLETE and
whose U2 checkbox is checked, so it is treated as implementation-reported
history, not as independent acceptance.

The B0 value recorded in the historical baseline bundle is
c858c9946668caf539b69e4214dcf1008ea8578e and is not the review base B.
Historical baseline and candidate bundles were preserved unchanged.

MAIN-owned work outside this review remains preserved:

- staged Story 1.5 execution plan;
- untracked _bmad/render/bmad-code-review/;
- untracked original V4 evolution plan;
- untracked independent-review acceptance plan;
- the separate Story 1.5 worktree.

The W AGENTS/router/context changes are the intended migration diff under
review. The normalized line content of orchestration-v3.md and
story-development/SKILL.md matches MAIN; their byte hashes differ because of
line endings. No stale V3 policy blocker was found.

## R01 — Review method

The review traced the B..H0 diff through:

1. action/transaction preview, exact staging, two-commit durability, lock,
   recovery and runner routing;
2. context projection, action routing, lazy references and V3 fallback;
3. verification registry, multi-recipe aggregation, executor provenance,
   escalation and review persistence;
4. observation hooks, usage normalization, unknown/zero semantics and
   idempotent writes;
5. experience selection and evolution evaluation/adoption boundary; and
6. benchmark bundle creation, corpus fixture, comparison, validation report,
   migration note and original acceptance.

The review did not treat test count, exit code, COMPARABLE, or a prose label as
acceptance. The historical implementer report was treated as a claim to
verify, not as independent evidence.

## Findings

### F01 — VALID / HIGH — evidence trust boundary is not fail-closed

At benchmark-v4.mjs:337-353, buildCandidateBundle supplies a PASS
corpus-guard with tests: 3, correction_cycles: 0 and DETERMINISTIC coverage
when no case results are supplied. validateCase allows null input_digest and
does not require a case execution binding. The L/M/H benchmark test at
benchmark-v4.test.mjs:147-178 copies the corpus and calls the builder; it does
not execute L, M or H behavior.

Direct reproduction on H0 produced synthetic PASS records for all three cases
with input_digest null. The historical compare command exited 0 and returned
COMPARABLE with metrics.quality PASS. No actual corpus runner exists at
run-v4-architecture-corpus.mjs.

The consumer has the same trust problem. v4-evolution.mjs:304-355 derives
usage truthiness, deterministic checks and quality from caller-supplied
objects. A direct call with observed_usage: {} returns
EVALUATED/AWAITING_HUMAN and token_savings MEASURED, without an evidence root,
source binding, coverage validation or a real measurement.

This violates the original evidence boundary: raw status and scenario
assertion must remain separate; missing, legacy, stale, failed, skipped or
unbound evidence cannot become quality PASS or adoption-ready evaluation.
The minimal repair belongs to R02-R03: schema-v2 evidence contract, actual
L/M/H runner, immutable case evidence and fail-closed consumers.

### F02 — VALID / HIGH — U2 acceptance was silently presented as complete

The W copy of the original plan says COMPLETE at line 5 and checks the U2
Definition of Done at line 749. Its T11 evidence at line 702 and the
validation report at lines 55-61 explicitly report candidate context larger
than baseline: +21,525 implement aggregate and +22,254 verify aggregate.
The same report says the candidate is larger and that the bundle does not
prove savings.

The original acceptance remains a 30% reduction target. A measurement that is
not comparable, or a candidate that is larger, cannot support the checked U2
DoD. No human decision changing the acceptance was found. The required
disposition is OPEN/NOT_MET/INCONCLUSIVE pending valid R04 measurement and R05
semantic/invariant review. R00 reopens the status without deleting the
historical implementer report.

### F03 — VALID / HIGH — measurement basis is not reproducible or symmetric

benchmark-v4.mjs:306-319 reads the current checkout with a hard-coded path
list, catches missing files and adds zero. It does not read Git blobs at a
named revision or record a versioned manifest of required/lazy instruction
sources. compareBundles filters the basis field out of metric keys at
165-168 and sums the same per-case byte values across L/M/H.

The historical baseline describes a four-file instruction basis while its
source bindings enumerate eight paths. The candidate uses another current
source set, and the two basis strings are never validated as comparable. The
measurement helper and basis manifest planned for R04 are absent in H0.

The reported aggregate is therefore not a valid U2 metric. R04 must bind
action/profile/input/basis identity, count raw Git blobs once, fail closed for
missing or triggered lazy sources, and keep repeated corpus rows from
multiplying one static measurement.

## U1–U6 coverage

| Area | Review coverage | Batch A disposition |
|---|---|---|
| U1 action/transaction | v4-action-kernel.mjs, v4-slice-transaction.mjs, Runner and transaction/kernel tests; exact paths, lock identity, failure phases, recovery and one-action stop inspected | No additional finding; existing evidence is not final acceptance |
| U2 context/measurement | compiler, action documents, context modules, original U2/T02/T11 acceptance and measurement claims inspected | F02/F03 open; semantic projection behavior covered, acceptance metric not |
| U3 routing/authority | MAIN/W AGENTS, CLAUDE, task router, context modules, Runner entry and routing tests compared | No additional finding; V3 policy content is unchanged after normalized comparison |
| U4 verification/review | registry/maps, check-verification, executor, escalation/review flow and negative tests inspected | No additional finding; fixture corpus execution is still an open T11/F01 gap |
| U5 observations | observation contract, hooks, ledger normalization, idempotency, unknown/zero and write-failure tests inspected | No additional finding; provider usage remains unknown |
| U6 experience/evolution | experience contract/tests and evolution proposal/evaluation/adoption code/tests inspected | F01 covers the evaluation consumer trust boundary; advisory experience path otherwise remains bounded |
| T11 acceptance | benchmark, bundles, corpus and reports inspected; required corpus/measurement helpers are absent | F01/F02/F03; R02-R05 required |

This is coverage of the review surface, not a claim that every capability is
accepted. U1, U3, U4 and U5 have meaningful deterministic test coverage in
the reviewed source; the missing T11 evidence prevents the final DoD.

## Executed checks

From W at H0:

    node --test .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-story-runner.test.mjs .agents/scripts/compile-v4-context.test.mjs .agents/scripts/check-verification.test.mjs .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/v4-check-executor.test.mjs .agents/scripts/v4-observations.test.mjs .agents/scripts/v4-observation-hooks.test.mjs .agents/scripts/v4-experience.test.mjs .agents/scripts/v4-evolution.test.mjs .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-architecture-baseline.test.mjs

Result: exit 0; 75 tests, 74 passed, 0 failed, 1 skipped. The skipped test
requires Windows symlink creation, which is unavailable in this environment.

    node --test .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-architecture-baseline.test.mjs

Result: exit 0; 16 passed, 0 failed, 0 skipped.

These commands are focused review evidence, not the final R07 regression gate.
The full-suite count in the historical report remains implementer-reported
until R07 reruns it against the final candidate source.

## Handoff and stop boundary

Batch A hands F01-F03 to Batch B/C with exact source, reproduction and
invariant references in findings.json. R02-R04 must repair evidence trust,
execute the L/M/H corpus and lock the measurement basis before R05 can assess
U2. No implementation, product, Story, V3 runtime, merge, push, rollout,
Human approval or adoption action was performed by this batch.

Do not interpret this report as PASS_ORIGINAL_SCOPE. Batch A is complete only
as a review handoff; R08 must issue the final independent verdict after fixes
and fresh evidence.
