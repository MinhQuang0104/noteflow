# V4 Story artifact contract (schema v2)

This contract is implemented by [`check-artifact-contract.mjs`](../scripts/check-artifact-contract.mjs) and its [fixtures](../scripts/fixtures/artifact-contract). Read-only helpers accept schema-v1 Plans and separated schema-v2 Plans. Schema v1 remains supported during migration, while schema v2 carries the V4 Lite finalization/Human-Gate state. A Plan uses one schema only.

## Authority

| Artifact | Authority |
|---|---|
| Canonical BMAD Story Markdown | Product and planning intent: narrative, AC, Tasks/Subtasks, Task-to-AC links, readiness/dependencies, normative product/architecture/UX references and invariants; later, human-readable AC evidence, Completion Notes, File List, Change Log. |
| V4 Plan | Machine-facing execution projection: Story path and normative digest, slices, task refs and dependencies, statuses, checkpoint and changed-path identity, compact dispositions, blockers/questions, next action. |
| Evidence receipt | Detailed checkpoint-bound command, tool, environment, verification, or review evidence. It cannot define product intent. |
| Git | Actual implementation commits and diffs. |
| `sprint-status.yaml` | Lifecycle truth. |
| Superpowers | Selective implementation techniques, with no artifact authority. |

## Canonical Story syntax and validity

The Story remains Markdown. Future Stories using this contract have bounded `story_id`, `title`, and `status` frontmatter and exactly one marked block for each required category: `story`, `ac`, `tasks`, `readiness`. The marker syntax is `<!-- v4:<category>:start -->` and `<!-- v4:<category>:end -->`. `references` and `risk` blocks are optional; include them when applicable. Section headings outside the markers can follow project conventions and are not parsed. Requirement content must be inside the marked blocks. The parser does not infer requirements from unmarked prose.

The `story` block contains nonempty narrative prose. Each AC is a single line `- AC-1: text`. Each Task/Subtask is a single line `- [ ] T-1 [AC-1, AC-2]: text` or `- [x] T-1.1 [AC-1]: text`; IDs are stable and unique. Every Task references one or more existing AC IDs. The `readiness` block includes `- result: ...` and `- dependencies: ...`; other lines in that block are normative. Reference lines use `- product: path#anchor`, `- architecture: path#anchor`, or `- ux: path#anchor`. The optional `risk` block records execution-relevant risk and invariants. The helper validates form and identity; human readiness assessment and applicability of references remain BMAD decisions.

Status is outside the normative blocks. If completion-only material is present, enclose it in an optional `completion` marker pair. Dev Agent Record, AC evidence/results, Completion Notes, File List, and Change Log may be absent while ready or in progress. They do not affect readiness validation or the normative digest. Outside marked blocks, only Markdown headings and blank lines are permitted, so new requirement prose cannot silently escape the digest.

## Normative digest

`story.normative_digest` is SHA-256 over UTF-8 bytes of `JSON.stringify` of the fixed-order object produced by `normativeDigest`: `story_id`, `title`, `narrative`, `ac` (ordered ID/text pairs), `tasks` (ordered ID/AC-reference/text triples), `readiness`, `references` (ordered kind/ref pairs), and `risk`. This includes narrative, AC/Task semantics and mapping, readiness/dependencies, normative product/architecture/UX references, and execution-relevant risk/invariants.

Parsing converts CRLF to LF, removes trailing whitespace per line, and removes blank lines at the edges of marked blocks. Meaningful indentation is preserved. Task checkbox state is discarded. Status and the marked completion block are excluded. Internal wording, punctuation, case, item order, and reference strings are preserved; no LLM or semantic equivalence is attempted. Changes outside marked blocks are limited to headings and are not normative under this bounded convention.

## Task-to-slice projection

