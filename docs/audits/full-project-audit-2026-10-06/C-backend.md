# WS-C — Backend: bảo mật, toàn vẹn dữ liệu và đồng thời

## Phạm vi và giới hạn bằng chứng

- [F] Worktree: `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`; branch `audit/full-project-2026-10-06`; HEAD `03dbd098e36245f51a4b8e875e89c1c0bb21acc6`. Block `git rev-parse HEAD; git branch --show-current; git status --short` chạy trong worktree, exit 0, status lúc bắt đầu không có output.
- [F] `git diff --name-only 98def5358983072216a28754e87b1cd5f884d258 HEAD -- backend` chạy trong worktree, exit 0, không có output: backend tại audit HEAD giống source baseline `98def5358983072216a28754e87b1cd5f884d258`.
- [F] Đã đọc `AGENTS.md`, `.agents/routing/task-router.md` và `AUDIT-PLAN.md` trong worktree. Pointer IDLE là preflight do Lead cung cấp; worker này không đọc canonical và không tự xác minh lại pointer.
- [F] Kiểm tra read-only `Test-Path backend/vendor/autoload.php` trả false; PHP có sẵn. Hai snippet không bootstrap Laravel/DB đã chạy với PHP 8.5.9, exit 0, mô tả ở phụ lục. Worker chỉ ghi báo cáo này và `C-findings.json` sau khi Lead cho phép.
- [F] Pest/Feature/Contract, test concurrency PostgreSQL, migration up/down, Larastan, Pint và Composer audit: **NOT_RUN/ENV** vì vendor vắng và scope không cho cài dependencies hoặc chạy baseline phụ. HTTP status dưới đây được kết luận bằng code trace khi ghi rõ [I], không phải response đã tái hiện.

## Kết luận WS-C

[I] Owner isolation và transaction/idempotency đang có các cơ chế phù hợp trong mã đã đọc; chưa xác nhận đường vượt auth, IDOR, lost update hoặc duplicate persisted mutation tại HEAD này. Có ba gap được xác định bằng mã/bằng chứng tĩnh ở validation và concurrency-test coverage; hai hành vi cần chốt intent: chuẩn hóa whitespace journal và retention khi chuyển owner rồi quay lại. Không có HIGH/CRITICAL được xác nhận trong WS-C. Kết luận này không thay thế full backend suite trên PostgreSQL.

| ID | Severity | Classification | Verification | Nội dung |
| --- | --- | --- | --- | --- |
| C-01 | MEDIUM | VALID | CONFIRMED bằng static trace | NUL nội bộ qua text validation rồi lỗi persistence |
| C-02 | MEDIUM | VALID | CONFIRMED expression/framework trace | Email array bị cast trước validation |
| C-03 | MEDIUM | VALID | CONFIRMED inspection | Duplicate-command concurrency của Challenge chưa chạy hai use case chồng lấn |
| C-04 | MEDIUM | SPEC_AMBIGUITY | CONFIRMED hành vi tĩnh | Middleware mặc định trim biên journal nhưng intent chưa rõ |
| C-05 | MEDIUM | NEEDS_HUMAN_DECISION | CONFIRMED hành vi tĩnh | Chuyển owner A→B→A giữ dữ liệu nhưng tái tạo state revision 0 |

## Auth, routes và owner isolation

