# WS-D — API contract

## Phạm vi và giới hạn bằng chứng

[F] Worktree: `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`; branch `audit/full-project-2026-10-06`; HEAD `03dbd098e36245f51a4b8e875e89c1c0bb21acc6`. Lệnh `git log -1 --format='%H %s'` và `git status -sb` trả exit `0`.

[F] Baseline sản phẩm là `98def5358983072216a28754e87b1cd5f884d258`. `git diff --name-only 98def5358983072216a28754e87b1cd5f884d258 HEAD` trả exit `0`, chỉ liệt kê `docs/audits/full-project-audit-2026-10-06/AUDIT-PLAN.md`.

[F] Audit đối chiếu [OpenAPI](D:/Workspace/Tu_Hoc/New_Project_My_Note/.worktrees/full-project-audit/contracts/openapi.yaml:1), [routes backend](D:/Workspace/Tu_Hoc/New_Project_My_Note/.worktrees/full-project-audit/backend/routes/api.php:10), controllers, request validation, middleware, use cases, contract tests và frontend API/generated types. Các tham chiếu `path:line` bên dưới tính từ worktree trên.

[F] `backend/vendor`, `frontend/node_modules` và `tests/e2e/node_modules` đều không tồn tại; phép kiểm tra `Test-Path` trả exit `0`. Không cài dependency, không chạy Laravel/Vitest/Redocly, không gọi Runner/Orca/AGY/recovery và không đọc canonical. Chỉ ghi output audit theo yêu cầu bàn giao của Lead; không ghi source, policy hoặc runtime.

[F] Ba probe bổ sung chỉ chạy mã trong bộ nhớ bằng Node `v24.21.0`: parser frontend với mocked `fetch`, regex header và hàm projection của generator. Chúng không dùng mạng, không ghi source và không thay thế contract test backend. Bản probe tái chạy và transcript được lưu tại `logs/D-probes.mjs` và `logs/D-probes.log`.

[I] Kết quả WS-D là **cần bổ sung hợp đồng và bằng chứng kiểm thử**. Chưa chứng minh được drift response hiện hành làm frontend hỏng. Có năm finding `VALID/MEDIUM` và một finding `SPEC_AMBIGUITY/MEDIUM`; không có finding `HIGH/CRITICAL` đã chứng minh trong phạm vi này.

## 1. Ma trận endpoint ↔ backend ↔ frontend

[F] Đếm cấu trúc `contracts/openapi.yaml` bằng PowerShell trả exit `0`: **8 path, 11 operation, 46 cặp operation–response status**.

[F] Tất cả 11 operation đều có route sản phẩm tương ứng và ít nhất một kịch bản trong `backend/tests/Contract/`. Bảng dưới là đối chiếu mã tĩnh; không phải kết quả test đã chạy.

