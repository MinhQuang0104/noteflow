\# Story Complexity Rubric



Classify implementation complexity using risk and uncertainty, not line count.



\## SIMPLE



Typical characteristics:



\- isolated change

\- one module or narrow component

\- requirements are explicit

\- few acceptance criteria

\- no architecture decision

\- no database schema change

\- no authentication/security boundary

\- no concurrency or race-condition concern

\- no migration

\- no external integration

\- low regression surface



Examples:



\- UI text or label change

\- small deterministic validation rule

\- isolated formatting behavior

\- minor component behavior with obvious tests



Execution:



Direct implementation with proportionate verification.



Use TDD when the change expresses meaningful behavior or fixes a reproducible bug,

but do not force a heavyweight TDD workflow for trivial non-behavioral changes.



\---



\## MEDIUM



Typical characteristics:



\- multiple files or modules

\- several acceptance criteria

\- API/client interaction

\- state management

\- routing

\- non-trivial validation

\- multiple edge cases

\- moderate regression surface

\- implementation approach needs planning

\- architecture already defines the relevant boundary



Examples:



\- search behavior

\- keyboard navigation

\- form flow

\- CRUD feature across frontend/backend

\- API integration

\- state synchronization without complex concurrency



Execution:



1\. Superpowers writing-plans

2\. Superpowers test-driven-development

3\. Implementation

4\. Deterministic verification

5\. Codex review



\---



\## COMPLEX



Any of the following strongly indicates COMPLEX:



\- database schema or migration with meaningful risk

\- authentication or authorization

\- security-sensitive behavior

\- concurrency

\- race conditions

\- background jobs

\- transactions across multiple resources

\- backup/restore

\- destructive operations

\- data consistency invariants

\- architecture boundary changes

\- external service integration with failure modes

\- large cross-module impact

\- many dependent acceptance criteria

\- high uncertainty

\- difficult rollback

\- multiple independently implementable tasks



Execution:



1\. Superpowers writing-plans

2\. Superpowers test-driven-development

3\. Superpowers subagent-driven-development

4\. Per-task review

5\. Deterministic verification

6\. Whole-change code review

7\. Consider Antigravity independent review



\---



\## Escalation Rule



When classification falls between two levels, choose the higher level only when

the additional risk justifies the extra process.



Do not classify based primarily on estimated lines of code.

