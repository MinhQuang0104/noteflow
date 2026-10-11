# Perf T0 — baseline and fixture audit

Status: **COMPLETE; T1–T4 NOT STARTED**. Documentation/evidence commit: this
commit on `perf/v4-test-suite`. All measurements use baseline source
`87469b76b45eddd569d6090d422a4158f12218e0` (`87469b7`) in
`D:/Workspace/Tu_Hoc/v4-test-perf`. No implementation, assertion, test name or
`package.json` change is delivered.

## Owner decisions and source binding

On 2026-10-11 the owner approved correcting the plan's historical 799-test
invariant to **800 tests, 799 pass, 1 existing skip, 0 fail**. Commit
`74c73724aea250dee249d99d55c826c85e8f8080` adds exactly one test in
`start-story.test.mjs`:

> a CRLF working Epic under core.autocrlf still matches the committed LF section digest

That commit is an ancestor of `87469b7`; the added test appears once and passes
in the baseline spec log. [The commit diff](evidence/perf-t0-2026-10-11/baseline-added-test.patch)
is retained. This approval permits a baseline correction only: no removal,
renaming, merging, new skip or assertion change.

The owner's subsequent decision pins **source 87469b7 for T0–T4** and overrides
README's rebase-before-every-round rule for this performance campaign. Main
advancing is informational, not grounds to stop or replace the baseline. No
rebase occurred in the resumed campaign. Runtime IDLE, scope, verification and
one Conventional Commit per task remain in force. Before integration, rebase
onto main, reconcile its new tests, and run the full suite plus Python
architecture on the exact integration commit. **Do not apply count 800 to the
integrated suite.**

The first checkout was clean, branch/top-level were verified, and its initial
`git rebase main` was already up to date. Subsequent dirty files were only T0
report/evidence and the authorized plan correction, carried through the owner
continuations. Latest campaign preflight observed main `2d64650` and no policy
drift: `AGENTS.md`, router and all runner skill files match canonical main.
Canonical `.agent-state/active-run.json` was read only and clearly IDLE, with
null activeRunId/storyId. Its SHA-256 remained
`5febd755d0136d14d573383bd88f33e8856acbaa0b4a2d25fd592e1820811ae4`.

[Campaign preflight](evidence/perf-t0-2026-10-11/campaign-preflight.json)
binds the reused default log to source commit, original fixture/package byte
hashes and scripts tree `be40aaa5756b67ecbb8c01f39bc0539c418ab511`.
`preflight.json`, `stop.json`, `final-state.json`, `resume-check.json`, the
incoming-main patch and interrupted concurrency log are retained as
**historical evidence of the earlier stops**, superseded by the owner decisions
above. Their old stopped status is not the final T0 status.

## Full baseline and architecture verification

Environment: Windows 11, Ryzen 5 5625U (6 cores/12 logical processors),
`availableParallelism()` 12, Node 24.21.0, Git 2.49.0.windows.1, Python 3.14.8.
The full test set is all 48 `.agents/scripts/*.test.mjs` files used by
`npm run test:v4`. Each JSON sidecar records the fully expanded command,
source HEAD, wall time, exit code and reporter counts.

| Run | Wall time | Reporter time | Tests/pass/skip/fail | Exit |
|---|---:|---:|---|---:|
| Full default concurrency (11) | **990.206s / 16m30.206s** | 990062.7761ms | **800 / 799 / 1 / 0** | 0 |
| Full concurrency 4 | **1560.302s / 26m00.302s** | 1560230.5514ms | **800 / 799 / 1 / 0** | 0 |
| Python architecture | **0.804s** process wall | 0.42s pytest | **46 tests + 46 subtests passed** | 0 |

Both full runs also report zero cancelled/todo. The only skip is the existing
`rejects symlinked cwd or referenced paths`, annotated that Windows symlink
creation is unavailable. No new skip was introduced.

The complete default measurement ran 12:51:03.920–13:07:34.071 UTC and was
reused as the owner requested; no source change invalidated it. The completed
concurrency-4 measurement ran 13:28:38.035–13:54:38.337 UTC, after default had
finished. Python ran next with README's command:
`D:/Tools/Python314/python.exe -m pytest -q _bmad/scripts/tests/test_agent_architecture.py`.
Seven instrumented runs then ran sequentially, one file per process at
`--test-concurrency=1`; copy probes ran after restoration. These owned runs did
not overlap.

Evidence: [default log](evidence/perf-t0-2026-10-11/default.log),
[default metadata](evidence/perf-t0-2026-10-11/default.json),
[concurrency-4 log](evidence/perf-t0-2026-10-11/concurrency-4.log),
[concurrency-4 metadata](evidence/perf-t0-2026-10-11/concurrency-4.json),
[Python log](evidence/perf-t0-2026-10-11/python-architecture.log).