| Boundary | Kết quả có bằng chứng |
| --- | --- |
| Public health | [F] `/api/v1/foundation` chỉ trả status/service (`backend/routes/api.php:10`, `backend/app/Http/Controllers/FoundationHealthController.php:11`); `/up` được khai báo health route (`backend/bootstrap/app.php:19`). Không thấy private content tại các handler này. |
| Login/logout | [F] `/login` có `guest`, `throttle:login`, `private.no-store`; `/logout` có `auth`, `private.no-store` (`backend/routes/web.php:6`, `:10`). Login thêm `is_owner=true` vào credentials, regenerate session, redirect theo allowlist; logout invalidate session và regenerate CSRF (`AuthenticatedSessionController.php:20`, `:29`, `:50`, `:69`). |
| Mọi product API hiện có | [F] Session, account, challenge list/create/detail/update và journal GET/PUT đều có `private.no-store`, `auth:sanctum`, `owner` (`backend/routes/api.php:13`–`:43`). EnsureOwner kiểm tra boolean owner tại `backend/app/Http/Middleware/EnsureOwner.php:13`. |
| CSRF/cookie | [F] `statefulApi()` bật tại `backend/bootstrap/app.php:22`; Sanctum cấu hình web guard, EncryptCookies và ValidateCsrfToken tại `backend/config/sanctum.php:40`, `:81`. Session lifetime mặc định 120 phút, HttpOnly=true, SameSite=lax, secure theo env (`backend/config/session.php:35`, `:172`, `:185`, `:202`). [F] Story 1.2 để session duration là cấu hình vận hành (`_bmad-output/implementation-artifacts/1-2-đăng-nhập-và-bảo-vệ-dữ-liệu-owner.md:15`). |
| Rate limit | [F] 5 lần/phút theo email đã normalize + IP (`backend/app/Providers/AppServiceProvider.php:27`). Gap input array là C-02. |
| Token issuance/revoke | [F] User dùng HasFactory/Notifiable, không có HasApiTokens (`backend/app/Models/User.php:18`); route hiện có không phát token; Story 1.2 chủ động loại bearer-token flow (`story 1.2:29`). [I] `sanctum.expiration=null` (`backend/config/sanctum.php:53`) không đủ để gọi là token-lifetime vulnerability trên một flow chưa tồn tại. Flow hiện tại revoke session. |
| Single owner/provision | [F] Partial unique index `users_single_owner` ngăn hai row `is_owner=true` (`backend/database/migrations/2026_09_18_000000_add_owner_admission_to_users_table.php:16`). ProvisionOwner lấy mật khẩu qua hidden prompt, tối thiểu 12 ký tự và confirmation, hash qua cast User, transactionally chuyển admission và xóa sessions (`backend/app/Console/Commands/ProvisionOwner.php:20`, `:29`, `:35`, `:53`; `backend/app/Models/User.php:30`). [I] Không có cơ sở báo race tạo hai owner được commit; unique index bảo vệ invariant đó. Retention/state riêng ở C-05. |

[F] Các read model đều bind owner: `GetChallengeListQuery.php:24`, `:36`; `GetChallengeDetailQuery.php:24`, `:33`; `GetJournalQuery.php:17`, `:25`, `:34`; `AccountContextController.php:18`. Mutation bind owner ở account lock, ledger, challenge và daily record (`CreateChallengeUseCase.php:41`, `:74`; `UpdateChallengeMetadataUseCase.php:36`, `:70`, `:85`, `:95`; `SaveJournalUseCase.php:27`, `:51`, `:66`, `:88`).

[I] Update metadata cuối cùng chỉ lọc `id` (`UpdateChallengeMetadataUseCase.php:162`) không tạo IDOR riêng: trước đó row đã được chọn theo owner tại :85–:87, và `challenges.id` là global primary key (`2026_09_19_020000_create_challenges_and_target_periods_tables.php:13`). Các query toàn account của provisioning là command quản trị, không nhận owner_id do browser cung cấp. POST/PATCH/PUT từ chối field ngoài allowlist, gồm owner/completion fields (`ChallengeController.php:40`, `:142`; `ChallengeJournalController.php:50`).

[F] Source tests có owner/non-owner/401/403, redirect, rotation, logout, CSRF và throttle (`OwnerAuthenticationTest.php:16`, `:48`, `:61`, `:79`, `:105`, `:117`, `:148`, `:169`); journal có authenticated/private/foreign resource tests (`ChallengeJournalApiTest.php:118`; `ChallengeJournalTest.php:152`). Các test này **NOT_RUN**, không được hiểu là fresh PASS.

## Idempotency, version và đồng thời

