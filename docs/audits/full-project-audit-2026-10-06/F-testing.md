# WS-F — E2E và chiến lược test

[F] Phạm vi nguồn: `98def5358983072216a28754e87b1cd5f884d258`; checkout audit `03dbd098e36245f51a4b8e875e89c1c0bb21acc6` chỉ thêm plan. Đã đọc toàn bộ AUDIT-PLAN, AGENTS và router trong worktree. Lead đã ghi pointer/preflight ở `00-preflight.md`; WS-F không gọi lifecycle/Runner/Orca/AGY/recovery.

[I] Sức khỏe: 🔴. Có nền tảng test theo hành vi hữu ích, nhưng native test harness thiếu guard danh tính DB ở consumer Laravel/BE và có shared-reset concurrency. Product suites chưa chạy được trong audit; không suy ra chất lượng sản phẩm từ số test.

## Phạm vi và bằng chứng thực thi

[F] Đã đọc đủ 7 file Playwright spec, cả 5 helper/runtime files, patch Windows, config/lock/scripts, CI, Pest bootstrap, PHPUnit/Vitest config; đọc các test consumer cụ thể cho lifecycle, sync, auth và metadata. Inventory/probe lưu trong `logs/F-probes.mjs`, output `logs/F-probes.log`; command `node docs/audits/full-project-audit-2026-10-06/logs/F-probes.mjs` tại worktree, exit **0**. Probe chỉ đọc nguồn, evaluate config với stub defineConfig/devices, gọi builder argv pure; không khởi động browser, app, DB hay subprocess.

[F] Lead chạy B1 full suite: 533 total, 532 pass, 1 skip, exit0 (`logs/B1.meta.json`, `logs/B1.log`). B12: `node --test helpers/*.test.ts` tại `tests/e2e`, 6 pass, exit0 (`logs/B12.meta.json`, `logs/B12.log`). Đây không phải PASS của Playwright, Vue, Pest hoặc DB integration.

[F] FE/Pest/BMAD runtime và full-stack Playwright chưa có bằng chứng chạy trong audit do dependency/env constraints; xem `01-baseline-checks.md`. B15 `NOT_RUN/WORKTREE_GUARD`; không gọi wrapper từ canonical. [H] Tần suất flaky, browser rendering/AT và actual DB target của môi trường người dùng chưa xác định.

## Test pyramid — inventory nguồn

[F] Các số dưới đây là **declaration** được đếm từ source bằng `F-probes.mjs` và output350–382 (exit0). Dataset/loop có thể tạo nhiều runtime case; bảng không ghi test chưa chạy là PASS và không phải line/branch coverage.

| Tầng | File | Declaration | Runtime trong audit |
|---|---:|---:|---|
| BE Unit | 1 | 2 | NOT_RUN/ENV; dataset tại AccountTimeContextTest.php:21–38 tạo3 case tổng |
| BE Feature | 12 | 69 | NOT_RUN/ENV; OwnerAuthenticationTest.php:136–140 thêm2 case từ dataset |
| BE Contract | 4 | 12 | NOT_RUN/ENV |
| FE unit/component/store/api/router | 16 | 143 | NOT_RUN/ENV; 7 each declarations có dataset, không có coverage report |
| Browser | 7 | 21 | NOT_RUN; loop choice/content-conflict:91 và routing:13,24 làm23 registered cases/project theo source |
| E2E pure helpers | 2 | 6 | B12 PASS6/6, exit0 |
| BMAD Python | 6 | 113 functions | NOT_RUN/ENV; parametrization không được coi là113 runtime cases |
| V4 Node | 34 *.test.mjs | 394 literal declarations | B1 actual533 runtime cases (dynamic fixtures/loops),532pass1skip |

[F] Cấu hình browser có2 project laptop/phone (`playwright.config.ts:18–30`), và5 cross-device tests skip mobile (`cross-device-sync.spec.ts:23`, declarations30/104/185/219/274). [I] Source registration tương ứng46 project cases, trong đó5 intentional mobile skips,41 eligible; chưa chạy `playwright --list` hoặc browser, không claim runner collection kết quả46.

## Các module và tầng bằng chứng

