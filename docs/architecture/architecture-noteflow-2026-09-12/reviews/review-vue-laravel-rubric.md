# Vue/Laravel spine review — rubric and source reconciliation

Date: 2026-09-13. Reviewed the updated spine against PRD v1.1, Project Brief v1.3 and UX Specification; the companion proposal is being edited and is outside this review.

**Verdict:** No critical/high source conflict or scope expansion found. Two small binding-seam clarifications should be applied before handoff. The adopted Vue/Laravel/PostgreSQL, same-origin Sanctum and revision-polling direction is consistent with the owner's latest instruction; exact product values remain open.

## Findings

### R-01 — Medium: bind quick-note creation and label semantics across API/UI

- Evidence: UX-03, UX §8.2 and AX-05 explicitly permit empty titles, derive a label without writing it as the title, and require closing a pristine new editor not to create a saved empty note. Existing saved notes must survive clearing all their text.
- Spine gap: AD-7 handles draft ordering and AD-13 handles notebook constraints, but neither binds these creation/validation semantics. AD-10 requests a label without specifying its canonical derivation. A Laravel request validator and Vue quick-create command could independently choose incompatible empty-title or create-on-open behavior.
- Action: **autofix** by adding an AX-05-bound rule: a pristine new note stays a client draft until first content; empty title/body individually are valid; existing all-empty notes are retained; display label uses explicit title, otherwise first nonblank content line, otherwise “Không tiêu đề”, and never persists that fallback into title. Keep unspecified length/duplicate-name policies deferred.

### R-02 — Medium: make the client response to restore write_state explicit

- Evidence: FR-046 and UX loading/error tables require both devices to block changes during import and resolve an unknown import outcome before editing resumes.
- Spine gap: AD-8 polls write_state and AD-9 securely fences server writes, but AD-8 explicitly describes revision/epoch cache responses without explicitly binding the UI to write_state. A client could keep interactive save controls and repeatedly send rejected writes throughout a known restore.
- Action: **autofix** AD-8: a non-open write_state immediately disables product mutations and pauses draft saves; query the bound operation until its outcome is known; resume only after the account state and dataset have been reconciled. This is existing PRD behavior, not a new feature or a requirement for zero-latency polling.

## Rubric assessment

- Real divergence points: transaction owner, account clock, module data ownership, versions/idempotency, export snapshots, restore fencing, route ownership and API schema ownership are explicit.
- Enforceability: AD rules have concrete runtime/database/client mechanisms. Independent completion/journal versions preserve FR-043 and journal retention.
- Capability coverage: all six Epics are mapped; search remains saved notes only; event/Done independence and account-local dates are retained.
- Scope: no multi-account admission, public signup, offline durability, rich text, reminders, external calendars or per-item restore introduced. Object storage, command ledger and scheduler are implementation mechanisms for approved backup behavior.
- Decisions: draft metadata and open product dependencies are appropriate; technology direction is adopted without implying implementation authorization. Login UX/session duration, provider/budget, timezone, field limits, conflict semantics and acceptance thresholds remain visibly open.
- Deferred risks: unresolved conflicts/search/field limits can affect separately implemented units; opening paragraph correctly prevents affected implementation before these inputs are resolved. The 5-second initial polling interval is explicitly not an approved synchronization SLA.
- Operational envelope: same-origin routing, staging isolation, secrets, connection sizing, backup timeout/lease coordination and object cleanup are covered. Provider cost is intentionally open.
- Current technology: version verification is assigned to the separate current-tech review; this review makes no independent current-release claim.
- Brownfield: documentation-only change; no existing application code is ratified or contradicted.

No user decision is required for R-01 or R-02; both restate approved source behavior. Product questions already under Deferred should remain there.
