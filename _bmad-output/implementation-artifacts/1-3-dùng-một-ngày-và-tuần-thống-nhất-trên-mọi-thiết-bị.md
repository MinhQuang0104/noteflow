# Story 1.3: Dùng một ngày và tuần thống nhất trên mọi thiết bị

Status: review

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

- [x] **Task 1 — Thiết lập account timezone trong identity boundary** (AC: 1, 3)
  - [x] Thêm identity-owned `account_state` theo architecture, quan hệ một-một với owner và timezone IANA cố định `Asia/Ho_Chi_Minh`.
  - [x] Provision/reprovision owner phải tạo hoặc chuyển account state một cách nhất quán, không tạo owner thứ hai hoặc timezone lấy từ máy chạy lệnh.
  - [x] Migration có deterministic default/backfill cho owner hiện hữu và rollback an toàn; không thêm API hay form đổi timezone.

- [x] **Task 2 — Cài đặt server-authoritative `AccountTimeContext`** (AC: 1, 2)
  - [x] Tạo clock boundary có thể inject/test và immutable context chứa authoritative instant, timezone, account date, Monday week start và Sunday week end.
  - [x] Mỗi application use case capture clock đúng một lần rồi truyền cùng context xuống các phép tính; không gọi rải rác system clock, database `CURRENT_DATE` hoặc browser time.
  - [x] Chuẩn hóa wire dates dưới dạng ISO `YYYY-MM-DD`; không đổi account-local date qua device timezone.

- [x] **Task 3 — Cung cấp account time contract cho SPA** (AC: 1, 2, 3)
  - [x] Thêm private `GET /api/v1/account` theo architecture, trả fixed timezone và canonical account date/week từ cùng `AccountTimeContext`.
  - [x] Khóa response bằng owner admission và `private, no-store`; cập nhật OpenAPI, generated TypeScript types và Laravel response contract tests.
  - [x] Không nhận timezone từ query/body/header làm nguồn quyết định và không mở mutation endpoint cho timezone trong MVP.

- [x] **Task 4 — Hiển thị canonical date/week và timezone chỉ đọc** (AC: 1, 3)
  - [x] SPA lấy account context từ API sau xác thực và giữ các giá trị account-local dưới dạng canonical strings, không tự tính lại bằng timezone thiết bị.
  - [x] Hôm nay hiển thị account date/week do server cung cấp; Settings hiển thị `Asia/Ho_Chi_Minh` bằng read-only text, không có input/save control.
  - [x] Session expiry/logout dọn account context theo private-state lifecycle đã có; loading/error không được fallback âm thầm sang device date.

- [x] **Task 5 — Khóa temporal boundary bằng deterministic evidence** (AC: 1–3)
  - [x] Backend tests đóng băng instant ở hai phía của nửa đêm và biên Chủ Nhật/Thứ Hai; cùng instant phải cho cùng account date/week bất kể runtime timezone.
  - [x] Thêm test chứng minh một request chỉ capture clock một lần và mọi field trong response xuất phát từ cùng context.
  - [x] Frontend/Vitest và Playwright chạy với ít nhất hai device timezone khác nhau, xác minh cùng canonical date/week và timezone read-only.
  - [x] Chạy backend trên PostgreSQL 17, contract gates, frontend unit/lint/typecheck/build, browser smoke và architecture regression tests.

- [x] **Task 6 — HIGH-risk adversarial review và Done Gate** (AC: 1–3)
  - [x] Falsify các invariant tại UTC/account midnight, Sunday/Monday boundary, runtime/device timezone khác nhau, clock đổi giữa hai lần đọc và account state thiếu/không hợp lệ.
  - [x] Kiểm tra consumer hiện tại của session/auth/private-state lifecycle và các contract caller để không tạo nguồn timezone/date thứ hai.
  - [x] Kiểm tra final diff, AC-to-evidence, migration rollback, File List và đồng bộ Story/sprint lifecycle.

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

- `VALID`: account-context 401/403 ban đầu chỉ để store ở trạng thái lỗi và giữ private route; đã reconcile auth generation, xóa private state và redirect về login.
- `VALID`: cùng UTC+7 không làm `Asia/Bangkok` tương đương `Asia/Ho_Chi_Minh`; database constraint khóa đúng IANA identity đã duyệt.
- `VALID`: account state thiếu không được fallback về runtime/device date; endpoint fail closed và có negative test.
- Không còn finding HIGH/MEDIUM chưa xử lý; không có `SPEC_AMBIGUITY` hoặc `NEEDS_HUMAN_DECISION`.

