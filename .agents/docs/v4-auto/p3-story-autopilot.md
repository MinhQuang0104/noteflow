# V4 Auto P3 — implementation plan: one Lead session drives a Story

Design: `.agents/docs/v4-auto-design.md` §1, §4. Requires P2. Status:
**READY AFTER P2**.

## 0. Phase rules

Follow `README.md` common rules. P3 changes authority text in `AGENTS.md` and
the router; keep each change to the sentences listed here.

## 1. Facts established from the code (do not re-derive)

- `AGENTS.md` "Story and provider routing": one invocation runs exactly one
  action and "may persist one successor but never execute it"; automatic
  approval, generic continuation and automatic review-to-done are disabled.
  The router line 10 repeats the successor rule.
- `runV4Story` (`v4-story-runner.mjs:200`) routes by `plan.next_action.kind`;
  `complete_story` requires fresh structured owner approval; `finalize_story`
  ends at `HUMAN_GATE_REQUIRED`.
- Human approval is a structured input (`{action: approve_exact_scope, ...}`);
  free text such as `continue`/`ok` has no authority
  (`v4-artifact-contract.md`, human_approval paragraph). Autopilot authorization
  must follow the same pattern.

## 2. Target behaviour

The owner grants a **structured, Plan-bound autopilot authorization** once per
Story. While it is valid, the same Lead session may execute successors
`implement_slice`, `verify_slice`, `record-review` (policy `APPROVE_ALLOWED`),
`prepare-rework`/`apply-rework` (policy `REWORK`) and `finalize_story`, in a loop,
asking a deterministic `autopilot-status` before each step. `complete_story` and
`record-owner-review` are never autopiloted. Any other stop returns to the owner.

## 3. Tasks

### T1 — Authorization record

Files: `v4-story-runner.mjs` (+test), `check-story-plan.mjs` (+test),
`v4-action-kernel.mjs` (+`v4-action-kernel.test.mjs`), `v4-artifact-contract.md`.

Owner decision 2026-10-08: the kernel files were missing from this list
although the last bullet below requires the kernel's metadata validators
(`validateMetadataProjection`, `validateVerificationMetadata`,
`validateReworkProjection`) to preserve `autopilot`. Their inclusion is a
correction of the list, not a scope change; edit the kernel only for that
preservation check in T1.

- Runner input `{action: 'authorize_autopilot', story_id, budgets:{max_slices,
  max_rework_per_slice, max_minutes_per_slice}, lead_vendor}` via
  `--authorize-autopilot <json>`; only this structured input creates it.
- Writes Plan `autopilot: {schema_version:1, authorized_at, authorized_plan_digest,
  authorized_head, budgets, lead_vendor, revoked:false}` in one metadata commit
  (exact-path staging, same transaction style as the human approval write).
- Defaults/limits: `max_rework_per_slice` ≤ 3; `max_slices` ≥ 1;
  `max_minutes_per_slice` 5–240. Out of range → `INVALID`.
- `--revoke-autopilot` sets `revoked: true` (owner input only).
- Kernel metadata validators keep `autopilot` unchanged across action commits
  (`AUTOPILOT_AUTHORITY_CHANGED`); finalization/completion ignore it as authority.

### T2 — `autopilot-status`

New Runner command: `node .agents/scripts/v4-story-runner.mjs autopilot-status <story-id> --expected-head <sha>`.

- Read-only. Returns `{status: CONTINUE|STOP, next_action, reasons,
  budgets_remaining}` with the Runner exit table (`CONTINUE` → 0, `STOP` → 3).
- `CONTINUE` only if: authorization present, not revoked; pointer/HEAD/Plan
  checks as `runV4Story`; `next_action.kind` in the allowed set; budgets remain.
- Budgets are derived from Plan and Git only: slices checkpointed since
  `authorized_head`, current slice `attempt_id`, and elapsed time from the
  committer timestamp of the slice's first commit after authorization to now.
  Never from session memory.
- Stop reasons include `NO_AUTHORIZATION`, `REVOKED`, `BUDGET_SLICES`,
  `BUDGET_REWORK`, `BUDGET_TIME`, `HUMAN_GATE`, `RECOVERY_REQUIRED`, `STALE`,
  and any Runner refusal.
- Tests: each reason; continue after each allowed action kind; `complete_story`
  always STOP.

