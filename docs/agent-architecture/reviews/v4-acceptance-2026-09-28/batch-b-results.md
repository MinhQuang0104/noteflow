# V4 acceptance review — Batch B (R02–R04)

## Boundary and identity

Batch B only was executed in the managed worktree
`C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note`.
The canonical pointer was read before entry and was clearly `IDLE` with null
`activeRunId` and `storyId`. MAIN remained untouched. No product, Story, sprint,
receipt, or V3 runtime state was changed, and no merge, push, rollout, or human
adoption record was created.

The implementation/evidence source tested here is:

- base under review: `d8e813660e44c54785466836e5c0eda658529b74`;
- Batch A handoff: `e52170a61efe1d8087a9deff21fdf58ec9d04f0f`;
- tested candidate source: `56a78eeb7678c355718db44f64cc9a9200147363`;
- Batch B source commit: `56a78eeb7678c355718db44f64cc9a9200147363`;
- evidence run: `20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363`.

The two historical v1 bundles were read-only checked and preserved. Their
pre-run SHA-256 values remain the recorded historical values:

- `architecture-upgrade-baseline.json` —
  `e5113499bb1f3389a019211758b93e2a569bdc8ef5cfbca24d4b488f6514bdb5`;
- `architecture-upgrade-candidate.json` —
  `9a3cf090cc5d3bd79bdb5031e7fb3782abb128b1866f9351037afe312f2cd571`.

## R02 — evidence trust and consumer boundary

Implemented in `56a78ee`:

- the public benchmark entry point now routes to bundle schema v2;
- missing case results produce empty checks, `correction_cycles: null`, and
  `coverage: UNKNOWN`; no default `PASS` or test count is synthesized;
- v1 remains visible as `LEGACY_UNVERIFIED` and compares as
  `INCOMPARABLE`/`INCONCLUSIVE` rather than being upgraded in place;
- v2 validates case/check inventory, contradictory status/exit combinations,
  input/source/runner identity, immutable evidence refs, duplicate refs,
  tampered raw results, and cross-case/source binding;
- `evaluateEvolution` requires verified complete evidence, measured usage with
  an evidence digest, passing deterministic checks, and explicit quality
  `PASS` before it can return `EVALUATED`/`AWAITING_HUMAN`.

The historical compatibility command was rerun against the unchanged v1
bundles. Actual result: `INCOMPARABLE`, evidence `INCONCLUSIVE`, quality
`INCONCLUSIVE`, with `LEGACY_BUNDLE_SCHEMA` and
`EVIDENCE_PROVENANCE_MISSING`. The command did not turn the old synthetic
record into acceptance evidence.

The new candidate bundle is stored immutably at:

`C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note\.agent-state\v4-observations\evaluations\acceptance\20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363\candidate-bundle.json`

A read-only self-integrity comparison of that candidate bundle verified all raw
refs and digests (`evidence: VERIFIED`, `quality: PASS`). This is only evidence
integrity; it is not a baseline/candidate acceptance comparison.

## R03 — actual L/M/H corpus

Runner output is under the same acceptance run directory. The runner digest is
`sha256:5533b510d0bacb16f42c383d9ae96862f27ad2db36a1f31e6ce99e21778a5da4` and
the corpus digest is
`sha256:953fcae8e6baac574fd5ba176de51cc1e5dbb21ceed374951e6abc270870fdf8`.
All three cases returned `COMPLETE_VERIFIED` with actual assertions and raw
case evidence:

| Case | Actual observations | Assertions/check evidence |
|---|---|---|
| `L-mapped-low` | canonical `PASS`; escalation `NO_REVIEW`; two required checks passed | `canonical-pass`, `required-checks-executed`, `low-risk-no-review` all `PASS` |
| `M-mixed-medium` | raw canonical `INCOMPLETE`; `src/unmapped.txt` retained; escalation `REVIEW_REQUIRED` | `raw-incomplete-preserved`, `unmapped-path-preserved`, `medium-risk-review-required` all `PASS` |
| `H-stale-recovery` | stale preview `STALE`; interruption `RECOVERY_REQUIRED`; authorized recovery `CHECKPOINTED`; replay `NOOP` | separate stale/recovery check IDs, five assertions all `PASS` |

