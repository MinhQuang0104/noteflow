# V4 Lite task router

Root `AGENTS.md` decides authority. This file is routing guidance, not runtime state.

Fresh schema-v2 Story entry additionally supports `start_story` under the Runner's explicit-start contract. Planning approval, readiness and dependencies must be durable; read-only `start-story.mjs check` precedes fingerprint-bound `apply`. Start synchronizes Story/Plan/sprint only, persists `implement_slice:<current>` and stops. It does not use lifecycle reconciliation to manufacture pre-existing execution evidence.

For an explicit request to implement or continue Story `<epic>.<story>` **by V4 Lite**, and only after the canonical active-run pointer is clearly IDLE, route to `.agents/skills/v4-story-runner/SKILL.md`. This foundation permits read-only validation/readiness plus one bounded `reconcile_lifecycle`, `implement_slice`, `verify_slice`, `finalize_story`, or `complete_story` action per invocation under that skill's guards. `finalize_story` stops at `review`/Human Gate. `complete_story` is enabled only with a durable, exact-scope Human approval bound to the current review state; automatic approval, generic continuation authorization, automatic `review → done`, and automatic V3 fallback remain disabled. An explicit V3.1/Orca request follows V3.1. A Story request without a named lane retains the existing V3.1/`story-development` route. If a request names both lanes, stop for clarification.

For explicitly human-authorized V4 Lite migration work, apply the L1 routing below only after the pointer is clearly IDLE.

Select exactly one primary L1 module by the task's main deliverable:

| Task class | L1 module |
|---|---|
| Agent/control-plane, orchestration architecture, or worker-contract infrastructure maintenance | `.agents/context/control-plane.md` |
| Context modules, loading rules, or router work | `.agents/context/context-routing.md` |
| Verification infrastructure or evidence architecture | `.agents/context/verification-context.md` |

Load a second module only when its concern materially affects the same deliverable; never load all modules by default. If the task fits no class, stop and clarify the V4 scope. Product work and approved Stories without explicit V4 opt-in use the existing V3 route in `AGENTS.md` and `.agents/policies/orchestration-v3.md`.

Treat authoritative V3 documents as L2: open relevant detail only for an affected boundary. Keep recovery/failover detail lazy; an observed recovery condition follows existing V3 authority, not a healthy V4 path.

## Action context routing

For a V4 Story action, read the common entry
`.agents/skills/v4-story-runner/SKILL.md`, then exactly one action document:

| `next_action.kind` | Action document |
| --- | --- |
| `start_story` | `actions/start-story.md` |
| `reconcile_lifecycle` | `actions/reconcile-lifecycle.md` |
| `implement_slice` | `actions/implement-slice.md` |
| `verify_slice` | `actions/verify-slice.md` |
| `finalize_story` | `actions/finalize-story.md` |
| `complete_story` | `actions/complete-story.md` |

Load `references/recovery.md` only for an observed partial/locked/recovery
condition and `references/implementation-techniques.md` only when the selected
action requires its compact implementation recipe. The common entry never
executes an action and no action document authorizes its successor.
