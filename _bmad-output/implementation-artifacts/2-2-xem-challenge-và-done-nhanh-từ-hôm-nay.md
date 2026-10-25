---
story_id: "2.2"
title: Xem challenge và Done nhanh từ Hôm nay
status: ready-for-dev
---

# Story 2.2: Xem challenge và Done nhanh từ Hôm nay

## Story

<!-- v4:story:start -->
As a chủ tài khoản, I want xem tiến độ và Done tại Hôm nay, So that tôi ghi nhận hằng ngày bằng một thao tác.
<!-- v4:story:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY; owner chose risk HIGH, three slices (A backend Lead, B API/contract/client Lead, C Today UI AGY) and the API shape (extend GET /v1/challenges, Done via PUT completion) on 2026-10-25.
- dependencies: Story 2.1, recorded done in sprint-status.yaml and implemented on main.
- prerequisites: Story 1.2 owner authentication, Story 1.3 server-derived account day and week, and Story 2.3 daily records with independent completion and journal versions are completed foundations.
- scope: FR-009 and FR-037 for today only, with NFR-001 and NFR-003; UX-DR8 and UX-DR10. Backfill, undo, archive, streak and cross-device Done conflict resolution stay in Stories 2.4, 2.5, 2.6 and Epic 3.
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: **Given** challenge active **When** mở Hôm nay **Then** shared current-week projection trả số ngày Done và target hiện hành **And** UI hiển thị tên, Done/target tuần và trạng thái hôm nay mà không tự tính lại tiến độ.
- AC-2: **Given** hôm nay chưa Done **When** bấm Done **Then** ghi đúng ngày, không yêu cầu journal và hiển thị trạng thái save chính xác.
- AC-3: **Given** ngày đã Done **When** gửi Done lặp **Then** chỉ có một completion và tiến độ không tăng thêm.
- AC-4: **Given** request lỗi **When** server chưa xác nhận **Then** UI không báo Done đã lưu và cho retry.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1, AC-3]: Add the owner-scoped shared current-week progress query in the Challenges module: Done days of the account-local week (Monday–Sunday, from the challenge start date to account-today) and the target in effect, plus today's completion state and version.
- [ ] T-2 [AC-2, AC-3]: Add the MarkCompletion application path for account-today: account lock, open write state, data epoch, command ledger replay, completion-only writes with their own version, and same-result Done converging without a second completion or revision.
- [ ] T-3 [AC-1, AC-2, AC-3, AC-4]: Expose week progress and today state on GET /v1/challenges and Done on PUT /v1/challenges/{id}/completions/{date} through the versioned OpenAPI contract, regenerate frontend types, extend the typed challenge client, and cover the boundary with API and contract tests.
- [ ] T-4 [AC-1, AC-2, AC-3, AC-4]: Add the one-tap Done control to each Today challenge row showing name, Done/target this week and today's state from the server projection, with saving, saved, failed and retry states, and collect UI acceptance evidence.
<!-- v4:tasks:end -->

## Dev Notes / Implementation Notes

<!-- v4:risk:start -->
- classification: HIGH — owner security, concurrent versioned writes, and public API/OpenAPI contract.
- invariant: Progress is computed only by the shared backend projection; the UI renders projection fields and never derives counts from local state.
- invariant: A challenge counts at most one completion per account-local day; repeated or concurrent Done for the same day succeeds without another completion, version bump, or account revision.
- invariant: Done writes only is_done and completion_version; journal text and journal_version are never read for conflict or changed.
- invariant: Done keeps the account lock, data epoch, write-state fence, and command ledger; an identical retry replays the stored acknowledgement and a reused command ID with a different payload is rejected.
- boundary: This Story accepts Done only for account-today; other dates and is_done false are rejected with a field error and are left to Story 2.4.
- boundary: The UI shows Done as saved only after the server acknowledgement for that request; a failed or unconfirmed request keeps the previous state and offers retry.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-22-xem-challenge-và-done-nhanh-từ-hôm-nay
- product: docs/product/prd.md#fr-009
- product: docs/product/prd.md#fr-037
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-2--server-authoritative-account-clock-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-4--modules-own-data-and-mutations-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
- ux: docs/ux/ux-spec.md#52-challenge-và-hôm-nay
<!-- v4:references:end -->
