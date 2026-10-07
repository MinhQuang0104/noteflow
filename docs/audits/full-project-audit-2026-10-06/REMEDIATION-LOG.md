# Remediation log — full-project-audit-2026-10-06

## Phạm vi và môi trường

- Worktree: `audit-remediation`
- Branch: `fix/audit-remediation-2026-10`
- Base SHA theo plan: `f93c9af`
- HEAD trước commit log này: `dd46c28edb1647a7576693d3d7af85f12531fc07`
- Công cụ chính: Node `v24.21.0`, npm `11.6.4`, Git `2.49.0.windows.1`.
- Canonical `.agent-state/active-run.json` được đọc trước khi làm và trước các
  mốc commit; mọi lần đều `status: IDLE`, `activeRunId: null`.
- DB/container: Docker context `desktop-linux`; `backend-test` và
  `postgres-test` healthy; identity kiểm tra được là `testing / postgres-test /
  5432 / noteflow_test / DB_URL rỗng`. Không chạy test DB trên database dev.
- Không merge, push, xoá worktree/branch hoặc stash.

## Commit theo gói

| Gói | Commit | Finding | Kết quả |
|---|---|---|---|
| Prep R-05 | `12fa65d` | R-05 | Đưa test architecture wording đã audit vào branch remediation. |
| Prep deps | `399e66c` | Test dependency declaration | Khai báo dependency test BMAD theo plan. |
| A1 | `95d171f` | E-04, E-01 | RESOLVED — bind resource identity cho challenge write và journal ACK. RED focused unit exit 1 (4 failures), RED E2E exit 1; focused unit 24/24 exit 0, E2E regression 2/2 exit 0. |
| A2 | `f50f448` | E-03, E-07, E-06 | RESOLVED — single-flight polling, convergence debt và auth/session fences. RED sync exit 1 (3 failures); focused sync 47/47, auth/journal 35/35, full Vitest 164/164 đều exit 0. |
| A3 | `c1caa00` | E-02, E-08 | RESOLVED — retry frozen conflict và derive epoch block từ draft. RED lifecycle exit 1 (2 failures); lifecycle 10/10, store/editor 29/29, E2E content-conflict 12 pass, Vitest 165/165 exit 0. |
| A4 | `a718985` | E-05 | RESOLVED — private rendering bị gate khi session hết hạn. RED App test exit 1; sau khi cô lập cleanup test, App 13/13 và Vitest 169/169 exit 0. |
| A5 | `7e9d4c8` | C-01, C-02 | RESOLVED — NUL và email không phải string trả 422. RED backend targeted exit 1 (NUL/email array đi 500); targeted exit 0, 30 warnings/239 assertions, PHPStan và Pint exit 0. |
| A6 | `f2cba52` | C-03, F-01, F-02 | RESOLVED — true two-connection idempotency, E2E DB identity và serialize workers. Mutation bỏ lock làm regression exit 1; khôi phục lock exit 0. Helper 9/9, concurrency 6 tests/41 assertions exit 0; E2E repeat-each=2 chạy 2 lần, mỗi lần 86 passed/10 skipped, exit 0. |
| A7 | `39ba0a7` | D-01..D-03, D-05, D-06 | RESOLVED — strict conflict schemas, request constraints và drift check path/verb/requestBody. Các probe stale parser/proof RED exit 1; backend contract exit 0 (20 warnings/51 assertions), backend full exit 0 (97 warnings/584 assertions), contract validate/check/proof, Vitest 171/171, type/lint/build exit 0. |
| A8 | `e68ad0b` | E-09, I-01 | RESOLVED — keyboard-operable challenge list và README capability refresh. RED component exit 1; focused 1/1, full Vitest 172/172, E2E Tab/Enter 2 pass, type/lint/build exit 0. |
| B1 | `9263b1e` | H-04 | RESOLVED — Plan risk là mức tối thiểu; caller không hạ risk/mandatory flags. RED verification-flow exit 1; full `test:v4` trên commit: 536 tests, 535 pass, 1 skip, 0 fail, exit 0. |
| B2 | `5ef7b8b` | H-03 | RESOLVED — finalize/complete/reconcile dùng chung admission, common-Git lock và journal; docs/direct-entry negative tests. RED thiếu module exit 1 và lock race ban đầu exit 1; focused 7/7, full lifecycle 80/80; full `test:v4`: 542 tests, 541 pass, 1 skip, 0 fail, exit 0. |
| B3 | `6a18223` | H-08 | RESOLVED — CI có job Ubuntu chạy root `npm run test:v4`, giữ documented Windows symlink skip. Workflow `prettier --debug-check` exit 0; full `test:v4`: 542 tests, 541 pass, 1 skip, 0 fail, exit 0. |
| B4 | `e81d7f0` | H-09 | RESOLVED — CLI nhận `--operation`/`--input`, kiểm Plan trước read, có bảng exit code exhaustive. RED import thiếu export exit 1; CLI contract 4/4, Runner 15/15; full `test:v4`: 546 tests, 545 pass, 1 skip, 0 fail, exit 0. |
| B5 | `dd46c28` | H-07 | RESOLVED — refresh đúng anchor hash của challenge-list, journal-frontend và today-view. Trước refresh cả 3 checker exit 1/STale; sau refresh cả 3 `VALID` exit 0; full `test:v4`: 546 tests, 545 pass, 1 skip, 0 fail, exit 0. |
| Part C | Chưa là package code | A-01/A-02, A-03, C-04/C-05, D-04, G-01, H-01/H-02/H-10 | Soạn bảng quyết định tại `DECISIONS-NEEDED.md`; không tự quyết định hay mutate runtime. |