### Done Gate Evidence

AC1
Evidence:
- test/check: account midnight/week boundary và cross-device timezone rendering
- commands: `php artisan test --colors=never`; `npm.cmd test -- --workers=1`
- result: PASS — backend 35/35; Playwright 22/22 với America/Los_Angeles và Asia/Tokyo

AC2
Evidence:
- test/check: injectable clock + one capture per use case + real account response contract
- command: `php artisan test --colors=never`
- result: PASS — 35 tests / 114 assertions trên PostgreSQL 17

AC3
Evidence:
- test/check: read-only Settings rendering và không có input/select
- commands: `npm.cmd run test:unit -- --run`; `npm.cmd test -- --workers=1`
- result: PASS — Vitest 22/22; Playwright 22/22

Additional gates:
- `vendor\bin\pint.bat --test` — PASS.
- `composer analyse` — PASS, no errors.
- `npm.cmd run contract:validate`, `contract:check`, `contract:proof` — PASS.
- `npm.cmd run lint`, `type-check`, `build-only` — PASS.
- `uv run python -m unittest _bmad.scripts.tests.test_agent_architecture` — PASS, 5/5.
- Nginx `nginx -t` — PASS.

### Completion Notes List

- Đã thêm identity-owned account state với fixed IANA timezone, deterministic backfill và transfer khi reprovision.
- Đã thêm injectable clock, immutable `AccountTimeContext` và canonical Monday–Sunday date/week derivation.
- Đã thêm private `/api/v1/account`, OpenAPI/generated types và fail-closed owner/no-store boundary.
- Đã thêm account store, Today canonical date/week và Settings timezone chỉ đọc; logout/session expiry dọn private state.
- HIGH-risk adversarial review và toàn bộ deterministic gate hiện có đã pass; Story sẵn sàng cho human review.

### File List

- `_bmad-output/implementation-artifacts/1-3-dùng-một-ngày-và-tuần-thống-nhất-trên-mọi-thiết-bị.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `backend/app/Console/Commands/ProvisionOwner.php`
- `backend/app/Http/Controllers/AccountContextController.php`
- `backend/app/Modules/Identity/Application/AccountTimeContextFactory.php`
- `backend/app/Modules/Identity/Contracts/Clock.php`
- `backend/app/Modules/Identity/Domain/AccountTimeContext.php`
- `backend/app/Modules/Identity/Infrastructure/SystemClock.php`
- `backend/app/Providers/AppServiceProvider.php`
- `backend/database/migrations/2026_09_18_010000_create_account_states_table.php`
- `backend/routes/api.php`
- `backend/tests/Contract/AccountContextContractTest.php`
- `backend/tests/Feature/AccountContextTest.php`
- `backend/tests/Feature/ProvisionOwnerCommandTest.php`
- `backend/tests/Unit/AccountTimeContextTest.php`
- `contracts/openapi.yaml`
- `frontend/src/api/account.ts`, `frontend/src/api/schema.generated.ts`
- `frontend/src/api/__tests__/account.spec.ts`
- `frontend/src/router/index.ts`, `frontend/src/router/__tests__/router.spec.ts`
- `frontend/src/stores/account.ts`, `frontend/src/stores/__tests__/account.spec.ts`
- `frontend/src/views/AccountSettingsView.vue`, `frontend/src/views/TodayView.vue`
- `frontend/src/views/__tests__/account-time.spec.ts`
- `tests/e2e/account-time.spec.ts`, `tests/e2e/playwright.config.ts`
- `tests/e2e/responsive.spec.ts`, `tests/e2e/routing.spec.ts`

### Change Log

- 2026-09-18: Tạo Story 1.3 ở trạng thái `draft` để kiểm tra implementation readiness.
- 2026-09-18: Readiness gate PASS; đồng bộ Story/sprint sang `ready-for-dev`, chưa triển khai product code.
- 2026-09-18: Bắt đầu implementation theo `story-development`; áp dụng TDD và HIGH-risk controls.
- 2026-09-18: Hoàn tất implementation, adversarial review và deterministic Done Gate; chuyển Story sang `review`.
