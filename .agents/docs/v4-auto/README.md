# V4 Auto — implementation plan index

Design: `.agents/docs/v4-auto-design.md` (decisions D1–D7, phases P1–P7).
This folder splits the design into phase plans an implementer runs one at a
time. Each phase file is self-contained except for the common rules below.

## Order and gates

| Step | File | Who | Depends on |
|---|---|---|---|
| 1 | `p1-agy-executor.md` | implementer | — |
| G1 | P1 live smoke (P1 §T8) | **owner** | 1 |
| 2 | `p2-review-policy.md` | implementer | G1 |
| 2.1 | `p2-1-policy-completion.md` (owner decisions D-P2.1-a/b) | implementer | 2 |
| 3 | `p3-story-autopilot.md` | implementer | 2.1 |
| 3.1 | `p2-2-no-review-finalization.md` (D-P2.1-b end to end) | implementer | 3 |
| G3 | One Story to Human Gate with a Codex Lead and one with a Claude Lead | **owner** | 3.1 |
| 4 | `p5-story-registry.md` | implementer | G3 |
| 5 | `p6-parallel-integration.md` | implementer | 4 |
| G5 | Two independent Stories in parallel, both merged (`g5-runbook.md`, sandbox clone) | **owner** | 5 (DB decision recorded in P6 §0) |
| 6 | `p7-retire-v3-lane.md` | implementer | G5 |
| opt | `p4-stateless-driver.md` | implementer | G3; run any time after it, only if the owner asks |

The implementer never runs an owner gate (G1, G3, G5), never starts the next
phase before its gate is recorded as passed in the status table below, and
stops after each phase with a report.

## Common rules (apply to every phase)

1. **Worktree.** Work only in
   `C:/Users/ACER/orca/workspaces/New_Project_My_Note/agent-arch-orca-agy-loop`
   on branch `MinhQuang0104/agent-arch-orca-agy-loop`. Never edit, commit,
   stash, reset, clean or checkout in the canonical checkout
   `D:/Workspace/Tu_Hoc/New_Project_My_Note`. Before the first edit of every
   session check `git rev-parse --show-toplevel` and `git branch --show-current`.
2. **Lane.** This is V4 Lite migration-lane work (`AGENTS.md`). Read the
   canonical pointer
   `D:/Workspace/Tu_Hoc/New_Project_My_Note/.agent-state/active-run.json`
   read-only; continue only on `"status": "IDLE"`. Product code
   (`backend/`, `frontend/`, `tests/`, `contracts/`) is out of the lane: a phase
   that needs product changes lists them as owner/Story prerequisites instead.
3. **Start of phase.** `git rebase main` (stop on conflict). Baseline
   `npm run test:v4` and
   `D:/Tools/Python314/python.exe -m pytest -q _bmad/scripts/tests/test_agent_architecture.py`;
   record counts in the phase report.
4. **No live runtime.** Never run Orca, AGY, a real Story, or the V3 runtime.
   Tests use temp Git repos and simulated workers/Leads.
5. **No weakening.** Never delete/skip a test, relax a reason code, or lower a
   gate to get green. Default (`executor: lead`, no autopilot, no registry)
   behaviour and existing fixture/receipt digests stay byte-for-byte identical,
   proven by tests.
6. **Commits.** One Conventional Commit per task, each passing `npm run test:v4`.
   Attribute commits only to the agent and model actually doing the work (your
   own tool's attribution rule, if any); never copy another agent's
   `Co-Authored-By` line from existing history. No
   merge into main, no push.
7. **Context budget.** New instruction text goes into lazy references loaded
   only when needed; always-loaded files (`AGENTS.md`, router, runner
   `SKILL.md`, action docs) grow by at most the sentences each task allows.
   Instruction-digest fixtures are regenerated only through the repository's
   existing mechanism; if none fits, stop and report.
8. **Stop and report** on: a design contradiction, a needed change outside the
   phase's file list, a failing pre-existing test, an owner decision, or about
   three failed repairs of the same problem.
9. **Phase report:** commits, baseline vs final test counts, deviations with
   reasons, open questions. Then update this file's status table (only the row
   for the phase just finished) in the last commit.