| Khu vực | Bằng chứng [F] trong source | Giới hạn [I]/[H] |
|---|---|---|
| Identity/auth/owner/session | OwnerAuthenticationTest, ProvisionOwnerCommandTest, AuthResponseContractTest; FE auth/router/App specs | [H] Session expiry ngay trong metadata create/edit chưa được E2E phủ; tham chiếu E-05 |
| Account time/context | Unit AccountTimeContextTest:7,40; Feature AccountContextTest; FE account-time/account specs; E2E account-time:3 | [F] Browser account-time:11–20 mock API; không chứng minh backend timezone bằng test đó. [H] DST bổ sung chưa có native suite evidence |
| Challenge create/update/persistence | Feature ChallengeApi/UseCases/Persistence/Concurrency; FE challenges:142,262; E2E challenges:48,96 route mocks | [I] Mock lifecycle chưa phát hiện deferred preflight target switch E-04 |
| Journal/conflict | Feature ChallengeJournal/Api/JournalConflictConcurrency; FE journalDrafts/journal/lifecycle/dialog; content-conflict.spec real API+DB assertions | [I] Có integration declarations tốt nhưng chưa chạy; timeout→edit→retry và switch-before-ACK còn thiếu |
| Sync polling | sync.spec real QueryObserver tests:108–227,328,407; E2E cross-device-sync | [I] Tests prior fixes không bao phủ timer poll→foreground equal revision→late refetch failure E-03 |
| Today view | FE today.spec; BE journal/read endpoints thuộc ChallengeJournalApiTest; browser journey cross-device cập nhật challenge | [F] Không có `today.spec.ts` riêng trong7 browser files; [I] actual Today rendering sau remote journal mutation cần thêm seam case |
| AppShell/dialog/router | App.spec:45,58,319; ContentConflictDialog.spec; routing/responsive/content-conflict keyboard/touch | [I] AppShell gián tiếp được test; thiếu keyboard chọn row E-09. DeepLink/PrivatePlaceholder còn placeholder theo source, không tự bịa AC Notes/Search chưa triển khai |
| Infrastructure/Clock/provider/migrations | AccountTimeContextFactory:40 assert Clock call1; persistence/auth/concurrency integration tests | [I] Không đánh đồng thiếu test filename riêng với module không được test; không có isolated tests cho nginx/container/scripts ở product layer; config CI không chứng minh browser DB guard |

## Cô lập và DB safety

[F] `db-helper.php:5–27` yêu cầu6 env vars, APP_ENV=testing và database đúng noteflow_test **trước** PDO connection34–39. PDO DSN35 dùng explicit host/port/database, không dùng DB_URL. `php-runtime.ts:25–31,46–51,109–134` khóa Compose identity, service backend-test, env-file/project/context/argv cụ thể và loại LOCAL_/COMPOSE_ env. B12 guards25/39 và runtime tests16/27/40/49 assert các boundary này, exit0.

[F] Những guard đó không bảo vệ tất cả consumer. Native Playwright webServer42–51 nhận inherited DB_DATABASE/DB_URL; db-state.ts:16 giữ native DB_URL; php-runtime.ts:100–105 trả raw native env. PHPUnit.xml:24,30–36 nonforce defaults và TestCase.php:7–9 không có safety guard. Hook concurrency xóa toàn bảng trên selected connection. F-02 ghi exact source/probe và giới hạn vendor runtime.

[F] Compose `workers=1` và `fullyParallel=false` (config8–9) giảm reset race. Native/CI không có worker limit. `describe serial` ở content-conflict:67/cross-device:20 không khóa file/project khác; cả hai reset cùng DB/owner ở db-state13,19. [I] F-01 là test-harness isolation defect, không claim product concurrent transaction defect.

[F] CI browser-smoke env89–99 dùng fresh noteflow_test, migrate:fresh115 và npm test123; audit không thực thi job này. [I] CI explicit identity giảm nguy cơ endpoint sai, nhưng không sửa shared-reset race trong native config.

## Flaky, selectors và assertion quality

[F] Chỉ2 `waitForTimeout` ở cross-device-sync:134 (7000ms hidden/no-request) và177 (6000ms logout/no-request). Chúng quan sát absence quá1 polling interval nên không tự coi fixed wait là bug. [H] CPU-starved CI có thể kéo thời gian và giảm độ tin cậy; chưa đo được trong audit. Các convergence assert dùng auto-wait timeout10s/15s (cross-device:75,95; content-conflict:116).

[F] Specs chủ yếu dùng stable IDs, getByRole/name và backend status/body. Một số locator cấu trúc `section.nth(0/1)` ở content-conflict:98–99, `input:checked`:100, and `.first()` alerts/cross-device:211 gắn markup; [I] thay structure có thể cần cập nhật selector, không khẳng định hiện flaky.

