# Perf T2.2 — portable reviewed finalize-story seed cache

Status: **T2.2 IMPLEMENTED; exact final commit verification recorded locally after commit**. Scope is only
the second T2 item. Remaining T2 items, T3 and T4 are not started. One
local Conventional Commit follows T2.1 `78fdda19dcad9c15f69fcdd62814ab9f89be7034`.
The campaign source stays pinned to `87469b76b45eddd569d6090d422a4158f12218e0`,
with the owner-authorized no-rebase exception.

## Checkout and scope

The requested worktree and branch were clean at T2.1 HEAD. T2.1's local
exact-final-check is PASS for that SHA. All 14 policy files matched canonical
main `fe8940d`; canonical pointer was read only, IDLE with null run/Story,
SHA-256 `5febd755d0136d14d573383bd88f33e8856acbaa0b4a2d25fd592e1820811ae4`.
See [preflight](evidence/perf-t2-2-2026-10-12/preflight.json).

Risk: MEDIUM, affecting fixture state and consumer integration. No production,
test name/assertion/skip, action chain, package/concurrency, other fixture,
runtime policy or canonical runtime change is delivered. The shared T2.1
helper is reused unchanged; a separate shared-helper regression is therefore
not required. Existing verification-flow coverage remains in each full run.

## Cache boundary and contracts

`finalize-story-fixture.mjs` retains the original reviewed builder body. Its
three-commit repository contains the reviewed Plan and implementation,
verification and review receipts. The private template stops before all
finalization/recovery actions and before any linked worktree is created.
No journal, lock, recovery evidence or linked-worktree registration is cached
or rewritten. T0 proved this exact default reviewed seed portable.

Only the no-argument contract is admitted. Other calls retain the original
builder's behavior of ignoring arguments. `V4_TEST_NO_CACHE=1` bypasses all
keying/templates and calls that builder. External Git repository/object/index
bindings, custom templates/hooks/fsmonitor and conditional Git includes also
fall back; those configurations need their own portability proof.

The key covers every local `.mjs` module's raw bytes (a conservative superset
of the builder/parser/digest dependencies), effective external Git config and
origins, full environment, cwd/temp directory, Node executable/version and
platform/architecture. Config is queried outside a repository because the
current checkout's local config is not inherited by Git init in a temp repo.
Environment/source key invalidation is probed without modifying campaign code.
The cache is process-local; additional fixture contracts require a separate
portability/equivalence proof before admission.

Every test receives a fresh mkdtemp and a full copy including its own `.git`.
The shared helper refreshes the index, then verifies exact original HEAD and
porcelain/NUL status. Repo bytes and receipt/Plan digests are preserved;
index stat fields are refreshed rather than treated as immutable bytes.
Only internal template metadata is deeply frozen. Each consumer has a
mutable structured clone of `head`, `storyDigest` and `expectedPaths`, plus
newly bound root/cleanup. `candidate` and `preserved` still use their supplied
consumer root. Consumer cleanup removes only its copy; after/exit removes
private templates.

The module-level `executorFixture`, its committed script copy, dynamic import,
executor drift mutation/restoration, lifecycle calls and isolation are
byte-identical to T2.1. No executor is cached or shared by this change.

## Verification and measurements

| Run | Result | Wall seconds |
|---|---|---:|
| Fresh T2.1 baseline full | 800 tests / 799 pass / 1 existing skip / 0 fail | 893.885 |
| Baseline Python | 46 tests + 46 subtests | 1.099 |
| Final cache/copy/equivalence/key/cleanup probe | 8/8 pass | 28.262 |
| Finalize-story, cache on | 33/33 pass | 300.075 |
| Finalize-story, cache off | 33/33 pass | 317.308 |
| Full cache on, pre-commit | 800 / 799 / 1 / 0 | 1078.090 |
| Full fallback, pre-commit | 800 / 799 / 1 / 0 | 1080.727 |
| Pre-commit Python | 46 tests + 46 subtests | 1.018 |

Both accepted pre-commit full runs preserve all 800 occurrences, multiplicity
and seven embedded-newline names without trimming or normalization. Counts
are 800 / 799 / 1 / 0, with zero cancelled/todo and the original symlink skip
name and annotation. Golden SHA-256 remains
`c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393`.
Source hashes and Git status are identical before/after each accepted full run.

