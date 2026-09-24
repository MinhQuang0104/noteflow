# V4 Lite task router

Root `AGENTS.md` decides authority. This file is routing guidance, not runtime state.

For an explicit request to implement or continue Story `<epic>.<story>` **by V4 Lite**, and only after the canonical active-run pointer is clearly IDLE, route to `.agents/skills/v4-story-runner/SKILL.md`. This foundation permits read-only validation/readiness plus bounded `reconcile_lifecycle` and `verify_slice` execution under that skill's guards. `implement_slice`, `review_slice`, and `finalize_story` execution remain disabled. An explicit V3.1/Orca request follows V3.1. A Story request without a named lane retains the existing V3.1/`story-development` route. If a request names both lanes, stop for clarification.

For explicitly human-authorized V4 Lite migration work, apply the L1 routing below only after the pointer is clearly IDLE.

Select exactly one primary L1 module by the task's main deliverable:

| Task class | L1 module |
|---|---|
| Agent/control-plane, orchestration architecture, or worker-contract infrastructure maintenance | `.agents/context/control-plane.md` |
| Context modules, loading rules, or router work | `.agents/context/context-routing.md` |
| Verification infrastructure or evidence architecture | `.agents/context/verification-context.md` |

Load a second module only when its concern materially affects the same deliverable; never load all modules by default. If the task fits no class, stop and clarify the V4 scope. Product work and approved Stories without explicit V4 opt-in use the existing V3 route in `AGENTS.md` and `.agents/policies/orchestration-v3.md`.

Treat authoritative V3 documents as L2: open relevant detail only for an affected boundary. Keep recovery/failover detail lazy; an observed recovery condition follows existing V3 authority, not a healthy V4 path.
