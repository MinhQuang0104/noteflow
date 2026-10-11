# V4 test suite performance — implementation plan

Branch: `perf/v4-test-suite` (worktree `D:/Workspace/Tu_Hoc/v4-test-perf`), cut
from `main` 3721785. Runs in parallel with Story work and never touches the main
checkout. Status: **PLANNED**.

## 0. Phase rules and rationale

Follow `README.md` common rules and the V4 Lite migration lane in `AGENTS.md`:
confirm `.agent-state/active-run.json` is `IDLE`, one Conventional Commit per
task, full `npm run test:v4` plus the Python architecture test on every commit.
Rebase onto `main` before each new round of work.

**No weakening.** The suite must keep the same test names and assertions. The
baseline on 2026-10-11 is 799 tests (798 passed, 1 skip for symlinks on Windows,
0 failures). Tests may move between files but are never renamed, merged or
removed. The changes themselves are control-plane changes, so this plan never
counts as a gate for driving a Story until the full suite passes on its commit.

## 1. Measurements (2026-10-11, Windows 11, 12 threads, Node 24.21.0)

- Full `npm run test:v4` at the default concurrency (11 files at once): about
  26 min wall time (`duration_ms` 1 560 122). `g5-runbook.md` records about
  10 min, so contention (process spawning, Defender real-time scanning) is
  likely part of the cost.
- Per file, 4 files at once: 3 227 s in total. The heaviest files:

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
   The 19 tests repeat this setup 19 times.
2. **The test code is synchronous** (`spawnSync`). The `concurrency` option of
   `node:test` inside one file therefore gains nothing, because the event loop
   is blocked. Only separate files, which run in separate processes, run in
   parallel.
3. **One file sets the floor.** `v4-verification-flow` alone takes about
   10 min, so no amount of file-level parallelism makes the suite faster.

## 3. Target

Full `npm run test:v4` under 8 min on the same machine, with the same 799 test
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

T2 and T3 both depend on T1.

### T2 — Template cache: build once, copy per test

- For each fixture variant (keyed by `risk`, `sliceRisk`, `changedPaths` and
  similar options), build one **template repo** per process, memoized. Every
  test gets a fresh copy (`cpSync` into a new `mkdtemp`, including `.git`).
- Points to handle:
  - Run `git update-index --refresh` after the copy, since changed mtimes can
    make git report files as modified.
  - Fixtures that record absolute paths or use worktrees (found in T0) are not
    cached, or have those paths rewritten after the copy.
  - Templates may be shared between tests, so return cloned, frozen metadata
    objects so one test cannot corrupt another. Remove templates in `after()`.
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
  After the split each file gets its own copy; confirm the tests only read it.

### T4 — Tune concurrency and lock in (optional)

- After T2 and T3, measure `--test-concurrency` at 4, 6, 8 and 11, and put the
  best value in the `test:v4` script in `package.json`.
- Add a guard test that fails when the V4 test count differs from the golden
  list, so a later split cannot silently drop tests.
- Update the run time recorded in `g5-runbook.md` and in `README.md`.

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
onto `main`, run the full suite and the Python architecture test on the exact
commit, and record the result in the `README.md` status table.

Optional, outside this plan: excluding `%TEMP%`, `git.exe` and `node.exe` from
Windows Defender real-time scanning needs administrator rights and is the
owner's security decision.
