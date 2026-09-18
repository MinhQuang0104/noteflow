# Worker execution contract

- Task ID: <task-id>; Run ID: <run-id>; Attempt: <positive integer>
- Worker: Antigravity (fixed); Lead generation: <generation>
- Objective: <bounded outcome>
- Source Story: <repo-relative path>@<pinned Git commit>; Ref: <optional ref>
- Relevant ACs: <IDs and precise section references; bounded excerpts only>
- Required context: <minimal paths/sections>
- Expected scope: <allowed files/modules and worktree>
- Architecture constraints: <approved decision references and invariants>
- Prohibited changes: <scope exclusions; no policy/requirement/integration changes>
- Verification commands: <existing exact commands and working directories>
- Escalation conditions: <ambiguity, scope conflict, missing dependency, repeated failure>
- Completion report: <changed files, commit/diff identity, AC evidence, commands and
  exit codes, unresolved issues, preserved worktree and runtime IDs>

This contract is not product truth. Follow root AGENTS.md and V3 policy. Do not
copy full PRD, Architecture or Story documents. DONE reports attempted verification;
it never grants Lead ACCEPTED, Human APPROVED or integration permission. Report
failure honestly. Corrections retain Task ID/worktree/session where possible.
