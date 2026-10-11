### V3.2 Antigravity loop operations

Observed 2026-10-07 (Orca 1.4.222, AGY 1.3.1): supervised `worker-start` signed in
without a trust prompt but failed at prompt input three times (`terminal_handle_stale`,
then `agent_prompt_blocked` twice, including a pre-warmed `tui-idle` terminal reused
with `--terminal`). `compat-terminal` with a context-only Dispatch delivered one
structured question/reply and one `worker_done` with matching Task/Dispatch IDs,
then independently verified. A follow-up fixture trial ran the bounded loop end to
end: attempt 1 passed the scope gate, Lead review found one VALID unrequested
behaviour, and a correction attempt on the reopened Task fixed it without new scope
changes. Re-test supervised dispatch after Orca/AGY upgrades;
until a supervised smoke passes, that failure is the recorded compatibility limitation.

Delivery recipe, one attempt:

1. In the isolated worktree, start `agy` with `orca terminal create --worktree
   <explicit selector>` and wait `orca terminal wait --for tui-idle`.
2. Before writing the contract, run every verification command once in the worker
   worktree at the dispatch base and record command, directory and exit code. It
   must execute the intended checks; failing assertions are acceptable at base, a
   usage/load error (for example `node --test <dir>/` on Windows) is a contract
   defect to fix first. Create the Task from the bounded contract if absent, then
   `orca orchestration dispatch --task <id> --to <handle> --return-preamble` without
   `--inject`. Record the context-only Dispatch ID; Orca does not supervise it.
3. Write the preamble plus bounded contract to `.orca-contract/contract.md` in the
   worker worktree (outside expected scope, never committed). Its SHA-256 is the
   `contractIdentity`.
4. Send exactly one line with `orca terminal send --enter`: read and follow that
   file. Input acceptance is not delivery; confirm through the first structured
   message or one bounded screen read before any resend. Never resend blindly.
5. Loop `orca orchestration check --wait --types worker_done,escalation,question`;
   process every message, reply, then acknowledge.

Permissions: Orca launches Antigravity with `--dangerously-skip-permissions`, so AGY
permission prompts and allowlists are not a guardrail under Orca. The guardrails are
the isolated worktree, the contract's write scope and prohibited actions, and Lead
inspection of the exact diff and changed-file scope. The worker never uses local
question UI (`ask_question`); only `orca orchestration ask`. The coordinator never
answers an observed local, trust or sign-in prompt by keystroke: record the blocker
and enter NEEDS_HUMAN. Workspace trust is a human-provisioned user setting.

Liveness: a context-only Dispatch has no Orca liveness projection. The contract
requires the preamble heartbeat cadence. After three consecutive empty waits or 15
minutes without a heartbeat or message, read one bounded screen. Visible progress
means keep waiting; a local prompt, crash or exited agent means WORKER_FAILED or
NEEDS_HUMAN per the table below. Screen output is diagnosis, never completion.

| Signal | Owner | Action |
|---|---|---|
| Operational question answerable from the contract, BMAD, code or tests without changing AC/scope | Lead | Reply with the cited source |
| Product/AC ambiguity, BMAD conflict, or an answer that would change scope | Human | Reply "stop and report blocked"; classify SPEC_AMBIGUITY or NEEDS_HUMAN_DECISION; `gate-create` where a dependent Task waits |
| Technical failure (`escalation`, `worker_done --outcome failed`, failing checks) | Lead | Diagnose from report, diff and rerun checks; correction attempt on the same Task |
| Security, destructive, irreversible, credential, network-install or out-of-scope write need | Human | NEEDS_HUMAN; no correction attempt |
| Local permission, trust or sign-in prompt | Human | NEEDS_HUMAN |
| Message for a stale or non-current Dispatch | Lead | Ignore for lifecycle; duplicates follow DUPLICATE_WORKERS |

Mechanical scope gate: after every `worker_done` and before semantic review, run
`node .agents/scripts/check-worker-scope.mjs check --worktree <worker path> --base
<dispatch base commit> --allow <entry>...` with the contract's expected-scope
entries (exact files or `dir/`), plus `--contract-sha256 <contractIdentity hex>`
and `--forbid-commits` when the contract forbids commits. It compares base to the
working tree, including worker commits, staged, unstaged, deleted and untracked
paths, and reports both sides of renames. `FAIL` rejects the attempt before
review: out-of-scope edits get a correction contract that names the paths to
restore; `HISTORY_REWRITTEN`, `CONTRACT_MODIFIED`, or an out-of-scope delete enter
NEEDS_HUMAN with the worktree preserved. `INVALID`/`ERROR` are never `PASS`.
`PASS` only means no out-of-scope path was seen; gitignored paths are not
inspected, and Lead review is still required.

Bounded implement/review loop: worker attempt -> Lead review (independent diff,
scope, AC and check evidence; findings classified per root) -> correction contract
on the same Task with incremented attempt and a new context-only Dispatch. A
`worker_done` sets the Orca Task `completed`, which only records the worker's
claim, and Orca refuses to dispatch a completed Task (`task_not_startable`). After
the review decision, the Lead reopens it with `orca orchestration task-update
--status ready --result "<review finding IDs>"`, dispatches the correction
attempt, rewrites `.orca-contract/contract.md` with the new preamble (pinning the
new `contractIdentity` and keeping the prior attempt's contract as evidence), and
sends one line into the same Antigravity session. Correction contracts carry only
VALID findings; SPEC_AMBIGUITY and NEEDS_HUMAN_DECISION findings go to the human
and are named to the worker only as out of bounds. At most
three correction attempts per Task; stop earlier when the same failure repeats
without progress. Exhaustion -> NEEDS_HUMAN. A passing review ends the loop at the
existing finalization/Human Gate; the loop never approves, merges, integrates or
marks a Story done, and worker reports never substitute for Lead review.
