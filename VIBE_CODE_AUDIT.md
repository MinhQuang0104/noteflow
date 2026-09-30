# Repository Engineering Audit

> Phạm vi: toàn bộ repository NoteFlow tại commit `240f2e8` (branch `main`, working tree sạch).
> Ngày audit: 2026-09-30. Chế độ: **AUDIT ONLY** — không sửa source, không cài dependency, không commit.
> Đây là file duy nhất được tạo bởi audit.

---

## 1. Executive Summary

**Tình trạng thực tế: khá tốt ở tầng correctness/security, nhưng đang tích lũy drift kiến trúc và duplication đúng kiểu vibe-code.** Sản phẩm hiện là một ứng dụng single-owner nhỏ (Laravel 13 JSON API + Vue 3 SPA + PostgreSQL 17) với 2 feature thật: *Challenge metadata* và *Journal theo ngày*, cùng lớp đồng bộ đa thiết bị (polling + optimistic concurrency + idempotency).

**Điểm mạnh nhất**
- Write path backend được thiết kế đúng và *được chứng minh bằng test chạy thật*: mọi mutation khóa `account_states ... FOR UPDATE`, kiểm tra `write_state`/`data_epoch`, idempotency theo `(owner_id, data_epoch, command_id)` + request hash, optimistic version check. Có test concurrency dùng 2 connection PostgreSQL thật.
- Authorization đơn giản và nhất quán: mọi route private dùng `auth:sanctum` + `owner`; mọi query đều scope `owner_id`; DB có unique partial index chỉ cho phép 1 owner, composite FK `(owner_id, challenge_id)`.
- Contract-first thực sự hoạt động: OpenAPI → generated TS types → `contract:check` và backend contract tests validate response thật.
- Toàn bộ quality gate đang xanh (xem §3).

**Điểm yếu nhất**
- Kiến trúc được tài liệu hoá là *ports-and-adapters + pure domain* nhưng implementation là *transaction script* gọi `DB` facade trực tiếp trong Application layer; thư mục `Domain` chỉ chứa exception (CONTRADICTED).
- Mỗi story mới copy-paste nguyên "mutation pipeline" (lock → fence → epoch → idempotency → validate → write → revision → record command → map exception) ở cả backend lẫn frontend. Với ~25 story còn lại trong backlog, đây là hotspot regression lớn nhất.

**Risk lớn nhất**
- Không có lỗ hổng khai thác được ở thời điểm này. Risk lớn nhất là *maintainability risk có hệ quả correctness*: logic đồng bộ phía client (`sync.ts` + `journalDrafts.ts` ≈ 1.350 dòng state machine) hard-code query key và status code; một số giả định đã lệch với hành vi thật của server (ví dụ session hết hạn trả **419** chứ không phải **401** — đã kiểm chứng bằng request thật, F-02).

**Có an toàn để tiếp tục phát triển feature không?** Có, *với điều kiện* xử lý các prerequisite dưới đây trước khi mở Epic 3 (streak engine), Epic 4 (Notes) và Epic 6 (backup/restore), vì cả ba đều nhân bản đúng những pattern đang có vấn đề.

**Prerequisite trước khi scale thêm**
1. Trích xuất một mutation pipeline dùng chung ở backend (F-06) và một write/command client dùng chung ở frontend (F-08, F-14).
2. Chốt quyết định kiến trúc: hoặc hiện thực hoá domain layer thật (cần cho streak engine Epic 3), hoặc sửa tài liệu cho khớp thực tế (F-05).
3. Sửa lệch 419/401 và khai báo đầy đủ contract lỗi (F-02, F-09).
4. Quyết định có trim nội dung journal hay không trước khi Notes (Epic 4) kế thừa hành vi này (F-04).
5. Thêm guard database cho backend test suite (F-01).

---

## 2. System & Architecture Map

### Stack (VERIFIED)
| Thành phần | Thực tế |
|---|---|
| Backend | PHP 8.4 (Docker `php:8.4-cli-bookworm`), Laravel 13, Sanctum 4 (SPA cookie auth), Pest 5 / PHPUnit 13, Larastan level 6, Pint |
| Frontend | Vue 3.5, Vue Router 5, Pinia 4, TanStack Vue Query 5, Tailwind 4, Vite 8, Vitest 5, TypeScript 6, oxlint + ESLint |
| Database | PostgreSQL 17 (bắt buộc; SQLite bị từ chối cả trong test) |
| Contract | `contracts/openapi.yaml` (OpenAPI 3) → `frontend/src/api/schema.generated.ts` |
| E2E | Playwright 1.63 (`tests/e2e`), laptop + phone project |
| Local runtime | `compose.local.yaml` (dev + test profile tách network/volume) điều khiển qua `scripts/local.ps1` |
| Production | Chỉ có `deploy/nginx/noteflow.conf` (same-origin, PHP-FPM) — **chưa có deployment thật** |
| CI | `.github/workflows/ci.yml`: backend (pint, phpstan, test), frontend (contract, lint, type, unit, build), browser-smoke (Playwright), nginx `-t` |
| AI agent config | `AGENTS.md`, `CLAUDE.md`, `.agents/` (269 file skill/policy), `_bmad/`, `_bmad-output/` (story + receipt), `docs/agent-architecture/`, `docs/superpowers/` |

### Request/data flow thực tế
```
Vue view (ChallengesView / ChallengeJournalEditor / TodayView)
  → Pinia stores (auth, account, sync, journalDrafts) + TanStack Query ['challenges'], ['challenge-journal', id, date]
  → fetch wrappers (api/auth.ts, api/account.ts, api/challenges.ts, api/http.ts)  — same-origin cookie + X-XSRF-TOKEN
  → Vite proxy (dev) / Nginx (prod) → Laravel
  → middleware: statefulApi (Sanctum: session + CSRF) → private.no-store → auth:sanctum → owner
  → Controller (validation thủ công + map exception → HTTP)
  → Application UseCase/Query (DB facade query builder, transaction, lock account_states)
  → PostgreSQL (users, account_states, challenges, challenge_target_periods, challenge_daily_records, mutation_commands, sessions)
```

### Layer thực tế (so với tài liệu)
| Layer tài liệu | Thực tế |
|---|---|
| Controller | `app/Http/Controllers/*` — chứa cả validation, whitelist field, normalize, và mapping exception |
| Application | `app/Modules/Challenges/Application/UseCases/*` — business rule + SQL + transaction + serialization |
| Domain | `app/Modules/Challenges/Domain/Exceptions/*` — **chỉ có exception**; `Identity/Domain/AccountTimeContext` là domain object thật duy nhất |
| Infrastructure/Adapters | `Identity/Infrastructure/SystemClock` là adapter duy nhất; **không có persistence port/adapter** |

### Sync model (client)
- `sync.ts` poll `GET /api/v1/account` mỗi 5s (backoff tới 30s), so sánh `account_revision`/`data_epoch`, rồi `refetchQueries/resetQueries(['challenges'])`.
- Mọi write gọi `reconcileBeforeWrite()` (thêm 1 round-trip GET /account) trước khi gửi mutation.
- Journal draft là state machine trong memory (`journalDrafts.ts`) với các trạng thái `saved/dirty/saving/error/conflict/blocked/quarantined`, fencing theo auth generation, owner, epoch.

---

## 3. Audit Coverage

### Đã inspect trực tiếp
- Toàn bộ backend `app/`, `routes/`, `bootstrap/`, `database/migrations`, config liên quan (app, session, sanctum), `phpunit.xml`, `composer.json`, `phpstan.neon`.
- Frontend: `api/*`, `stores/*`, `router`, `AppShell`, `ChallengeJournalEditor`, phần script của `ChallengesView`, `TodayView`, `LoginView`, các view orphan.
- `contracts/openapi.yaml` (components + paths), `compose.local.yaml`, `deploy/**`, `.github/workflows/ci.yml`, header và các nhánh chính của `scripts/local.ps1`, `tests/e2e/helpers/db-helper.php`, `playwright.config.ts`.
- README, `backend/app/Modules/README.md`, `docs/architecture/.../ARCHITECTURE-SPINE.md` (các quyết định chính), `sprint-status.yaml`.

