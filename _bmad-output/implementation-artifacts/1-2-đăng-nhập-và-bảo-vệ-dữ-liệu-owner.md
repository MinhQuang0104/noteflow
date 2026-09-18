# Story 1.2: Đăng nhập và bảo vệ dữ liệu owner

Status: done

## Story

As a chủ tài khoản, I want đăng nhập bằng email và mật khẩu được cấp sẵn, So that chỉ tôi truy cập được dữ liệu cá nhân.

**Maps to PRD:** FR-001; NFR-007. **Covers UX:** UX-DR1, UX-DR2, UX-DR18.

## Dependencies

- Story 1.1 đã hoàn tất và cung cấp Vue 3 SPA, Laravel 13 API, Sanctum, PostgreSQL, OpenAPI và các quality gate nền tảng.
- D-03 đã duyệt email + password, đúng một owner được provision thủ công, không public registration.
- Session duration vẫn là cấu hình vận hành; Story này không tự chốt một thời lượng sản phẩm mới.

## Acceptance Criteria

1. **Given** credentials hợp lệ **When** owner đăng nhập **Then** session được tạo và điều hướng tới private route hợp lệ hoặc Hôm nay **And** không có đăng ký công khai.
2. **Given** chưa xác thực hoặc session hết hạn **When** truy cập private page/API **Then** không trả dữ liệu cá nhân **And** yêu cầu đăng nhập.
3. **Given** owner logout **When** logout hoàn tất **Then** session bị vô hiệu, private cache/draft bị xóa **And** Back không làm lộ dữ liệu.
4. **Given** owner đã xác thực **When** dùng app shell **Then** navigation có thứ tự Hôm nay → Challenge → Ghi chú → Lịch, account/settings ở cuối **And** mobile có nút mở navigation rõ ràng.

## Tasks / Subtasks

- [x] **Task 1 — Thiết lập single-owner admission và provisioning** (AC: 1, 2)
  - [x] Thêm marker owner có database invariant chỉ cho phép tối đa một owner.
  - [x] Cung cấp lệnh provision thủ công nhận password qua hidden prompt, không ghi credential vào repository hoặc shell history.
  - [x] Không tạo public registration, password-reset, anonymous hoặc bearer-token flow.

- [x] **Task 2 — Triển khai Sanctum session boundary** (AC: 1, 2, 3)
  - [x] Login bằng email/password, throttle, regenerate session ID và chỉ chấp nhận owner đã provision.
  - [x] Chỉ giữ private destination nội bộ hợp lệ; fallback về `/today`.
  - [x] Bảo vệ private API bằng stateful Sanctum + owner admission; trả 401/403 không kèm dữ liệu owner.
  - [x] Gắn `Cache-Control: private, no-store` cho private/auth responses.
  - [x] Logout invalidate session và regenerate CSRF token; mọi unsafe request dùng CSRF protection.

- [x] **Task 3 — Triển khai auth lifecycle phía SPA** (AC: 1, 2, 3)
  - [x] API client khởi tạo `/sanctum/csrf-cookie`, gửi same-origin credentials và decoded XSRF header.
  - [x] Pinia auth store quản lý owner/session, auth generation và registry dọn private cache/draft.
  - [x] Response/callback private đến sau logout không được phục hồi state cũ.
  - [x] Route guard giữ deep link hợp lệ, ẩn private UI khi hết phiên và đưa guest về login.
  - [x] Logout dùng history replacement để Back không render lại dữ liệu riêng tư.

- [x] **Task 4 — Hoàn thiện login view và authenticated app shell** (AC: 1, 4)
  - [x] Login view có trạng thái gửi/lỗi, autocomplete phù hợp và không có lối đăng ký công khai.
  - [x] Navigation theo đúng Hôm nay → Challenge → Ghi chú → Lịch; account/settings ở cuối.
  - [x] Mobile có nút mở navigation với label và `aria-expanded` rõ ràng.

