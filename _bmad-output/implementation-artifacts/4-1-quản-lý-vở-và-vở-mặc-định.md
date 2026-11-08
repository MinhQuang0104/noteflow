---
story_id: "4.1"
title: Quản lý vở và vở mặc định
status: in-progress
---

# Story 4.1: Quản lý vở và vở mặc định

## Story

<!-- v4:story:start -->
As a chủ tài khoản, I want tổ chức note trong các vở một cấp, So that knowledge có nơi lưu rõ ràng.
<!-- v4:story:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY; owner chose risk HIGH, two slices (A backend, API, contract and typed client Lead; B Notes notebook UI AGY), a minimal notes table in this Story, a renamable default notebook and duplicate names ordered by creation on 2026-11-08.
- dependencies: Story 1.4, recorded done in sprint-status.yaml and implemented on main.
- prerequisites: Story 1.2 owner authentication, Story 1.4 revision polling and refetch, and Story 2.1 account revision, data epoch, write state and command ledger are completed foundations.
- api: GET and POST /v1/notebooks, PATCH and DELETE /v1/notebooks/{id}; mutations carry command_id, data_epoch and, for rename and delete, base_version in the JSON body.
- scope: FR-024, FR-025 and FR-026 with UX-DR3 (notebook column of the Notes workspace) and UX-DR7 (notebook rules). Note title, body, create, edit, move, delete and search stay in Stories 4.2 to 4.6; restoring a backup stays in Epic 6 and must reuse the default-notebook constraint added here.
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: **Given** account mới/restore hợp lệ **When** mở Notes **Then** có đúng một vở mặc định được gắn nhãn và đứng đầu.
- AC-2: **Given** tên hợp lệ **When** tạo/đổi tên vở **Then** vở xuất hiện đúng một cấp.
- AC-3: **Given** vở mặc định hoặc vở còn note **When** yêu cầu xóa **Then** từ chối với lý do/action rõ.
- AC-4: **Given** vở không mặc định và rỗng **When** xác nhận xóa **Then** xóa và focus chuyển hợp lệ.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1, AC-3]: Add the notebooks table and a minimal notes table (id, owner_id, notebook_id, timestamps) with owner-compatible foreign keys, notes to notebooks ON DELETE RESTRICT, and a partial unique index allowing one default notebook per owner; create the default notebook named "Ghi chú nhanh" in the owner provisioning transaction and backfill it in the migration for every existing account.
- [ ] T-2 [AC-1, AC-2, AC-3, AC-4]: Add the Notes module notebook list query (default first, then created_at and id ascending, each with is_default, row_version and note_count) and the create, rename and delete-empty use cases under the account lock, open write state, data epoch, command ledger and base_version, rejecting deletion of the default or a non-empty notebook with a typed reason.
- [ ] T-3 [AC-1, AC-2, AC-3, AC-4]: Expose the notebook routes through the versioned OpenAPI contract with problem details for validation, stale version, stale epoch, write fence, idempotency reuse, notebook_is_default and notebook_not_empty; regenerate frontend types, add the typed notebooks client and cover the boundary with API and contract tests.
- [ ] T-4 [AC-1, AC-2, AC-3, AC-4]: Replace the /notes placeholder with the notebook column of the Notes workspace: default notebook first with the "Mặc định" label, one-level list, small create and rename forms with Lưu/Hủy and field errors that keep the input, a delete action that explains why the default or a non-empty notebook cannot be deleted, a confirm dialog focused on the safe action, and selection and focus moving to the notebook above after a successful delete; collect UI acceptance evidence.
<!-- v4:tasks:end -->

## Dev Notes / Implementation Notes

<!-- v4:risk:start -->
- classification: HIGH — new migration and relational constraints, owner security, versioned concurrent writes, and a public API/OpenAPI contract.
- invariant: Every owner account has exactly one default notebook; PostgreSQL rejects a second one and no API path can delete it or clear is_default.
- invariant: A notebook that still contains notes cannot be deleted; the use case rejects it and the foreign key restriction remains the final guard.
- invariant: Notebooks are one level; there is no parent reference and no nesting in data, API or UI.
- invariant: Every notebook mutation keeps the account lock, write-state fence, data epoch and command ledger; an identical retry replays the stored acknowledgement, a reused command ID with another payload is rejected, a stale base_version returns the current snapshot, and each real change advances account_revision exactly once.
- invariant: Names are trimmed, non-empty, at most 255 characters and may repeat; the default notebook may be renamed and keeps its label because the label comes from is_default, not from the name.
- boundary: All reads and writes are owner-scoped; another owner's notebook is not found.
- boundary: The UI shows an empty notebook state only after a successful load, never on a load error, and never reports a create, rename or delete as saved before the server acknowledgement.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-41-quản-lý-vở-và-vở-mặc-định
- product: docs/product/prd.md#fr-024
- product: docs/product/prd.md#fr-025
- product: docs/product/prd.md#fr-026
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-4--modules-own-data-and-mutations-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-13--relational-invariants-and-target-timeline-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
- ux: docs/ux/ux-spec.md#51-notes-workspace
- ux: docs/ux/ux-spec.md#pf-05-tổ-chức-và-xóa-ghi-chú
<!-- v4:references:end -->