### Lệnh đã chạy (không làm thay đổi file tracked)
| Lệnh | Kết quả |
|---|---|
| `scripts/local.ps1 test` (Pest trong container `backend-test`, DB `noteflow_test`) | **86 passed, 514 assertions** |
| `composer analyse` (Larastan level 6, trong container test) | **No errors** |
| `vendor/bin/pint --test` | **PASS 80 files** |
| `npm run test:unit -- --run` | **125 passed / 15 files** |
| `npm run type-check` (vue-tsc) | pass |
| `npm run lint` (oxlint + eslint) | pass |
| `npm run contract:check`, `npm run contract:validate` | pass / "API description is valid" |
| `scripts/local.ps1 e2e` (Playwright compose mode, gồm `npm run build`) | **29 passed, 5 skipped** (skip có chủ đích: cross-device chỉ chạy trên project laptop) |
| Probe HTTP tới backend-test `:8001` (không auth, không ghi dữ liệu) | Xác nhận PUT sau khi mất session trả **419** (F-02) |

Lưu ý môi trường: lần chạy đầu `local.ps1` fail do cách redirect stderr của PowerShell 5.1 trong phiên audit (environmental, không phải lỗi sản phẩm); chạy lại bình thường thì pass.

### Không chạy / chưa verify
- `npm run contract:proof` — **không chạy** vì script tạm thời sửa `contracts/openapi.yaml` (file tracked), trái ràng buộc audit.
- Không chạy destructive reproduction của F-01 (sẽ xoá DB dev).
- Chưa audit sâu `.agents/`, `_bmad/`, `docs/product`, `docs/ux`, toàn bộ template của `ChallengesView.vue` (phần UI markup), `scripts/verify-local.ps1`.
- Không có môi trường production để kiểm tra cấu hình TLS/proxy/header thật.
- Không chạy `npm audit`/`composer audit` (cần network; ngoài phạm vi engineering risk đã có bằng chứng).

---

## 4. Critical Findings

**Không có finding CRITICAL.** Không tìm thấy đường khai thác security, mất dữ liệu không phục hồi được, hay production failure nền tảng có bằng chứng từ repository.

---

## 5. High-Priority Findings

**Không có finding HIGH.** Các ứng viên đã được kiểm tra và hạ mức sau khi verify:
- IDOR/ownership: mọi query và write đều scope `owner_id` và nằm sau middleware `owner`; mô hình chỉ có một owner (unique partial index `users_single_owner`). → không có IDOR.
- Lost update / race: mọi write serialize qua row lock `account_states` + version check; có test 2-connection thật. → không có race có bằng chứng.
- Duplicate write khi retry: idempotency record được ghi trong cùng transaction với mutation. → an toàn.

---

## 6. Medium-Priority Findings

### F-01
- **Severity:** MEDIUM
- **Confidence:** HIGH (cơ chế VERIFIED bằng config; chưa tái hiện vì mang tính destructive)
- **Category:** test-safety / data-loss (local)
- **Location:** `backend/phpunit.xml:33`, `compose.local.yaml:43`, `backend/tests/Feature/JournalConflictConcurrencyTest.php:22-27`, `backend/tests/TestCase.php`
- **Evidence:**
  - `phpunit.xml` đặt `<env name="DB_DATABASE" value="noteflow_test"/>` **không có** `force="true"` (trong khi `APP_DEBUG` ở dòng 25 lại có `force="true"`). Theo semantics của PHPUnit, `<env>` không ghi đè biến môi trường đã tồn tại.
  - Container dev `backend` export sẵn `DB_DATABASE=noteflow`, `DB_HOST=postgres`, `APP_ENV=local`.
  - 11 file test dùng `RefreshDatabase` (chạy `migrate:fresh`); các concurrency test còn `DB::table('users')->delete()` ở `beforeEach/afterEach` mà không có guard.
  - Chỉ có `scripts/local.ps1` (`Assert-TestIdentity`) và `tests/e2e/helpers/db-helper.php:16-26` là có guard fail-closed. `TestCase` backend không có guard nào.
- **Problem:** `docker compose exec backend php artisan test` — lệnh rất tự nhiên với người/agent vì README nói "backend does not run PHP on the Windows host" — sẽ chạy test trên DB dev và xoá sạch dữ liệu local.
- **Impact:** Mất dữ liệu môi trường local (owner, challenge, journal đang dùng để test tay). Với workflow nhiều AI agent chạy lệnh trong repo, xác suất xảy ra không thấp.
- **Recommendation:** Thêm guard trong `Tests\TestCase::setUp()` (hoặc bootstrap PHPUnit) fail ngay nếu `APP_ENV !== 'testing'` hoặc `DB_DATABASE !== 'noteflow_test'`; cân nhắc `force="true"` cho các biến DB trong `phpunit.xml`. Đồng bộ với guard đã có ở `db-helper.php`.

### F-02
- **Severity:** MEDIUM
- **Confidence:** HIGH (VERIFIED bằng request thật tới backend-test)
- **Category:** correctness / API contract / session handling
- **Location:** `backend/bootstrap/app.php:30-41`, `frontend/src/stores/journalDrafts.ts:425-439`, `frontend/src/views/ChallengesView.vue` (catch của `submitCreate`/`submitEdit`), `contracts/openapi.yaml` (các PUT/POST/PATCH)
- **Evidence:**
  - Probe: có session hợp lệ nhưng chưa login → `PUT /api/v1/challenges/{id}/journals/{date}` trả `401 {"message":"Unauthenticated."}`. Bỏ session cookie (mô phỏng hết hạn), giữ XSRF cookie/header → trả **`419 {"message":"CSRF token mismatch."}`**. Lý do: Sanctum `statefulApi` chạy `StartSession` + CSRF **trước** `auth:sanctum`.
  - Custom render cho 419 ở `bootstrap/app.php` chỉ áp dụng cho `login`/`logout`.
  - Frontend journal xử lý riêng 401/403 (`refreshSession`, quarantine); 419 rơi vào nhánh generic 4xx (`journalDrafts.ts:431`) → xoá `pendingCommand`, hiển thị message tiếng Anh "CSRF token mismatch." trong UI tiếng Việt. ChallengesView hiển thị nguyên `error.message`.
  - OpenAPI không khai báo 419 cho bất kỳ endpoint `/api/v1/*` nào; frontend test không có case 419 cho journal/challenge.
- **Problem:** Luồng "session expired" được thiết kế và test rất kỹ cho 401, nhưng trong trường hợp phổ biến nhất (session hết hạn sau 120 phút) server lại trả 419, nên toàn bộ luồng đó bị bỏ qua.
- **Impact:** Người dùng thấy lỗi khó hiểu. Draft vẫn còn trong memory, và lần poll kế tiếp (GET, không check CSRF) trả 401 sẽ chuyển UI về guest, nên **không mất dữ liệu** — nhưng hành vi thực tế khác với hành vi đã thiết kế và test.
- **Recommendation:** Chọn một trong hai: (a) map `TokenMismatchException` trên `/api/*` thành payload có `code: csrf_expired` và cho client xử lý 419 như "session không còn hợp lệ → refreshSession"; hoặc (b) client coi 419 tương đương 401 trong `handleSaveError` và các mutation của Challenge. Khai báo 419 trong OpenAPI và thêm test.

