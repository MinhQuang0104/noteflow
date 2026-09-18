# Story 1.1: Khởi tạo nền tảng NoteFlow từ starter được duyệt

Status: done

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

- [x] **Task 1 — Scaffold repository theo structural seed** (AC: 1, 2, 6)
  - [x] Tạo `frontend/` bằng official create-vue với TypeScript, Vue Router, Pinia, Vitest và cấu hình Vue Test Utils; thêm Tailwind CSS theo release line đã duyệt.
  - [x] Tạo `backend/` bằng Laravel 13 API project; cấu hình PHP 8.4, PostgreSQL và test runner Pest/PHPUnit tương thích.
  - [x] Giữ application code trong `frontend/` và `backend/`; không biến `package.json` placeholder hiện có ở repository root thành manifest của Vue app. Nếu root manifest được giữ, ghi rõ mục đích repository-only và không duplicate application scripts.
  - [x] Review starter-generated code/dependencies; loại bỏ public registration, sample domain UI và plumbing cho các capability bị loại khỏi MVP baseline.

- [x] **Task 2 — Thiết lập cấu trúc module và composition tối thiểu** (AC: 1, 6)
  - [x] Tạo các thư mục seed được Architecture yêu cầu nhưng không tạo domain entity/use case giả: `backend/app/Modules/`, `frontend/src/modules/`, `frontend/src/api/`, `contracts/`, `tests/e2e/`, `deploy/`.
  - [x] Ghi ngắn quy tắc phụ thuộc `Vue UI → JSON API → Application → Domain`; Domain thuần PHP không phụ thuộc Laravel controller/facade, Eloquent, network hoặc system clock.
  - [x] Không dựng trước schema nghiệp vụ; chỉ giữ migration/config framework thực sự cần cho foundation và PostgreSQL.

- [x] **Task 3 — Thiết lập routing cùng origin và local development** (AC: 3, 5)
  - [x] Cấu hình Vue Router history mode và một deep-link route smoke-test.
  - [x] Cấu hình local proxy/same-origin behavior để UI, Laravel API, Sanctum và auth routes có cùng semantics với production.
  - [x] Thêm cấu hình `deploy/` cho Nginx hoặc equivalent: Vue static assets, PHP-FPM routing và SPA fallback chỉ cho UI routes.
  - [x] Bảo đảm `.env`, Laravel source/private files và database credentials không được static server phục vụ hoặc đưa vào browser bundle.

- [x] **Task 4 — Đặt OpenAPI contract pipeline** (AC: 4)
  - [x] Tạo OpenAPI document tối thiểu dưới `contracts/`, khai báo foundation JSON health/smoke endpoint hoặc response mà không khai báo trước product/domain endpoints.
  - [x] Cấu hình generation của TypeScript types vào `frontend/src/api/` và lệnh kiểm tra generated drift.
  - [x] Thêm contract validation vào CI; Laravel tiếp tục là nơi runtime validation/serialization, không dùng PHP model làm browser DTO.
  - [x] Đặt automated runtime contract test dùng OpenAPI schema để kiểm tra response thực tế từ Laravel foundation endpoint.

- [x] **Task 5 — Thiết lập quality gates và smoke tests** (AC: 2, 4, 5)
  - [x] Thêm backend format/static-analysis/test commands và ít nhất một Laravel routing/health smoke test trả foundation JSON response đã khai báo trong OpenAPI.
  - [x] Thêm positive contract case xác nhận Laravel runtime response đúng schema thì pass và negative control dùng response cố ý lệch schema qua cùng validator để chứng minh contract test từ chối; runtime response lệch contract phải làm CI fail.
  - [x] Thêm frontend lint/typecheck/Vitest/build commands và ít nhất một Vue app-shell render test.
  - [x] Thêm smoke test cho SPA deep link, backend-owned route không bị fallback, và hai viewport đại diện laptop/điện thoại.
  - [x] Tạo CI workflow chạy clean install từ lockfiles, OpenAPI validation, Laravel runtime response contract test, generated-types drift check, backend gates, frontend gates và production build.
  - [x] Ghi các lệnh local tương đương CI trong README/developer setup để một developer khác tái lập được.

- [x] **Task 6 — Kiểm tra scope và bàn giao foundation** (AC: 1–6)
  - [x] Chạy toàn bộ commands từ clean install và lưu kết quả trong Dev Agent Record.
  - [x] Review dependency/source tree để xác nhận không có capability hoặc infrastructure ngoài phạm vi.
  - [x] Cập nhật File List và Completion Notes; chỉ chuyển Story sang `review` khi mọi AC và Definition of Done đều đạt.

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

