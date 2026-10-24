# V4 test suite performance — implementation plan

Branch: `perf/v4-test-suite` (worktree `D:/Workspace/Tu_Hoc/v4-test-perf`), cut
from `main` 3721785. Runs in parallel with Story work and never touches the main
checkout. Status: **T0 COMPLETE; T1 COMPLETE (19dffe2); T2.1 / T2.2 / T3 / T4
IMPLEMENTED; REMAINING T2 ITEMS (T2.3–T2.7) NOT STARTED**. T0 source is pinned to
`87469b7`; see [T0 report](perf-t0-report.md) and its evidence index.

## 0. Phase rules and rationale

Follow `README.md` common rules and the V4 Lite migration lane in `AGENTS.md`:
confirm `.agent-state/active-run.json` is `IDLE`, one Conventional Commit per
task, full `npm run test:v4` plus the Python architecture test on every commit.
**Owner exception for this performance campaign (T0–T4):** keep source baseline
`87469b76b45eddd569d6090d422a4158f12218e0` (`87469b7`); do not rebase onto main
during optimisation. New main commits do not stop or replace this baseline.
Runtime IDLE, scope, verification and one Conventional Commit per task still
apply. The invariant is all 800 baseline test names, preserving multiplicity,
newlines and assertions. Rebase and reconcile new main tests before integration,
then run the full suite and Python architecture test on the exact integration
commit; the integrated suite is not constrained to count 800.

**No weakening.** The suite must keep the same test names and assertions. The
baseline on 2026-10-11 is 800 tests (799 pass, 1 existing skip for symlinks on
Windows, 0 fail), corrected with owner approval because existing main commit
74c7372 added one test. Tests may move between files but are never renamed, merged or
removed. The changes themselves are control-plane changes, so this plan never
counts as a gate for driving a Story until the full suite passes on its commit.

## 1. Measurements (2026-10-11, Windows 11, 12 threads, Node 24.21.0)

- T0 full default concurrency (11 files at once): **16m30.206s** wall time,
  Node `duration_ms` **990062.7761**. Existing complete evidence is reused:
  baseline source and the golden list are unchanged.
- T0 full `--test-concurrency=4`: **26m00.302s** wall time, Node `duration_ms`
  **1560230.5514**. Both full runs: **800 tests, 799 pass, 1 existing skip,
  0 fail**. They ran sequentially. Other test processes were observed on the
  machine, so these single samples do not establish a concurrency speedup.
- Python architecture: **46 tests + 46 subtests passed**, 0.42s pytest time.
- The earlier planning sample below used 4 files at once: 3 227 s summed
  file time. It is historical context, not the T0 baseline. The heaviest files:

| File | Seconds |
|---|---|
| `v4-verification-flow.test.mjs` | 601 |
| `finalize-story.test.mjs` | 373 |
| `check-story-completion.test.mjs` | 252 |
| `v4-action-kernel.test.mjs` | 231 |
| `integrate-story.test.mjs` | 220 |
| `v4-slice-transaction.test.mjs` | 213 |
| `v4-no-review-finalization.e2e.test.mjs` | 197 |

The other 41 files take under 130 s each, and most take under 20 s.

## 2. Root causes

1. **Every test rebuilds its full state.** For example `fixture()` in
   `v4-verification-flow.test.mjs` writes about 20 files, runs `git init`,
   config and commit, then runs a real `implement_slice` (`prepareAction` plus
   `checkpointImplementation`) before it reaches the verification under test.
   T0 measured 41 tests invoking this setup 43 times; setup took 240.492s
   against 262.534s of body time in the isolated instrumented run.
2. **The test code is synchronous** (`spawnSync`). The `concurrency` option of
   `node:test` inside one file therefore gains nothing, because the event loop
   is blocked. Only separate files, which run in separate processes, run in
   parallel.
3. **One file sets the floor.** `v4-verification-flow` alone takes about
   10 min, so no amount of file-level parallelism makes the suite faster.

## 3. Target

Full `npm run test:v4` under 8 min on the same machine, with the same 800 test
names. This is a target to be confirmed by T0, not a promise.

## 4. Tasks

### T0 — Baseline and fixture audit (no code changes)