### F-03
- **Severity:** MEDIUM
- **Confidence:** HIGH (VERIFIED bằng code + test hiện có)
- **Category:** data integrity / operational safety
- **Location:** `backend/app/Console/Commands/ProvisionOwner.php:35-56`; `backend/tests/Feature/ProvisionOwnerCommandTest.php:30`
- **Evidence:** Khi provision với email khác owner hiện tại: đặt `is_owner=false` cho owner cũ (dòng 37), **xoá `account_states` của owner cũ** (dòng 47), xoá session. Challenge, target period và daily record của owner cũ vẫn gắn `owner_id` cũ. Test "reprovisioning transfers owner admission" xác nhận đây là hành vi chủ đích, nhưng không có bước chuyển dữ liệu hay xác nhận.
- **Problem:** Một lỗi gõ email khi chạy `local.ps1 owner` hoặc `noteflow:provision-owner` sẽ làm **toàn bộ dữ liệu biến mất khỏi ứng dụng** mà không cảnh báo. Revision/epoch của owner cũ cũng bị mất.
- **Impact:** Dữ liệu vẫn còn trong DB và khôi phục được bằng cách chạy lại lệnh với email cũ, nhưng revision/epoch đã bị reset. Khi backup/restore (Epic 6) dựa trên `account_states`, hành vi này càng rủi ro hơn.
- **Recommendation:** Khi email khác owner hiện tại: yêu cầu `--transfer`/`--force` và xác nhận tương tác, in số lượng challenge sẽ bị ẩn; hoặc chuyển dữ liệu sang owner mới. Không xoá `account_states` mà không có kế hoạch.

### F-04
- **Severity:** MEDIUM
- **Confidence:** HIGH (VERIFIED qua framework source; chưa chạy end-to-end)
- **Category:** data fidelity / correctness
- **Location:** `backend/vendor/laravel/framework/src/Illuminate/Foundation/Configuration/Middleware.php:461-462` (global `TrimStrings`, `ConvertEmptyStringsToNull`); `backend/bootstrap/app.php` (không loại trừ); `SaveJournalUseCase.php:84`; `journalDrafts.ts:611-622`
- **Evidence:** Global middleware mặc định của Laravel trim mọi string trong request (trừ các field password). `bootstrap/app.php` không cấu hình `trimStrings(except: ...)`. Vì vậy trường `journal` bị trim trước validation, trước khi tính idempotency hash và trước khi lưu. Sau khi ACK, client đặt `record.text = result.journal.journal`, nên text trong editor bị thay bằng bản đã trim.
- **Problem:** Nội dung người dùng gửi khác nội dung được lưu: mất thụt đầu dòng đầu tiên và mất newline/khoảng trắng cuối. Không có test hay tài liệu nào nói đây là chủ đích.
- **Impact:** Với journal, ảnh hưởng nhỏ. Với Notes (Epic 4, "chỉnh sửa tự lưu"), cùng pipeline này sẽ làm hỏng markdown/code block và tạo vòng lặp dirty/saved khi autosave (text local ≠ text server).
- **Recommendation:** Ra quyết định sản phẩm rõ ràng. Nếu cần giữ nguyên văn bản: thêm `$middleware->trimStrings(except: ['journal', ...])` và `convertEmptyStringsToNull(except: ...)` cho field nội dung, kèm test round-trip (khoảng trắng đầu/cuối, `\r\n`).

### F-05
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** architecture drift (CONTRADICTED)
- **Location:** `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md:32, 211`; `README.md:146-148`; `backend/app/Modules/README.md`; `backend/app/Modules/Challenges/**`
- **Evidence:**
  - Spine: "Application use cases own transactions and invoke pure domain rules… Adapters implement persistence" và mỗi module "has Domain, Application, Infrastructure".
  - Thực tế: `Challenges/Domain` chỉ có 8 exception class; `Challenges` không có `Infrastructure`. Mọi use case gọi `Illuminate\Support\Facades\DB` trực tiếp. Business rule (tên ≤255, target 1–7, cửa sổ ngày journal, no-op detection) nằm inline trong use case, và một phần còn lặp lại ở controller.
- **Problem:** Tài liệu mà agent đọc trước tiên mô tả một kiến trúc không tồn tại. Session AI tiếp theo sẽ chọn ngẫu nhiên giữa "làm theo docs" và "làm theo code hiện có", tạo thêm drift.
- **Impact:** Epic 3 cần "one domain engine" thuần (streak, weekly progress). Với pattern hiện tại, engine đó dễ bị viết lẫn SQL, không unit-test được bằng fixed clock/data. Chi phí sửa tăng theo số story.
- **Recommendation:** Không cần rewrite. Chọn một hướng: (a) **khuyến nghị**: giữ transaction script cho CRUD/command handling, chỉ tách *pure domain* cho logic tính toán (validation rule, date window, streak engine) thành class PHP thuần — rồi sửa Spine/README cho đúng; hoặc (b) giữ docs và thêm persistence port. Dù chọn hướng nào, ghi thành ADR.

### F-06
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** duplication / maintainability (backend)
- **Location:** `CreateChallengeUseCase.php:40-87`, `UpdateChallengeMetadataUseCase.php:35-83`, `SaveJournalUseCase.php:26-64`; `ChallengeController.php:35-114, 133-224`; `ChallengeJournalController.php:42-105`; `GetJournalQuery.php:25-32` vs `SaveJournalUseCase.php:74-83`; serialization challenge lặp ở `GetChallengeListQuery`, `GetChallengeDetailQuery`, `Create…`, `Update…` (+ conflict snapshot)
- **Evidence (representative):**
  - Preamble "lock account_states → missing-state LogicException → write fence → epoch check → canonical hash → lookup mutation_commands" được copy 3 lần.
  - Idempotency không nhất quán: journal kiểm tra `command_type === 'save_challenge_journal'`, còn create/update chỉ so hash (hiện vẫn an toàn vì tập key của hash khác nhau, nhưng đây là bất biến ngầm).
  - Controller: whitelist field + `Validator::make` + kiểm tra tên + 5–6 `catch` map exception → JSON lặp lại gần như nguyên văn; `Str::isUuid($id) → 404` lặp 4 lần.
  - Validation tên ở controller (`ChallengeController.php:69-75`) khiến `InvalidChallengeNameException`/`InvalidTargetDaysException` trong use case không bao giờ xảy ra qua HTTP (nhánh catch chết).
  - Lookup "latest target period" lặp 3 lần.
- **Problem:** Không có pipeline dùng chung cho command có idempotency/version. Mỗi story mới (Done/undo, archive, notes, events) sẽ copy thêm một bản.
- **Impact:** Sửa một bất biến (ví dụ retention của `mutation_commands`, format lỗi, rule epoch) phải sửa N chỗ; bỏ sót một chỗ là lỗi đồng bộ khó phát hiện.
- **Recommendation:** Tách `MutationCommandRunner` (lock + fence + epoch + idempotency + record) nhận closure business; một exception→response mapper tập trung (`withExceptions` hoặc base controller); FormRequest cho từng endpoint; `ChallengeReadModel` cho serialization; `->whereUuid('id')` ở route. Làm từng bước, giữ nguyên contract.

### F-07
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** frontend architecture / correctness coupling
- **Location:** `frontend/src/stores/sync.ts:147, 150, 347, 398-406`; `frontend/src/components/ChallengeJournalEditor.vue` (query key `['challenge-journal', …]`)
- **Evidence:**
  - Sync coordinator hard-code `queryKey: ['challenges']` ở 3 chỗ. Query journal dùng key `['challenge-journal', id, date]`, nên **không bao giờ được hội tụ** khi revision tăng từ thiết bị khác; chỉ phát hiện khác biệt khi save nhận 409 hoặc khi remount.
  - `reconcileBeforeWrite` chặn mọi write nếu `syncStatus === 'error'`, mà trạng thái này bị set khi *refetch danh sách challenge* fail (`sync.ts:165-171`). Như vậy lưu journal bị chặn vì một query không liên quan bị lỗi.
