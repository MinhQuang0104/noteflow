# V4 Runner payload recipes

Compact, field-tested recipes (Story 2.2, 2026-11-08) for building Runner
payload files. They are not an authority source. The action contracts, the
validated Plan and the kernel stay authoritative, and a kernel refusal always
wins over this page. Load this page only when you are about to build a Runner
payload, or when a Runner call fails on payload shape.

## Two-step operations

Every `implement_slice` and `verify_slice` write goes through two Runner calls
that carry the same JSON file:

1. `--operation prepare --input <file>` returns `READY` and a `preview`.
2. Add that `preview` object to the same file as `preview`, then run
   `--operation checkpoint` (implement) or `--operation verify` (verify).

Skipping step 1 fails with `PREVIEW_REQUIRED`. Keep payload files outside the
Story worktree (scratch directory). A dirty worktree fails the scope gates.

## Plan templates

Writes that persist Plan metadata take `plan_template`: the current Plan text
with the changed fields replaced by `{{TOKENS}}` that the kernel fills. A missing
template fails with `PLAN_TEMPLATE_REQUIRED`, and an unfilled token fails with
`PLAN_TEMPLATE_UNRESOLVED`. Keep the Plan's own line endings, and change only
the current slice block, `current_slice` and `next_action`.

- **implement checkpoint.** Set the slice `status: checkpointed` and add:
  - `baseline_commit: {{BASELINE_COMMIT}}`, `checkpoint_commit: {{CHECKPOINT_COMMIT}}`,
    `subject_digest: {{SUBJECT_DIGEST}}`, `changed_paths_sha256: {{CHANGED_PATHS_SHA256}}`;
  - `receipt_refs.implementation` with the literal path
    `_bmad-output/implementation-artifacts/receipts/story-<e>-<s>/<slice>-implementation.json`
    and `digest: {{RECEIPT_DIGEST}}`.

  Set `next_action` to `verify_slice` for the same slice. Never write
  `complete_story`, `finalize_story`, `human_approval` or `finalization`.
- **review record.** Follow `verificationTemplate` in
  `.agents/scripts/v4-verification-fixture.mjs`:
  - `current_slice: {{CURRENT_SLICE}}` and slice `status: {{TARGET_STATUS}}`;
  - `receipt_refs.verification` and `receipt_refs.review`, each with
    `{{…_RECEIPT_PATH}}` / `{{…_RECEIPT_DIGEST}}`;
  - a `verification:` block with `{{VERIFICATION_STATUS}}`,
    `canonical.status: {{CANONICAL_STATUS}}`, `escalation.decision:
    {{ESCALATION_DECISION}}`, `progression_eligible: {{PROGRESSION_ELIGIBLE}}`
    and an optional `review_disclosure` text;
  - a `review:` block with `freshness: FRESH_CANDIDATE`, `judgment:
    {{REVIEW_JUDGMENT}}`, `reviewed_commit: {{REVIEWED_COMMIT}}`,
    `risk_context_digest: {{RISK_CONTEXT_DIGEST}}` and `reviewer: {{REVIEWER}}`
    (the kernel expands the reviewer object);
  - `next_action` as `{{NEXT_ACTION_KIND}}` / `{{NEXT_ACTION_TARGET}}`.

  Dry-render the template with sample values and parse it with
  `frontmatter()` from `check-story-plan.mjs` before sending.

## implement_slice payload

```json
{ "story_id": "2.2", "slice_id": "B", "action": "implement_slice", "expected_head": "<HEAD>",
  "owned_paths": ["<exactly the dirty paths, tracked and untracked, sorted>"],
  "commands": [{ "command": "npm run type-check", "exit_code": 0, "tool": "vue-tsc", "environment": "<checkout, OS, runtime, result>" }],
  "semantic_coverage": { "decision": "COVERED", "task_refs": ["T-3"], "acceptance_criteria": ["AC-1"], "evidence_refs": ["<command strings>"] },
  "selected_tasks": ["T-3"], "selected_acceptance_criteria": ["AC-1"],
  "red_green": { "red": "<failing run before the change>", "green": "<passing run after>" },
  "plan_template": "<see above>" }
```

- `owned_paths` must equal the dirty set exactly (`IMPLEMENTATION_SCOPE_NOT_DIRTY`
  / `DIRTY_SCOPE_MISMATCH` otherwise). Nothing may be staged.
