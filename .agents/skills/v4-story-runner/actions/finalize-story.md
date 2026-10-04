# `finalize_story` action

Use only when the validated Plan requests `finalize_story` for the Story, both
lifecycle and execution are `in-progress`, and no Human approval exists.

Run the read-only finalization gate:

```text
node .agents/scripts/check-story-finalization.mjs check <story-id> --expected-head <sha>
```

Require `READY` with `done_gate_disposition` of `READY` or
`READY_WITH_DISCLOSURES`. It must validate Story/Plan binding, reviewed slice
set, receipt identities/freshness, task-to-slice and AC coverage, upstream Epic,
lifecycle projections, and the exact final implementation path/tree digests.
Canonical `INCOMPLETE` or `NOT_APPLICABLE` disclosures remain unchanged.

Run `.agents/scripts/finalize-story.mjs` once. It stages and commits exactly
the Story completion metadata, immutable `story_finalization` receipt, Plan
lifecycle projection, and sprint Story entry. The transaction ends at
`review`, sets Plan execution to `complete`, persists
`next_action: complete_story`, and returns `HUMAN_GATE_REQUIRED`.

Do not write approval, execute `complete_story`, infer a done transition, alter
normative Story content, rewrite slice receipts, or change product files. A
partial write/commit preserves the snapshot and must be handled through the
existing recovery contract; never clean or reset it.

Git add failure is `GIT_ADD_FAILED`, distinct from a successful add with
`STAGED_SCOPE_MISMATCH`. Git failure evidence preserves command, status, signal,
error, stdout/stderr, timeout and timeout phase. Staged paths use NUL-delimited
Git output rather than newline/quoted-path parsing.

For an existing four-file `UNCOMMITTED_FINALIZATION` candidate, do not retry this
finalizer. With explicit maintenance authorization use the separate read-only
`prepare-finalization-recovery`, then a separately authorized fingerprint-bound
`apply-finalization-recovery` described in the recovery reference. It consumes
the unchanged candidate once and stops at HUMAN_GATE_REQUIRED.