Other test runners were observed on the machine: PID 5592 overlapped part of
default, and PID 33344 appeared during concurrency 4. They were not stopped or
controlled. [Process observations](evidence/perf-t0-2026-10-11/process-observations.jsonl)
record only selected process metadata, not full command lines. The measured
concurrency-4 sample is 57.6% longer, but **this is not an isolated concurrency
comparison**. One sample per mode and different background load cannot justify
selecting T4 concurrency or claiming a causal speedup/slowdown. No Defender or
security setting was changed.

## Golden names and instrumentation integrity

[golden-test-names.json](evidence/perf-t0-2026-10-11/golden-test-names.json)
is a lossless ordered array extracted from the default spec reporter. It
contains **800 occurrences**, currently 800 distinct names, including seven
names containing embedded newlines. Names are not trimmed, normalized,
deduplicated or joined into ambiguous one-line records. JSON newline escapes
round-trip to the actual name characters. The full concurrency-4 output has
exactly the same name multiset. The golden file's bytes remain unchanged:
SHA-256 `c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393`.

`golden-test-occurrences.json` records each ordinal, exact name, status, duration
and annotation; `golden-name-multiset.json` preserves counts without relying
on concurrent completion order. Instrumented spec names and callback names
match the golden subset exactly: **184 tests, 184 pass, 0 skip, 0 fail** across
seven files. See [name check](evidence/perf-t0-2026-10-11/instrumentation-name-check.json).

Temporary `performance.now()` wrappers timed fixture constructors and each
registered test callback, retaining original names, options and assertions.
Async builders were timed through settlement. A nested constructor's duration
was included once in the outer setup; nested records are diagnostic only.
Cleanup and filesystem audit snapshots were measured separately and subtracted
from callback time. Body = callback elapsed minus setup, cleanup and audit.
Module executor setup was recorded separately. Process wall additionally
includes loading, reporter and teardown. Small wrapper/recording overhead
remains; these ratios are isolated-file samples, not a partition of the full
parallel suite wall time.

All seven test files and three shared fixture helpers were restored from raw
byte backups, including original CRLF/newline bytes. [restoration.json](evidence/perf-t0-2026-10-11/restoration.json)
contains before/instrumented/restored SHA-256 for all ten files; every exact
restore check passed. Protected Git diff is empty. Instrumentation code and
private probe modules are not committed.

## Seven-file setup/body measurement

Seconds below are summed inside each serial file run. Fixture share is
`fixture / (fixture + body)`; ratio is `fixture / body`. All file runs exit 0;
each row's tests all pass, with no skips/failures.

| File | Tests | Outer setup calls | Wall s | Fixture s | Body s | Fixture share | Fixture:body |
|---|---:|---:|---:|---:|---:|---:|---:|
| `v4-verification-flow.test.mjs` | 41 | 43 | 504.722 | 240.492 | 262.534 | 47.81% | 0.916 |
| `finalize-story.test.mjs` | 33 | 32 | 309.650 | 24.970 | 283.090 | 8.11% | 0.088 |
| `check-story-completion.test.mjs` | 35 | 32 | 197.404 | 126.453 | 69.825 | 64.43% | 1.811 |
| `v4-action-kernel.test.mjs` | 24 | 41 | 203.187 | 21.827 | 180.009 | 10.81% | 0.121 |
| `integrate-story.test.mjs` | 9 | 10 | 175.224 | 130.506 | 43.658 | 74.93% | 2.989 |
| `v4-slice-transaction.test.mjs` | 36 | 36 | 193.656 | 48.218 | 144.831 | 24.98% | 0.333 |
| `v4-no-review-finalization.e2e.test.mjs` | 6 | 6 | 179.062 | 2.979 | 175.588 | 1.67% | 0.017 |

Finalize's module executor setup is another **0.614s**, outside callbacks;
including it gives 8.29% fixture share. The kernel setup count includes four
maintenance executors and eight agy builders, not 41 identical seed repos.
Integration includes nine full fixtures and one small architecture fixture.

High setup share does not imply that all setup is cacheable:

- Completion: 28 direct base builders cost **56.367s**; four completed builders
  cost **70.086s**, including **8.082s** nested base setup. Approval/completion
  transactions must still run freshly.
- Integration: nine full fixtures cost **130.182s**, but their nested portable
  completion seeds account for only **17.978s**. The linked-worktree,
  completion and registry setup remains per-copy work.