- **AGY slices** also need `worker`:
  `{ executor: "agy", orca: { run_id, task_id, dispatch_ids: ["ctx_…"] },
  attempt, contract_sha256, worker_report_sha256, lead_vendor }`. Use
  lowercase hex digests without the `sha256:` prefix. Move the contract out of
  the worktree first (`agy-executor.md` step 6).
- `check-slice-implementation.mjs --resume-path` must list **all** dirty paths in
  one call, or it returns `RESUME_SCOPE_MUST_EXACTLY_MATCH_RELEVANT_DIRTY_PATHS`.

## verify_slice payload

```json
{ "story_id": "2.2", "slice_id": "B", "action": "verify_slice", "expected_head": "<HEAD>",
  "check_specs": [{ "id": "type-check", "argv": ["cmd.exe", "/d", "/s", "/c", "npm", "--prefix", "frontend", "run", "type-check"],
    "classification": "static", "required": true,
    "source": { "kind": "focused-manifest", "path": "<Plan path>" },
    "timeout_ms": 120000, "environment_identity": { "checkout": "…", "os": "…" },
    "referenced_paths": ["<optional test files>"] }],
  "semantic_coverage": { "decision": "COVERED", "task_refs": ["T-3"], "acceptance_criteria": ["AC-1"], "evidence_refs": ["type-check"] } }
```

- `timeout_ms` may not exceed 120000. A longer check, such as the full E2E
  suite at about 3 minutes, is run by the Lead after the checkpoint and recorded
  as a review `commands` entry, never as a check spec.
- `REVIEW_REQUIRED` is an in-step outcome. MEDIUM/HIGH always stop there.

## record-review payload

Use the verify payload plus `preview`, the returned `pending`, `review` and a
review `plan_template`:

- `review.judgment`, `review.reviewer: { vendor, independent }`, and
  `review.answers` with one `{ id, answer }` for each `pending.review_questions`
  entry;
- `review.commands` (`{ command, exit_code, tool, environment }`),
  `review.findings` (`[]` when none), and `review.scope_paths` (exactly
  `pending.changed_paths`);
- `review.pending_fingerprint` (exactly `pending.fingerprint`);
- `review.change_evidence`: the `.changeEvidence` object printed by
  `prepare-change-evidence.mjs --comparison explicit-pair --base <pending.baseline_commit>
  --head <pending.checkpoint_commit> --path <each changed path>`;
- `review.scope_digest`: `digestValue({ paths, source })` from
  `v4-finalization-contract.mjs`, where `paths` are the evidence set paths in
  order and `source` is `evidenceSet.sourceDigest`.
- **More than 16 changed paths** (`SPLIT_REQUIRED`): split
  `pending.changed_paths` in order into 2–8 consecutive chunks of at most 16
  paths and more than 4 paths each (smaller chunks come back in the inline
  `paths` form), run `prepare-change-evidence.mjs` once per chunk, and send
  `change_evidence: { evidenceSets: [<each .changeEvidence.evidenceSet>] }`.
  Then `scope_digest` is `digestValue({ paths, sources })` with `paths` all
  chunk paths in order and `sources` each set's `sourceDigest`.

A Lead uses `record-review` and may not claim `reviewer.type: human`. A HIGH
slice, or a MEDIUM slice the Lead implemented, waits for the owner's
`record-owner-review`. With autopilot off, a `policy: BLOCKED` field in a
successful result is advisory only.

## Environment pitfalls (Windows)

- `npm`, `npx` and `claude` are `.cmd` shims. Call them through
  `cmd.exe /d /s /c …` in argv. `orca.exe` runs directly.
- In Git Bash, set `MSYS_NO_PATHCONV=1` before
  `docker exec -w /workspace/backend …`, or the path is rewritten.
- `scripts/local.ps1 test` takes no filter. For a focused backend run, use
  `docker exec -w /workspace/backend <worktree backend-test container> php artisan test --filter=<Name>`.
- A fresh Story worktree needs `npm ci` in `frontend/` (and `tests/e2e/` for
  E2E). The first `local.ps1 test` also builds and starts the per-worktree test
  runtime, so warm it before a 120 s check.
- A started Story keeps its pinned policy: use the scripts in its own checkout,
  even when `main` has newer ones. Integration is the point where the Story adopts
  `main`, so `integrate-story.mjs` may come from the canonical checkout.
