# V4 Auto P2.2 — finalize Stories whose slices verified without review

Requires P3 (through 7ea4e16) and fix b447044 on this branch. Status:
**READY**. G3 runs only after P2.2 is recorded complete in the README status
table. Design: `.agents/docs/v4-auto-design.md` §3; owner decision D-P2.1-b in
`p2-1-policy-completion.md` §1.

## 0. Phase rules

Follow `README.md` common rules (including rule 10: single agent, no delegated
review). This is a correctness fix for D-P2.1-b; it must not relax any review
that `verify` required.

## 1. Problem (found in the owner's P3 review, 2026-10-08)

D-P2.1-b says a slice that `verify` passed on the NO_REVIEW path finalizes
without a review receipt. P2.1 only relaxed the review-receipt lookup inside
the finalization helper, and its tests used a Plan state the kernel never
produces (`status: reviewed` without `receipt_refs.review`). End to end the
Story still dead-ends:

- `verify` NO_REVIEW persists the slice as `verified`, not `reviewed`
  (`persistVerification(..., 'verified')` in `v4-action-kernel.mjs`), and
  `successorFor` already treats `verified` as done and selects `finalize_story`.
- `check-story-finalization.mjs` (~line 841) requires every slice
  `status === 'reviewed'` → `SLICE_NOT_REVIEWED`.
- `v4-separated-plan.mjs` (~line 290) requires every slice `reviewed` in the
  review state → `REVIEW_SLICES_INCOMPLETE`; (~line 257) a `reviewed` slice
  without a review receipt is `REVIEW_RECEIPT_REQUIRED` (correct; keep it).
- The schema-v1 path already accepts `verified` with `!review.required`
  (`check-story-plan.mjs` ~line 328, `reconcile-story-lifecycle.mjs` ~line 130).
  Schema v2 and finalization must reach the same rule, but evidence-bound.

## 2. Target rule

A slice is **final-ready** when either:

1. `status: reviewed` with its review receipt (unchanged), or
2. `status: verified`, `review.required === false` in the Plan (strictly
   `false`, never missing), **and** `sliceReviewRequired(plan, slice,
   verificationReceipt) === false` from P2.1 (the verification receipt's
   recorded escalation decision and risk agree that no review was due).

Any disagreement between the Plan flag and the receipt evidence, a missing
verification receipt, or an unrecoverable escalation is `BLOCKED`, never
final-ready. A `MEDIUM`/`HIGH` effective slice can never be final-ready
through rule 2.

**Amended by T1 (2026-10-08).** The kernel never persists
`review.required: false`: the Plan text comes from the Lead's `plan_template`,
and no template or action contract writes a `review` block on the NO_REVIEW
path. The verification receipt does persist `escalation: {decision, risk,
reasons}` from `check-escalation.mjs`. Rule 2 therefore reads, with no new
persisted field:

2. `status: verified`, no review receipt ref, `review.required` not `true`,
   the verification receipt's `escalation.decision === 'NO_REVIEW'` **and**
   `escalation.risk === 'LOW'`, and `sliceReviewRequired(plan, slice,
   verificationReceipt) === false`.

The receipt is digest-bound to the Plan, so it is the authority; the Plan can
only add a review requirement (`review.required: true`), never waive one. This
is stricter than the original wording for Stories without slice risk, where
`sliceReviewRequired` alone never reads the receipt. Shared helper:
`noReviewFinalReady` in `v4-finalization-contract.mjs` (with
`sliceReviewRequired` moved there).

T1 observation (real `prepareAction` → `checkpointImplementation` →
`verifySlice`, MEDIUM Story, slice `risk: {level: LOW}`, executor `lead`):
result `APPLIED`, policy `PROGRESS / LOW_CANONICAL_PASS_NO_FLAGS`, successor
`finalize_story`; slice `status: verified`, no `review` block, Plan
`verification.escalation.decision: NO_REVIEW`; receipt `escalation:
{decision: NO_REVIEW, risk: LOW, reasons: []}`.

