# V4 Lite verification context

Use deterministic tools, then risk escalation, then bounded review; planned checks and prose are not evidence.

## Verification

`check-slice-verification.mjs check <story> <slice>` is read-only scope/freshness evidence; `RERUN_REQUIRED` means checks must be freshly executed. Run `check-verification.mjs check <feature> --changed <path>` (or `auto`) with every path explicit. Preserve exit meanings: `PASS` 0, `FAIL` 1, `INCOMPLETE` 2, `ERROR` 3. No applicable recipe means `NOT_APPLICABLE` + `INCOMPLETE` + no checks; mixed scope stays `INCOMPLETE`; invalid input is `ERROR`.

Only enabled registry entries are auto-loadable; duplicate/invalid/missing mappings fail closed. Schema-v2 separates `covered_paths` and `anchor_blobs`; dependency-only change is uncovered. Aggregates retain changed paths, raw results, shared-check refs, coverage/status, and evidence. Reuse a shared check only with identical cwd/argv/environment/subject. Unavailable command is `ERROR`; defining it is not evidence. `PASS` requires complete mapped coverage and all required checks. `check-verification.mjs` is canonical; `NOT_APPLICABLE`/`INCOMPLETE` remains non-`PASS`.

## Escalation and review

`.agents/scripts/check-escalation.mjs` is authoritative: clean complete LOW `PASS` without flags may be `NO_REVIEW`; MEDIUM/HIGH, `FAIL`, `INCOMPLETE`, `ERROR`, or supported flags require `REVIEW_REQUIRED`. Never reinterpret or lower risk.

For escalated changes run `prepare-change-evidence.mjs --comparison <working-tree-vs-HEAD|explicit-pair> --path <path>` with repeated paths; explicit pairs require `--base`/`--head`. Budgets: ≤4 paths, ≤6 hunks/path, ≤240 diff lines/unit. `SPLIT_REQUIRED`, `UNSUPPORTED`, `INVALID_INPUT`, and `ERROR` need disposition. Review producer evidence and actual delta with complete mechanically validated coverage; do not reconstruct a manual patch or whole state.

Root `AGENTS.md` governs completion. Load V3 policy only for an affected V3 gate or lifecycle boundary.