[F] Content-conflict:54–59,86,118,180,193–196 kiểm tra exact journal version/completion/revision/ledger và payload replay, có DB read evidence declarations; modal:209–246 kiểm tra literal XSS text, keyboard focus, touch, reflow200% và DB unchanged. Cross-device:34,72,92 kiểm revision; hidden/logout request counts136/179 và sync-error recovery257–268 có meaningful assertions. Challenges native-browser spec là route-mock journey (48/96), không gọi actual Challenge backend cho mutations.

[F] Các16 FE spec đều có expect/behavior assertions; không thấy snapshot-only, only hoặc skip declarations qua source search. `sync.spec.ts:108–227` có actual QueryObserver seam với deferred requests. `journal-draft-lifecycle.spec.ts:53–62,91–103` mount actual editor/QueryClient nhưng mock preflight/ACK/API; `App.spec.ts:155–205` expire/relogin trước mount và route push nên không kiểm private form visibility lúc guest trên cùng route.

## Windows postinstall patch

[F] Package pin @playwright/test1.63.0 (`tests/e2e/package.json:11`), postinstall7 gọi patch. Script3–5 chỉ Windows;12–14 idempotent nếu patched marker hiện có;16–18 throw khi không có known marker;20 đổi first known literal trong node_modules/playwright-core/lib/coreBundle.js. Script này **mutates dependency**, đã chỉ đọc, không thực thi trong audit.

