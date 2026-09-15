# Adversarial Seam & Data-Integrity Review — NoteFlow Architecture Spine

- **Artifact reviewed:** ARCHITECTURE-SPINE.md, draft 2026-09-12
- **Lens:** independent downstream units, shared-data compatibility, concurrency, restore fencing, realtime convergence, privacy and data loss
- **Sources cross-checked:** PRD v1.1 and UX Specification v1.0
- **Review result:** **REJECT AS A BINDING SPINE UNTIL TIGHTENED**

## Verdict

The selected direction is appropriate for the MVP: one modular monolith, PostgreSQL as the source of truth, server-owned time rules, optimistic concurrency, derived challenge projections, database-native search, and an epoch-fenced restore. The current spine is nevertheless too permissive to coordinate independent implementation units. Two units can obey every Architecture Decision literally and still disagree on what a daily record means, which version protects a mutation, which caches a realtime event invalidates, or whether an old write may commit after restore.

This is a coordination failure rather than a feature-scope problem. The required corrections below are implementation invariants already implied by the approved PRD/UX. Two product choices remain genuine blockers and must not be silently selected by engineering: text/edit-delete conflict policy and multi-word search semantics.

Severity count:

| Severity | Count | Meaning |
| --- | ---: | --- |
| Critical | 2 | Plausible loss/corruption of the only account dataset or an unusable backup |
| High | 7 | Cross-unit incompatibility, incorrect approved behavior, or privacy exposure |
| Medium | 3 | Ambiguous contract likely to produce divergent implementations or false behavior |

## Two literally compliant but incompatible downstream units

The following pair demonstrates why the current rules are insufficient.

| Unit | Literal implementation |
| --- | --- |
| **Unit A — owning domain/persistence modules** | Challenges retains one daily row when Done is removed so its journal survives; the row has one row version. Notes and each other owner module expose a versioned backup fragment when called. Every mutation carries a command UUID, base row version and data epoch. After commit it emits a private invalidation containing the changed resource ID/version/epoch. Search indexing uses a local interpretation of “canonical Vietnamese normalization.” |
| **Unit B — composition/client/backup integration** | Today and Calendar are read-only and query owner tables through authenticated server API code; they treat existence of a daily row as a Done icon. The client invalidates only the query whose resource ID appears in a realtime event. Backup calls each owner exporter sequentially and assembles the fragments. Restore sets an account fence before replacement; ordinary repositories assume the application layer already checked the fence/epoch. Search query normalization uses a different PostgreSQL expression that is also case/accent insensitive for its own test cases. |

Both units preserve one deployable, call APIs rather than browser table writes, keep module mutation ownership, use versions/epochs, use realtime only as invalidation, derive projections, and use PostgreSQL search. They are still incompatible:

1. An undone daily row with a retained journal appears as Done in Calendar.
2. A cross-module page can combine challenge and event facts from different database snapshots.
3. A note save admitted just before the restore fence can commit after the restored dataset.
4. A multi-module export can contain facts from different moments and fail its later import.
5. A daily journal edit can cause a false completion conflict or be erased by a completion update.
6. A Done event can leave Today, Calendar, progress and search-derived views stale because the event names only the directly changed row.
7. Index and query normalization can disagree while each is described as “canonical.”

The proposal companion contains useful details for several of these seams, but the spine is the binding coordination artifact. A non-binding explanation in the proposal does not prevent independent downstream choices.

## Finding summary

