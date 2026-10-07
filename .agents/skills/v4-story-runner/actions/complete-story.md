# `complete_story` action

`complete_story` is the explicit Human Gate action. It is never authorized by
`continue`, `next`, `go on`, `proceed`, `ok`, or any generic continuation.

## Approval preview

Run:

```text
node .agents/scripts/check-story-completion.mjs check <story-id> --expected-head <sha>
```

Require `READY`, `approval_fresh: true`, and
`APPROVAL_DURABLE_PENDING_COMPLETION`. Present the exact review snapshot,
including AC evidence, disclosures, final path/tree digests, receipt digest,
implementation commit set, and review HEAD.

Accept only the structured action
`{ action: approve_exact_scope, disclosures_acknowledged: true }`. Record the
approval as a separate Plan-only durable action and stop; do not complete in the
same invocation. A missing, stale, uncommitted, partial, or disclosure-
unacknowledged approval fails closed.

## Completion transaction

On the later invocation, rerun the completion gate and verify the approval,
review HEAD, finalization receipt, scope/tree digests, Story/Plan/sprint
projections, and canonical pointer. Run `.agents/scripts/complete-story.mjs`
once. It may transition only `review → done`, preserve `execution_status:
complete`, set `next_action: null`, keep the finalization receipt and normative
Story content, and commit exactly the Story/Plan/sprint projection.

It never alters product files, slice receipts, finalization evidence, V3 state,
or another Story. Completion is idempotent after a healthy terminal projection;
it does not create a second commit.

The Runner and both direct completion entrypoints use the same lifecycle
transaction contract. Before recording approval or completing the Story, they
require an IDLE canonical V3 pointer, the Story-owned checkout, the expected
HEAD, and a clean scope. They acquire the shared common-Git-directory
Story/action lock and append the lifecycle journal before any write. A foreign
lock returns `BLOCKED` and is preserved. Mid-transaction failures preserve the
journal and owned lock for separately authorized recovery; callers must not
remove the lock, reset files, or bypass admission.