| Mutation | Thứ tự/boundary được đọc |
| --- | --- |
| Create challenge | [F] DB transaction → owner account FOR UPDATE → write fence/epoch → hash normalized name/description/target → owner/epoch/command lookup → create challenge + initial target + increment revision + ledger, trong cùng transaction (`CreateChallengeUseCase.php:40`, `:43`, `:50`, `:74`, `:104`, `:143`). |
| Update metadata | [F] Cùng account lock/fence/epoch/ledger trước resource read; stale base trả snapshot; no-op lưu ACK/ledger nhưng không tăng revision; thay đổi tăng version/revision rồi lưu ledger (`UpdateChallengeMetadataUseCase.php:35`, `:38`, `:70`, `:102`, `:126`, `:143`, `:158`, `:190`). |
| Save journal | [F] Account lock/fence/epoch/ledger trước challenge/day; replay kiểm thêm command_type; stale journal_version trả snapshot; ghi journal không đổi is_done/completion_version, no-op không tăng revision (`SaveJournalUseCase.php:26`, `:29`, `:51`, `:57`, `:94`, `:107`, `:123`, `:151`). |

[I] Với PostgreSQL, account lock dùng chung giữa ba mutation thu hẹp race giữa đọc ledger và ghi; unique `(owner_id,data_epoch,command_id)` là lớp bảo vệ thêm (`2026_09_19_030000_create_mutation_commands_table.php:23`). Ledger và dữ liệu cùng transaction nên một lỗi cuối transaction không được coi là partial success. Không thấy đường product write khác bỏ account lock trong inventory `rg -n 'DB::|User::|query\(' backend/app backend/routes` (exit 0).

[F] Domain exceptions được controller map: version/key reuse/stale epoch→409, write fence→423, invalid name/target/day/text→422 (`ChallengeController.php:88`, `:195`; `ChallengeJournalController.php:86`). Save same-value vẫn kiểm base version trước no-op (`SaveJournalUseCase.php:94`, `:107`); [I] điều này phù hợp yêu cầu stale text phải conflict ở AD-6, không áp quy tắc same-result Done lên journal.

[F] `ChallengeConcurrencyTest.php:64` và `:112` dùng hai PostgreSQL connections, open transactions và lock_timeout: đây là contention thật ở primitive account row. Hai test :148 và :211 gọi các use case tuần tự. [F] `JournalConflictConcurrencyTest.php:100` mở outer transaction A, gọi SaveJournal, chạy B trên connection thứ hai khi A chưa commit, nhận 55P03, commit A rồi kiểm conflict và persisted state. [I] Journal test có evidence thiết kế contention thực, nhưng chưa chạy tại audit; Challenge duplicate/application overlap còn gap C-03. Không gọi các test tuần tự là bằng chứng hai writer đồng thời.

## Time invariants và validation

- [F] SystemClock lấy UTC (`backend/app/Modules/Identity/Infrastructure/SystemClock.php:13`); factory capture clock đúng một lần (`AccountTimeContextFactory.php:14`); context đổi timezone bằng IANA, derive account date và Monday–Sunday bằng calendar days (`AccountTimeContext.php:20`–`:30`). Account timezone bị CHECK cố định `Asia/Ho_Chi_Minh` (`2026_09_18_010000_create_account_states_table.php:19`).
- [F] Unit test source kiểm tra Sunday last second/Monday first second khi runtime timezone khác và single clock capture (`AccountTimeContextTest.php:7`, `:40`). Snippet C-EXEC-01 chạy trực tiếp class này ở sáu instant; output HCM đổi ngày/tuần đúng hai mốc 16:59:59Z/17:00:00Z, NY giữ cùng local date/week qua hai DST transitions, exit 0. [I] NY chỉ là kiểm tra thêm cho routine; không suy ra sản phẩm hỗ trợ chọn timezone ngoài giá trị đã duyệt.
- [F] Journal phải canonical YYYY-MM-DD, calendar date có thật, không trước start_date và không sau accountToday (`SaveJournalUseCase.php:74`–`:82`; `GetJournalQuery.php:27`–`:31`). Các ngày rất cũ vẫn được phép nếu từ start_date; đây phù hợp PRD cho ghi bù toàn khoảng (`docs/product/prd.md:278`), không tự thêm retention limit.
- [F] Name trim rồi phải không trống và tối đa 255 Unicode characters (`CreateChallengeUseCase.php:64`, `:93`; `UpdateChallengeMetadataUseCase.php:59`, `:117`). Target 1–7 được validator, use case và SQL CHECK bảo vệ (`ChallengeController.php:59`; `CreateChallengeUseCase.php:89`; migration target periods:43).
- [F] Journal bắt buộc string/nonblank; không có clear/delete và không có arbitrary length limit là chủ ý Story 2.3 (`ChallengeJournalController.php:65`; `SaveJournalUseCase.php:84`; `_bmad-output/implementation-artifacts/2-3-ghi-và-sửa-journal-tùy-chọn.md:50`). Không báo thiếu maxLength là bug. Description blank→null được chuẩn hóa trước hash (`CreateChallengeUseCase.php:59`; `UpdateChallengeMetadataUseCase.php:54`). Gap ký tự không thể lưu là C-01.
- [F] GET parser chạy trước regex (`GetJournalQuery.php:27`), còn PUT kiểm regex trước parser (`SaveJournalUseCase.php:75`). Snippet C-EXEC-01 xác nhận PHP parser ném ValueError với NUL trong date. [H] Một null-byte URL có thể bị proxy/framework chặn trước handler; chưa chứng minh đường HTTP thật, nên không đưa thành finding độc lập.

