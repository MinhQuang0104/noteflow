# Story 1.1: Khởi tạo nền tảng NoteFlow từ starter được duyệt

Status: ready-for-dev

## Story

As a chủ tài khoản,
I want NoteFlow có nền tảng web nhất quán trên laptop và điện thoại,
so that các capability MVP có thể được cung cấp an toàn trong cùng một ứng dụng.

## Dependencies

- **Story dependency:** Không có. Đây là Story đầu tiên của Epic 1 và là nền tảng cho Story 1.2–1.6 cùng các Epic còn lại.
- **Planning dependency đã đáp ứng:** Hướng Vue SPA + Laravel API, cùng repository/cùng origin đã được Product Owner duyệt trong Architecture.
- **Implementation/toolchain dependency:** PHP 8.4, Composer tương thích Laravel 13, Node.js 24 LTS (>= 24.12), npm và PostgreSQL 17 cho môi trường local/CI.
- **Không chặn Story:** Provider, budget và giới hạn production thuộc D-04 vẫn chưa chốt; Story này chỉ tạo nền tảng local/CI và cấu hình deploy cùng origin, không chọn provider hoặc cam kết production.

## Acceptance Criteria

1. **Scaffold đúng starter và cấu trúc đã duyệt**
   - **Given** workspace chưa có application scaffold
   - **When** nền tảng NoteFlow được khởi tạo
   - **Then** frontend nằm trong `frontend/` và được tạo từ official create-vue với Vue 3, Vite và TypeScript
   - **And** backend nằm trong `backend/` và là Laravel 13 API project
   - **And** cả hai nằm trong cùng repository; không dùng Inertia, Nuxt/SSR, microservice hoặc generated public-registration flow.

2. **Dependency baseline có thể tái lập**
   - **Given** hai scaffold đã được tạo
   - **When** cài dependency từ trạng thái repository sạch
   - **Then** PHP/Composer và frontend dependency resolve trong các release line của Architecture
   - **And** `backend/composer.lock` cùng frontend lockfile được commit
   - **And** cài đặt frozen/clean từ lockfiles, frontend typecheck và frontend production build đều thành công.

3. **Ranh giới cùng origin và SPA fallback hoạt động đúng**
   - **Given** môi trường local hoặc smoke-test được khởi động bằng cấu hình được ghi trong repository
   - **When** truy cập một UI deep link và các route do backend sở hữu
   - **Then** UI route dùng SPA history fallback và render Vue app
   - **And** `/api`, `/sanctum`, login/logout và Laravel health route được chuyển tới Laravel, không bị SPA fallback trả về HTML
   - **And** frontend gọi backend theo same-origin credentials, không yêu cầu bearer token hoặc database credential trong browser.

4. **Contract ownership và quality gates được đặt từ đầu**
   - **Given** wire contract giữa Vue và Laravel cần một nguồn chuẩn
   - **When** kiểm tra repository và CI
   - **Then** `contracts/` chứa OpenAPI contract tối thiểu, hợp lệ, khai báo foundation JSON health/smoke endpoint hoặc response và có cơ chế sinh TypeScript types vào `frontend/src/api/`
   - **And** automated contract test gọi Laravel foundation endpoint và kiểm tra runtime response thực tế theo OpenAPI schema tương ứng
   - **And** test chứng minh response đúng schema thì pass, còn response lệch schema làm contract test và CI thất bại
   - **And** CI chạy tối thiểu: PHP format/static-analysis gate, backend tests, Vue lint/typecheck, Vitest, OpenAPI validation, Laravel runtime response contract test, generated-types drift check và Vite production build
   - **And** một thay đổi OpenAPI chưa regenerate types làm CI thất bại.

5. **Foundation smoke checks vượt qua trên frontend và backend**
   - **Given** dependency được cài từ lockfiles
   - **When** chạy test/smoke suite được tài liệu hóa
   - **Then** backend test runner khởi động và pass, frontend unit test runner khởi động và pass, production bundle build thành công
   - **And** smoke check xác nhận Vue shell, Laravel health/backend routing và SPA deep link đều phản hồi đúng
   - **And** smoke viewport đại diện laptop và điện thoại không có horizontal overflow do application shell gây ra.