- **Problem:** Sync logic biết cụ thể từng feature. Mỗi feature mới (Notes, Calendar) phải nhớ sửa `sync.ts`; nếu quên, dữ liệu stale sẽ lặng lẽ hiển thị. Đồng thời write availability bị ghép với read health.
- **Impact:** Stale UI giữa thiết bị (OCC chặn được mất dữ liệu nhưng UX kém); write bị chặn không cần thiết. Rủi ro tăng tuyến tính theo số feature.
- **Recommendation:** Dùng prefix/namespace chung (ví dụ `['account', ...]`) hoặc registry query key do mỗi feature đăng ký; tách "account context reconcile" (điều kiện cho write) khỏi "query convergence" (best-effort, không chặn write). Cân nhắc bỏ round-trip reconcile trước mỗi write vì server đã enforce epoch/fence (lỗi 409/423 đã được xử lý).

### F-08
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** inconsistency / giant component (frontend)
- **Location:** `frontend/src/views/ChallengesView.vue` (905 dòng); `frontend/src/stores/journalDrafts.ts` (771 dòng)
- **Evidence:**
  - Hai cách giải cùng một bài toán "command idempotent + retry + conflict + epoch change":
    - Challenge: `activeCreateCommandId`/`lastCreateCanonicalPayload`/`activeEditAuthGen`/`epochChangeBlocked`/`editConflictSnapshot` lưu trong component ref; khi conflict, người dùng phải huỷ và bắt đầu lại ("Vui lòng làm mới trang…").
    - Journal: store riêng, `pendingCommand` đóng băng, lựa chọn local/server có fencing đầy đủ, trạng thái quarantine.
  - `ChallengesView` gộp list, detail, create form, edit form, conflict UI, epoch rebase và host journal editor trong một file. Comment tham chiếu ID review (`S14-F02`, `Finding 4`, `Item 7`) — dấu vết của nhiều session AI vá lỗi chồng lên nhau.
- **Problem:** Không có abstraction "offline-safe command" dùng chung. Feature sau (Done/undo Epic 2.2/2.6, Notes 4.3/4.5) sẽ phải chọn một trong hai pattern hoặc tạo pattern thứ ba.
- **Impact:** UX conflict không nhất quán; state machine phức tạp nằm rải rác; chi phí review mỗi thay đổi cao.
- **Recommendation:** Tổng quát hoá phần lõi của `journalDrafts` (pending command, fencing, ACK handling) thành một composable/store generic theo resource; tách `ChallengesView` thành `ChallengeList`, `ChallengeDetail`, `ChallengeForm`. Làm khi bắt đầu story tiếp theo có write, không cần làm riêng.

### F-09
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** API contract drift
- **Location:** `contracts/openapi.yaml` (`CreateChallengeRequest`, `UpdateChallengeMetadataRequest`, `SaveJournalRequest`, response của `/api/v1/*`); `ChallengeController.php:187`
- **Evidence:**
  - `name`: contract không có `maxLength`; server từ chối >255 (422).
  - `UpdateChallengeMetadataRequest.description` không required, nhưng controller coi *thiếu field* là `null` → **PATCH `{name}` sẽ xoá description hiện có** (`ChallengeController.php:187`; no-op check dẫn tới update). Frontend hiện tại luôn gửi `description` nên lỗi đang ẩn (latent).
  - `journal`: không có `maxLength` ở cả contract lẫn server (cột `text`, giới hạn duy nhất là `post_max_size` của PHP).
  - 419 không được khai báo cho API (xem F-02). `current_version` trong `ProblemDetails` không có `minimum`.
  - Format lỗi có 3 dạng: `ValidationError {message, errors}`, `ProblemDetails {code, message, …}` (gắn `application/problem+json` nhưng không theo RFC 9457: thiếu `type/title/status`), và `ApiError {message}`.
- **Problem:** Contract là "canonical wire contract" nhưng không mô tả hết rule mà runtime enforce. Generated TS types vì thế không bảo vệ client khỏi các lỗi này.
- **Impact:** Client/agent mới làm theo contract sẽ gặp 422 bất ngờ hoặc vô tình xoá description.
- **Recommendation:** Bổ sung `maxLength`, định nghĩa rõ semantics PATCH (đổi `description` thành required-nullable, hoặc chỉ cập nhật khi key có mặt), thêm giới hạn độ dài journal ở cả hai phía, khai báo 419. Contract test hiện có đã đủ hạ tầng để khoá những điều này.

### F-10
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** documentation drift (quan trọng vì agent-driven workflow)
- **Location:** `README.md:150-153`, `README.md` mục "Quality gates" (mô tả phạm vi Playwright), `README.md:45-48`, `ARCHITECTURE-SPINE.md:211`
- **Evidence:**
  - README: "This foundation contains no Challenge, Notes, Today, Calendar, Search, or Backup domain behavior" — **CONTRADICTED**: Challenge, Journal và Today đã được implement.
  - Mô tả phạm vi Playwright chỉ nêu shell/foundation/deep link/overflow, trong khi suite thực tế còn có challenges, account-time, cross-device sync.
  - README ghi password local cố định (`NF-local-admin-2026!X7q`), nhưng không có seeder/script nào tạo tài khoản này (`DatabaseSeeder` tạo `test@example.com` non-owner) → không tái tạo được, đồng thời để lộ một password trong file tracked.
- **Problem:** `CLAUDE.md`/`AGENTS.md` hướng agent đọc tài liệu trước; tài liệu sai dẫn tới quyết định sai.
- **Impact:** Agent có thể "bổ sung" lại feature đã có, hoặc tin rằng không có domain behavior cần bảo vệ.
- **Recommendation:** Cập nhật README theo trạng thái thật (feature list, E2E scope). Bỏ password khỏi README (dùng `local.ps1 owner`), hoặc tạo seeder local có guard `APP_ENV=local`.

### F-11
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Category:** test coverage gap
- **Location:** `tests/e2e/*.spec.ts`; `frontend/src/stores/__tests__/journalDrafts.spec.ts`; `backend/tests/Feature/*Concurrency*`
- **Evidence:**
  - `grep journal tests/e2e/*.spec.ts` → **0 kết quả**: flow phức tạp nhất (Story 1.5/1.6: retry uncertain command, conflict keep-local/use-server, quarantine) không có test ở mức browser.
  - Test frontend mock rất nhiều (journalDrafts.spec: 48 lần `vi.mock/fn/spyOn`, sync.spec: 32), nên chỉ kiểm chứng state machine với giả định về server — và giả định đó đã sai ở F-02 (không có test 419).
  - Concurrency test backend tự `delete()` bảng thay vì dùng `RefreshDatabase` (liên quan F-01).
- **Problem:** Test mạnh ở đơn vị nhưng thiếu kiểm chứng tích hợp đúng ở nơi rủi ro cao nhất.
- **Impact:** Regression trong luồng conflict/retry của journal (hotspot của các session AI) có thể lọt qua CI xanh.
- **Recommendation:** Thêm 2–3 E2E cho journal: save → reload; hai context tạo conflict → chọn local/server; mất session khi đang có draft (sẽ bắt được F-02). Thêm unit test cho 419.

---

## 7. Low-Priority Findings

### F-12 — Dead code và scaffold còn sót
- **Severity:** LOW · **Confidence:** HIGH · **Category:** AI leftovers
- **Location/Evidence:**
  - `frontend/src/views/FoundationView.vue`, `DeepLinkView.vue`: không được import ở đâu (từ commit foundation `7cbfa9e`); `getFoundationHealth` (`api/http.ts`) chỉ được dùng bởi view orphan và test của nó.
  - `getChallenge()` (`api/challenges.ts:162`) không được production code gọi; route `GET /api/v1/challenges/{id}` chỉ được test dùng (detail view lấy dữ liệu từ list query).
  - `setQueryClient` trong `sync.ts` chỉ phục vụ test.
  - `DatabaseSeeder` tạo user non-owner, không có `account_states` — scaffold Laravel mặc định.
  - Bảng `personal_access_tokens` và `password_reset_tokens`: không dùng (không có `HasApiTokens`; README nói reset password cố ý không có).
  - Cột `mutation_commands.response_status` và `resource_id` được ghi nhưng không bao giờ đọc (replay luôn trả status cố định từ controller).
  - `frontend/src/modules/.gitkeep`, `backend/tests/Unit/.gitkeep` (thư mục đã có test), `routes/console.php` còn lệnh `inspire`.
  - `JournalConflictConcurrencyTest` tạo `User::create(['id' => Str::uuid(), …])` cho cột bigint (bị bỏ qua nhờ fillable — một assumption sai vô hại).
