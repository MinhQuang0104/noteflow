# Rubric review — NoteFlow MVP Architecture Spine

- **Reviewer lens:** Good-spine rubric walker
- **Artifact:** `../ARCHITECTURE-SPINE.md`
- **Sources checked in full:** `../../../product/prd.md`, `../../../product/project-brief.md`, `../../../ux/ux-spec.md`
- **Verdict:** **CHANGES REQUIRED before the spine can be used as a build substrate.** It is a strong discussion draft: the paradigm, temporal authority, fact/projection split, autosave state, restore transaction and single-region MVP shape are coherent. It does not yet close several seams where independently built units can make incompatible choices.

## Gate assessment

| Good-spine criterion | Result | Evidence / assessment |
| --- | --- | --- |
| Fixes the real divergence points one level down | Partial | AD-1–AD-12 cover the main system shape, but account admission, cross-module read contracts, database enforcement of concurrency invariants, backup control/data boundaries and serverless database operations remain open or implicit. |
| Every AD Rule is enforceable and prevents its stated divergence | Partial | AD-2, AD-3, AD-7, AD-8 and AD-11 are mostly enforceable. AD-5, AD-6, AD-9 and AD-12 need stronger contracts or constraints to produce the guarantees named under **Prevents**. |
| Nothing in Deferred can let units diverge | Fail | Whole-note versus field-level conflict, edit versus delete, login/session behavior, multi-word search and field limits affect API, database and client contracts. They are listed as ordinary deferred items without owner or build gate. |
| Named technology is verified-current | Partial | Node 24 and Next.js 16 are supported current lines. The table mixes exact patches, major/minor families, `x`, and “managed current”; this is not a reproducible compatibility contract. Current registry checks on 2026-09-12 showed Next.js 16.3.5 while the spine says 16.3.3, and TypeScript latest 7.0.2 while the spine says 6.0. The selected older versions may be intentional, but that intent and compatible patch policy are not bound. |
| Covers the driving PRD/UX capabilities | Partial | Challenge/time, notes autosave/search, calendar intervals and backup are represented. AX-01 and AX-09 are not bound, and several FR traceability ranges are incomplete. |
| Covers the operational/environmental envelope | Partial | AD-12 chooses Vercel/Supabase, one region, and staging/production separation. Connection pooling, migration/release ownership, restore-object lifecycle and minimum production monitoring are neither decided nor deferred. |
| Avoids unapproved product scope | Mostly pass | No obvious extra end-user feature is introduced. A persistent private Storage bucket for exported/imported backup files could accidentally become server-retained cloud backup unless object lifecycle is explicitly temporary. |

## What is already strong

1. **Temporal consistency is well centralized.** AD-2 and AD-11 give server domain code sole authority over account-local dates, Monday–Sunday weeks, UTC instants and event overlap. This directly addresses FR-006–023, FR-031–038 and the highest-risk date/streak cases in PRD RISK-003.
2. **The fact/projection model fits historical correction.** AD-3 correctly treats challenge identity, target periods and daily records as facts and rebuilds progress, streaks, records and calendar Done views. That supports FR-023 and FR-042 without making cached counters authoritative.
3. **Autosave and realtime preserve the UX promise.** AD-7 and AD-8 match UX AX-02–04: draft state is keyed by note identity, late acknowledgements cannot mark newer text saved, realtime invalidates rather than overwriting dirty drafts, and no offline persistence promise is added.
4. **Restore has the right core safety shape.** AD-9 provides prevalidation, a durable operation, an account-wide write fence, one database transaction, a dataset epoch and post-reconnect status lookup. These are aligned with FR-044–046 and UX PF-10.
5. **The architecture stays proportionate to MVP.** AD-1 prevents microservices, brokers and external search infrastructure. This respects the one-account, online-only MVP and the product priority order.

## Findings

### H-1 — The one-account admission boundary is not bound

**Evidence**

- PRD FR-001 requires one private account with no public registration (`prd.md:109`); public multi-user registration is explicitly out of scope (`prd.md:219`). AC-001 requires direct access attempts by unauthorized identities to fail (`prd.md:265`).
- Spine AD-5 scopes repositories by a “verified owner identity” and allows Supabase Auth (`ARCHITECTURE-SPINE.md:63–67`), but does not say which authenticated subject is the sole permitted owner or require public signup to be disabled.
- AD-8 requires owner-scoped private invalidations, but does not bind the Realtime topic-to-subject authorization rule (`ARCHITECTURE-SPINE.md:81–85`).