| ID | Severity | Missing or weak rule | Required action |
| --- | --- | --- | --- |
| AS-01 | Critical | Restore fence is not atomic with admission of ordinary writes | Tighten AD-6/AD-9 with one database write-gate protocol |
| AS-02 | Critical | Export consistency and canonical snapshot contract are absent | Add a single-snapshot export and module snapshot-port rule |
| AS-03 | High | Module ownership protects writes but not read shapes | Tighten AD-4: private persistence, typed cross-module query ports |
| AS-04 | High | Daily completion and journal share an undefined concurrency boundary | Add explicit logical versions and field-specific mutation rules |
| AS-05 | High | Essential invariants are not required at the database boundary | Add a database-enforced invariant AD |
| AS-06 | High | Realtime does not guarantee cache fan-out or recovery from a missed event | Tighten AD-8 with account revision, handshake and fallback |
| AS-07 | High | AD-5 and AD-12 disagree on direct backup transfer; privacy controls are incomplete | Define API control plane, private data plane and cache/CSRF rules |
| AS-08 | High | One request can use multiple valid server times; event input zone is ambiguous | Tighten AD-2/AD-11 with one AccountTimeContext and instant conversion contract |
| AS-09 | High | Goal-period ordering/pending/archive semantics are not normative | Add a canonical target-timeline rule |
| AS-10 | High | Content conflict aggregate and edit-vs-delete behavior remain undecided | Product decision required, then adopt a conflict matrix |
| AS-11 | Medium | Idempotency-key scope, replay and atomic storage are undefined | Tighten AD-6 with a command ledger contract |
| AS-12 | Medium | Search normalization is named but not executable; multi-word behavior is open | Bind index/query to one routine; decide D-06 before implementation |

## Detailed findings

### AS-01 — A stale write can commit after restore

**Severity: Critical — data loss/corruption**

**Adversarial construction.** The Notes use case reads account epoch 7 and sees the write fence open, then begins a slower save transaction. The Backup use case subsequently acquires the fence, restores the snapshot, increments to epoch 8 and releases the fence. The Notes repository commits the previously admitted epoch-7 save after restore. It carried epoch 7 as AD-6 requires, but no spine rule requires the repository to lock and re-check it in the same transaction that changes the note.

AD-9 says to acquire an account-wide fence and says old clients must stop retries after the new epoch. That does not cover an in-flight server transaction, a check-before-transaction race, or a server process dying after setting the fence. PRD FR-046 and AC-044 require the other device to update before writing after restore; they do not allow an admitted stale transaction to escape the fence. UX PF-10 and AX-08 require the same.

**Exact tightening for AD-6/AD-9:**

> Every product-write database transaction MUST acquire and hold the same account write-gate lock before reading the gate or mutating product state. While holding that lock it MUST derive owner identity from the verified session and verify write_state = open and request data_epoch = account_state.data_epoch. Starting restore MUST acquire the same lock, wait for already admitted writers to finish, durably bind write_state = restoring to one import_operation_id, and only then allow replacement to begin. Restore success MUST replace facts, increment data_epoch, mark the operation succeeded, and reopen the gate atomically. A known failure MUST preserve the prior facts and durably mark the operation failed before reopening. No transaction admitted under epoch E may commit after epoch E+1 becomes visible. Recovery after process death is idempotent by import_operation_id; elapsed time alone never clears a fence.

Use one concrete PostgreSQL locking protocol in every repository adapter. For this one-account MVP, serializing writes on the account-state row is an acceptable simple implementation.

### AS-02 — A successful export can be internally inconsistent and later unusable

**Severity: Critical — backup may not restore the exported dataset**

**Adversarial construction.** Notes exports notebooks, then a concurrent note move commits. Challenges exports daily records, then a target replacement or archive commits. Calendar exports events last. Each module returns a valid fragment and Backup correctly creates a versioned snapshot. The assembled file can nevertheless contain a note linked to the wrong/missing notebook or facts evaluated against different target timelines. A strict importer rejects it; a permissive importer silently changes meaning.

AD-9 specifies atomic import only. AD-4 says Backup orchestrates snapshots but does not define one database snapshot, authoritative fields, module fragment schemas, or which operational metadata must not be restored. This violates the recoverability intent of FR-040–045, NFR-008 and AC-031/042/043.

**New/tightened rule wording:**

> Backup owns one canonical, versioned snapshot manifest. Export MUST obtain all module fragments through typed snapshot ports that share one read-only PostgreSQL REPEATABLE READ transaction, one captured data_epoch/account_revision and one schema version. The snapshot contains exactly the authoritative product facts required by FR-040; derived progress, streaks, calendar icons, authentication credentials, draft state, restore locks, operation rows and idempotency ledger rows are not backup authority. The assembled export MUST pass the same complete schema, referential and domain-invariant validation used before import before a download is offered. Import MUST re-read the confirmed object by its bound fingerprint, validate it again, and invoke module restore ports inside the one replacement transaction. Restored facts receive valid versions under the newly incremented current epoch; the epoch from the file is never installed as the current epoch.