- Transaction: 12 raw seeds cost **9.600s**; 24 staged builders cost **38.618s**,
  including **18.336s** nested raw seeds. Recovery staging must still be rebuilt.
- Verification setup includes checkpoint execution; the pre-checkpoint seed
  portion was not independently timed. Do not treat all 240.492s as savings.

The largest individual callback is kernel staged recovery at **68.011s**;
the mixed two-slice e2e callback is **66.185s**. Splitting files may reduce a
file's accumulated floor, but neither caching nor the under-8-minute target
has been implemented or demonstrated in T0.

[Timing summary](evidence/perf-t0-2026-10-11/timing-summary.json) contains exact
milliseconds, cleanup/audit times, constructor counts and largest callbacks.
Each `instrumented-*.timing.jsonl`, `.log` and `.json` retains raw timing,
spec results and source binding.

## Copy probes and cache audit

Eight independent temp-repo probes used restored original constructors, with
private extraction only for builders local to test files. The extraction
manifest binds source byte hashes and line ranges. Each repo was copied into
a fresh temp directory **including `.git`** and its index refreshed. Before
any action, all eight preserved HEAD, non-Git file bytes and porcelain status.
The transaction seed intentionally has a modified tracked implementation;
`git update-index --refresh` returned 1 with `needs update`, while status/bytes
remained identical. That is expected fixture state, not a baseline failure.

[copy-probes.json](evidence/perf-t0-2026-10-11/copy-probes.json) records the
following observed outcomes. These probes establish bounded portability, not
coverage of every constructor variant or a production cache implementation.

| Seed/state | Evidence and cache decision |
|---|---|
| Finalize reviewed seed | Original and copied finalization gate both READY, unchanged hashes/HEAD/status. Safe filesystem-template candidate with a newly bound cleanup and cloned `expectedPaths`. Create any later linked worktree separately. |
| Completion default seed | Original and copy both valid BLOCKED/HUMAN_APPROVAL_REQUIRED, with equal preview/digests. This is the expected unapproved state. Safe filesystem-template candidate; recreate `read`, `write`, `git`, `readPlan`, `refreshHead`, cleanup and mutable metadata per copy. A copied object with a changed `root` still read the original seed in the dynamic closure probe. |
| Kernel v1/v2 seeds | Both copies prepare READY. Safe baseline-template candidates; deep-clone requests, rebind cleanup/root, then run actions freshly. `autocrlf` and agy/executor variants were snapshot-audited but need variant-specific equivalence checks in T2. |
| Transaction raw seed | Copy execution with a fresh snapshot and descriptor checkpoints successfully (CHECKPOINTED, no reasons, new copy-local journal/lock and two commits). Safe raw-template candidate preserving dirty input bytes/status. Recreate snapshots, callbacks and descriptor, not a returned object clone. |
| No-review pending seed | LOW copy validates READY, no journal/receipt at setup. Safe seed candidate with cloned slice contracts and fresh cleanup. MEDIUM/mixed variants require their own key/equivalence checks. Always run the complete action chain freshly. |
| Verification after checkpoint | Copy prepare reports READY, but completed-journal replay is STALE/COMPLETED_TRANSACTION_BINDING_MISMATCH. Old absolute identity and new scope hash differ. **Do not cache this completed fixture.** A pre-prepare/checkpoint seed is only a future candidate; rebuild checkpoint on the copy. |
| Full integration fixture | Copied worktree list and `.git/worktrees/canonical/gitdir` still reference the original linked canonical directory; its `.git` points back to the original common dir. Registry claim still owns the original root. **Rebuild full topology/claim/lifecycle state.** Only its underlying completion seed is a candidate. No integration was attempted against copied stale topology. |
| Completed/staged variants | Runtime snapshots show completed lifecycle journals, or RECOVERY_REQUIRED transaction journal/lock, with path identity/timestamps. **Rebuild approval/completion or failure staging after copying a raw seed.** Never cache/share/rewrite recovery evidence. |

[Fixture snapshots](evidence/perf-t0-2026-10-11/fixture-audit-snapshots.json)
include sampled variants, file hashes, absolute fields, timestamps, digests,
Git metadata and closure source text. Plans/receipts in portable seeds use
relative artifact paths and history-bound HEAD/digests. Verification journals
store absolute repository/worktree, lock/journal paths, `lock_identity`, scope
key and timestamps. Completed/integration lifecycle journals also contain
repository/worktree identity; staged transaction snapshots contain both the
journal and lock. Integration registry records absolute worktree, branch,
controlPlaneCommit, planHead, generation, claimedAt and heartbeatAt.

