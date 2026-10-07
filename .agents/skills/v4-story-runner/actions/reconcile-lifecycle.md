# `reconcile_lifecycle` action

Use only when the validated Plan explicitly requests
`next_action.kind: reconcile_lifecycle`. This action repairs a durable
Story/Plan/sprint projection mismatch; it is not a generic continuation and it
does not implement a slice.

Run the helper's read-only `check` with the explicit Story ID, expected HEAD,
from/to lifecycle state, and successor action. Require `READY` with
`applicable: true`. Inspect the preview and preserve its exact hashes. The
successor action must come from the authorized Story context; the helper
validates its shape but does not choose product meaning.

Run `apply` once with the previewed hashes and successor. The helper alone may
edit the Story Plan and sprint status, stage those two paths, and commit them.
It must preserve all normative Story content, receipts, product files, and the
V3 pointer. A successful invocation persists one explicit next action and
stops. It never infers Human approval, enables `review_slice`, or performs the
successor action.

If the transaction is partial, preserve the observable files, index, lock and
journal and request separately authorized recovery. Do not reset, clean, stash,
delete locks, or silently take over another transaction.

The Runner and this direct helper share one lifecycle transaction boundary:
admission checks the IDLE canonical V3 pointer, Story-owned checkout, expected
HEAD, and scope before writes; the helper then uses the common Git directory's
Story/action lock and appends the journal before changing the projections. A
foreign lock is reported as `BLOCKED` (CLI exit code `3`) and remains intact.
Apply rechecks admission immediately before the transaction and preserves the
owned journal and lock on a mid-write or commit failure. No lifecycle
entrypoint may bypass these checks or clean up another caller's lock.