The snapshot schema must define nullability, ID/relationship representation, date/instant encoding, supported-version policy and completeness for every FR-040 fact. This is an architecture contract, not a new product feature.

### AS-03 — Read-only modules can legally misinterpret owner data

**Severity: High — approved Done/history views can disagree**

**Adversarial construction.** Challenges retains a daily record with is_done = false when Done is removed so the journal survives, as FR-012 requires. Calendar is a read-only composer and directly queries challenge_daily_records; it interprets row existence as Done. It has not created a second writer or duplicated stored progress, so it obeys AD-3/AD-4 literally, yet it shows a ghost icon contrary to FR-034 and AC-030. The same shape leak can affect Today, Backup and future query implementations.

AD-4 defines mutation ownership but does not make persistence private or define public read semantics. AD-3 says to use one domain engine for projections but does not state how another module obtains those projections.

**Exact tightening for AD-4:**

> A module's tables, ORM schema and repositories are private implementation details of that module. Non-owner modules MUST NOT import its repository or query its tables/views directly. Cross-module reads use typed, versioned application query ports/DTOs that define identity, units, nullability, account date/time semantics and source version. Today and Calendar consume an explicit challenge completion projection containing isDone; row existence is never a completion signal. Multi-module read models that require an internally consistent response share one database read snapshot and one AccountTimeContext. Backup is the only orchestration exception and accesses facts only through module snapshot ports.

This also makes the API statement “DTOs, not arbitrary rows” enforceable inside the monolith, not only at the browser boundary.

### AS-04 — Completion and journal updates have no compatible version contract

**Severity: High — false conflicts or journal loss**

**Adversarial construction.** A daily record has one row_version. Device A edits the journal, incrementing it. Device B sends Done based on the prior row version. One implementation treats any stale daily-row version as completion_conflict, although completion never changed. Another implementation lets the Done through and writes the stale whole-row snapshot, erasing A's journal. Both can claim a versioned mutable resource and desired-state mutation under AD-6. Neither contract satisfies all of FR-010, FR-012, FR-043 and AC-039–041.

**Exact tightening for AD-6:**

> Daily completion and daily journal are separate logical mutation components even if stored in one physical row. The completion command carries the observed completion state and completion_version (or an equivalent field-specific compare-and-set token), writes only is_done, and never writes or deletes journal content. If the saved completion already equals the requested desired state, return idempotent success even when an unrelated journal version changed. Return completion_conflict only when completion changed to the opposite state after the client's observation. Journal commands write only journal content and carry their own content version governed by the adopted conflict matrix. Every daily-record DTO returns the versions needed by both commands. Done, undo and conflict resolution MUST preserve journal content.

The selected representation may use two physical version columns or an equivalent database compare-and-set design, but the observable rules above must be shared.

### AS-05 — Application checks alone cannot preserve core relational invariants

**Severity: High — corrupt facts can enter through races or restore**

The spine names entities and domain validation but does not require database constraints. Independent repositories can therefore use check-then-write logic that fails under concurrency: two first-time Done inserts, deletion of a notebook concurrent with a note move, two default notebooks after restore, cross-owner notebook/note relationships, two future targets, or an event whose end is not after its start.

These are not optional implementation details. They support FR-009, FR-024–028, FR-032, FR-040–045, NFR-003/007/008 and their acceptance tests.

**Proposed new AD — Database-enforced irreducible invariants:**

> PostgreSQL is the final guard for invariants representable by keys, foreign keys, uniqueness and checks; application pre-reads are not sufficient. Migrations MUST enforce owner-compatible parent/child relationships, exactly one account-state row, at most one default notebook plus transactional creation/restore of exactly one, note-to-notebook ownership with delete restriction, unique (challenge_id, local_date), target_days from 1 through 7, unique ordered target effective dates and at most one pending target, archive/start bounds, and event ends_at greater than starts_at. Versioned updates/deletes MUST include owner and expected version in the SQL predicate and verify one affected row. Restore runs with the same constraints enabled and may not install facts that normal product commands could not represent.

