# Story 1.6 — Giải quyết xung đột nội dung giữa hai thiết bị — Implementation Plan

> **For agentic workers:** Đây là bản kế hoạch để review, chưa cho phép thực thi. Khi được yêu cầu triển khai, đi qua router và `story-development` theo canonical `AGENTS.md`; không tự dùng generic execution/subagent workflow. Không có V4 opt-in trong yêu cầu lập plan này.

**Goal:** Owner đọc được bản đang nhập và bản đã lưu của cùng nhật ký, chọn rõ bản cần giữ, lưu an toàn và nhìn thấy kết quả hội tụ trên hai thiết bị.

**Architecture:** Tái sử dụng journal API, optimistic concurrency và command ledger hiện có. Mở rộng Pinia journal draft store để xử lý lựa chọn tường minh; dùng component dialog trình bày hai bản và nối journal query vào sync coordinator hiện có.

**Tech Stack:** Vue 3, TypeScript, Pinia, TanStack Vue Query, Laravel 13/PHP 8.4, PostgreSQL 17, Vitest/Pest/Playwright theo lockfiles của repo.

**Spec:** `docs/product/epics.md`, mục Story 1.6; `docs/product/prd.md` FR-004/NFR-006; `docs/ux/ux-spec.md` PF-09 và mục 12–14; architecture spine AD-6/AD-8 và conflict matrix D-05 được adoption trong đầu `epics.md`.

## 1. Trạng thái và giới hạn của bản plan

- Khảo sát ngày 2026-09-30 tại canonical `main`, HEAD `c332823316f4e710d88841a3bb39328be23a03d0`.
- Sprint ghi Story 1.6 là `backlog`; chưa có file Story riêng và Tasks/Subtasks được duyệt. Các task dưới đây là đề xuất để đưa vào Story, không phải Tasks đã được BMAD phê duyệt.
- Story 1.4, 1.5, 2.1 và 2.3 được sprint ghi `done`; journal API/editor/draft store đã hiện diện trên main. Đây là bằng chứng dependency từ tài liệu và đọc code, chưa phải kết quả chạy lại kiểm thử.
- Đã đọc active pointer: `IDLE`, không có activeRunId. Lập plan không tạo run, lease, worker, receipt; không sửa sprint hoặc trạng thái Story.
- Workspace có thay đổi sẵn, gồm local runtime và E2E helpers/config. Không đưa các thay đổi đó vào scope Story 1.6 hoặc coi chúng là dependency đã commit.
- Mọi test bên dưới có trạng thái **NOT_RUN** trong phiên lập plan. Chỉ tạo tài liệu này; không triển khai sản phẩm, chạy migration, commit hay dispatch.

## 2. Phạm vi đề xuất và ràng buộc

**Resource nghiệm thu:** journal theo `(owner, challenge_id, local_date)`, dùng `journal_version`. Đây là resource thực đã có draft/save lifecycle từ Story 2.3 và 1.5; đáp ứng dependency note của Story 1.6 là tối thiểu một resource có versioned mutation.

**Trong phạm vi:** typed conflict journal; so sánh toàn bộ journal; chọn bản local hoặc server; đóng/mở lại dialog mà không mất draft; resolution command và retry an toàn; refetch/hội tụ journal; accessibility và bằng chứng hai thiết bị.

**Ngoài phạm vi:** hoàn thiện conflict UI cho challenge metadata, Notes, Event hoặc Notebook; Done/undo conflict của Story 2.6; note remote-delete của Story 4.5; merge theo field/ký tự; tự tạo bản sao; offline queue; lưu draft vào localStorage/IndexedDB; thay đổi restore protocol của Epic 6. Component trình bày có thể tái sử dụng nhưng không xây conflict framework nhiều domain trước nhu cầu.

**Global constraints:**