The Story owns Tasks/Subtasks; the Plan only maps them to implementation slices. A schema-v2 Plan binds `story.path` and `story.normative_digest` and has nonempty `slices`. Every slice has one or more `task_refs`, all pointing to real Task IDs. Every Story Task is covered by at least one slice. One Task may span slices and one slice may cover Tasks. `depends_on` references real slice IDs and is acyclic. Slices cannot add ACs, Tasks, or product semantics. Plan status/checkpoint/next-action fields are execution state; this helper does not yet replace the schema-v1 runtime validators.

## Receipt binding

Receipt kinds are `implementation`, `verification`, and `review`. A receipt is UTF-8 JSON with `schema_version: 1`, `story_id`, `slice_id`, `kind`, `checkpoint_commit`, `baseline_commit`, `subject_digest`, `created_from_head`, `changed_paths_sha256`, and nonempty `commands` records (`command`, integer `exit_code`, `tool`, `environment`). `created_from_head` equals the implementation checkpoint. The Plan slice supplies the expected checkpoint, baseline, subject digest, changed-path digest, and `receipt_refs.<kind>: {path, digest}`. A checkpointed slice requires its implementation receipt; verified and reviewed slices additionally require the corresponding receipts. Verification receipts may carry structured `focused_checks` for reuse. The validator checks identity and SHA-256 over compact JSON with object keys sorted recursively (array order preserved); indentation, key order, and Git line-ending conversion do not change the digest. The path must remain relative to the supplied root. Read-only Plan validation inspects receipt content for the current slice and its dependency chain; unrelated historical slices receive safe-path and existence checks. Slice helpers load relevant receipt detail when needed. Once a durable Plan references a receipt, its parsed content is immutable; a policy-authorized replacement must use a new digest/reference. Receipt detail never changes the Story digest.

## Fresh Story start (V4 Lite)

Schema v2 recognizes `next_action: {kind: start_story, target: story}`. Two optional start-only projections are required by the start gate:

```yaml
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:<current-story-digest>
  approved_at: "<date of the human planning decision, ISO 8601>"
readiness:
  status: READY
  story_normative_digest: sha256:<current-story-digest>
  dependency_sprint_keys: [<exact-prerequisite-sprint-key>]
```

The Lead records the actual planning decision and maps all Story dependencies; an empty dependency list is valid only when the Story has none. These fields project Story intent and human planning approval, not completion authority. A digest mismatch blocks start. The helper checks the upstream Epic section digest and that every declared dependency is uniquely present and done in sprint status. Metadata remains valid after start because lifecycle status does not affect the Story normative digest. Schema-v1 behavior is unchanged.

`start-story.mjs check <id> --expected-head <sha>` is read-only. `apply` additionally requires its `--fingerprint <sha256:digest>`. It accepts matching backlog/ready-for-dev Story/Plan/sprint projections with execution ready-for-dev, fresh pending slices and no execution/completion evidence; no blockers/questions; committed artifacts, complete inventory and canonical IDLE. Exact unrelated untracked files may be passed with repeated `--exclude-unrelated`; tracked changes and lifecycle artifact exclusions fail closed.

An exclusive `v4-start-story.lock` in the Git common directory serializes start transactions. It is a transaction identity, never V3 ownership/runtime state. Successful apply commits only Story, Plan and sprint, sets all lifecycle projections and execution to in-progress, and persists `implement_slice:<current>`. It may activate the parent Epic in that same sprint file. It returns `STARTED` without executing the successor. Multi-file writes are recoverable, not filesystem-atomic as a set: interrupted writes/staging/commit retain the lock and partial state and return `RECOVERY_REQUIRED`; no automatic rollback or lock deletion occurs after mutation failure. A leftover lock blocks a new start pending explicit recovery. Existing reconciliation and Human Gate contracts are unchanged.

## Finalization readiness (V4 Lite)

`.agents/scripts/check-story-finalization.mjs check <story-id> --expected-head <sha>` is a read-only pre-finalization gate. It validates the schema-v2 Story/Plan binding, reviewed slice set, receipt identities and freshness, task-to-slice coverage, canonical AC evidence, upstream Epic section, lifecycle projections, and the exact union of implementation paths from slice baseline/checkpoint diffs. It never edits the Story, Plan, sprint status, receipts, or Human Gate state, and it never enables `finalize_story` or infers approval.