| Operation | Request trong spec | Backend: request/response | Frontend | Bằng chứng |
|---|---|---|---|---|
| `POST /login` | `LoginRequest`: email, password; redirect_to tùy chọn | Normalize email; rules required/email/string; trả `LoginResult` với owner và redirect thuộc allowlist | `login()`; đổi `redirectTo` thành `redirect_to`; khởi tạo CSRF trước login | Spec `:9`, `:569`; `backend/routes/web.php:6`; `LoginRequest.php:14`; `AuthenticatedSessionController.php:18`, `:58`, `:67`; `frontend/src/api/auth.ts:57` |
| `POST /logout` | Không có body | Invalidate session, regenerate CSRF; response `204`, không body | `logout()` xử lý `204`, chấp nhận `401`, có nhánh `419` | Spec `:43`; `web.php:10`; `AuthenticatedSessionController.php:48`; `auth.ts:83` |
| `GET /api/v1/session` | Không có body | `OwnerSession`; `auth:sanctum` và owner admission | `getSession()` trả null cho `401/403` | Spec `:59`; `api.php:13`; `AuthenticatedSessionController.php:40`; `auth.ts:45` |
| `GET /api/v1/foundation` | Không có body; public | `FoundationHealth`: status=ok, service=noteflow-api | `getFoundationHealth()` | Spec `:86`; `api.php:10`; `FoundationHealthController.php:9`; `frontend/src/api/http.ts:5` |
| `GET /api/v1/account` | Không có body | `AccountContext`: timezone, account_date, week, revision, epoch, write_state | `getAccountContext()` sử dụng generated component | Spec `:98`, `:501`; `api.php:17`; `AccountContextController.php:28`; `AccountTimeContext.php:35`; `frontend/src/api/account.ts:11` |
| `GET /api/v1/challenges` | Không có body | `ChallengeListResult`; serializer trả đủ tám field của mỗi Challenge | `getChallenges()` | Spec `:125`, `:644`, `:710`; `api.php:21`; `ChallengeController.php:25`; `GetChallengeListQuery.php:50`; `challenges.ts:158` |
| `POST /api/v1/challenges` | `CreateChallengeRequest`: command_id, epoch, name, target_days; description tùy chọn | Whitelist field; UUID/integer/range checks; trim name; `ChallengeMutationResult`, status `201` | `createChallenge()` gửi generated request type và XSRF header | Spec `:152`, `:744`; `api.php:25`; `ChallengeController.php:40`, `:54`, `:69`, `:87`; `CreateChallengeUseCase.php:128`; `challenges.ts:166` |
| `GET /api/v1/challenges/{id}` | Path id UUID | Invalid UUID, absent hoặc ngoài owner trả `404`; success `ChallengeDetailResult` | `getChallenge()` encode id | Spec `:190`; `api.php:29`; `ChallengeController.php:116`; `GetChallengeDetailQuery.php:24`, `:41`; `challenges.ts:162` |
| `PATCH /api/v1/challenges/{id}` | `UpdateChallengeMetadataRequest`: command_id, epoch, base_version≥1, name; description tùy chọn | Whitelist; UUID/integer checks; `ChallengeMutationResult`; version conflict có ChallengeSnapshot | `updateChallengeMetadata()` | Spec `:233`, `:768`; `api.php:33`; `ChallengeController.php:133`, `:156`, `:210`; `UpdateChallengeMetadataUseCase.php:102`, `:175`; `challenges.ts:173` |
| `GET /api/v1/challenges/{id}/journals/{date}` | Path id UUID, date | `JournalReadResult`; journal absent có null/version 0; ngày invalid/out of range trả `422` | `getChallengeJournal()` | Spec `:287`, `:301`, `:436`; `api.php:37`; `ChallengeJournalController.php:22`; `GetJournalQuery.php:27`, `:40`; `challenges.ts:183` |
| `PUT /api/v1/challenges/{id}/journals/{date}` | `SaveJournalRequest`: command_id, epoch≥1, base_version≥0, journal | Whitelist; nonblank journal/day checks; `JournalMutationResult`; version conflict có JournalSnapshot | `saveChallengeJournal()`; parser riêng cho journal ProblemDetails | Spec `:338`, `:481`; `api.php:41`; `ChallengeJournalController.php:42`, `:61`, `:92`; `SaveJournalUseCase.php:74`, `:94`, `:141`; `challenges.ts:189` |

[F] Các field response frontend sử dụng nằm trong component schema: owner/redirect ở `schema.generated.ts:37–53`; account/date/week/revision/epoch/write_state ở `:25–36`; Challenge ở `:66–94`; journal ở `:5–24`; problem ở `:109–115`. Consumer evidence: `frontend/src/stores/auth.ts:41`, `:54`; `sync.ts:116`, `:137`; `ChallengesView.vue:157`, `:177`, `:407`; `journalDrafts.ts:380`.

[F] Không tìm thấy field response frontend đang dùng mà OpenAPI không khai báo trong phạm vi các API consumer đã đọc. Việc kiểm tra byte-for-byte generated source vẫn là `NOT_RUN/ENV`.

## 2. Ma trận status × contract test

[F] Bảng này ghi **kịch bản hiện diện trong source test**. “Hiện diện” không có nghĩa test đã pass, và nhiều test chưa assert trực tiếp status dự kiến.

