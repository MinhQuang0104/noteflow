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
| G5 | Two independent Stories in parallel, both merged | **owner** | 5 + owner DB decision (P6 §0) |
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
| P1 | complete | 66940c2–d31e223, review fixes 6582db7.. | T1–T7 complete (Codex, GPT-6 Luna Max; commits mis-attributed to Claude). Review fixes by Claude: worker report path under `.agent-state/v4-auto/`, schema-v2 scope shape, authority prefix rule, shell-neutral contract move |
| G1 | **passed** 2026-10-08 | fixes f2aa85a, 114b3b6 | Disposable Story 99.1 (slugify, LOW) delivered by AGY (Gemini 3.8 Flash Medium, ~19 min) with Claude as Lead: run_2f8a42357c45 / task_d1224093b971 / ctx_45d60c03385c; report SHA matched DONE; scope gate PASS, no worker commits; Lead rerun 2/2; checkpoint + metadata commits; receipt.worker with real Orca IDs; Plan next verify_slice:A. Prep fixed worker context (no Lead docs); run found CHECKPOINTED exiting 5. AGY added one unrequested default export (LOW). Smoke worktree/branch removed. |
| P2 | complete; P3 stopped | 2d32817..T5 documentation (this commit) | T1–T5 complete; full test:v4 593 baseline / 673 final (592 / 672 passed, 1 existing skip, 0 failures); Python 46 tests + 46 subtests passed baseline/final. Advisory only. Deviation: unspecified policy cases fail closed with HUMAN_REQUIRED / POLICY_CASE_UNSPECIFIED. Owner questions: omitted review-table cases and finalization still requiring Story-risk review for lower-risk slices (outside P2 scope). |
| P2.1 | complete | 2ffd892..f76fa9a..T3 documentation (this commit) | T1–T3 complete; phase baseline 673 tests (672 passed, 1 existing skip); final full suite 703 tests (702 passed, 1 existing skip); Python architecture test 46 tests + 46 subtests passed at baseline and final. Deviations: none. Open questions: none. |
| P3 | complete | 914ec62..T6 documentation (this commit) | T1–T6 complete; full test:v4 703 baseline / 713 final (702 / 712 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline/final. Deviations: none. Open questions: none. Owner review (Claude) fixes in b447044: AGENTS.md one-successor rule restored for the non-autopilot case; T6 allowlist made git read-only and given `orca terminal`/slice checks; pinned by `autopilot-authority.architecture.test.mjs`. Stop reason for `complete_story` is `ACTION_NOT_AUTOPILOT_ALLOWED` (plan said `HUMAN_GATE`; behaviour correct). |
| P2.2 | complete | 104ae20..T6 documentation (this commit) | Implemented by Claude (Opus 5.5) at the owner's request. T1, T2, T3, T5, T6 committed; T4 needed no change (the e2e test reaches `done`). full test:v4 715 baseline / 731 final (714 / 730 passed, 1 existing skip, 0 failures); Python architecture test 46 tests + 46 subtests passed at baseline and final. Deviation: T1 found the kernel never persists `review.required: false`, so rule 2 binds to the receipt escalation (`NO_REVIEW` at `LOW`) and the Plan may only add a review requirement (plan §2 amendment); no new persisted field. Reason codes: verified-but-review-due stays `SLICE_NOT_REVIEWED`, missing/inconsistent evidence is `SLICE_NOT_FINAL_READY`. Open questions: none. |
| G3 | not run | | owner; runbook `g3-runbook.md` (seed helper `g3-seed.mjs`) |
| P5 | not started | | |
| P6 | not started | | DB isolation decision pending (owner) |
| G5 | not run | | owner |
| P7 | not started | | |
| P4 | optional | | |
