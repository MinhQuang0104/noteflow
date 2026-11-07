# Lean multi-agent roles: one job per agent

- **Sources:**
  [OpenAI Codex – Subagents](https://developers.openai.com/codex/subagents.md) ·
  [Anthropic – How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) ·
  [Cognition – Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) ·
  [LangChain – How and when to build multi-agent systems](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems)
- **Read:** 2026-10-08 (prompted by a Vietnamese social media post)
- **Status:** idea

## Summary

- The post proposes a root coordinator that never codes, plus on-demand
  explorer (read-only search), worker (code and tests) and researcher (docs)
  agents. These largely mirror Codex's built-in subagent roles.
- Anthropic: multi-agent uses about 15 times the tokens of chat and wins only
  on independent, parallel branches; its main benefit is context compression.
- Cognition: parallel writers make conflicting implicit decisions; reading can
  be parallel, writing should not.
- Shared conclusion: read-only subagents are safe and useful; writing should
  stay with one isolated agent.

## Compared with our architecture

- **Already have:** root ≈ Lead; one fixed worker (AGY) in an isolated
  worktree with a mechanical scope gate; review triggered by
  `check-escalation`.
- **Missing:** a read-only explorer; a reviewer with clean context (today the
  Lead reviews its own integration, a self-confirmation risk).
- **Does not fit:** a separate researcher (stable stack); extra parallel
  writers on one checkout.

## Takeaways

1. Clean-context reviewer subagent for `REVIEW_REQUIRED`: the targeted
   reviewer contract already packages its inputs, so only the executor
   changes. For HIGH, the reviewer must not be weaker than the author.
2. Read-only explorer to keep the Lead's context small; its output is a hint,
   never evidence.
3. One shared contract in `.agents/` with thin adapters for Codex and Claude.
4. Measure with the existing benchmark before trusting either.