- Node: `>=24.12.0 <25`; PHP: `^8.4`. Dùng dependencies và lockfiles hiện có; không cần thêm thư viện dialog.
- BMAD giữ authority về sản phẩm. D-05 đã được adoption trong planning baseline; câu “proposed” trong proposal cũ không tự hủy adoption đó.
- Journal là một component toàn văn bản; không dùng `row_version` hoặc `completion_version` thay `journal_version`.
- Stale write không đổi saved data, versions, account revision hoặc ghi một command thành công giả vào ledger.
- Mỗi resolution mới có UUID mới, `base_version` của bản server đã được owner xem và `data_epoch` hợp lệ; retry khi chưa rõ kết quả giữ nguyên command ID và toàn payload.
- Không mặc định chọn local/server, không last-write-wins, không tự rebase/retry sau conflict lần nữa.
- Owner/auth generation/resource/date/epoch phải khớp cả trước request và sau mọi async boundary. Epoch đổi chặn choice cũ; không tự gửi draft sang dataset mới.
- Dirty text và revision được bảo vệ trước polling/refetch/ACK cũ. Nội dung chỉ ở memory và DOM đã xác thực, không vào logs hoặc persisted retry queue.
- Journal resolution không thay `is_done`, `completion_version`, target, start date hoặc history/progress facts.
- Save ACK và query convergence là hai kết quả riêng: ACK hợp lệ có thể xác nhận đã lưu, nhưng query lỗi vẫn phải báo chưa đồng bộ.

## 3. Điểm có sẵn và phần cần bổ sung

| Boundary | Hiện trạng quan sát | Delta cần làm |
| --- | --- | --- |
| `SaveJournalUseCase.php` | Khóa account row, kiểm tra epoch/fence/version, trả snapshot khi conflict, idempotent replay, same-value no-op | Kiểm chứng resolution/re-conflict/concurrency bằng tests; chỉ sửa production backend nếu phát hiện thiếu invariant |
| `ChallengeJournalController.php` và OpenAPI | 409 `version_conflict` có `resource_id`, `current_version`, `current_snapshot`; snapshot journal có challenge/date | Giữ wire contract; kiểm tra identity và shape ở client thay vì chỉ ép kiểu snapshot |
| `journalDrafts.ts` | Draft theo owner/resource; single flight; revision/ACK fence; `save()` chặn conflict; `useServerSnapshot()` nhận snapshot vào local ngay | Thêm resolution có lựa chọn và version guard; thay đường adopt snapshot tức thời trong UI bằng flow được xác minh |
| `ChallengeJournalEditor.vue` | Banner bản server và nút “Dùng bản lưu trên máy chủ”; thiếu dialog và lựa chọn giữ local | Banner mở dialog, hai bản đầy đủ, lựa chọn rõ và pending/error/re-conflict UI |
| `sync.ts` | Poll/reset/refetch và mutation-ACK invalidation chỉ target `['challenges']` | Bao gồm `['challenge-journal']`; giữ pending convergence nếu một nhóm query lỗi |
| Browser tests | Có cross-device metadata polling, chưa chứng minh resolution journal | Thêm hai context thật, journal API thật/PostgreSQL thật, cùng resource/date |

## 4. Luồng tương tác và interface dự kiến