Identity is structural: `v4-slice-transaction.mjs` hashes
repository/worktree/action/story/slice into scope paths, while lifecycle scope
uses Git common dir/worktree/story. A path-string replacement does not prove
fingerprint/lock/identity equivalence. `git update-index --refresh` repairs
stat cache only; it cannot fix linked registration, journals, claims, closures,
approvals or dependent digests. Integration check/executor argv and maintenance
module URLs also depend on script/executor location and source, requiring
fresh binding and source-aware keys.

Git commit timestamps participate in HEAD. The audited tests compare content,
ancestry, HEAD progression and digests; none requires each seed to have a new
SHA or its timestamp to equal current wall time. Keep template Git objects and
receipt bytes intact; generate later action commits and journal/claim times on
the copy. Do not refresh timestamp strings in cached evidence. Fixed approval
time in tests stays intact; do not cache heartbeat/TTL/recovery freshness.

Completion `mutateReview` runs before receipt hashing/commit. JSON keys omit
callbacks, and function source cannot represent captured/stateful context.
Keep all such variants uncached unless a later explicit pure variant contract
proves identical behavior. Requests, `expectedPaths`, worker data, finalization,
scope paths and input slice arrays are mutable in existing tests. Freeze only
private pure template data and return separate mutable consumer copies;
functions and ESM namespaces need factories, not structured cloning.

Finalize's module executor is **not read-only**: the executor-drift test at
`finalize-story.test.mjs:432–452` temporarily changes its script and restores
it in `finally`. It is already built once per process. Preserve that isolation;
a future T3 split must give each file its own executor, and must not introduce
concurrent access to the mutating test. Maintenance executor/module caching
needs additional source/URL/isolation proof and is outside the initial T2 scope.

## Bounded T2 proposal

T0 proposes per-process immutable filesystem templates with independent temp
copies for: finalize reviewed seed, completion default and explicit path-only
variants, kernel baseline seed, transaction raw seed and e2e pending seed.
Key all byte-affecting options, including risk/sliceRisk/changedPaths,
implementationPaths, schema/executor/autocrlf and full ordered slice contracts
(id, path, task, risk, dependsOn), plus relevant builder/executor source identity.
Only probed variants have runtime portability evidence; other variants need
cache-on/off equivalence verification before inclusion.

For verification and integration, cache only a lower pre-action seed if later
T1/T2 extraction preserves behavior. Re-run checkpoint, approval/completion,
linked worktree registration, claims and recovery staging on each copy.
Initially leave `mutateReview`, completed/staged state and maintenance executor
module objects on the uncached path. No broad journal/worktree path rewriting
is proposed. Keep the planned `V4_TEST_NO_CACHE=1` fallback and use it when a
variant is not proven portable.

This scope deliberately excludes the expensive nonportable action setup from
estimated cache savings. Re-measure after T2 and T3 with controlled background
load before choosing T4 concurrency. T0 authorizes no removal/merging of tests,
new skips, assertion changes or reduced behavioral execution. **T1 is not started.**

## Final verification and evidence index

All delivered changes are this report, the perf plan, its README status row and
T0 evidence. Full concurrency-4 suite and Python passed on pinned source;
default is reused with complete source-bound evidence. Those results remain
applicable to this documentation-only task because source tree/package/tests
are unchanged after exact instrumentation restoration. This is not an exact
integration-commit or Story-driving control-plane gate.

Raw spec logs retain spaces before embedded newlines in the seven multiline
names; raw diff evidence retains blank context-line prefixes. These produce
expected whitespace-check diagnostics and are not normalized. The staged
whitespace check passes for documentation and structured evidence, excluding
only raw `.log`/`.patch` files. Logs are explicitly included despite the
repository's generic log ignore rule. A local evidence `.gitattributes` disables
text normalization for this archive, preserving measured CRLF/LF bytes and the
golden SHA-256 in Git as well as in the working tree.

[completion-check.json](evidence/perf-t0-2026-10-11/completion-check.json)
records final source/byte checks, golden consistency, policy comparison,
canonical IDLE pointer/hash and delivery scope. No canonical runtime writes,
Orca/AGY/live Story, subagent, push or merge occurred. There are no unresolved
baseline failures or owner decisions blocking T0. Future cache implementations
must respect the exclusions and additional variant checks above.

Evidence directory: [evidence/perf-t0-2026-10-11](evidence/perf-t0-2026-10-11/).
Core evidence: `default.*`, `concurrency-4.*`, `python-architecture.*`,
`golden-*.json`, `timing-summary.json`, `instrumented-*`,
`fixture-audit-snapshots.json`, `copy-probes.json`, `copy-probe-sources.json`,
`restoration.json`, `campaign-preflight.json` and `completion-check.json`.