Where PostgreSQL cannot express “exactly one” with a simple constraint, use a transactionally maintained account reference, deferred constraint, or reviewed trigger rather than only a UI check.

### AS-06 — Realtime invalidation does not guarantee dependent-view convergence

**Severity: High — two online devices can remain inconsistent**

**Adversarial construction.** Challenges commits a Done and broadcasts the daily resource ID/version/epoch. The client invalidates the challenge-day cache named by that resource, exactly as AD-8 permits. Today progress, challenge streak, Calendar icons and +N are different query keys, so they remain stale. Alternatively, a focused online device misses the best-effort event and never triggers the stated focus/reconnect recovery path.

FR-002, FR-023, NFR-006, AC-002/040 and UX §8.5 require all related views to converge. AD-8 lacks a canonical envelope, a cross-query dependency rule, an initial subscription handshake and an active fallback for lost events.

**Exact tightening for AD-8:**

> Every committed product mutation increments one monotonically increasing account_revision exactly once in the same database transaction; restore also changes data_epoch. A canonical private invalidation envelope contains schemaVersion, owner-scoped channel identity, dataEpoch, accountRevision, resourceType, resourceId, mutationId and event kind, and never contains personal content. Delivery may be duplicated, delayed, out of order or missed. For MVP, receipt of any higher account revision invalidates all owner-scoped server-query caches; a higher data epoch invalidates all server state and stops dirty-draft retries as AD-9 requires. Dirty editor text remains protected by AD-7. Clients subscribe before their reconciliation fetch and repeat that handshake on reconnect. On focus and on a periodic check while the app remains visible, clients compare account revision/epoch and refetch when newer. Unknown event schemas trigger full invalidation rather than being ignored.

No product SLA is added: DEP-006 still governs an acceptance threshold. The rule establishes eventual recovery when delivery is missed.

### AS-07 — API-only writes and direct Storage transfer conflict; private-data controls are incomplete

**Severity: High — privacy exposure and unauthorized restore input**

AD-5 says all product reads/writes go through authenticated NoteFlow API use cases. AD-12 requires browser-to-Storage backup transfer. One security unit can deny all browser Storage access to obey AD-5 while the backup unit depends on signed browser access to obey AD-12. The spine does not distinguish authorization/control plane from byte-transfer data plane.

It also does not bind cookie-authenticated unsafe requests to CSRF/same-origin checks, prohibit shared caching of personal Next.js responses, bound malicious backup payloads, define object retention, or require safe rendering of search snippets/user text. NFR-007 and AC-001 include direct-resource access, and a backup contains the entire private dataset.

**Exact tightening for AD-5/AD-12 or a new private-data AD:**

> The authenticated NoteFlow API is the sole authorization/control plane and the sole writer of live product facts. Browser transfer of backup bytes is a narrow data-plane exception: the API may issue a short-lived signed handle bound to the verified owner, one operation, one random object key and one transfer method. Browser roles cannot list the private bucket, choose an arbitrary server object, confirm/start restore, or read another owner's object. The server binds object key, expected size and cryptographic fingerprint to the operation and re-verifies all three before use. Upload parsing is strict and bounded by configured byte, nesting, collection and text limits; transport artifacts are deleted by a documented retention rule. Signed URLs, tokens and backup content are never logged.
>
> Every API/page request derives owner only from a server-verified provider subject and ignores owner identity supplied by the browser. Cookie-authenticated unsafe methods enforce same-origin and CSRF protection. Personal API/page responses are private and no-store unless a cache is explicitly owner-keyed and proven isolated. Realtime authorization binds the provider subject to the exact private account channel. User-authored title/body/journal/description and search snippets are returned and rendered as text, never trusted HTML.

This rule does not add sharing, encryption UI or attachment support.

### AS-08 — Valid server-side clocks can still disagree within one response

**Severity: High — wrong day/week/event membership near a boundary**

**Adversarial construction.** Today captures “today” at 23:59:59 in the account timezone, then Challenges and Calendar independently ask the server clock after midnight. All code is server-side and uses the fixed IANA zone, satisfying AD-2. The composed response can nevertheless show yesterday's heading with today's completion eligibility or event interval. A second ambiguity exists when a browser converts an account-local event form using its device timezone before sending an RFC 3339 instant.