## Migrations, index, FK, nullable và rollback

[F] Đã đọc toàn bộ tám migrations tại HEAD. `account_states.owner_id` là PK/FK cascade; challenges FK owner→users cascade và có `(owner_id,id)` unique; target periods và daily records có composite owner-compatible FK tới challenges, cascade theo challenge; target periods unique challenge/effective_from; daily PK challenge/local_date; ledger unique owner/epoch/command. Refs: `2026_09_18_010000_create_account_states_table.php:15`; `2026_09_19_020000_create_challenges_and_target_periods_tables.php:14`, `:21`, `:34`, `:37`; `2026_09_24_010000_create_challenge_daily_records_table.php:22`, `:24`; `2026_09_19_030000_create_mutation_commands_table.php:13`, `:23`.

[F] Nullable journal hỗ trợ daily row chưa có journal; separate completion_version/journal_version khởi tạo 0 (`2026_09_24_010000_create_challenge_daily_records_table.php:16`–`:19`), read trả null/version 0 (`GetJournalQuery.php:43`). Description nullable nhất quán command/use case. Ledger resource_id nullable là schema linh hoạt; các mutation hiện ghi UUID cụ thể (`CreateChallengeUseCase.php:149`; `SaveJournalUseCase.php:157`).

[F] `down()` xóa dependent target periods trước challenges; rollback revision xóa CHECK trước columns; rollback owner admission xóa partial index trước marker. Các constraint/table khác được drop cùng table. `ChallengePersistenceTest.php:171` có test rollback/remigrate; test :12/:31/:106/:135 kiểm các invariant. **NOT_RUN**: không xác nhận rollback thật từ inspection. [I] Các CHECK/partial index thể hiện PostgreSQL là backend chính (`backend/config/database.php:20`; `backend/phpunit.xml:30`); không yêu cầu migrations tương thích SQLite/MySQL ngoài spec.

## Secrets — chỉ metadata, không chép giá trị

[F] Quét tracked worktree bằng PowerShell ReadAllLines, mỗi file tối đa 2 MB, các pattern private key, AWS access key, GitHub token, OpenAI key, JWT và credential assignment; command exit 0. Output chỉ có file/line/type. Quét không đọc Git history hoặc `.env` canonical. `backend/.env` trong worktree không tồn tại (metadata check exit 0).

| Metadata | Phân loại |
| --- | --- |
| `backend/.env.example:3`, `:28` | [F] empty_template_credential |
| `deploy/local/.env.example:5`, `:9` | [F] empty_template_credential |
| `compose.local.yaml:9`, `:34`, `:45`, `:83`, `:109`, `:120` | [F] local_environment_placeholder |
| `backend/config/app.php:100`; `database.php:54`, `:74`, `:94`, `:109`, `:160`, `:173`; `services.php:27`; `mail.php:47` | [F] configuration_environment_reference |
| `README.md:48` | [F] published_local_manual_test_credential; [I] intentional local/manual default theo context được Lead xác nhận, chưa có chứng cứ là credential production đang dùng. |
| `.agents/scripts/v4-check-executor.test.mjs:41`, `:48`; FE/BE/E2E test credential assignments | [F] candidate metadata ở test/fixture; [I] không đủ cơ sở coi là secret thật. |