| Operation | Status được spec khai báo | Kịch bản contract hiện diện | Status thiếu kịch bản contract | Test evidence |
|---|---|---|---|---|
| `POST /login` | 200, 419, 422, 429 | 200, 419, 422, 429 | — | `AuthResponseContractTest.php:26`, `:57`, `:88` |
| `POST /logout` | 204, 401, 419 | 204 | **401, 419** | `AuthResponseContractTest.php:80` |
| `GET /session` | 200, 401, 403 | 200, 401, 403 | — | `AuthResponseContractTest.php:42` |
| `GET /foundation` | 200 | 200; negative wrong service | — | `FoundationResponseContractTest.php:12`, `:25` |
| `GET /account` | 200, 401, 403 | 200, 401 | **403** | `AccountContextContractTest.php:27`, `:47` |
| `GET /challenges` | 200, 401, 403 | 200 với list rỗng | **401, 403** | `ChallengeContractTest.php:43` |
| `POST /challenges` | 201, 401, 403, 409, 422, 423 | 201, 422, 423 | **401, 403, 409** | `ChallengeContractTest.php:52`, `:105`, `:115` |
| `GET /challenges/{id}` | 200, 401, 403, 404 | 200, 404 | **401, 403** | `ChallengeContractTest.php:63`, `:67` |
| `PATCH /challenges/{id}` | 200, 401, 403, 404, 409, 422, 423 | 200, 409 version conflict | **401, 403, 404, 422, 423** | `ChallengeContractTest.php:86`, `:96` |
| `GET /journals/{date}` | 200, 401, 403, 404, 422 | 200 với journal absent | **401, 403, 404, 422** | `ChallengeContractTest.php:142` |
| `PUT /journals/{date}` | 200, 401, 403, 404, 409, 422, 423 | 200, 409 version conflict, 422 blank text, 423 fence | **401, 403, 404** | `ChallengeContractTest.php:146`, `:155`, `:171`, `:181` |

[F] Tổng cộng có kịch bản cho **24/46 cặp**, thiếu **22/46 cặp**. Các file Contract chứa 12 test declarations, trong đó nhiều declaration kiểm tra nhiều response; evidence: `rg -n '^test\(' backend/tests/Contract`, exit `0`.

[F] Nhánh `409 stale_data_epoch` và `409 idempotency_key_reused` chưa được contract validator kiểm tra ở cả ba mutation operation. Hai operation PATCH/PUT mới có kịch bản `409 version_conflict`; POST chưa có kịch bản `409` nào. Evidence: toàn bộ `ChallengeContractTest.php:43–189`.

[F] Một số khoảng trống đã có **feature test**, nhưng feature test không gọi OpenAPI validator:

- Challenge guest `401`: `backend/tests/Feature/ChallengeApiTest.php:28`.
- Challenge list/create non-owner `403`: `ChallengeApiTest.php:35`.
- Challenge create key reuse/fence/epoch: `ChallengeApiTest.php:322`, `:358`.
- Challenge GET/PATCH absent `404`: `ChallengeApiTest.php:386`.
- Account non-owner `403`: `AccountContextTest.php:68`.
- Journal GET/PUT `401/403/404`, GET invalid day `422`: `ChallengeJournalApiTest.php:118`.
- Journal key reuse/epoch/fence: `ChallengeJournalApiTest.php:92`, `:137`.

[I] Vì vậy không nên diễn đạt các nhánh này là “hoàn toàn không có test”; thiếu ở đây là kiểm tra **schema/media type/header theo OpenAPI** cho từng nhánh.

## 3. Đối chiếu nhóm mã lỗi bắt buộc

| Status | Kết quả đối chiếu |
|---|---|
| **401** | [F] Spec khai báo cho logout và tất cả protected API operation. API routes có `auth:sanctum`; logout có `auth`. Contract tests mới có session/account. Evidence: `openapi.yaml:55`, `:75`, `:114`, `:141`, `:173`, `:213`, `:261`, `:316`, `:359`; `routes/api.php:14–42`; `routes/web.php:11`. |
| **403** | [F] Protected API operation khai báo 403; `EnsureOwner.php:13` aborts 403. Contract validation mới có session 403. Logout không dùng owner middleware và spec không khai báo 403; đây là đối chiếu phù hợp với route hiện tại, không phải status thiếu. |
| **404** | [F] Challenge detail/update và journal read/write đều khai báo và có nhánh trả 404. Contract test mới có challenge detail 404. Evidence: `ChallengeController.php:118`, `:126`, `:135`, `:190`; `ChallengeJournalController.php:24`, `:32`, `:44`, `:81`. |
| **409** | [F] Epoch mismatch/key reuse/version conflict được controller map sang 409, tương ứng spec và frontend parser. Evidence: `ChallengeController.php:93`, `:98`, `:200`, `:205`, `:210`; `ChallengeJournalController.php:88–99`; `challenges.ts:144`. |
| **422** | [F] Validation/body/domain-day failures map sang ValidationError có message/errors; spec khai báo ở login và mutation/journal-day operations. Evidence: `LoginRequest.php:24`; `ChallengeController.php:48`, `:63`, `:71`; `ChallengeJournalController.php:38`, `:58`, `:68`, `:100`. |
| **423** | [F] Write fence map sang ProblemDetails 423 trong cả ba mutation operations, phù hợp spec và frontend. PATCH fence thiếu contract test. Evidence: `ChallengeController.php:88`, `:195`; `ChallengeJournalController.php:86`; `challenges.ts:144`. |
| **428** | [F] Các controller/spec/generated operation đã đọc không dùng 428. Epoch đang được xử lý bằng **409** trong cả ba phía. Không ghi nhận “thiếu 428” chỉ vì checklist nhắc 423/428. |
| **419** | [F] Login/logout khai báo 419; bootstrap chỉ custom-render CSRF error cho login/logout (`backend/bootstrap/app.php:30–39`). API được cấu hình stateful CSRF (`:22`; `backend/config/sanctum.php:84`), nhưng ba unsafe product operations không khai báo 419. [H] Response thật khi API CSRF mismatch cần xác minh bằng runtime có dependency; xem D-04. |