This threatens FR-006, FR-011, FR-016–023, FR-032–038, AC-005/027 and UX AX-07.

**Exact tightening for AD-2/AD-11:**

> Each application use case captures one authoritative instant once and derives one immutable AccountTimeContext containing IANA timezone, account today, Monday week start and relevant UTC day boundaries. Every participating domain/query module receives that context; domain code and SQL MUST NOT independently call system time, database CURRENT_DATE, or device timezone. Today/Calendar composition also uses one database read snapshot. Event mutation contracts represent an instant unambiguously: account-local form values are converted using the configured account timezone by shared server code, never the device timezone, and the API returns canonical RFC 3339 UTC instants plus the account zone needed for display. Any ambiguous or nonexistent local wall time must follow one documented validation policy before a DST-observing timezone is allowed.

The concrete timezone value remains DEP-002/D-01.

### AS-09 — Target timeline has no normative interval/pending-state semantics

**Severity: High — historical progress and streak can diverge**

AD-3 says to persist a target timeline; AD-11 says goal-effective values are local dates. Neither says how a target is selected for a date, how “one pending target” is enforced, or exactly which rows survive archive. A target-command unit can store inclusive start/end periods while the streak unit resolves greatest effective_from; both are plausible under the spine and can disagree at a Monday boundary or after archive/restore.

This is already fixed at product level by FR-015, FR-020–023, FR-042 and AC-019–022/035–038; the storage/query contract is missing.

**Proposed new/tightened rule:**

> A challenge target timeline is an ordered set of account-local effective_from dates. The target for date D is the row with the greatest effective_from less than or equal to D; no independently persisted effective_to or current-target copy is authoritative. The initial target is effective on start_date. Target days are integers 1 through 7 and effective_from is unique per challenge. For an active challenge, at most one row may be future relative to the command's AccountTimeContext; create/replace/cancel of that pending row is one versioned transaction and its effective date is the next Monday. Archive keeps rows effective on or before archived_on and removes a still-future pending row in the archive transaction. All history, backup and restore use this same resolver.

This does not decide the still-open ability to choose/edit start dates outside today's default.

### AS-10 — Content conflict and edit-vs-delete are still a binding-contract blocker

**Severity: High — Product Owner decision required**

The spine correctly lists whole-note versus field-level conflict and edit versus delete as deferred, but AD-6/AD-7 already present themselves as coordination rules. A Notes API can version title/body together while an autosave client patches them separately. One implementation can return a complete note conflict; another can merge non-overlapping fields. A stale edit after remote hard delete can be 404, a conflict snapshot, a recreated note, or a copy. All choices fit the current text, while UX §16 and PRD §13.4 explicitly prohibit silently selecting one.

The same inventory question exists for journal, event description, challenge metadata and notebook names; FR-004's “same content” scope is not fully enumerated.

**Required rule before affected implementation stories:**

> Maintain a normative conflict matrix for every mutable API aggregate. Each row defines the protected fields, logical version token, stale-write response, user-visible resolution payload, resolution command, and edit-versus-delete outcome. No mutable endpoint is implementation-ready without a row. Completion state follows FR-043 and AS-04. Content rows remain PROPOSED until Product Owner decision D-05 is adopted.

If the proposal's recommended D-05 is approved, use this exact Notes rule:

> Note title and body form one whole-note content aggregate; notebook move is a separate versioned command. A content conflict returns the complete current saved title/body/version and the complete proposed title/body so the user can choose one whole snapshot. Choosing local resubmits against the returned current version; choosing remote discards the local draft only after the explicit choice. A newer intervening write causes a new conflict. Remote hard delete wins: the client retains the draft only in session, stops retry, and never recreates or copies it automatically.

Do not mark that paragraph ADOPTED without the Product Owner's D-05 decision.

### AS-11 — “Idempotency key” has no shared replay semantics

**Severity: Medium — duplicate mutation or incompatible retry response**

