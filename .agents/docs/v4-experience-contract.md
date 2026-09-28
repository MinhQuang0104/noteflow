# V4 derived experience contract

The experience store is a bounded, rebuildable advisory projection over
observation events and immutable receipts. It is not a second Story/Plan
source of truth and it never grants implementation, verification, review,
approval, completion, or recovery authority. Removing every experience entry
must leave lifecycle routing and authorization unchanged.

## Storage and entry shape

Derived entries are individual JSON files under
`.agent-state/v4-observations/experience/`. The extractor uses deterministic
IDs and atomic create/rename. Repeating extraction is a `NOOP`; an ID conflict
is reported rather than overwriting an entry. The store may be deleted and
rebuilt from observations.

An `ExperienceEntry` has schema version `1` and contains:

| Field | Meaning |
| --- | --- |
| `id`, `kind`, `lifecycle` | Stable identity; `verified_fact` or `semantic_hypothesis`; `active` or `candidate` (stale/deprecated entries are never selected) |
| `claim` | Bounded data text, never a command or workflow instruction |
| `scope` | Story, slice, action, risk, feature, and repo-relative paths |
| `source` / `source_refs` | Story/session/event/receipt references and file digests needed to revalidate the claim |
| `source_head`, `architecture_fingerprint` | Git and architecture identity at observation time |
| `relevant_digests` | Source/recipe/policy path digests; drift invalidates the entry |
| `evidence_status`, `validation_basis` | Why the entry can be treated as a narrow fact or only as a candidate |
| `last_validated_at`, `invalidation_triggers`, `limitations` | Freshness and explicit limits |
| `provenance` | Extractor and source event identity |

## Extraction trust boundary

`extractExperience(root, observations)` creates a `verified_fact` only from an
actual `check_finished` observation with PASS status, a subject identity,
bounded command/output evidence or a canonical verifier identity, and fresh
source references. One passing check yields only a claim about that recorded
subject; it does not generalize to “this check is always sufficient.”

`reflection_requested` may produce a `semantic_hypothesis`, but its lifecycle
remains `candidate`. A candidate needs later evaluation/adoption; extraction
never promotes it to an instruction or a policy rule. Claims containing
requests to skip review, change AC/policy, or run commands are rejected. No
learned text is passed to a process executor.

`validateExperience(root, entry)` returns `VALID`, `STALE`, or `INVALID`.
HEAD/architecture drift, missing source files, and source/recipe/policy digest
changes are stale. Malformed schema, unsafe paths, symlinks, unsafe claim text,
and missing source identity are invalid. The validator is read-only.

## Retrieval and context

`selectExperience(root, query)` binds selection to the current Story, slice,
action, risk, paths, HEAD, and optional current path digests. It returns no
more than three whole entries and no more than 6 KiB of serialized entries;
provenance is never truncated to meet the limit. No match is an empty advisory
result, not a lifecycle error. The context compiler places selected entries in
`experience_advice` after normative requirements and keeps their source refs
and limitations visible. Readers and CLI consumers remain coverage-limited;
missing experience never blocks a valid action context.

The experience module also exposes bounded JSON CLI verbs for `extract`,
`select`, and `validate`. These are inspection/derived-data operations only;
there is no apply, install, scheduler, or policy mutation verb.
