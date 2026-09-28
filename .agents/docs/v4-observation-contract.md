# V4 observation contract

This contract defines the durable, derived-only observation ledger used by the
V4 Lite control plane. It records what was actually observed by a Lead or host;
it never grants lifecycle, approval, implementation, review, or recovery
authority. The V3 runtime pointer, leases, worker state, Story/Plan truth, and
receipts remain separate.

## Storage and idempotency

Observation events are individual UTF-8 JSON files under the repository's
`.agent-state/v4-observations/events/` directory. The writer creates the event
file with an exclusive create, writes and flushes one complete envelope, and
never performs read-modify-write on a shared JSON array. Event IDs are safe file
names. The same ID and stable payload returns `NOOP`; the same ID with a
different payload returns `CONFLICT`; neither case overwrites an existing
event. A storage failure returns an `ERROR` with `coverage: UNKNOWN` and a
warning; it cannot change `active-run.json` or relax any gate.

Runtime observations are disposable derived data. They may be lost or
reconstructed without changing product truth, Story lifecycle, or Human Gate.

## EventEnvelope v1

Every envelope contains:

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `event_id`, `observed_at` | Stable event identity and ISO timestamp |
| `source_kind`, `source_id` | Host/export/Lead source identity; no path traversal |
| `story_id`, `slice_id`, `action`, `invocation_id`, `session_id` | Nullable correlation fields; never inferred from a branch name |
| `repository_id`, `worktree_id` | Hashes of the Git common directory and resolved worktree root |
| `source_head` | Observed Git HEAD, not an ownership claim |
| `architecture_fingerprint` | Digest of the architecture inputs known to the observer |
| `event_type` | One of the allowlisted action/check/context/usage/session/Story/reflection events |
| `coverage` | `MEASURED`, `PARTIAL`, or `UNKNOWN` |
| `payload` | Sanitized structured data only |
| `provenance` | Structured source and limitation metadata |

The writer rejects malformed identity, event type, coverage, repository or
worktree bindings, oversized envelopes over 64 KiB, path traversal, and
secret-bearing keys. It does not store secrets, credentials, raw prompts or
responses, chain-of-thought, full transcripts, or product text.

## UsageRecord v1

`usage_imported` payloads contain normalized token usage with provider, model,
effort, units, measurement kind (`provider`, `operator`, or `estimate`), export
and request identity, optional parent identity, input/output/reasoning counts,
inclusion semantics, and context byte counters. Missing values are `null` with
an `unknown_reasons` entry; they are never converted to zero. `output_tokens`
already containing reasoning is not augmented with `reasoning_tokens` again.

Aggregation prefers a parent export/request when both parent and child records
are present, and deduplicates the same usage identity. It reports measured,
operator, and estimated record counts separately. Provider usage is not inferred
from instruction bytes.

## API and CLI

The module exports:

- `createObservation(root, input)` — adds repository/worktree identity for a
  caller-selected event; it does not write.
- `normalizeUsage(input)` — validates and normalizes a usage record.
- `recordObservation(root, event)` — returns `RECORDED`, `NOOP`, `CONFLICT`, or
  `ERROR`.
- `readObservationEvents(root, selection)` — reads raw event files without
  lifecycle interpretation.
- `summarizeObservations(events, selection)` — returns totals, coverage,
  unknown reasons, measurement counts, and source IDs only.

The CLI is intentionally small:

```text
node .agents/scripts/v4-observations.mjs record --input <json>
node .agents/scripts/v4-observations.mjs summarize --story <id>
node .agents/scripts/v4-observations.mjs session-checkpoint --input <json>
node .agents/scripts/v4-observations.mjs close-session --input <json>
node .agents/scripts/v4-observations.mjs import-usage --input <normalized-json>
```

`session-checkpoint` is an observational checkpoint before a Lead yields; it
does not prove that a provider session closed. `close-session` is used only
when the caller knows a real boundary. Missing provider session IDs remain
unknown or partial rather than being fabricated from tool calls.