[F] README128–131 dẫn [upstream issue42109](https://github.com/microsoft/playwright/issues/42109), đã đọc2026-10-06. Issue mô tả unrecoverable EPERM trong profile cleanup và maxRetries=0 làm lỗi trả về nhanh; workaround không bảo đảm xóa profile. [I] Patch là bounded workaround hợp lý với lock pin/marker fail-closed. [H] Khi bundle thay đổi hoặc có nhiều literal trùng, chưa có fixture kiểm target/số replacement; browser cleanup Windows và temp residue chưa kiểm chứng. Không nâng giả thuyết đó thành finding ưu tiên.

[F] Candidate cho rằng manual browser.newContext không nhận baseURL đã bị loại: [official Playwright use configuration](https://playwright.dev/docs/test-use-options) mô tả runner context inheritance. [I] Không ghi FALSE_POSITIVE như một defect riêng vì không còn finding hành vi.

## Khoảng trống WS-E — không tạo finding trùng nguyên nhân

| Finding | Coverage gần nhất [F] | Regression chưa được chứng minh [I] |
|---|---|---|
| E-04 wrong-target metadata | FE challenges.spec:142,262; E2E challenges:184–204 single target | Defer preflight A, click B cùng version, assert request ID/payload và DB A/B; double-submit từ preflight |
| E-01 ACK conflict cache identity | lifecycle.spec:348–378 resource switch đóng dialog; store late auth/epoch tests243/284 | Pending resolve A→switch B/date→ACK A; assert B query key/snapshot và clean/dirty editor |
| E-02 pending resolution newer edit | journalDrafts.spec:711–747 gọi store.save direct sau typing735; lifecycle:298–345 retry không typing | UI timeout-after-real-commit→close→type revision mới→reopen/retry; immutable command và newer text vẫn dirty. content-conflict:166–196 chưa có typing giữa timeout/retry |
| E-03 timer/foreground overlap | sync.spec:540 join foreground;108–227 old refetch/ACK lifecycle; cross-device basic5s polling30 | Start từ actual timer entry, pending real QueryClient refetch, foreground equal revision, late failure, assert pending convergence và future retry |
| E-05 expiry private metadata form | App.spec:155 expiry trước mount; routing.spec:34 Back sau explicit logout; lifecycle:348 journal component expiry | Full App/router private create/edit/today view, expire không router.push, draft invisible và reauth/reconcile policy |
| E-06 auth refresh reject | api/auth.spec:46 expiry null; sync.spec:511 stop401 | account401→session503/transport failure→terminal state→reconnect retry; no unhandled void promise |
| E-07 outer account catch | sync.spec:161–198 inner journal catch pause; cross-device:104 normal hidden/offline | Deferred account GET reject sau hidden/offline hoặc newer request success; paused/new generation không bị overwrite |
| E-08 epoch remount | journalDrafts.spec:152 explicit rebase; challenges.spec:583 mounted metadata epoch | Dirty journal unmount→epoch2→remount→visible explicit rebase; không auto replay old epoch |
| E-09 list keyboard | content-conflict:202 dialog keyboard; responsive:3 shell | Tab/Enter chọn challenge row rồi mở journal; labels/focus consumer path |
| Reload/pending journal (required scenario) | lifecycle.spec:107 có reload/remount/local memory limits; journalDrafts:205 immutable retry | [H] Real browser unload/reload behavior chưa E2E-covered. Không bịa persistent drafts requirement; document admitted in-memory loss/confirmation policy trước test |

## Finding JSON

[F] Hai finding dưới đây có evidence source; Lead đã xác minh độc lập bằng `node docs/audits/full-project-audit-2026-10-06/logs/crossverify-test-safety.mjs`, cwd worktree, exit0 (`logs/phase3-test-safety-probes.meta.json`). Output `logs/phase3-test-safety-probes.log:3–7,13–48` xác nhận native parallel/inherited non-test identity, PHPUnit nonforce entries, missing guard và unscoped delete setup. Lead không gọi PHPUnit/Laravel/browser/DB (log49–51). F-00 baseline startup do Lead sở hữu, không lặp vào JSON này. [I] Gói sửa F-02 nên precede runtime rerun product suites; F-01 precede reliable repeated native/CI E2E. Audit không tự thực thi remediation.

```json
[
  {
    "id": "F-02",
    "workstream": "F",
    "title": "BE/native E2E chưa khóa danh tính DB ngoài test; hook BE có thể xóa toàn bảng",
    "severity": "CRITICAL",
    "classification": "VALID",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "backend/phpunit.xml:30",
        "note": "DB_CONNECTION/HOST/PORT/DATABASE/USERNAME/PASSWORD/URL (30–36), APP_ENV (24) không có force=true; APP_DEBUG (25) có force=true."
      },
      {
        "kind": "F",
        "ref": "backend/tests/TestCase.php:7",
        "note": "Base test class không thêm guard database hoặc bootstrap safety; search app/bootstrap/config/tests không thấy guard noteflow_test."
      },
      {
        "kind": "F",
        "ref": "backend/tests/Feature/ChallengeConcurrencyTest.php:17",
        "note": "beforeEach delete mutation_commands, challenge_target_periods, challenges, account_states, users không có owner/filter (17–21); afterEach lặp lại36–40."
      },
      {
        "kind": "F",
        "ref": "backend/tests/Feature/JournalConflictConcurrencyTest.php:22",
        "note": "Chọn connection pgsql rồi xóa toàn mutation_commands/daily_records/challenges/account_states/users (23–27)."
      },
      {
        "kind": "F",
        "ref": "tests/e2e/playwright.config.ts:42",
        "note": "Native app server giữ process.env, nhận DB_DATABASE bất kỳ ở49, không xóa DB_URL; db-state.ts:16 cũng giữ DB_URL native dù PDO helper pin database."
      },
      {
        "kind": "F",
        "ref": "backend/config/database.php:89",
        "note": "PostgreSQL config dùng env(DB_URL) cùng env(DB_DATABASE). Laravel version/reference được khóa trong composer.lock:1063–1068."
      },
      {
        "kind": "F",
        "ref": "https://raw.githubusercontent.com/laravel/framework/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Support/ConfigurationUrlParser.php",
        "note": "Pinned Laravel13.32.0 source lines51–55 merges URL primary/query after config; URL database/host thắng values tương ứng."
      },
      {
        "kind": "F",
        "ref": "https://docs.phpunit.de/en/13.4/xml-configuration-file.html#the-env-element",
        "note": "Official PHPUnit docs: env hiện có được giữ nếu force không bật. Lock là13.3.3; pinned13.3.3 source/doc fetch cache miss, không claim vendor runtime đã chạy."
      },
      {
        "kind": "F",
        "ref": "docs/audits/full-project-audit-2026-10-06/logs/F-probes.log:386",
        "note": "node docs/audits/full-project-audit-2026-10-06/logs/F-probes.mjs, cwd worktree, exit0: actual config keeps non-test DB fixture+DB_URL, actual buildPhpInvocation keeps native URL; no browser/DB/subprocess invocation."
      },
      {
        "kind": "H",
        "ref": "backend/tests/Feature/ChallengeConcurrencyTest.php:17",
        "note": "Khả năng host/credential từ môi trường trỏ tới DB thật và bảng tương thích chưa kiểm tra; không có bằng chứng DB thật đã bị chạm trong audit."
      }
    ],
    "failure_scenario": "[I] Ngoài Compose/CI môi trường cố định, shell có DB_DATABASE=DB dùng thật (hoặc DB_URL tới DB đó), endpoint truy cập được và quyền SQL hợp lệ. PHPUnit nonforce defaults giữ identity đó; TestCase không chặn; hook concurrency đầu tiên delete toàn bảng trên selected connection. Với native E2E, helper reset noteflow_test nhưng app server có thể trỏ DB khác qua inherited DB_DATABASE/URL. [F] Surface guard gap/destructive statements được xác nhận bằng trace và pure config probe; không chạy Pest/Laravel/DB để tái hiện xóa dữ liệu.",
    "affected_paths": [
      "backend/phpunit.xml",
      "backend/tests/TestCase.php",
      "backend/tests/Feature/ChallengeConcurrencyTest.php",
      "backend/tests/Feature/JournalConflictConcurrencyTest.php",
      "tests/e2e/playwright.config.ts",
      "tests/e2e/helpers/db-state.ts",
      "tests/e2e/helpers/php-runtime.ts"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Tách một danh tính DB test rõ ràng, từ chối input mâu thuẫn trước bootstrap/connect/SQL, kiểm tra effective config sau URL resolution cho cả BE và native E2E, kể cả secondary connection. Không chỉ dựa vào APP_ENV hoặc nhãn database. Thêm probes pure xác nhận unsafe DB_DATABASE/DB_URL/host không tạo connection hay chạy query; sau đó kiểm chứng trên disposable test DB.",
    "proposed_lane": "bugfix thường",
    "risk_of_fix": "HIGH"
  },
  {
    "id": "F-01",
    "workstream": "F",
    "title": "Native/CI Playwright chạy các reset DB toàn cục song song giữa file và project",
    "severity": "MEDIUM",
    "classification": "VALID",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "tests/e2e/playwright.config.ts:8",
        "note": "Native fullyParallel=true, workers unset; Compose fullyParallel=false/workers1; laptop/phone projects18–30."
      },
      {
        "kind": "F",
        "ref": "tests/e2e/content-conflict.spec.ts:67",
        "note": "describe serial chỉ nhóm file này; beforeEach69 resetTestDatabase; both project runs share fixture."
      },
      {
        "kind": "F",
        "ref": "tests/e2e/cross-device-sync.spec.ts:20",
        "note": "describe serial và laptop-only skip23; beforeEach27 cũng resetTestDatabase. Nó không khóa file content-conflict."
      },
      {
        "kind": "F",
        "ref": "tests/e2e/helpers/db-state.ts:13",
        "note": "Mọi worker/project dùng noteflow_test, cùng owner; reset19–21 gọi global reset và cache clear."
      },
      {
        "kind": "F",
        "ref": "tests/e2e/helpers/db-helper.php:49",
        "note": "reset49–53 delete toàn mutation_commands, challenge_target_periods, challenges và sessions; account context owner reset revision0/epoch1 ở73–75."
      },
      {
        "kind": "F",
        "ref": ".github/workflows/ci.yml:123",
        "note": "Browser job gọi npm test không --workers=1/Compose override; CI test DB explicit an toàn về endpoint nhưng shared across workers."
      },
      {
        "kind": "F",
        "ref": "docs/audits/full-project-audit-2026-10-06/logs/F-probes.log:392",
        "note": "Pure actual-source config probe exit0 confirms native fullyParallel and no explicit worker limit, Compose workers1."
      }
    ],
    "failure_scenario": "[I] Worker A đang content-conflict (laptop), đã login/tạo journal; worker B bắt đầu cross-device-sync hoặc content-conflict(phone), beforeEach global reset xóa challenge/session của A và reset account_revision. A nhận401/404 hoặc revision/command_count khác expected; test correctness evidence phụ thuộc scheduling. [F] Scope shared/parallel được xác nhận; chưa đo tần suất flaky và không claim CI đã fail.",
    "affected_paths": [
      "tests/e2e/playwright.config.ts",
      "tests/e2e/content-conflict.spec.ts",
      "tests/e2e/cross-device-sync.spec.ts",
      "tests/e2e/helpers/db-helper.php",
      ".github/workflows/ci.yml"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Chọn global workers1/serial cho tất cả real-DB suites hoặc isolate DB/schema/owner theo worker+project với teardown có scope. Giữ mock-only suites parallel nếu ownership tài nguyên rõ. Future check: list runnable project cases, run native/CI twice with repeat-each và chứng minh reset của B không ảnh hưởng A.",
    "proposed_lane": "bugfix thường",
    "risk_of_fix": "HIGH"
  }
]
```
