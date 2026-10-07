# Worker execution contract

- Task ID: <task-id>; Run ID: <run-id>; Attempt: <positive integer>
- Logical identity: <durable Task ID and bounded scope; survives terminal/session replacement>
- Worker: Antigravity (fixed); Lead generation: <generation>
- Orca: <execution mode / runtime / Run / Task / Dispatch-if-any / worker-or-terminal / worktree IDs>
- Objective: <bounded outcome>
- Source Story: <repo-relative path>@<pinned Git commit>; Ref: <optional ref>
- Relevant ACs: <IDs and precise section references; bounded excerpts only>
- Required context: <minimal paths/sections>
- Expected scope: <allowed files/modules and worktree>
- Architecture constraints: <approved decision references and invariants>
- Prohibited changes: <scope exclusions; no policy/requirement/integration changes>
- Placement: explicit Orca repo/worktree ID and parent; isolated child worktree; no merge or integration
- Verification commands: <existing exact commands and working directories>
- Escalation conditions: <ambiguity, scope conflict, missing dependency, repeated failure>
- Report protocol: `.agents/schemas/worker-report.schema.json`, schemaVersion 1;
  follow V3 policy's structured worker evidence producer/ingestion boundary.
- Report locations: <assigned verified worktree path> ->
  <canonical run directory>/workers/<task-id>/report-attempt-<N>.json
- Artifact root mapping: <worker artifact directory> -> <canonical run directory>;
  preserve manifests/logs at matching relative paths for Lead retrieval.
- Contract identity: SHA-256 of the exact dispatched contract bytes, supplied in
  dispatch evidence outside this document (no self-referential digest).
- Scope evidence: <baseCommit; observed head; existing exact diffIdentity convention;
  changed-file manifest location including untracked content/deletions>
- Correction baseline (if applicable): <previous report path/SHA-256/reviewed
  diffIdentity; stable review finding IDs; delta manifest location>
- Completion artifact: write JSON with kind completion, correction, or blocked;
  checks with PASS/FAIL/NOT_RUN/UNKNOWN, exit codes and checkedScope; compact AC
  references and unresolved issues. DONE can include failed verification.
- Correction artifact: only changed scope/files, resolved/remaining findings,
  current-attempt checks and new/changed evidence/issues. Reference prior evidence;
  never copy previous report bodies or claim old checks were rerun.
- Blocked artifact: status BLOCKED; blocker, preserved worktree/scope, last step,
  verification state, required decision/dependency and worker activity.
- Notification: exactly one structured `worker_done` using the preamble command,
  with both lifecycle IDs, explicit `--outcome`, real `--files-modified` and
  `--report-path <assigned-path>`; the body carries
  `DONE report=<assigned-path> attempt=<N> sha256=<file-digest>`. Blocked before
  completion: write the blocked report, then `escalation` with the `BLOCKED`
  reference. Do not emit a report body to the terminal.
- Coordinator channel: questions only via `orca orchestration ask`, never local
  question UI (`ask_question`); heartbeat at the preamble cadence; check
  coordinator follow-ups before each new file, after each check run, and before
  `worker_done`. Never answer or bypass a local permission, trust or sign-in prompt.
- External logs: <attempt-specific log paths>; raw terminal capture is separate
  observability/recovery evidence, never the semantic report or resultPath.

This contract is not product truth. Follow root AGENTS.md and V3 policy. Do not
copy full PRD, Architecture or Story documents. DONE reports attempted verification;
it never grants Lead ACCEPTED, Human APPROVED or integration permission. Report
failure honestly. Corrections retain Task ID/worktree/session where possible.
Do not include full terminal/test stdout, prompts, Story/architecture copies,
screen redraws, reasoning transcripts or old DONE markers in the report.
Never create replacement work because the Lead/provider/terminal changed; the Lead
must reconcile the durable Task against Orca and Git before any redispatch.
