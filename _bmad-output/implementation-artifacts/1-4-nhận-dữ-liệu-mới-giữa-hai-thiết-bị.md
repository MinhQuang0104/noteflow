# Story 1.4: Nhận dữ liệu mới giữa hai thiết bị

Status: draft

## Story

Là một người dùng đang đăng nhập trên nhiều thiết bị,
tôi muốn thiết bị đang hoạt động nhận biết khi dữ liệu tài khoản đã thay đổi ở thiết bị khác,
để dữ liệu hiển thị được làm mới mà không cần tải lại ứng dụng thủ công.

## Requirement Mapping

- Functional requirements: FR-002, FR-003
- Non-functional requirements: NFR-004, NFR-006
- UX decisions: UX-DR14, UX-DR18
- Architecture decisions: AD-8; phần mutation/versioning còn phụ thuộc AD-6 hoặc quyết định tương đương được phê duyệt

## Dependencies and Readiness

- Story 1.1, 1.2 và 1.3 đã hoàn tất.
- AD-8 đã được chấp nhận và xác định cơ chế revision polling/refetch.
- Repository hiện chưa có một business resource với persisted mutation và read model thực tế để tạo bằng chứng tích hợp hai thiết bị cho AC1.
- AD-6 về mutation versioning/idempotency vẫn đang ở trạng thái `PROPOSED`; không được tự diễn giải thành quyết định sản phẩm hoặc kiến trúc đã duyệt.
- Ngưỡng đồng bộ D-09 vẫn còn mở. Có thể ghi nhận interval/latency thực tế trong kiểm thử, nhưng chưa được tuyên bố một SLA chưa được phê duyệt.

## Acceptance Criteria

### AC1 — Thiết bị thứ hai nhận và hiển thị dữ liệu mới

**Given** cùng một tài khoản đang hoạt động online trên hai thiết bị
**When** thiết bị A lưu thành công một thay đổi dữ liệu
**Then** `account_revision` của tài khoản chỉ tăng đúng một lần cho transaction thay đổi trạng thái đó
**And** thiết bị B phát hiện revision mới, refetch dữ liệu liên quan và hội tụ về dữ liệu mới.

### AC2 — Polling dừng hoặc tạm dừng đúng điều kiện

**Given** ứng dụng bị ẩn, thiết bị offline hoặc phiên đăng nhập hết hạn
**When** polling đồng bộ được đánh giá
**Then** polling tạm dừng hoặc dừng phù hợp với trạng thái hiện tại
**And** giao diện không báo sai rằng dữ liệu đã đồng bộ.

### AC3 — Reconcile trước khi ghi sau focus hoặc reconnect

**Given** ứng dụng vừa lấy lại focus hoặc kết nối mạng
**When** người dùng chuẩn bị tiếp tục thao tác ghi
**Then** ứng dụng reconcile `account_revision` và `data_epoch` trước khi cho phép ghi dựa trên dữ liệu có thể đã cũ.

### AC4 — Lỗi đồng bộ không phá hủy dữ liệu đang hiển thị

**Given** polling hoặc refetch thất bại
**When** ứng dụng xử lý lỗi đồng bộ
**Then** người dùng nhận được trạng thái lỗi có thể hành động
**And** dữ liệu hiện có không bị thay thế bằng trạng thái rỗng chỉ vì request thất bại.

## Tasks / Subtasks

- [ ] Xác lập contract trạng thái đồng bộ của tài khoản.
  - [ ] Bổ sung `account_revision`, `data_epoch` và `write_state` vào persistence theo architecture đã duyệt.
  - [ ] Trả các trường này từ `GET /api/v1/account` và cập nhật OpenAPI/contract types liên quan.
  - [ ] Có migration, backfill/default an toàn và phương án rollback phù hợp.