- Save the list of test names (`--test-reporter=spec`) as the golden list.
- Measure the full suite wall time at the default concurrency and at
  `--test-concurrency=4`.
- For the 7 heavy files, measure fixture setup time against test body time
  (temporary `performance.now()` instrumentation, never committed).
- Check whether each fixture can be copied:
  - Do receipts, Plans or locks record the absolute path of the temporary repo?
  - Does the fixture use `git worktree`? Suspected in `integrate-story` and
    `story-registry`; the `.git` file of a worktree holds absolute paths.
  - Does any test depend on a freshly generated HEAD or timestamp?

Output: a fixture/test ratio for each file and the list of fixtures that are
safe to cache. It decides how far T2 goes.

**Completed:** [perf-t0-report.md](perf-t0-report.md) records all seven ratios,
copy probes, cache boundaries and exact instrumentation restoration. T2 is
bounded to portable seed repos with fresh root-bound functions and cloned
consumer metadata. Completed/staged journals and linked integration topology
must be rebuilt; rewriting absolute path strings is not sufficient to preserve
identity/digest invariants. Callback variants require an explicit contract or
the uncached builder. No cache or fixture extraction was implemented in T0.

### T1 — Extract fixtures into modules (pure refactor)

- Move `fixture()`, `git()`, `write()`, `storySource()`, `planText()` and
  similar builders out of the heavy files into helper modules, following
  `completion-fixture.mjs` and `v4-architecture-fixture.mjs`. Planned names:
  - `v4-verification-fixture.mjs`
  - `finalize-story-fixture.mjs`
  - `v4-kernel-fixture.mjs`
- Collect the helpers that nearly every file repeats (`git()`, `write()`,
  `digest()`) into one shared `v4-test-helpers.mjs`.
- Done when the golden list is unchanged and the full suite passes.

**Implemented:** [T1 report](perf-t1-report.md) records the pure extraction,
11 focused checks, full 800/799/1/0 suite and exact golden-name comparison,
Python 46 tests + 46 subtests, and byte-bound diff self-check. Exact final
commit verification is recorded locally in the post-commit evidence sidecars
linked by that report; completion requires their successful final binding check.
No cache, test split or concurrency change was implemented.

T2 and T3 both depend on T1.

### T2 — Template cache: build once, copy per test

- For each fixture variant (keyed by `risk`, `sliceRisk`, `changedPaths` and
  similar options), build one **template repo** per process, memoized. Every
  test gets a fresh copy (`cpSync` into a new `mkdtemp`, including `.git`).
- Points to handle:
  - Run `git update-index --refresh` after the copy, since changed mtimes can
    make git report files as modified.
  - Follow the T0 cache boundaries: cache before transaction/claim/worktree
    setup and rebuild that state on each copy. Do not rewrite journal identity,
    locks or linked-worktree registration as a shortcut.
  - Freeze pure template metadata; return separate cloned consumer metadata
    that remains mutable where existing tests mutate it. Bind functions to the
    new root; copying an object and changing `root` does not rebind closures.
    Remove templates in `after()`.
  - Tests that build broken state on purpose (tamper, crash recovery) still copy
    the template, then break their own copy.
  - Add `V4_TEST_NO_CACHE=1` to fall back to the old per-test build.
- Order, one commit per file:
  1. `v4-verification-flow`
  2. `finalize-story`
  3. `check-story-completion`
  4. `v4-action-kernel`
  5. `integrate-story`
  6. `v4-slice-transaction`
  7. `v4-no-review-finalization.e2e`

**First item (T2.1) implemented:** [T2.1 report](perf-t2-1-report.md) records the
portable pre-action verification seed cache, nine probe checks outside the
golden glob, cache-on/off 41-test runs, sequential full cached/fallback checks
with all 800 names preserved, and Python architecture verification. Exact
final commit checks are local post-commit sidecars linked by the report.
The six proven plain-data variants use independent copies including `.git`;
all prepare/checkpoint and later transaction state is rebuilt per copy.
Other variants and `V4_TEST_NO_CACHE=1` use the original builder. Measured warm
seed saving is 326.802ms (60.4%); full/file timing does not establish a stable
speedup. The remaining five T2 items, T3 and T4 remain unimplemented.