- [x] Mọi Acceptance Criteria 1–6 có test hoặc verification evidence tương ứng.
- [x] Mọi Task/Subtask hoàn tất; không còn placeholder/TODO ảnh hưởng foundation behavior.
- [x] Clean install từ `composer.lock` và frontend lockfile thành công trên toolchain đã ghi.
- [x] PHP format/static analysis/tests; Vue lint/typecheck/Vitest/build; OpenAPI validation, Laravel runtime response contract test và generated drift đều pass; positive/negative contract cases cung cấp evidence tương ứng.
- [x] Same-origin routing và SPA fallback smoke checks pass; mobile/laptop viewport smoke được ghi lại.
- [x] Không có secret/credential trong repository hoặc browser bundle; backend private files không được static serve.
- [x] Review xác nhận không có product entity/capability hoặc excluded infrastructure bị tạo trước.
- [x] README/developer setup mô tả prerequisites, install, run, test, contract generation và smoke commands đủ để tái lập.
- [x] Dev Agent Record, File List và Change Log được cập nhật; Story chỉ chuyển sang `review`, chưa tự đánh dấu `done` trước code review/acceptance.

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

OpenAI Codex (GPT-5)

### Debug Log References

- `composer validate --strict --no-interaction` — PASS; lock/manifest valid.
- `vendor\bin\pint.bat --test` and `vendor\bin\phpstan.bat analyse --memory-limit=1G` — PASS.
- `php artisan test` — PASS, 3 tests / 6 assertions; repeated on official `php:8.4-cli` with the repository layout mounted intact.
- Clean-checkout regression — tracked `backend/tests/Unit/.gitkeep` so the PHPUnit Unit testsuite path exists before any unit test is added.
- Node 24.12.0/npm 11.6.2 `npm ci` — PASS, 354 packages, 0 vulnerabilities.
- `npm run contract:validate`, `contract:check`, and `contract:proof` — PASS; stale generated types were rejected and the canonical contract was restored.
- `npm run lint`, `type-check`, `test:unit -- --run`, and `build-only` — PASS; 3 Vitest files / 6 tests.
- `npm test` in `tests/e2e` — PASS, 18 Playwright checks across 1440x900 and 390x844.
- `docker run ... nginx:1.27-alpine nginx -t` — PASS.
- `uv --no-cache run --no-project python _bmad/scripts/tests/test_agent_architecture.py` — PASS, 5 architecture regression tests.
- Scope and bundle secret scans with `rg` — PASS, no product capability seed or credential material found.

### Done Gate Evidence (2026-09-18)

- AC1 / AC6 — source tree, dependency, route, migration, secret, and final-diff inspection: PASS; foundation-only scope retained.
- AC2 — clean `npm ci`, Composer validation, PHP format/static analysis, frontend typecheck, and production build: PASS.
- AC3 — Nginx configuration test plus Playwright same-origin, backend-route, SPA fallback, and `/apiary` negative checks: PASS.
- AC4 — OpenAPI validation, generated-types drift check/proof, and positive/negative Laravel runtime contract tests: PASS.
- AC5 — backend 3 tests / 6 assertions, frontend 3 files / 6 tests, and Playwright 18/18 across laptop and phone: PASS.
- Architecture V2 regression suite: 5/5 PASS.
- Human review/acceptance: approved by the user on 2026-09-18; no unresolved HIGH or MEDIUM finding remains.

### Completion Notes List

- AC1: scaffolded the approved Vue 3/Vite/TypeScript frontend and Laravel 13 JSON API in one repository; removed sample UI, starter documentation, optional Vue devtools, and unused public assets.
- AC2: locked the approved Node 24.12, PHP 8.4, Vue/Vite/TypeScript, Tailwind, Laravel/Sanctum, Pest/PHPUnit, Vitest, and Playwright release lines; proved a clean frozen frontend install and production build.
- AC3: implemented matching Vite and Nginx route boundaries, relative same-origin API calls, Vue history fallback, and negative coverage proving `/apiary` is not captured by the `/api` backend prefix.
- AC4: added canonical OpenAPI, deterministic TypeScript generation/drift proof, and positive plus negative Laravel runtime response validation through the same OpenAPI validator.
- AC5: added backend, frontend, contract, CI, Nginx, and two-viewport Playwright gates; all applicable local gates are green.
- AC6: retained only foundation/framework plumbing. Source, migration, dependency, and bundle scans found no premature product capability, public signup, Redis service, worker fleet, Reverb/WebSocket, external search, or secret exposure.
- Added narrow compatibility workarounds for two upstream defects: explicit npm pins for bundled Tailwind WASM lock entries and a Windows-only bounded Playwright profile cleanup patch. Linux/CI Playwright remains unmodified.
- No provider selection, production deployment, or release action was performed.
- Human acceptance and the fresh Deterministic Done Gate were recorded; Story and sprint lifecycle were synchronized to `done`.

