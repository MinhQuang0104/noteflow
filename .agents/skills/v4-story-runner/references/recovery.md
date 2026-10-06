# V4 action recovery reference

Load this reference only when a directly observed transaction is partial,
locked, stale, or marked `RECOVERY_REQUIRED`. Recovery is an explicit bounded
action, not a background reconciler and not a continuation inferred from chat.

| Observable state | Required response |
| --- | --- |
| Before mutation | Require the current read-only gate and preserve its HEAD/fingerprint. |
| Dirty implementation worktree | Require exact authorized `--resume-path` values; preserve every file. |
| Focused checks passed before commit | Rerun fresh completion and exact-diff gates before checkpointing. |
| Implementation commit before Plan update | Require an explicit exact checkpoint candidate; never infer ownership from the commit subject. |
| Plan metadata uncommitted | Require `PLAN_UPDATE_PENDING`; commit only the guarded Plan/receipt metadata. |
| Both commits durable | Return `COMPLETE` and the persisted verification successor; do not reimplement or verify automatically. |
| Lock owned by another transaction | Stop and report the identity; never delete or overwrite it. |
| Legacy verification template failure before any metadata write | With explicit recovery authorization, prepare `prepare-recovery-abort` and apply `abort-unwritten-metadata` through Runner using its exact preview/checkpoint. Preserve original journal and owned lock in the recovery archive; mark the transaction ABORTED, then require fresh verification under a new transaction ID. Never rebind or fabricate the missing review. |

Unwritten-metadata retirement is restricted to `verify_slice`, the current
Story/slice, `SUCCESSOR_PROJECTION_MISMATCH`, unchanged metadata and HEAD, an
empty index, and canonical IDLE. Explicit `maintenance_paths` may name only V4
scripts, this recovery reference, and a recovery plan; their bytes are bound to
the preview. It changes no worktree file or Git commit. The owned lock is moved
to the archive after the terminal journal is written; an interrupted archive
step is resumable with the same preview. Foreign locks and partial metadata
are never retired by this operation. A retired transaction ID is terminal.

New metadata transactions validate their candidate before acquiring a lock.
Interrupted metadata writes retain their last phase and candidate file hashes;
recovery consumes matching existing files rather than rebuilding checks from a
missing outcome. Partial or changed files remain RECOVERY_REQUIRED.

## Explicit uncommitted finalization recovery

`finalization-recovery.mjs` supports an already written, uncommitted four-file
finalization candidate. This is a separate explicit bounded maintenance action,
not `finalize_story` replay, standalone review, or completion approval.

Run from the target Story repository root, using the committed maintenance
executor (do not copy or merge its runtime into the Story checkout):

```text
node <executor>/.agents/scripts/finalization-recovery.mjs prepare-finalization-recovery --input <request.json>
node <executor>/.agents/scripts/finalization-recovery.mjs apply-finalization-recovery --input <apply-request.json>
```

The prepare request has `story_id`, `expected_head`, `executor_commit`, a unique
`transaction_id`, and `maintenance_authorization: V4_LITE_FINALIZATION_RECOVERY`.
Prepare performs no writes, staging, locking, journaling or commit. It returns
`READY`, `recovery_preview` and its stable `fingerprint`, or `REJECTED` with the
observed guard failure. Preserve the returned preview unchanged. Apply requires
the same request plus those exact `recovery_preview` and `fingerprint` values,
and separate explicit Human authorization. Saving input/output is an external
ignored evidence operation; the helper never silently saves or overwrites them.

The preview binds repository/worktree/branch, HEAD, canonical IDLE pointer,
committed executor code, raw index SHA256, ordered stage-zero entries and flags,
all four raw candidate hashes and canonical Git blobs. The only candidate paths
are Story completion metadata, Plan, sprint status and `finalization.json`.
Prepare requires an empty staged diff, exactly those dirty paths, and no foreign
finalization/Story transaction lock or Git index lock. It validates receipts,
normative intent, upstream provenance, AC evidence and all original/rework
implementation attempts via the gate. Only `HUMAN_GATE_PENDING` and
`UNCOMMITTED_FINALIZATION` may remain. Projection is derived from HEAD sources;
the complete candidate must match it. LF/CRLF-only differences are accepted in
the comparison, while raw bytes and Git clean-filter blob identity stay pinned.
Actual content, scope, receipt, index, executor or canonical-state drift rejects.
Assume-unchanged/skip-worktree masked index entries are not accepted at entry;
the implementation worktree is also hashed directly against every final scoped
Git blob, including original attempts and deletions, then bound to the preview.

