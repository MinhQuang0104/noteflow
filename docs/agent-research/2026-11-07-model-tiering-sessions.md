# Model tiering and session splitting in Claude Code

- **Sources:** a Vietnamese social media post on Claude Code workflow (no link
  kept; unverified, single practitioner) ·
  [Claude Code – subagents](https://code.claude.com/docs/en/sub-agents) ·
  [Claude Code – agent teams](https://code.claude.com/docs/en/agent-teams)
- **Read:** 2026-11-07
- **Status:** idea

## Summary

- Claim: installing many skills and running the strongest model for every task
  wastes tokens; skill flows also slow the model down.
- Proposed three tiers: strongest model (Opus) for planning, splitting work and
  review before merge; mid model (Sonnet) for implementation from a settled
  brief; cheapest model (Haiku) for searching code, running tests, reading logs
  and triaging errors, possibly in parallel.
- Proposed sessions: one coordinating session that talks to the human, plus
  per-area sessions (design, frontend, backend, deploy) that report back to it.
- Anecdote: on one content-production task set, the mid model reached about
  97% of the strongest model's self-assigned quality score at under half the
  cost; the strongest model stayed better where it had to decide on its own.
  Single author, self-scored, one domain: not evidence.

**Corrections:**

- Claude Code can set a model per subagent (`model:` in `.claude/agents/*.md`
  or per call), but it does not open named parallel sessions by itself.
- Separate sessions share the repository, `CLAUDE.md`, auto memory and MCP
  configuration, but not conversation history; a fresh subagent starts with
  empty context.
- Sessions do not report to each other without a mechanism (agent teams,
  shared files, or an orchestrator such as Orca).
- Parallel sessions on one checkout will overwrite each other; each needs its
  own worktree and non-overlapping scope.
- Skill frontmatter is always loaded, so skill count does cost tokens every
  turn and makes selection harder (consistent with
  [skill-library-layers](2026-11-07-skill-library-layers.md)).

## Compared with our architecture

- **Already have, across vendors:** strong Lead for planning, review and
  integration; cheap AGY worker implementing from a fixed contract (the brief);
  executor chosen per slice; isolated worktrees and scope-overlap refusal.
- **Missing:** a cheap tier for the Lead's own search and log-reading work;
  the Lead does it with an expensive model.
- **Does not fit:** a coordinating session that splits and dispatches work by
  itself (contradicts D5 and disabled automatic continuation).

## Takeaways

1. Read-only explorer subagent on a cheap model (for example
   `.claude/agents/explorer.md` with `model: haiku`, read-only tools) for
   consumer/test search and log summaries; output is a hint, never evidence.
   Needs the migration lane. Same idea as
   [lean-subagents](2026-10-08-lean-subagents.md).
2. Keep review on a model at least as strong as the author.
3. Audit installed skills (about 18 in `.agents/skills`, mostly BMAD) and
   remove or disable rarely used ones to cut always-loaded frontmatter.
