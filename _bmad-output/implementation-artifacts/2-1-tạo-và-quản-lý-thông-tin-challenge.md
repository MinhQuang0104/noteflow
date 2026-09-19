# Story 2.1: Tạo và quản lý thông tin challenge

Status: ready-for-dev

## Story

As a chủ tài khoản, I want tạo và chỉnh sửa challenge N/7, So that tôi bắt đầu theo dõi mục tiêu linh hoạt.

## Requirement Mapping

- Functional requirements: FR-007, FR-008
- Acceptance-level requirement: AC-006
- UX decisions: UX-DR8, UX-DR9; UX Specification §5 và §8.4
- Architecture decisions: AD-2, AD-3, AD-4, AD-5, AD-6, AD-8, AD-11, AD-13, AD-15; D-02, D-05

## Dependencies and Readiness

- Story 1.1, 1.2 và 1.3 đã hoàn tất, cung cấp Laravel/Vue/PostgreSQL foundation, owner authentication, `account_state` và server-authoritative `AccountTimeContext`.
- D-02 đã chốt MVP chỉ tạo challenge với account-today và `start_date` bất biến sau create.
- D-05 đã chốt conflict matrix cho challenge metadata ở mức aggregate snapshot.
- AD-6 đã được Product Owner phê duyệt ngày 2026-09-19 và áp dụng rõ cho Challenge create/update.
- Story này cung cấp persisted business resource, mutation và owner-scoped read model thật đầu tiên để Story 1.4 có thể tích hợp revision polling; Story này không tự triển khai polling coordinator của Story 1.4.

## Acceptance Criteria

### AC1 — Tạo challenge hợp lệ

**Given** form hợp lệ **When** tạo với tên, mô tả tùy chọn và target nguyên 1–7 **Then** challenge có start date là account-today **And** không yêu cầu ngày cố định trong tuần.

### AC2 — Từ chối target không hợp lệ

**Given** target ngoài 1–7 hoặc không nguyên **When** submit **Then** không tạo và lỗi gắn đúng field.

### AC3 — Sửa metadata mà không thay đổi facts khác

**Given** challenge tồn tại **When** sửa tên/mô tả **Then** lưu giá trị mới mà không đổi start date, target hoặc history.

## Tasks / Subtasks

- [ ] **Task 1 — Thiết lập persistence và owner-scoped Challenge model** (AC: 1–3)
  - [ ] Mở rộng `account_states` với `account_revision`, `data_epoch` và `write_state` bằng default/backfill an toàn, đồng thời có rollback phù hợp.
  - [ ] Tạo `challenges` và initial `challenge_target_periods` theo AD-3/AD-11/AD-13: owner-compatible foreign keys, `start_date` kiểu account-local date, target nguyên 1–7 và initial target hiệu lực tại `start_date`.
  - [ ] Tạo `mutation_commands` theo AD-6 với unique `(owner_id, data_epoch, command_id)`, request hash và replayable acknowledgement; không đưa ledger vào product backup.
  - [ ] Không persist một bản sao `current_target` thứ hai và không thêm delete/reopen hoặc custom start-date behavior ngoài Story.

- [ ] **Task 2 — Cài đặt Challenge application/domain use cases** (AC: 1–3)
  - [ ] Create Challenge capture đúng một `AccountTimeContext`, dùng account-today làm immutable `start_date` và tạo initial target trong cùng transaction.
  - [ ] Update chỉ cho phép name/description; không nhận hoặc thay đổi `start_date`, target, target history hay activity history.
  - [ ] List/detail query luôn scope theo authenticated owner, trả metadata, initial/current target và version cần cho mutation tiếp theo.
  - [ ] Validate tên có nội dung, mô tả tùy chọn và target là số nguyên 1–7; giữ nguyên input hợp lệ khi một field bị lỗi.

- [ ] **Task 3 — Áp dụng AD-6 và account revision cho create/update** (AC: 1–3)
  - [ ] Mọi write khóa `account_state FOR UPDATE`, kiểm tra owner, `write_state = open`, `data_epoch`, command identity và base resource version khi áp dụng.
  - [ ] Create không yêu cầu prior row version; update dùng `base_version` và trả typed conflict với resource identity/version/current snapshot khi stale.
  - [ ] Cùng command ID và cùng canonical request replay acknowledgement mà không mutate hoặc tăng revision lần nữa; cùng key khác payload trả `idempotency_key_reused`.
  - [ ] Mỗi transaction thật sự thay đổi persisted state tăng `account_revision` đúng một lần; retry và no-op không tăng thêm.

- [ ] **Task 4 — Cung cấp API/OpenAPI contract đồng bộ** (AC: 1–3)
  - [ ] Thêm owner-private list, detail, create và metadata-update routes dưới `/api/v1/challenges`, dùng Sanctum/CSRF/no-store boundary hiện có.
  - [ ] Định nghĩa request/response/problem schemas cho validation, unauthenticated/forbidden, stale version, stale epoch, write fence và idempotency-key reuse.
  - [ ] Trả `row_version`, `data_epoch` và mutation acknowledgement cần thiết mà không lộ database row hoặc owner ID tùy ý.
  - [ ] Cập nhật generated TypeScript types và contract drift/response tests trong cùng thay đổi.