[I] Chưa xác nhận secret thật; các candidate hiện là placeholder/config reference/local test/default. Đây là kết luận có giới hạn của pattern scan, không bảo đảm mọi dạng secret đều được phát hiện. Không có căn cứ kích hoạt stop condition từ riêng credential công bố cho local test. [H] Nếu reuse default ở môi trường public/production thì phải audit deployment riêng; audit này không kiểm tra credential runtime đó.

## Findings chi tiết

### C-01 — NUL nội bộ qua text validation rồi lỗi persistence

**MEDIUM / VALID / CONFIRMED bằng static trace; HTTP+PostgreSQL NOT_RUN.**

[F] Validator journal chỉ `required,string` (`ChallengeJournalController.php:61`–`:66`); use case chỉ kiểm blank bằng trim rồi đưa nguyên text vào hash, persisted journal và ACK/ledger (`SaveJournalUseCase.php:42`, `:84`, `:117`, `:145`, `:158`). Ledger response_payload là jsonb (`2026_09_19_030000_create_mutation_commands_table.php:19`). Snippet C-EXEC-02 xác nhận `private-example + NUL + tail` không blank và json_encode/hash chấp nhận. PostgreSQL text/jsonb không biểu diễn NUL; jsonb từ chối `\u0000`. [Nguồn PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-json.html).

