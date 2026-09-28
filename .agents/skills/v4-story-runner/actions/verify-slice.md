# `verify_slice` action

Consume a fresh checkpoint and produce bounded verification/review evidence. Never change product code, fix a check, execute a future action, or change the Human Gate.

## Operations and projection

`verify` runs `prepareAction` → `verifySlice` with the canonical recipe, focused `CheckSpec`s, and escalation. LOW complete PASS/no flags may persist one metadata commit; MEDIUM/HIGH and every escalation stop at `REVIEW_REQUIRED`. `record-review` accepts only immutable fingerprint, ordered evidence, complete answers, and exact scope: `APPROVE` persists fresh Plan/receipt metadata, `NEED_MORE_EVIDENCE` has one bounded round, and `CHANGES_REQUIRED` never authorizes a fix.

Both operations revalidate canonical `IDLE`, checkpoint/Plan/Story/policy/recipe digests, product/index drift, exact scope, and receipt identity. Partial metadata is `RECOVERY_REQUIRED`; recovery names the checkpoint and authorization; completed work is `NOOP`.

```text
node .agents/scripts/compile-v4-context.mjs check <story-id> --action verify_slice --slice <slice-id> --expected-head <head>
```

Continue only on `READY`; preserve projected tasks/AC/risk/dependencies. Unknown scope/checks stays unknown and never becomes an empty allowlist.

## Evidence flow

```text
node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>
```

Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`; `RERUN_REQUIRED` means execute checks freshly. Pass every manifest path explicitly to `check-verification.mjs`; preserve raw `PASS`, `FAIL`, `INCOMPLETE`, or `ERROR` and forward unchanged to escalation. Aggregates retain raw results, changed paths, coverage, and status; `PASS` requires complete mapped coverage. Unknown, stale, missing authority, or behavioral failure blocks progression.

LOW complete PASS/no flags may avoid review; MEDIUM/HIGH always review. Review returns immutable pending refs, exact questions/scope/fingerprint and complete bounded coverage; reject stale, missing/duplicate/reordered, incomplete, or cross-scope evidence. Persist only current Plan freshness and one successor; do not rewrite Story, sprint, old receipts, or product code. The final slice selects `finalize_story` and stops at Human Gate.