**Owner decision 2026-10-08 (D-P3-a): a step is one whole action, run to its
next durable state.** `verify` returning `REVIEW_REQUIRED` keeps its `pending`
evidence in memory only, and `prepare-rework` is a read-only preview, so the
Plan stays at `verify_slice` through them; `autopilot-status` must not try to
tell these apart and must never infer or persist them.

- `autopilot-status` decides only from durable state: authorization, budgets,
  Runner/Plan/Git checks and `next_action.kind`. `next_action: verify_slice`
  is `CONTINUE` with step `verify_slice`; it carries no review or rework
  sub-state.
- One `verify_slice` step runs, in a single Lead invocation: `verify`; when it
  returns `REVIEW_REQUIRED`, the Lead review and `record-review`; when the P2
  policy decision is `REWORK`, `prepare-rework` then `apply-rework`. The step
  ends at the first durable result (`verified`/`reviewed` successor, applied
  rework routing to `implement_slice`) or at a stop.
- A step interrupted before its durable result is rerun from the start: checks
  rerun and `pending` is regenerated. This is the intended recovery; it may
  repeat checks and review but never skips them.
- `HUMAN_REVIEW_REQUIRED` and `HUMAN_REQUIRED` are in-step policy outcomes
  reported by the action (enforced in the kernel by T3), not `autopilot-status`
  reasons; the Lead stops and reports them. `BUDGET_REWORK` is still derived
  from the durable `attempt_id`.
- No kernel, schema or transaction change is part of T2.

### T3 — Policy binding under autopilot

Files: `v4-action-kernel.mjs`, `v4-review-policy.mjs` (+tests).

- When the Plan has a valid, unrevoked autopilot authorization, `record-review`
  refuses `APPROVE` unless the P2 decision is `APPROVE_ALLOWED`
  (`AUTOPILOT_POLICY_DENIED`), and `prepare-rework` requires decision `REWORK`.
- Without authorization nothing changes (test digests).

### T4 — Lead protocol reference

New `.agents/skills/v4-story-runner/references/autopilot.md` (≤ ~70 lines),
registered as lazy for every Story action with trigger "Load only when the Plan
carries an autopilot authorization."

Files: the new reference, `compile-v4-context.mjs` (`ACTIONS` lazy lists and
trigger text) and `compile-v4-context.test.mjs`, plus the tests that seed the
instruction sources (`v4-context-invariants.architecture.test.mjs`,
`v4-experience.test.mjs`, `v4-observation-hooks.test.mjs`), which P1 had to
extend the same way for `agy-executor.md`. Owner decision 2026-10-08: listed
explicitly so the registration does not stop on a file-scope conflict.

Content: the loop (`autopilot-status` → load the one action contract → run it →
repeat), with D-P3-a's step definition (a `verify_slice` step covers verify,
review/`record-review` and policy rework up to the next durable state, and an
interrupted step is rerun from the start); every action still re-reads Plan/Git/receipts and never uses chat
memory as evidence; session replacement (on compaction, context threshold,
crash or vendor switch the owner opens a fresh session, which resumes from
`autopilot-status`); stop handling (report the stop reason and the exact owner
decision needed, then end the turn); vendor notes (Claude reaches the runner by
file path; both vendors need allowlists for `orca orchestration *`,
`node .agents/scripts/*`, `git`).

### T5 — Authority text

- `AGENTS.md` Story routing paragraph: one sentence — under a valid
  owner-granted autopilot authorization, the Lead may execute successors that
  `autopilot-status` returns as `CONTINUE`, per `references/autopilot.md`;
  `complete_story`, owner review and Human Gate stay manual.
- Router line 10: append "unless `autopilot-status` returns `CONTINUE`".
- Keep all strings asserted by the Python and architecture tests; if a test
  asserts the old absolute wording, stop and report (do not edit the test
  without owner approval).

### T6 — Vendor allowlist snippets (documentation only)

In `references/autopilot.md` appendix: the exact permission entries for Claude
Code (`.claude/settings.json` `permissions.allow`) and Codex for the commands
above. The implementer **does not edit** any settings file; the owner applies
them before G3.

## 4. Owner gate G3

Owner runs one Story to the Human Gate with a Codex Lead and one with a Claude
Lead under autopilot. Exit evidence: no per-slice owner prompt except the
policy's HUMAN stops; receipts show `leadVendor`/reviewer; Human Gate reached.

## 5. Done

T1–T6 committed, full `test:v4` + Python green, README status updated. Do not
start P5 before G3.