[F] Missing account state gây `LogicException` ở `AccountContextController.php:22–23` và mutation use cases. [I] Đây là lỗi invariant nội bộ dẫn tới server error, chưa phải bằng chứng một status nghiệp vụ bị map sai. WS-D không tự đặt schema 5xx hoặc thay đổi hành vi mong đợi.

## 4. Findings

### D-01 — Contract tests thiếu 22 nhánh status và chưa khóa đầy đủ kịch bản dự kiến

**MEDIUM · VALID · CONFIRMED bằng source**

[F] Ma trận mục 2 chứng minh 22 cặp operation–status thiếu kịch bản contract. Replay/no-op, list có phần tử, journal read sau khi có nội dung, stale epoch và key reuse cũng chưa được OpenAPI validator kiểm tra đầy đủ; evidence: `ChallengeContractTest.php:43–189`.

[F] Validator chỉ lấy `getResponseValidator()`, không kiểm tra request: `OpenApiResponseValidator.php:16–25`. Nhiều test chỉ validate response nhận được rồi `expect(true)->toBeTrue()`, không assert status được kịch bản yêu cầu: `AuthResponseContractTest.php:38–39`, `:43–54`, `:84–85`; `AccountContextContractTest.php:43–44`; `ChallengeContractTest.php:93`, `:102`, `:123`.

[I] Nếu một nhánh trả nhầm status khác **vẫn được spec khai báo**, với body hợp lệ cho status đó, riêng contract test có thể chấp nhận. Feature tests có thể phát hiện một phần, nên không kết luận toàn suite fail-open về auth.

[F] FE account test còn dùng fixture thiếu ba field required `account_revision`, `data_epoch`, `write_state`: `frontend/src/api/__tests__/account.spec.ts:10–20`, đối chiếu `openapi.yaml:504–510`. Đây là một điểm yếu bổ sung của bằng chứng consumer, không phải response backend hiện tại.

[I] Đề xuất bổ sung bảng case theo operation/status/error-code, assert status chính xác trước validator, kiểm tra request và dùng fixtures đủ generated type. Lane: **bugfix thường**; risk: **MEDIUM**.

### D-02 — ProblemDetails hợp lệ theo schema có thể bị consumer journal từ chối

**MEDIUM · VALID · CONFIRMED bằng source và probe frontend**

[F] `ProblemDetails` chỉ required `message`, `code`; resource_id/current_version/current_snapshot đều optional, và snapshot là union ChallengeSnapshot/JournalSnapshot dùng chung cho mọi mutation: `openapi.yaml:791–815`; `schema.generated.ts:109–115`.

[F] Journal parser lại yêu cầu version conflict phải có resource_id, current_version không âm, JournalSnapshot và version đồng nhất: `frontend/src/api/challenges.ts:47–60`.

[F] Probe import trực tiếp `challenges.ts`, thay `fetch` bằng Response trong bộ nhớ, exit `0`:

```text
minimal-version-conflict      status=409 problemPreserved=false
wrong-family-snapshot         status=409 problemPreserved=false
actual-journal-conflict-shape  status=409 problemPreserved=true
```

[I] Hai payload đầu không vi phạm các constraint hiện có của ProblemDetails, nhưng FE mất machine code/snapshot vì parser trả undefined. `journalDrafts.ts:380–399` cần code/snapshot để mở luồng conflict; thiếu problem sẽ đi tới nhánh unexpected 4xx ở `:431–438`.