- [x] **Task 5 — Khóa contract và security regression evidence** (AC: 1–4)
  - [x] Cập nhật OpenAPI và generated frontend types cho login/session/logout.
  - [x] Backend tests bao phủ owner/non-owner, invalid login, redirect allowlist, throttle, unauthenticated/expired session, no-store, logout và route công khai bị thiếu.
  - [x] Frontend tests bao phủ CSRF, route guard/deep link, navigation order, logout cleanup và late response.
  - [x] Browser smoke bao phủ login shell, private navigation responsive và Back sau logout mà không lộ dữ liệu.

- [x] **Task 6 — HIGH-risk adversarial review và Done Gate** (AC: 1–4)
  - [x] Falsify các invariant: single-owner admission, CSRF, private no-store, session invalidation, open redirect và auth-generation fence.
  - [x] Chạy toàn bộ backend, contract, frontend, browser, build, lint/static-analysis và architecture gates hiện có.
  - [x] Kiểm tra final diff, cập nhật AC-to-evidence, File List, Completion Notes và sprint lifecycle.

## Dev Notes

### Risk Classification

**HIGH** — Story thay đổi authentication, authorization, session/CSRF, database migration, private caching và OpenAPI boundary. Áp dụng targeted negative/security tests và adversarial review theo `AGENTS.md`.

### Implementation Mapping (delta)

- Laravel: owner marker/migration + provisioning command; login/session/logout controller/request; stateful Sanctum, owner admission và no-store middleware.
- Vue: same-origin auth client; Pinia auth-generation fence; route guard; login view và responsive authenticated shell.
- Contracts/verification: OpenAPI schemas and responses, Laravel feature/contract tests, Vitest behavior tests và Playwright privacy/navigation smoke.
- Migration rollback phải xóa partial unique index trước khi xóa owner marker; không thay đổi schema product-domain khác.

### Architecture Invariants

- First-party SPA dùng Sanctum session cookie; browser không lưu bearer token.
- Server xác minh `is_owner`; không tin client route guard hoặc `owner_id` từ request.
- Unsafe cookie-auth request chịu CSRF; login rotate session, logout invalidate session và rotate token.
- Private API/page state không cache; session expiry ẩn private UI và dừng ghi.
- Mọi private callback capture auth generation; callback cũ không cập nhật state sau logout.
- Không bổ sung public signup, reset password, magic link, OAuth hoặc MFA trong Story này.

### References

- `docs/product/epics.md` — Story 1.2 và UX-DR1/2/18.
- `docs/product/prd.md` — FR-001, NFR-007 và access/privacy acceptance.
- `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md` — §6 Authentication strategy, AD-5/AD-14 và D-03.
- `docs/ux/ux-spec.md` — §4 Navigation, §5 authentication screen và §11 session-expiry state.
- `AGENTS.md` — HIGH-risk routing và Deterministic Done Gate.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- `VALID`: unauthenticated 401 ban đầu thiếu `no-store`; đặt `PrivateNoStore` trước auth priority và kiểm tra response lỗi toàn cục.
- `VALID`: Vue `/login` xung đột Nginx backend-owned route; chuyển UI sang `/sign-in`.
- `VALID`: local Vite/preview origins thiếu khỏi Sanctum stateful defaults; bổ sung 5173/4173.
- `VALID`: debug response và generated response `$ref` có thể làm contract evidence sai; khóa `APP_DEBUG=false`, siết schema và sửa generator.
- `FALSE_POSITIVE`: nested note URL chưa phải valid route ở Story 1.2; giữ allowlist đúng năm private routes hiện có, không tạo domain route sớm.

### Done Gate Evidence

AC1
Evidence:
- test/check: owner login, session rotation, redirect allowlist, no public registration, provisioning
- command: `php artisan test --colors=never`
- result: PASS — PostgreSQL 17, 24 tests / 84 assertions

AC2
Evidence:
- test/check: unauthenticated/non-owner session API, no-store, route guard and session expiry
- commands: `php artisan test --colors=never`; `npm.cmd run test:unit -- --run`
- result: PASS — backend 24/24; frontend 14/14