10. **Single agent, no delegated review.** Do not spawn subagents, delegate to
    other models, or run independent / re-review passes (including the
    superpowers subagent-driven-development, requesting-code-review or similar
    workflows). Self-check with the tests only; the owner's reviewer audits
    each phase afterwards, so extra review passes only duplicate token cost.

## Prompt to give the implementer per phase

```text
Read .agents/docs/v4-auto/README.md (common rules) and
.agents/docs/v4-auto/<phase-file>. Implement that phase only, in the
architecture worktree named there. Stop at the end of the phase and report.
```

## Status

| Phase | State | Commit range | Notes |
|---|---|---|---|
| Perf T0 | complete; T1–T4 not started | T0 documentation/evidence (this commit) | Owner pins source 87469b7 for T0–T4; no rebase during optimisation. Baseline invariant 800 names (799 pass, 1 existing skip, 0 fail), preserving multiplicity/newlines/assertions. Default 16m30.206s reused; full concurrency 4 26m00.302s, same counts. Python 46 tests + 46 subtests passed. Seven-file setup/body audit and copy probes complete; instrumentation restored byte-for-byte. See [T0 report](perf-t0-report.md). Before integration: rebase, reconcile new main tests, full suite + Python on exact commit; integrated count is not fixed at 800. |
| Perf T1 | implemented; exact commit verification recorded locally after commit | One T1 Conventional Commit after 7501c70 | Pure fixture/helper extraction, no cache/split/concurrency change. Focused 11/11; pre-commit full 800 tests / 799 pass / 1 existing skip / 0 fail, exact T0 name multiset; Python 46 tests + 46 subtests. Source baseline remains 87469b7, no rebase. Exact final commit sidecars and completion binding: [T1 report](perf-t1-report.md). T2–T4 not started. |
| Perf T2.1 | implemented; exact commit verification recorded locally after commit | One T2.1 Conventional Commit after 19dffe2 | Portable pre-action seed cache for verification-flow only; six proven plain-data contracts, cloned mutable metadata and independent Git copies, fresh prepare/checkpoint per copy, uncached fallback. Nine probes pass; final focused on/off 41/41 each; full cached/fallback 800/799/1/0 with exact names/newlines/multiplicity; Python 46 tests + 46 subtests. Warm seed saves 326.802ms (60.4%); whole-file timing is variable, no stable speedup claimed. Baseline 87469b7, no rebase. Remaining T2 items/T3/T4 not started. See [T2.1 report](perf-t2-1-report.md) and its exact final sidecars. |
| Perf T2.2 | implemented; exact commit verification recorded locally after commit | One T2.2 Conventional Commit after 78fdda1 | Portable reviewed finalize-story seed only, before actions/recovery/linked worktree setup. Reuses unchanged T2.1 helper; independent Git copies, fresh root/cleanup, mutable metadata, guarded default contract and uncached fallback. Probes 8/8; focused on/off 33/33; accepted full cached/fallback 800/799/1/0 with exact names/newlines/multiplicity/skip; Python 46 tests + 46 subtests. Warm seed saves 508.930ms (65.24%); file difference 17.233s (5.43%), full pair 2.637s (0.24%), no stable causal speedup claimed. Baseline 87469b7, no rebase. Remaining T2/T3/T4 not started. See [T2.2 report](perf-t2-2-report.md) and exact final sidecars. |
| Perf T3 | implemented | One T3 Conventional Commit after 76def31 | Seven heavy test files split into 38 by moving top-level test units; three long loops partitioned by input; names, assertions and skip unchanged. Full split runs 800/799/1/0 with exact golden multiset at 596.5 s and 671.1 s against same-day baseline 796.1 s; Python 46 tests + 46 subtests. Baseline 87469b7, no rebase. T2.3–T2.7 and T4 not started. See [T3 report](perf-t3-report.md). |
| Perf T4 | implemented | One T4 Conventional Commit after fb8e6e8 | `test:v4` runs with `--test-concurrency=8` (12 hardware threads). New guard `v4-test-inventory.test.mjs` lists top-level test names without running bodies and compares them with `v4-test-names.json` (800 baseline names; the guard makes the suite 801). Full runs 801/800/1/0 with exact names: c11 677 s / 1065 s, c8 664 s / 677 s, c6 919 s, c4 710 s, all under outside load (main-checkout integration, low memory). Full suite now about 11 min. See [T4 report](perf-t4-report.md). |
| Perf T3.2 | implemented | One T3.2 Conventional Commit after 67799a8 | Owner chose this over T2.3–T2.7 (T0 data: about 10 s wall gain). Five more heavy files split into 14; four shared headers moved unchanged into `*-fixture.mjs` modules. `npm run test:v4` (concurrency 8) 801/800/1/0 with exact names and unchanged skip in 620.1 s, machine otherwise idle. T2.3–T2.7 not started. See [T3.2 report](perf-t3-2-report.md). |
| P1 | complete | 66940c2–d31e223, review fixes 6582db7.. | T1–T7 complete (Codex, GPT-6 Luna Max; commits mis-attributed to Claude). Review fixes by Claude: worker report path under `.agent-state/v4-auto/`, schema-v2 scope shape, authority prefix rule, shell-neutral contract move |
| G1 | **passed** 2026-10-08 | fixes f2aa85a, 114b3b6 | Disposable Story 99.1 (slugify, LOW) delivered by AGY (Gemini 3.8 Flash Medium, ~19 min) with Claude as Lead: run_2f8a42357c45 / task_d1224093b971 / ctx_45d60c03385c; report SHA matched DONE; scope gate PASS, no worker commits; Lead rerun 2/2; checkpoint + metadata commits; receipt.worker with real Orca IDs; Plan next verify_slice:A. Prep fixed worker context (no Lead docs); run found CHECKPOINTED exiting 5. AGY added one unrequested default export (LOW). Smoke worktree/branch removed. |
| P2 | complete; P3 stopped | 2d32817..T5 documentation (this commit) | T1–T5 complete; full test:v4 593 baseline / 673 final (592 / 672 passed, 1 existing skip, 0 failures); Python 46 tests + 46 subtests passed baseline/final. Advisory only. Deviation: unspecified policy cases fail closed with HUMAN_REQUIRED / POLICY_CASE_UNSPECIFIED. Owner questions: omitted review-table cases and finalization still requiring Story-risk review for lower-risk slices (outside P2 scope). |
| P2.1 | complete | 2ffd892..f76fa9a..T3 documentation (this commit) | T1–T3 complete; phase baseline 673 tests (672 passed, 1 existing skip); final full suite 703 tests (702 passed, 1 existing skip); Python architecture test 46 tests + 46 subtests passed at baseline and final. Deviations: none. Open questions: none. |
| P3 | complete | 914ec62..T6 documentation (this commit) | T1–T6 complete; full test:v4 703 baseline / 713 final (702 / 712 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline/final. Deviations: none. Open questions: none. Owner review (Claude) fixes in b447044: AGENTS.md one-successor rule restored for the non-autopilot case; T6 allowlist made git read-only and given `orca terminal`/slice checks; pinned by `autopilot-authority.architecture.test.mjs`. Stop reason for `complete_story` is `ACTION_NOT_AUTOPILOT_ALLOWED` (plan said `HUMAN_GATE`; behaviour correct). |
| P2.2 | complete | 104ae20..T6 documentation (this commit) | Implemented by Claude (Opus 5.5) at the owner's request. T1, T2, T3, T5, T6 committed; T4 needed no change (the e2e test reaches `done`). full test:v4 715 baseline / 731 final (714 / 730 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline and final. Deviation: T1 found the kernel never persists `review.required: false`, so rule 2 binds to the receipt escalation (`NO_REVIEW` at `LOW`) and the Plan may only add a review requirement (plan §2 amendment); no new persisted field. Reason codes: verified-but-review-due stays `SLICE_NOT_REVIEWED`, missing/inconsistent evidence is `SLICE_NOT_FINAL_READY`. Open questions: none. |
| G3 | **passed** 2026-10-09 | arch e6c19f3 | Run in parallel. 99.2 Codex Lead (GPT-6.1 Sol high), 99.3 Claude Lead (Opus): both reached Human Gate under autopilot; the owner approved and both reached `done` on disposable branches (removed afterwards). Per Story: slice A LOW lead `NO_REVIEW` → `verified` (P2.2 end to end); slice B MEDIUM AGY (99.2 run_5cf75d2eb538, 99.3 run_b6f101d78370) with scope gate PASS, Lead review `{type: lead, vendor, independent: true}` → `APPROVE_ALLOWED`. No per-slice owner questions. 99.2: 07:53→08:23; 99.3: 07:55→08:11 plus a manual finalize. Findings F-G3-1..3 in `p5-story-registry.md` §1a: repository-wide autopilot lock stopped the other Story (T0), Codex prefix rules miss PowerShell-wrapped commands, Claude auto-mode classifier blocked `finalize_story`. |
| P5 | complete | 3327b65..T5 documentation (this commit) | T0–T5 complete; full test:v4 732 baseline / 756 final (731 / 755 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline and for every task. Approved scope clarification D-P5-a recorded under T2: Lead-only fencing, lifecycle callback and owner/recovery exemptions. Other deviations: none. Open questions: none. F-G3-2 / F-G3-3 vendor configuration remains with the owner; settings unchanged. P6 not started. |
| P6 | complete | 3b9e922..T6 documentation (this commit) | T1–T6 complete; full test:v4 757 baseline / 795 final (756 / 794 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline and for every task. Accepted deviation D-P6-a: continued past the T2 rule-8 stop; owner-approved scoped registry fixture correction recorded in T2, default architecture fixture unchanged. No further deviations. Open questions: none. Shared test DB resource locks active; per-worktree DB isolation belongs to deferred BMAD Story 1-7. G5 not run; P7 not started. |
| G5 | **passed** 2026-10-11 | sandbox main 43a9481→4bd81a3→22c682a; fix 08e0bbc | Run in a disposable clone (`main` = arch HEAD, no remote) per `g5-runbook.md`. Claims 99.4 (Codex Lead) and 99.5 (Claude Lead) both APPLIED with disjoint scope, no hot paths or DB resources. Both ran in parallel under autopilot (99.4 08:19→08:39, 99.5 08:19→08:37): slice A LOW `NO_REVIEW` → `verified`; slice B MEDIUM AGY (99.4 run_c7fc4b682a6f, 99.5 run_8fd9a69512b3) → independent Lead review → `reviewed`; 8 transactions COMPLETE. Owner approved and completed both. Integration: 99.5 merged first (`4bd81a3`); a concurrent 99.4 attempt returned `INTEGRATION_BUSY` without change; 99.4 then merged on the moved main (`22c682a`, base `4bd81a3`). Each merge ran full test:v4 (797 tests, 796 pass, 1 skip) and the completion check; at final main both completion checks READY (approvals valid after merge), sprint keys `done`, registry empty. First attempt aborted on F-G5-1 (CRLF Plans under `core.autocrlf`), fixed in 08e0bbc. |
| P7 | complete | 56bf73e..1d14528..T4 documentation (this commit) | T1 inventory owner-approved; T2-T4 complete (Codex, GPT-6). Full test:v4 797 baseline / 799 final (796 / 798 passed, 1 existing skip, 0 failures); Python 46 tests + 46 subtests passed baseline and each task. Four entry files 12205 -> 11914 bytes (-291); implement_slice 59271 -> 58948 and verify_slice 59594 -> 59271 (-323 each). Owner accepted added T3 routing scope, read-only measurement API and bytes-only reporting. Full assertion replacement table and deviations in design section 8. Open question: help.md:97,101 trivial/freeform V3 guidance deferred unchanged. |
| P4 | optional | | |
