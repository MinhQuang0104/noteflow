# V4 acceptance review — Batch C (R05–R06)

## Boundary and identity

Batch C was executed only in the managed worktree
`C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note`.
The canonical pointer was read before entry and was clearly `IDLE` with null
`activeRunId` and `storyId`. MAIN, the real Story/Plan/sprint/receipt state, and
V3 runtime state were not changed. No merge, push, rollout, adoption, or Human
approval was performed.

The source fix commit is:

- base B: `d8e813660e44c54785466836e5c0eda658529b74`;
- prior Batch B source: `56a78eeb7678c355718db44f64cc9a9200147363`;
- Batch C source: `09b9dd961f3919e5c91b5742dcbe4bc0ac2abc92`;
- evidence run: `20260928T105031Z-09b9dd961f3919e5c91b5742dcbe4bc0ac2abc92`.

The source commit changes only V4 routing/context/action guidance and the
R05 regression test. The locked measurement basis, artifact contract,
benchmark/evolution consumers, product Story/Plan state, and V3 runtime are
outside this source commit and unchanged.

## R05 — original U2 target

The exact Batch B basis was reused without modification:

- method/basis: `normal-action-instruction-source-v1`;
- profile: `v4-lite-normal-action`;
- basis digest: `sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998`;
- input digest: `sha256:16b03c97d4fef8b41ca29f1a6a4877fdec3817a7383efffc7038fb0476ddc27b`.

The measurement helper read Git blobs at B and the committed Batch C source,
counted each selected path once, kept actions separate, and returned
`MEASURED`/`COMPLETE` for both revisions. Actual results:

| normal action | B bytes | Batch C bytes | delta | reduction | original gate |
|---|---:|---:|---:|---:|---|
| `implement_slice` | 65,359 | 45,551 | -19,808 | 30.31% | met |
| `verify_slice` | 65,359 | 45,580 | -19,779 | 30.26% | met |

The 30% threshold and original acceptance were not changed. The 70% ceiling is
45,751 bytes; both actions are below it. `projection_bytes` is zero for this
static instruction-source basis and is not claimed as provider token usage.

The reduction removed duplicated eager routing/procedure prose from the root
policy, provider entry, router, control-plane and verification context, common
Runner entry, and the two selected action documents. Authority, exact scope,
freshness, receipts, two-commit durability, recovery, risk/escalation,
canonical status meanings, one-action stop, Human Gate, and lazy-reference
triggers remain represented. The artifact contract and verification helper
remain counted sources; neither was excluded to reach the number.

### R05 regression and affected checks

The new test was written before the compact contract and first failed because
the required invariant block was absent. It now passes and checks both the
compact routing/invariant contract and behavior: selected task/AC/risk/stop
projection is retained, while a stale normative Story digest still returns
`STALE` with no projection.

Actual focused command result: 62 tests passed, 0 failed, 0 cancelled. The
command was the plan's affected suite plus the new regression:

`node --test .agents/scripts/compile-v4-context.test.mjs .agents/scripts/v4-story-runner.test.mjs .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/measure-v4-instruction-context.test.mjs .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-architecture-baseline.test.mjs .agents/scripts/run-v4-architecture-corpus.test.mjs .agents/scripts/v4-context-invariants.architecture.test.mjs .agents/scripts/check-story-finalization.architecture.test.mjs`

`git diff --check` and the staged exact-scope check passed before the source
commit.

**R05 disposition:** `TARGET_REACHED_PENDING_R08_REVIEW`. This is implementer
evidence for the original U2 gate, not independent acceptance.

## R06 — remaining VALID findings

No new finding was opened and no unrelated refactor was made. The Batch A
inventory remains the authority; dispositions below are handoff states only:

| finding | Batch C disposition | Evidence and remaining reviewer action |
|---|---|---|
| F01 | `FIX_IMPLEMENTED_PENDING_R08_REVIEW` | Batch B's fail-closed v2 contract/consumer fix remains in source `56a78eeb`; the fresh L/M/H run is bound to Batch C source and preserves actual raw statuses/assertions. R08 must review the source diff and consumer path. |
| F02 | `FIX_IMPLEMENTED_PENDING_R08_REVIEW` | The original 30% U2 acceptance remains unchanged and the locked remeasurement now reaches it for both normal actions. R08 must independently verify the basis, semantic coverage, and no hidden invariant loss. |
| F03 | `FIX_IMPLEMENTED_PENDING_R08_REVIEW` | The committed basis and Git-blob measurement remain unchanged from Batch B; the new paired result records source bindings/digests and action-specific bytes. R08 must replay/inspect the measurement. |

R06 therefore has no additional source fix beyond the R05 context commit and
the Batch B evidence fixes. `FIX_IMPLEMENTED` is the implementer disposition;
only Batch D's independent reviewer may call a finding `VERIFIED_FIXED`.

## Evidence and limitations

The human-readable summary bundle is
`batch-c-evidence-bundle.json`; the raw append-only run is retained at
`.agent-state/v4-observations/evaluations/acceptance/20260928T105031Z-09b9dd961f3919e5c91b5742dcbe4bc0ac2abc92/`.
`batch-c-evidence-index.json` records each raw file digest and preserves the
historical Batch B bundle hashes.

The candidate corpus is verified, but B predates
`.agents/scripts/v4-action-kernel.mjs`; a non-faking paired baseline L/M/H
quality run is unavailable. Provider usage, real-Story quality, and empirical
token savings remain unknown. Full R07 regression/evidence packaging and R08
independent re-review/verdict remain outstanding. This report does not grant
`PASS_ORIGINAL_SCOPE`, human adoption, merge, or rollout authority.

## Batch D handoff

Batch D must rerun or directly inspect the locked measurement and source
bindings, review the exact fix diff and integrated diff, run the final required
regressions/recipe gates, verify evidence digests and scope hygiene, and issue
the independent verdict. It must keep `tested_source_head` separate from any
later report/handoff commit.