1. B đang sửa journal từ version `v1`; A lưu `v2`. B gửi `v1` nhận conflict `v2`; draft B được giữ và server không đổi.
2. Banner báo thay đổi chưa áp dụng, có nút **“Xem và giải quyết”**. Dialog ghi rõ challenge/ngày, **“Bản đang nhập trên thiết bị này”** và **“Bản đã lưu trên máy chủ”** kèm version. Không tự mở dialog do polling.
3. Owner chọn **“Giữ bản đang nhập”** hoặc **“Dùng bản đã lưu”**, rồi bấm **“Xác nhận lựa chọn”**. Hiển thị rõ bản nào sẽ bị thay thế. Nút xác nhận chưa khả dụng khi chưa chọn. **“Để sau”**/Escape chỉ đóng dialog, giữ conflict và cảnh báo chưa lưu.
4. Reconcile account trước ghi. Nếu context vẫn hợp lệ, gửi một command mới với version của snapshot đã hiển thị. Với lựa chọn server, gửi cùng nội dung server và version đó: backend hiện có same-value no-op, chỉ xác nhận command, không tăng journal/account revision giả.
5. Nếu server đã đổi tiếp, backend trả conflict mới; giữ draft local, cập nhật bản server, xóa lựa chọn cũ và yêu cầu owner chọn lại. Không âm thầm đổi base_version rồi gửi lại.
6. ACK đúng intent/resource/epoch mới giải quyết conflict. Nếu owner đã gõ revision mới trong lúc request chạy, chỉ ACK revision đã gửi, giữ phần gõ sau ở trạng thái chưa lưu.
7. Mất response sau commit: giữ resolution command bất biến, cho retry đúng command; không cho lựa chọn mới thay command chưa rõ kết quả. Khi nhận lại ACK, reconcile/refetch để không coi cached ACK cũ là snapshot mới nhất của toàn hệ thống.
8. Polling đưa thiết bị còn lại về bản đã lưu. Nếu thiết bị đó còn draft riêng, giữ draft; không tuyên bố editor dirty đã hội tụ với saved text.

**Interface nội bộ dự kiến** (không phải public API mới):

- `resolveConflict(challengeId: string, localDate: string, choice: 'local' | 'server', expectedServerVersion: number, expectedClientRevision: number): Promise<void>` trên `useJournalDraftsStore`.
- Hàm chỉ nhận lựa chọn cho conflict hiện hành; kiểm tra version/revision vừa hiển thị trước và sau preflight. Nếu draft/snapshot đổi, không gửi lựa chọn cũ, trả UI về bước xem/chọn lại.
- Tiếp tục dùng `PendingJournalCommand` với request immutable; nếu cần metadata resolution thì thêm tùy chọn `resolutionChoice` và snapshot/version đã chọn vào pending state. Không tách một hàng đợi hoặc single-flight map thứ hai.
- Giữ original draft đến ACK; nội dung lựa chọn server nằm trong request frozen, không replace text ngay lúc bấm. Không đổi acknowledged server version trước ACK. Lượt retry đọc pending request chứ không dựng lại từ editor.
- `ContentConflictDialog.vue` nhận `open`, `resourceLabel`, `localText`, `serverText`, `serverVersion`, `clientRevision`, `busy`, `error`; emit `confirm` gồm choice và hai expected revisions, cùng `close`. Component không gọi API hoặc mutate store.
- Lựa chọn dialog chỉ là UI state; conflict/draft vẫn ở store. Thay resource/auth/context phải hủy selection và đóng dialog cũ; không render nội dung phiên cũ.
- OpenAPI `JournalSnapshot.journal` có thể null, nhưng API hiện không cho ghi journal rỗng. Một conflict snapshot thiếu nội dung/version hoặc không đúng identity phải giữ draft, chặn resolve và báo cần tải/đối chiếu; không gửi `journal: ''`, tự mở khả năng xóa hoặc tự nhận là saved. Ca journal rỗng ban đầu bình thường vẫn theo editor hiện có.

## 5. Thứ tự triển khai đề xuất

### Task 0 — Chuẩn hóa Story và kiểm tra readiness

**Files:** nguồn `docs/product/epics.md`; file Story dự kiến `_bmad-output/implementation-artifacts/1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md`; `sprint-status.yaml` chỉ cập nhật trong bước lifecycle được phép về sau.

