# V4 Lite context-routing context

Load context for the task's actual concern. L0 is root `AGENTS.md` and
`.agents/routing/task-router.md`; L1 is the selected module; L2 is only the
authoritative policy or evidence needed for a specific boundary.

For Story execution, the common Runner entry is L1 routing glue. Select one
action document from `v4-story-runner/actions/` by the validated Plan action.
Do not preload all action documents. Add `references/recovery.md` only when a
partial transaction is observed and add `references/implementation-techniques.md`
only when the action needs that recipe.

Select one L1 module by default. Add a second only when its concern materially
affects the same deliverable and record the reason. Never preload all modules or
unrelated V3 workflow material. Follow references into L2 only as needed, and
avoid copying detailed V3 rules into V4 guidance.

Keep the router deterministic and modules compact. Modules contain guidance and
pointers, never runtime state or session facts.
