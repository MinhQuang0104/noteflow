# V3.1 A0 telemetry contract, version 1

Purpose: compare future Stories with a measured V3 baseline without changing
execution state, lease, runtime, or approval authority. No percentage reduction
target. No telemetry service or new runtime state file is required.

Record a compact table in the existing verification summary or an external
TokenTracer export referenced there. Key each observation by Story ID/pinned
source, run ID, task/attempt where applicable, Lead session ID, actor role
(Lead/worker/subagent), provider and source/export ID. Include contract version,
measurement window, unit, source field, coverage and known exclusions. Missing or
unsupported values are null/unknown, never zero; distinguish measured zero from
unavailable data. Estimates must be labeled and must not mix with measured totals.
Telemetry is observational; it cannot change run authority or gate outcomes.

| Metric | Unit and semantics |
|---|---|
| uncachedInputTokens | Provider-reported input not served from cache. If inputTokens includes cachedInputTokens, subtract cached once. If the provider reports them separately, use uncached directly. Never call cached tokens fresh input. |
| cachedInputTokens | Provider-reported cache-read input tokens, separate from fresh input. Record cache-write accounting separately in source notes if available; do not guess provider billing semantics. |
| outputTokens | Provider-reported total generated output under that provider's definition. Record whether it includes reasoning. |
| reasoningTokens | Reported reasoning subset or separate bucket, with explicit inclusion rule. If a subset of outputTokens, never add it again to total traffic. Unknown when hidden/unreported; do not infer from text length. |
| leadTurns | Completed or interrupted top-level Lead response cycles triggered by user input or an orchestrator continuation, counted once by turn ID. Tool continuations/model retries within that response are not additional Lead turns. Mark harnesses exposing only requests as turn count unknown. |
| subagentTurns | Same turn definition for child agents, attributed to each child once. Separate fixed Antigravity worker activity from optional subagents; report worker turns separately if available. No implication that extra agents should be created. |
| modelRequestCount | Actual provider requests, including retries if source exposes them; one Lead turn may issue many requests. Count by provider request ID; otherwise report source limitations and avoid invented counts. |
| toolCalls | Actual individual tool invocations, including failed calls and retries; do not count result messages as calls. For an orchestration wrapper such as functions.exec, count leaf calls, not both wrapper and leaves. If only wrappers are visible, label that coverage and do not combine it with leaf totals. |
| workerReportBytesProduced | UTF-8 byte length of finalized semantic reports, once per unique run/task/attempt/path/digest, including correction and blocked reports. Copying the same artifact from worktree to canonical storage is not additional production. Distinct emitted revisions count separately; record them rather than overwriting evidence. |
| workerReportBytesLoaded | Actual report content bytes delivered into Lead context by read/tool results. Count repeated explicit loads each time; count only returned slices on partial/truncated reads. Disk size is not a proxy. Exclude tool envelopes, log/capture bytes and automatic history replay; tokens already account for replay. Mark unknown if rendered/decoded content bytes cannot be measured reliably. |
| policyReferenceLoads | Explicit policy/reference read deliveries; count file/section loads (each file in a batched read separately). Record path/revision or digest, returned range and actor. Repeated loads count again; repeated input-context billing is not another load. |
| contextCompactions | Observed harness compaction events per actor/session, deduplicated by event ID. Unknown if not exposed. |
| correctionCycles | Actual same-task correction dispatches following Lead review/verification findings, attributed by task and attempt. Do not count duplicate receipts, status polling, worker local fix loops or infrastructure-only retries as correction cycles. |
| leadActiveDuration | Seconds in the union of observed Lead working intervals per Story, including model/tool execution and review; exclude idle worker-wait, human approval wait, downtime and inactive sessions. Stop an interval when yielding to such waits. Unknown without sufficient timestamps; never substitute Story elapsed time. |
| leadSessionCount | Unique Lead session IDs participating in that Story across resume/account/provider changes; no new session per request or turn. |

A2 breakdown of `policyReferenceLoads` (same record/export, no new subsystem):

