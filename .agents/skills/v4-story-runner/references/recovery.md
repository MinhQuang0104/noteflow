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

Never reset, clean, stash, checkout, delete a lock, overwrite concurrent
changes, or silently roll back. Preserve files, index, HEAD, journal, and
observable receipts. If the same underlying recovery failure recurs about three
times, reassess the architecture, environment, and Story clarity and request a
decision instead of patching around it.
