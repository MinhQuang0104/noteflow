# Story 1.6 V4 recovery and continuation plan

**Goal:** Remove the verified V4 metadata deadlock, prevent its recurrence, and resume Story 1.6 in `.worktrees/story-1-6` using fresh evidence.

**Architecture:** Preserve the original failed transaction and its fingerprint. Retire only a demonstrably unwritten metadata transaction through an explicit, fingerprint-bound recovery operation; archive its journal and owned lock. A new verification transaction uses a corrected Plan template and independently executed checks/review. Product code, AC-1..AC-4, and Human Gate remain authoritative.

**Tech stack:** Node.js built-in test runner, Git, existing V4 Runner/kernel/transaction engine.

**Spec:** `AGENTS.md`, `.agents/skills/v4-story-runner/actions/verify-slice.md`, `.agents/skills/v4-story-runner/references/recovery.md`, and the canonical Story/Plan for 1.6.

## Audit at a9e065593c1bbc24582005a7c954d8e77da56e6d

- Canonical V3 pointer is IDLE; the Story worktree and index are clean. A/B/C are reviewed, D is checkpointed, E is pending. Plan is READY, with `verify_slice:D` next.
- Transaction `story-1-6-D-verify-map-refresh-a9e0655` is RECOVERY_REQUIRED with SUCCESSOR_PROJECTION_MISMATCH. Its own lock remains present. D verification/review receipts are absent and HEAD has not moved.
- F1: the supplied verification template retained `verify_slice:D`, while the deterministic successor is `implement_slice:E`. The template must project CURRENT_SLICE/NEXT_ACTION_KIND/NEXT_ACTION_TARGET from the prepared action.
- F2: metadata construction/semantic validation occurs after acquiring the lock and setting the mutation flag. A pure template error therefore leaves a recovery transaction despite no metadata write.
- F3: recovery overwrites the last metadata phase with RECOVERY_REQUIRED. Pre-commit recovery consequently treats existing metadata as unrelated dirt; it can also try to rebuild from a null verification outcome. Only after-commit recovery currently has a regression test.
- F4: the original review input is not durable. It cannot be reconstructed from the journal fingerprint. Do not fabricate its receipt or rebind the old transaction to new review content.
- Canonical verification coverage remains INCOMPLETE for dependency-only/unmapped sync paths. This is a disclosed coverage limitation, not a reason to relabel evidence PASS or edit feature maps.
- AGENTS.md and V4 kernel match canonical main; V3 policy and story-development copies differ. No V3 execution is required and those ignored/local policy copies will not be updated as a substitute for canonical policy.

## Constraints

- All tracked changes and commits belong to `codex/story-1-6` in the Story worktree.
- Preserve original journal/fingerprint and lock bytes in an immutable recovery archive. Never delete a foreign lock or manually rebind a transaction.
- Recovery abort writes no Story/Plan/receipt/product files, creates no Git commit, and never claims successful review.
- Abort requires exact transaction/worktree/checkpoint, IDLE pointer, no staged files, unchanged metadata, and explicitly listed V4 maintenance paths only. Bind the observed journal, lock, pointer, and maintenance snapshots to the preview.
- Each Runner invocation performs one bounded operation and does not execute its successor. Finalization, when eligible, stops at Human Gate.

## Task 1: Prevent and reproduce metadata failures

Files: `.agents/scripts/v4-slice-transaction.mjs`, `.agents/scripts/v4-verification-flow.test.mjs`.

- [ ] Add a regression using a literal wrong successor. Assert no journal/lock, no receipts, unchanged HEAD/index after rejection.
- [ ] Add interruption tests after metadata write and stage, including tampered receipt rejection and no replay after completion.
- [ ] Run `node --test .agents/scripts/v4-verification-flow.test.mjs` to demonstrate failures.
- [ ] Build and validate metadata before acquiring a new transaction lock; recheck scope under the lock.
- [ ] Preserve the resume phase and hashes of candidate metadata. Recover existing complete files without rebuilding verification, and reject partial/tampered content.

## Task 2: Retire the unwritten legacy transaction safely

Files: `.agents/scripts/v4-metadata-recovery.mjs`, `.agents/scripts/v4-story-runner.mjs`, `.agents/scripts/v4-verification-flow.test.mjs`, `.agents/skills/v4-story-runner/references/recovery.md`.

