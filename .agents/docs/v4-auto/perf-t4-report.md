# Perf T4 — concurrency setting and test inventory guard

Status: **T4 IMPLEMENTED**. One local Conventional Commit follows T3
`fb8e6e8`. The campaign source stays pinned to `87469b7` with the
owner-authorized no-rebase exception. T2.3–T2.7 are not started.

## Checkout and scope

Worktree `D:/Workspace/Tu_Hoc/v4-test-perf`, branch `perf/v4-test-suite`, clean
at T3 HEAD. The canonical pointer was read only: `IDLE`, null run/Story. No
change was made to the main checkout.

Changes: the `test:v4` script in `package.json`, three new files in
`.agents/scripts` (`v4-test-inventory.mjs`, `v4-test-inventory.test.mjs`,
`v4-test-names.json`), and run times in `g5-runbook.md` and `README.md`. No
existing test, assertion or skip changes.

## Inventory guard

`v4-test-inventory.mjs` starts a child Node process that maps `node:test` to a
recorder with a module resolve hook, imports every `*.test.mjs` file in order,
and records each top-level `test(...)` name without running any test body.
Module-level setup still runs and its `after` hooks run at the end, so
temporary executors are removed. Nested subtests are not listed; the T0 golden
list holds top-level names only. `describe`/`suite` throw, because no V4 test
uses them and the recorder would not list their tests correctly.

`v4-test-inventory.test.mjs` compares the recorded names, as a multiset and
excluding its own name, with the committed `v4-test-names.json`. It fails on
any added, removed, renamed or duplicated test and says how to update the list:

```bash
node .agents/scripts/v4-test-inventory.mjs --write   # rewrite the list, then review its diff
node .agents/scripts/v4-test-inventory.mjs           # print MATCH or DRIFT
```

Checks:

- The list equals the T0 golden multiset: 800 names, exact.
- The guard passes alone in about 5.4 s.
- Negative probe on a copy in the scratchpad: deleting
  `integrate-story.refusal.test.mjs` and renaming one test reports 3 missing
  and 1 extra name, and the guard test fails.

The guard adds one test, so the full suite now reports 801 tests: the 800
golden names plus the guard.

## Concurrency

The machine has 12 hardware threads, so Node's default is 11 files at once.
Each run below is a full `npm run test:v4 -- --test-concurrency=N` at HEAD
`fb8e6e8` plus the guard. Each passed with 801 tests, 800 pass, 1 existing
skip and 0 fail, and the exact names (golden + guard).

| Run | Concurrency | Wall (s) | Outside load |
|---|---|---|---|
| `c11-a` | 11 | 676.8 | main checkout ran `integrate-story` (full `test:v4`) |
| `c8-a` | 8 | 663.9 | same |
| `c6-a` | 6 | 919.3 | same |
| `c4-a` | 4 | 710.0 | same |
| `c8-b` | 8 | 676.7 | integration ended |
| `c11-b` | 11 | 1065.1 | system low on memory (other applications) |

A third run (`c6-b`) was stopped by the host because memory was low; its
partial log is kept and no result is claimed from it.

Every run had outside load, so these are noisy single samples, not a stable
ranking. Concurrency 8 was the most consistent (664 s and 677 s) and never
slower than 11, and fewer parallel Node and Git processes use less memory.
`test:v4` therefore uses `--test-concurrency=8`. On a machine with fewer
threads this fixed value can oversubscribe; revisit it if the suite moves.

## Result against the plan

| Point | Wall time |
|---|---|
| T0 baseline, default concurrency (2026-10-11) | 990 s |
| T0 baseline, concurrency 4 | 1560 s |
| Same-day baseline before T3 (2026-10-24) | 796 s |
| After T3 and T4, concurrency 8 | 664–677 s |

The 8-minute target (480 s) is not reached. The remaining floor comes from
single long tests (`v4-action-kernel` staged recovery, the no-review e2e base
and two-slice tests) and from files that T3 did not split
(`check-story-finalization`, `v4-rework`, `v4-story-runner`,
`reconcile-story-lifecycle`, `complete-story`). T2.3–T2.7 or further splits
would address them.

## Integration note

When the branch is rebased onto main, tests that main has added since
`87469b7` will make the guard fail until `v4-test-names.json` is regenerated
and its diff reviewed against the reconciled test list.
