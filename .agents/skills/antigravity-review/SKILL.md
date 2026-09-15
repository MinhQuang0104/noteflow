\# Antigravity Review



\## Purpose



Use Antigravity CLI (`agy`) as an independent reviewer while Codex remains

the primary orchestrator and final technical decision maker.



This skill is intended for:



\- BMAD Story review

\- Architecture review

\- Implementation-plan review

\- Git diff / code review

\- Acceptance-criteria review



Antigravity must never become the implementation owner.



\---



\## Authority



Use this authority order:



1\. Explicit user instruction

2\. Approved BMAD artifacts

3\. Acceptance Criteria

4\. Deterministic evidence:

&#x20;  - tests

&#x20;  - lint

&#x20;  - typecheck

&#x20;  - build

&#x20;  - runtime behavior

5\. Approved architecture constraints

6\. Codex analysis

7\. Antigravity recommendations



Antigravity output is advisory only.



\---



\## Safety Rules



Always:



\- Run Antigravity in plan mode.

\- Never use `--dangerously-skip-permissions`.

\- Never ask Antigravity to modify workspace files.

\- Never automatically broaden Antigravity permissions.

\- Treat empty output or denied actions as a failed review.

\- Verify every Antigravity finding independently.



Do not allow Antigravity to:



\- modify source files

\- modify BMAD artifacts

\- run destructive Git commands

\- decide requirement changes

\- override approved architecture

\- change technology versions just to match the local environment



\---



\## Review Workflow



\### Step 1 — Identify review target



Determine the target:



\- Story

\- Architecture artifact

\- Implementation plan

\- Git diff

\- Code section



Identify the relevant source-of-truth artifacts.



For BMAD Story reviews, typically include:



\- target Story

\- PRD

\- Epics

\- Architecture

\- UX specification

\- Sprint status when relevant



Do not read unrelated artifacts unnecessarily.



\---



\### Step 2 — Codex performs initial analysis



Before invoking Antigravity:



1\. Read the target artifact.

2\. Read relevant upstream source-of-truth artifacts.

3\. Form an independent initial assessment.



Do not rely on Antigravity as the first and only analysis.



\---



\### Step 3 — Invoke Antigravity



Preferred invocation:



`agy --mode=plan`



Use headless mode when practical.



Antigravity must be instructed to:



\- act only as an independent reviewer

\- not modify files

\- distinguish findings from proposed solutions

\- mark uncertain claims as requiring verification

\- avoid inventing architecture decisions

\- avoid treating the local environment as source of truth



\---



\### Step 4 — Workspace permission fallback



If Antigravity headless cannot inspect the workspace because of its own

permission layer:



DO NOT:



\- broaden its permissions automatically

\- use `--dangerously-skip-permissions`



Instead:



1\. Codex reads the relevant workspace files itself.

2\. Codex prepares the minimum review context.

3\. Pass the Story, artifact excerpts, diff, or other relevant content directly

&#x20;  to Antigravity in the prompt.

4\. Antigravity reviews only the supplied context.

5\. Codex verifies all findings afterward against the real workspace files.



\---



\### Step 5 — Triage every finding



For every Antigravity finding, Codex MUST classify it as:



\- ACCEPT

\- REJECT

\- NEEDS\_VERIFICATION



Separate:



1\. the detected problem

2\. Antigravity's proposed solution



It is valid to:



\- ACCEPT the problem

\- REJECT the proposed solution



Example:



Antigravity detects:

"Local Node.js is older than Story requirement."



Codex must verify approved architecture first.



If Architecture requires Node.js 24:



\- Problem: local environment mismatch → ACCEPT

\- Proposed Story downgrade → REJECT



\---



\### Step 6 — Verification



Verify findings against:



\- approved BMAD artifacts

\- source code

\- Acceptance Criteria

\- Git diff

\- deterministic tests

\- official technical documentation when needed



Do not treat an AGY claim as confirmed merely because it sounds plausible.



\---



\## Story Review Prompt



For Story review, use this intent:



Review the target Story against approved upstream BMAD artifacts.



Act as an independent reviewer, not the implementation owner.



Identify only:



\- confirmed contradictions

\- missing implementation constraints

\- ambiguous requirements

\- missing Acceptance Criteria coverage

\- dependency or sequencing risks



For each finding include:



\- ID

\- severity

\- confidence

\- classification

\- source artifact

\- evidence

\- affected AC/task

\- detected problem

\- proposed solution

\- whether implementation should be blocked



Rules:



\- Do not modify workspace files.

\- Do not invent architecture decisions.

\- Do not expand product scope.

\- Do not change approved technology choices merely to match local environment.

\- If evidence is insufficient, mark NEEDS\_VERIFICATION.



\---



\## Code Review Prompt



For implementation review, review:



\- relevant Story / Acceptance Criteria

\- current Git diff

\- affected architecture constraints



Focus on:



\- Acceptance Criteria violations

\- regressions

\- architecture violations

\- concurrency/race risks

\- missing tests

\- security issues within approved scope



Do not propose unrelated refactors.



\---



\## Completion Criteria



A review is complete only when:



\- Antigravity returned usable findings

\- Codex independently verified them

\- every finding was classified

\- disagreements are explicitly recorded

\- no workspace file was modified by Antigravity

\- no dangerous permission bypass was used

## AGY Review Validity

An Antigravity-assisted review is valid only if AGY returns non-empty usable findings.

If AGY fails because of authentication, permissions, empty output, or tool denial:

- mark the AGY step as FAILED
- do not claim that AGY findings were triaged
- continue with Codex-only review only if useful
- clearly label the final result as Codex-only