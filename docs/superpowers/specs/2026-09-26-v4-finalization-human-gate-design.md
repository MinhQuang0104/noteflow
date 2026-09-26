# V4 Finalization to Human Gate Design

## Goal

Enable the V4 Lite `finalize_story` action as one durable transaction that moves a reviewed schema-v2 Story from `in-progress` to `review`, records immutable completion evidence, and stops at an explicit Human Gate.

## Boundary

The change is control-plane infrastructure only. It may update V4 scripts, authority documentation, tests, and this design/plan documentation. It must not update the real Story 2.3, its Plan, sprint status, slice receipts, or product implementation files. Temp fixture repositories are the only mutation targets during tests.

## Components

1. `finalization-contract.mjs` owns stable finalization receipt hashing, receipt validation, review-state fields, and completion-block rendering. It has no Git writes.
2. `finalize-story.mjs` owns the read/preview/prepare/apply transaction. It consumes the read-only `check-story-finalization` result, verifies the expected HEAD and exact clean scope, prepares Story/Plan/sprint/receipt bytes, and stages only those exact files for one commit.
3. `v4-story-runner.mjs` owns action authorization. It permits the existing V4 action surface plus `finalize_story` to `review`; it recognizes `complete_story` as a Human-Gate-only successor and never executes it.
4. The schema-v2 validator and finalization readiness helper validate the post-finalization review state, receipt binding, lifecycle projections, and recovery classifications. Schema-v1 rules remain unchanged.

## Finalization contract

The authorized pre-state is:

```text
next_action = finalize_story:story
lifecycle_snapshot = in-progress
execution_status = in-progress
Story status = in-progress
sprint status = in-progress
check-story-finalization = READY
done_gate_disposition = READY or READY_WITH_DISCLOSURES
human approval = absent/null
```

The transaction writes exactly these logical artifacts:

- Story frontmatter status `review` and a completion-only block containing `Dev Agent Record`, `AC Evidence / Results`, `Completion Notes`, `File List`, and `Change Log`.
- An immutable `_bmad-output/implementation-artifacts/receipts/story-<id>/finalization.json` receipt with Story/upstream/slice/receipt/AC/disclosure/scope bindings, `prepared_from_head`, and `lifecycle_from/target`.
- The Plan's post-finalization fields: `lifecycle_snapshot: review`, `execution_status: complete`, `finalization` receipt and scope digests, `next_action: complete_story:story`, and `human_approval: null`.
- The matching sprint-status lifecycle entry `review`.

The normative Story markers and their digest inputs are not changed. Canonical verification status remains in the completion evidence as `INCOMPLETE` where applicable; a Story 2.3-like final disposition is `SATISFIED_WITH_DISCLOSURES`, never plain `PASS`.

## Human Gate

The successful action returns `HUMAN_GATE_REQUIRED` with Story identity, normative digest, receipt digest, scope path count and digest, implementation commit-set digest, final scoped-tree digest, AC coverage summary, canonical disclosures, `lifecycle: review`, and requested `complete_story`. Approval must explicitly identify the exact displayed scope. A generic `continue` is not an approval token. No approval record is written by this step.

## Step 110: Explicit Human-approved completion

Completion is a separate schema-v2 control-plane phase. A read-only completion gate recomputes the review snapshot and accepts only an explicit structured approval input. The canonical Plan record is `human_approval`; it contains no account identity or transcript and binds the Story normative digest, immutable finalization receipt digest, deterministic Done Gate summary digest, scope-path digest, implementation commit-set digest, final scoped-tree digest, the approved review-state HEAD, `approved_action: complete_story`, and `disclosures_acknowledged: true`.

The Runner may persist that exact approval as one bounded approval action and stop with `APPROVAL_DURABLE_PENDING_COMPLETION`. It may then execute `complete_story` only when the read-only completion gate revalidates the durable record and finds no product, scope, receipt, disclosure, or review-freshness drift. Free-form continuation text never creates an approval. The only lifecycle edge is `review -> done`, and it updates Story, sprint status, and Plan together while preserving the normative Story digest, all slice receipts, and the finalization receipt.

The canonical terminal Plan state is `lifecycle_snapshot: done`, `execution_status: complete`, `next_action: null`, and the retained `human_approval` record. Completion is idempotently classified as terminal when all three lifecycle projections and the receipt/approval bindings are consistent. Partial projections, uncommitted approval, stale approval, and receipt tamper are reported without automatic repair or deletion.

## Durability and recovery

The transaction rechecks all input hashes immediately before writes, writes temporary bytes then renames each target, stages exact paths only, verifies the staged set, and commits with `docs(story-<id>): finalize for Human Gate`. It does not reset, delete, or silently repair partial artifacts. Recovery reports `UNCOMMITTED_FINALIZATION`, `APPROVAL_PREVIEW_ONLY`, `APPROVAL_DURABLE_PENDING_COMPLETION`, `STALE_APPROVAL`, `ORPHAN_FINALIZATION_RECEIPT`, `PARTIAL_PLAN_ONLY`, `PARTIAL_SPRINT_ONLY`, `PARTIAL_STORY_ONLY`, or healthy `HUMAN_GATE_PENDING`/`TERMINAL_HEALTHY` from observable bytes, Git state, and expected hashes.

`review -> done` remains a Human-authority edge. `complete_story` is accepted by schema/router validation and is executable only after the exact approval phase above. No reconciliation helper may manufacture approval or advance `review -> done`.

## Verification

All mutation tests use temporary Git repositories. The matrix covers readiness gates, completion-record invariants, receipt binding/tamper, lifecycle projections, explicit approval and generic-continuation rejection, complete-story guards, crash recovery, terminal Plan validation, schema-v1 regression, lifecycle regression, and actual Story 2.3 read-only checks. The real Story 2.3 files must have identical hashes to the entry HEAD after the infrastructure commit.
