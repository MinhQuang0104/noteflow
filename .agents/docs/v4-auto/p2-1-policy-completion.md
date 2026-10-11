# V4 Auto P2.1 — owner decisions and policy completion

Design: `.agents/docs/v4-auto-design.md` §3. Requires P2 (2d32817..8311028)
on this branch. Status: **READY**. P3 starts only after P2.1 is recorded
complete in the README status table.

## 0. Phase rules

Follow `README.md` common rules. P2.1 stays advisory exactly like P2: it
changes the `policy` value and the finalization review requirement only; it
does not change `verify`/`record-review` statuses, receipts, or human stops.

## 1. Owner decisions (2026-10-08)

The owner settled both P2 open questions. These are binding for P2.1 and P3.

### D-P2.1-a — Review cases omitted from the P2 table

Evaluation order stays as in P2: verification gate → finding classes →
findings → risk/reviewer rows. Only the final risk/reviewer step changes.

**Effective tier.** A `LOW` risk with a non-empty `flags` array is evaluated as
`MEDIUM` for every row below. All other levels are used as given.

| Effective tier | Reviewer | Decision | Reason |
|---|---|---|---|
| LOW (no flags) | none | `PROGRESS` | `LOW_CANONICAL_PASS_NO_FLAGS` (unchanged) |
| LOW (no flags) | structured `lead` or `human` | `APPROVE_ALLOWED` | `LOW_REVIEWED` |
| MEDIUM (incl. flagged LOW) | none | `BLOCKED` | `REVIEW_MISSING` |
| MEDIUM (incl. flagged LOW) | `lead`, independent | `APPROVE_ALLOWED` | `INDEPENDENT_LEAD_REVIEW` (unchanged) |
| MEDIUM (incl. flagged LOW) | `lead`, not independent | `HUMAN_REVIEW_REQUIRED` | `SAME_LEAD_REVIEW` (unchanged) |
| MEDIUM (incl. flagged LOW) | `human` | `APPROVE_ALLOWED` | `HUMAN_MEDIUM_RISK_REVIEW` |
| HIGH | none | `BLOCKED` | `REVIEW_MISSING` |
| HIGH | `lead` | `HUMAN_REVIEW_REQUIRED` | `HIGH_RISK_REQUIRES_HUMAN_REVIEW` (unchanged) |
| HIGH | `human` | `APPROVE_ALLOWED` | `HUMAN_HIGH_RISK_REVIEW` (unchanged) |
| any | legacy string reviewer | `HUMAN_REQUIRED` | `LEGACY_REVIEWER_UNCLASSIFIED` |

Stays fail-closed with `HUMAN_REQUIRED` / `POLICY_CASE_UNSPECIFIED`: unknown
risk level, unknown finding class, invalid `attemptId`, a reviewer object whose
`type` is neither `lead` nor `human`, and any other input not matched above.

Notes:

- `REVIEW_MISSING` is a pending state, cleared by recording a review; it
  is not a defect. `BLOCKED` is used because the slice must not progress, and
  the next step (a Lead review) does not need the owner.
- Legacy reviewer strings carry no `type`/`independent`, so independence cannot
  be proven; re-record the review with a structured reviewer instead.
- Independence is unchanged: `reviewer.type === 'lead'` and `executor === 'agy'`.

### D-P2.1-b — Finalization uses effective slice risk

Finalization must require a review receipt for a slice by the same effective
risk that `verify` used, not by Story risk. A slice declared `LOW` (no flags)
in a MEDIUM/HIGH Story that verified on the NO_REVIEW path finalizes without a
review receipt. The Story-level safety net is unchanged: `complete_story` still
requires fresh exact-scope owner approval.

## 2. Facts established from the code (do not re-derive)

- Policy: `.agents/scripts/v4-review-policy.mjs` `decideReviewOutcome`; the
  final fall-through returns `POLICY_CASE_UNSPECIFIED`. Kernel wiring at
  `v4-action-kernel.mjs` ~line 1664 (`decideReviewOutcome({...})`).
- Kernel effective risk: `selectRisk` (~line 1004) uses
  `slice.risk ?? plan.risk`, raised (never lowered) by `request.risk`.
  `verify` requires review when the escalation decision is `REVIEW_REQUIRED`
  or effective risk is not `LOW` (~line 1687).
- Finalization: `check-story-finalization.mjs` `sliceReviewRequired` (~line
  521) returns true for `slice.review.required === true`, a bound
  `receipt_refs.review`, or Story `plan.risk.level` MEDIUM/HIGH. The last clause
  is what D-P2.1-b changes. `reviewFreshness` (~line 501) binds review
  receipts to `stableDigest(plan.risk ?? null)`.

## 3. Tasks

### T1 — Complete the policy table

Files: `v4-review-policy.mjs`, `v4-review-policy.test.mjs`,
`v4-verification-flow.test.mjs` (only the assertion at ~line 685 if its case
is now specified).

- Implement D-P2.1-a exactly; pure, no I/O, no new inputs.
- Table-driven tests: every row above, plus flagged LOW with each reviewer
  shape, legacy string for each tier, and every remaining fail-closed case.
- Existing P2 rows keep their decisions and reasons byte-for-byte.

### T2 — Finalization by effective slice risk

Files: `check-story-finalization.mjs`, `check-story-finalization.test.mjs`
(add an architecture test only if that file already covers this area).

- `sliceReviewRequired` keeps the first two clauses. When the slice has no
  `risk`, the third clause is unchanged (Story `plan.risk.level`). When the
  slice declares `risk`, the third clause mirrors what `verify` decided:
  required when the slice level, raised to any risk recorded in the slice's
  verification receipt, is not LOW, or when that receipt records an escalation
  decision of `REVIEW_REQUIRED`. Finalization must never demand a review that
  `verify` did not (that would dead-end the Story). First read what the
  verification receipt actually stores; if the request-raised risk or the
  escalation decision cannot be recovered from persisted evidence, **stop and
  report** instead of guessing.
- Check that the risk digest the kernel writes into review receipts matches
  `reviewFreshness`'s `stableDigest(plan.risk ?? null)` for a slice with its
  own risk. Add a test that pins the current behaviour. If they disagree, stop
  and report; do not change the digest binding in this task.
- Tests: (1) LOW slice in a MEDIUM Story, NO_REVIEW verification, no review
  receipt → no `REVIEW_RECEIPT_REQUIRED`; (2) same Story, MEDIUM slice
  without review → still required; (3) absent slice risk → old behaviour and
  digests unchanged; (4) a LOW slice that bound a review receipt → still
  required and validated; (5) LOW slice whose verification receipt records
  `REVIEW_REQUIRED` or a raised risk → required.

### T3 — Docs

- `v4-auto-design.md` §3: replace the "P2 deviation and owner questions"
  paragraph with a short pointer to this file's §1 and the completed table.
- README status table: update only the P2.1 row.

## 4. Done

T1–T3 committed, full `test:v4` + Python green, default behaviour unchanged
(no slice risk, no structured reviewer → identical statuses, receipts and
digests). Do not start P3.