- **Recommendation:** Xoá theo lô trong một PR cleanup. Riêng `getChallenge`, giữ lại nếu sắp dùng.

### F-13 — HTTP client phân mảnh ở frontend
- **Severity:** LOW · **Confidence:** HIGH · **Category:** duplication
- **Evidence:** 4 wrapper `fetch` riêng (`api/http.ts`, `api/auth.ts#unsafeRequest`, `api/account.ts`, `api/challenges.ts#requestJson`); `xsrfToken()` copy nguyên văn ở `auth.ts:19-26` và `challenges.ts:85-93`; 3 class lỗi (`AuthenticationError`, `AccountContextError`, `ChallengeApiError`) cùng mang `status`; file `http.ts` chỉ chứa health check (tên gây hiểu nhầm).
- **Impact:** Xử lý 401/419/network không thống nhất (góp phần vào F-02).
- **Recommendation:** Một `apiRequest()` dùng chung (XSRF, Accept, parse lỗi, phân loại status) để các module feature dùng lại.

### F-14 — Listener `visibilitychange` bị đăng ký hai lần
- **Severity:** LOW · **Confidence:** HIGH
- **Location:** `frontend/src/stores/sync.ts:494-497`
- **Evidence:** Handler đăng ký cả trên `window` và `document`. Theo HTML spec, `visibilitychange` bắn ở `document` với `bubbles: true` nên lan tới `window` → handler chạy 2 lần, gọi `reconcile(true)` 2 lần (lần thứ hai được dedupe bởi `activeReconcileInfo`, nhưng vẫn reset `consecutiveFailures`).
- **Recommendation:** Chỉ giữ listener trên `document`.

### F-15 — Không có cơ chế dọn `mutation_commands`
- **Severity:** LOW · **Confidence:** HIGH
- **Evidence:** Mọi write (kể cả no-op) insert một dòng có full JSON response; không có scheduler/prune. Với 1 người dùng, tăng trưởng chậm.
- **Recommendation:** Định nghĩa retention (ví dụ 30 ngày, hoặc xoá khi epoch tăng) trước Epic 6.

### F-16 — Hardening production chưa có
- **Severity:** LOW (vì chưa deploy) · **Confidence:** MEDIUM
- **Location:** `deploy/nginx/noteflow.conf`, `backend/bootstrap/app.php`, `backend/.env.example`
- **Evidence:** Nginx chỉ `listen 80` và không có `add_header` nào (không có CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, HSTS). Không cấu hình `trustProxies` dù deploy README nói TLS có thể terminate ở load balancer. Không có production env example (`SANCTUM_STATEFUL_DOMAINS`, `SESSION_SECURE_COOKIE=true`, `APP_DEBUG=false`) và không validate env khi boot.
- **Recommendation:** Làm checklist "production readiness" trước release đầu tiên; không cần làm ngay.

### F-17 — Rò rỉ nhỏ ở mô hình auth
- **Severity:** LOW · **Confidence:** HIGH
- **Evidence:** `User` cho phép mass-assign `is_owner` (`#[Fillable([... 'is_owner'])]`) — hiện không có đường request nào mass-assign, nhưng đây là cờ phân quyền. Rate limit login chỉ theo `email|ip` (5/phút), nên không giới hạn tổng số lần thử vào email owner từ nhiều IP. `redirect_to` chỉ cho phép route top-level, nên deep link `/challenges/:id` bị mất sau khi login.
- **Recommendation:** Bỏ `is_owner` khỏi fillable (dùng `forceFill` trong ProvisionOwner). Cân nhắc thêm limiter theo email toàn cục.

---

## 8. Security Assessment

| Hạng mục | Đánh giá | Trạng thái |
|---|---|---|
| Authentication | Sanctum SPA cookie; `Auth::attempt` kèm `is_owner=true`; session regenerate khi login; invalidate + regenerate token khi logout; password hashed cast; ProvisionOwner đọc password qua prompt ẩn | VERIFIED tốt |
| Authorization / IDOR | Middleware `owner` trên mọi route private; mọi query `where owner_id`; một owner duy nhất (partial unique index) | VERIFIED — không có IDOR |
| CSRF | `statefulApi()` + `X-XSRF-TOKEN`; login/logout nằm trong web group | VERIFIED |
| Open redirect | `redirect_to` theo allowlist ở server (`AuthenticatedSessionController:16,67-70`) | VERIFIED an toàn |
| XSS | Không có `v-html`/`innerHTML` trong `frontend/src` | VERIFIED |
| SQL injection | Chỉ dùng query builder có binding; raw SQL duy nhất nằm trong migration với literal | VERIFIED |
| Caching dữ liệu private | `private.no-store` trên mọi route private + login/logout/session | VERIFIED |
| Secrets | Không có secret production trong repo; `.env` được ignore; `deploy/local/.env` sinh ngẫu nhiên. README chứa password local (F-10); CI dùng APP_KEY giả cho test | Chấp nhận được, trừ F-10 |
| Rate limiting | Login 5/phút theo email+IP; API không có limiter (chấp nhận được với single owner đã auth) | LOW (F-17) |
| Error disclosure | `APP_DEBUG=true` chỉ ở local/.env.example; config mặc định là `false` | Cần checklist prod (F-16) |
| Session expiry handling | 419 vs 401 (F-02) | MEDIUM, không phải lỗ hổng |
| Headers/TLS | Chưa có (F-16) | NEEDS VERIFICATION khi deploy |

**Kết luận:** không có vulnerability có đường khai thác thực tế. Các điểm còn lại là hardening trước production.

---

## 9. Architecture Assessment

- **Hình dạng tổng thể hợp lý với scale:** modular monolith, same-origin, một DB, không queue/Redis. Đây là lựa chọn đúng; **không nên** tách service.
- **Ranh giới FE/BE:** tốt nhờ OpenAPI + generated types + contract test hai phía.
- **Ranh giới trong backend:** yếu. Controller làm quá nhiều (validation, normalization, mapping lỗi), use case làm tất cả phần còn lại (SQL, rule, serialization). "Domain" gần như rỗng (F-05). Dependency direction vẫn đúng (không có vòng; Domain không phụ thuộc Laravel) — đơn giản vì Domain gần như không có gì.
- **Concurrency architecture (AD-6):** điểm sáng. Một row lock per owner đơn giản, đúng, và có bằng chứng test. Nó serialize mọi write của owner — hoàn toàn phù hợp với single-user.
- **Frontend state:** 4 Pinia store + TanStack Query. Ranh giới "server state (Query) vs client state (Pinia)" về cơ bản đúng, nhưng `sync.ts` vừa quản lý account context (ghi đè `account.context`/`account.status` từ ngoài store `account`), vừa điều phối cache Query — hidden coupling giữa các store (F-07).
- **Configuration architecture:** hai nguồn env cho local (`backend/.env` cho host, `compose.local.yaml` inline cho Docker) cộng `phpunit.xml` và CI env — dễ drift (xem F-01).
- **Error handling architecture:** không có mapper tập trung; mỗi controller tự map (F-06); frontend mỗi API module tự parse (F-13).

---

## 10. Vibe-Code / AI-Generated-Code Smells