6. **Không tạo trước domain hoặc capability ngoài phạm vi**
   - **Given** Story 1.1 hoàn tất
   - **When** review source tree, routes, migrations và dependencies
   - **Then** chỉ có foundation, framework plumbing và test/build/deploy scaffolding cần thiết
   - **And** chưa có entity, table, API hay UI nghiệp vụ cho Challenge, Notes, Calendar, Today hoặc Backup
   - **And** không có public signup, sharing, WebSocket/Reverb, queue-worker fleet, Redis hoặc external search service trong baseline.

## Tasks / Subtasks

- [ ] **Task 1 — Scaffold repository theo structural seed** (AC: 1, 2, 6)
  - [ ] Tạo `frontend/` bằng official create-vue với TypeScript, Vue Router, Pinia, Vitest và cấu hình Vue Test Utils; thêm Tailwind CSS theo release line đã duyệt.
  - [ ] Tạo `backend/` bằng Laravel 13 API project; cấu hình PHP 8.4, PostgreSQL và test runner Pest/PHPUnit tương thích.
  - [ ] Giữ application code trong `frontend/` và `backend/`; không biến `package.json` placeholder hiện có ở repository root thành manifest của Vue app. Nếu root manifest được giữ, ghi rõ mục đích repository-only và không duplicate application scripts.
  - [ ] Review starter-generated code/dependencies; loại bỏ public registration, sample domain UI và plumbing cho các capability bị loại khỏi MVP baseline.

- [ ] **Task 2 — Thiết lập cấu trúc module và composition tối thiểu** (AC: 1, 6)
  - [ ] Tạo các thư mục seed được Architecture yêu cầu nhưng không tạo domain entity/use case giả: `backend/app/Modules/`, `frontend/src/modules/`, `frontend/src/api/`, `contracts/`, `tests/e2e/`, `deploy/`.
  - [ ] Ghi ngắn quy tắc phụ thuộc `Vue UI → JSON API → Application → Domain`; Domain thuần PHP không phụ thuộc Laravel controller/facade, Eloquent, network hoặc system clock.
  - [ ] Không dựng trước schema nghiệp vụ; chỉ giữ migration/config framework thực sự cần cho foundation và PostgreSQL.

- [ ] **Task 3 — Thiết lập routing cùng origin và local development** (AC: 3, 5)
  - [ ] Cấu hình Vue Router history mode và một deep-link route smoke-test.
  - [ ] Cấu hình local proxy/same-origin behavior để UI, Laravel API, Sanctum và auth routes có cùng semantics với production.
  - [ ] Thêm cấu hình `deploy/` cho Nginx hoặc equivalent: Vue static assets, PHP-FPM routing và SPA fallback chỉ cho UI routes.
  - [ ] Bảo đảm `.env`, Laravel source/private files và database credentials không được static server phục vụ hoặc đưa vào browser bundle.

- [ ] **Task 4 — Đặt OpenAPI contract pipeline** (AC: 4)
  - [ ] Tạo OpenAPI document tối thiểu dưới `contracts/`, khai báo foundation JSON health/smoke endpoint hoặc response mà không khai báo trước product/domain endpoints.
  - [ ] Cấu hình generation của TypeScript types vào `frontend/src/api/` và lệnh kiểm tra generated drift.
  - [ ] Thêm contract validation vào CI; Laravel tiếp tục là nơi runtime validation/serialization, không dùng PHP model làm browser DTO.
  - [ ] Đặt automated runtime contract test dùng OpenAPI schema để kiểm tra response thực tế từ Laravel foundation endpoint.

- [ ] **Task 5 — Thiết lập quality gates và smoke tests** (AC: 2, 4, 5)
  - [ ] Thêm backend format/static-analysis/test commands và ít nhất một Laravel routing/health smoke test trả foundation JSON response đã khai báo trong OpenAPI.
  - [ ] Thêm positive contract case xác nhận Laravel runtime response đúng schema thì pass và negative control dùng response cố ý lệch schema qua cùng validator để chứng minh contract test từ chối; runtime response lệch contract phải làm CI fail.
  - [ ] Thêm frontend lint/typecheck/Vitest/build commands và ít nhất một Vue app-shell render test.
  - [ ] Thêm smoke test cho SPA deep link, backend-owned route không bị fallback, và hai viewport đại diện laptop/điện thoại.
  - [ ] Tạo CI workflow chạy clean install từ lockfiles, OpenAPI validation, Laravel runtime response contract test, generated-types drift check, backend gates, frontend gates và production build.
  - [ ] Ghi các lệnh local tương đương CI trong README/developer setup để một developer khác tái lập được.

