\---

name: story-development

description: Route an approved BMAD Story through the appropriate implementation workflow based on complexity and risk.

\---



\# Story Development Router



\## Purpose



Execute an approved BMAD Story efficiently without duplicating BMAD's specification work.



BMAD owns specification.



Superpowers owns selected implementation methodology.



Antigravity provides optional independent review when risk justifies it.



Codex remains the main orchestrator.



\---



\## Step 1 — Load the Story



Read:



1\. target BMAD Story

2\. directly referenced Acceptance Criteria

3\. required upstream architecture constraints

4\. relevant UX requirements

5\. relevant existing implementation



Do not load unrelated artifacts unless needed.



\---



\## Step 2 — Story Readiness Review



Before implementation, check only for blockers that could cause incorrect implementation:



\- contradiction with approved architecture

\- missing implementation-critical requirement

\- ambiguous Acceptance Criterion

\- unresolved dependency

\- sequencing blocker



Do not redesign an approved Story.



If a blocking product or architecture issue is found:



STOP.



Report the blocker and request resolution.



Do not use Superpowers brainstorming to silently replace the approved BMAD decision.



\---



\## Step 3 — Complexity Classification



Read:



`references/complexity-rubric.md`



Classify exactly one:



\- SIMPLE

\- MEDIUM

\- COMPLEX



Return a short classification rationale.



Classification is based on:



\- scope

\- uncertainty

\- architecture impact

\- data risk

\- security

\- concurrency

\- dependency count

\- regression surface



Do not classify primarily by lines of code.



\---



\## Step 4 — Select Workflow



\### SIMPLE



Do not invoke heavyweight planning by default.



Workflow:



1\. inspect relevant code

2\. identify appropriate tests

3\. implement directly

4\. run relevant tests

5\. run applicable lint/typecheck/build

6\. inspect git diff

7\. verify Acceptance Criteria



Use Superpowers test-driven-development only when meaningful behavioral logic or

a reproducible bug benefits from RED-GREEN-REFACTOR.



\---



\### MEDIUM



Use:



\- Superpowers `writing-plans`

\- Superpowers `test-driven-development`



Workflow:



1\. create implementation plan from the approved BMAD Story

2\. do not brainstorm product requirements again

3\. execute with TDD

4\. run deterministic verification

5\. perform Codex code review

6\. inspect git diff



Do not invoke subagent-driven-development unless implementation risk grows to COMPLEX.



\---



### COMPLEX

Use:

- Superpowers `writing-plans`
- Superpowers `test-driven-development` where behavioral logic benefits from TDD
- direct Codex implementation by default
- deterministic verification
- whole-change Codex review

Default workflow:

1. derive a concise implementation plan from the approved BMAD Story
2. divide the work into independently verifiable tasks
3. implement the tasks directly with Codex by default
4. use TDD for meaningful behavioral logic
5. use proportionate verification for scaffold/configuration work
6. run deterministic verification after relevant milestones
7. perform whole-change Codex review
8. inspect `git diff`
9. evaluate the Antigravity risk gate

Do NOT automatically use:

- `subagent-driven-development`
- git worktrees
- additional Epic/context synthesis
- implementation-plan commits
- SDD ledgers
- conflict tables
- helper-script infrastructure

Use `subagent-driven-development` only when the SDD Gate below is satisfied.

## SDD Gate

`subagent-driven-development` is optional.

Do not use SDD merely because a Story is classified COMPLEX.

Use SDD only when at least two of the following are true:

- there are multiple implementation tasks that can be completed largely independently
- parallel execution provides meaningful time savings
- different tasks require substantially different technical expertise
- the Story is large enough that independent task-level review materially reduces risk
- Codex would otherwise need to hold too much unrelated implementation context at once

Avoid SDD when:

- tasks are strongly sequential
- multiple tasks modify the same files
- the Story is primarily scaffolding, configuration, CI, or project setup
- orchestration overhead is likely to exceed implementation effort
- the environment makes subagent/worktree execution fragile or expensive
- Windows/WSL/helper-script friction would add unnecessary setup work

If SDD is not clearly justified, Codex implements the plan directly.

Before invoking SDD, Codex must state:

- why SDD is justified
- which tasks will be delegated
- why those tasks are sufficiently independent


---

## Step 5 — Deterministic Verification

Before completion, run all relevant available checks.

Examples:

- unit tests
- integration tests
- E2E tests when required
- lint
- typecheck
- static analysis
- production build

Use proportionate verification for scaffold and configuration work.

Fresh verification results outrank agent claims.

If verification fails:

do not mark the Story complete.

---

## Step 6 — Codex Code Review

Review the completed implementation against:

- Story Acceptance Criteria
- approved architecture
- implementation plan
- current git diff

Classify issues by severity.

Fix validated blocking issues before completion.

Do not add unrelated refactors or scope changes during this review.

---

## Step 7 — Antigravity Risk Gate

Antigravity is NOT mandatory.

Default policy:

- SIMPLE: do not use Antigravity
- MEDIUM: use only when meaningful uncertainty or elevated risk remains
- COMPLEX: consider Antigravity after Codex review, but invoke it only when independent cross-model review is likely to add value

Invoke `antigravity-review` when one or more apply:

- authentication or security-sensitive behavior
- concurrency or race conditions
- destructive data operations
- database migrations with meaningful risk
- architecture boundary changes
- significant cross-module regression risk
- Codex has unresolved technical uncertainty
- deterministic verification exposes inconsistent or surprising behavior

Do not invoke Antigravity merely because the Story is classified COMPLEX.

If Antigravity is invoked:

1. receive candidate findings
2. independently verify each finding
3. classify each as:
   - ACCEPT
   - REJECT
   - NEEDS_VERIFICATION
4. separate the detected problem from the proposed solution
5. do not apply recommendations blindly

If AGY fails or returns no usable findings:

- mark the AGY review as failed
- do not claim AGY-assisted review succeeded
- continue as Codex-only review when appropriate
- clearly report that fallback

---

## Step 8 — Completion

A Story may be marked complete only when:

- required Acceptance Criteria are implemented
- deterministic checks pass
- Codex review has no unresolved blocking issue
- any invoked Antigravity findings have been triaged
- git diff contains no unintended changes

Return:

- readiness status
- complexity classification
- methodology used
- whether SDD was used and why
- verification performed
- Antigravity usage status
- unresolved risks
- completion status