The probes live outside `*.test.mjs`. Controlled commit dates permit direct
cached/uncached comparison of HEAD, file bytes, raw commit history, receipt
digests, Plan refs, preparation results and candidate previews. Independent
Git copies, later consumer mutation, root-bound functions/cleanup, restored
environment keys, source invalidation in a sandbox, unknown-call fallback and
custom-hook fallback are also checked. The RED probe reproduced missing
cache reuse/isolation contracts (5 failures); the accepted final probe passes
all eight checks. [Final probe](evidence/perf-t2-2-2026-10-12/probe-final.log).

The seed-only benchmark interleaves ten warm-cache and ten uncached samples:
**271.151ms cached versus 780.081ms uncached**, saving **508.930ms (65.24%)**
per warm seed. Cold template construction plus the first copy costs
**1099.183ms**. Cleanup is timed separately. See
[raw seed timing](evidence/perf-t2-2-2026-10-12/seed-timing.json).

The isolated full-file pair is **300.075s cached versus 317.308s uncached**,
a measured difference of **17.233s (5.43%)**. This single pair, with uncontrolled
background load and external Node processes, does **not** establish a stable
causal file speedup. T0 found fixture setup accounted for only **8.11%** of
this file. No seed-to-file extrapolation or whole-suite speedup is claimed;
the under-eight-minute suite target remains unproven. Each accepted run stores
commands, source hashes and process observations. The full pre-commit pair
differs by only 2.637s (0.24%); it also does not establish a causal suite speedup.

## Findings, diff and evidence integrity

[Diff self-check](evidence/perf-t2-2-2026-10-12/diff-self-check.json) binds all
48 test files and every other script/package/Python source to the fresh
baseline's raw checkout hashes. It compares the complete original builder
body and candidate/preserved helpers with T2.1, accounting explicitly for
Git LF versus checkout CRLF. The source diff is only the reviewed fixture.
Staged evidence checks preserve raw log/JSON/patch bytes.

A runner invocation mistakenly started a duplicate probe because `full-only`
selection had not yet been implemented. It was interrupted; no owned process
remained and fixture source was unchanged. Its overwritten raw log and the
initial metadata are retained separately as diagnostic evidence, excluded
from accepted verification/timing. A fresh final probe restored a correctly
bound accepted log/metadata pair. The runner now selects only remaining full
runs when requested. See
[interrupted-run record](evidence/perf-t2-2-2026-10-12/interrupted-run.json).
No behavior change, baseline failure or unresolved issue required an owner
decision.

The first full cached attempt reported 800 tests / 798 pass / 1 fail / 1 skip:
the R03 source-preservation assertion correctly detected this report being
created during its run. That is a VALID verification-workflow finding, not a
fixture behavior failure. Script bytes were unchanged. The failed attempt is
retained as diagnostic evidence and excluded from accepted timing/checks.
Checkout writes are now confined to the already-present evidence directory
while tests run, and the runner records Git status before/after as well as
source hashes. The unchanged R03 file passed 2/2 with stable checkout status (13.199s),
then both repeated full pre-commit runs passed. No assertion or production fix
is needed. See [status-drift diagnosis](evidence/perf-t2-2-2026-10-12/status-drift-diagnosis.json).

## Exact final commit evidence

After the single Conventional Commit, run the third full suite with cache on
and Python on exact HEAD. Local ignored post-commit sidecars are separate:
[full](evidence/perf-t2-2-2026-10-12/exact-final-full.json),
[Python](evidence/perf-t2-2-2026-10-12/exact-final-python.json),
[golden check](evidence/perf-t2-2-2026-10-12/exact-final-full-name-check.json),
[binding check](evidence/perf-t2-2-2026-10-12/exact-final-check.json).
Completion requires PASS on that exact SHA, clean Git, one commit after T2.1,
three sequential full runs including fallback, unchanged source/golden bytes,
and an unchanged canonical pointer. No amend or duplicate commit is allowed.

Evidence directory: [perf-t2-2-2026-10-12](evidence/perf-t2-2-2026-10-12/).
No rebase, subagent/delegated review, push, merge, live Story, Orca/AGY call or
canonical runtime write occurred. Work stops after T2.2.
