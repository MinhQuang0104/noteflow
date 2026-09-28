# Lead entry point

Read [AGENTS.md](AGENTS.md) first, then use
[task-router.md](.agents/routing/task-router.md) to select the lane and the
smallest relevant context module. Claude occupies the same replaceable Lead
role as Codex; no separate Claude execution policy or transcript-based resume
applies.

Do not run the V3 bootstrap before lane selection. Load
[orchestration-v3.md](.agents/policies/orchestration-v3.md) only after the
router selects explicit V3.1 work or a V3 authority boundary is actually
affected. For V4 migration, read the canonical runtime pointer first and stop
on active, ambiguous, or contradicted state. For V4 Story work, load the common
Runner entry and exactly one action document; the common entry routes and
validates invariants but does not execute the action.
