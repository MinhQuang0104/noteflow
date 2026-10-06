# 01c: Kiểm chứng B9, B15 và xử lý F-02, R-01..R-05

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

**Đính chính:** bản trước của mục này (và R-01 trong `findings-addendum.json`) kết luận "repo thiếu `_bmad/assets/`". Kết luận đó **sai** → R-01 gốc là `FALSE_POSITIVE`. Nguyên nhân là lệnh B2 trong `AUDIT-PLAN.md` trỏ sai vị trí.

- [F] Template có trong repo, tại `.agents/skills/bmad/assets/config.template.toml`. `.agents/skills/bmad/` là nơi chứa source của skill BMAD.
  - `setup.py` (`payload()`, dòng 209–220) chỉ đọc `assets/` từ skill root, rồi copy riêng `scripts/` vào `_bmad/scripts/`.
  - Nói cách khác, `_bmad/assets/` không bao giờ được tạo, theo đúng thiết kế.
- [F] `_bmad/scripts/tests/` là bản copy của bộ test upstream, cộng thêm `test_agent_architecture.py` là test riêng của dự án. Test upstream tìm `../assets` theo vị trí của chính nó, nên chỉ chạy đúng từ source.
- [F] Chạy bộ test upstream từ đúng vị trí `.agents/skills/bmad/scripts/tests`: **56 passed, 14 failed**. Toàn bộ 14 lỗi là do test cần các skill của repo BMAD gốc mà dự án không cài, ví dụ `FileNotFoundError: …\.agents\skills\bmad-build-auto`. Đây là test của nhà phát triển BMAD, không áp dụng cho dự án.
- [F] Test của dự án `_bmad/scripts/tests/test_agent_architecture.py`, chạy trong venv tạm ngoài repo với `pytest==9.1.1` và `jsonschema==4.26.0`: **43 passed, 3 failed**. Ba lỗi đều là test kiểm tra câu chữ cũ thời V3 mà `CLAUDE.md`/`AGENTS.md` đã bỏ khi rút gọn cho V4 Lite:
  - `test_policy_defines_story_as_plan_risk_escalation_and_done_gate`: không tìm thấy `'AC-to-evidence'` trong `AGENTS.md`;
  - `test_both_leads_share_canonical_bootstrap`: không tìm thấy `'.agents/policies/orchestration-v3.md'` trong `CLAUDE.md`;
  - `test_phase_2b_codex_and_claude_share_lease_and_reconciliation`: không tìm thấy `'same replaceable Lead role as Codex'` trong `CLAUDE.md`.
  - Test được sửa lần cuối ở `81a78a9` (2026-09-20); `AGENTS.md` được sửa lần cuối ở `98def53` (2026-10-06).

**Xử lý:**
- **R-01 (đính chính): LOW, VALID.** Repo không khai báo dependency Python cho test của dự án. Đã thêm `_bmad/scripts/tests/requirements.txt` (pin `pytest`, `jsonschema`, kèm hướng dẫn chạy).
  - Lệnh B2 đúng là: `pip install -r _bmad/scripts/tests/requirements.txt`, rồi `pytest _bmad/scripts/tests/test_agent_architecture.py`.
  - Test upstream BMAD không thuộc baseline của dự án.
- **R-05 (mới): MEDIUM, VALID, lane V4 migration.** `test_agent_architecture.py` lệch với policy hiện hành, 3/46 test fail.
  - Cần quyết định từng assertion: cập nhật test theo policy V4 Lite, hay khôi phục ý nghĩa tương ứng trong policy. Ví dụ: `AGENTS.md` vẫn yêu cầu "every AC evidenced", chỉ khác câu chữ.
  - Sửa file này là thay đổi agent instructions/verification, nên theo `AGENTS.md` chỉ làm khi bạn yêu cầu rõ ràng lane V4 migration. Audit không sửa.

## Bảng baseline sau bước này

| Check | Trạng thái |
|---|---|
| B1, B3–B8, B10–B12, B14 | PASS (theo 01b; B3–B6, B10 đã chạy lại sau bump) |
| B9 | **PASS**, 89/89 |
| B13 | **PASS (production)**; còn 1 chuỗi advisory chỉ ở dev, chưa có bản vá upstream |
| B2 | Đã đổi lệnh (xem R-01 đính chính): **FAIL 43/46**, 3 lỗi do test lệch policy (R-05) |
| B15 | **PASS** trên canonical `main` `f93c9af` (đã cherry-pick bản sửa); chi tiết ở phụ lục |

## Phụ lục: B15 `scripts/verify-local.ps1`

Chạy từ canonical `D:\Workspace\Tu_Hoc\New_Project_My_Note`, branch `main`, HEAD `f93c9af`. Đây là `03dbd09` cộng ba commit cherry-pick: `e50a8d2` (F-02), `5bdd437` (test guard), `f93c9af` (dependency).

**Lần 1 (người dùng chạy): FAIL, exit 1, ở bước `local.ps1 e2e`.** Tái hiện riêng bước này cho thấy:
`[WebServer] 'run-p' is not recognized … Process from config.webServer was not able to start.`

- [F] Nguyên nhân: `frontend/node_modules` chưa được cài ở canonical, nên web server của Playwright không gọi được `run-p` (gói `npm-run-all2`). Đây là lỗi môi trường, không phải lỗi mã.
- [I] Script không kiểm tra trước điều kiện này. Đề xuất finding LOW: `verify-local.ps1`/`local.ps1 e2e` nên kiểm tra sớm `frontend/node_modules` và báo lỗi rõ ràng.
- Ghi chú vận hành: chạy script với `*>&1` trong Windows PowerShell 5.1 sẽ biến stderr của `docker compose` thành lỗi và dừng script ngay bước đầu. Nên dùng `Start-Transcript`.

**Lần 2 (sau `npm ci` trong `frontend/` ở canonical): PASS, exit 0.**
- Dev services: `up` ×3 và `stop`/`up` giữ nguyên ID container; smoke HTTP, runtime identity và topology đạt.
- Test backend trong `backend-test` (`noteflow_test`): 89 passed (519 assertions); service dev được giữ nguyên.
- E2E Compose (Playwright): **41 passed, 5 skipped**, 2.9 phút.
  - 5 test skip đều thuộc project `phone` trong `cross-device-sync.spec.ts`. Đây là skip có chủ đích, theo `cross-device-sync.spec.ts:23`: `test.skip(({ isMobile }) => isMobile, …)`.
- Secret check: `deploy/local/.env` không bị track; `git diff --check` sạch.
- Dòng cuối: `Local runtime verification completed.`
- Log: `%TEMP%\verify-local-b15-run2.log` (ngoài repo).
