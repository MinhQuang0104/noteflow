# Phụ lục 01b — Kết quả chạy lại Baseline sau khi cài đặt Dependencies

Tài liệu này ghi nhận kết quả thực thi lại bộ kiểm tra baseline định tính (B1–B15) sau khi đã cài đặt dependencies và áp dụng bản sửa lỗi bảo mật quan trọng F-02 (khóa môi trường DB test và thêm fail-closed guard).

---

## 1. Thông tin commit & môi trường

- **Commit SHA đã chạy:** `4cb179702659e2ad48f12a4c4c94bd712c99bb67` (`4cb1797`)
- **Commit SHA gốc (trước khi fix & rerun):** `8da15d86f78f8cb60c04f90119ae46a366cf8d4c` (`8da15d8`)
- **Worktree:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`
- **Branch:** `audit/full-project-2026-10-06`

### Phiên bản công cụ thực thi

- **Node.js:** `v24.21.0`
- **npm:** `11.6.4`
- **PHP:** `8.5.9 (cli)` (NTS Visual C++ 2022 x64)
- **Composer:** `2.8.9` (2025-05-13)
- **Python:** `3.12.14` (`C:\Users\ACER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`)
- **pytest:** `9.1.1`
- **Vitest:** `v5.0.1`
- **Vite:** `v8.3.0`
- **vue-tsc:** `3.3.11`
- **Redocly CLI:** `2.53.2`
- **PHPStan (Larastan):** `2.2.14` (Larastan 3.12.1)
- **Laravel Pint:** `v1.32.1`
- **Laravel Framework:** `v13.32.0`
- **Pest PHP:** `v5.2.0`

---

## 2. Mô tả bản sửa lỗi F-02

- **Commit SHA:** `4cb179702659e2ad48f12a4c4c94bd712c99bb67`
- **Thông điệp commit:** `fix(test): force test DB env and guard destructive test setup (audit F-02)`
- **Các thành phần đã sửa:**
  1. `backend/phpunit.xml`: Thêm thuộc tính `force="true"` cho `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_URL` và `APP_ENV`. Điều này ngăn chặn việc các biến môi trường từ hệ thống bên ngoài ghi đè cấu hình test chỉ tới cơ sở dữ liệu thật.
  2. `backend/tests/TestCase.php`:
     - Bổ sung phương thức tĩnh `assertSafeTestDatabase(?string $connection = null)`: Kiểm tra `APP_ENV === 'testing'` và database của mọi connection (`database.default`, explicit `$connection`, và `pgsql_second`) phải là `'noteflow_test'`. Ném `RuntimeException` ngay lập tức nếu không khớp.
     - Bổ sung `registerDatabaseSafetyGuards()`: Đăng ký event listener cho `Illuminate\Database\Events\ConnectionEstablished` và callback `beforeExecuting` trên đối tượng Connection, ngăn chặn bất kỳ kết nối hay câu lệnh truy vấn nào chạy trên DB khác `'noteflow_test'`.
     - Tích hợp vào `setUpTraits()` và `setUp()` của `TestCase`: Chạy trước khi `RefreshDatabase` kích hoạt, đảm bảo fail-closed hoàn toàn trước mọi thao tác destructive.
  3. `backend/tests/Pest.php`:
     - Bổ sung `beforeEach` hook toàn cục gọi `TestCase::assertSafeTestDatabase()` trước khi bất kỳ test suite nào của Pest chạy.
  4. `backend/tests/Feature/ChallengeConcurrencyTest.php` & `backend/tests/Feature/JournalConflictConcurrencyTest.php`:
     - Gọi `TestCase::assertSafeTestDatabase('pgsql_second')` trong `beforeEach` ngay sau khi clone cấu hình connection và trước mọi lệnh `delete()`.
     - Gọi lại trong `afterEach` trước các lệnh dọn dẹp dữ liệu.
  5. Đã chạy `vendor/bin/pint` định dạng mã nguồn các file đã sửa đạt kết quả pass tuyệt đối.

---

## 3. Bảng tổng hợp Baseline B1–B15: Cũ vs Mới

| Check | Lệnh & Thư mục làm việc | Trạng thái cũ | Trạng thái mới | Exit code | Số test (Pass / Fail / Skip) | Tail lỗi chính / Ghi chú |
|---|---|---|---|:---:|:---:|---|
| **B1** | `npm run test:v4`<br>*(root)* | PASS | **PASS** | 0 | 532 pass / 0 fail / 1 skip | Full suite 533 tests; 1 skip do Windows symlink unavailable. Control-plane hoàn toàn ổn định. |
| **B2** | `& python -m pytest _bmad/scripts/tests -q`<br>*(root)* | NOT_RUN/ENV | **FAIL** | 2 | 0 pass / 2 error | `ModuleNotFoundError: No module named 'jsonschema'` trong `test_agent_architecture.py`; `FileNotFoundError` cho `_bmad/assets/config.template.toml` trong `test_render_skill.py`. (Finding R-01) |
| **B3** | `npm run type-check`<br>*(frontend)* | NOT_RUN/ENV | **PASS** | 0 | Clean | `vue-tsc --build` thành công, không có lỗi kiểu. |
| **B4** | `npm run lint`<br>*(frontend)* | NOT_RUN/ENV | **PASS** | 0 | Clean | `oxlint` sạch 0 warnings / 0 errors (46 files); `eslint --cache` sạch. |
| **B5** | `npx --no-install vitest run`<br>*(frontend)* | NOT_RUN/ENV | **PASS** | 0 | 157 pass / 0 fail / 0 skip | 16 test files passed, 157 tests passed. |
| **B6** | `npm run build-only`<br>*(frontend)* | NOT_RUN/ENV | **PASS** | 0 | Built in 371ms | Vite 8.3.0 sinh bundle thành công vào `dist/`. |
| **B7** | `npm run contract:validate`<br>*(frontend)* | NOT_RUN/ENV | **PASS** | 0 | Valid | Redocly CLI kiểm tra `contracts/openapi.yaml` hợp lệ trong 41ms. |
| **B8** | `npm run contract:check`<br>*(frontend)* | NOT_RUN/ENV + READ_ONLY_CONFLICT | **PASS** (check)<br>+ **NOT_RUN/MUTATES_SOURCE** (proof) | 0 | Clean | Typescript types đồng bộ với OpenAPI contract. Script `contract:proof` không chạy do làm bẩn source theo quy tắc. |
| **B9** | `composer test`<br>*(backend)* | NOT_RUN/ENV | **NOT_RUN/ENV** | — | — | Điều kiện (a) Guard đã commit (ĐẠT). Điều kiện (b) kết nối Postgres 127.0.0.1:5432 và `select current_database()` (KHÔNG ĐẠT: TCP connect failed; quy tắc cứng không start Docker). |
| **B10** | `composer analyse`<br>*(backend)* | NOT_RUN/ENV | **PASS** | 0 | 36/36 files OK | PHPStan: `[OK] No errors`. |
| **B11** | `& './vendor/bin/pint' --test`<br>*(backend)* | NOT_RUN/ENV | **PASS** | 0 | Clean | Laravel Pint: `{"tool":"pint","result":"passed"}`. |
| **B12** | `node --test helpers/*.test.ts`<br>*(tests/e2e)* | PASS | **PASS** | 0 | 6 pass / 0 fail / 0 skip | Giữ nguyên từ baseline gốc (native/compose helpers, DB safety unit tests). |
| **B13** | Audit bảo mật dependencies<br>*(frontend, tests/e2e, backend)* | NOT_RUN/ENV (PARTIAL) | **FAIL** | 1 | — | `frontend`: exit 1 (1 HIGH: `source-map-js`, GHSA-68fv-2mgg-jv7q).<br>`tests/e2e`: exit 0 (0 vuln).<br>`backend`: exit 1 (1 HIGH + 1 MEDIUM: `league/commonmark`, GHSA-3q6v-r5mr-hxv8, GHSA-97jj-33gv-5xf9).<br>(Findings R-02, R-03, R-04). |
| **B14** | Kiểm tra vệ sinh Git<br>*(root)* | PASS | **PASS** | 0 | Clean | Whitespace sạch, không track ignored file, 0 file lớn >= 1MiB. |
| **B15** | `scripts/verify-local.ps1`<br>*(root)* | NOT_RUN/WORKTREE_GUARD | **NOT_RUN/WORKTREE_GUARD** | — | — | Không gọi verify-local trong worktree audit theo quy tắc kiểm tra an toàn. |

---

## 4. Chi tiết các lần chạy lại

### B2 — Pytest `_bmad/scripts/tests`
- **Command:** `& 'C:\Users\ACER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest _bmad/scripts/tests -q`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`
- **Exit code:** 2
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B2.log`
- **Kết quả:** Bị ngắt do 2 lỗi collection:
  - `ModuleNotFoundError: No module named 'jsonschema'` khi import `test_agent_architecture.py`.
  - `FileNotFoundError: [Errno 2] No such file or directory: '_bmad/assets/config.template.toml'` khi import `test_render_skill.py`.

### B3 — Type-check Frontend
- **Command:** `npm run type-check`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B3.log`
- **Kết quả:** `vue-tsc --build` thực thi thành công không có lỗi.

### B4 — Linter Frontend
- **Command:** `npm run lint`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B4.log`
- **Kết quả:** `oxlint` quét 46 files không cảnh báo/lỗi; `eslint` hoàn thành sạch sẽ.

### B5 — Unit Test Frontend (Vitest)
- **Command:** `npx --no-install vitest run`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B5.log`
- **Kết quả:** 16 test files pass, 157 tests pass, 0 fail.

### B6 — Build Frontend (Vite)
- **Command:** `npm run build-only`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B6.log`
- **Kết quả:** Build thành công bundle production trong 371ms.

### B7 — Kiểm tra OpenAPI Contract (Redocly)
- **Command:** `npm run contract:validate`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B7.log`
- **Kết quả:** `contracts/openapi.yaml` hợp lệ theo `redocly.yaml`.

### B8 — Kiểm tra Contract Drift
- **Command:** `npm run contract:check`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B8.log`
- **Kết quả:** TypeScript definitions đồng bộ hoàn toàn với OpenAPI schema.

### B9 — Composer Test (Pest)
- **Preconditions:**
  - (a) Guard Việc 1 đã commit: **ĐẠT** (`4cb1797`).
  - (b) PostgreSQL tại `127.0.0.1:5432` kết nối được và database là `noteflow_test`: **KHÔNG ĐẠT** (TCP port 5432 đóng, không có dịch vụ lắng nghe).
- **Trạng thái:** `NOT_RUN/ENV` (không chạy để tuân thủ tuyệt đối quy tắc cấm tự start container hay đổi config).
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B9.log`

### Test V4 Suite — Kiểm tra Control-plane
- **Command:** `npm run test:v4`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-test-v4.log`
- **Kết quả:** 533 tests: 532 pass, 0 fail, 1 skip. Control-plane hoạt động chính xác, không bị ảnh hưởng bởi thay đổi.

### B10 — Tĩnh học Backend (PHPStan)
- **Command:** `composer analyse`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B10.log`
- **Kết quả:** `[OK] No errors` trên toàn bộ 36 file của backend.

### B11 — Định dạng mã nguồn Backend (Laravel Pint)
- **Command:** `& './vendor/bin/pint' --test`
- **Cwd:** `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend`
- **Exit code:** 0
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B11.log`
- **Kết quả:** `{"tool":"pint","result":"passed"}`. Mã nguồn backend chuẩn PSR-12/Pint.

### B13 — Dependency Security Audits
- **Log:** `docs/audits/full-project-audit-2026-10-06/logs/rerun-B13.log`
- **Frontend (`npm audit --omit=dev`):** Exit code 1. Phát hiện 1 HIGH vulnerability trong `source-map-js` (1.0.0 - 1.2.1, GHSA-68fv-2mgg-jv7q).
- **E2E (`npm audit --omit=dev`):** Exit code 0. Không có lỗ hổng.
- **Backend (`composer audit` & `composer audit --locked`):** Exit code 1. Phát hiện 1 HIGH vulnerability (GHSA-3q6v-r5mr-hxv8, Quadratic-time DoS) và 1 MEDIUM vulnerability (GHSA-97jj-33gv-5xf9, DisallowedRawHtml bypass) trong gói `league/commonmark` (v2.10.1).
