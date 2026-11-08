# Long-term memory for agents

- **Sources:**
  [Anatomy of Agentic Memory (arXiv 2602.19320)](https://arxiv.org/abs/2602.19320) ·
  [Zep temporal knowledge graph (arXiv 2501.13956)](https://arxiv.org/abs/2501.13956) ·
  [Mem0 research](https://mem0.ai/research) ·
  [Letta – sleep-time compute](https://letta.com/blog/sleep-time-compute) ·
  [Anthropic – context management](https://www.anthropic.com/news/context-management) ·
  [Claude Code memory docs](https://code.claude.com/docs/en/memory) ·
  [Bad Memory (arXiv 2607.14611)](https://arxiv.org/abs/2607.14611)
- **Read:** 2026-10-24, assessed 2026-10-25
- **Status:** rejected (no need at current scale; experience store stays dormant)
- **See also:** [dewee-memory](2026-11-07-dewee-memory.md) (governed memory
  facts, source authority, shadow mode before activation)

## Summary

- Memory types: working (context), episodic (events), semantic (facts),
  procedural (skills, rules). The trend is distilling episodes into rules.
- The hard part is **writing and forgetting correctly**, not retrieval:
  bloat, and stale facts answered with confidence.
- Four approaches: plain files with an index (Claude Code); extracted facts in
  a vector store (Mem0); temporal knowledge graph with validity times (Zep);
  tiered memory with a background consolidation agent (Letta).
- Benchmarks are unreliable: vendors grade themselves and dispute each other;
  simple file-based memory scored as well as complex systems; common benchmarks
  fit in one context window.
- **Memory poisoning:** injected content that reaches memory affects every
  later session. Defences: record provenance per memory; always ask the human
  before high-risk actions regardless of memory.

## Compared with our architecture

- Every memory type already has a home: procedural in AGENTS.md and the Runner
  skill; semantic in feature maps (self-invalidating anchors); episodic in
  Story, Plan, receipts and git; session state in Claude auto memory.
- The built experience / evolution stores (about 1,550 lines with tests) never
  produced an entry; the write path never runs.
- Memory pays off with high-volume repeated work; this is one owner, one
  product, about ten Stories.

## Takeaways

1. Do not build more memory. Keep the experience store frozen; revisit after
   roughly 20–30 Stories.
2. Prune Claude auto memory regularly (remove "done" and "superseded" lines).
3. The real lesson is investment ratio: the control plane is larger than the
   product; new layers must justify their maintenance cost.