**Second item (T2.2) implemented:** [T2.2 report](perf-t2-2-report.md) records
only the portable reviewed finalize-story seed, before finalization/recovery
and linked worktree setup. The unchanged T2.1 helper creates independent Git
copies with fresh root/cleanup and cloned mutable metadata. Only the default
no-argument contract is admitted; unproven callers/custom Git bindings and
`V4_TEST_NO_CACHE=1` keep the old builder. Executor fixture/dynamic import,
lifecycle, journals, locks and linked registration remain independent.
Eight probes pass outside the golden glob; focused on/off 33/33 each; accepted
sequential full cached/fallback runs 800/799/1/0 preserve all names, newlines,
multiplicity and existing skip. Python 46 tests + 46 subtests passed. Warm seed
saves 508.930ms (65.24%); the file pair differs by 17.233s (5.43%), and full pair
by 2.637s (0.24%), without a stable causal speedup claim. Exact final commit
verification is retained in separate local post-commit sidecars. Baseline
87469b7 remains pinned with no rebase. Remaining T2 items, T3 and T4 are not started.

### T3 — Split heavy files so they run in parallel

- Target: **each file under about 90 s**, so no single file sets the floor.
- Split by behaviour group and keep the name prefix, so the `*.test.mjs` glob
  picks up the new files. For example:
  - `v4-verification-flow.test.mjs` becomes `v4-verification-flow.prepare.test.mjs`,
    `.review.test.mjs` and `.recovery.test.mjs`;
  - `finalize-story.test.mjs` becomes `.apply.test.mjs` and `.recovery.test.mjs`.
- Only move tests between files; never rename them, so the golden list still
  matches.
- `finalize-story.test.mjs` builds a module-level `executorFixture` (line 17).
  After the split each file gets its own copy. T0 confirmed that the executor
  drift test temporarily writes and restores its code, so do not share this
  executor across files or concurrently executing tests.

**Implemented (before T2.3–T2.7, at the owner's request):** [T3 report](perf-t3-report.md)
splits the seven heavy files into 38 files by moving top-level test units and
partitioning three long loops by input; names and assertions are unchanged.
Full runs 800/799/1/0 with the exact golden multiset: split 596.5 s and
671.1 s against a same-day baseline of 796.1 s (about 20% less wall time, one
baseline sample). The 8 min target is not yet reached.

### T4 — Tune concurrency and lock in (optional)

- After T2 and T3, measure `--test-concurrency` at 4, 6, 8 and 11, and put the
  best value in the `test:v4` script in `package.json`.
- Add a guard test that fails when the V4 test count differs from the golden
  list, so a later split cannot silently drop tests.
- Update the run time recorded in `g5-runbook.md` and in `README.md`.

**Implemented:** [T4 report](perf-t4-report.md). `test:v4` uses
`--test-concurrency=8`; `v4-test-inventory.test.mjs` compares the top-level
test names that every test file registers against `v4-test-names.json`
without running test bodies. Measurements were taken under outside load and
are noisy: concurrency 8 took 664 s and 677 s, never slower than 11
(677 s and 1065 s).

## 5. Risks

| Risk | Mitigation |
|---|---|
| Caching couples tests and makes them flaky | Every test gets a fresh copy. Run the full suite 2–3 times in a row at the end of each task. |
| Copying `.git` on Windows fails on long paths or locked files | Keep temporary directory names short; `V4_TEST_NO_CACHE=1` falls back to the old build. |
| The optimised suite checks less than before | Compare against the golden list, never edit assertions, review each test file diff. |
| These changes are control-plane changes | Use the V4 Lite lane, one commit per task, full suite on every commit. |

## 6. Expected effect

T3 almost certainly helps, because it removes the 10 min floor of
`v4-verification-flow`. T2 may give the largest gain, but its size depends on
the fixture/test ratio that T0 measures, so no number is claimed yet.

## 7. Integration

The branch stays local until the owner asks to merge. Before merging, rebase
onto `main`, reconcile all new main tests as well as the preserved baseline
names/assertions, run the full suite and the Python architecture test on the
exact integration commit, and record the result in the `README.md` status table.
The integrated suite is not constrained to 800 tests.

Optional, outside this plan: excluding `%TEMP%`, `git.exe` and `node.exe` from
Windows Defender real-time scanning needs administrator rights and is the
owner's security decision.