The helper uses the existing top-level statuses `READY`, `RECONCILIATION_REQUIRED`, `STALE`, `BLOCKED`, `INVALID`, and `ERROR`. A `READY` result may carry `done_gate_disposition: READY_WITH_DISCLOSURES` when any canonical verification remains `INCOMPLETE` or `NOT_APPLICABLE`; those dispositions remain verbatim and are not relabeled as `PASS`.

The final implementation scope is bound by three stable SHA-256 digests: the sorted path set, the canonical slice checkpoint set, and the sorted final path-to-blob identities. Plan, Story completion metadata, sprint status, receipts, `.agents/**`, verification metadata, and explicitly known unrelated noise are excluded from product scope. A blob change after the latest legitimate Story checkpoint is stale, including a working-tree/index change on a scoped path.

`human_gate_required: true` and `human_approval_present: false` are normal for a pre-finalization `READY` result. Approval is a later explicit lifecycle authority bound to the Story normative digest, approved HEAD, implementation checkpoint set, scoped paths, and scoped tree; any binding change invalidates that approval.

## Finalization and Human Gate

The V4 Runner may execute `finalize_story` only from a validated schema-v2 Plan whose next action targets the Story, whose lifecycle and execution status are both `in-progress`, and whose finalization helper is `READY` with either `READY` or `READY_WITH_DISCLOSURES`. Finalization writes only completion metadata, an immutable `story_finalization` receipt, the Story status, the Plan lifecycle projection, and the sprint Story entry. These four paths are staged exactly and committed together.

The transaction ends at `review`: Plan execution becomes `complete`, `next_action.kind` becomes `complete_story`, and Human approval remains absent/null. The completion receipt binds the Story normative digest, upstream Epic digest, reviewed slice/receipt set, AC coverage, canonical disclosures, final implementation scope, and source HEAD. A committed review projection without approval is healthy `HUMAN_GATE_PENDING`. `complete_story` is a recognized Human-Gate successor and is executable only after a separate explicit structured approval; generic continuation cannot authorize it, and no automatic `review → done` edge is enabled.

## Explicit Human approval and terminal state

The Plan's optional `human_approval` object is the machine-readable authority. It contains `schema_version: 1`, `story_id`, `approver_type: human`, `decision: APPROVED`, `approved_at`, `story_normative_digest`, `finalization_receipt_digest`, `done_gate_summary_digest`, `scope_paths_digest`, `implementation_commit_set_digest`, `final_scope_digest`, `final_scoped_tree_digest`, `approved_review_head`, `approved_commit`, `approved_action: complete_story`, and `disclosures_acknowledged: true`. It contains no account identity or transcript. `approved_review_head` and `approved_commit` identify the exact reviewed HEAD; all receipt, Done Gate, implementation scope, and Story bindings must match the recomputed preview. Any product blob, checkpoint/scope, receipt, disclosure, review-head, or normative-digest drift makes the record stale. The only accepted approval input is the structured action `{ action: approve_exact_scope, disclosures_acknowledged: true }`; strings such as `continue`, `next`, `go on`, `proceed`, and `ok` have no authority.

The read-only `.agents/scripts/check-story-completion.mjs` helper emits `READY`, `RECONCILIATION_REQUIRED`, `STALE`, `BLOCKED`, `INVALID`, or `ERROR` and never writes or infers approval. It presents the exact Story/review snapshot, including AC coverage, canonical disclosures, Done Gate summary, path count, scope/path/tree digests, implementation commit-set digest, and approved review HEAD. Completion requires `lifecycle_snapshot: done`, `execution_status: complete`, `next_action: null`, Story and sprint lifecycle `done`, the same durable approval, and the unchanged finalization receipt. Completion writes only the Story status/completion note, Plan lifecycle/terminal action, and sprint lifecycle; it does not alter normative Story content, evidence, slice receipts, or the finalization receipt.