**Why this fails the rubric**

An API unit can accept any valid Supabase user and create an owner-scoped dataset while another unit assumes a pre-provisioned singleton owner. Both conform to the current wording. The first interpretation silently creates multi-account capability beyond MVP and weakens NFR-007. A generic `authenticated` Realtime policy can also disclose resource identities across authenticated subjects.

**Required disposition: autofix from existing product decisions**

Bind an identity admission rule independent of the still-open login UX: public signup disabled; exactly one pre-provisioned/allow-listed external auth subject maps to the NoteFlow account; every API request, private Realtime subscription and signed Storage operation checks that mapping. Keep login mechanism and session duration open, but do not leave who is authorized open. Add direct API, Realtime and Storage negative tests for a valid but non-owner token.

### H-2 — Module ownership covers writes but leaves cross-module reads and backup privileges ambiguous

**Evidence**

- AD-4 names owners and says cross-module **writes** call the owning use case; it only labels `today` a read composer (`ARCHITECTURE-SPINE.md:57–61`).
- Calendar must display challenge facts, Today composes challenge and event state, and Backup covers all modules. PRD explicitly describes those dependencies (`prd.md:249–253`), and UX AX-07 requires consistent shared Done/progress views (`ux-spec.md:436`).
- AD-3 requires one challenge domain engine for derived views, but does not state how Calendar or Today invokes it (`ARCHITECTURE-SPINE.md:51–55`).

**Why this fails the rubric**

The Calendar implementation can directly join challenge tables, Today can duplicate calculations, and Backup can either bypass module contracts or attempt to compose public APIs. All choices fit the current text but create different dependency graphs and can drift on archive/backfill/goal changes. The ownership rule therefore does not fully prevent its stated second-writer/duplicate-logic risk.

**Required disposition: autofix**

Bind read seams as well as writes: only a module repository accesses that module’s tables; a module exposes application-level query ports/DTOs; `today` composes the Challenges and Calendar query ports; Calendar obtains Done-by-account-day from a Challenges-owned query/projection and never reimplements streak/date rules. Give Backup an explicit exceptional integration seam: module snapshot/restore ports that participate in the shared transaction, or a named privileged persistence coordinator. Either choice is valid; the spine must select one.

### H-3 — AD-6 promises idempotency and conflict safety without binding the durable enforcement mechanism

**Evidence**

- AD-6 requires a client UUID/idempotency key, row version, base version and data epoch (`ARCHITECTURE-SPINE.md:69–73`).
- FR-009 and FR-043 require concurrent same-result Done/undo to converge, opposite stale states to conflict, and duplicate Done never to add a day (`prd.md:122`, `prd.md:181`).
- The ER seed does not show a command/idempotency record or the uniqueness/compare-and-swap constraints on which those guarantees depend (`ARCHITECTURE-SPINE.md:155–165`).

**Why this fails the rubric**

Merely carrying an idempotency key does not prevent a retried create after timeout unless the server durably records or uniquely constrains it. A row version does not prevent lost updates unless mutations use an atomic conditional update. Two adapters can implement incompatible replay scope, retention and conflict responses while both claim compliance. In-memory deduplication also fails across Vercel instances.

**Required disposition: autofix**

Bind the minimum database invariants, without expanding to a full schema:

- a unique daily fact per `(challenge_id, account_local_date)`;
- non-overlapping/effective target periods and only one pending target per challenge;
- atomic compare-and-swap on `row_version` plus `data_epoch` for mutable resources;
- a durable account-scoped command key/result record, or an equivalent unique business-key contract, for commands whose retry can create duplicates;
- transactionally enforced default-notebook uniqueness and same-owner parent relations;
- `event_end > event_start` at both domain and database boundaries.

State the replay result for a reused command key with a different payload, and state that all mutations—including Backup orchestration—use the same shared server persistence adapter/transaction boundary.

### H-4 — A binding conflict rule contradicts a Deferred item, and several build-blocking decisions are treated as ordinary deferrals

**Evidence**

- AD-6 says “stale text returns a typed conflict” using one resource row version (`ARCHITECTURE-SPINE.md:69–73`). That naturally binds whole-resource optimistic concurrency.
- Deferred says “Whole-note vs field-level conflict; edit vs delete” remains open (`ARCHITECTURE-SPINE.md:208`). UX explicitly leaves that product interaction unresolved (`ux-spec.md:452`).
- Multi-word search, login/session, field limits and backup compatibility are also deferred (`ARCHITECTURE-SPINE.md:207–214`) even though they affect client/API/schema contracts.

