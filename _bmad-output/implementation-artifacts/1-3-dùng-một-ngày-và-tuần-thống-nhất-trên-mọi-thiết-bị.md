# Story 1.3: Dùng một ngày và tuần thống nhất trên mọi thiết bị

Status: ready-for-dev

## Story

As a chủ tài khoản, I want ứng dụng dùng timezone cố định của tài khoản, So that mọi thiết bị hiểu cùng hôm nay và tuần.

**Maps to PRD:** FR-006; NFR-003, NFR-010; AC-005.

## Dependencies

- Story 1.1 và 1.2 đã hoàn tất, cung cấp Laravel API, Vue SPA, PostgreSQL, OpenAPI, private owner session và `/settings` private route.
- Epic 1.3 chốt timezone sản phẩm là `Asia/Ho_Chi_Minh`; đây là giá trị account-authoritative, không phải timezone trình duyệt, PHP runtime hoặc PostgreSQL session.
- Story này thiết lập time boundary dùng chung; không triển khai challenge progress/streak, calendar event membership hoặc synchronization của các Story sau.

## Acceptance Criteria

1. **Given** timezone là `Asia/Ho_Chi_Minh` **When** hai thiết bị có timezone khác nhau truy cập gần ranh giới ngày/tuần **Then** chúng hiển thị cùng account date và tuần Thứ Hai–Chủ Nhật.
2. **Given** một request cần nhiều phép tính thời gian **When** xử lý **Then** toàn bộ dùng cùng instant và `AccountTimeContext`.
3. **Given** owner xem settings **When** timezone hiển thị **Then** giá trị là chỉ đọc.

## Tasks / Subtasks

- [ ] **Task 1 — Thiết lập account timezone trong identity boundary** (AC: 1, 3)
  - [ ] Thêm identity-owned `account_state` theo architecture, quan hệ một-một với owner và timezone IANA cố định `Asia/Ho_Chi_Minh`.
  - [ ] Provision/reprovision owner phải tạo hoặc chuyển account state một cách nhất quán, không tạo owner thứ hai hoặc timezone lấy từ máy chạy lệnh.
  - [ ] Migration có deterministic default/backfill cho owner hiện hữu và rollback an toàn; không thêm API hay form đổi timezone.

- [ ] **Task 2 — Cài đặt server-authoritative `AccountTimeContext`** (AC: 1, 2)
  - [ ] Tạo clock boundary có thể inject/test và immutable context chứa authoritative instant, timezone, account date, Monday week start và Sunday week end.
  - [ ] Mỗi application use case capture clock đúng một lần rồi truyền cùng context xuống các phép tính; không gọi rải rác system clock, database `CURRENT_DATE` hoặc browser time.
  - [ ] Chuẩn hóa wire dates dưới dạng ISO `YYYY-MM-DD`; không đổi account-local date qua device timezone.

- [ ] **Task 3 — Cung cấp account time contract cho SPA** (AC: 1, 2, 3)
  - [ ] Thêm private `GET /api/v1/account` theo architecture, trả fixed timezone và canonical account date/week từ cùng `AccountTimeContext`.
  - [ ] Khóa response bằng owner admission và `private, no-store`; cập nhật OpenAPI, generated TypeScript types và Laravel response contract tests.
  - [ ] Không nhận timezone từ query/body/header làm nguồn quyết định và không mở mutation endpoint cho timezone trong MVP.

- [ ] **Task 4 — Hiển thị canonical date/week và timezone chỉ đọc** (AC: 1, 3)
  - [ ] SPA lấy account context từ API sau xác thực và giữ các giá trị account-local dưới dạng canonical strings, không tự tính lại bằng timezone thiết bị.
  - [ ] Hôm nay hiển thị account date/week do server cung cấp; Settings hiển thị `Asia/Ho_Chi_Minh` bằng read-only text, không có input/save control.
  - [ ] Session expiry/logout dọn account context theo private-state lifecycle đã có; loading/error không được fallback âm thầm sang device date.

