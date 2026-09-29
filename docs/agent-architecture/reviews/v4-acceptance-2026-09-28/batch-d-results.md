# V4 acceptance review — Batch D (R07–R08)

## Verdict

PASS_ORIGINAL_SCOPE.

This is an independent deterministic verdict for the original V4 Lite
architecture/control-plane migration acceptance. It is not human adoption,
rollout, provider-token savings, real-Story quality evidence, merge approval,
or a Story completion decision.

## Identity and boundary

The canonical pointer was read before entry and was clearly IDLE with
activeRunId and storyId both null. MAIN, the real Story/Plan/sprint/receipt
state, and V3 runtime state were not changed. No Story action, product change,
approval/adoption record, merge, push, rollout, or archive was performed.

The review ran in:

- worktree: C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note
- base B: d8e813660e44c54785466836e5c0eda658529b74
- initial H0 reviewed by Batch A: 7529540ad9bcbf0389d0b00bc83d1575dea1422a
- normative source fix: 09b9dd961f3919e5c91b5742dcbe4bc0ac2abc92
- tested/reviewed source HEAD: 0e4c6b939f2a186399b483718601e86b44a694b5
- final handoff HEAD: recorded after the report-only commit; it is intentionally
  separate from the tested/reviewed source identity.

The integrated B..tested HEAD diff was inspected. It contains the Batch B
evidence/consumer/measurement work, the Batch C context compaction and
regression, and report/evidence files; no product, Story, sprint, receipt, or
V3 runtime mutation was found. git diff --check passed and the checkout was
clean before report creation.

## R07 — fresh evidence

Fresh run:
20260928T112130Z-0e4c6b939f2a186399b483718601e86b44a694b5.

The raw run is retained at
.agent-state/v4-observations/evaluations/acceptance/20260928T112130Z-0e4c6b939f2a186399b483718601e86b44a694b5.
The tracked index and summary bundle contain file digests, source bindings,
commands, actual results and limitations.

### Full control-plane suite

Command:

