# Perf T1 — extract fixtures into modules

Status: **T1 IMPLEMENTED; T2–T4 NOT STARTED**. One local Conventional Commit
on `perf/v4-test-suite`, following T0 `7501c70`. The campaign source remains
`87469b76b45eddd569d6090d422a4158f12218e0`; no rebase onto advancing main.
This report records pre-commit verification. Exact final commit verification
is recorded after committing, in the local sidecars described below; T1 is
complete only when those sidecars pass.

## Preflight and scope

Canonical pointer was read only: IDLE, null activeRunId/storyId. SHA-256
`5febd755d0136d14d573383bd88f33e8856acbaa0b4a2d25fd592e1820811ae4`.
The isolated worktree was clean at HEAD `7501c707d36f4e5114fe032f0dcafaf2e711b463`
and matched the requested path/branch. Main was `49e30d5`; all 14 policy files
(AGENTS, router and runner tree) matched canonical main. Scripts/package had
no diff from pinned source `87469b7`. See [preflight](evidence/perf-t1-2026-10-11/preflight.json).

Risk: MEDIUM, because helper module consumers and copied executor source trees
change. Focused consumer/unhappy-path checks cover scope failures, interrupted
transactions, executor mutation, and the multi-slice action chain.

## Pure refactor

| Test file | Extracted helper |
|---|---|
| `v4-verification-flow.test.mjs` | `v4-verification-fixture.mjs` |
| `finalize-story.test.mjs` | `finalize-story-fixture.mjs` |
| `v4-action-kernel.test.mjs` | `v4-kernel-fixture.mjs` |
| `v4-slice-transaction.test.mjs` | `v4-transaction-fixture.mjs` |
| `v4-no-review-finalization.e2e.test.mjs` | `v4-no-review-finalization-fixture.mjs` |
| `check-story-completion.test.mjs` | `check-story-completion-fixture.mjs` (supplements existing `completion-fixture.mjs`) |

`integrate-story` already uses `integration-test-fixture.mjs`; that helper,
its test/loading/action wrappers, `completion-fixture.mjs`, and
`v4-architecture-fixture.mjs` are unchanged. No test file was split.

The five identical root-argument Git/write helpers now use
`v4-test-helpers.mjs`. Git keeps spawnSync, every argument, cwd, utf8,
windowsHide, the strict status assertion with stderr diagnostics, and trimmed
stdout. Write keeps recursive parent mkdir and writeFileSync without an
encoding option, preserving string/Buffer inputs. SHA-256 helpers retain the
same update(value, 'utf8'), hex encoding and prefix. Completion's repeated-letter
fake digest and existing helpers with different guards/errors remain separate.

Builders retain options, byte strings, mutable fixture state, action calls,
cleanup and dynamic imports. Helpers stay in `.agents/scripts`, preserving
script-directory resolution through import.meta.url. Finalize's module-level
executor construction, dynamic import, after hook, and drift test remain
verbatim in the test file: its mutating executor is not shared across files.
There is no cache, freezing, cloning, concurrency change, product change,
assertion change, renamed test, new skip or live Story execution.

## Verification

| Run | Result | Wall time |
|---|---|---|
| Fresh baseline full `npm run test:v4 -- --test-reporter=spec` | 800 tests / 799 pass / 1 existing skip / 0 fail | 879.787s |
| Baseline Python architecture | 46 tests + 46 subtests passed | 2.546s |
| Focused consumer/unhappy-path checks | 11 tests / 11 pass / 0 skip / 0 fail | 79.572s |
| Refactored full suite before commit | 800 tests / 799 pass / 1 existing skip / 0 fail | 897.429s |
| Refactored Python architecture before commit | 46 tests + 46 subtests passed | 0.686s |

Baseline and pre-commit full names match the lossless T0 golden multiset:
800 occurrences, preserving multiplicity and all seven names containing
embedded newlines. No trimming, normalization, deduplication or line-based
name serialization. Golden bytes remain SHA-256
`c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393`.
Reporter counts also require zero cancelled/todo. The sole skip remains the
Windows symlink test. Focused selection does not change full-suite registration.

[Extraction manifest](evidence/perf-t1-2026-10-11/extraction-manifest.json) and
[diff self-check](evidence/perf-t1-2026-10-11/diff-self-check.json) bind original
bytes to T0 and independently compare every remaining test byte after removing
only imports and relocated declarations. Moved declarations are byte-identical
apart from export placement; shared helpers are equivalent forms of the original
bodies. The finalize executor setup/import/cleanup is independently checked
verbatim. Syntax and scoped whitespace checks pass. No unresolved issue or
behavior decision remains.

## Exact final commit evidence

After the single T1 commit, run the full suite again and then Python. The
sidecars [exact-final-full.json](evidence/perf-t1-2026-10-11/exact-final-full.json)
and [exact-final-python.json](evidence/perf-t1-2026-10-11/exact-final-python.json)
record that exact HEAD, commands, timings, exit codes and source hashes before
and after each run. The [final name check](evidence/perf-t1-2026-10-11/exact-final-full-name-check.json)
compares against T0 again; [final binding check](evidence/perf-t1-2026-10-11/exact-final-check.json)
confirms both run HEADs, counts, source hashes, clean Git state, unchanged
canonical pointer and golden hash.

These `exact-final-*` artifacts are intentionally local/ignored. Capturing
post-commit evidence in the same commit would change its SHA; no amend or
second T1 commit is made. Baseline/pre-commit logs, metadata, name checks,
relocation audit and tools are committed. `.gitattributes` preserves raw
log/patch/newline bytes. The full run wrapper initially hit a Windows console
encoding error while printing the baseline log tail after saving successful
npm metadata/log; npm itself exited 0. Later runs use UTF-8 console output.

All full Node runs are sequential. Single timing samples with uncontrolled
background load do not establish a speedup. T1 changes organization only.
No subagent, push, merge, rebase, Orca/AGY invocation, live Story, canonical
runtime mutation, or T2/T3 work occurred.

Evidence directory: [perf-t1-2026-10-11](evidence/perf-t1-2026-10-11/).
