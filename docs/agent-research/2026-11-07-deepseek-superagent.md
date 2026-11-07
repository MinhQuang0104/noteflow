# DeepSeek dsh-superagent (router + workers)

- **Sources:**
  [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) ·
  [Hands-on review (DEV Community)](https://dev.to/geekcoding101/i-ran-deepseeks-dsh-superagent-end-to-end-a-hands-on-deep-dive-a29) ·
  [Design summary (CellCog, competitor-written)](https://cellcog.ai/blog/deepseek-super-agent/)
- **Read:** 2026-11-07
- **Status:** idea

## Summary

- Research prototype (MIT), not a product: a proactive coding agent for one
  GitHub repository, packaged as a plugin for DeepSeek Harness, triggered by
  GitHub and optionally Feishu. The published code is narrower than the design
  article.
- Premise: the bottleneck is human attention (about three to five concurrent
  agent sessions), not model capability.
- **Router** is deliberately thin: it accepts and assigns work, never decomposes
  it, and is forbidden from reading code. **Workers** get one ticket each, their
  own session and directory (usually a git worktree), up to 16 in parallel, with
  one slot always reserved for human messages.
- **Thread binding:** a worker subscribes to its thread (for example a PR), so
  follow-ups bypass the router.
- **Events, not prompts:** code filters triggers before a model sees them.
- **State:** one SQLite engine is the only writer; side effects go through a
  durable queue written in the same transaction.
- **Authorization** (praised by the reviewer): a deterministic gate before any
  model reads a message; senders are explicit or inferred; accept modes
  `off` / `observe` / `auto`; each accepted ticket records a mandate with a
  policy-version hash, revalidated before resuming.
- **Weakness:** workers run shell without approval as the operator's OS user
  with the agent's credentials; anyone who can comment on a followed PR can
  feed text to such a worker. Published speed numbers come from a synthetic
  scheduling simulation, not code quality.

## Compared with our architecture

- **Same principles:** human attention as the bottleneck; single writer with
  transactions; code-first gates before model judgment; isolated worktrees.
- **Similar mechanism:** their mandate bound to a policy hash ≈ our autopilot
  authorization bound to Plan digest and HEAD, plus pinned `controlPlaneCommit`.
- **Different by choice:** we have no always-on router and no automatic intake
  from external events; the owner opens Stories manually (decision D5).
- **Same weakness:** our AGY worker also runs without per-command approval.

## Takeaways

1. Check whether autopilot authorization is re-validated when policy changes
   mid-Story (compare with their mandate revalidation).
2. If a coordinating Lead is ever added, use thread binding: review feedback
   goes straight to the Story's Lead.
3. If more Stories run automatically, keep one slot for the human.
4. Do not copy worker shell freedom; see the AGY floor takeaway in
   [autonomy-levels](2026-11-07-autonomy-levels.md).
