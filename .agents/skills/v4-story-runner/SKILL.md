---
name: v4-story-runner
description: Use when a human explicitly asks to implement or continue a named BMAD Story by V4 Lite; validates readiness and may run one bounded lifecycle reconciliation, slice implementation, slice verification, or finalization-to-Human-Gate action.
---

# V4 Lite Story Runner

## Entry and current authority

Use only for an explicit V4 Lite Story request routed by root `AGENTS.md`. This phase permits read-only readiness plus four bounded actions: `reconcile_lifecycle`, `implement_slice`, `verify_slice`, and `finalize_story`. `finalize_story` is authorized only from a READY in-progress Story and stops at `review`/Human Gate. One durable action per invocation is mandatory; persist one explicit successor and stop instead of executing it in the same invocation. Lifecycle reconciliation runs only through `.agents/scripts/reconcile-story-lifecycle.mjs`; that helper alone may edit the Story Plan and sprint status, stage those two files, and commit them after a successful check and all apply guards. Slice implementation uses the read-only `.agents/scripts/check-slice-implementation.mjs` gate and the two-commit durability contract below. Slice verification may update durable verification/review freshness fields in the Story Plan after the full verification flow below, but does not authorize product-code changes. Finalization runs through `.agents/scripts/finalize-story.mjs`, stages the exact Story/receipt/Plan/sprint set, and never writes approval or advances to `done`. Read the canonical `.agent-state/active-run.json` pointer first; proceed only when clearly IDLE and uncontradicted. Do not start or take over V3 runtime state.

Resolve an explicit Story ID against `docs/product/epics.md`. For “continue Story” without an ID, find unfinished persisted Plans and proceed only if exactly one matches. If zero or multiple match, request the ID. Never choose from chat history or branch name.

## Bootstrap and resume

1. Inspect Git status, branch, HEAD, Git/common directories, and worktree context without mutation. Resolve the Story ID and expected Plan path. Inventory failure is an error, never a clean-worktree result.
2. For an existing Plan, run `node .agents/scripts/check-story-plan.mjs check <epic.story>` and preserve its JSON and exit status. `READY` and `RECONCILIATION_REQUIRED` are valid read-only outcomes; `STALE`, `INVALID`, and `ERROR` stop progression.
3. Read only the referenced Story section, the Plan, and its sprint entry. Verify Git baseline/checkpoint evidence and take `next_action` from the validated Plan.
4. For `reconcile_lifecycle`, run the helper's `check` with explicit Story ID, from/to state and expected HEAD. Inspect its JSON preview and proceed only on `READY` with `applicable: true`. Obtain the explicit successor action from the authorized Story context; the helper validates its structure but does not choose its meaning. Pass the exact previewed hashes and successor to `apply`, then preserve its commit SHA and revalidate the Plan. Never infer approval for `review → done`; durable human approval is required.
5. For `implement_slice`, follow the bounded implementation contract below. A successful action ends after the Plan-only follow-up commit records `verify_slice:<slice-id>`; do not execute verification in the same invocation.
6. For `verify_slice`, first run `node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>`. Treat it only as the read-only scope/freshness manifest. Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`; `RERUN_REQUIRED` means the scope is usable but required focused checks must run. Run the required focused verification without changing product code, then run canonical `.agents/scripts/check-verification.mjs` with every manifest path passed explicitly. Forward canonical output unchanged with Story/slice risk to `.agents/scripts/check-escalation.mjs`; if review is required, use bounded change evidence and the targeted reviewer contract. Classify prior review freshness without silently reusing a review whose prerequisites are incomplete. Only after all required outputs exist may the Runner durably update the Story Plan's structured verification, review freshness, progression eligibility, and explicit successor action. Revalidate the Plan after the update. This authority does not execute the successor action in the same loop.
6. For `verify_slice`, first run `node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>`. Treat it only as the read-only scope/freshness manifest. Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`; `RERUN_REQUIRED` means the scope is usable but required focused checks must run. Run the required focused verification without changing product code, then run canonical `.agents/scripts/check-verification.mjs` with every manifest path passed explicitly. Forward canonical output unchanged with Story/slice risk to `.agents/scripts/check-escalation.mjs`; if review is required, use bounded change evidence and the targeted reviewer contract. Classify prior review freshness without silently reusing a review whose prerequisites are incomplete. Only after all required outputs exist may the Runner durably update the Story Plan's structured verification, review freshness, progression eligibility, and explicit successor action. Revalidate the Plan after the update. This authority does not execute the successor action in the same loop.
7. For `finalize_story`, require `next_action.kind: finalize_story`, `target: story`, lifecycle and execution status `in-progress`, a fresh `READY` result from `check-story-finalization.mjs`, a `READY` or `READY_WITH_DISCLOSURES` Done Gate disposition, and no Human approval. Run the bounded finalization transaction once. It creates the completion-only record and immutable finalization receipt, synchronizes Story/Plan/sprint to `review`, sets Plan execution to `complete`, sets `next_action: complete_story`, commits only the exact finalization set, and returns `HUMAN_GATE_REQUIRED`. Do not execute `complete_story`, infer approval, or advance `review` to `done`.

