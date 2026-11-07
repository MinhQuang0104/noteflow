# Captain workflow for many agents (Kun Chen)

- **Sources:**
  [Podcast episode: ex-Meta L8 engineer shipping 40 PRs a day with agents](https://www.castfox.net/podcast/behind-the-craft-6838441/episode/how-this-ex-meta-l8-engineer-ships-40-prs-a-day-with-ai-agents-kun-chen-2275893) ·
  [kunchenguid on GitHub (AXI, no-mistakes, treehouse)](https://www.github.com/kunchenguid)
- **Read:** 2026-10-08 (from a secondary Vietnamese summary post)
- **Status:** idea

## Summary

- The human acts as a captain directing a crew of agents, not as a typist or a
  diff reader.
- Terminal-first work, short memory files, skills loaded on demand, lessons
  recorded after agent mistakes, worktree management, voice input.
- **no-mistakes pipeline:** a fresh-context adversarial review, rebase onto the
  latest main before verification, end-to-end tests, and a single decision
  package for the human (intent, risk, review results, test results,
  screenshots or video of the feature).
- **AXI:** tool output designed with tokens as a first-class constraint.
- Overnight autonomous runs and a "first mate" agent that splits work.

## Compared with our architecture

- **Already have:** terminal workflow (Orca + CLI), short entry files, lazy
  skills, worktrees, JSON check scripts.
- **Missing:** a decision bundle for the Human Gate; deterministic visual
  evidence (Playwright screenshots) for frontend Stories; a clean-context
  reviewer.
- **Does not fit:** overnight runs and automatic work splitting contradict
  "automatic continuation disabled" and the solo, quota-limited setup.

## Takeaways

1. Decision bundle for the Human Gate: ACs with evidence, risk, reviewer
   findings, changed files, screenshots. LOW reads the bundle; HIGH still reads
   the diff.
2. Playwright screenshots bound to the commit, as evidence for UI Stories;
   worker-taken screenshots are illustration only.
3. Clean-context reviewer for `REVIEW_REQUIRED` (see
   [lean-subagents](2026-10-08-lean-subagents.md)).
4. Quick audit of `check-*.mjs` output against AXI: silent on pass, precise on
   failure.
