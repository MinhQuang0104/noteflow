# Phase1 — Baseline deterministic checks

[F] Tất cả attempt hợp lệ chạy tại worktree audit với cwd dưới đây. Exit code là exit thật của lệnh, không chuyển lỗi khởi động thành test FAIL/PASS. [I] NOT_RUN/ENV mô tả check chưa thực thi đến runner vì dependency/mạng; điều này không chứng minh code sản phẩm fail.

[F] Không cài dependency hoặc copy .env vì user giới hạn mọi ghi vào audit output. npm/composer/pytest cache được định tuyến vào logs; npx --no-install (retry offline) giữ nguyên ý định chạy Vitest mà không cài thêm. B8 proof có xung đột read-only, B15 có guard đã quy định.

| Check | Trạng thái | Exit thực tế | Giới hạn / kết quả |
|---|---|---|---|
| B1 | PASS | B1: 0 | 533 tests: 532 passed, 0 failed, 1 skipped (Windows symlink unavailable). Full suite; source equals 98def53, checkout HEAD03dbd098. |
| B2 | NOT_RUN/ENV | B2: 1; B2-retry1: 1 | Bundled Python3.12.14; pytest chưa cài. |
| B3 | NOT_RUN/ENV | B3: 1; B3-retry1: 1 | vue-tsc thiếu. |
| B4 | NOT_RUN/ENV | B4: 1; B4-retry1: 1 | run-s thiếu; oxlint/eslint chưa chạy. |
| B5 | NOT_RUN/ENV | B5: 1; B5-retry1: 1 | Vitest chưa có. npx install disabled; EACCES/ENOTCACHED; không có test/coverage. |
| B6 | NOT_RUN/ENV | B6: 1; B6-retry1: 1 | Vite thiếu; không sinh build. |
| B7 | NOT_RUN/ENV | B7: 1; B7-retry1: 1 | redocly thiếu. |
| B8 | NOT_RUN/ENV + READ_ONLY_CONFLICT | B8-check: 1; B8-check-retry1: 1 | check thiếu yaml; proof không gọi vì sửa tracked OpenAPI (prove-contract-drift.mjs:15,25). |
| B9 | NOT_RUN/ENV | B9: 255; B9-retry2-correct-cwd: 255 | vendor/autoload.php thiếu; chưa có Pest nào chạy. FindingF-00 HIGH theo rubric plan. |
| B10 | NOT_RUN/ENV | B10: 1; B10-retry2-correct-cwd: 1 | vendor/bin/phpstan thiếu. |
| B11 | NOT_RUN/ENV | B11: 1; B11-retry2-correct-cwd: 1 | vendor/bin/pint thiếu. |
| B12 | PASS | B12: 0 | Runner tương ứng là node --test; 6/6 helpers passed, không DB/network. |
| B13 | NOT_RUN/ENV (PARTIAL) | B13-frontend: 1; B13-frontend-retry1: 1; B13-e2e: 0; B13-backend: 0; B13-backend-locked-correct-cwd: 100; B13-backend-locked-retry1: 100 | FE advisory endpoint bị EACCES; E2E --omit=dev exit0 chỉ scope production dependencies (0 packages); composer audit exit0 SKIPPED vì không installed packages; supplement --locked bị curl7 exit100. Không kết luận dependencies an toàn. |
| B14 | PASS | B14-diff: 0; B14-ignore: 0; B14-large-repeat: 0 | Diff whitespace sạch; tracked-ignore rỗng; 635 tracked paths, không file >=1MiB. Size-repeat có thời gian đo thật; B14-large cũ seconds0 nghĩa là không đo, không dùng làm timing. |
| B15 | NOT_RUN/WORKTREE_GUARD | — (không gọi) | Không gọi verify-local.ps1 trong audit hoặc canonical; Assert-CanonicalCheckout:39–60 / call:225. Không vượt guard. |

[F] Audit runner từng tính sai cwd cho B9-retry1/B10-retry1/B11-retry1/B13-backend-locked (frontend/backend không tồn tại). Các log được giữ để minh bạch, **không** dùng làm evidence backend. Sau đó chạy lại với absolute backend cwd; bảng và chi tiết chỉ dùng attempt hợp lệ. Không coi lỗi runner của audit là finding sản phẩm.

[F] Python có sẵn qua bundled runtime; pytest không có. Host PHP8.5.9 khác runtime PHP8.4 được tài liệu yêu cầu; backend checks chưa khởi động nên không giả định đã kiểm PHP8.4. B1 skip duy nhất: symlink creation unavailable (B1.log:431).

