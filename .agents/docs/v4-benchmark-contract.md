# V4 benchmark evidence contract

The benchmark is a bounded evidence consumer for the V4 Lite architecture
review. It does not invoke a provider, mutate a Story or Plan, alter the V3
pointer, approve adoption, or make a `PASS` claim from a bundle shape alone.

## Bundle versions

`ComparisonBundle` schema v2 is the write format. The public entry points are
exported by `.agents/scripts/benchmark-v4.mjs` and implemented by
`.agents/scripts/benchmark-v4-v2.mjs`:

- `normalizeComparisonBundle(input, expectedVariant)` returns `VALID`,
  `INVALID`, or `LEGACY_UNVERIFIED`. A valid shape is not execution evidence.
- `buildCandidateBundle(root, options)` creates one record for the manifest
  cases `L`, `M`, and `H`. Missing executions have empty checks,
  `correction_cycles: null`, and `coverage: UNKNOWN`; no default check or
  synthetic `PASS` is created.
- `compareBundles(baseline, candidate, { evidenceRoot })` separates identity
  comparability, evidence verification, deterministic case assertions,
  instruction measurement, and provider usage.
- `writeCandidateBundle(root, bundle, { runId })` writes only
  `.agent-state/v4-observations/evaluations/acceptance/<runId>/candidate-bundle.json`.
  Existing content is immutable: equal content is `NOOP`, different content is
  `CONFLICT`.

Schema v1 bundles remain readable for historical traceability. They are
`LEGACY_UNVERIFIED`; comparison is `INCOMPARABLE` with quality and metrics
`INCONCLUSIVE`. A v1 bundle is never upgraded in place and never supplies
acceptance evidence.

## Evidence boundary

Each complete case binds its `case_id`, workload class, normalized input
digest, source HEAD, runner digest, toolchain, timestamps, cwd, argv/helper
entrypoint, raw-result references and digests, actual observations, assertion
results, and required-check coverage. Raw canonical outcomes are preserved:
`PASS`, `INCOMPLETE`, `STALE`, and recovery statuses are not rewritten into a
generic success label. An expected rejection is represented by its raw status
plus a separate passing assertion.

`evidence.status: VERIFIED` and `coverage: COMPLETE_VERIFIED` require a run
identity, runner digest, non-empty evidence index, complete case bindings, and
an explicit evidence root at comparison time. Every raw-result path must be a
safe non-symlink path, match the indexed digest, and contain the same case,
input, and source identity. A path cannot be reused by two cases. Missing,
stale, tampered, cross-case, contradictory, skipped, or unbound evidence makes
the relevant result `INCONCLUSIVE`; it cannot produce quality `PASS`.

The evolution consumer accepts a comparison only when evidence is verified,
deterministic checks pass, quality is explicitly `PASS`, and any usage record
has `status: MEASURED`, a measurement id, and an evidence digest. Empty or
caller-supplied unbound usage is not a measurement and cannot yield
`EVALUATED` or `AWAITING_HUMAN`.

## Corpus and measurement identity

`run-v4-architecture-corpus.mjs` executes the fixed L/M/H corpus in isolated
fixtures and records actual outputs. The runner binds source HEAD, runner
digest, corpus digest, input digest, command/helper entrypoint, assertions and
raw evidence. The M case must retain raw `INCOMPLETE` with its unmapped path
and `REVIEW_REQUIRED`; the H case records stale-preview and recovery checks as
separate evidence. Candidate execution does not pretend to be a baseline run;
when the baseline API is unavailable the result is `UNSUPPORTED`/
`INCONCLUSIVE`.

`measure-v4-instruction-context.mjs` reads raw Git blobs at named revisions
under the versioned `normal-action-instruction-source-v1` basis. It records
path, blob id, byte count, digest, role, action, profile, and input digest.
Duplicate paths count once. Missing required or triggered lazy sources are
`INCONCLUSIVE`, not zero. `implement_slice` and `verify_slice` are compared
separately; L/M/H rows do not multiply one static context measurement.

`COMPARABLE` and CLI exit code `0` describe only the identity comparison. They
are not the U2 acceptance gate. The original requirement remains at least a
30% reduction for both normal actions on a valid shared basis, with all
required invariants preserved. This contract does not change that threshold.