| Smell | Bằng chứng | Mức |
|---|---|---|
| Copy-paste theo story | Mutation preamble ×3, error mapping ×3, serialization ×4–5, date validation ×2 (F-06) | Cao |
| Hai pattern cho cùng bài toán | Command/conflict trong component ref vs store (F-08) | Cao |
| Comment tham chiếu review ID | `S14-F02`, `S14-F05`, `Finding 3`, `Item 7`, `AC3, AD-8` rải trong `sync.ts`, `ChallengesView.vue`, use case | Trung bình — comment mô tả *lịch sử vá* thay vì *lý do* |
| Defensive code chồng lớp | Kiểm tra fence/epoch/auth generation lặp nhiều lần trong một hàm (`journalDrafts.performSave` kiểm tra auth/epoch 5 lần); validation tên ở cả controller và use case | Trung bình |
| Hallucinated architecture | "Ports-and-adapters/pure domain" trên giấy (F-05); `Contracts/Clock` là port hợp lệ duy nhất | Trung bình |
| Fake completeness | `/notes`, `/calendar` là placeholder (có chủ đích, đúng backlog); `write_state='locked_for_import'` và `data_epoch` > 1 không có code path nào tạo ra (dành cho Epic 6 — speculative nhưng đã có contract và test) | Thấp — có chủ đích |
| Leftovers | F-12 | Thấp |
| Unreachable branch | catch `InvalidTargetDaysException`/`InvalidChallengeNameException` trong controller (F-06) | Thấp |

**Không thấy:** swallowed exception nguy hiểm (các `catch {}` ở frontend đều có chủ đích và comment), mock data lọt vào production, endpoint trả placeholder, button không có tác dụng.

---

## 11. Correctness & Data Integrity

**Đã trace end-to-end:** create challenge, update metadata, read/save journal, login/logout/session expiry, sync poll.

| Kiểm tra | Kết quả |
|---|---|
| Atomicity | Mỗi mutation nằm trong một `DB::transaction` gồm write + revision + idempotency record — VERIFIED |
| Race / lost update | Row lock account + base version — VERIFIED bằng test 2 connection |
| Idempotency | Replay trả response đã lưu; reuse key với payload khác → 409 — VERIFIED. Không nhất quán `command_type` (F-06) |
| Retry an toàn phía client | Journal giữ nguyên `command_id` + body khi kết quả không xác định; challenge giữ `command_id` khi payload không đổi — VERIFIED |
| Timezone/date | Ngày tài khoản cố định `Asia/Ho_Chi_Minh` (CHECK constraint DB); `start_date` và cửa sổ journal tính theo account date qua `Clock` inject; timestamp lưu UTC, app timezone UTC — VERIFIED nhất quán |
| Tuần | `AccountTimeContext` tính tuần bắt đầu thứ Hai, có unit test — VERIFIED |
| Data fidelity | Journal bị trim (F-04) |
| Owner transfer | Dữ liệu cũ bị ẩn (F-03) |
| PATCH semantics | Thiếu `description` = xoá (F-09, latent) |
| Stale state cross-device | Journal query không được hội tụ (F-07); OCC ngăn mất dữ liệu |
| Session expiry | 419 bypass luồng 401 (F-02) |

---

## 12. Frontend Assessment

- **Tốt:** router guard kiểm session trước route private; logout xoá toàn bộ query cache + private store qua `registerPrivateStateReset`; cảnh báo `beforeunload` khi có draft; loading/error/empty state có mặt ở TodayView/ChallengesView/Journal editor; `role="status"/"alert"`, label cho form; test responsive E2E ở 390px.
- **Vấn đề:**
  - `ChallengesView.vue` 905 dòng — giant component (F-08).
  - Business logic (canonical payload, command id lifecycle, epoch handling) nằm trong view (F-08).
  - Sync coupling cứng với query key (F-07); listener kép (F-14).
  - HTTP layer phân mảnh (F-13).
  - Draft chỉ tồn tại trong memory (có `beforeunload` guard, nhưng nếu tab crash/reload vẫn mất). Đây là quyết định chấp nhận được, nên được ghi rõ khi triển khai Notes/autosave.
  - `sync.ts` ghi trực tiếp vào state của store `account` (`account.context = …`, `account.status = 'ready'`) — mutation xuyên store, khó theo dõi.

---

## 13. Backend & API Assessment

- **Routes:** gọn, versioned `/api/v1`, middleware đồng nhất. Có thể dùng `Route::middleware([...])->group()` để bớt lặp 8 lần (cosmetic).
- **HTTP semantics:** 201 cho create, 200 cho update/save, 409 conflict, 423 write fence, 422 validation, 404 cho non-UUID/không thuộc owner (không lộ sự tồn tại) — hợp lý.
- **Validation:** thủ công bằng `Validator::make` + whitelist field thay vì FormRequest (LoginRequest thì dùng FormRequest) — hai convention song song. Chiều dài tên được kiểm ở 2 nơi.
- **Contract:** xem F-09. Backend contract test dùng `league/openapi-psr7-validator` validate response thật — đây là điểm mạnh nên giữ.
- **Error format:** 3 dạng (F-09).

---

## 14. Database Assessment

| Khía cạnh | Đánh giá |
|---|---|
| Ownership | Composite FK `(owner_id, challenge_id) → challenges(owner_id, id)` trên target periods và daily records — tốt |
| Invariant ở DB | Một owner (partial unique), timezone cố định (CHECK), `write_state` enum (CHECK), target 1–7 (CHECK), unique `(challenge_id, effective_from)`, PK `(challenge_id, local_date)` — tốt, đúng tinh thần Spine AD-10 |
| Idempotency | Unique `(owner_id, data_epoch, command_id)` — tốt |
| Cascade | `cascadeOnDelete` từ users/challenges — phù hợp; hiện không có endpoint delete |
| Index | Đủ cho truy vấn hiện tại (`owner_id, created_at`; `owner_id, challenge_id`) |
| Migration | Thứ tự hợp lệ; có backfill cho owner có sẵn; `down()` đầy đủ. `unsignedInteger` trên PostgreSQL không tạo ràng buộc ≥0 (Laravel map sang `integer`) — version/revision chỉ được bảo vệ ở tầng app (LOW) |
| Thiếu | Không có CHECK `journal` non-blank hoặc độ dài; không có retention cho `mutation_commands` (F-15); `challenge_daily_records.is_done/completion_version` đã tạo trước cho Epic 2.2 nhưng chưa dùng |
| N+1 | Không có: list query lấy target periods theo batch `whereIn` |

---

## 15. Test Assessment

- **Số liệu:** backend 86 test / 514 assertion; frontend 125 unit test; E2E 29 pass + 5 skip. PHPStan level 6 sạch.
- **Điểm mạnh thực sự:**
  - Backend test chạy trên PostgreSQL thật (không SQLite), có test lock 2 connection, test contract validate response thật theo OpenAPI.
  - Frontend test kiểm từng nhánh fencing của state machine (late ACK, epoch đổi, auth generation đổi, double submit).
  - E2E có cross-device thật với 2 browser context.
- **Điểm yếu:**
  - Không có E2E cho journal (F-11).
  - Không có test 419 (F-02) và test round-trip whitespace (F-04).
  - Frontend unit test phụ thuộc mock → chỉ kiểm được hành vi theo *giả định* về server.
  - Test suite backend không có DB guard (F-01).
  - `http.spec.ts` test code orphan (F-12).
  - Flaky risk: cross-device E2E dựa trên polling 5s; retry 1 lần trong CI — chấp nhận được.
- **Kết luận:** test đủ bắt regression ở tầng backend write path và ở từng unit của state machine; **chưa đủ** cho tích hợp client↔server của journal/session.

---

## 16. Dependencies & Configuration

- **Dependency runtime frontend tối giản** (vue, vue-router, pinia, @tanstack/vue-query) — tốt; không có hai thư viện cùng mục đích.
- `@emnapi/wasi-threads` và `tslib` được pin làm devDependency để workaround lỗi lockfile npm; lý do đã được ghi trong README — chấp nhận.
- Backend: `laravel/tinker` nằm trong `require` (mặc định của scaffold, không nguy hiểm); `laravel/pail` dev không dùng — LOW.
- `composer.json` để `"minimum-stability": "dev"` + `prefer-stable` (mặc định Laravel) — chấp nhận.
- **Environment drift:** biến DB được định nghĩa ở 5 nơi (`backend/.env.example`, `compose.local.yaml` dev + test, `phpunit.xml`, CI, `playwright.config.ts` với default port `55414`) → nguồn gốc của F-01. Default `DB_PORT` 55414 trong Playwright không khớp tài liệu nào khác (UNCERTAIN — có thể dành cho postgres native của một máy cụ thể).
- Không validate env khi boot (F-16).