AC3
Evidence:
- test/check: logout invalidation/token rotation, private-state reset, auth-generation fence, browser Back privacy
- commands: `php artisan test --colors=never`; `npm.cmd run test:unit -- --run`; `npm.cmd test -- --workers=1`
- result: PASS — backend 24/24; frontend 14/14; Playwright 20/20

AC4
Evidence:
- test/check: authenticated navigation order and responsive mobile navigation trigger
- commands: `npm.cmd run test:unit -- --run`; `npm.cmd test -- --workers=1`
- result: PASS — frontend 14/14; Playwright 20/20 across laptop/phone

Additional gates:
- `vendor\bin\pint.bat --test` — PASS.
- `composer analyse` — PASS, no errors.
- `npm.cmd run contract:validate`, `contract:check`, `contract:proof` — PASS.
- `npm.cmd run lint`, `type-check`, `build-only` — PASS.
- Nginx `nginx -t` in `nginx:1.27-alpine` — PASS.
- `uv run python -m unittest _bmad.scripts.tests.test_agent_architecture` — PASS, 5/5.
- Evidence trên máy local dùng PHP 8.5.9 và Node 22.15; workflow CI đã pin PHP 8.4/Node 24.12 nhưng chưa được chạy remote trong checkout này. Giữ Story ở `review` cho tới human review/CI.

### Completion Notes List

- Đã triển khai single-owner provisioning với database invariant và invalidation session khi reprovision.
- Đã triển khai Sanctum stateful session, CSRF typed error, throttle, owner admission và private no-store boundary.
- Đã triển khai login/session/logout SPA lifecycle, fail-closed route guard, auth-generation fence và private-state reset registry.
- Đã thay foundation shell bằng login view và authenticated responsive navigation đúng thứ tự đã duyệt.
- HIGH-risk adversarial review không còn finding HIGH/MEDIUM chưa xử lý; human review đã approve và Story đã vượt Done Gate trước khi chuyển sang `done`.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/1-2-đăng-nhập-và-bảo-vệ-dữ-liệu-owner.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `backend/.env.example`, `backend/phpunit.xml`
- `backend/app/Console/Commands/ProvisionOwner.php`
- `backend/app/Http/Controllers/Auth/AuthenticatedSessionController.php`
- `backend/app/Http/Middleware/{EnsureOwner,PrivateNoStore}.php`
- `backend/app/Http/Requests/LoginRequest.php`
- `backend/app/Models/User.php`, `backend/app/Providers/AppServiceProvider.php`
- `backend/bootstrap/app.php`, `backend/config/sanctum.php`
- `backend/database/factories/UserFactory.php`
- `backend/database/migrations/2026_09_18_000000_add_owner_admission_to_users_table.php`
- `backend/routes/{api,web}.php`
- `backend/tests/Contract/AuthResponseContractTest.php`
- `backend/tests/Feature/{OwnerAuthenticationTest,ProvisionOwnerCommandTest}.php`
- `contracts/openapi.yaml`
- `frontend/scripts/generate-openapi-types.mjs`
- `frontend/src/__tests__/App.spec.ts`
- `frontend/src/api/{auth,schema.generated}.ts`, `frontend/src/api/__tests__/auth.spec.ts`
- `frontend/src/components/AppShell.vue`, `frontend/src/main.ts`, `frontend/src/pinia.ts`
- `frontend/src/router/index.ts`, `frontend/src/router/__tests__/router.spec.ts`
- `frontend/src/stores/auth.ts`, `frontend/src/stores/__tests__/auth.spec.ts`
- `frontend/src/views/{LoginView,PrivatePlaceholderView}.vue`
- `tests/e2e/{foundation,responsive,routing}.spec.ts`

### Change Log

- 2026-09-18: Tạo Story 1.2 từ Epic/AC đã duyệt; phân loại HIGH và chuyển sang `in-progress`.
- 2026-09-18: Hoàn tất implementation, adversarial review và deterministic Done Gate; chuyển Story sang `review`.
- 2026-09-18: Human review approve; chạy lại toàn bộ gate khả dụng và chuyển Story/sprint lifecycle sang `done`.
