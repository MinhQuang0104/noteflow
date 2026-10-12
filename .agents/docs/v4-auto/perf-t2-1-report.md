# Perf T2.1 — portable pre-action verification seed cache

Status: **T2.1 IMPLEMENTED; exact final commit verification recorded locally**. Scope is
only the first T2 item. Remaining T2 items, T3 and T4 are not started. One local
Conventional Commit follows T1 `19dffe291a77f4bbeb8c97bf2ef7a140fec30f48`.
The campaign source remains `87469b76b45eddd569d6090d422a4158f12218e0`, with
the owner-authorized no-rebase exception. This report records pre-commit
verification; exact final commit verification is recorded separately after
committing, without an amend or second commit.

## Checkout and scope

Initial checkout was clean at the requested worktree and branch. Canonical
pointer was read only: IDLE, null activeRunId/storyId, SHA-256
`5febd755d0136d14d573383bd88f33e8856acbaa0b4a2d25fd592e1820811ae4`.
All 14 policy files matched canonical main `6018672`; main advancement does
not replace the pinned campaign source. T1 exact-final-check was PASS on
`19dffe2`. See [preflight](evidence/perf-t2-1-2026-10-12/preflight.json).

Risk: MEDIUM, affecting fixture state and consumer integration. Existing
consumer/unhappy-path coverage, copy isolation, variant equivalence and
adversarial key probes were executed. No production module, package script,
test name/assertion/skip, action chain, other fixture or runtime policy changed.
The consumer file remains byte-identical; its existing fixture import uses
the new implementation without a consumer edit.

## Cache boundary and contracts

`v4-verification-fixture.mjs` separates the original builder immediately before
`prepareAction`. `v4-test-seed-cache.mjs` memoizes private filesystem templates
per process and copies the entire repository, including its independent `.git`,
into a fresh mkdtemp for every consumer. The seed has one baseline commit, a
pending Plan and its original untracked implementation files. Every fixture
then runs the original prepare/checkpoint calls, asserts READY/CHECKPOINTED,
and creates two new commits and copy-local journal/observation state.

The six admitted plain-data contracts are LOW/MEDIUM/HIGH with the default
`src/feature.txt` path, HIGH with sliceRisk LOW or MEDIUM on that path, and HIGH
with the existing five-path set. Keying includes risk, sliceRisk, the full
sorted path list with multiplicity, builder source digest, both copied script
digests, cwd, GIT_* environment and PATH/HOME/USERPROFILE/XDG_CONFIG_HOME.
No callback is serialized into a key. Unknown options/combinations, accessors,
Proxy objects/arrays and non-string risk use the original builder. New variants
require their own equivalence proof before admission.

Private template metadata is deeply frozen. Each consumer receives a separate
structured clone that preserves within-fixture aliases and remains mutable.
Root and cleanup are newly bound; action, review and recovery helpers keep
using the consumer root. No function or ESM namespace is cloned as metadata.
Copies refresh the Git index, then require the original exact porcelain/NUL
status and HEAD. A dirty tracked-file probe also verifies the expected refresh
exit 1 (`needs update`) without losing dirty state.

Templates reject transaction directories, linked-worktree registration and
index locks. There is no cached checkpoint, journal, lock or recovery state,
and no rewriting of identity strings. Templates are removed by the test after
hook and a synchronous process exit hook; consumer cleanup only removes its
own copy. `V4_TEST_NO_CACHE=1` bypasses keying/templates and executes the old
per-test builder, with the same prepare/checkpoint chain.

## Verification and measurements

| Run | Result | Wall seconds |
|---|---|---:|
| Fresh T1 baseline full | 800 tests / 799 pass / 1 existing skip / 0 fail | 927.098 |
| Baseline Python | 46 tests + 46 subtests | 1.492 |
| Final key regression probe | 3/3 pass | 3.393 |
| Final cache/copy/equivalence probe | 6/6 pass | 111.109 |
| Final verification-flow, cache on | 41/41 pass | 730.502 |
| Final verification-flow, cache off | 41/41 pass | 489.944 |
| Full cache on, pre-commit | 800 / 799 / 1 / 0 | 804.852 |
| Full fallback, pre-commit | 800 / 799 / 1 / 0 | 828.025 |
| Pre-commit Python | 46 tests + 46 subtests | 0.637 |

