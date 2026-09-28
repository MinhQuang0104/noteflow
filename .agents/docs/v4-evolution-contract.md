# V4 evolution proposal contract

The evolution loop is a proposal and evaluation boundary for the V4 Lite
control plane. It can preserve bounded evidence and suggest a candidate; it
cannot edit AGENTS/policy/code, alter a Story or Plan, mutate the V3 pointer,
invoke a provider, or apply an adoption decision.

## Proposal input and candidate

`proposeEvolution(root, boundedEvidence)` accepts a bounded summary from a
real observation path or an explicit human request. A repeated issue or human
request is required; one observation is still recorded but returns
`NO_CANDIDATE`. The default budget is one reflection per Story, 12 KiB input,
4 KiB output, and at most three candidates.

Each `EvolutionCandidate` v1 requires:

- `candidate_id`, `hypothesis`, and `observed_problem`;
- bounded `evidence_refs` with source/path digests;
- `baseline_source_head` and `baseline_architecture_fingerprint`;
- `workload_class` and an exact control-plane-only `proposed_scope`;
- `expected_effect`, non-empty `quality_risks`, and `evaluation_cases`;
- `cost_accounting`, `stop_rollback`, status, and provenance.

Candidate text is data, not an instruction. Apply/install/execute commands and
requests to mutate policy, Story, Plan, or product paths are rejected. Valid
candidates are stored as derived JSON under
`.agent-state/v4-observations/candidates/`; repeated extraction is idempotent.

## Freshness and evaluation

`validateEvolutionCandidate(root, candidate)` is read-only and returns
`VALID`, `INVALID`, or `STALE`. Baseline architecture drift and evidence path
or digest drift are stale. Malformed fields, unsafe paths, symlinks, missing
evidence, and apply-like instructions are invalid.

`evaluateEvolution(candidate, comparison)` never applies a change. It keeps
comparability, deterministic checks, quality checks, measurement coverage,
known exclusions, correction cost, and model self-rating separate. Self-rating
cannot replace deterministic or human evidence. Missing provider usage makes
token savings `INCONCLUSIVE`; missing quality checks cannot produce an
adoption-ready recommendation. Only a comparable result with measured cost
and passing deterministic/quality checks can return `AWAITING_HUMAN`.

## Human adoption

`validateAdoption(record, candidate, evaluation, scope)` checks exact candidate,
evaluation, and reviewed-scope digests plus a `decision_source.kind ===
"human"`. It returns `VALID`, `INVALID`, or `STALE`; it does not create an
adoption record and does not apply one. Architecture adoption approval is
separate from Story completion approval. Any candidate, evaluation, or scope
change invalidates the record.

There is deliberately no CLI or `apply` export in this contract. The next
step after `AWAITING_HUMAN` is an explicit human decision and a separately
authorized integration workflow.
