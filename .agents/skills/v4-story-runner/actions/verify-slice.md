# `verify_slice` action

`verify_slice` consumes a fresh checkpoint and produces bounded verification
and, when required, same-Lead review evidence. It never changes product code,
fixes a failed check, executes a future action, or changes the Human Gate.

The V4 kernel exposes two explicit operations for this action:

- `verify`: `prepareAction` → `verifySlice`, which runs the canonical recipe,
  focused `CheckSpec`s and escalation. LOW + complete PASS/no flags may create
  one metadata commit containing the current Plan and a new verification
  receipt; MEDIUM/HIGH and every escalation stop at `REVIEW_REQUIRED`.
- `record-review`: `recordSliceReview`, which accepts only the immutable
  pending fingerprint, exact ordered bounded evidence, complete answers and
  exact scope. APPROVE creates the Plan plus fresh verification/review receipt
  metadata commit; `NEED_MORE_EVIDENCE` has one bounded round and
  `CHANGES_REQUIRED` never authorizes a fix.

Both operations revalidate the canonical IDLE pointer, checkpoint/policy/recipe
digests and product/index drift. A partial metadata transaction returns
`RECOVERY_REQUIRED`; recovery must name the observed checkpoint and explicit
authorization, and a completed transaction is a `NOOP` rather than a second
commit.

## Action context projection

Compile the read-only, provenance-bound context before verification:

```text
node .agents/scripts/compile-v4-context.mjs check <story-id>
  --action verify_slice --slice <slice-id> --expected-head <head>
```

Continue only on `READY`. Preserve the selected tasks/AC, Story risk, and
dependency dispositions exactly; an `UNKNOWN` scope or check set stays unknown
until explicit evidence is obtained and never becomes an empty allowlist.

## Evidence flow

Start with the read-only scope/freshness manifest:

```text
node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>
```

Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`. `RERUN_REQUIRED` is usable
only after the required focused checks are freshly executed. Pass every
manifest path explicitly to `check-verification.mjs`; keep its raw canonical
output and exit meaning. Forward that output unchanged, together with Story
risk, to `check-escalation.mjs`.

Use the structured check executor and allowlisted recipes. A multi-recipe
aggregate retains every raw result and every changed path. `PASS` requires
complete mapped coverage and all required checks passing; `FAIL`, `ERROR`, and
known coverage `INCOMPLETE` remain their canonical meanings. An unknown reason,
stale evidence, missing authority, or required behavioral failure blocks
progression. Never relabel `INCOMPLETE` as `PASS`.

LOW with complete PASS and no escalation flags may persist without review.
MEDIUM and HIGH always require the configured review path even after PASS.
When review is required, create bounded change-evidence units, preserve full
coverage, and return `REVIEW_REQUIRED` with immutable pending evidence refs,
exact questions, scope, and fingerprint. `NEED_MORE_EVIDENCE` is limited to the
allowed evidence round; `CHANGES_REQUIRED` blocks progression and does not
authorize a fix action.

## Review continuation and persistence

`record-review` must reject stale checkpoints or policy, missing/duplicate/
reordered evidence units, incomplete questions, and approvals outside the exact
scope. Revalidate product/index drift before continuation. Review freshness is
not reused merely because the commit hash matches.

Persist only the current Plan's structured verification/review freshness,
progression eligibility, and one explicit successor with the metadata receipt
set required by the artifact contract. Do not rewrite old receipts, normative
Story text, sprint state, or product code. A non-final slice selects its
successor from the validated dependency graph; ambiguity is a stop condition,
not a file-order guess. The final slice persists `finalize_story` and stops.