- [ ] Chuyển bốn AC của Epic thành AC1–AC4 trong Story, giữ nguyên ý nghĩa; đưa journal scope và các task dưới đây vào Tasks/Subtasks để review.
- [ ] Xác nhận phạm vi journal là resource nghiệm thu; không tự mở rộng metadata/Notes. Ghi adoption D-05 và dependency 1.4/1.5/2.3.
- [ ] Trước execution, kiểm tra lại status/branch/worktrees, canonical policy và Story source commit. Revalidate plan nếu affected files đã đổi so với baseline.
- [ ] Đưa Story tới `ready-for-dev` theo BMAD khi đủ điều kiện. Plan này không tự thực hiện bước đó.
- [ ] Chọn verification runtime kiểm tra đúng worker checkout: canonical local wrapper hiện từ chối linked worktree, nên không dùng shared backend của main làm bằng chứng cho code worker. Dùng CI hoặc isolated test runtime được execution contract xác minh source mount/HEAD và DB testing.

**Deliverable:** Story có AC/task/scope được duyệt và dependency/runtime xác định; chưa có sản phẩm được sửa.

### Task 1 — Chứng minh server contract cho resolution journal

**Files:** mở rộng `backend/tests/Feature/ChallengeJournalTest.php`, `backend/tests/Feature/ChallengeJournalApiTest.php`, `backend/tests/Contract/ChallengeContractTest.php`; tạo `backend/tests/Feature/JournalConflictConcurrencyTest.php`. Chỉ sửa `backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php`, `backend/app/Http/Controllers/ChallengeJournalController.php` nếu test chỉ ra gap cụ thể.

**Consumes:** `PUT /api/v1/challenges/{id}/journals/{date}` + `SaveJournalRequest` hiện có. **Produces:** bằng chứng contract hiện có hỗ trợ resolution, không endpoint/schema/migration mới.

- [ ] Bổ sung fixtures/tests: A ghi version mới; B stale nhận đủ identity/date/version/snapshot; so sánh DB trước/sau để chứng minh journal/completion/account revision/ledger không bị mutate bởi rejected write.
- [ ] Test chọn local với UUID mới/current version chỉ thay toàn journal; test chọn server same-value no-op không tăng versions/account revision; cả hai replay đúng UUID/payload trả ACK tương ứng.
- [ ] Test A lại ghi sau snapshot: resolution B bị 409 mới, không ghi đè A. Reuse UUID với payload khác vẫn bị từ chối.
- [ ] Test epoch stale, fence 423, unauthenticated/foreign owner và resource không còn tồn tại; không leak snapshot, tạo lại resource hoặc thay completion.
- [ ] Test contention bằng hai PostgreSQL connections/transactions, theo pattern hiện có: lock account serialize thực; hai commands cạnh tranh cùng journal version không thể cùng commit hai nội dung. Assertion API tuần tự bổ sung nhưng không thay bằng chứng lock cạnh tranh.
- [ ] Chạy focused backend tests. Test của behavior đã tồn tại có thể xanh ngay; nếu phát hiện thiếu, lưu failure rồi sửa nhỏ nhất và chạy lại, không rewrite use case chỉ để đạt red-green.

**Exit:** AC1 có bằng chứng; resolution command và retry semantics đủ làm nền cho client.

### Task 2 — Resolution state trong journal draft store

**Files:** `frontend/src/stores/journalDrafts.ts`, `frontend/src/stores/__tests__/journalDrafts.spec.ts`; `frontend/src/api/challenges.ts` và `frontend/src/api/__tests__/challenges.spec.ts` nếu đặt snapshot validator ở API boundary.

**Consumes:** contract Task 1, `sync.reconcileBeforeWrite()`, `sync.recordMutationAck()`. **Produces:** `resolveConflict(...)` theo mục 4, dùng chung command và lifecycle của `save()`.