[I] Scenario: owner gửi PUT ngày hợp lệ, UUID mới, epoch/base đúng, `journal="private-example\u0000tail"` → validation đi qua → persistence không thể hoàn tất, transaction rollback và exception không được domain catches map 422 (`ChallengeJournalController.php:86`–`:104`) → framework trả 500. Name/description có cùng gap ký tự tại `ChallengeController.php:54`, `CreateChallengeUseCase.php:93`. Đây là lỗi validation/persistence boundary, không phải bằng chứng partial commit. [Source Handler đã pin cho generic exception response](https://raw.githubusercontent.com/laravel/framework/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Foundation/Exceptions/Handler.php).

[H] Raw database exception còn có thể ghi nội dung private qua default reporting; chưa xác minh QueryException rendering/log capture trên exact runtime, nên không nâng thành privacy finding đã xác nhận. Fix đề xuất: reject NUL/các giá trị DB không thể biểu diễn tại boundary, test journal/name/description qua HTTP trên PostgreSQL, xác nhận rollback và log không chứa private body; giữ quyết định không đặt arbitrary length limit. Lane `bugfix thường`, risk HIGH.

### C-02 — Email array bị cast trước validation

**MEDIUM / VALID / CONFIRMED expression/framework trace; HTTP NOT_RUN.**

[F] Rate limiter cast input email sang string tại `AppServiceProvider.php:28`; LoginRequest cũng cast trước khi chạy rule email (`LoginRequest.php:17`, `:25`). C-EXEC-01 chạy chính biểu thức với array và handler đổi warning thành exception, nhận ErrorException `Array to string conversion`. Framework pin tại `backend/composer.lock:1063`–`:1068` là Laravel v13.32.0/ref cdd8b33…; handler framework biến PHP warning thành ErrorException. [Source HandleExceptions đã pin](https://github.com/laravel/framework/blob/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Foundation/Bootstrap/HandleExceptions.php).

[I] Scenario: POST `/login` với `email:["x"]`, password string, CSRF hợp lệ → throttle callback ném exception trước FormRequest validation → framework generic 500 thay vì validation error. Request không cần biết owner credentials. Không kết luận vượt auth hoặc DoS đã chứng minh. Fix đề xuất: kiểm type trước normalize trong cả rate-limit key và FormRequest, bảo toàn rule validation; test array/object/null cùng normalization/throttle hiện có. Lane `bugfix thường`, risk HIGH.

### C-03 — Duplicate-command concurrency Challenge chưa chạy use case chồng lấn

**MEDIUM / VALID / CONFIRMED inspection; concurrency suite NOT_RUN.**

[F] Test lost-update gọi A xong rồi B (`ChallengeConcurrencyTest.php:170`, `:184`); test duplicate gọi execute lần một rồi lần hai (`:226`, `:231`). Hai test contention ở :64/:112 gọi query lock trực tiếp, không chạy CreateChallengeUseCase trong cửa sổ overlap.

[I] Concrete blind spot: nếu một regression bỏ account lock riêng trong CreateChallengeUseCase, test primitive lock và test duplicate tuần tự vẫn có thể xanh. Hai create cùng key có thể đều đọc ledger rỗng, rồi writer thứ hai chạm unique ledger và trả exception thay ACK replay. Đây là gap test, **không phải lỗi race đang được chứng minh tại HEAD**. Fix đề xuất: giữ transaction A mở khi CreateChallengeUseCase xong, chạy cùng immutable command trên connection B, chứng minh B bị lock; sau A commit, replay trả cùng ACK và một challenge/ledger/revision. Lane `bugfix thường`, risk HIGH.

### C-04 — Journal bị trim ở HTTP boundary; intent giữ whitespace chưa rõ

**MEDIUM / SPEC_AMBIGUITY / CONFIRMED hành vi tĩnh; HTTP NOT_RUN.**

[F] `backend/bootstrap/app.php:21`–`:28` không configure trim exception. Framework version pin có TrimStrings trong global middleware, default except chỉ password fields và transform gọi Str::trim; journal không được exclude. [Middleware đã pin](https://raw.githubusercontent.com/laravel/framework/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Foundation/Configuration/Middleware.php), [TrimStrings đã pin](https://raw.githubusercontent.com/laravel/framework/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Foundation/Http/Middleware/TrimStrings.php). Use case giữ nguyên command journal (`SaveJournalUseCase.php:117`, `:145`); FE dùng ACK snapshot thay text latest (`frontend/src/stores/journalDrafts.ts:611`, `:621`). HTTP test save chưa có whitespace-biên case (`ChallengeJournalApiTest.php:69`).

[I] Scenario: gửi journal `"  dòng đầu\n\n"` → middleware đổi thành `"dòng đầu"` trước save → ACK và editor thay bằng bản đã trim. [F] Story 2.3 chỉ chốt whitespace-only invalid/no clear/no arbitrary limit (`story 2.3:50`), chưa chốt chính sách giữ biên text. Vì vậy không gọi đây là data-loss requirement vi phạm đã chắc chắn. Fix đề xuất sau quyết định: chốt preserve hay normalize, align HTTP/domain/FE ACK, thêm round-trip multiline/indent/blank-line regression. Lane `human decision`, risk HIGH.

### C-05 — A→B→A giữ product/ledger nhưng tái tạo account revision

**MEDIUM / NEEDS_HUMAN_DECISION / CONFIRMED hành vi tĩnh; command/DB NOT_RUN.**

[F] ProvisionOwner giữ users và product data, chỉ xóa account_states khác owner rồi updateOrInsert timezone cho owner hiện tại (`ProvisionOwner.php:36`–`:50`). Account state mới mặc định revision 0, epoch 1 (`2026_09_19_010000_add_revision_fields_to_account_states_table.php:13`, `:14`). Product và ledger FK tới users, không cascade theo account_states (`2026_09_19_020000_create_challenges_and_target_periods_tables.php:14`; `2026_09_19_030000_create_mutation_commands_table.php:13`). Test reprovision xác nhận chuyển admission/sessions/account_states, chưa kiểm dữ liệu owner quay lại (`ProvisionOwnerCommandTest.php:30`–`:52`).

[I] Scenario: A có dữ liệu và revision 10; provision B; provision lại email A → A vẫn thấy dữ liệu cũ và ledger cũ nhưng `/account` báo revision 0/epoch 1. Replay ACK cũ có thể trả account_revision lớn hơn state mới. [H] Hệ quả đối với client revision floor/draft cần trace độc lập WS-E; chưa gọi stale-cache corruption đã xác nhận. Intent chuyển owner có giữ/recover/transfer/xóa dataset không được chốt trong test/spec đã đọc, nên cần human decision. Fix đề xuất: chọn retention semantics, bảo toàn revision/epoch cho dataset retained hoặc chủ động retire dataset đúng chính sách; test A→B→A, same-owner password rotation và in-flight mutation. Lane `human decision`, risk HIGH.

## Phụ lục lệnh bổ sung không dùng dependencies

Hai lệnh dưới đây chạy từ worktree đã nêu, không bootstrap Laravel, không kết nối DB và không ghi file. [F] Cả hai exit 0. Đây là evidence hẹp cho expression/time routine; không thay backend suite.

### C-EXEC-01 — AccountTimeContext và PHP edge expressions

```powershell
$auditSnippet = @'
require 'backend/app/Modules/Identity/Domain/AccountTimeContext.php';
$cases = [
 ['2026-09-20T16:59:59+00:00', 'Asia/Ho_Chi_Minh'],
 ['2026-09-20T17:00:00+00:00', 'Asia/Ho_Chi_Minh'],
 ['2026-03-08T06:59:59+00:00', 'America/New_York'],
 ['2026-03-08T07:00:00+00:00', 'America/New_York'],
 ['2026-11-01T05:59:59+00:00', 'America/New_York'],
 ['2026-11-01T06:00:00+00:00', 'America/New_York'],
];
date_default_timezone_set('Pacific/Honolulu');
foreach ($cases as [$instant, $zone]) {
 $context = App\Modules\Identity\Domain\AccountTimeContext::fromInstant(new DateTimeImmutable($instant), $zone);
 echo json_encode(['instant'=>$instant, 'context'=>$context->toArray()], JSON_THROW_ON_ERROR), PHP_EOL;
}
set_error_handler(function($level, $message, $file, $line) { throw new ErrorException($message, 0, $level, $file, $line); });
try { $email = mb_strtolower(trim((string) ['x'])); echo 'unexpected_no_error', PHP_EOL; exit(1); }
catch (ErrorException $error) { echo json_encode(['input_type'=>'email_array', 'exception'=>get_class($error), 'message'=>$error->getMessage()]), PHP_EOL; }
try { DateTimeImmutable::createFromFormat('!Y-m-d', '2026-09-20'.chr(0)); exit(1); }
catch (ValueError $error) { echo json_encode(['input_type'=>'date_with_nul', 'exception'=>get_class($error)]), PHP_EOL; }
echo json_encode(['php_version'=>PHP_VERSION, 'pdo_drivers'=>PDO::getAvailableDrivers()]), PHP_EOL;
'@
& php -r $auditSnippet
exit $LASTEXITCODE
```

[F] Output: HCM `2026-09-20/week 09-14..09-20` rồi `2026-09-21/week 09-21..09-27`; NY spring `2026-03-08/week 03-02..03-08` ở cả hai instant; NY fall `2026-11-01/week 10-26..11-01` ở cả hai instant; email_array→ErrorException; date_with_nul→ValueError; PHP 8.5.9, PDO sqlite/pgsql. Không có assertion về HTTP/DB trong lệnh này.

### C-EXEC-02 — Nội bộ NUL được canonical hash chấp nhận

```powershell
$auditSnippet = @'
$text = 'private-example'.chr(0).'tail';
$canonical = ['base_version'=>0, 'challenge_id'=>'00000000-0000-4000-8000-000000000001', 'journal'=>$text, 'local_date'=>'2026-09-20'];
ksort($canonical);
$encoded = json_encode($canonical, JSON_THROW_ON_ERROR);
echo json_encode(['trim_rejects_text'=>(trim($text)===''), 'php_json_encodes_nul'=>str_contains($encoded, '\\u0000'), 'hash_accepted'=>(strlen(hash('sha256', $encoded))===64)], JSON_THROW_ON_ERROR), PHP_EOL;
'@
& php -r $auditSnippet
exit $LASTEXITCODE
```

[F] Output: `trim_rejects_text=false`, `php_json_encodes_nul=true`, `hash_accepted=true`.

[F] Kiểm tra bàn giao read-only: `Get-Content C-findings.json -Raw | ConvertFrom-Json` và kiểm đủ 13 field template cho từng finding, exit 0, năm finding hợp lệ về cấu trúc; `git diff --name-only -- backend`, exit 0, không có output. Không sửa backend trong audit.
