# AGY executor reference

Load only when the validated current slice declares `executor: agy`.

## Bounded delivery

1. Run the read-only implementation gate and stop unless it is `FRESH`:
   `node .agents/scripts/check-slice-implementation.mjs check <story-id> <slice-id>`.
2. Compile context and stop unless it is `READY` with known scope/checks:
   `node .agents/scripts/compile-v4-context.mjs check <story-id> --action implement_slice --slice <slice-id> --expected-head <sha>`.
3. Build the contract in the worker worktree:
   `node .agents/scripts/build-worker-contract.mjs build <story-id> <slice-id> --expected-head <sha> --attempt <n> --run-id <run-id> --task-id <task-id> --preamble-file <preamble-file> --out <worktree>/.orca-contract/contract.md`.
   Keep its `contract_sha256` and `report_path`; the report path is under gitignored `.agent-state/v4-auto/` and never enters the scope.
4. Deliver through the V3.2 Antigravity loop operations in `.agents/policies/orchestration-v3.md`: create the terminal, wait for `tui-idle`, context-only dispatch with `--return-preamble`, then send one line instructing AGY to read the contract and wait with `orca orchestration check --wait --types worker_done,escalation,question`.
5. After `worker_done`, run the mechanical gate with the contract digest:
   `node .agents/scripts/check-worker-scope.mjs check --worktree <worktree> --base <sha> --allow <entry> --contract-sha256 <contract-sha256> --forbid-commits`.
6. Require `PASS`, then move the delivery-only contract out of the worktree scope before Runner prepare, keeping it as attempt evidence (works in any shell):
   `node -e "const f=require('fs'),[s,d]=process.argv.slice(1);f.mkdirSync(require('path').dirname(d),{recursive:true});f.renameSync(s,d);f.rmdirSync(require('path').dirname(s))" <worktree>/.orca-contract/contract.md <worktree>/.agent-state/v4-auto/workers/<task-id>/contract-attempt-<n>.md`.
7. Rerun every declared verification command yourself in the worker worktree and retain fresh command, directory, and exit-code evidence.
8. Check each changed path for resume evidence:
   `node .agents/scripts/check-slice-implementation.mjs check <story-id> <slice-id> --resume-path <exact-changed-path>`.
9. Persist the existing two-commit checkpoint through the Runner using a JSON payload containing the validated `worker` object (`worker_report_sha256` is the SHA-256 of the file at `report_path`):
   `node .agents/scripts/v4-story-runner.mjs run <story-id> --expected-head <sha> --operation prepare --input <payload.json>`;
   then repeat with `--operation checkpoint`.

## Corrections and stops

On a `CHANGES_REQUIRED` review, reopen the same Orca Task with `orca orchestration task-update --status ready --result "<VALID finding IDs>"`, allow at most three attempts, and include only `VALID` findings in the correction contract. Build each replacement with `--correction-of <prior-report-path> --finding <id>` and preserve prior reports/contracts as evidence.

Stop and escalate to the owner when the scope gate is not `PASS`, the contract is modified or missing, a local permission/trust/sign-in prompt appears, scope or AC intent is ambiguous, a finding is not `VALID`, or the same failure repeats without progress. Worker `DONE` is evidence only; the Lead still owns scope, checkpoint, verification, review, and the Human Gate.
