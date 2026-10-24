# Perf T3.2 — split five more heavy V4 test files

Status: **T3.2 IMPLEMENTED**. One local Conventional Commit follows T4
`67799a8`. The campaign source stays pinned to `87469b7` with the
owner-authorized no-rebase exception.

## Owner decision

The owner first asked for T2.3–T2.7. The T0 audit shows that their cacheable
setup is small: about 56 s of serial seed building in `check-story-completion`,
18 s in `integrate-story`, 10 s plus part of the staged builders in
`v4-slice-transaction`, most of 22 s in `v4-action-kernel` and 3 s in the e2e
file. At the 60–65% seed saving measured in T2.1/T2.2 that is about 80 s of
CPU, or about 10 s of wall time at concurrency 8. The owner chose to split the
next five heavy files instead. T2.3–T2.7 remain not started.

## Checkout and scope

Worktree `D:/Workspace/Tu_Hoc/v4-test-perf`, branch `perf/v4-test-suite`, clean
at T4 HEAD. The canonical pointer was read only: `IDLE`, null run/Story. No
change was made to the main checkout.

Only test files and test fixture modules change. No production module, test
name, assertion, skip or `package.json` script changes.

## Method

As in T3, the original file keeps one group and the other groups move to
`<file>.<group>.test.mjs`. Top-level units are copied unchanged and imports are
reduced to the names each file uses.

Four files had a header of shared fixtures and helpers (up to about 300 lines).
Instead of copying it into every part, the header moved unchanged into a
`<file>-fixture.mjs` module with `export` added to each top-level declaration,
following the T1 pattern. A check confirms each module equals the original
header apart from `export` and imports. No exported binding is reassigned by
tests. The modules carry `fixture` in their names, so the schema-compatibility
architecture scan still skips them.

| Original file | Parts (original name first) | Fixture module |
|---|---|---|
| `check-story-finalization` | base, `review-evidence`, `lifecycle` | `check-story-finalization-fixture.mjs` |
| `v4-rework` | base, `rejection`, `retry`, `risk` | `v4-rework-fixture.mjs` |
| `v4-story-runner` | base, `autopilot-status`, `routing` | `v4-story-runner-fixture.mjs` |
| `reconcile-story-lifecycle` | base, `apply` | `reconcile-story-lifecycle-fixture.mjs` |
| `complete-story` | base, `apply` | none (imports only) |

Five files become 14 (9 new). A line-multiset check against `67799a8` shows
every original line exactly once, except the `noReviewSlice` helper and its
comment, which two `check-story-finalization` parts both use. The inventory
guard reports `MATCH` for all 800 names.

## Verification

Evidence: [perf-t3-2-2026-10-24](evidence/perf-t3-2-2026-10-24/).

| Run | Wall (s) | Node `duration_ms` | Result | Names |
|---|---|---|---|---|
| `full-split2-a` (`npm run test:v4`, concurrency 8) | 620.1 | 619 s | 801 / 800 pass / 1 skip / 0 fail | exact golden multiset + guard, existing skip unchanged |

No other test or integration process ran on the machine, and about 7.6 GB of
memory was free at the start. The T4 run at concurrency 8 took 664–677 s under
outside load, so this is about 8% less, from one sample.

Summed top-level test time fell from 6136 s (T4 `c8-b`) to 4384 s here, mostly
because the machine was less loaded. Summed time divided by wall time is 7.1
here but 9.1 for `c8-b`, above its 8 slots, so this ratio is not a reliable
slot count and no saturation claim is made. Single long tests (for example
`v4-action-kernel` staged recovery) still set a floor that splitting cannot
remove.

## Not done

- T2.3–T2.7 (owner chose this split instead).
- `start-story` (about 161 s) and `v4-registry-fencing` (about 130 s) are of
  similar size but were not in the approved list.
- The 8-minute target (480 s) is not reached.
