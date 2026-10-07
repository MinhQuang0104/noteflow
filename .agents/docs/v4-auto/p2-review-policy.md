# V4 Auto P2 — implementation plan: risk-tiered review policy

Design: `.agents/docs/v4-auto-design.md` §3. Requires P1 merged on this branch
and owner gate G1 passed. Status: **READY AFTER G1**.

## 0. Phase rules

Follow `README.md` common rules. P2 adds a deterministic policy layer; it does
not by itself remove any human stop (that happens only under P3 autopilot).

## 1. Facts established from the code (do not re-derive)

- Lead review already exists: `record-review` in `v4-action-kernel.mjs`
  (`recordSliceReviewCore`, ~line 1575) accepts `APPROVE`,
  `NEED_MORE_EVIDENCE` (one bounded round), `CHANGES_REQUIRED` (returns
  `BLOCKED`, stop `HUMAN_REVIEW_CHANGES_REQUIRED`). The review receipt stores
  `reviewer: review.reviewer ?? 'same-lead'` as a free string (~line 1350).
- `verify` requires review when the escalation decision is `REVIEW_REQUIRED`
  or risk is not `LOW` (~line 1544). Effective risk is
  `max(requested risk, plan.risk.level)` (~line 912); a request can raise risk,
  never lower it.
- Correction after review already has a kernel path: `prepare-rework` /
  `apply-rework` with `maintenance_authorization: V4_LITE_REWORK`
  (`v4-action-kernel.mjs` "Rework is a control-plane maintenance action"),
  which reserves a new attempt and routes back to `implement_slice` for the
  same slice. Read `v4-rework.test.mjs` before changing anything near it.
- Risk is Story-level only (`plan.risk: {level, flags}`).

## 2. Target behaviour

A pure, tested policy decides what may happen after verification and review;
the kernel consults it. Outside autopilot (P3) the outcome is advisory and
today's behaviour is unchanged; under autopilot it is binding.

| Effective slice risk | Reviewer | Findings | Policy decision |
|---|---|---|---|
| LOW, canonical PASS, no flags | none | — | `PROGRESS` (unchanged NO_REVIEW path) |
| MEDIUM | `lead`, independent | none open, focused checks PASS | `APPROVE_ALLOWED` |
| MEDIUM | `lead`, not independent (same Lead implemented) | — | `HUMAN_REVIEW_REQUIRED` under autopilot |
| HIGH | any `lead` | — | `HUMAN_REVIEW_REQUIRED` under autopilot |
| HIGH | `human` | none open | `APPROVE_ALLOWED` |
| any | any | only `VALID` findings | `REWORK` while attempts < 4 (≤3 corrections), else `HUMAN_REQUIRED` |
| any | any | any `SPEC_AMBIGUITY` / `NEEDS_HUMAN_DECISION` | `HUMAN_REQUIRED` |
| any | — | checks `FAIL`/`ERROR`/incomplete coverage | `BLOCKED` (never approvable) |

Independence: `reviewer.type === 'lead'` and the slice `executor === 'agy'`.

## 3. Tasks

### T1 — Per-slice risk

Files: `check-story-plan.mjs` (+test), `v4-action-kernel.mjs` (+test),
`compile-v4-context.mjs` (+test), `v4-artifact-contract.md`.

- Optional `slices[].risk: {level, flags}`; `level` must be ≤ `plan.risk.level`
  and `flags` ⊆ plan flags → `SLICE_RISK_EXCEEDS_STORY` / `SLICE_RISK_INVALID`.
- Effective risk = `max(requested, slice.risk.level ?? plan.risk.level)`.
- Immutability: `validateMetadataProjection` (and the verification/rework
  metadata validators) reject any change to a slice's `risk` after it was
  committed (`SLICE_EXECUTION_CONTRACT_CHANGED`, the P1 reason code).
- The projection exposes `slice_risk` with its source.
- Tests: absent slice risk = old behaviour (digests unchanged); lower slice risk
  makes a LOW slice take the NO_REVIEW path; exceeding/invalid rejected;
  template change rejected.

### T2 — Structured reviewer and findings

Files: `v4-action-kernel.mjs` (+tests), `check-artifact-contract.mjs` (+tests),
`v4-artifact-contract.md`.

- `review.reviewer` accepts either the legacy string (stored unchanged) or
  `{type: 'lead'|'human', vendor: 'codex'|'claude'|null, independent: bool}`.
  The kernel computes `independent` itself from the slice executor and rejects a
  caller value that disagrees (`REVIEWER_INDEPENDENCE_MISMATCH`).
- `review.findings`: optional array of
  `{id, class: VALID|FALSE_POSITIVE|SPEC_AMBIGUITY|NEEDS_HUMAN_DECISION, summary, paths}`;
  `APPROVE` with an open `VALID`, `SPEC_AMBIGUITY` or `NEEDS_HUMAN_DECISION`
  finding → `REVIEW_FINDINGS_OPEN`.
- Review receipts written with the structured reviewer use schema 2 (already
  the kernel's review schema) plus the new keys; old receipts read unchanged.

### T3 — Policy module

New: `.agents/scripts/v4-review-policy.mjs` + `v4-review-policy.test.mjs`.

- Export `decideReviewOutcome({risk, executor, reviewer, findings, verification,
  focusedEvidence, attemptId, autopilot})` → `{decision, reasons}` exactly per
  §2's table; pure, no I/O. Table-driven tests cover every row plus boundary
  `attemptId` 3/4.
- Wire into `verify` and `record-review` results as a `policy` field. Under
  `autopilot: false` (all P2 tests) results keep today's statuses; only the
  extra `policy` field appears. Add a test proving status/receipt digests are
  unchanged when `policy` is ignored.

### T4 — Owner slice review operation

Files: `v4-story-runner.mjs` (+test), runner `SKILL.md` (≤2 sentences),
`actions/verify-slice.md` (≤2 sentences).

- New Runner operation `record-owner-review`: same payload as `record-review`
  but forces `reviewer.type: 'human'`. Like `approve_exact_scope`, its
  authority is the owner's explicit structured input; the docs state that a Lead
  must never call it on its own initiative.
- `record-review` with `reviewer.type: 'human'` → `INVALID`
  `OWNER_REVIEW_OPERATION_REQUIRED` (human reviews only through the new
  operation).

### T5 — Docs

`v4-auto-design.md` §3: mark implemented items, link the policy module.
`references/agy-executor.md`: the correction loop now starts from a
`REWORK` policy decision and uses `prepare-rework`/`apply-rework`.

## 4. Done

T1–T5 committed, full `test:v4` + Python green, default behaviour unchanged,
README status row updated. Do not start P3.
