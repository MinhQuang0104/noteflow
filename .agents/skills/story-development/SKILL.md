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



\### COMPLEX



Use:



\- Superpowers `writing-plans`

\- Superpowers `test-driven-development`

\- Superpowers `subagent-driven-development`

\- Superpowers verification/review skills as appropriate



Workflow:



1\. derive an implementation plan from the approved Story

2\. partition the plan into independently verifiable tasks

3\. implement using TDD

4\. use fresh subagents for independent tasks when appropriate

5\. perform task-level specification and quality review

6\. run deterministic verification

7\. perform whole-change Codex code review

8\. inspect git diff

9\. evaluate whether independent Antigravity review is warranted



\---



\## Step 5 — Deterministic Verification



Before completion, run all relevant available checks.



Examples:



\- unit tests

\- integration tests

\- E2E tests when required

\- lint

\- typecheck

\- static analysis

\- production build



Fresh verification results outrank agent claims.



If verification fails:



do not mark the Story complete.



\---



\## Step 6 — Codex Code Review



Review the completed implementation against:



\- Story Acceptance Criteria

\- approved architecture

\- implementation plan

\- current git diff



Classify issues by severity.



Fix validated blocking issues before completion.



\---



\## Step 7 — Antigravity Risk Gate



Antigravity is NOT mandatory.



Invoke `antigravity-review` when one or more apply:



\- COMPLEX classification

\- authentication/security-sensitive behavior

\- concurrency or race conditions

\- database migrations or destructive data operations

\- architecture boundary changes

\- significant cross-module change

\- Codex has meaningful uncertainty after its own review

\- verification exposes inconsistent or surprising behavior



Normally skip Antigravity for low-risk SIMPLE changes.



For MEDIUM changes, use Antigravity only when risk or uncertainty justifies the extra review.



If Antigravity is invoked:



1\. receive candidate findings

2\. independently verify them

3\. classify each as:

&#x20;  - ACCEPT

&#x20;  - REJECT

&#x20;  - NEEDS\_VERIFICATION

4\. do not apply recommendations blindly



\---



\## Step 8 — Completion



A Story may be marked complete only when:



\- required Acceptance Criteria are implemented

\- deterministic checks pass

\- Codex review has no unresolved blocking issue

\- any required Antigravity findings have been triaged

\- git diff contains no unintended changes



Return:



\- complexity classification

\- methodology used

\- verification performed

\- unresolved risks

\- completion status