## B1

[F] B1: command "npm run test:v4"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T03:55:24.7013824Z; elapsed 573.382s; exit 0. Full log: [logs/B1.log](logs/B1.log).

```text
✔ Runner refuses a Story action outside the linked worktree that owns the Story branch (7038.3236ms)
✔ LOW PASS runs canonical and focused checks then persists only verification metadata (40325.2705ms)
✔ HIGH PASS stops at REVIEW_REQUIRED with immutable pending evidence and no commit (24247.4793ms)
✔ same-Lead APPROVE requires exact bounded evidence and persists verification plus review receipts (34314.0256ms)
✔ same-Lead APPROVE accepts one ordered evidence set covering five changed paths (33249.7066ms)
✔ CHANGES_REQUIRED blocks and stale policy rejects continuation without mutation (23872.5919ms)
✔ NEED_MORE_EVIDENCE permits one bounded round and rejects a second round (23445.1798ms)
✔ verification metadata recovery resumes an interrupted commit without replay (24224.8717ms)
✔ wrong verification successor is rejected before creating a transaction or lock (20495.9548ms)
✔ verification recovery resumes after-write without regenerating evidence (26694.35ms)
✔ verification recovery resumes after-metadata-stage without regenerating evidence (25227.3876ms)
✔ interrupted metadata recovery rejects a changed receipt and preserves partial state (17805.701ms)
✔ Runner retires only the unwritten legacy transaction and preserves its journal and lock evidence (12682.5748ms)
✔ unwritten retirement rejects wrong-checkpoint without changing recovery evidence (8242.3717ms)
✔ unwritten retirement rejects foreign-lock without changing recovery evidence (8347.5957ms)
✔ unwritten retirement rejects dirty-product without changing recovery evidence (8196.4917ms)
✔ unwritten retirement rejects dirty-metadata without changing recovery evidence (8381.9988ms)
✔ unwritten retirement rejects staged-work without changing recovery evidence (7769.7639ms)
✔ unwritten retirement rejects non-idle without changing recovery evidence (6907.0585ms)
✔ retirement binds maintenance changes and rejects a stale preview (10947.7017ms)
✔ retirement resumes interrupted owned-lock archival without replacing evidence (10835.3963ms)
✔ kernel-written review receipts round-trip through the finalization gate (20599.5434ms)
ℹ tests 533
ℹ suites 0
ℹ pass 532
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 571781.3822
```

## B2

[F] B2: command "& 'C:\\Users\\ACER\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe' -m pytest _bmad/scripts/tests -q"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T03:55:25.2052483Z; elapsed 0.131s; exit 1. Full log: [logs/B2.log](logs/B2.log).

```text
C:\Users\ACER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe: No module named pytest
```

[F] B2-retry1: command "& 'C:\\Users\\ACER\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe' -m pytest _bmad/scripts/tests -q"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T03:57:54.8418390Z; elapsed 0.262s; exit 1. Full log: [logs/B2-retry1.log](logs/B2-retry1.log).

```text
C:\Users\ACER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe: No module named pytest
```

## B3

[F] B3: command "npm run type-check"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:56:00.2375192Z; elapsed 2.439s; exit 1. Full log: [logs/B3.log](logs/B3.log).

```text

> frontend@0.0.0 type-check
> vue-tsc --build

'vue-tsc' is not recognized as an internal or external command,
operable program or batch file.
```

[F] B3-retry1: command "npm run type-check"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:55.1915096Z; elapsed 1.810s; exit 1. Full log: [logs/B3-retry1.log](logs/B3-retry1.log).

```text

> frontend@0.0.0 type-check
> vue-tsc --build

'vue-tsc' is not recognized as an internal or external command,
operable program or batch file.
```

## B4

[F] B4: command "npm run lint"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:56:02.7591757Z; elapsed 2.409s; exit 1. Full log: [logs/B4.log](logs/B4.log).

```text

> frontend@0.0.0 lint
> run-s "lint:*"

'run-s' is not recognized as an internal or external command,
operable program or batch file.
```

[F] B4-retry1: command "npm run lint"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:57.0327007Z; elapsed 1.540s; exit 1. Full log: [logs/B4-retry1.log](logs/B4-retry1.log).

```text

> frontend@0.0.0 lint
> run-s "lint:*"

'run-s' is not recognized as an internal or external command,
operable program or batch file.
```

## B5

[F] B5: command "npx --no-install vitest run"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:56:05.2054733Z; elapsed 83.596s; exit 1. Full log: [logs/B5.log](logs/B5.log).