- [ ] Tích hợp revision vào mutation thực tế đầu tiên.
  - [ ] Dùng account-row locking và kiểm tra epoch/write-state theo quyết định kiến trúc được duyệt.
  - [ ] Mỗi transaction thật sự thay đổi trạng thái chỉ tăng `account_revision` đúng một lần.
  - [ ] Không tạo mutation minh họa hoặc resource giả chỉ để hoàn thành Story này.
- [ ] Xây dựng SPA sync coordinator theo AD-8.
  - [ ] Dùng TanStack Vue Query theo approved stack.
  - [ ] Poll ban đầu mỗi 5 giây khi visible và online, bảo đảm không có request chồng lấn.
  - [ ] Reconcile khi focus/reconnect; tạm dừng khi hidden/offline; dừng khi logout hoặc nhận `401`.
  - [ ] Chặn late response bằng auth-generation/request-generation fence.
- [ ] Xử lý cache, refetch và lỗi đồng bộ.
  - [ ] Invalidate/refetch các owner-scoped query khi revision thay đổi.
  - [ ] Không ghi đè dirty draft và không chuyển dữ liệu hợp lệ thành empty state khi refetch lỗi.
  - [ ] Hiển thị lỗi đồng bộ có hành động phục hồi rõ ràng.
- [ ] Tạo bằng chứng tích hợp với business resource thực tế.
  - [ ] Kiểm thử hai browser context cùng tài khoản trên PostgreSQL.
  - [ ] Chứng minh mutation ở thiết bị A làm thiết bị B hội tụ về read model mới.
  - [ ] Bao phủ hidden/offline, focus/reconnect, session expiry, polling/refetch failure và late response.
- [ ] Thực hiện HIGH-risk adversarial review trước Done Gate.
  - [ ] Kiểm tra các invariant revision, epoch, auth isolation, concurrency và dirty-draft safety.
  - [ ] Kiểm tra callers/consumers và các unhappy path có liên quan.

## Risk Classification

**HIGH** — Story chạm shared account-state boundary, public API/OpenAPI contract, cross-device concurrency, cache invalidation và stale-write protection.

## Readiness Gate

**BLOCKED / NOT READY FOR DEV**

Story chỉ có thể chuyển sang `ready-for-dev` khi:

1. Có một business resource thực tế với persisted mutation và read model để cung cấp bằng chứng end-to-end cho AC1.
2. Mutation contract cần thiết từ AD-6, hoặc một quyết định kiến trúc thay thế tương đương, đã được phê duyệt rõ ràng.
3. Phạm vi tích hợp với Story business-resource tương ứng được ghi nhận mà không thay đổi ngầm Acceptance Criteria.

Cho đến khi các điều kiện này được đáp ứng, không được bắt đầu product implementation hoặc mở V3 execution run cho Story 1.4.

## Implementation Notes

- Các Tasks/Subtasks ở trên là implementation plan; không cần tạo một plan lớn khác.
- Story này nên được triển khai cùng hoặc ngay sau mutation/read model thật đầu tiên, thay vì xây một vertical slice giả chỉ phục vụ polling.
- Chu kỳ 5 giây là baseline kiến trúc hiện tại, không phải cam kết SLA cho D-09.

## References

- `docs/product/epics.md` — Epic 1, Story 1.4
- `docs/architecture.md` — AD-6, AD-8 và account-state contract
- `docs/product/prd.md` — FR-002, FR-003, NFR-004, NFR-006
- `docs/ux-design-specification.md` — UX-DR14, UX-DR18
- `.agents/policies/orchestration-v3.md` — readiness và execution ownership

## Dev Agent Record

### Implementation

- Chưa bắt đầu; Story chưa đạt `ready-for-dev`.

### Completion Notes

- 2026-09-19: Tạo Story artifact và đánh giá readiness theo Agent Architecture V3.
- 2026-09-19: Xác định blocker là thiếu business mutation/read model thực tế và quyết định mutation contract đã được phê duyệt.

## Change Log

- 2026-09-19: Tạo bản draft; giữ sprint status ở `backlog`; chưa triển khai product code.
