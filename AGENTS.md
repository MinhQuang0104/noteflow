# Project Agent Instructions

## Authority

Codex is the primary technical orchestrator and implementation agent.

For product and implementation decisions, use this order:

1. explicit user direction
2. approved BMAD product, architecture, UX, Epic, Story, and Acceptance Criteria artifacts
3. deterministic evidence about the implementation
4. implementation-method guidance

BMAD owns product intent, architecture and UX decisions, Epics, Stories,
Acceptance Criteria, readiness, traceability, sprint status, and the Done Gate
record. Do not silently reinterpret an approved requirement. Escalate unresolved
product or architecture decisions to BMAD or a human.

## Approved Story Routing

`story-development` is the sole repository-level execution router for an
approved or `ready-for-dev` BMAD Story. Codex performs the implementation.
BMAD is not a second implementation orchestrator.

Load the Story plus only the architecture, UX, code, and tests relevant to the
change. Treat actionable Story Tasks/Subtasks as the implementation plan. Write
a concise `delta plan` only when the Story lacks an implementation mapping,
non-obvious ordering, migration or rollback sequencing, contract consumers,
high-risk failure modes, or verification commands. Do not restate the Story,
its background, all ACs, or approved technical decisions.

No external model review is required. Per-task implementers, per-task reviewers,
whole-branch reviewer loops, and implementation subagents are not part of the
default path.

## Risk Routing

Classify each Story before implementation:

- **LOW** — localized change; no public contract, authentication/security,
  migration, concurrency, destructive operation, or irreversible side effect.
- **MEDIUM** — multi-file or multi-module behavior, state changes, API consumer
  changes, or meaningful integration behavior within approved boundaries.
- **HIGH** — authentication, authorization, security, migration, backfill,
  destructive data change, concurrency, idempotency, backup/restore, shared
  architecture boundary, public API/OpenAPI contract, time/search invariant,
  cross-module write/refactor, irreversible external side effect, ambiguous
  Story/AC, or incomplete/failing verification.

LOW uses standard implementation and evidence. MEDIUM adds consumer and unhappy-
path checks. HIGH adds a deeper Codex adversarial review and targeted tests; it
does not automatically add another agent.

For HIGH risk, Codex must:

1. identify affected architecture decisions and invariants;
2. attempt to falsify each important invariant;
3. inspect relevant callers and consumers;
4. inspect unhappy paths and rollback/recovery where applicable;
5. add executable negative, concurrency, or security tests when applicable; and
6. support every finding with evidence.

Classify findings as `VALID`, `FALSE_POSITIVE`, `SPEC_AMBIGUITY`, or
`NEEDS_HUMAN_DECISION`. Never resolve `SPEC_AMBIGUITY` by inventing product
behavior.

## Selective Techniques

Superpowers provides techniques, not a second orchestration layer:

- use `test-driven-development` for behavioral logic and regressions, not as
  ceremony for pure scaffold or configuration;
- use `systematic-debugging` only after an actual failure;
- use `verification-before-completion` to require fresh evidence;
- use `receiving-code-review` only when review feedback actually exists; and
- use `writing-plans` only when Story Tasks/Subtasks are insufficient, producing
  only the delta plan described above.

Do not put `requesting-code-review`, `subagent-driven-development`,
`executing-plans`, `using-git-worktrees`, or reviewer loops on the default Story
path. Use an optional review workflow only when the user explicitly requests it.

## Failure and Retry

On verification failure: reproduce, identify the root cause, add a regression
test where appropriate, make the smallest fix, rerun affected verification, and
then rerun the final gate. If the same underlying failure recurs about three
times, stop patching and reassess the architecture assumption, Story clarity,
test environment, and dependency/configuration state. Escalate when approved
intent or architecture would need to change; do not respond by adding reviewers.

## Deterministic Done Gate

A Story is complete only when:

1. every AC has evidence;
2. applicable deterministic checks were run recently;
3. those checks are green;
4. the final diff was inspected;
5. no unintended scope change remains;
6. relevant architecture decisions and domain invariants are respected;
7. no unresolved HIGH or MEDIUM issue remains;
8. the BMAD Story and sprint/status lifecycle are synchronized; and
9. a human retains approval for irreversible deployment or release decisions.

Prefer evidence in this order:

```text
executable acceptance/integration tests
> contract tests
> typecheck/static analysis
> lint
> build
> smoke/E2E
> runtime assertions
> documented manual evidence
> LLM judgment
```

Use only checks that actually exist. At the time this policy was established,
the main checkout contains control-plane/BMAD checks and a placeholder root
`npm test`; the application CI, tests, lint, typecheck, build, contract, and smoke
gates planned by Story 1.1 are not yet executable evidence. Do not report them as
passing until Story 1.1 implements them.

Keep the AC-to-evidence record short:

```text
AC1
Evidence:
- test/check: <name>
- command: <command>
- result: PASS
```

If an AC cannot be tested deterministically, record concise manual evidence and
why deterministic verification is not practical.

## Checkout and Generated-Workflow Safety

Before Story work, inspect `git status`, the branch, and `git worktree list`.
When operating in a linked worktree, compare its `AGENTS.md` and
`story-development` policy with the canonical main checkout and report stale
policy before implementation. Never update ignored worktree copies as a proxy
for changing canonical policy.

The legacy BMAD Build renderer currently leaves real spaced workflow placeholders
unresolved. It is not on the approved Story execution path. Treat its rendered
snapshot as follow-up technical debt, not executable Story instructions, until a
separate renderer fix has deterministic coverage for the real placeholder syntax.