Interfaces: `prepareMetadataAbort(root, request)` returns READY plus a fingerprinted preview; `applyMetadataAbort(root, request)` requires that preview and `recovery_authorized: true`. Runner operations are `prepare-recovery-abort` and `abort-unwritten-metadata`, restricted to the current verify_slice identity.

- [ ] Test legacy SUCCESSOR_PROJECTION_MISMATCH retirement through Runner with real Git fixtures. Assert original journal/lock bytes archived, journal terminal ABORTED, no HEAD/index/product mutation, and safe idempotence.
- [ ] Test unauthorized/stale input, wrong checkpoint/owner, dirty product/metadata, and interruption during lock archival. All invalid inputs must preserve the observed state.
- [ ] Add the bounded recovery helper and Runner routing. Keep ABORTED transaction IDs terminal.
- [ ] Run targeted tests and inspect the exact infrastructure diff.
- [ ] Prepare and apply recovery for the approved transaction at a9e0655; only listed maintenance files may be dirty. Archive the owned lock by rename after terminal journal persistence.
- [ ] Commit only tested infrastructure changes and this audit/plan; retain product code byte-for-byte.

## Task 3: Resume D from fresh verification and review

- [ ] Generate a fresh D verification request from the current Plan with dynamic successor fields. Save the request, prepared preview, pending evidence, and review input under ignored `test-results/story-1-6-v4-recovery/` so a retry does not depend on conversation memory.
- [ ] Run canonical verification on both D paths, focused sync/draft/editor/API tests, and required static checks. Preserve raw INCOMPLETE and its disclosure.
- [ ] Review the exact D diff and consumers against T-6 and HIGH-risk invariants; answer the exact pending questions using observed evidence.
- [ ] Persist D verification/review via Runner, then check READY Plan, immutable receipt digests, exactly three metadata commit paths, clean worktree, and `implement_slice:E` successor.
- [ ] Report E's remaining T-7/T-8 browser, accessibility, and full-suite obligations. Do not manufacture manual screen-reader evidence or Human Gate approval.

## Verification and outcomes

### 2026-10-03 recovery results

- RED: three representative regressions failed on the original implementation: a malformed successor stranded a journal, recovery after write returned DIRTY_SCOPE_MISMATCH, and the Runner lacked an unwritten-retirement operation.
- GREEN: `node --test --test-reporter spec .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-story-runner.test.mjs .agents/scripts/v4-action-kernel.test.mjs` passed 43/43 tests (417 seconds).
- The actual approved transaction was retired through Runner at a9e0655. Sandbox initially denied writing Git metadata (EPERM); the authorized elevated invocation succeeded. No product, Plan, receipt, index, or HEAD change occurred.
- Original journal and lock hashes match the immutable `retired-story-1-6-D-verify-map-refresh-a9e0655/` archive in the common Git transaction directory. Original journal is terminal ABORTED with its original fingerprint retained; active scope lock is absent. Plan still validates READY / verify_slice:D.
- Recovery request/preview/result artifacts are retained under ignored `test-results/story-1-6-v4-recovery/` in this worktree.

### Additional product audit findings (T-6)

- D-F1 VALID/HIGH: an actual rejected journal refetch arriving after logout/reset changes sync state from idle back to error and restores pending convergence. The refetch success path checks the captured auth generation; its inner rejection path does not. Reproduced against unchanged product source in `frontend/test-results/story-1-6/sync-audit.spec.ts`.
- D-F2 VALID/MEDIUM: journal refetch rejection after going offline replaces paused state with error. Reproduced in the same audit fixture.
- D-F3 VALID/MEDIUM: after correcting the probe to await the async ACK result, deferred journal invalidation completion reproducibly changes an offline view from paused to synced. Both ACK outcomes require lifecycle guards and a valid retry must still converge.

These findings supersede immediate approval of D in Task 3. The user's audit/fix/continue request authorizes a focused T-6 correction. Preserve the prior D implementation receipt/checkpoint as historical evidence, amend only D's execution projection to a pending correction, and keep E pending. Run the corrected implementation as a fresh bounded V4 action with a distinct implementation receipt path; then verify/review that new checkpoint separately.

Correction scope is only `frontend/src/stores/sync.ts` and `frontend/src/stores/__tests__/sync.spec.ts`: fence both outcomes of refetch against auth/request/epoch changes; preserve paused state on hidden/offline transitions; keep convergence pending until a valid visible/online retry. Add deferred-promise regressions for those outcomes and retain existing QueryObserver/draft/ACK tests. Do not alter API, dialog behavior, account/auth modules, or requirements.
