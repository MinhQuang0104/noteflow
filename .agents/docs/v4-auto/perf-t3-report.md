# Perf T3 — split heavy V4 test files

Status: **T3 IMPLEMENTED** for the seven heavy files named in the plan. One
local Conventional Commit follows T2.2 `76def3156c525977ae8c4980e2b4eed82f53c920`.
The campaign source stays pinned to `87469b76b45eddd569d6090d422a4158f12218e0`,
with the owner-authorized no-rebase exception. Remaining T2 items (T2.3–T2.7)
and T4 are not started; the owner chose to run T3 before them.

## Checkout and scope

Worktree `D:/Workspace/Tu_Hoc/v4-test-perf`, branch `perf/v4-test-suite`, clean
at T2.2 HEAD. The canonical pointer was read only: `IDLE`, null run/Story.
No change was made to the main checkout.

Risk: LOW to MEDIUM. Only test files move; no production module, fixture
module, test name, assertion, skip, `package.json` script or concurrency
setting changes. No active instruction, router, contract or script references
the split file names (historical plans and receipts only).

## Method

Each heavy file keeps its original name for one behaviour group and gives the
other groups new `<file>.<group>.test.mjs` files (`.e2e.test.mjs` keeps its
suffix), so the existing `*.test.mjs` glob runs them. Splitting was mechanical
on top-level units (`test(...)` or a `for` loop of tests): each unit's text is
copied unchanged, imports are reduced to the names each file uses, and the
non-import header is kept in every part.

- `finalize-story`: the committed executor fixture and `request()` helper are
  kept only in parts that use `recovery`; each such file builds its own
  executor, as T0 required, and none shares it across files.
- Three long loops are partitioned by their input array without changing the
  loop body: `finalize-story` recovery rejection (6 + 6 scenarios), recovery
  interruption (3 + 2 phases), and `v4-slice-transaction` staged retry
  (4 + 4 phases).
- A line-multiset check against `76def31` shows every original non-import line
  exactly once, except the intended duplicates: the `request()` helper, the
  executor header and the partitioned loop bodies.

| Original file | Parts (original name first) |
|---|---|
| `v4-verification-flow` | base, `risk`, `review`, `owner-review`, `structured-review`, `recovery`, `retirement` |
| `finalize-story` | base, `recovery`, `recovery-history`, `recovery-reject-input`, `recovery-reject-state`, `recovery-interrupt-early`, `recovery-interrupt-late` |
| `check-story-completion` | base, `drift`, `approval-mismatch`, `review-receipt`, `terminal`, `terminal-head` |
| `v4-action-kernel` | base, `agy`, `staged-recovery`, `recovery`, `metadata-retry` |
| `integrate-story` | base, `failures`, `stale`, `locks`, `refusal` |
| `v4-slice-transaction` | base, `recovery`, `retry-early`, `retry-late` |
| `v4-no-review-finalization.e2e` | base, `review`, `raised-risk`, `two-slice` |

Seven files become 38 (31 new). The groups were sized from per-test durations
in the T2.2 exact final run, aiming at roughly 100–140 s of contended test time
per file. Single tests set the remaining floor: `v4-action-kernel` staged
recovery (one test) and the e2e base and two-slice tests.

## Verification

Evidence: [perf-t3-2026-10-24](evidence/perf-t3-2026-10-24/). All runs use the
default concurrency, sequentially, on the same machine on 2026-10-24.

| Run | Files | Wall (s) | Node `duration_ms` | Result | Names |
|---|---|---|---|---|---|
| `full-split` | split | 596.5 | 596058 | 800 / 799 pass / 1 skip / 0 fail | exact golden multiset, skip unchanged |
| `baseline-same-day` | original `76def31` | 796.1 | 795631 | 800 / 799 / 1 / 0 | exact golden multiset |
| `full-split-2` | split | 671.1 | 670566 | 800 / 799 / 1 / 0 | exact golden multiset, skip unchanged |

For the baseline run, the original files were restored in the working tree
from `76def31` and the split files were restored afterwards from a backup.
Python architecture: 46 tests + 46 subtests passed.

The two split runs average about 634 s against 796 s for the same-day baseline,
about 20% less wall time. The summed top-level test time rose (5645 s split
against 4847 s baseline), so average parallelism went from about 6.1 to about
9.5 of 11 slots: the gain comes from better file packing, not less work. One
baseline sample and other load on the machine make this an estimate, not a
stable measurement. The 8 min target is not yet reached.

The run script also asked for a JUnit report; Node did not write it, so the
per-file timing above comes from per-test durations in the spec logs.

## Not done

- Other files that are now comparable in size (`check-story-finalization`,
  `v4-rework`, `v4-story-runner`, `reconcile-story-lifecycle`,
  `complete-story`) are not split. T4 measurement should decide whether to.
- T2.3–T2.7 caches and T4 concurrency tuning and count guard are not started.
