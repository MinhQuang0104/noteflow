# V4 Lite control-plane context

Use for authorized changes to agent instructions, control-plane architecture, orchestration architecture, or worker-contract infrastructure. Define the proposed V4 boundary and its effect on existing responsibilities before changing instructions or contracts. Keep design guidance separate from canonical runtime state in `.agent-state/`.

V3.1 remains the runtime authority while migration is incomplete. Normal work and approved Story execution continue through root `AGENTS.md`, `.agents/policies/orchestration-v3.md`, and the Story skill. Do not silently alter worker ownership, isolation, dispatch, review, integration, or Human Gate behavior.

The V4 Story Runner is a small routing entry. It selects one validated action
document and keeps semantic coding, evidence sufficiency, review judgment, and
Human approval with their existing owners. Mechanical substeps may be
automated later only behind the action's existing freshness, exact-scope,
receipt, recovery, and one-action guards. A common entry never executes an
action, and recovery/implementation recipes are lazy references rather than
additional authority.

Open only the relevant sections of `.agents/policies/orchestration-v3.md` as L2 when a proposed change touches an existing authority, lifecycle gate, worker contract, or orchestration boundary. Point to that policy rather than restating its procedures. Recovery/failover detail is loaded only for a directly observed condition or a specifically authorized design change concerning that boundary.
