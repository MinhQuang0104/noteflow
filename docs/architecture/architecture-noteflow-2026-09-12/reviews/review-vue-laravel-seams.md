# Vue/Laravel adversarial seam review

Reviewed: ARCHITECTURE-SPINE.md, with targeted PRD/UX cross-checks. Scope: independently implemented browser/API boundaries. No application code reviewed.

## High — response fencing must cover all private requests

AD-8 explicitly protects polling response generations, but AD-7 accepts note ACKs by client revision and AD-14 clears only private query state on logout. Two compliant implementations can therefore retain a Pinia draft or accept an old note fetch/save ACK after logout or a restore epoch transition. Query invalidation alone does not prevent an already-running response from repopulating caches or marking an old draft saved. UX requires no private content to be shown to an unauthenticated viewer and no old draft retry after restore.

Required seam rule: all private fetches and mutation callbacks capture an authentication/session generation and data epoch; ignore callbacks when either no longer matches the active context. Cancel outstanding requests where possible, while treating cancellation as unrelated to server commit outcome. On explicit logout, warn about unsaved content per UX, then stop save/poll timers and clear both Pinia private drafts and query caches. On session expiry, hide private content and stop writes; any temporarily retained draft is inaccessible until authorization is re-established. On epoch change, quarantine unsaved drafts as UX specifies and do not rebase or replay them automatically. Include a delayed GET/ACK crossing logout or restore in the E2E strategy.

This is an implementation consistency/privacy gap, not a new product feature or a request to decide the already-open session duration or conflict granularity.

## Other boundaries

No additional critical/high finding. Same-origin Sanctum/CSRF routing, OpenAPI ownership, account write fencing, command replay, snapshot isolation and atomic restore are sufficiently explicit for a proposal. The polling interval/SLA, login method, field conflict matrix, search semantics, timezone and hosting budget remain explicitly open product decisions and are not treated as defects.