## Check cuối trên code HEAD

Các lệnh dưới đây chạy trước commit log cuối, trên cùng code HEAD `dd46c28`;
commit cuối chỉ thêm log/decision docs và không thay đổi code/runtime.

| CWD | Lệnh | Exit code | Kết quả quan sát |
|---|---|---:|---|
| `frontend` | `npm.cmd run type-check` | 0 | Vue type-check hoàn tất. |
| `frontend` | `npm.cmd run lint` | 0 | oxlint + eslint hoàn tất. |
| `frontend` | `npx.cmd vitest run` | 0 | 16 files, 172 tests passed. |
| `frontend` | `npm.cmd run build-only` | 0 | Vite production build hoàn tất. |
| `frontend` | `npm.cmd run contract:validate` | 0 | OpenAPI valid. |
| `frontend` | `npm.cmd run contract:check` | 0 | Generated types không drift. |
| worktree | `docker ... compose --profile test ps` | 0 | `backend-test`/`postgres-test` healthy. |
| worktree | `docker ... exec -T backend-test printenv APP_ENV DB_HOST DB_PORT DB_DATABASE DB_URL` | 0 | `testing`, `postgres-test`, `5432`, `noteflow_test`, rỗng. |
| worktree | `docker ... exec -T backend-test php artisan test` | 0 | 3 passed, 97 warnings, 584 assertions. |
| worktree | `docker ... exec -T backend-test composer analyse` | 0 | PHPStan no errors. |
| worktree | `docker ... exec -T backend-test vendor/bin/pint --test` | 0 | 82 files pass. |
| `tests/e2e` | `npx.cmd playwright test --repeat-each=2` — lần 1 | 0 | 90 passed, 10 skipped, 1 worker. |
| `tests/e2e` | `npx.cmd playwright test --repeat-each=2` — lần 2 | 0 | 90 passed, 10 skipped, 1 worker. |
| worktree | `npm.cmd run test:v4` — final run | 0 | 546 tests, 545 pass, 1 skipped, 0 fail. |
| worktree | `git diff --check` | 0 | Không có whitespace error. |

Các lệnh `docker ...` trong bảng dùng đầy đủ compose context/project/file/env
đã nêu ở trên; không in nội dung `.env`.

## Trạng thái partial/skipped và lệch kế hoạch

- `test:v4` có đúng 1 skip: test tạo symlink trên Windows không khả dụng; đây
  là skip được suite ghi rõ, CI B3 chạy trên Ubuntu.
- E2E có 10 skip mỗi lần chạy (các case cross-device trên phone viewport), là
  skip có chủ ý trong test suite; không có failure.
- Kiểm tra YAML bằng `python -c ...` không chạy được vì host không có lệnh
  `python`, exit code 1. `npx.cmd prettier --check .github/workflows/ci.yml`
  exit code 1 do formatting legacy của toàn file; `prettier --debug-check`
  exit code 0 và parse thành công. Không dùng hai exit 1 này để claim workflow
  PASS.
- `deploy/local/entrypoint.sh` từng được chuẩn hóa LF chỉ cho môi trường
  Docker vì CRLF làm hỏng `/usr/bin/env bash`; nội dung/hash không đổi,
  `git diff` exit 0 và không tạo commit sản phẩm.
- `.env` compose là ignored hard-link tạm trong worktree để helper E2E dùng
  đúng đường dẫn; không đọc/in nội dung và không commit.
- B6 (H-05, H-06, H-11, I-02) chỉ được đề xuất theo plan, không triển khai.
  H-02 cũng không triển khai vì phụ thuộc quyết định H-01/H-10.
- Không có finding A1–A8/B1–B5 bị để `PARTIAL`; các quyết định Part C vẫn là
  `NEEDS_HUMAN_DECISION`, không được suy diễn thành resolved.

## Handover

Review các commit và `DECISIONS-NEEDED.md`, sau đó cherry-pick hoặc merge
branch vào `main` theo quy trình của repository. Sau khi tích hợp, chạy
`scripts/verify-local.ps1` từ canonical worktree với `frontend/node_modules`
đã cài; không chạy script đó từ linked worktree nếu guard của repo từ chối.
