---
name: story-development
description: Use for implementing an approved or ready-for-dev BMAD Story under the shared V3 Lead policy.
---

# Story Development

This skill is the repository's execution router for an approved BMAD Story. It
selects proportionate controls; it is not a second SDLC or implementation agent.
Follow the authority and Done Gate in the repository root `AGENTS.md`.
Follow `.agents/policies/orchestration-v3.md`: Codex and Claude first perform its
shared bootstrap; active runs enter RESUME MODE before new planning. Phase 1
is superseded by Phase 2A: use the project-local `orca-cli` and `orchestration`
skills for tracked Orca dispatch. Direct product implementation fallback remains
disabled.

Phase 2B requires read-only durable/Orca/Git reconciliation before a replacement
Lead acquires the next generation. Every orchestration mutation requires the
current owner/generation lease under the canonical `mutation.lock`. A new Lead,
provider, transcript or terminal never authorizes duplicate Task dispatch.

## 1. Preflight

Before editing:

1. inspect `git status`, the current branch, repository root, and
   `git worktree list`;
2. confirm the active checkout contains the intended Story;
3. do not edit an ignored or stale worktree copy as a substitute for canonical
   repository policy; and
4. in a linked worktree, compare `AGENTS.md` and this skill with the main
   checkout and report policy drift before implementation.

## 2. Load Focused Context



Read:

- the target Story, including Tasks/Subtasks and Acceptance Criteria;
- only directly relevant approved architecture and UX decisions;
- affected code, contracts, and tests; and
- sprint/status data needed for lifecycle synchronization.

Do not regenerate Epic context or reload unrelated artifacts.

## 3. Readiness and Blockers

Confirm the Story is approved or `ready-for-dev`, its Tasks map to its ACs, and
implementation-critical dependencies are available.

Stop and escalate to BMAD or a human when there is an unresolved product or
architecture decision, contradictory approved artifact, ambiguous AC, or missing
dependency that would require invented behavior. Do not redesign approved scope.

## 4. Risk and Plan

Read `references/complexity-rubric.md` and classify the Story `LOW`, `MEDIUM`,
or `HIGH`.

Use actionable Story Tasks/Subtasks as the default implementation plan. Create a
short `delta plan` only for missing implementation information:

- files or components affected;
- non-obvious execution order;
- migration and rollback sequence;
- contract callers or consumers;
- high-risk failure modes; and
- verification commands.

In the durable run plan, retain Story task references and any needed delta only;
do not repeat background, ACs, or approved decisions.

## 5. Implement



The Lead checkpoints the plan and bounded worker contract under V3 ownership.
Before Task creation or dispatch, enforce the duplicate-dispatch gate against
durable and Orca Task identity while holding the current lease.
Dispatch fixed Antigravity through Orca Orchestration into an Orca-managed isolated
worktree. Before orchestration mutation, load the version-matched full guide as
required by V3. Preserve Run/Task/Dispatch/worker/worktree IDs and use same-task
corrections. Prefer supervised dispatch. Use V3's `compat-terminal` path only for
an observed Orca/Antigravity compatibility failure, with an existing coordinator-
owned Run and Task, explicit isolated worktree identifiers, fixed Antigravity,
rendered terminal evidence, independent Git verification, and coordinator Task
update. Worker DONE
requires Lead review of actual diff, scope, ACs, tests and architecture before
ACCEPTED. No external model review is required. No extra implementation subagents
or per-task reviewer loops belong to the default path. Infrastructure failure
requires diagnosis/escalation, never silent Lead coding or engine substitution.

Use Superpowers selectively:

- `test-driven-development` for behavioral logic or regressions;
- `writing-plans` only to produce the delta plan;
- `systematic-debugging` only after a reproducible failure;
- `receiving-code-review` only when feedback exists; and
- `verification-before-completion` for fresh completion evidence.

Do not automatically invoke `bmad-build`, `requesting-code-review`,
`subagent-driven-development`, `executing-plans`, or `using-git-worktrees`.

## 6. Verify and Trace

Run focused checks while implementing, then every applicable full repository
check that actually exists. Never report a planned check as executed.

Inspect the final diff for unintended scope and architecture violations. Record
compact AC-to-evidence entries:

```text
AC1
Evidence:
- test/check: <name>
- command: <command>
- result: PASS
```

Use concise documented manual evidence only when an AC is not deterministically
testable, and state why.

## 7. Escalate by Risk or Evidence

- `LOW`: standard implementation, focused checks, full applicable gate.
- `MEDIUM`: also inspect affected consumers, state transitions, integration
  boundaries, and unhappy paths.
- `HIGH`: perform the deeper Lead adversarial review defined in `AGENTS.md`
  and add targeted negative, concurrency, contract, recovery, or security tests
  where executable.

Classify review findings as `VALID`, `FALSE_POSITIVE`, `SPEC_AMBIGUITY`, or
`NEEDS_HUMAN_DECISION`. Findings require evidence. Never invent behavior to fix
`SPEC_AMBIGUITY`.

## 8. Failure and Completion

For a verification failure: reproduce, find the root cause, add a regression test
where appropriate, make the smallest fix, rerun affected checks, then run the
final gate. After about three recurrences of the same underlying failure, stop
patching and reassess assumptions, Story clarity, environment, and dependencies.
Escalate if approved intent or architecture must change.

Apply the Deterministic Done Gate in `AGENTS.md` and V3 state transitions. Record
verification evidence and enter HUMAN_GATE. Keep BMAD lifecycle accurate without
conflating worker DONE, Lead ACCEPTED and Human APPROVED. COMPLETE requires the
human approval/integration record and synchronized lifecycle; preserve the gate
across every handoff.