```text
npm error code EACCES
npm error errno EACCES
npm error FetchError: request to https://registry.npmjs.org/vitest failed, reason:
npm error     at ClientRequest.<anonymous> (C:\Users\ACER\AppData\Roaming\npm\node_modules\npm\node_modules\minipass-fetch\lib\index.js:130:14)
npm error     at ClientRequest.emit (node:events:514:28)
npm error     at emitErrorEvent (node:_http_client:114:11)
npm error     at _destroy (node:_http_client:1167:9)
npm error     at onSocketNT (node:_http_client:1188:5)
npm error     at process.processTicksAndRejections (node:internal/process/task_queues:91:21) {
npm error   code: 'EACCES',
npm error   errno: 'EACCES',
npm error   type: 'system'
npm error }
npm error
npm error The operation was rejected by your operating system.
npm error It's possible that the file was already in use (by a text editor or antivirus),
npm error or that you lack permissions to access it.
npm error
npm error If you believe this might be a permissions issue, please double-check the
npm error permissions of the file and its containing directories, or try running
npm error the command again as root/Administrator.
npm error A complete log of this run can be found in: D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\docs\audits\full-project-audit-2026-10-06\logs\.npm-cache\_logs\2026-10-06T03_56_07_189Z-debug-0.log
```

[F] B5-retry1: command "npx --offline --no-install vitest run"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:58.5944665Z; elapsed 6.016s; exit 1. Full log: [logs/B5-retry1.log](logs/B5-retry1.log).

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/vitest failed: cache mode is 'only-if-cached' but no cached response is available.
npm error A complete log of this run can be found in: D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\docs\audits\full-project-audit-2026-10-06\logs\.npm-cache\_logs\2026-10-06T03_57_59_617Z-debug-0.log
```

## B6

[F] B6: command "npm run build-only"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:28.8462891Z; elapsed 1.931s; exit 1. Full log: [logs/B6.log](logs/B6.log).

```text

> frontend@0.0.0 build-only
> vite build

'vite' is not recognized as an internal or external command,
operable program or batch file.
```

[F] B6-retry1: command "npm run build-only"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:58:04.6461990Z; elapsed 1.993s; exit 1. Full log: [logs/B6-retry1.log](logs/B6-retry1.log).

```text

> frontend@0.0.0 build-only
> vite build

'vite' is not recognized as an internal or external command,
operable program or batch file.
```

## B7

[F] B7: command "npm run contract:validate"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:30.8209446Z; elapsed 1.966s; exit 1. Full log: [logs/B7.log](logs/B7.log).

```text

> frontend@0.0.0 contract:validate
> redocly lint ../contracts/openapi.yaml --config ../redocly.yaml

'redocly' is not recognized as an internal or external command,
operable program or batch file.
```

[F] B7-retry1: command "npm run contract:validate"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:58:06.6736053Z; elapsed 1.470s; exit 1. Full log: [logs/B7-retry1.log](logs/B7-retry1.log).

```text

> frontend@0.0.0 contract:validate
> redocly lint ../contracts/openapi.yaml --config ../redocly.yaml

'redocly' is not recognized as an internal or external command,
operable program or batch file.
```

## B8

[F] B8-check: command "npm run contract:check"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:32.8531544Z; elapsed 2.162s; exit 1. Full log: [logs/B8-check.log](logs/B8-check.log).

```text

> frontend@0.0.0 contract:check
> node scripts/generate-openapi-types.mjs --check

node:internal/modules/package_json_reader:331
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml' imported from D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend\scripts\generate-openapi-types.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:331:9)
    at packageResolve (node:internal/modules/esm/resolve:784:25)
    at moduleResolve (node:internal/modules/esm/resolve:873:18)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:705:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:725:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:763:56)
    at #resolve (node:internal/modules/esm/loader:687:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:607:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:276:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v24.21.0
```

[F] B8-check-retry1: command "npm run contract:check"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:58:08.1757240Z; elapsed 1.455s; exit 1. Full log: [logs/B8-check-retry1.log](logs/B8-check-retry1.log).

```text

> frontend@0.0.0 contract:check
> node scripts/generate-openapi-types.mjs --check

node:internal/modules/package_json_reader:331
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml' imported from D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\frontend\scripts\generate-openapi-types.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:331:9)
    at packageResolve (node:internal/modules/esm/resolve:784:25)
    at moduleResolve (node:internal/modules/esm/resolve:873:18)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:705:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:725:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:763:56)
    at #resolve (node:internal/modules/esm/loader:687:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:607:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:276:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v24.21.0