---

## 17. Performance Assessment

Scale mục tiêu: 1 owner, vài thiết bị. Không phát hiện vấn đề hiệu năng có bằng chứng.
- Polling 5s `GET /account` (một lần đọc PK) và refetch list khi revision đổi — rẻ.
- Mỗi write tốn thêm một round-trip `GET /account` (reconcileBeforeWrite) — tăng độ trễ chứ không phải vấn đề tải (F-07).
- List challenge không phân trang — **Accept** ở scale này.
- Có thể tối ưu vitest environment (log gợi ý `pool: 'vmThreads'`) — cosmetic.

---

## 18. Documentation Drift

| Tài liệu | Claim | Thực tế | Trạng thái |
|---|---|---|---|
| README.md:150 | Không có Challenge/Today domain behavior | Có Challenge, Journal, Today | CONTRADICTED |
| README "Quality gates" | E2E chỉ cover shell/foundation/deep link/overflow | Còn challenges, account time, cross-device | Stale |
| README.md:45-48 | Tài khoản local admin@example.com + password | Không có cơ chế tạo trong repo | Không tái tạo được / lộ password |
| README.md:146-148, Modules/README | Domain thuần, dependency direction UI→API→Application→Domain | Domain chỉ có exception, Application gọi DB trực tiếp | CONTRADICTED (một phần) |
| ARCHITECTURE-SPINE.md:32 | Ports-and-adapters, adapters cho persistence | Không có persistence port | CONTRADICTED |
| ARCHITECTURE-SPINE.md:211 | Mỗi module có Domain/Application/Infrastructure | Challenges không có Infrastructure | CONTRADICTED |
| ARCHITECTURE-SPINE AD-6 | Versioned, idempotent mutations với base version + epoch | Đúng như mô tả | VERIFIED |
| ARCHITECTURE-SPINE AD-10 | Constraint DB cho owner FK, target 1–7, unique challenge/date | Đúng | VERIFIED |
| deploy/README.md | Nginx route `/api`, `/sanctum`, `/login`, `/logout`, `/up` | Đúng; CI chạy `nginx -t`; E2E kiểm routing ownership | VERIFIED |
| README "Contract workflow" | Generated types, contract:check/proof | Đúng (check pass; proof không chạy) | VERIFIED (một phần) |

---

## 19. Dead Code & Repository Hygiene

- **Dead code:** xem F-12.
- **.gitignore:** hoạt động đúng — `.env`, `vendor/`, `node_modules/`, `dist/`, `*.log` (gồm `debug.log`, `agy-headless.log` ở root), `.agent-state/`, `.worktrees/` đều bị ignore. Các thư mục `.uv-cache*`, `.tmp*` ở root không tracked (tự ignore bằng `.gitignore` riêng bên trong). `backend/database/database.sqlite` là file scaffold bị ignore, không dùng.
- **Tỷ lệ artifact quy trình AI so với sản phẩm:** ~606 file tracked, trong đó `.agents/` 269, `_bmad*/` 91, `docs/` 48 (phần lớn về agent architecture/plans), so với khoảng 165 file backend/frontend. `_bmad-output/implementation-artifacts/receipts/**` chứa hàng chục JSON receipt của từng slice.
  - Không phải bug, nhưng làm giảm khả năng tìm đúng tài liệu (discoverability): grep/search của agent trả rất nhiều kết quả từ tài liệu quy trình. Nên cân nhắc gom receipt vào một nơi rõ ràng hoặc archive receipt của story đã done.
- **File root lạ:** `debug.log` (27KB) và `agy-headless.log` — đã ignore, chỉ cần dọn cục bộ.
- Tên file có dấu tiếng Việt trong `_bmad-output/implementation-artifacts/` (git hiển thị escape) — có thể gây phiền cho tool/CI trên một số môi trường; LOW.

---

## 20. Vibe-Code Risk Map

| Area | Vibe-code risk | Why | Evidence |
|---|---|---|---|
| Architecture | **HIGH** | Kiến trúc trên giấy khác thực tế; mỗi session AI có thể theo một trong hai | F-05, Spine:32/211 |
| Frontend | **HIGH** | State machine lớn, hai pattern command/conflict, giant view, sync hard-code key | F-07, F-08, `ChallengesView.vue` 905 dòng |
| Backend | **MEDIUM** | Logic đúng và được test tốt, nhưng copy-paste theo story | F-06 |
| Data layer | **LOW** | Constraint DB tốt, migration sạch, lock/idempotency đúng | §14 |
| Authentication/authorization | **LOW** | Mô hình đơn giản, nhất quán, có test | §8 |
| API contract | **MEDIUM** | Contract thiếu rule runtime; error format phân mảnh; PATCH semantics mơ hồ | F-02, F-09 |
| Test | **MEDIUM** | Nhiều test tốt, nhưng mock-heavy ở FE và thiếu E2E cho journal; thiếu DB guard | F-01, F-11 |
| Configuration | **MEDIUM** | Env DB định nghĩa ở 5 nơi; không force env trong phpunit; không validate env prod | F-01, F-16, §16 |
| Dependency | **LOW** | Tối giản, pin có lý do | §16 |
| Documentation | **HIGH** | README/Spine sai trong khi workflow agent coi docs là nguồn định hướng | F-10, §18 |

---

## 21. Technical Debt Hotspots

| Hotspot | Module | Root cause | Blast radius | AI change có làm tệ hơn? |
|---|---|---|---|---|
| Mutation pipeline copy-paste | `backend/app/Modules/Challenges/Application/UseCases/*`, `Http/Controllers/Challenge*` | Không có abstraction dùng chung cho lock/fence/epoch/idempotency | Mọi write hiện tại và tương lai (~15 story write trong backlog) | **Có** — mỗi story mới sẽ thêm một bản copy lệch nhẹ |
| Client sync + draft state machine | `frontend/src/stores/sync.ts`, `journalDrafts.ts`, `ChallengesView.vue` | Logic phân tán, fencing lặp, query key hard-code, giả định status code | Mọi feature có đồng bộ đa thiết bị (Notes, Done, Events) | **Có** — nhiều khả năng "vá thêm một check" thay vì sửa gốc (đã thấy dấu vết `S14-F0x`) |
| Domain engine chưa tồn tại | `backend/app/Modules/*/Domain` | Quyết định kiến trúc chưa được hiện thực | Epic 3 (streak/progress), Epic 6 (restore dùng domain validation) | **Có** — streak logic sẽ bị viết inline trong query/use case |
| Contract ↔ runtime | `contracts/openapi.yaml`, controllers | Rule runtime không được đưa lên contract | Mọi client/agent đọc contract | Trung bình |
| Tài liệu điều hướng agent | `README.md`, `ARCHITECTURE-SPINE.md`, `AGENTS.md` | Không cập nhật sau mỗi story | Mọi session AI | **Có** |

---

## 22. What NOT To Refactor

Những phần sau đang **đủ tốt**. Không nên rewrite hay "làm đẹp" ở thời điểm này:

1. **Chiến lược concurrency AD-6** (row lock `account_states` + base version + idempotency table). Đơn giản, đúng, có test thật. Chỉ *trích xuất* thành helper dùng chung (F-06), không đổi cơ chế.
2. **Schema và constraint PostgreSQL** (composite FK, CHECK, partial unique). Không chuyển sang Eloquent model/relationship chỉ vì "chuẩn Laravel".
3. **Auth flow Sanctum SPA + middleware `owner` + `private.no-store`.** Không thêm token API, OAuth hay RBAC — scale single-owner không cần.
4. **Contract pipeline** (OpenAPI → generated types → contract tests hai phía, `contract:proof`).
5. **`AccountTimeContext` + `Clock` port** — đây là ví dụ domain/port đúng nghĩa; hãy dùng làm mẫu thay vì thay thế.
6. **`scripts/local.ps1` với identity guard và tách profile test/dev.** Chỉ bổ sung guard ở tầng PHPUnit (F-01).
7. **Polling 5s thay vì WebSocket/Reverb.** Đúng với scale và với quyết định trong README.
8. **Fencing theo auth generation/owner/epoch trong `journalDrafts`.** Logic rối nhưng đúng và được test dày. Khi tổng quát hoá (F-08), giữ nguyên hành vi và bộ test hiện có làm regression suite.
9. **Không phân trang list challenge, không cache server-side** — chưa cần ở scale hiện tại.
10. **Nginx same-origin routing** — đúng và được CI kiểm; chỉ cần *thêm* header/TLS trước khi deploy.

---

## 23. Remediation Roadmap

### P0 — Immediate
| Item | Finding | Target | Desired outcome | Scope | Dependency |
|---|---|---|---|---|---|
| Guard DB cho backend tests | F-01 | `backend/tests/TestCase.php`, `backend/phpunit.xml` | Test fail-closed nếu không phải `APP_ENV=testing` + `noteflow_test` | SMALL | — |
| Xử lý 419 trên API | F-02 | `bootstrap/app.php`, `api/challenges.ts`, `stores/journalDrafts.ts`, `ChallengesView.vue`, OpenAPI | Session hết hạn khi write → cùng luồng với 401; message tiếng Việt; có test | SMALL | Làm cùng F-13 thì gọn hơn |
| Sửa README | F-10 | `README.md` | Feature list/E2E scope đúng; bỏ password cố định | SMALL | — |

### P1 — Before major new features
| Item | Finding | Target | Desired outcome | Scope | Dependency |
|---|---|---|---|---|---|
| Mutation runner + exception mapper dùng chung | F-06 | `app/Modules/*/Application`, `bootstrap/app.php`, FormRequest | Story write mới chỉ viết phần business; mapping lỗi ở một chỗ | MEDIUM | Nên làm trước Story 2.2 |
| Quyết định domain layer + ADR | F-05 | `docs/architecture`, `app/Modules/Challenges/Domain` | Một hướng được ghi rõ; rule tính toán nằm trong class thuần | MEDIUM | Trước Epic 3 |
| Chính sách trim nội dung | F-04 | `bootstrap/app.php`, test | Hành vi whitespace được quyết định và có test round-trip | SMALL | Trước Epic 4 |
| Bổ sung contract | F-09 | `contracts/openapi.yaml`, controllers | `maxLength`, PATCH semantics, 419, giới hạn journal | SMALL–MEDIUM | Sau F-02 |
| Tách sync khỏi query key cụ thể | F-07 | `stores/sync.ts` | Registry/prefix query key; write không bị chặn bởi lỗi refetch list | MEDIUM | Trước Notes/Done |
| Chặn owner transfer vô tình | F-03 | `ProvisionOwner.php` | Cần xác nhận/flag khi đổi owner; không xoá `account_states` âm thầm | SMALL | — |

### P2 — Near-term hardening
| Item | Finding | Target | Desired outcome | Scope | Dependency |
|---|---|---|---|---|---|
| E2E cho journal | F-11 | `tests/e2e/journal.spec.ts` | Bao phủ save/reload, conflict local/server, session expiry | MEDIUM | Sau F-02 |
| Generic offline-safe command | F-08 | `stores/`, `composables/` | Challenge và Journal dùng chung lõi pending-command/fencing | LARGE | Sau F-07, F-13 |
| Tách `ChallengesView` | F-08 | `views/`, `components/` | List/Detail/Form riêng, mỗi file < ~300 dòng | MEDIUM | Có thể đi kèm story UI tiếp theo |
| HTTP client dùng chung | F-13 | `frontend/src/api/` | Một `apiRequest`, một error type | SMALL | — |
| Production readiness checklist | F-16, F-17 | `deploy/`, `.env.production.example`, `bootstrap/app.php` | Header bảo mật, trustProxies, env validation, bỏ fillable `is_owner` | MEDIUM | Trước release đầu tiên |
| Retention `mutation_commands` | F-15 | scheduler/migration | Chính sách dọn rõ ràng | SMALL | Trước Epic 6 |

### P3 — Optional cleanup
| Item | Finding | Target | Desired outcome | Scope | Dependency |
|---|---|---|---|---|---|
| Xoá dead code/scaffold | F-12 | views orphan, seeder, bảng không dùng, catch chết | Repo gọn hơn | SMALL | Sau F-06 (catch chết tự biến mất) |
| Listener kép | F-14 | `sync.ts` | Một listener | SMALL | — |
| Gom/archive receipt quy trình | §19 | `_bmad-output/`, `docs/` | Tìm tài liệu sản phẩm dễ hơn | SMALL | — |
| Gom middleware route | §13 | `routes/api.php` | `Route::middleware()->group()` | SMALL | — |

---

## 24. Top 10 Highest-Value Actions

1. **Thêm DB guard fail-closed cho PHPUnit** (F-01) — rẻ, ngăn mất dữ liệu local do người hoặc agent.
2. **Thống nhất xử lý session hết hạn (419 ≡ 401) và khai báo trong contract** (F-02) — sửa lệch giữa thiết kế và thực tế ở luồng quan trọng nhất về dữ liệu người dùng.
3. **Trích xuất mutation runner + exception mapper ở backend** (F-06) — chặn nhân bản copy-paste cho ~15 story write còn lại.
4. **Viết ADR chốt hướng domain layer và sửa Spine/README cho khớp** (F-05, F-10) — agent sẽ nhận hướng dẫn đúng.
5. **Quyết định và test chính sách whitespace cho nội dung văn bản** (F-04) — trước khi Notes/autosave kế thừa.
6. **Tách sync coordinator khỏi query key cụ thể; bỏ ràng buộc write ↔ list refetch** (F-07).
7. **Viết E2E cho journal: conflict + session expiry** (F-11) — test tích hợp duy nhất có thể bắt lỗi dạng F-02.
8. **Hoàn thiện contract: maxLength, PATCH semantics, giới hạn journal** (F-09).
9. **Yêu cầu xác nhận khi provision owner khác** (F-03).
10. **Chuẩn hoá HTTP client frontend, sau đó tổng quát hoá pending-command từ journalDrafts** (F-13 → F-08) — nền cho Done/undo và Notes.

---

## 25. Unverified Questions

1. **Local DB có chứa dữ liệu thật của người dùng không?** Nếu có, F-01 nên nâng lên HIGH.
2. **Trim nội dung journal là chủ đích hay vô tình?** Không tìm thấy spec/test nào nêu rõ (F-04). Nên kiểm tra thêm `docs/product/prd.md` và `docs/ux/ux-spec.md`, là phần chưa audit sâu.
3. **Việc re-provision làm ẩn dữ liệu owner cũ có phải yêu cầu sản phẩm không?** Test xác nhận "transfer admission" nhưng không nói gì về dữ liệu (F-03).
4. **Phiên bản GitHub Actions `actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v7`:** không kiểm được có tồn tại hay không từ repository (không truy cập network). Nếu CI đang chạy xanh trên GitHub thì bỏ qua.
5. **Default `DB_PORT=55414` trong `tests/e2e/playwright.config.ts`:** không rõ nguồn gốc; có thể là cấu hình máy cá nhân.
6. **Môi trường production (TLS termination, proxy, domain):** chưa tồn tại nên không verify được `SANCTUM_STATEFUL_DOMAINS`, secure cookie, trusted proxies (F-16).
7. **`npm run contract:proof`:** không chạy vì script tạm thời sửa file tracked; hành vi được chấp nhận dựa trên tài liệu, chưa kiểm chứng trong audit này.
8. **Nội dung `.agents/` và `_bmad/`:** chỉ đánh giá ở mức hygiene/discoverability, chưa kiểm tra tính đúng của các policy/skill.