The H case records four required checks: stale rejection, stale no-mutation,
recovery interruption, and authorized recovery. Story/Plan/pointer snapshots
inside each fixture remained unchanged where the scenario required no lifecycle
mutation; the real candidate checkout status also remained unchanged.

The baseline B does not contain `.agents/scripts/v4-action-kernel.mjs`, so the
new runner correctly reports that a baseline execution is unsupported rather
than using candidate code to fake one. Therefore the corpus evidence is a
verified candidate deterministic run, not a paired baseline quality result.

## R04 — common measurement basis

The committed basis is `normal-action-instruction-source-v1`, profile
`v4-lite-normal-action`, basis digest
`sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998`,
and input digest
`sha256:16b03c97d4fef8b41ca29f1a6a4877fdec3817a7383efffc7038fb0476ddc27b`.
The helper reads raw Git blobs at the named revisions, records path/blob/digest/
bytes/role, counts duplicate paths once, treats missing required/lazy sources
as `INCONCLUSIVE`, and keeps actions separate. It does not multiply one static
measurement by L/M/H rows.

Actual paired measurement:

| Action | B bytes | candidate bytes | delta | reduction |
|---|---:|---:|---:|---:|
| `implement_slice` | 65,359 | 58,208 | -7,151 | 10.94% |
| `verify_slice` | 65,359 | 58,451 | -6,908 | 10.57% |

These are revision-bound instruction-source bytes only. Provider usage is not
observed, and `projection_bytes` is zero for this basis. The original U2
acceptance remains unchanged: both normal actions must reduce by at least 30%
while preserving required invariants. The actual R04 numbers are below that
threshold, so U2 is `NOT_MET`/open for Batch C; “measured” is not presented as
“accepted”.

## Verification commands

The focused Batch B gate ran on the tested source and returned 28 tests passed,
0 failed, 0 skipped:

```text
node --test .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-architecture-baseline.test.mjs .agents/scripts/run-v4-architecture-corpus.test.mjs .agents/scripts/measure-v4-instruction-context.test.mjs
```

The evidence-producing commands were:

```text
node .agents/scripts/run-v4-architecture-corpus.mjs --source-root C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note --expected-head 56a78eeb7678c355718db44f64cc9a9200147363 --variant candidate --run-id 20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363 --evidence-root .agent-state\v4-observations\evaluations\acceptance\20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363
node .agents/scripts/measure-v4-instruction-context.mjs --baseline-ref d8e813660e44c54785466836e5c0eda658529b74 --candidate-ref 56a78eeb7678c355718db44f64cc9a9200147363 --basis .agents/scripts/fixtures/v4-architecture/instruction-basis.json --run-id 20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363 --evidence-root .agent-state\v4-observations\evaluations\acceptance\20260928T100801Z-56a78eeb7678c355718db44f64cc9a9200147363
```

The evidence file hashes are recorded in
`batch-b-evidence-index.json`. The ignored run directory is retained in this
worktree for replay; the index and this report are the tracked handoff.

## Batch C remaining work

1. R05 must assess the semantic/invariant trade-off and either reduce both
   normal-action measurements to the original 30% target or report a concrete
   blocker/decision request. It must not alter the threshold or remove required
   authority, risk, dependency, stop, recovery, or review instructions.
2. R05 must rerun the locked basis after any context change and update the U2
   disposition with actual per-action numbers. Provider token savings and
   real-Story quality remain separate, unclaimed measurements.
3. R06 must review any remaining F01/F03 evidence-boundary concerns against the
   new source and candidate evidence, and keep F02/U2 open until the threshold
   and invariants are independently assessed. Baseline B has no compatible
   action-kernel corpus runner, so paired L/M/H baseline evidence remains an
   explicit limitation unless a non-faking adapter is authorized and added.
4. R07–R08 are not part of this handoff: full final regression, acceptance
   matrix/evidence index finalization, independent re-review, and final verdict
   remain for Batch D.

Batch B stops here. No fix is applied after this report and no acceptance,
merge, push, rollout, or adoption decision is implied.