~~~text
$V4AcceptanceTests = @(Get-ChildItem -LiteralPath .agents/scripts -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
node --test @V4AcceptanceTests
~~~

Actual result: exit 0; 419 tests, 418 passed, 0 failed, 0 cancelled, 1
skipped. The skipped test is
rejects symlinked cwd or referenced paths; Windows symlink creation is
unavailable in this environment. The executor source still explicitly rejects
SYMLINK_PATH and paths whose realpath escapes the repository, and the
traversal/scope guards executed. The skip is reported as a limitation, not as
a pass.

### Frontend recipe gates

Node was v24.21.0, satisfying >=24.12.0 <25; npm was 11.6.4, and the
existing lockfile was unchanged.

- npm.cmd run type-check: exit 0.
- The five-file focused unit recipe: 5 files, 30 tests passed, exit 0.
- npm.cmd run contract:check: exit 0.

The first sandbox attempts hit EPERM while tools tried to write normal local
tool caches. The exact commands were rerun with normal workspace permissions;
the passing outputs and hashes are the only results used for this verdict.

### Corpus and measurement

The candidate corpus runner reported VERIFIED with the fixed
v4-architecture-corpus-v1 digest
sha256:953fcae8e6baac574fd5ba176de51cc1e5dbb21ceed374951e6abc270870fdf8
and runner digest
sha256:5533b510d0bacb16f42c383d9ae96862f27ad2db36a1f31e6ce99e21778a5da4.

| Workload | Actual result | Assertion/check coverage |
|---|---|---|
| L mapped/LOW | canonical PASS; escalation NO_REVIEW | 2/2 checks; 3 assertions PASS |
| M mixed/MEDIUM | raw INCOMPLETE; src/unmapped.txt retained; escalation REVIEW_REQUIRED | 2/2 checks; 3 assertions PASS |
| H stale/recovery/HIGH | STALE; RECOVERY_REQUIRED; authorized CHECKPOINTED; replay NOOP | 4/4 checks; 5 assertions PASS |

The locked basis remained
normal-action-instruction-source-v1,
v4-lite-normal-action,
basis digest
sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998,
and input digest
sha256:16b03c97d4fef8b41ca29f1a6a4877fdec3817a7383efffc7038fb0476ddc27b.
The helper read Git blobs at B and the tested HEAD, counted each selected source
once, kept actions separate, and replayed to the same result:

| Normal action | B bytes | candidate bytes | reduction | gate |
|---|---:|---:|---:|---|
| implement_slice | 65,359 | 45,551 | 30.31% | met |
| verify_slice | 65,359 | 45,580 | 30.26% | met |

projection_bytes was zero for this static instruction-source basis. It is not
provider-token usage.

## R08 — independent re-review

### F01 — evidence trust boundary

benchmark-v4.mjs now delegates to the v2 contract. The v2 normalizer requires
execution-bound fields for COMPLETE_VERIFIED cases; verifyEvidenceRefs checks
immutable raw refs, case/input/source binding and digests; and
evaluateEvolution requires verified evidence, measured evidence-bound usage,
passing deterministic checks and quality evidence before it can return
EVALUATED/AWAITING_HUMAN.

The R02 regressions for missing case results, unbound evidence, contradictory
or tampered evidence, and empty caller usage passed in the full suite. The
fresh candidate self-integrity comparison returned COMPARABLE, evidence
VERIFIED, quality PASS and PASS deterministic results for L/M/H. The
historical legacy baseline was then passed through the actual consumer chain;
compare returned INCOMPARABLE/INCONCLUSIVE and evolution returned
INCONCLUSIVE, never AWAITING_HUMAN.

Disposition: F01 VERIFIED_FIXED.

### F02 — original U2 acceptance

The original 30% threshold was not altered. The Batch C compact context keeps
the route/authority, selected task/AC/risk, exact scope, stop, recovery,
freshness, review and Human Gate invariants. The new architecture regression
checks selected requirements and fail-closed stale projection; the full suite
also passes the existing lifecycle, verification, recovery and Human Gate
negative paths.

The fresh Git-blob measurement reaches the original target for both required
normal actions. No human decision changed the authority or acceptance.

Disposition: F02 VERIFIED_FIXED.

### F03 — common measurement basis

The versioned basis, action/profile/input identity, source blob IDs, byte
counts, inclusion roles and coverage are present in both revision summaries.
The direct replay from B and tested HEAD reproduced the same
65,359/45,551 and 65,359/45,580 values. R04 tests for UTF-8/CRLF, missing
required/lazy sources, unresolved revisions, real zero bytes and no L/M/H
multiplication pass.

Disposition: F03 VERIFIED_FIXED.

### U1–U6 coverage

- U1 mechanical action plumbing: full control-plane suite, action-kernel,
  transaction, recovery and runner tests pass.
- U2 bounded action context: fresh common-basis measurement and context
  invariant/projection regression pass; original 30% gate met.
- U3 authority/routing: router, pointer, explicit V4/V3 routing and stale
  authority tests pass.
- U4 multi-recipe verification: registry, mapping, aggregation, executor,
  frontend type/unit/contract recipes pass.
- U5 observation ledger: bounded hooks, idempotency, unknown/zero and failure
  semantics pass.
- U6 learning/evolution boundary: stale/advisory experience, evidence-bound
  evaluation, exact human adoption validation and no-apply tests pass.

The full negative-matrix mapping is in acceptance-matrix.md.

## Limitations and handoff

The B revision predates the V4 action-kernel runner, so a non-faking paired
baseline L/M/H quality run is unavailable. Provider usage, token savings,
real-Story quality and empirical pilot results remain unknown. The fixture
corpus is deterministic non-regression evidence, not a universal Story-quality
claim. The single Windows symlink skip is retained as an explicit environment
limitation.

The first reviewer-generated run
20260928T110905Z-0e4c6b939f2a186399b483718601e86b44a694b5 is superseded:
its raw corpus/measurement are preserved, but its derived bundle was excluded
after its self-integrity check exposed an empty per-action compare field caused
by passing the pair object instead of the candidate-side measurement summary.
The final run corrects only the evidence packaging and passes self-integrity;
no implementation changed.

Human integration/adoption remains pending. This report does not grant
rollout or merge authority.