**Why this fails the rubric**

The API team can implement whole-note compare-and-swap from AD-6 while the editor team expects independent title/body resolution from Deferred. Search client and server can choose different multi-word semantics. Schema/API/UI can choose incompatible field limits. These are exactly the divergences the gate says may not remain silently under Deferred.

**Required disposition: discuss, then gate dependent implementation**

Split this table into:

- **Open blockers with owner and “decide before” gate:** note conflict granularity; edit-versus-delete outcome; multi-word search semantics; login/session UX; field limits that affect DB/API/backup validation.
- **Deferred/tunable after measurement:** autosave delay, browser matrix, search/sync thresholds and provider budget.

Until the product choices are made, narrow AD-6 to the already approved invariant—stale concurrent text must never overwrite saved text silently—and do not imply whole-note or field-level behavior. If whole-note selection is the recommended MVP trade-off, mark it `[PROPOSED]` as a decision for the owner rather than simultaneously deciding and deferring it.

### H-5 — Backup’s snapshot boundary and direct-Storage exception are underspecified

**Evidence**

- FR-040 includes timezone and all saved product data, while FR-044–046 require atomic replacement and queryable uncertain outcomes (`prd.md:173–184`).
- AD-9 says replace “all product facts,” preserve an import operation, use an account write fence and increment `data_epoch` (`ARCHITECTURE-SPINE.md:87–91`).
- Identity owns timezone, epoch and fence (`ARCHITECTURE-SPINE.md:171`), while the ER seed puts import operations under `ACCOUNT_STATE` (`ARCHITECTURE-SPINE.md:157–164`). The rule does not distinguish snapshot data from restore control metadata or external auth identity.
- AD-5 says all product reads/writes go through the API (`ARCHITECTURE-SPINE.md:63–67`), but AD-12 and the system diagram send backup bytes directly between browser and Storage (`ARCHITECTURE-SPINE.md:105–109`, `ARCHITECTURE-SPINE.md:151–152`).

**Why this fails the rubric**

Independent implementations can overwrite auth/account identity or the import operation itself, omit timezone, restore an old epoch, or include derived/search data. The API-only rule and direct transfer rule also conflict literally. Without an object lifecycle, the private bucket may become a retained cloud-backup feature that the PRD never approved and may retain highly sensitive content unnecessarily.

**Required disposition: autofix**

Define a versioned snapshot allow-list owned by modules. Explicitly exclude external auth subject, account identifier, command ledger, restore operation/fence, current `data_epoch`, provider object metadata and rebuildable indexes; include the product timezone and every FR-040 fact. Define API as the control plane that authorizes, issues scoped short-lived upload/download access, validates and commits; direct Storage is only the opaque-byte data plane. Require temporary object names scoped to account and operation, automatic expiry/deletion after completion or a short stated TTL, and no server-side backup library/history in MVP. State that control metadata survives rollback and remains queryable after the product-data transaction.

### M-1 — Traceability has gaps and source precedence is implicit

**Evidence**

- The PRD says it supersedes the Brief where later approved decisions differ (`prd.md:12`); UX says product conflicts resolve to PRD (`ux-spec.md:5–10`). The spine lists all three sources without recording that precedence (`ARCHITECTURE-SPINE.md:12–18`). This matters because Brief `§10.2` still labels archive/Done conflict behavior unresolved while PRD closes it in FR-042/043.
- AD-5’s **Binds** includes FR-001–005 and FR-024–046, omitting FR-006–023 even though its Rule says every product read/write uses the authenticated API (`ARCHITECTURE-SPINE.md:63–67`).
- The capability map associates “calendar and Today” with EPIC-005 only (`ARCHITECTURE-SPINE.md:198`), while Today is composed across EPIC-002, EPIC-004 and EPIC-005 (`prd.md:255`).

**Disposition: autofix**

Add one source-authority convention: PRD v1.1 governs product scope/rules; UX v1.0 governs interaction where consistent with PRD; Brief is historical input. Correct AD-5 to bind all relevant FR-001–046 and map Today explicitly as a cross-epic read composer. A concise FR/AX coverage appendix is unnecessary if the corrected capability map names uncovered AX-01–AX-10 as governed, deferred or source-owned.