Resume from Plan + Git commit graph + working tree/index + sprint-status + product source, never chat history. A Story Plan records execution continuity; `docs/product/epics.md` owns Story/AC, referenced architecture/UX docs own their decisions, Git owns implementation truth, and `sprint-status.yaml` owns lifecycle truth.

If no Plan exists, inspect the Story section and only necessary references for bounded readiness, dependencies, risk, and slice boundaries. A later mutation-enabled Runner must create a lightweight Plan before product changes; this foundation reports `PLAN_MISSING` and stops. Do not duplicate AC text or load all BMAD artifacts.

## `implement_slice` preflight and execution

Run:

```text
node .agents/scripts/check-slice-implementation.mjs check <story-id> <slice-id>
  [--exclude-unrelated <exact-path>]...
  [--resume-path <exact-path>]...
  [--checkpoint-candidate <exact-commit>]
```

The helper is read-only. Exit codes are `READY=0`, `RECONCILIATION_REQUIRED=1`, `STALE=2`, `BLOCKED=3`, `INVALID=4`, and `ERROR=5`. It preserves canonical Story Plan status meaning, fails closed when Git inventory is incomplete, treats every dirty path as relevant unless the Runner supplies an exact deterministic unrelated path, and never chooses feature maps or implementation targets semantically. Exact exclusion and resume inputs are caller assertions from current observable scope, never broad ignore rules.

Proceed according to `mode`:

- `FRESH`: the Plan requests the current pending slice and no relevant partial work exists. Preserve the returned HEAD as the implementation baseline.
- `RESUME_WORKTREE`: every relevant dirty path exactly matches the repeated `--resume-path` inputs. Preserve the work; never clean, reset, stash, or overwrite it automatically.
- `CHECKPOINT_UNRECORDED`: available only with an explicit exact `--checkpoint-candidate` that resolves to HEAD, has one parent, changes a non-empty path set, and excludes the Story Plan. Commit messages are not classification input. Record the derived parent/checkpoint/path set in the Plan-only recovery step; do not re-implement.
- `PLAN_UPDATE_PENDING`: the working Plan is the only relevant mutation, its committed form still says pending/`implement_slice`, and its structured implementation metadata matches the implementation checkpoint at HEAD. Finish only the guarded Plan commit; do not re-implement.
- `COMPLETE`: the committed Plan already says checkpointed/`verify_slice` with matching implementation metadata. Do not re-implement or execute verification; report the durable successor and stop.

For `FRESH` or `RESUME_WORKTREE`, verify actual Git metadata mutation capability immediately before the first mutation when `gitMetadataWriteRequired` is true; the read-only helper deliberately performs no write probe. Then:

1. Load only the current slice's Story/AC scope, named architecture/UX anchors, direct implementation boundary, direct consumers, and focused tests. Do not use the helper to select target files semantically.
2. Load `test-driven-development` lazily and implement the current slice through red/green/refactor. Do not load unrelated skills.
3. Keep changes within the current slice. Run direct focused checks, including required negative/unhappy paths, and retain compact command/result evidence.
4. Load `verification-before-completion` immediately before any pre-checkpoint completion claim. Run fresh focused checks and inspect the exact diff.
5. Re-run the helper as the pre-checkpoint gate with every exact owned dirty path passed as `--resume-path` and any exact accepted unrelated noise passed as `--exclude-unrelated`. Require `READY`, `RESUME_WORKTREE`, complete Git inventory, and an exact relevant path set.
6. Stage only the exact implementation files/tests/contracts with `git add -- <exact-path>...`; never use `git add .` or `git add -A`. Confirm the staged set is exact, exclude the Story Plan, then create the implementation checkpoint commit.
7. Update only the Story Plan and commit it separately. Re-run both Plan validation and implementation preflight; require `READY`/`COMPLETE` with successor `verify_slice:<slice-id>`, then stop.

### HIGH-risk implementation obligations

HIGH risk strengthens focused implementation evidence; it does not create an automatic Human Gate. Where applicable, implementation must cover security/auth negative behavior, concurrency and state invariants, exact public-contract behavior, and direct unhappy paths. Later verification/review retains checkpoint freshness, canonical verification, escalation, independent-review requirements, and progression eligibility. Never reclassify canonical `INCOMPLETE` as `PASS`.

## Two-commit durability

The implementation checkpoint commit contains only exact current-slice implementation files, tests, and contracts. The Story Plan is excluded, staging is exact, and no broad Git add is allowed.