```

## B9

[F] B9: command "composer test"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T03:56:01.4726587Z; elapsed 2.818s; exit 255. Full log: [logs/B9.log](logs/B9.log).

```text

PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
PHP Warning:  require(D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php): Failed to open stream: No such file or directory in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10

PHP Fatal error:  Uncaught Error: Failed opening required 'D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php' (include_path='.;C:\php\pear') in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan:10
Stack trace:
#0 {main}
  thrown in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10
Warning: require(D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php): Failed to open stream: No such file or directory in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10

Fatal error: Uncaught Error: Failed opening required 'D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php' (include_path='.;C:\php\pear') in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan:10
Stack trace:
#0 {main}
  thrown in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10
Script @php artisan config:clear --ansi handling the test event returned with error code 255
```

[F] B9-retry2-correct-cwd: command "composer test"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T04:00:08.4311516Z; elapsed 1.229s; exit 255. Full log: [logs/B9-retry2-correct-cwd.log](logs/B9-retry2-correct-cwd.log).

```text

PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57

Warning: require(D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php): Failed to open stream: No such file or directory in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10

Fatal error: Uncaught Error: Failed opening required 'D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php' (include_path='.;C:\php\pear') in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan:10
Stack trace:
#0 {main}
  thrown in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10
PHP Warning:  require(D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php): Failed to open stream: No such file or directory in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10
PHP Fatal error:  Uncaught Error: Failed opening required 'D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend/vendor/autoload.php' (include_path='.;C:\php\pear') in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan:10
Stack trace:
#0 {main}
  thrown in D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\backend\artisan on line 10
Script @php artisan config:clear --ansi handling the test event returned with error code 255
```

## B10

[F] B10: command "composer analyse"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T03:56:04.5117975Z; elapsed 2.474s; exit 1. Full log: [logs/B10.log](logs/B10.log).

```text
PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300

Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
'phpstan' is not recognized as an internal or external command,
operable program or batch file.
Script phpstan analyse --memory-limit=1G handling the analyse event returned with error code 1
```

[F] B10-retry2-correct-cwd: command "composer analyse"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T04:00:09.7463690Z; elapsed 1.150s; exit 1. Full log: [logs/B10-retry2-correct-cwd.log](logs/B10-retry2-correct-cwd.log).

```text

PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
'phpstan' is not recognized as an internal or external command,
operable program or batch file.
Script phpstan analyse --memory-limit=1G handling the analyse event returned with error code 1
```

## B11

[F] B11: command "& './vendor/bin/pint' --test"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T03:56:07.2278421Z; elapsed 3.829s; exit 1. Full log: [logs/B11.log](logs/B11.log).

```text
&: The term './vendor/bin/pint' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
```

[F] B11-retry2-correct-cwd: command "& './vendor/bin/pint' --test"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T04:00:10.9314695Z; elapsed 0.955s; exit 1. Full log: [logs/B11-retry2-correct-cwd.log](logs/B11-retry2-correct-cwd.log).

```text
&: The term './vendor/bin/pint' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
```

## B12

[F] B12: command "node --test helpers/*.test.ts"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\tests\\e2e"; startedUTC 2026-10-06T03:56:32.5022180Z; elapsed 1.657s; exit 0. Full log: [logs/B12.log](logs/B12.log).

```text
✔ db-helper rejects a non-testing database before PostgreSQL connection (565.6267ms)
✔ db-helper rejects missing identity variables before PostgreSQL connection (296.6765ms)
✔ native mode invokes PHP with argv and the selected working directory (2.6281ms)
✔ compose mode invokes the fixed backend-test service without a shell (0.6871ms)
✔ arguments containing spaces remain one argument (0.2569ms)
✔ invalid mode and mixed compose identity are rejected before execution (0.8722ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1216.4913
```

## B13

[F] B13-frontend: command "npm audit --omit=dev"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T03:57:35.0730252Z; elapsed 6.872s; exit 1. Full log: [logs/B13-frontend.log](logs/B13-frontend.log).

```text
npm warn audit request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason:
undefined
npm error audit endpoint returned an error
npm error A complete log of this run can be found in: D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\docs\audits\full-project-audit-2026-10-06\logs\.npm-cache\_logs\2026-10-06T03_57_36_561Z-debug-0.log
```

[F] B13-frontend-retry1: command "npm audit --omit=dev"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\frontend"; startedUTC 2026-10-06T04:00:13.6690435Z; elapsed 4.672s; exit 1. Full log: [logs/B13-frontend-retry1.log](logs/B13-frontend-retry1.log).

```text
npm warn audit request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason:
undefined
npm error audit endpoint returned an error
npm error A complete log of this run can be found in: D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit\docs\audits\full-project-audit-2026-10-06\logs\.npm-cache\_logs\2026-10-06T04_00_14_436Z-debug-0.log
```

[F] B13-e2e: command "npm audit --omit=dev"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\tests\\e2e"; startedUTC 2026-10-06T03:56:34.4488907Z; elapsed 7.625s; exit 0. Full log: [logs/B13-e2e.log](logs/B13-e2e.log).

```text
found 0 vulnerabilities
```

[F] B13-backend: command "composer audit"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T03:56:11.1324209Z; elapsed 2.292s; exit 0. Full log: [logs/B13-backend.log](logs/B13-backend.log).

```text

PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
No packages - skipping audit.
```

[F] B13-backend-locked-correct-cwd: command "composer audit --locked"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T04:00:11.9075250Z; elapsed 1.712s; exit 100. Full log: [logs/B13-backend-locked-correct-cwd.log](logs/B13-backend-locked-correct-cwd.log).

```text
PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300

Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
More deprecation notices were hidden, run again with `-v` to show them.

In CurlDownloader.php line 390:

  curl error 7 while downloading https://repo.packagist.org/packages.json: Failed to connect to repo.packagist.org:44
  3 after 0 ms: Could not connect to server


audit [--no-dev] [-f|--format FORMAT] [--locked] [--abandoned ABANDONED] [--ignore-severity IGNORE-SEVERITY]
```

[F] B13-backend-locked-retry1: command "composer audit --locked"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit\\backend"; startedUTC 2026-10-06T04:02:46.8105979Z; elapsed 1.510s; exit 100. Full log: [logs/B13-backend-locked-retry1.log](logs/B13-backend-locked-retry1.log).

```text

Deprecated: Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
PHP Deprecated:  Case statements followed by a semicolon (;) are deprecated, use a colon (:) instead in phar://C:/composer/composer.phar/vendor/react/promise/src/functions.php on line 300
Deprecation Notice: The predefined locally scoped $http_response_header variable is deprecated, call http_get_last_response_headers() instead in phar://C:/composer/composer.phar/vendor/justinrainbow/json-schema/src/JsonSchema/Uri/Retrievers/FileGetContents.php:57
More deprecation notices were hidden, run again with `-v` to show them.

In CurlDownloader.php line 390:

  curl error 7 while downloading https://repo.packagist.org/packages.json: Failed to connect to repo.packagist.org:44
  3 after 0 ms: Could not connect to server


audit [--no-dev] [-f|--format FORMAT] [--locked] [--abandoned ABANDONED] [--ignore-severity IGNORE-SEVERITY]
```

## B14

[F] B14-diff: command "git diff --check main"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T03:56:31.7069527Z; elapsed 0.751s; exit 0. Full log: [logs/B14-diff.log](logs/B14-diff.log).

```text

```

[F] B14-ignore: command "git ls-files -i -c --exclude-standard"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T03:56:32.5440404Z; elapsed 0.201s; exit 0. Full log: [logs/B14-ignore.log](logs/B14-ignore.log).

```text

```

[F] B14-large-repeat: command "git -c core.quotepath=false ls-files; Get-Item for each tracked path (size >=1MiB)"; cwd "D:\\Workspace\\Tu_Hoc\\New_Project_My_Note\\.worktrees\\full-project-audit"; startedUTC 2026-10-06T04:17:34.1678236Z; elapsed 0.211s; exit 0. Full log: [logs/B14-large-repeat.log](logs/B14-large-repeat.log).

```text
Tracked paths scanned: 635 Threshold bytes: 1048576 Matching files: 0
```

## B15

[F] Không gọi verify-local.ps1 trong audit hoặc canonical; Assert-CanonicalCheckout:39–60 / call:225. Không vượt guard. Không có exit code/thời lượng cho lệnh không gọi.

## Phần không thực thi

[F] B8-proof: NOT_RUN/READ_ONLY_CONFLICT; script cố tình thay OpenAPI rồi phục hồi để chứng minh drift. Không có exit code. [F] B15: NOT_RUN/WORKTREE_GUARD; không gọi canonical dưới danh nghĩa audit. Người dùng tự chạy canonical tại code tương đương, ghi SHA và log, rồi đính kèm phụ lục trong lượt review sau.

[I] B1/B12/B14 PASS chỉ bao phủ đúng lệnh và phạm vi đã chạy; không thay thế frontend/backend/full-stack/AT gates.