### M-2 — AX-01 and part of AX-09 have no architectural home

**Evidence**

- UX AX-01 requires per-device restoration of area/note/sidebar, validation of stale identities and deep-link precedence (`ux-spec.md:430`).
- UX AX-09 requires a target area to become usable without loading the whole product and responsive layout changes not to reset draft state (`ux-spec.md:438`).
- The spine covers draft retention through AD-7 but neither binds device-local navigation persistence nor route/module-scoped loading. `identity` is server account context, not device UI context.

**Impact**

One client unit can persist navigation state on the server, another in browser storage, and another in route state; they will disagree on device separation and deep-link precedence. A root loader can also block Notes on Challenge/Calendar data despite the UX requirement.

**Disposition: autofix or explicit source-owned convention**

Add a small client convention: navigation/sidebar/last-note context is device-local non-product state; a valid direct route wins; restored IDs are authorization/existence checked; route/module queries load independently; the in-memory draft store lives above responsive layout branches so a breakpoint change does not recreate it. This does not add offline editing.

### M-3 — The serverless/Postgres operational seam is incomplete

**Evidence**

- AD-12 chooses Vercel Node runtime and Supabase Postgres (`ARCHITECTURE-SPINE.md:105–109`).
- Structural seed lists a shared Postgres adapter and forward migrations (`ARCHITECTURE-SPINE.md:177–186`) but no connection or release rule.

**Impact**

Each module may open its own direct database pool in ephemeral instances; migration execution may race application deploys; an incompatible schema deploy can break the single monolith or an in-flight restore. This is a deployment-level divergence the spine owns.

**Disposition: autofix**

Bind one server-only shared pooled database adapter suitable for Vercel concurrency, one migration owner/job, and backward-compatible expand/contract migrations across application deploys. State the minimum production signals: API error rate by stable code, save/conflict failures, restore operation status/duration and database/storage capacity alarms, without logging personal content. Provider backup/RPO/RTO can remain explicitly open because the PRD sets no SLA, but must not be silently confused with the user-export feature.

### M-4 — Stack version declarations are not a single reproducible policy

**Evidence**

- The Stack table mixes exact (`16.3.3`, `0.44.7`, `1.63`), minor (`19.2`, `4.3`, `4.6`), major (`24`, `17`, `5.0`), range (`5.x`) and managed-current values (`ARCHITECTURE-SPINE.md:124–139`).
- Official current checks support Node 24 LTS and Next 16 Active LTS, but the npm latest endpoints on 2026-09-12 report Next 16.3.5 and TypeScript 7.0.2. Sources: [Next.js support policy](https://nextjs.org/support-policy), [Node release schedule](https://nodejs.org/en/about/previous-releases), [Next npm metadata](https://registry.npmjs.org/next/latest), [TypeScript npm metadata](https://registry.npmjs.org/typescript/latest).

**Impact**

Two bootstrap units can select materially different package versions while claiming to follow the table, and “current” can drift after review.

**Disposition: autofix**

Choose one convention: supported major/minor lines in the spine plus exact lockfile ownership at scaffold time, or exact tested versions everywhere. If TypeScript 6 is intentionally chosen over current 7 for ecosystem compatibility, record that compatibility constraint; otherwise update it. Replace “managed current on date” with a provider/API compatibility policy and record the checked date in the memlog.

## Scope expansion check

- **No confirmed extra user-facing feature:** modularity, realtime invalidation, row versions, dataset epoch, staging and managed storage are implementation mechanisms serving approved FRs.
- **Potential accidental expansion:** retaining exported/imported files in Storage beyond transfer would constitute server-side backup retention/history that the PRD does not request. H-5 must close this.
- **Future features remain excluded:** nothing in the spine adds public registration, multi-user collaboration, offline/PWA/native behavior, semantic search/AI, rich text, recurring/all-day/external calendar, trash/undo, challenge scheduling or backup merge.

## Recommended gate order

1. Apply H-1, H-2, H-3, H-5 and M-1 directly because their answers already follow from the approved PRD and chosen architecture.
2. Surface H-4 as the compact Product Owner decision set; mark each dependent implementation gate.
3. Add the operational and client-state conventions from M-2/M-3.
4. Normalize the version policy in M-4 and rerun deterministic lint plus the other reviewer lenses.

After those changes, the spine should be rechecked specifically against FR-001, FR-004/043, FR-040–046 and UX AX-01–10. No application code is needed to close this review.