- [ ] **Task 5 — Xây dựng list/detail và form tạo/sửa Challenge trong Vue** (AC: 1–3)
  - [ ] Thay `/challenges` placeholder bằng owner-scoped list/detail flow, dùng TanStack Vue Query cho server state.
  - [ ] Form tạo có tên, mô tả tùy chọn và target nguyên 1–7; không có weekday picker hoặc start-date picker.
  - [ ] Form sửa chỉ có tên/mô tả; hiển thị start date và target hiện hành nhưng không gửi chúng như trường có thể sửa.
  - [ ] Hiển thị lỗi cạnh đúng field, giữ input, ngăn submit lặp khi đang xử lý và không báo thành công trước server acknowledgement.
  - [ ] Mutation thành công cập nhật/invalidate owner-scoped Challenge queries; conflict giữ form hiện tại và không âm thầm ghi đè snapshot đã lưu.

- [ ] **Task 6 — Chứng minh integration seam cho Story 1.4** (AC: 1–3)
  - [ ] PostgreSQL integration tests chứng minh create/update persist và list/detail trả read model mới cho đúng owner sau reload.
  - [ ] Chứng minh một create/update thật tăng `account_revision` đúng một lần; replay, no-op, validation failure, stale conflict và rollback không tăng sai.
  - [ ] Ghi rõ consumers: Challenge list/detail query, mutation ACK, `GET /api/v1/account` state contract và Story 1.4 polling/refetch coordinator.
  - [ ] Không tạo resource hoặc mutation minh họa riêng cho Story 1.4; Challenge là resource tích hợp thật.

- [ ] **Task 7 — HIGH-risk adversarial review và Done Gate** (AC: 1–3)
  - [ ] Falsify owner isolation, target constraints, immutable start/target-on-edit, stale epoch/version, command replay/key reuse, write fence và transaction rollback invariants.
  - [ ] Kiểm tra callers/consumers, migration/backfill/rollback, concurrent create retry/update, HTTP contract, responsive/touch/keyboard form behavior và error paths.
  - [ ] Chạy deterministic checks hiện có, kiểm tra final diff và ghi AC-to-evidence trước khi chuyển lifecycle.

## Risk Classification

**HIGH** — Story thêm migrations, owner-scoped business data, public OpenAPI contract, idempotency ledger, optimistic concurrency và shared account revision/write boundary.

## Readiness Gate

**PASS — READY FOR DEV**

Kết quả kiểm tra:

1. PASS — AD-6 approval và phạm vi áp dụng cho Challenge create/update đã được ghi trong Architecture Spine và memlog.
2. PASS — Story giữ nguyên AC từ `docs/product/epics.md`, không thêm custom start date, target editing, delete/archive hoặc conflict-resolution UI đầy đủ.
3. PASS — Tasks/Subtasks bao phủ persisted resource, mutation/read model, revision/epoch/write-state contract, consumers và deterministic evidence mà không cần implementation plan riêng.
4. PASS — Story độc lập triển khai được sau Story 1.1–1.3; Story 1.4 tiếp tục ở `backlog` cho đến khi business resource đã được triển khai và có bằng chứng tích hợp.

Không bắt đầu implementation hoặc mở V3 execution run trong session chuẩn bị này.

## Implementation Notes

- Tasks/Subtasks ở trên là implementation plan; không tạo một plan lớn khác trừ khi khi triển khai phát hiện sequencing/migration risk chưa được map.
- Story 2.1 triển khai write-side revision contract và Challenge read model. Story 1.4 chịu trách nhiệm polling/focus/reconnect/cache convergence và bằng chứng hai thiết bị sau khi resource này tồn tại.
- Full user-facing conflict selection vẫn thuộc Story 1.6; Story này phải bảo toàn input và trả/nhận typed conflict đúng contract, không last-write-wins.
- Không bắt đầu product implementation trong session chuẩn bị Story này.

## References

- `docs/product/epics.md` — Epic 2, Story 2.1 và Acceptance Criteria canonical.
- `docs/product/prd.md` — FR-007, FR-008, AC-006; NFR-004, NFR-006, NFR-007.
- `docs/ux/ux-spec.md` — Challenge screen, create/edit form và field-error behavior.
- `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md` — AD-2/3/4/5/6/8/11/13/15.
- `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md` — Challenge schema/API surface, concurrency/isolation và D-02/D-05.
- `_bmad-output/implementation-artifacts/1-4-nhận-dữ-liệu-mới-giữa-hai-thiết-bị.md` — business-resource và mutation-contract blockers cần Story này tháo gỡ.
- `AGENTS.md` và `.agents/policies/orchestration-v3.md` — HIGH-risk routing, readiness và execution ownership.

## Dev Agent Record

### Implementation

- Chưa bắt đầu; session này chỉ chuẩn bị Story và readiness state.

### Completion Notes

- 2026-09-19: Tạo Story artifact từ product intent canonical; không triển khai product code.
- 2026-09-19: Map Challenge create/update thành business mutation/read model thật cho Story 1.4.
- 2026-09-19: Ghi nhận AD-6 đã được Product Owner phê duyệt và áp dụng cho Challenge mutation.
- 2026-09-19: Readiness gate PASS; Story sẵn sàng cho một V3 Story implementation run riêng.

## Change Log

- 2026-09-19: Tạo bản draft, hoàn tất readiness gate và chuyển Story sang `ready-for-dev`; chưa triển khai product code.
