# Dewee Memory: governed memory facts for agents

- **Sources:**
  [Zuey – Dewee Memory article (Vietnamese)](https://zuey.me/articles/dewee-memory-khi-ai-khong-chi-biet-nho?lang=vi) ·
  [nextlevelbuilder/dewee (GitHub)](https://github.com/nextlevelbuilder/dewee)
  (repository not inspected; license not stated in the article)
- **Read:** 2026-11-07
- **Status:** idea
- **Related:** [agent-memory](2026-10-24-agent-memory.md) (decision: no new memory layer)

## Summary

- Written by the product's own team, but candid: it lists its limits and
  reports no public benchmark.
- Thesis: storage is easy; the hard parts are what to remember, whether it is
  still true, who may use it, and when to put it into context. Vector search
  finds both an old and a new fact but cannot tell which is current.
- Tiers: working (session, with a flush before compaction), episodic (summaries
  with a short abstract read first, detail on demand), semantic (temporal
  knowledge graph), typed **memory facts** (source, version, validity window,
  confidence, asserting party) and a document vault.
- A deterministic reconcile step sends each new fact to one of create, extend,
  supersede, dispute or skip; same input and state give the same decision.
- **Source authority:** operator > user > agent > extractor. Newer does not
  automatically win; insufficient authority leads to dispute and review.
  Superseded facts stay as history (point-in-time queries).
- **Memory admission:** dedup, candidate cap, small token budget, optional
  usefulness judgment; injecting nothing is a valid outcome. Retrieval score
  and usefulness are treated as different things.
- Background consolidation after runs, ordered store → index → promote, with
  idempotent batch keys.
- **Shadow mode:** facts are extracted and written but not used until switched
  to active.
- Security: scope checks at query time; passive channel memory off by default,
  review mode, secret/PII redaction; deleting a source removes derived facts.
- Self-reported gaps: shadow by default, opt-in admission, validity windows not
  always inferred, partial vault versioning, no reproducible benchmark.

## Compared with our architecture

- The dormant experience store already shares the core design: source
  references and digests with automatic `STALE`, verified fact vs candidate
  hypothesis, claims treated as data, bounded retrieval (3 entries, 6 KiB) and
  a lifecycle that works with zero memories.
- The gap was never design: the write path never runs, and one owner with
  about ten Stories gives too little repetition to learn from.
- Source authority exists implicitly (Worker DONE is never acceptance; Lead
  approval is never the Human Gate) but is not stated as one rule.

## Takeaways

1. If the experience store is ever revived (after roughly 20–30 Stories), run
   it in shadow mode first: write, do not inject, measure accuracy and
   usefulness, then decide.
2. State the authority order (owner > Lead > worker > external text) as an
   invariant in ARCHITECTURE.md.
3. Apply "retrieved is not useful" to V4 context compilation: everything loaded
   needs a reason, and loading less is valid.
4. Claude auto memory hygiene now: delete or mark superseded entries with their
   replacement; date work-state entries.