- [ ] Viết tests trước cho hai lựa chọn; assert chính xác chosen text/base_version/data_epoch và UUID mới so với request thất bại.
- [ ] Test expected revision/version thay đổi trong preflight; snapshot sai challenge/date, version không khớp `current_version`, malformed payload; không gửi mutation và không mất draft.
- [ ] Implement guarded resolution vào store, giữ single-flight từ preflight đến ACK. Chặn normal save khi unresolved conflict, cho retry pending resolution qua cùng lifecycle mà không bypass conflict guard cho request mới.
- [ ] Test double-click chỉ một request; network failure giữ đúng payload/UUID; draft gõ sau request không bị đánh dấu saved; chọn server thất bại vẫn giữ original local draft.
- [ ] Test conflict lần hai cập nhật server snapshot và reset selection; 422/423/epoch/401/403/404 không tự retry, recreate hoặc giải quyết conflict giả.
- [ ] Test late success/error sau logout/expiry/đổi owner/epoch/resource; cùng owner đăng nhập lại phải reconcile trước khi mở lại draft/choice. Giữ lifecycle regression của Story 1.5.
- [ ] Chạy focused store/API tests; chỉ kết thúc task khi assertions kiểm tra state và request thực tế đều đúng.

**Exit:** hai lựa chọn có thể resolve an toàn ở state layer; chưa cần dialog để chứng minh behavior.

### Task 3 — Dialog so sánh và tích hợp editor

**Files:** tạo `frontend/src/components/ContentConflictDialog.vue`, `frontend/src/components/__tests__/ContentConflictDialog.spec.ts`; sửa `frontend/src/components/ChallengeJournalEditor.vue`, `frontend/src/views/__tests__/journal.spec.ts`, `frontend/src/views/__tests__/journal-draft-lifecycle.spec.ts`.

**Consumes:** interface Task 2 và dialog props/events mục 4. **Produces:** complete user flow AC2/AC4 trong journal editor.

- [ ] Component tests cho labels, không chọn mặc định, button state, confirm payload, close giữ state, server version/local revision đổi làm selection invalid.
- [ ] Dùng native modal `<dialog>` với semantics/label rõ; focus vào tiêu đề hoặc control phù hợp, giữ Tab/Shift+Tab trong modal, Escape đóng tạm. Return focus về nút mở hoặc editor hợp lệ nếu nút mở đã biến mất.
- [ ] Hiển thị toàn nội dung có xuống dòng/wrap, hai cột desktop và một cột mobile; khu vực nội dung cuộn được, action buttons còn tiếp cận được; plain-text rendering, không `v-html`.
- [ ] Thay nút adopt server tức thời bằng banner mở dialog. Submit lựa chọn gọi store; chỉ clear conflict/đóng theo ACK hợp lệ, pending/error vẫn có status và thao tác rõ.
- [ ] Error announcements không giật focus; busy ngăn submit trùng; không chạy shortcut nền hoặc bắt phím IME. Khi đóng dialog lúc pending, request tiếp tục được store theo dõi; không mặc định coi request bị hủy.
- [ ] Integration tests kiểm tra hai lựa chọn, đóng/mở lại, switching challenge/date, expiry/logout, draft gõ tiếp và conflict lần hai. Không kết luận focus trap/AT hoạt động chỉ từ jsdom.

**Exit:** luồng UI chạy qua state thật trong component integration; browser accessibility còn được xác minh ở Task 5.

### Task 4 — Hội tụ journal qua sync coordinator

**Files:** `frontend/src/stores/sync.ts`, `frontend/src/stores/__tests__/sync.spec.ts`, `frontend/src/stores/__tests__/journalDrafts.spec.ts`; query-cache update trong `ChallengeJournalEditor.vue` nếu cần.

**Consumes:** query keys `['challenges']`, `['challenge-journal', challengeId, localDate]`; account revision/epoch. **Produces:** polling/ACK convergence bao gồm journal mà không phá draft.

