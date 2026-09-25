---
story_id: "2.3"
title: Ghi và sửa journal tùy chọn
status: in-progress
---

# Story 2.3: Ghi và sửa journal tùy chọn

## Story

<!-- v4:story:start -->
As a chủ tài khoản, I want ghi journal cho một ngày challenge, So that tôi lưu bối cảnh khi cần.
<!-- v4:story:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY; the approved Story 2.3 dependency is satisfied for implementation.
- dependencies: Story 2.1, recorded done in sprint-status.yaml and implemented on main.
- prerequisites: Story 1.2 owner authentication and Story 1.3 server-derived account-local day are completed foundations used by Story 2.1 and this journal flow.
- scope: FR-010 and UX-DR8/UX-DR9 as mapped by the approved Epic 2 Story 2.3 source.
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: **Given** ngày hợp lệ **When** lưu/sửa journal **Then** journal gắn đúng challenge/ngày.
- AC-2: **Given** ngày chưa Done **When** chỉ lưu journal **Then** trạng thái và tiến độ không đổi.
- AC-3: **Given** completion và journal đổi độc lập **When** lưu một component **Then** component còn lại không bị sửa hoặc conflict giả.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [x] T-1 [AC-1, AC-2, AC-3]: Persist owner-scoped challenge daily journal data and the SaveJournal application path for a valid active account-local day.
- [x] T-2 [AC-2, AC-3]: Keep journal writes independent of completion and progress, with separate logical versions, stale conflict, replay, and account write fences.
- [x] T-3 [AC-1, AC-2, AC-3]: Expose owner-scoped journal read/write through the challenge HTTP API and versioned OpenAPI contract, with boundary and contract tests.
- [ ] T-4 [AC-1, AC-2, AC-3]: Generate frontend contract types and provide a typed challenge journal API client.
- [ ] T-5 [AC-1, AC-2, AC-3]: Add the optional journal flow in Today and Challenge UI and collect acceptance evidence for the three ACs.
<!-- v4:tasks:end -->

## Dev Notes / Implementation Notes

<!-- v4:risk:start -->
- classification: HIGH — owner security, concurrent versioned writes, and public API/OpenAPI contract.
- invariant: Journal reads and writes remain scoped to the authenticated owner and one challenge/account-local day; active valid days use server-derived account-today.
- invariant: Journal writes do not change completion or progress; journal and completion keep independent logical versions, so changing one cannot create a false conflict for the other.
- invariant: A stale journal write conflicts without replacing saved text; an identical command retry replays its prior outcome without another mutation.
- invariant: Journal writes retain the account lock, data epoch, and write-state fence; journal content must not leak through logs or errors.
- boundary: Whitespace-only journal text is invalid; no clear/delete behavior or arbitrary length limit is introduced.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-23-ghi-và-sửa-journal-tùy-chọn
- product: docs/product/prd.md#fr-010
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-2--server-authoritative-account-clock-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-4--modules-own-data-and-mutations-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
- ux: docs/ux/ux-spec.md#52-challenge-và-hôm-nay
- ux: docs/ux/ux-spec.md#84-challenge-biểu-mẫu-và-hành-động-có-hậu-quả
<!-- v4:references:end -->

## Dev Agent Record

<!-- v4:completion:start -->
### AC Evidence / Results

### Completion Notes

### File List

### Change Log
<!-- v4:completion:end -->