- Label each delivery canonical-policy, compact-guide, named-reference or
  full-guide-fallback, with selected Orca identity/version, action category and
  resolved reference name. Derive `compactGuideLoads`, `namedReferenceLoads` and
  `fullGuideFallbackCount` from those deliveries; attach `fallbackReason` to each
  fallback. Failed retrieval is a tool call, not a successful content load.
- Tag recovery-triggered reference deliveries to derive `recoveryReferenceLoads`
  (a subset, not an additional total). Count full fallback separately even when it
  contains recovery text. Record `policyReferenceBytesLoaded` from actual UTF-8
  content delivered, including repeats and partial reads; unavailable is unknown.
  Token-equivalents need a named tokenizer or explicit estimate label, never an
  invented provider-token saving.
- Record `healthyActionsWithoutFullGuide` once per observed healthy action and
  its action ID/window, only if no full fallback supplied that action's context.
  This is an action count, not a load count; missing action coverage is unknown.
  Future Story benchmarks compare these counts and actual bytes/tokens. A2 alone
  makes no measured savings claim.

Attribution and aggregation:

- Prefer unique leaf request/event IDs. A parent export containing child traffic
  must be expanded into attributed leaves OR used as an inclusive total with its
  children excluded from aggregation. Never sum inclusive parent and child totals.
  Deduplicate the same request observed in multiple exports. If sources cannot be
  reconciled, present separate partial totals; do not publish a misleading sum.
- Aggregate tokens, turns, requests and calls by actor first; publish Lead and
  worker/subagent separately plus a deduplicated Story total when coverage permits.
  A retry's newly billed usage counts once even when it produces no report.
- A request spanning multiple Stories is shared/unallocated unless a source has
  reliable attribution; never charge its entire cost to each Story. Preserve an
  allocation rule and denominator if manual estimates are needed.
- Story lifecycle elapsed time is start-to-terminal wall clock, optionally
  recorded separately. It includes waits and is not leadActiveDuration. Union
  intervals to avoid overlap across sessions; state lease age is not active time.
- Raw terminal output is not a semantic worker report payload. Track optional
  rawCaptureBytesProduced/Loaded and referencedLogBytesLoaded separately. For the
  legacy baseline, label old result files LEGACY_UNSTRUCTURED and record their
  on-disk bytes as legacyResultBytes; do not relabel mixed capture as v1 payload.
  Compare legacyResultBytes plus actual legacy loads with structured-report and
  separately loaded log/capture traffic, disclosing unequal measurement coverage.

Manual/external TokenTracer mapping (no assumed proprietary field names):

1. Save/reference export ID, provider, date/window and available request/session/
   parent IDs. Map its input/cache/output/reasoning fields to the rows above and
   record inclusion semantics. Unsupported reasoning/requests/compactions stay null.
2. Join request IDs to actor, session and Story/run/task/attempt from known dispatch
   and session evidence. De-duplicate parent/child and cross-export overlap before
   aggregation. Keep billed retries. Do not persist credentials or reasoning text.
3. Count turns from harness turn IDs, calls from invocation IDs, compactions from
   events, and active duration from activity intervals if exported; otherwise use
   a labeled manual ledger or unknown. Request count cannot stand in for turns.
4. Obtain produced report bytes from files (UTF-8 raw byte length) and digest;
   obtain loaded bytes from actual read payloads, not filesystem size. Record
   partial read/truncation and repeat counts. Track policy reads by path/revision.
5. Record correction dispatches and participating Lead sessions from existing
   evidence. Attach only compact totals, mappings and coverage to the existing
   verification summary; detailed exports remain external references.

Next-Story checkpoint: collect all rows, including nulls and reasons. Compare
initial vs correction reports separately (bytes produced and loaded), correction
cycles, Lead sessions/turns/active time, actor-separated token/request/tool traffic,
policy/reference loads and compactions. Include lazy-loaded logs/captures so a
smaller report cannot conceal shifted ingestion cost. Historical artifacts remain
unchanged; unavailable V3 baseline metrics stay unavailable.

Architecture regression command (requires Python and the jsonschema package):
`uv --cache-dir .tmp-uv-cache run --with jsonschema python -m unittest _bmad.scripts.tests.test_agent_architecture`
Use `--offline` once dependencies are cached. No product test suite is required
for changes restricted to this contract and reporting policy/schema.
