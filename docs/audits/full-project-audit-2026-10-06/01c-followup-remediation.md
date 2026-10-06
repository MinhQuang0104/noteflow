# 01c: Kiểm chứng B9 và xử lý F-02, R-01..R-04

- Người thực hiện: Claude Opus 5.5, ngày 2026-10-06, trong worktree `audit/full-project-2026-10-06`.
- Môi trường: Docker Desktop 28.5.1, context `desktop-linux`, project `noteflow-local`, profile `test`.
  - Mount `backend/` lấy từ worktree. Dùng `--env-file` của canonical (`deploy/local/.env`), chỉ đọc.
  - Danh tính trong container `backend-test` [F]: `APP_ENV=testing`, `DB_HOST=postgres-test`, `DB_PORT=5432`, `DB_DATABASE=noteflow_test`, `DB_URL=` (rỗng).

## B9: test backend

| Lần chạy | Commit | Lệnh | Kết quả [F] |
|---|---|---|---|
| 1 | `2436862` (gồm bản sửa F-02 `4cb1797`) | `php artisan test` trong `backend-test` | 86 passed (514 assertions) |
| 2 | `1d9520e` (+ test guard) | như trên | 89 passed (519 assertions) |
| 3 | `2ddf217` (+ bump dependency) | như trên, sau `composer install` trong container | 89 passed (519 assertions) |

→ **B9: PASS.**

## F-02: thử guard bằng một DB sai

Lệnh: `docker exec -e DB_DATABASE=noteflow noteflow-local-backend-test-1 php artisan test tests/Feature/ChallengeConcurrencyTest.php`

Kết quả: cả 4 test FAIL với `RuntimeException: Refusing test execution: connection 'pgsql' database is 'noteflow', expected 'noteflow_test'.` tại `tests/TestCase.php:59`, được gọi từ `setUpTraits` ở `TestCase.php:24`. Exception bắn ra trước `beforeEach`, nên không có lệnh `delete()` nào chạy. [F]

Kết luận:
- [F] `force="true"` trong `phpunit.xml` **không** ghi đè được env thật của process. Laravel đọc `$_SERVER` trước, còn PHPUnit `<env force>` chỉ ghi vào `$_ENV` và `putenv`. Bằng chứng: với env `DB_DATABASE=noteflow`, config nhận đúng giá trị `noteflow`, dù trong `phpunit.xml` đã force `noteflow_test`.
- [F] Guard trong `TestCase` mới là lớp chặn thực sự. Nó được ghim bằng `tests/Feature/TestDatabaseGuardTest.php` (3 test, commit `1d9520e`).
- [I] Vẫn nên giữ `force="true"`: vô hại, và có tác dụng khi biến chỉ được nạp qua `putenv`/`$_ENV`. Nhưng không được coi đó là biện pháp bảo vệ.
- Trạng thái F-02: **RESOLVED trên branch audit**. Chưa có trên `main` cho tới khi được cherry-pick.

## R-02, R-03, R-04: dependency (commit `2ddf217`)

| ID | Package | Trước → Sau | Kiểm chứng [F] |
|---|---|---|---|
| R-03, R-04 | `league/commonmark` (kéo theo từ `laravel/framework`) | 2.10.1 → 2.10.3 | `composer audit`: No security vulnerability advisories found |
| R-02 | `source-map-js` (dev/build, kéo theo từ vite, tailwind, jsdom) | 1.2.1 → 1.2.2 | `npm audit --omit=dev`: found 0 vulnerabilities |

- Còn lại: `npm audit` (gồm cả dev) báo 4 lỗi HIGH theo chuỗi `braces` → `micromatch` → `fast-glob` → `@vue/eslint-config-typescript`.
  - Advisory GHSA-vfj7-8cjw-p6xm áp cho mọi phiên bản `braces` (`*`), nên chưa có bản vá upstream.
  - `npm audit fix --force` chỉ hạ `@vue/eslint-config-typescript` xuống 14.0.1, nên không áp dụng.
  - Chuỗi này chỉ dùng khi phát triển và không vào bundle. Đề xuất: theo dõi, severity thực tế LOW.
- Hồi quy sau bump [F]: FE type-check 0, lint 0, vitest 157/157, build 0. BE PHPStan `[OK] No errors`, Pest 89/89.

## R-01: test BMAD (B2)

- [F] `_bmad/scripts/tests/test_render_skill.py:29` đọc `_bmad/assets/config.template.toml`, và `setup.py:212` cũng tham chiếu tới nó. Nhưng `git log --all -- '_bmad/assets/*'` trả về rỗng: thư mục này chưa từng được commit.
- [F] `test_agent_architecture.py:12` import `jsonschema`, mà repo không khai báo dependency Python nào.
- Phân loại lại: `NEEDS_HUMAN_DECISION`, severity MEDIUM. Đây là tooling BMAD được vendor về không đầy đủ, không phải lỗi sản phẩm. Hai lựa chọn:
  - (a) vendor lại đúng `_bmad/assets/` từ bản phát hành BMAD đang dùng, và thêm file khai báo dependency Python (`jsonschema`, `pytest`);
  - (b) loại hai test này khỏi baseline.
- Không tự tạo template, vì sẽ phải bịa nội dung.

## Bảng baseline sau bước này

| Check | Trạng thái |
|---|---|
| B1, B3–B8, B10–B12, B14 | PASS (theo 01b; B3–B6, B10 đã chạy lại sau bump) |
| B9 | **PASS**, 89/89 |
| B13 | **PASS (production)**; còn 1 chuỗi advisory chỉ ở dev, chưa có bản vá upstream |
| B2 | FAIL → `NEEDS_HUMAN_DECISION` (R-01) |
| B15 | Chạy từ canonical sau khi cherry-pick; kết quả xem phụ lục bên dưới nếu có |
