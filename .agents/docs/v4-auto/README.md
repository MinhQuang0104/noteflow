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
| 3 | `p3-story-autopilot.md` | implementer | 2 |
| G3 | One Story to Human Gate with a Codex Lead and one with a Claude Lead | **owner** | 3 |
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
   End commit messages with the attribution line your environment requires. No
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

## Prompt to give the implementer per phase

```text
Read .agents/docs/v4-auto/README.md (common rules) and
.agents/docs/v4-auto/<phase-file>. Implement that phase only, in the
architecture worktree named there. Stop at the end of the phase and report.
```

## Status

| Phase | State | Commit range | Notes |
|---|---|---|---|
| P1 | not started | | |
| G1 | not run | | owner |
| P2 | not started | | |
| P3 | not started | | |
| G3 | not run | | owner |
| P5 | not started | | |
| P6 | not started | | DB isolation decision pending (owner) |
| G5 | not run | | owner |
| P7 | not started | | |
| P4 | optional | | |