AD-6 requires a UUID/idempotency key but does not say whether the resource UUID is the command key, what namespace is unique, whether a retry replays the first response, or what happens if the same key carries a different payload. Notes can deduplicate by resource ID while Challenges deduplicates per endpoint and Backup uses operation ID; clients cannot implement one safe retry policy.

**Exact tightening for AD-6:**

> Resource identity and command identity are distinct values. Every mutation has a client-generated command_id. The server stores a command record uniquely by (owner_id, data_epoch, command_id), including command type, canonical request hash, target identity, terminal status and replayable result/error, in the same transaction as the state change. Repeating the same key and same canonical request returns the stored outcome without another mutation. Reusing the key with a different request returns a typed idempotency_key_reused conflict. No successful command record is purged within the documented maximum retry window; the MVP has no persisted browser retry queue. Backup import operation identity additionally follows AD-9.

This contract should be reflected in API tests for create, Done/undo, archive, move/delete and restore confirmation.

### AS-12 — Search “canonical normalization” is not a shared executable contract

**Severity: Medium — valid saved notes can be omitted**

**Adversarial construction.** The note-save adapter lowercases and removes Unicode combining marks in application code. The query adapter uses PostgreSQL unaccent and simple text search. Both implementations are described as Vietnamese case/accent-insensitive, but they can disagree on precomposed/decomposed characters, đ/Đ, punctuation or collation. AD-10 calls the process canonical without defining a single implementation used on both sides.

The exact multi-word operator is intentionally open in PRD §13.4 and UX §16. It must remain a Product Owner decision rather than emerging from the chosen PostgreSQL query constructor.

**Exact tightening for AD-10:**

> Index-time and query-time normalization MUST call the same versioned database routine and use the same fixed text-search configuration/collation. The routine's executable contract covers Unicode-equivalent input, lower-case behavior, Vietnamese diacritics including đ/Đ, and null/blank title. Owner filtering occurs in the indexed search query. Search results derive label/snippet from the same saved note version returned in the DTO, and snippets are plain text. A migration changing normalization rebuilds the index and increments the normalization contract version.
>
> Multi-word parsing/operator semantics MUST be named in AD-10 only after D-06 is adopted; until then the endpoint and acceptance test remain blocked rather than defaulting silently to AND, OR or phrase.

## Security, privacy and data-loss checklist

| Risk | Covered by |
| --- | --- |
| In-flight stale write survives restore | AS-01 |
| Export file is internally inconsistent or cannot be imported | AS-02 |
| Cross-module raw-table read exposes private shape and wrong semantics | AS-03 |
| Journal erased by Done/undo or false conflict | AS-04 |
| Race/restore creates orphan, duplicate Done or invalid event/target | AS-05 |
| Missed realtime event leaves two online devices divergent | AS-06 |
| Signed object grants too much access; personal response cached/shared; CSRF | AS-07 |
| Entire backup retained indefinitely or malicious file exhausts parser | AS-07 |
| Wrong account day/instant from device timezone or multiple clocks | AS-08 |
| Historical streak changes because target intervals are interpreted differently | AS-09 |
| Stale edit recreates deleted personal content or silently chooses a version | AS-10 |
| Network retry executes a command twice | AS-11 |
| Search snippet is rendered as HTML or normalization omits private saved content | AS-07, AS-12 |

Logging redaction in the current spine is good and should remain. It should be extended to signed backup URLs/object keys if those can grant or help locate access.

## Gate conditions

The spine can pass this review when:

1. AS-01 and AS-02 are added as binding restore/export rules.
2. AD-4, AD-6, AD-8, AD-10 and AD-11 are tightened with the exact cross-unit contracts above.
3. A database-invariant rule and private-data-channel rule are added.
4. Product Owner decisions D-05 and D-06 are recorded before the affected endpoints/stories are implementation-ready; their unresolved state must remain explicit meanwhile.
5. Integration tests are traceable to the rules: restore/write interleaving, consistent export under concurrent mutation, undone journal row versus Calendar, concurrent journal/Done, missed/duplicate/out-of-order invalidation, owner/storage isolation, and shared normalization.

No finding requires microservices, a broker, offline support, collaboration, richer note content or another feature outside the approved PRD.
