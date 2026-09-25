# V4 Story artifact contract (future schema v2)

This contract is implemented by [`check-artifact-contract.mjs`](../scripts/check-artifact-contract.mjs) and its [fixtures](../scripts/fixtures/artifact-contract). Read-only helpers accept schema-v1 Plans and separated schema-v2 Plans. Schema v1 remains supported during migration. Schema v2 is available for fixtures and a future explicit migration; no existing Story changes schema automatically. A Plan uses one schema only.

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
