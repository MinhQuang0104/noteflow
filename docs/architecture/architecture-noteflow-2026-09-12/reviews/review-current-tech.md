# Current technology review

Reviewed: 2026-09-13. Scope: proposal and spine technology choices and managed-platform compatibility. No application code reviewed or written.

Verdict: suitable architecture direction for the stated MVP after the corrections below. Published package versions are proposal baselines, not a tested dependency lockfile.

## Findings

### TECH-01 — Correct and separate Drizzle ORM and Kit versions (high)

The stack tables assign `0.44.7 stable` to both packages. ORM and Kit have independent stable version lines. The historical 1.0 beta fallback note is insufficient evidence for a current production baseline. The official [ORM 0.45.2 release](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.2) also fixes `sql.identifier()` and `sql.as()` escaping with a possible SQL injection impact. The official [Kit 0.31.10 release](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit@0.31.10) confirms its separate version.

Concrete fix: use `drizzle-orm 0.45.2` and `drizzle-kit 0.31.10` as separate proposed pins in both documents, replace the stale beta-fallback source, and verify the pair with Node 24/TypeScript 6 during eventual scaffolding. The ORM main-branch package currently says 0.45.3, which is not sufficient evidence of a published release; do not pin an unreleased main-branch value.

### TECH-02 — Bound backup execution and specify recovery after process termination (medium)

Direct private Storage correctly avoids Vercel's 4.5 MB request/response payload limit, but does not remove function execution or memory limits. The current [Vercel limits](https://vercel.com/docs/functions/limitations) specify finite execution budgets. The proposal durably commits an operation and account fence before performing restore, yet does not say how a terminated invocation is distinguished from an active importer or how the fence is safely released. An unknown response cannot be resolved merely by repeatedly reading a permanently pending operation.

Concrete fix: add an operational backup-size/time benchmark before production, transaction/lock timeouts below the function budget, and a database-coordinated recovery path. Operation outcome and epoch must commit atomically with replacement. A status/recovery request may reconcile an abandoned attempt only after proving its restore transaction is no longer active under the same operation/account lock. Never release the fence solely because a client timer elapsed. A worker fleet is unnecessary for this MVP if the bounded request/recovery design is validated.

### TECH-03 — Name the PostgreSQL driver used by the connection options (low)

Deployment prescribes `max: 1` and `prepare: false`, which match Postgres.js. The generic Drizzle stack row does not name this driver. Specify Drizzle's Postgres.js adapter and `postgres` driver, or express these as equivalent driver settings. The [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) supports shared transaction pooling for serverless, module-scoped clients, pool size one, disabled prepared statements and TLS. It also warns that session-level state does not survive transaction pooling, so future lock/context implementation must use transaction-scoped mechanisms.

## Verified choices and limits

- [Next.js official release news](https://nextjs.org/blog) identifies 16.3.3 as the August 2026 Active LTS security release. [Node's official schedule](https://nodejs.org/en/about/previous-releases) supports the Node 24 LTS choice. No reason to switch the architecture stack.
- TypeScript 6 is a defensible deliberate choice: [TypeScript 7.0's announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) explains the missing compiler API and continued TypeScript 6 compatibility requirement for some tools. Describe it as a tooling compatibility choice, not the newest compiler.
- Official pages support [Tailwind 4.3](https://tailwindcss.com/blog/tailwindcss-v4-3), [Zod 4.6](https://zod.dev/packages/zod), [Vitest 5](https://vitest.dev/blog/vitest-5), and [Playwright 1.63](https://playwright.dev/docs/release-notes). Exact patches and peer dependencies still require a lockfile/build when implementation is authorized.
- Supabase transaction pooling is compatible with explicit transactions but not persistent session assumptions. Private Broadcast invalidation avoids requiring a long-lived websocket server inside Vercel. PostgreSQL 17 is a provider compatibility baseline rather than a claim that it is the latest upstream major.
- Auth cookie wording in the reviewed proposal already follows the provider's supported SSR flow rather than requiring an unsupported universal HttpOnly setting. Browser product writes remain behind the authenticated API; direct Storage transfer is scoped to backup transport.

## Gate disposition

Fix TECH-01 before user handoff. Clarify TECH-02 at proposal/spine level before treating restore architecture as accepted. TECH-03 is a small naming correction. All other package compatibility claims remain untested implementation checks; this review does not imply code/build validation.