- [ ] Viết regression test với real QueryObserver cho journal: revision tăng phải refetch active journal query, epoch đổi reset query phù hợp; không chỉ assert một hàm mock được gọi.
- [ ] Mở rộng cả poll convergence lẫn ACK invalidation sang nhóm `['challenge-journal']`. Dùng cùng coordinator và cadence, không tạo timer riêng cho editor.
- [ ] Chỉ xóa pending convergence khi các nhóm cần thiết đều thành công. Một journal refetch lỗi phải hiện sync error, giữ saved/cache data, retry được ở poll cùng revision.
- [ ] ACK chỉ cập nhật đúng journal cache/snapshot đã xác minh; dirty/conflict/pending/quarantined records không nhận text/base version từ refetch. Test ngay cả khi invalidation trả về trước ACK xử lý xong.
- [ ] Test hidden/offline/expiry và auth/epoch đổi trong async refetch; late callback không báo synced cho session/context mới. Giữ nguyên phân biệt “Đã lưu” từ ACK và lỗi đồng bộ query.
- [ ] Chạy sync/store/editor regression trước khi sang E2E.

**Exit:** AC3 có bằng chứng query/store; dữ liệu journal trên thiết bị đọc sạch tự cập nhật.

### Task 5 — E2E hai thiết bị, accessibility và Done Gate

**Files:** tạo `tests/e2e/content-conflict.spec.ts`; tái sử dụng `tests/e2e/helpers/db-state.ts` và helper guard hiện có nếu baseline đã có, chỉ bổ sung helper test-only tối thiểu khi thật cần; không rewrite harness/local runtime.

**Consumes:** Tasks 1–4, backend/PostgreSQL từ đúng checkout. **Produces:** AC evidence và exact-diff verification để Lead review/Human Gate.

- [ ] Context A/B cùng owner, cùng challenge/date, đọc một version; tạo hai draft; A save; B submit nhận conflict thật. Assert DB vẫn là A và local B còn nguyên.
- [ ] Chạy hai scenario độc lập cho giữ local/giữ server; kiểm tra payload command, DB, saved status và thiết bị kia hội tụ mà không reload thủ công. Thiết bị còn dirty phải giữ draft, không ép hội tụ editor.
- [ ] A đổi tiếp khi dialog B đang mở: B confirm nhận conflict mới, không silent overwrite; chọn lại mới có thể commit.
- [ ] Chặn response sau khi API thật đã commit, rồi retry: cùng command ID/payload, không tăng revision lần hai. Chỉ dùng network interception để mô phỏng transport; không stub API thành công làm bằng chứng persistence.
- [ ] Desktop/phone: Tab/Shift+Tab/focus trap, Escape, focus return, accessible names, touch buttons, nội dung dài/chuỗi dài, zoom/reflow và không cuộn ngang toàn trang. Không skip mobile cho phần dialog chỉ vì cross-device suite cũ skip mobile.
- [ ] Manual screen-reader check với tổ hợp được ghi rõ (ví dụ NVDA + Chrome): tên dialog, tên hai bản, thứ tự đọc, selection, pending/error và focus return. Ghi kết quả thực tế; automated accessibility tree không thay bằng chứng screen reader.
- [ ] Chạy final checks mục 7 trên exact code scope, inspect diff và consumer impact; AC1–AC4 đều có evidence. V3 implementation chỉ đi tới HUMAN_GATE khi hợp lệ; không tự đánh dấu Story done từ worker DONE/Lead ACCEPTED.

## 6. Ma trận AC và rủi ro

| AC | Bằng chứng cần có | Task |
| --- | --- | --- |
| AC1: stale mutation không mutate, typed identity/version/snapshot | API + contract + DB invariants + PostgreSQL concurrency | 1, 5 |
| AC2: đọc hai bản, lựa chọn rõ | Dialog/store tests; desktop/phone; đóng mở không mất draft | 2, 3, 5 |
| AC3: gửi lựa chọn với current version/epoch, chỉ lưu lựa chọn và hội tụ | Resolution/re-conflict/retry tests; query observer; hai context thật | 1, 2, 4, 5 |
| AC4: keyboard/touch/screen reader/focus/scroll | Browser tests và manual AT evidence có platform/browser | 3, 5 |