- [ ] **Task 6 — Kiểm tra scope và bàn giao foundation** (AC: 1–6)
  - [ ] Chạy toàn bộ commands từ clean install và lưu kết quả trong Dev Agent Record.
  - [ ] Review dependency/source tree để xác nhận không có capability hoặc infrastructure ngoài phạm vi.
  - [ ] Cập nhật File List và Completion Notes; chỉ chuyển Story sang `review` khi mọi AC và Definition of Done đều đạt.

## Dev Notes

### Technical Context

- Kiến trúc là **một deployable modular monolith**: Vue 3 SPA gọi Laravel REST JSON API; cả hai cùng repository, coordinated release, cùng HTTPS origin và một PostgreSQL database.
- Dependency direction bắt buộc: `Vue UI → JSON API → Application → Domain`. PHP Domain phải thuần framework-independent; adapters triển khai persistence/session/clock/storage ports. Story này chỉ tạo structural seed, chưa cần module implementation.
- Backend-owned paths gồm `/api`, `/sanctum`, login/logout và Laravel health route. SPA history fallback chỉ xử lý UI routes. Node là build tool, không phải production application server.
- API contract canonical nằm trong `contracts/`; Laravel sở hữu runtime validation, domain rules và JSON serialization. Foundation JSON health/smoke endpoint hoặc response phải được khai báo trong OpenAPI; automated contract test kiểm tra Laravel runtime response thực tế theo schema đó. TypeScript types được generate cho frontend và drift phải bị CI bắt.
- Sanctum session/CSRF là boundary đã duyệt nhưng luồng login/owner authorization đầy đủ thuộc Story 1.2. Story 1.1 chỉ phải giữ routing và dependency foundation tương thích; không thêm public registration hoặc bearer-token storage.
- Private product data chưa xuất hiện ở Story này. Dù vậy, scaffold không được làm lộ `.env`, credential hay Laravel private source qua static hosting/browser bundle.

### Approved Stack Baseline

| Thành phần | Release line |
| --- | --- |
| Node.js | 24 LTS, >= 24.12; build only |
| TypeScript / Vue / Vite | 6.0 / 3.x / 8.x |
| Vue Router / Pinia / Tailwind CSS | 5.x / 4.x / 4.3 |
| PHP / Laravel / Sanctum | 8.4 / 13.x / 4.x |
| PostgreSQL | 17, provider-managed minor |
| Pest / PHPUnit | 5.x / 13.x |
| Vitest / Playwright | 5.0 / 1.63 |

Pin compatible patch versions only when scaffold is implemented and prove compatibility bằng lockfiles + CI; không suy compatibility chỉ từ bảng release line.

### Project Structure Notes

```text
backend/                  # Laravel project
  app/Http/               # controllers, requests, middleware
  app/Modules/            # future product modules; no premature domain code
  app/Providers/          # composition / dependency bindings
  routes/                 # API and auth routes
  database/migrations/    # foundation-only in this Story
  tests/                  # PHP tests
frontend/                 # create-vue SPA
  src/router/             # Vue Router
  src/stores/             # Pinia stores
  src/api/                # generated contract types and HTTP foundation
  src/modules/            # future product views/components
  tests/                  # Vitest/Vue Test Utils
contracts/                # OpenAPI; backup schema comes in later Story
tests/e2e/                # Playwright smoke/journeys
deploy/                   # same-origin routing/runtime configuration
```

- Workspace hiện có `package.json` kiểu `npm init` ở repository root nhưng chưa có application scaffold hay application lockfile. Frontend canonical phải nằm trong `frontend/`; xử lý root manifest theo Task 1 và không để hai manifest cùng nhận vai trò frontend.
- Không có previous Story hoặc implementation learning để tái sử dụng; đây là Story đầu tiên của sprint.

### Testing Expectations

