# Hexagonal architecture (Ports & Adapters)

- **Sources:** [Cockburn, original article (2005)](https://alistair.cockburn.us/hexagonal-architecture/) ·
  [Garrido de Paz, Hexagonal Architecture](https://jmgarridopaz.github.io/content/hexagonalarchitecture.html) ·
  [Notes on *Hexagonal Architecture Explained* (2024 book; read via third-party notes, book itself unverified)](https://github.com/ebarbeito/learning-notes/blob/master/books/hexagonal-architecture-explained.md) ·
  [AWS best practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/hexagonal-architectures/best-practices.html) ·
  [Anti-patterns list](https://ahmed-bhs.github.io/hexagonal-maker-bundle/advanced/anti-patterns-pitfalls.html) ·
  [Manning ch. 6, transactions (preview)](https://www.manning.com/preview/clean-applications-with-hexagonal-architecture/chapter-6) ·
  [Deptrac rules](https://dev.to/rubenrubiob/enforce-architecture-rules-with-deptrac-33e8) ·
  [JDriven critique](https://jdriven.com/blog/2022/10/Why-you-should-NOT-use-Hexagonal-architecture).
  Cockburn's 2025 talk PDF could not be read (binary), so it is unverified.
- **Read:** 2026-11-15
- **Status:** idea

## Summary

- One sentence: keep business rules in a core that knows no technology; the
  outside world reaches it only through interfaces the core itself defines.
  Laptop analogy: the core sets the socket standard, devices plug in through
  adapters, and swapping a device never means rewiring the board.
- Two regions only, inside and outside. It is not a layered architecture; how
  the inside is organised (layers, DDD, slices) is left open. Six sides mean nothing.
- Elements: app, actors (driving = starts the conversation; driven = called by
  the app), ports (owned by the app), adapters (technology translation),
  configurator (composition root, outside the pattern).
- Asymmetric wiring: driving adapters call a provided interface; the app
  declares a required interface on the driven side and the configurator injects
  the adapter. "Configurable dependency" is the core mechanism.
- Ports are named by purpose (`For…ing`), few in number (2–4 typical); a driven
  port per external system, not per domain concept.
- Development order: test-to-test (test driver + test doubles) first, then real
  driver, real driven, real-to-real, in thin end-to-end slices. Each port should
  have at least a real and a test adapter.
- Common pitfalls: ORM models leaking into the core, ports shaped like tables,
  anaemic domain, mocking domain objects, skipping adapter integration tests,
  and over-engineering plain CRUD. Transactions belong to the use case, with
  the mechanics in an adapter; outbox for outgoing events.
- Critics call it heavy ceremony for CRUD and a fix for an older problem
  (application-server testing); it pays off when domain rules are real.

## Compared with our architecture

- **Product backend (`backend/app/Modules`):** the driving side already fits
  (controller → command → use case/query), and `Identity` has a textbook driven
  port (`Contracts/Clock` + `Infrastructure/SystemClock`). Persistence has no
  port: use cases call the `DB` facade directly, so test-to-test is impossible
  and the module README's "domain stays plain PHP" rule is not enforced.
- **Agent control plane:** already port-like in spirit. Plan, Git and receipts
  are the stable contract, while Orca/AGY transport and Lead vendor are
  swappable (D4, `agy-transport.md`). No change is suggested here.
- **Agent Desk companion tool:** its V4 artifact reader acts as an implicit
  driven adapter with no port or tests, which is the coupling risk noted in
  ARCHITECTURE.md §3.

## Takeaways

1. Add Deptrac (or an architecture test) forbidding `Illuminate\*` in module
   `Domain`. Cost: one CI step; risk: low.
2. Introduce one persistence port only where real rules live (idempotency,
   version conflict, write fence), not across all CRUD. Cost: mapper
   boilerplate; it needs a Story, not a migration-lane change.
3. In Agent Desk, put an `ArtifactSource` port in front of the Plan/receipt
   parser and test the core with recorded fixtures. Cost: small; separate repo.
