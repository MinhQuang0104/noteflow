# Story Risk Rubric

Classify by failure impact, uncertainty, and verification quality, not by lines
of code. A larger localized change can be LOW; a tiny authorization change is
HIGH.

## LOW

All of the following normally apply:

- localized, explicit change;
- no public contract or shared architecture boundary;
- no authentication, authorization, or security behavior;
- no migration, destructive operation, or irreversible side effect;
- no concurrency or consistency risk; and
- straightforward deterministic verification.

Review depth: standard implementation, focused checks, all applicable repository
checks, AC evidence, and final diff/scope inspection.

## MEDIUM

Use MEDIUM for meaningful integration risk within approved boundaries, including:

- multi-file or multi-module behavior;
- state transitions or persistence behavior;
- API consumer changes that do not alter a public contract;
- several connected unhappy paths; or
- a moderate regression surface with available verification.

Review depth: LOW controls plus affected consumers, state transitions,
integration boundaries, and unhappy paths.

## HIGH

Any of these signals is HIGH:

- authentication, authorization, or security-sensitive behavior;
- migration, backfill, destructive data operation, or difficult rollback;
- concurrency, idempotency, caching, or state-consistency risk;
- backup or restore;
- a shared architecture boundary or public API/OpenAPI contract;
- a time or search semantic invariant;
- a cross-module write path or broad refactor;
- an irreversible external side effect;
- an ambiguous Story or Acceptance Criterion; or
- incomplete, inconsistent, or failing verification.

Review depth: architecture-and-adversarial Codex review, relevant caller and
consumer inspection, unhappy and recovery paths, plus targeted executable
negative, contract, concurrency, or security tests.

Ambiguity is a blocker, not permission to invent behavior. Incomplete evidence
keeps the Story out of the Done Gate even if the implementation appears correct.

## Escalation Rule

Choose the highest level triggered by a concrete signal. Escalation changes the
depth of Codex review and deterministic evidence; it does not automatically add
an agent, worktree, plan document, or review ceremony.