- **Backend:** Pest/PHPUnit runner phải pass; thêm HTTP/routing smoke test cho Laravel foundation health/backend surface và trả JSON response đã khai báo trong OpenAPI. Chưa cần domain/database behavior tests vì Story không tạo nghiệp vụ; nếu test chạm DB thì dùng PostgreSQL thật, không dùng SQLite/in-memory làm bằng chứng thay thế.
- **Frontend:** lint, TypeScript typecheck, Vitest + Vue Test Utils app-shell test và Vite production build phải pass.
- **Contract:** OpenAPI validation, Laravel runtime response contract test và generated TypeScript drift check phải pass. Positive case kiểm tra response thực tế đúng schema; negative control đưa response cố ý lệch schema qua cùng validator và phải bị từ chối, chứng minh runtime response không phù hợp sẽ làm test/CI fail. Tiếp tục có negative CI proof rằng contract đổi mà chưa regenerate types sẽ fail.
- **Routing/smoke:** xác nhận UI deep link được SPA fallback, backend-owned paths không bị fallback, frontend và backend dùng same-origin semantics.
- **Responsive:** chạy smoke ở ít nhất một viewport laptop và một viewport điện thoại được ghi lại; kiểm tra app shell render và không tạo horizontal overflow.
- **Reproducibility:** verification phải bắt đầu từ clean/frozen install dựa trên committed lockfiles; các commands local và CI phải tương đương.

### Out of Scope

- Login UI, owner provisioning, session lifecycle đầy đủ và authorization tests chi tiết (Story 1.2).
- Account timezone/domain engine (Story 1.3), revision polling/sync (Story 1.4), draft retry (Story 1.5), conflict resolution (Story 1.6).
- Mọi entity/API/UI cho Challenge, Notes, Today, Calendar, Search và Backup; foundation JSON health/smoke surface phục vụ routing và contract verification không phải product/domain endpoint.
- Chọn hosting provider/budget, production launch, Kubernetes, multi-region, Redis, queues, WebSocket, SSR hoặc external search.

### Definition of Done

- [ ] Mọi Acceptance Criteria 1–6 có test hoặc verification evidence tương ứng.
- [ ] Mọi Task/Subtask hoàn tất; không còn placeholder/TODO ảnh hưởng foundation behavior.
- [ ] Clean install từ `composer.lock` và frontend lockfile thành công trên toolchain đã ghi.
- [ ] PHP format/static analysis/tests; Vue lint/typecheck/Vitest/build; OpenAPI validation, Laravel runtime response contract test và generated drift đều pass; positive/negative contract cases cung cấp evidence tương ứng.
- [ ] Same-origin routing và SPA fallback smoke checks pass; mobile/laptop viewport smoke được ghi lại.
- [ ] Không có secret/credential trong repository hoặc browser bundle; backend private files không được static serve.
- [ ] Review xác nhận không có product entity/capability hoặc excluded infrastructure bị tạo trước.
- [ ] README/developer setup mô tả prerequisites, install, run, test, contract generation và smoke commands đủ để tái lập.
- [ ] Dev Agent Record, File List và Change Log được cập nhật; Story chỉ chuyển sang `review`, chưa tự đánh dấu `done` trước code review/acceptance.

### References

- [Source: docs/product/epics.md#Story 1.1: Khởi tạo nền tảng NoteFlow từ starter được duyệt]
- [Source: docs/product/prd.md#6. Functional Requirements]
- [Source: docs/product/prd.md#7. Non-Functional Requirements]
- [Source: docs/product/prd.md#11.1. Truy cập, lưu và hai thiết bị]
- [Source: docs/product/prd.md#13. Dependencies]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#Design Paradigm]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#AD-1 — One deployable modular monolith [ADOPTED]]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#AD-5 — Authenticated API is the only product write boundary [ADOPTED]]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#AD-12 — Same-origin single-region MVP deployment [ADOPTED]]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#AD-15 — PHP/TypeScript API contract ownership [ADOPTED]]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#Stack]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#Structural Seed]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md#9. Deployment approach cho MVP]
- [Source: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md#10. Testing strategy tổng quan]

## Dev Agent Record

### Agent Model Used

<!-- Dev agent records model/version during implementation. -->

### Debug Log References

<!-- Dev agent records relevant command/test/debug references. -->

### Completion Notes List

<!-- Dev agent records implementation outcomes and any approved deviations. -->

### File List

<!-- Dev agent records every created, modified, or deleted implementation file. -->

### Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-15 | 1.1 | Đồng bộ F6 với Epics và AD-15: thêm foundation runtime response contract test cùng positive/negative CI evidence | Codex |
| 2026-09-14 | 1.0 | Story drafted and marked ready-for-dev | Codex |