## 3. Tasks

### T1 — Confirm the persisted NO_REVIEW shape (read-only first)

Run the real kernel flow in a fixture (schema-v2 Story with `risk: MEDIUM`,
one slice `risk: {level: LOW}`, executor `lead`): `prepare` → `checkpoint` →
`verify`. Record what the Plan and verification receipt actually contain for
that slice (`status`, `review.required`, receipt `escalation.decision`,
`escalation.risk`). If the kernel does not persist `review.required: false`
and the escalation fields that `sliceReviewRequired` reads, **stop and
report**; do not add new persisted fields in this phase.

### T2 — Schema-v2 Plan validation

Files: `v4-separated-plan.mjs`, `check-story-plan.test.mjs` (or the existing
separated-plan tests).

- Review state (`lifecycle_snapshot: review`, `execution_status: complete`):
  accept slices that are final-ready by §2; keep `REVIEW_SLICES_INCOMPLETE`
  for anything else.
- Keep `REVIEW_RECEIPT_REQUIRED` for `reviewed` without a review receipt.
- Rule 2's receipt cross-check may live in a shared helper (exported from
  `check-story-finalization.mjs` or moved to `v4-finalization-contract.mjs`);
  do not duplicate `sliceReviewRequired`.

### T3 — Finalization

Files: `check-story-finalization.mjs`, `check-story-finalization.test.mjs`.

- Replace the `status !== 'reviewed'` check (~line 841) with the §2 rule
  (`SLICE_NOT_FINAL_READY:<id>` for failures, keeping `SLICE_NOT_REVIEWED`
  semantics for a slice that needed review).
- Remove the P2.1 suppression of `REVIEW_RECEIPT_REQUIRED` in
  `classifyPlanValidation` (it only excused the unreachable `reviewed`-without-
  receipt state). Rewrite the P2.1 tests that built that state to use the real
  `verified` + `review.required: false` shape.
- Receipt kinds already follow status (`receiptKindsForStatus` in
  `v4-finalization-contract.mjs`: `verified` → implementation + verification);
  confirm the finalization receipt, Done Gate summary and scope digests accept
  a `verified` slice without other changes, or stop and report.

### T4 — Completion path

Files: only if T3's confirmation shows a gap: `check-story-completion.mjs`,
`complete-story.mjs`, `finalize-story.mjs` and their tests.

- `finalize_story` → `HUMAN_GATE_REQUIRED` → structured owner approval →
  `complete_story` → `done` must work for a Story containing a final-ready
  `verified` slice. Human approval binding is unchanged.

### T5 — End-to-end regression

New test (e.g. `v4-no-review-finalization.e2e.test.mjs`), using real kernel and
Runner calls only — no hand-written Plan states after the fixture seed:

1. MEDIUM Story, one LOW slice: implement → verify (NO_REVIEW) →
   `finalize_story` → `HUMAN_GATE_REQUIRED`; approve → `complete_story` → done.
2. Same Story, the slice `risk: MEDIUM`: verify → `REVIEW_REQUIRED`; skipping
   review cannot reach finalization.
3. LOW slice whose verify was raised to `REVIEW_REQUIRED` (escalation or
   requested risk): not final-ready without review.
4. Tamper: flip the Plan's `review.required` to `false` for case 2 →
   finalization `BLOCKED` by the receipt cross-check.
5. Two-slice Story: LOW (NO_REVIEW) + MEDIUM (reviewed) finalizes.

### T6 — Docs and status

- `v4-artifact-contract.md`: one sentence for the §2 final-ready rule.
- `v4-auto-design.md` §3: note that D-P2.1-b is complete end to end in P2.2.
- README: P2.2 status row only.

## 4. Done

T1–T6 committed (one commit per task), full `npm run test:v4` and the Python
architecture test green, and no change for Stories without slice risk (their
statuses, receipts and digests identical). Do not run G3 or start P5.
