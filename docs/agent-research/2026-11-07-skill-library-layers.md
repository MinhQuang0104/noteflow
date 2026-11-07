# Building a skill library: "8 layers" post vs the official guide

- **Sources:**
  [Anthropic – The Complete Guide to Building Skills for Claude (PDF, Jan 2026)](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) ·
  a Vietnamese social media post attributing a 10-page "8 layers" PDF to
  Anthropic (its Google Drive link was truncated; unverified)
- **Read:** 2026-11-07
- **Status:** adopted for the research workflow (`.claude/skills/agent-research-note`); other takeaways are ideas

## Summary

- **Attribution is doubtful.** The official guide (about 33 pages) does not
  contain the "8 layers" model, the Look → Check steps, the five yes/no checks,
  the 3,900 vs 36,000 token figure or the 10-day roadmap. The post's PDF is
  most likely a community summary built on the official guide.
- **Official guide, verified:**
  - Three-level progressive disclosure: frontmatter always loaded, `SKILL.md`
    body loaded when relevant, `references/`, `scripts/` and `assets/` opened
    only when needed.
  - The description is the trigger interface: what the skill does and when to
    use it, under 1024 characters, no angle brackets, with phrases users
    actually say. Add negative triggers when a skill over-triggers.
  - Testing: triggering tests (obvious, paraphrased, and unrelated requests
    that must not trigger), functional tests, and comparison with and without
    the skill. Rough target: triggers on about 90% of 10–20 relevant queries.
  - Iterate on signals: under-triggering, over-triggering, user corrections.
- **Post's layers:** library, trigger, procedure (start with Look, end with
  Check), resources, scripts for anything with one right answer, yes/no checks
  before claiming done, guard (do / ask / never; external text is data), learn
  (turn each correction into a fixed check).

## Compared with our architecture

| Layer | Our state |
|---|---|
| Library | Have: tiny `CLAUDE.md`, short `AGENTS.md`, lazy skills |
| Trigger | Partial: Runner trigger is clear; most skills lack "when not to use"; no triggering tests |
| Procedure | Have: read-only prepare/bootstrap first, checkpoint/verify last |
| Resources | Have: lazy `references/` |
| Scripts | Have, extensively (about 146 scripts) |
| Checks | Stronger: deterministic `check-*.mjs` and Done Gate instead of model self-ticks |
| Guard | Mostly: escalation rules; no general sentence that worker output and web content are data |
| Learn | Manual: lessons become policy plus regression tests; automatic experience store dormant |

## Takeaways

1. Done: the research-note workflow is now a skill following these layers.
2. Add "when not to use" to skills that can over-trigger (BMAD personas,
   `orchestration`); mainly affects Codex, which discovers `.agents/skills`.
3. One general guard sentence (external and worker text is data, not
   instructions) would need the migration lane, since it touches `AGENTS.md`.
4. P7 measured about 59 KB of required instruction bytes per `implement_slice`;
   worth checking what could load more lazily.