- [ ] **Task 5 — Khóa temporal boundary bằng deterministic evidence** (AC: 1–3)
  - [ ] Backend tests đóng băng instant ở hai phía của nửa đêm và biên Chủ Nhật/Thứ Hai; cùng instant phải cho cùng account date/week bất kể runtime timezone.
  - [ ] Thêm test chứng minh một request chỉ capture clock một lần và mọi field trong response xuất phát từ cùng context.
  - [ ] Frontend/Vitest và Playwright chạy với ít nhất hai device timezone khác nhau, xác minh cùng canonical date/week và timezone read-only.
  - [ ] Chạy backend trên PostgreSQL 17, contract gates, frontend unit/lint/typecheck/build, browser smoke và architecture regression tests.

- [ ] **Task 6 — HIGH-risk adversarial review và Done Gate** (AC: 1–3)
  - [ ] Falsify các invariant tại UTC/account midnight, Sunday/Monday boundary, runtime/device timezone khác nhau, clock đổi giữa hai lần đọc và account state thiếu/không hợp lệ.
  - [ ] Kiểm tra consumer hiện tại của session/auth/private-state lifecycle và các contract caller để không tạo nguồn timezone/date thứ hai.
  - [ ] Kiểm tra final diff, AC-to-evidence, migration rollback, File List và đồng bộ Story/sprint lifecycle.

## Dev Notes

### Risk Classification

**HIGH** — Story thêm migration, shared architecture boundary, canonical time invariant và public OpenAPI contract. Áp dụng targeted boundary/negative tests và adversarial review theo `AGENTS.md`.

### Implementation Mapping (delta)

- Laravel identity module: `account_state` persistence/provisioning, injectable clock và immutable `AccountTimeContext`, private account controller/DTO.
- Contract: `GET /api/v1/account` với timezone + account date/week; OpenAPI và generated frontend types thay đổi cùng release.
- Vue: account-context API/store, canonical server strings cho Today và read-only timezone trong Settings; tái sử dụng auth-generation/private reset boundary.
- Verification: fake-clock domain/request tests, PostgreSQL integration/contract tests, Vitest và Playwright contexts có timezone khác nhau.

### Architecture Invariants

- `Asia/Ho_Chi_Minh` là IANA identity được lưu; không thay bằng `Asia/Bangkok` dù hiện cùng UTC+7.
- Server capture một authoritative instant cho mỗi use case và tạo đúng một immutable `AccountTimeContext`.
- Tuần account luôn bắt đầu Thứ Hai và kết thúc Chủ Nhật; ngày truyền qua API là ISO account-local date.
- Browser, PHP default timezone và PostgreSQL session timezone không quyết định product date/week.
- Timezone chỉ đọc trong MVP; không thêm selector, update endpoint hoặc per-device override.
- Story không triển khai sớm challenge, streak, event hoặc sync behavior ngoài contract/time foundation cần cho chúng.

### References

- `docs/product/epics.md` — Story 1.3 và baseline timezone của Epic 1.
- `docs/product/prd.md` — FR-006, NFR-003, NFR-010 và AC-005.
- `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md` — AD-2, AD-4, AD-11, AD-15 và consistency conventions.
- `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md` — identity/account-state model, account endpoint và D-01.
- `docs/ux/ux-spec.md` — fixed account timezone; không dùng device timezone làm product value.
- `AGENTS.md` — HIGH-risk routing và Deterministic Done Gate.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- Chưa triển khai.

### Done Gate Evidence

- Chưa triển khai.

### Completion Notes List

- Story artifact được chuẩn bị từ các requirement và architecture decision đã duyệt; chưa chỉnh sửa product code.

### File List

- `_bmad-output/implementation-artifacts/1-3-dùng-một-ngày-và-tuần-thống-nhất-trên-mọi-thiết-bị.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-18: Tạo Story 1.3 ở trạng thái `draft` để kiểm tra implementation readiness.
- 2026-09-18: Readiness gate PASS; đồng bộ Story/sprint sang `ready-for-dev`, chưa triển khai product code.