**Risk: HIGH** vì concurrent writes, idempotency, shared sync boundary và private draft lifecycle. Adversarial review tập trung: stale snapshot trong dialog; double submit; response mất/đến muộn; server-version advance giữa selection và write; dirty refetch; owner/epoch chuyển; query failure sau save ACK; XSS/plain-text display. Sau khoảng ba lần lặp cùng failure phải reassess/escalate theo policy, không mở rộng behavior để che lỗi.

## 7. Lệnh verification dự kiến

Tất cả lệnh dưới đây chỉ là kế hoạch, chưa chạy. Chuẩn bị Node/PHP đúng version, dependencies, PostgreSQL test database và xác minh code checkout trước khi dùng. Không chạy destructive DB fixture trên dev data.

**Focused frontend** — working directory `frontend`:

```text
npm run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts src/api/__tests__/challenges.spec.ts
npm run test:unit -- --run src/components/__tests__/ContentConflictDialog.spec.ts src/views/__tests__/journal.spec.ts src/views/__tests__/journal-draft-lifecycle.spec.ts
npm run test:unit -- --run src/stores/__tests__/sync.spec.ts
```

**Focused backend** — working directory `backend`, isolated PostgreSQL testing environment:

```text
php artisan test tests/Feature/ChallengeJournalTest.php tests/Feature/ChallengeJournalApiTest.php tests/Feature/JournalConflictConcurrencyTest.php tests/Contract/ChallengeContractTest.php
```

**Browser** — working directory `tests/e2e`, testing backend được cấu hình theo harness của checkout:

```text
npm test -- content-conflict.spec.ts --workers=1
npm test -- cross-device-sync.spec.ts --workers=1
npm test -- --workers=1
```

Serial workers tránh các suites reset chung test DB gây nhiễu. Phone project vẫn chạy các ca dialog; hai-browser-context tests có thể dùng laptop project theo pattern repo.

**Final frontend** — working directory `frontend`:

```text
npm run contract:validate
npm run contract:check
npm run contract:proof
npm run lint
npm run type-check
npm run test:unit -- --run
npm run build-only
```

**Final backend** — working directory `backend`:

```text
composer validate --strict
php vendor/bin/pint --test
composer analyse
php artisan test
```

Các commands dựa trên scripts và CI hiện có. Trên Windows dùng `npm.cmd` nếu execution policy yêu cầu. Local Compose wrapper trong dirty working tree chỉ dùng sau khi được baseline hóa, từ canonical checkout đúng scope; không copy commands khởi động backend vào worker worktree để kiểm tra nhầm source. Không thêm migration/dependency là hướng dự kiến, nên không cần sửa deployment config cho Story này.

## 8. Điều kiện review và bàn giao

- Bản plan hoàn tất khi đối chiếu đủ bốn AC, paths/interfaces/commands thống nhất và các assumptions được ghi rõ. Không đồng nghĩa Story đã `ready-for-dev` hoặc đã được triển khai.
- Execution theo thứ tự 0 → 1 → 2 → 3 → 4 → 5. Mỗi task có deliverable/test riêng; commit theo task khi policy execution cho phép, không gộp các dirty changes sẵn có.
- Nếu chỉ sửa frontend và thêm backend tests đủ chứng minh behavior, giữ nguyên backend production contract. Nếu phát hiện cần đổi contract/schema/behavior ngoài scope, ghi finding và đưa BMAD/human quyết định trước phần phụ thuộc.
- Chưa chốt phạm vi journal hoặc thiếu readiness/runtime chỉ chặn triển khai, không ngăn review bản plan này. Không lấy việc đã có plan làm permission tạo Story runtime.
- Khi thực thi xong: fresh deterministic checks, exact diff inspection, AC evidence, không unresolved HIGH/MEDIUM, lifecycle đồng bộ và Human Gate theo lane được cho phép. Không tự claim complete hoặc integrate.
