# V4 Auto P7 — implementation plan: retire V3 as a standalone lane

Design: `.agents/docs/v4-auto-design.md` §8 P7. Requires G5. Status:
**NEEDS OWNER CONFIRMATION** before starting: this removes the V3.1 fallback
for Story work.

## 0. Phase rules

Follow `README.md` common rules. This phase intentionally changes asserted
policy text; every test assertion change must be listed in the report with the
policy sentence it follows. No assertion may be deleted without a replacement
that checks the new rule.

## 1. Target behaviour

- Story work routes only through V4 (with or without autopilot). V3 runtime
  concepts (leases, generations, recovery of V3 runs) remain readable for any
  historical run but are no longer a selectable lane.
- The AGY transport (V3.2 delivery recipe, permissions, liveness, block routing,
  scope gate) lives in `references/agy-transport.md`, referenced by
  `agy-executor.md`.
- Always-loaded context shrinks; prove it with
  `.agents/scripts/measure-v4-instruction-context.mjs`.

## 2. Tasks

### T1 — Inventory (read-only, report before editing)

List every reference to `.agents/policies/orchestration-v3.md`,
`story-development`, and V3 in `AGENTS.md`, `CLAUDE.md`, router, runner skill,
action docs, scripts, tests and Python tests. Classify each as transport (move),
historical (keep readable), or lane routing (remove). Report the table and
**stop for owner approval** before T2.

### T2 — Extract transport

Move the "V3.2 Antigravity loop operations" content into
`.agents/skills/v4-story-runner/references/agy-transport.md` unchanged in
meaning; leave a pointer in `orchestration-v3.md`. Update `agy-executor.md` and
tests asserting those strings to the new location.

### T3 — Routing

- `AGENTS.md`: remove the V3.1/Orca Story lane sentence; keep a sentence that a
  historical V3 run found non-`IDLE` in the pointer stops for the owner.
- Router: drop the V3 fallback clause.
- `story-development` skill: mark deprecated with a one-line pointer to the V4
  runner; do not delete it in this phase.

### T4 — Measure

Run `measure-v4-instruction-context` before and after; record the always-loaded
byte/token deltas in the report and in `v4-auto-design.md` §8.

## 3. Done

T1 (approved) – T4 committed, full `test:v4` + Python green, README status
updated.
