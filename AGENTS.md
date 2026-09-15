# Project Agent Instructions

## Development Authority

Codex is the primary technical orchestrator and implementation agent.

BMAD artifacts are the source of truth for:
- product requirements
- architecture
- epics
- stories
- acceptance criteria
- specification traceability

Approved BMAD artifacts outrank implementation methodology preferences.

## BMAD and Superpowers Boundary

BMAD owns specification and product/architecture decisions.

For a BMAD Story that is already approved or `ready-for-dev`:

- Treat the Story and approved upstream BMAD artifacts as the approved specification.
- Do not rerun Superpowers brainstorming for the product requirement.
- Do not redesign approved product scope through Superpowers.
- Use Superpowers only as an implementation methodology.
- If a genuine contradiction or blocker is discovered, stop and escalate it instead of silently redesigning the Story.

## Story Execution Policy

Before implementation, classify the Story as:

- SIMPLE
- MEDIUM
- COMPLEX

Use the project `story-development` skill to perform the classification and select the execution workflow.

Execution policy:

- SIMPLE:
  - direct implementation
  - proportionate tests
  - deterministic verification

- MEDIUM:
  - Superpowers `writing-plans`
  - Superpowers `test-driven-development`
  - implementation
  - deterministic verification

- COMPLEX:
  - Superpowers `writing-plans`
  - Superpowers `test-driven-development`
  - Superpowers `subagent-driven-development`
  - deterministic verification
  - staged code review

Do not use a heavier workflow than the Story risk requires.

## Antigravity Reviews

For independent cross-model review, use:

`antigravity-review`

Antigravity is optional and risk-based.

Codex remains the primary orchestrator and must independently verify and triage all Antigravity findings.

Never use `--dangerously-skip-permissions`.

If AGY workspace-aware headless review fails, use the context-in-memory fallback defined by the skill.

Approved BMAD artifacts and deterministic evidence outrank Antigravity recommendations.

## Completion Rule

Never declare implementation complete without fresh deterministic verification appropriate to the change, including relevant:

- tests
- lint
- typecheck
- build
- git diff inspection