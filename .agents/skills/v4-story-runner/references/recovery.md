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

Never reset, clean, stash, checkout, delete a lock, overwrite concurrent
changes, or silently roll back. Preserve files, index, HEAD, journal, and
observable receipts. If the same underlying recovery failure recurs about three
times, reassess the architecture, environment, and Story clarity and request a
decision instead of patching around it.