Apply consumes existing candidate files without rewriting/re-signing receipts
or replaying finalization. After fresh guards it acquires the common Git
`v4-finalize-story.lock`, creates the linked-worktree Git-directory journal
`noteflow-v4-finalization-recovery/<transaction_id>.json`, stages exactly four
paths, verifies canonical staged blobs and unchanged outside entries/flags, and
creates one metadata commit with transaction/fingerprint trailers. It returns
`HUMAN_GATE_REQUIRED`; no Human approval or successor is executed. Canonical
INCOMPLETE and manual NOT_RUN disclosures remain unchanged.

Phases are LOCKED, STAGING, STAGED, COMMITTING, COMMITTED and COMPLETE. Explicit
retry with the same preview may resume LOCKED with its original raw index or
STAGED/COMMITTING with the recorded exact staged index. After a commit, even if
the process stopped before journaling its SHA, retry proves the direct parent,
trailers, exact four paths/blobs and clean worktree/index before returning that
same commit. A terminal retry creates no duplicate commit. Only the owned lock
is removed after durable COMPLETE; historical journals are retained.

Rejection before mutation preserves HEAD/index/files/locks/journal. Errors after
mutation return RECOVERY_REQUIRED and retain actual phase, files/index and owned
lock; there is no rollback or automatic retry. An orphan lock, STAGING without a
durable staged-index snapshot, changed journal or unprovable commit ownership
fails closed and requires a separate diagnostic/authorization, not adoption of
an unbound index. Never delete a foreign lock or restore candidate/index state.

Never reset, clean, stash, checkout, delete a lock, overwrite concurrent
changes, or silently roll back. Preserve files, index, HEAD, journal, and
observable receipts. If the same underlying recovery failure recurs about three
times, reassess the architecture, environment, and Story clarity and request a
decision instead of patching around it.

## Explicit pre-checkpoint staged implementation recovery

When the observed implementation journal is `RECOVERY_REQUIRED`, its
`checkpoint_commit` is absent/null, and the whole exact implementation scope
is staged, do not retry ordinary checkpoint or invent a checkpoint SHA.
Only a Human-authorized `V4_LITE_STAGED_RECOVERY` may use the bounded Runner
operations `prepare-staged-recovery` / `apply-staged-recovery` described in
`.agents/docs/v4-artifact-contract.md`. This is not the metadata-only abort.

Use the committed maintenance checkout's imported Runner against the explicit
Story worktree. Bind `executor_commit` to that checkout's HEAD, and provide the
unchanged `original_preview`, baseline `expected_head`, Story/slice identity,
original exact scope/template and fresh passing `fresh_checks` command records.
First rerun the applicable focused completion/exact-diff gates without editing
product, index, authority or lock. Read-only prepare returns a separately bound
`recovery_preview`; apply requires that exact preview and the explicit Human
authorization. Never copy/cherry-pick runtime code into a blocked Story index,
alter Git config, relax original freshness/hash guards or re-sign the original
preview to make it match.

Before apply, recheck canonical IDLE and current HEAD. Runner `expectedHead`
is the current observable HEAD, while input `expected_head` remains the
original transaction baseline. The recovery kernel alone permits a partial
Plan projection when its sealed journal and exact original/generated bytes
prove a legitimate interrupted metadata write. Other Runner actions still
require the ordinary current validated Plan.

Reject any drift/foreign lock read-only. Apply preserves original journal/lock
bytes in its recovery audit, consumes the staged implementation once, commits
only implementation then Plan/new receipt, and stops at same-slice verification.
Reuse the same preview after interruption; never prepare an unrelated preview,
replay implementation or infer a checkpoint from its subject. Both commits
durable means validated `NOOP`, including an owned-lock release interruption.
Keep existing receipts and every original/rework attempt in finalization.
Recovery never approves verification, executes a successor or completes Story.