### File List

- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`
- `package.json`
- `redocly.yaml`
- `backend/.editorconfig`, `backend/.env.example`, `backend/.gitattributes`, `backend/.gitignore`, `backend/artisan`, `backend/composer.json`, `backend/composer.lock`, `backend/phpunit.xml`, `backend/phpstan.neon`
- `backend/app/Http/Controllers/{Controller,FoundationHealthController}.php`, `backend/app/Models/User.php`, `backend/app/Modules/README.md`, `backend/app/Providers/AppServiceProvider.php`
- `backend/bootstrap/app.php`, `backend/bootstrap/providers.php`, `backend/bootstrap/cache/.gitignore`
- `backend/config/{app,auth,cache,database,filesystems,logging,mail,queue,sanctum,services,session}.php`
- `backend/database/factories/UserFactory.php`, `backend/database/seeders/DatabaseSeeder.php`, `backend/database/migrations/{0001_01_01_000000_create_users_table,2026_09_16_135722_create_personal_access_tokens_table}.php`
- `backend/database/.gitignore`, `backend/public/{.htaccess,index.php,robots.txt}`, `backend/routes/{api,console,web}.php`
- `backend/storage/**/.gitignore`
- `backend/tests/Pest.php`, `backend/tests/TestCase.php`, `backend/tests/Unit/.gitkeep`, `backend/tests/Feature/FoundationHealthTest.php`, `backend/tests/Contract/{FoundationResponseContractTest,OpenApiResponseValidator}.php`
- `contracts/openapi.yaml`
- `deploy/README.md`, `deploy/nginx/noteflow.conf`
- `frontend/.editorconfig`, `frontend/.gitattributes`, `frontend/.gitignore`, `frontend/.oxlintrc.json`, `frontend/.prettierrc.json`, `frontend/env.d.ts`, `frontend/eslint.config.ts`, `frontend/index.html`, `frontend/package.json`, `frontend/package-lock.json`
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`, `frontend/tsconfig.vitest.json`, `frontend/vite.config.ts`, `frontend/vitest.config.ts`
- `frontend/scripts/{generate-openapi-types,prove-contract-drift}.mjs`
- `frontend/src/App.vue`, `frontend/src/main.ts`, `frontend/src/assets/main.css`, `frontend/src/components/AppShell.vue`
- `frontend/src/api/{http,schema.generated}.ts`, `frontend/src/api/__tests__/http.spec.ts`
- `frontend/src/router/index.ts`, `frontend/src/router/__tests__/router.spec.ts`, `frontend/src/views/{DeepLinkView,FoundationView}.vue`, `frontend/src/__tests__/App.spec.ts`, `frontend/src/modules/.gitkeep`
- `tests/e2e/package.json`, `tests/e2e/package-lock.json`, `tests/e2e/playwright.config.ts`
- `tests/e2e/{foundation,responsive,routing}.spec.ts`, `tests/e2e/scripts/patch-playwright-windows-cleanup.mjs`
- `_bmad-output/implementation-artifacts/1-1-khởi-tạo-nền-tảng-noteflow-từ-starter-được-duyệt.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-18 | 1.4 | Fixed clean-checkout backend test discovery by tracking the configured empty Unit testsuite directory | Codex |
| 2026-09-18 | 1.3 | Recorded human acceptance, reran the full Deterministic Done Gate and Architecture V2 regression suite, and moved the Story to done | Codex |
| 2026-09-17 | 1.2 | Implemented the approved foundation, contract pipeline, same-origin routing, CI/quality gates, and deterministic completion evidence; moved to review | Codex |
| 2026-09-15 | 1.1 | Đồng bộ F6 với Epics và AD-15: thêm foundation runtime response contract test cùng positive/negative CI evidence | Codex |
| 2026-09-14 | 1.0 | Story drafted and marked ready-for-dev | Codex |