[F] Backend hiện hành phát snapshot đúng loại và đủ field: `ChallengeController.php:210–217`; `ChallengeJournalController.php:92–99`; `SaveJournalUseCase.php:94–104`. Finding này **không chứng minh backend hiện tại đang phát payload lỗi**.

[I] Đề xuất dùng schema conflict theo code và resource operation, required các field consumer đang cần; thêm negative contract tests cho missing/wrong-family snapshot. Lane: **bugfix thường**; risk: **HIGH** vì thay contract dùng chung.

### D-03 — Request contract chưa mô tả các constraint backend đang thực thi

**MEDIUM · VALID · CONFIRMED bằng source**

[F] Create/PATCH schema chỉ khai báo name là string, không có length/nonblank constraint: `openapi.yaml:759–760`, `:786–787`. Backend trim tên, từ chối empty hoặc dài hơn 255: `ChallengeController.php:69–74`, `:171–176`.

[F] SaveJournalRequest cho phép mọi string ở `openapi.yaml:499–500`; use case từ chối string blank sau trim: `SaveJournalUseCase.php:84–85`. Date parameter chỉ có format date (`openapi.yaml:295–300`), trong khi GET/PUT từ chối ngày trước start_date hoặc sau accountToday: `GetJournalQuery.php:27–31`; `SaveJournalUseCase.php:74–82`.

[I] Một client tuân theo schema hiện tại có thể gửi name 256 ký tự, blank journal hoặc date đúng format nhưng ngoài cửa sổ cho phép và nhận 422. Status 422 đã được khai báo; thiếu ở đây là **constraint và mô tả domain**, không phải status drift.

[I] Đề xuất bổ sung length/nonblank constraints phù hợp với việc trim đang có; mô tả cửa sổ ngày bằng prose và examples vì nó phụ thuộc tài nguyên/thời gian server; thêm request validation contract tests. Lane: **bugfix thường**; risk: **HIGH** vì request contract là shared boundary.

[H] Login cũng chưa có whitelist unknown field tương tự mutation controllers, dù LoginRequest schema có `additionalProperties: false`: `LoginRequest.php:22–28`; `AuthenticatedSessionController.php:20`; `openapi.yaml:569–571`. Việc extra field có được HTTP layer chấp nhận hay không chưa chạy runtime; không dùng giả thuyết này để nâng severity.

### D-04 — Biên contract của chuỗi Sanctum/CSRF chưa rõ

**MEDIUM · SPEC_AMBIGUITY · PLAUSIBLE**

[F] Frontend bắt buộc gọi `GET /sanctum/csrf-cookie` trước login: `frontend/src/api/auth.ts:57–65`. Endpoint này không nằm trong tám path OpenAPI và không có backend contract test. Architecture cũng mô tả bước khởi tạo đó: `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md:261`.

[F] Backend bật stateful API và cấu hình ValidateCsrfToken: `bootstrap/app.php:22`; `config/sanctum.php:84`. Spec chỉ khai báo 419 cho login/logout; POST/PATCH/PUT sản phẩm không khai báo 419.

[H] Same-origin unsafe API request có session nhưng CSRF token thiếu/sai có thể trả 419 trước controller. Chưa xác minh status/body/header thực tế do `vendor` vắng.

[I] Cần xác định OpenAPI có bao gồm endpoint framework và lỗi middleware của luồng SPA hay chỉ controller nghiệp vụ. Khi biên đó được xác định, bổ sung CSRF initialization/XSRF request headers và các 419 contract cases phù hợp; chưa nên tự sửa response semantics.

Lane: **human decision**; risk nếu sửa auth contract: **HIGH**.

### D-05 — Schema PrivateNoStore không bảo đảm đồng thời private và no-store

**MEDIUM · VALID · CONFIRMED bằng regex probe**

[F] Architecture yêu cầu `Cache-Control: private, no-store`: `ARCHITECTURE-PROPOSAL.md:269`; implementation cũng set cả hai directive: `backend/app/Http/Middleware/PrivateNoStore.php:14`.

[F] Header schema sử dụng pattern `(^|, ?)(private|no-store)`: `openapi.yaml:393–397`. Probe Node trực tiếp pattern, exit `0`:

```text
private            accepts=true
no-store           accepts=true
private, no-store  accepts=true
public, no-store   accepts=true
```

