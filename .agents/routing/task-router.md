# V4 Lite task router

Apply only after root `AGENTS.md` admits explicitly human-authorized V4 Lite migration work and the canonical active-run pointer is clearly IDLE. This file is routing guidance, not runtime state.

Select exactly one primary L1 module by the task's main deliverable:

| Task class | L1 module |
|---|---|
| Agent/control-plane, orchestration architecture, or worker-contract infrastructure maintenance | `.agents/context/control-plane.md` |
| Context modules, loading rules, or router work | `.agents/context/context-routing.md` |
| Verification infrastructure or evidence architecture | `.agents/context/verification-context.md` |

Load a second module only when its concern materially affects the same deliverable; never load all modules by default. If the task fits no class, stop and clarify the V4 scope. Product work, normal bugs, and approved Stories use the existing V3 route in `AGENTS.md` and `.agents/policies/orchestration-v3.md`, not this router.

Treat authoritative V3 documents as L2: open relevant detail only for an affected boundary. Keep recovery/failover detail lazy; an observed recovery condition follows existing V3 authority, not a healthy V4 path.
