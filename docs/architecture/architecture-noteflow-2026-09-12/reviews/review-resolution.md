# Pre-handoff resolution — 2026-09-13

Status: ready for Product Owner proposal review; not an adopted build contract. Original review reports describe the pre-fix draft and remain as review evidence.

| Findings | Disposition |
| --- | --- |
| AS-01, rubric H-3 | Tightened AD-6/9: shared account-row lock, command ledger, atomic restore result/epoch/fence, lock-coordinated recovery after abandoned execution. |
| AS-02, rubric H-5 | AD-9 and proposal §4 require one REPEATABLE READ export, shared manifest validation and module snapshot/restore ports. Operational identities are excluded from restored facts. |
| AS-03, rubric H-2 | AD-4 closes typed read boundaries and declares backup's shared-transaction exception. |
| AS-04 | Separate completion/journal versions and field-specific writes; note saves serialize and replay uncertain outcomes. |
| AS-05, AS-09 | AD-13 binds relational constraints, ownership and one canonical target timeline. |
| AS-06 | AD-8 adds account revision, full owner-cache invalidation, subscribe/refetch handshake and visible-tab recovery. |
| AS-07, rubric H-1 | Explicit single-owner admission, private no-store pages/API, safe text rendering, CSRF and narrow private Storage transfer exception. |
| AS-08 | One AccountTimeContext per use case; account-zone event interpretation and shared read snapshots. |
| AS-10, rubric H-4 | Product discussion retained as D-05; added proposed conflict matrix and explicit implementation prerequisite. No product decision silently adopted. |
| AS-11 | Durable owner/epoch/command identity, request hash, replayable acknowledgement and key-reuse rejection. |
| AS-12 | Shared versioned normalization; whole-token/multiword matching explicitly proposed under D-06. |
| Rubric M-1/M-2 | Source precedence and auth traceability clarified; AD-14 binds navigation, responsive draft lifecycle and private state reset. |
| Rubric M-3/M-4, TECH-01–03 | Corrected independent ORM/Kit versions, named Postgres.js, documented Supavisor pooling and Vercel execution envelope. Version baseline still requires actual build verification when implementation is requested. |

Remaining user decisions are listed in proposal §11. The current task ends at delivery of this proposal; no application code, migrations, deployments or implementation stories were created.
