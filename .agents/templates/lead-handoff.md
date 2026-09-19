# Lead handoff

- Run / revision: <run-id / revision>
- Outgoing engine / owner / generation / lease: <engine / session-id / generation / active-or-released>
- Mode: <graceful or emergency reconstruction>
- Phase / current task / attempt: <facts>
- Worker status / Orca identifiers / worktree: <facts or unknown>
- Completed steps: <short references>
- Important decisions: <decision references>
- Blocker / waiting for: <fact or none>
- Lease release / fencing evidence: <reference; unknown forbids takeover>
- Reconciliation: <class / observed Orca and Git identities / correction or blocker>
- Exact next action: <one concrete action>
- Relevant artifacts: <minimal paths>
- Human gate: <pending or approval evidence bound to exact diff>

Optimization only. Reconcile against run.json, current worker and Git/future Orca.
Do not include transcripts, prompts, terminal dumps or verbose reasoning.
