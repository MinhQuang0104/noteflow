# V4 Lite task router

Root `AGENTS.md` is authority; this file routes context, not runtime state.

- authority: Root policy and BMAD intent; V3 policy remains authoritative for V3.
- runtime: Read only `.agent-state/active-run.json` first; continue only on clear `IDLE` with no contradiction.
- entry: Explicit V4 migration uses one L1 module; explicit V4 Story uses Runner plus one validated action.
- selection: control-plane → `context/control-plane.md`; context/router → `context/context-routing.md`; verification → `context/verification-context.md`.
- evidence: Plan/Story/Git/receipts/freshness/scope/status are authoritative; unknown is not empty; prose is not evidence.
- successor: One invocation may persist one explicit successor and must stop before executing it.
- stop: Active/ambiguous/contradicted pointer, missing authority, stale state, unsafe scope, or unsupported work stops without takeover, recovery, or mutation.

For V4 Story actions, load `skills/v4-story-runner/SKILL.md`, then exactly one: `start-story.md`, `reconcile-lifecycle.md`, `implement-slice.md`, `verify-slice.md`, `finalize-story.md`, or `complete-story.md` according to `next_action.kind`. `finalize_story` stops at review/Human Gate; `complete_story` is disabled without fresh exact-scope human approval. Automatic approval and automatic review-to-done remain disabled.

Load `references/recovery.md` only for observed partial/locked/recovery and `references/implementation-techniques.md` only when the action needs its recipe. Open L2 V3 policy, architecture/UX anchors, feature maps, consumers/tests, and BMAD workflows only for the affected boundary. Product/Story work without V4 opt-in remains on V3.