The separate Story Plan-only commit records on the target slice:

- `status: checkpointed`;
- `baseline_commit` and `checkpoint_commit`;
- `implementation.changed_paths` and its canonical SHA-256 path-list digest;
- compact `implementation.focused_checks` with command, result, and exit code;
- compact `implementation.red_green` evidence when TDD applies, or an explicit non-applicability reason;
- `next_action.kind: verify_slice` with the same slice ID as target.

The Plan commit is separate because a Plan cannot safely self-reference the implementation checkpoint SHA if it is part of that checkpoint. After the Plan commit, do not automatically run `verify_slice`.

## Crash recovery

| Observable state | Required behavior |
|---|---|
| Before mutation | Require `READY/FRESH`; use returned HEAD as the in-invocation baseline. |
| Dirty implementation in progress | Require exact authorized dirty scope and `READY/RESUME_WORKTREE`; preserve partial work. |
| Focused tests passed before commit | Treat as `RESUME_WORKTREE`; re-run fresh pre-checkpoint completion and exact-diff gates before committing. |
| Implementation commit exists before Plan update | Do not infer ownership from the latest subject. Require an explicit durable checkpoint identity through `--checkpoint-candidate`; otherwise stop because automatic `CHECKPOINT_UNRECORDED` classification lacks a safe durable signal. |
| Plan updated but not committed | Require `READY/PLAN_UPDATE_PENDING`; commit only the Plan after revalidating exact checkpoint metadata. |
| Implementation and Plan commits both durable | Require `READY/COMPLETE`; do not re-implement, and stop with the persisted verification successor. |

Never discard partial user/agent work automatically. Never reset, clean, checkout, or stash as recovery. The explicit-candidate requirement is the conservative limitation for the otherwise indistinguishable implementation-commit-before-Plan window; no commit-message heuristic may replace it.

## Other actions, not enabled here

The Plan may name `plan_slice`, `implement_slice`, `verify_slice`, `review_slice`, `resolve_blocker`, `reconcile_lifecycle`, `request_gate`, `finalize_story`, or `complete_story`. Only `reconcile_lifecycle`, `implement_slice`, `verify_slice`, and `finalize_story` can execute in this phase. `review_slice` remains disabled. `complete_story` is recognized as a Human-Gate phase but its execution remains disabled. Finalization presents a bounded exact-scope snapshot and stops at explicit Human approval; generic continuation is not approval. Automatic Human Gate completion, automatic V3 fallback, and automatic `review → done` remain disabled. A successful action may persist exactly one successor but may not execute it in the same loop. Limit repairs of the same underlying failure to about three attempts; then reassess or request a decision. HIGH risk calls for deeper focused obligations and targeted tests, not an automatic human stop.

`implement_slice` never authorizes a future slice, opportunistic refactor, unrelated cleanup, lifecycle advancement, `review_slice`, `finalize_story`, or frontend work unless the current slice itself is frontend.

When enabled, pass explicit changed paths to `.agents/scripts/check-verification.mjs`; forward its exact output with Story/slice risk to `.agents/scripts/check-escalation.mjs`. Do not turn `INCOMPLETE` into `PASS`. For `REVIEW_REQUIRED`, use `.agents/scripts/prepare-change-evidence.mjs` and `.agents/review/targeted-reviewer-contract.md`. Respect four-path groups, producer-managed oversized units, complete coverage, and no whole-file fallback.

## Lazy context and skills

Default context is the Story section, Plan, one sprint entry, Git identity, and current slice. Load architecture/UX anchors, feature maps, direct source/consumer/tests, BMAD workflows, and Superpowers skills only for a concrete action. Do not eager-load PRD, architecture, `_bmad-output`, V3 policy, or the skill library; do not scan the whole repo.

- `implement_slice`: `test-driven-development`.
- Unexpected failure: `systematic-debugging`.
- Test design difficulty: `writing-good-tests` only if installed and truly necessary.
- Pre-checkpoint completion claim: `verification-before-completion`.
- Review feedback: `receiving-code-review`.

Use skills that exist; an unavailable optional skill is not invented as a file. Record a skill only when it affects a durable decision or checkpoint.

## Stop and fallback

Stop for unresolved product ambiguity, missing architecture authority, destructive or irreversible behavior without authorization, unclear lifecycle authority, external credentials/permissions, exceeded V4 capability, repeated repair failure, incomplete Git inventory, or missing integration authority. Same-Lead semantic review is not itself a Human Gate.

V3.1 may be recommended only when safe single-Lead bounded execution cannot represent the work, such as required independent parallel workers or a large coordinated cross-domain change. Record the reason and remaining scope in the Plan when mutation is authorized. Do not invoke Orca, AGY, workers, V3 recovery, or V3 fallback automatically.
