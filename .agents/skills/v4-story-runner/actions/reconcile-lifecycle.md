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