[I] Contract schema có thể chấp nhận private response thiếu no-store, hoặc có no-store nhưng thiếu private. Feature tests hiện kiểm tra cả hai ở một số endpoint, nhưng schema dùng chung chưa bảo vệ invariant này.

[I] Đề xuất kiểm tra đồng thời hai directive và thêm negative contract tests cho mỗi directive bị thiếu. Lane: **bugfix thường**; risk: **MEDIUM**.

### D-06 — contract:check không phát hiện thay đổi path, HTTP verb hoặc requestBody binding

**MEDIUM · VALID · CONFIRMED bằng source và projection probe**

[F] Generator dùng `Object.values(document.paths)` rồi `Object.values(pathItem)`; output operation chỉ chứa operationId và responses: `frontend/scripts/generate-openapi-types.mjs:89–129`. `generatedSource()` chỉ ghép component và operation projection (`:132–142`); `--check` chỉ so expected/current source (`:147–158`).

[F] Probe đọc và gọi đúng hàm `generateOperations()` từ source, với document synthetic trong bộ nhớ, exit `0`:

```text
path-only-change          generatedOperationsUnchanged=true
method-only-change        generatedOperationsUnchanged=true
request-body-only-change  generatedOperationsUnchanged=true
```

[F] Frontend vẫn hard-code path/verb trong wrappers: `frontend/src/api/challenges.ts:158–197`; `auth.ts:45–84`; generated operations không khai báo path/verb/requestBody binding: `schema.generated.ts:119–392`.

[I] Khi component definitions và responses giữ nguyên, đổi URL/verb hoặc binding của request body có thể không làm generated source thay đổi; riêng `contract:check` không phát hiện drift đó. Backend contract tests có thể phát hiện một số trường hợp, nhưng checker này không phải bằng chứng đầy đủ cho routing/request contract.

[I] Đề xuất generate `paths`, parameters và requestBody binding; consumer dùng mapping typed hoặc bổ sung comparison/test chuyên biệt cho các phần đó. Lane: **bugfix thường**; risk: **HIGH** vì thay generator và shared consumer contract.

## 5. Các check đã chạy và NOT_RUN

| Check | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Git branch/HEAD/baseline diff | [F] exit `0` | Đúng audit branch; không có product-code delta giữa baseline và HEAD |
| Inventory OpenAPI | [F] exit `0` | 8 path / 11 operations / 46 response pairs |
| Đọc/search source/test | [F] exit `0` cho các lần hoàn tất | Ma trận và refs ở các mục trên |
| Probe parser journal thực | [F] exit `0` | Mocked fetch, không có HTTP backend |
| Probe regex PrivateNoStore | [F] exit `0` | Chứng minh pattern chấp nhận thiếu directive |
| Probe generator projection | [F] exit `0` | Chứng minh hàm projection bỏ qua ba loại thay đổi |
| `npm run contract:validate` | [F] `NOT_RUN/ENV` | frontend node_modules vắng |
| `npm run contract:check` | [F] `NOT_RUN/ENV` | module yaml vắng; không xác nhận byte-for-byte generated source |
| Backend Contract suite | [F] `NOT_RUN/ENV` | backend vendor vắng |
| Frontend API Vitest suite | [F] `NOT_RUN/ENV` | frontend node_modules vắng |
| `npm run contract:proof` | [F] `NOT_RUN/READ_ONLY_SCOPE` | Script ghi OpenAPI ở `prove-contract-drift.mjs:15`, `:25` |
| `composer test` | [F] **WS-D không chạy; Lead attempt B9 exit255/NOT_RUN ENV** | Theo bàn giao của Lead; script có bước `artisan config:clear` ở `backend/composer.json:50–52`, dependency vắng |

[F] Hai lỗi của tooling audit được xử lý và không quy thành lỗi sản phẩm:

- Search đầu dùng glob path không hợp lệ trên Windows, exit `1`/os error 123; chạy lại bằng `rg --glob` trả exit `0`.
- Probe generator đầu có fixture thiếu `media.schema`, exit `1`; sửa fixture trong bộ nhớ và chạy lại exit `0`. Probe cuối dùng POST/PUT và requestBody hợp lệ ở cấp projection.

[I] Sau khi có môi trường được phép, ưu tiên xác minh HTTP thực cho 419 API, chạy request/response contract suite và thực hiện các negative cases của D-02/D-05/D-06. Audit này không claim các check đó đã pass.