All full results require zero cancelled/todo and the original Windows symlink
skip. Golden comparisons preserve all 800 occurrences, multiplicity and seven
embedded-newline names, without trimming, normalization or deduplication.
Golden bytes remain SHA-256
`c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393`.
The extra probes live outside the `*.test.mjs` glob.

The final seed-only benchmark interleaves ten warm-cache and ten uncached
LOW/default samples. Mean construction is **214.268ms cached vs 541.069ms
uncached**, saving **326.802ms (60.4%) per warm seed**. The cold template plus
first copy costs **908.054ms**; cleanup is recorded separately. This measures
only the pre-action constructor. T0's 240.492s total verification fixture time
includes checkpoint execution and is not a cache-savings estimate.

The pre-commit full samples differ by 23.174s (2.8%), but uncontrolled background
load and one fallback sample prevent a causal full-suite speedup claim. The
final isolated pair is 730.502s cached versus 489.944s uncached: this pair does
not demonstrate a file-level saving. Earlier and final isolated file timings
vary substantially; the cause of the variation was not isolated. Other Node
processes were observed and not stopped; see the observation snapshots. The
under-eight-minute full-suite target has not been demonstrated by T2.1.

## Findings and diff check

The initial RED probe failed because the seed API was absent. A first green
attempt compared fresh root/time-bound observation files byte-for-byte; that
was a FALSE_POSITIVE in the probe. The corrected probe compares durable bytes
and independently requires distinct observation identities and copy-local
COMPLETE journals. It proves raw seed reuse never carries later action state.

VALID new-cache findings: reflection on Proxy options/arrays and JSON keying
of risk objects could perform extra reads or alias an unproven contract. Three
RED regressions reproduced those failures; the smallest fix routes them to the
old builder before reflection/iteration/JSON. All three pass. No behavior of
the existing tests or production actions was changed; no unresolved issue or
owner decision remains.

The first focused pair is diagnostic only: key hardening changed fixture
source while its fallback run was active, and its metadata correctly records
`source_unchanged_during_run: false`. It is excluded from accepted final timing
and verification. The two full runs were started after the guard fix and have
unchanged source hashes. Final probes and focused runs follow those full runs.

[Diff self-check](evidence/perf-t2-1-2026-10-12/diff-self-check.json) binds all
48 test files to the fresh baseline's raw working-tree hashes. It also verifies
the extracted seed body, original prepare/checkpoint/consumer construction and
remaining fixture helpers. Git blob LF versus checkout CRLF is accounted for
explicitly; the audit does not normalize test bytes. The exact staged diff is
inspected before the single commit. Evidence attributes preserve raw JSON,
log and patch bytes; whitespace checking permits CR at EOL for retained CRLF
JSON and excludes only raw logs/patches, without changing the archive bytes.

## Exact final commit evidence

Run the third full suite with cache on, then Python, on the final commit. Local
ignored sidecars retain commands, HEAD, timings, exits, before/after source
hashes and another lossless golden comparison:
[full](evidence/perf-t2-1-2026-10-12/exact-final-full.json),
[Python](evidence/perf-t2-1-2026-10-12/exact-final-python.json),
[name check](evidence/perf-t2-1-2026-10-12/exact-final-full-name-check.json),
[binding check](evidence/perf-t2-1-2026-10-12/exact-final-check.json).
Completion requires the binding check to pass for exact HEAD, clean Git state,
one commit after T1, all three sequential full runs (including fallback), Python,
unchanged current source, canonical pointer and golden bytes. Post-commit
evidence stays outside the commit so its SHA does not change.

Evidence directory: [perf-t2-1-2026-10-12](evidence/perf-t2-1-2026-10-12/).
No rebase, subagent, delegated review, push, merge, live Story, Orca/AGY invocation
or canonical runtime write occurred. Work stops at T2.1.
