# Agent architecture research notes

External ideas (articles, papers, repositories, reviews) evaluated against the
NoteFlow agent control plane. The current architecture map is
[`.agents/docs/ARCHITECTURE.md`](../../.agents/docs/ARCHITECTURE.md).

## Rules

1. **Research is not a decision.** No router, skill, action or script reads this
   folder. An idea becomes architecture only through the V4 Lite migration lane;
   then the decision goes into the ARCHITECTURE.md decision log and the note's
   status changes to `adopted`.
2. **Summaries and links only.** Notes are written in our own words. Do not copy
   articles, transcripts or posts. This repository is public.
3. **No personal data** (accounts, plans, local paths, credentials).
4. **Write on request.** A note is added when the owner asks to keep a piece of
   research, not after every conversation. Claude follows
   `.claude/skills/agent-research-note/SKILL.md` for this.

## Status values

`idea` (worth considering) · `planned` (accepted for a future migration-lane
change) · `adopted (<commit>)` · `rejected (<reason>)` · `reference` (context
only, nothing to adopt)

## Index

| Date | Note | Topic | Status |
|---|---|---|---|
| 2026-11-07 | [skill-library-layers](2026-11-07-skill-library-layers.md) | "8 layers" skill-library post vs Anthropic's official skills guide | adopted (research skill) / idea |
| 2026-11-07 | [autonomy-levels](2026-11-07-autonomy-levels.md) | Autonomy scales, capability vs permission, harness recommendations | idea |
| 2026-11-07 | [deepseek-superagent](2026-11-07-deepseek-superagent.md) | Router + workers, event triggers, mandate-based authorization | idea |
| 2026-11-07 | [gemini-architecture-review](2026-11-07-gemini-architecture-review.md) | External AI review of this repo: what it got right and wrong | reference |
| 2026-10-24 | [agent-memory](2026-10-24-agent-memory.md) | Long-term memory for agents; do we need it? | rejected |
| 2026-10-24 | [ai-office](2026-10-24-ai-office.md) | "AI office" orchestrators, agent-office repository | idea |
| 2026-10-08 | [kun-chen-workflow](2026-10-08-kun-chen-workflow.md) | Captain workflow, decision bundle for human review | idea |
| 2026-10-08 | [lean-subagents](2026-10-08-lean-subagents.md) | One job per agent: explorer, reviewer, researcher roles | idea |

## Note template

```markdown
# <Title>

- **Sources:** <links>
- **Read:** <date>
- **Status:** idea | planned | adopted (<commit>) | rejected (<reason>) | reference

## Summary
<own words, 5–10 bullets>

## Compared with our architecture
<already have / missing / does not fit>

## Takeaways
<concrete, small proposals, each with its risk or cost>
```
