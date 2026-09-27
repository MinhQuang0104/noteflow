---
story_id: "1.5"
title: Giữ bản đang nhập và thử lưu lại sau gián đoạn
status: in-progress
---

# Story 1.5: Giữ bản đang nhập và thử lưu lại sau gián đoạn

## Story

<!-- v4:story:start -->
As a chủ tài khoản, I want biết nội dung chưa lưu và retry trong phiên, So that mất mạng không làm tôi hiểu nhầm hoặc mất ngay phần đang nhập.

Triển khai capability trên journal của một challenge/ngày đã có từ Story 2.3. Đây là resource persisted có read/write, version và idempotent command thực tế, đáp ứng dependency note của Epic. Giữ thao tác Lưu nhật ký hiện hành; không tự thêm autosave journal. Draft sống trong memory của tab, độc lập với query cache và vòng đời component, định danh bằng owner + challenge ID + account-local date; mỗi lần gửi capture auth generation và data epoch.

Phạm vi: trạng thái lưu trung thực, giữ draft, retry an toàn, ACK đúng revision/resource, cảnh báo rời phiên và private lifecycle. Story 1.6 sở hữu luồng giải quyết conflict đầy đủ; Story 4.3 sở hữu autosave/chuyển note. Không tạo Notes API/UI, offline queue, localStorage/IndexedDB chứa draft, background sync, migration, hay cam kết khôi phục draft qua reload. Giữ nguyên journal validation và tính độc lập của completion/progress.
<!-- v4:story:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: **Given** nội dung đang sửa **When** save chạy/thành công/lỗi **Then** UI hiển thị đúng Đang lưu/Đã lưu/Chưa lưu-Lỗi.
- AC-2: **Given** mất mạng lúc nhập **When** save lỗi **Then** draft còn trong memory để sửa/retry **And** không được gọi là đã lưu.
- AC-3: **Given** response cũ về sau client revision mới **When** xử lý ACK **Then** response cũ không đánh dấu revision mới là đã lưu.
- AC-4: **Given** còn draft chưa lưu **When** reload/close/logout **Then** cảnh báo mất draft khi môi trường hỗ trợ.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1, AC-2, AC-3]: Tạo frontend/src/stores/journalDrafts.ts và frontend/src/stores/__tests__/journalDrafts.spec.ts; quản lý riêng draft text, clientRevision tăng đơn điệu, acknowledged revision/snapshot/journal_version, immutable pending command, error/conflict, owner/generation/epoch và resource key. RED: sửa sau saved phải dirty; ACK revision r không sửa text hoặc báo saved cho r+1; refetch không thay dirty draft hoặc âm thầm rebase base version; chuyển key A/B rồi trở lại giữ đúng draft. GREEN: trạng thái memory và guard định danh đáp ứng từng assertion.
- [ ] T-2 [AC-1, AC-2, AC-3]: Trong store mới, xây save/retry qua saveChallengeJournal(id, date, SaveJournalRequest), generateCommandId và sync.reconcileBeforeWrite. Capture immutable resource/revision/generation/epoch trước await; serialize từ lúc preflight đến lúc xử lý ACK, tối đa một save/resource. RED với deferred promises: double click không gửi hai command; transport timeout sau server commit rồi sửa tiếp phải replay nguyên command_id/base_version/data_epoch/journal cũ trước khi cho gửi nội dung mới; version từ ACK cũ chỉ cập nhật base của đúng record. GREEN: giữ latest draft độc lập pending payload; thao tác Lưu tiếp theo gửi latest revision sau khi outcome cũ được xác định, không tự thêm autosave.
- [ ] T-3 [AC-1, AC-2, AC-3]: Tích hợp store vào frontend/src/components/ChallengeJournalEditor.vue, giữ API/route và explicit-save hiện tại; thay refs draft cục bộ bằng record đúng key, cho gõ tiếp khi request đang chạy, tách nhãn lưu khỏi global sync. Mở rộng frontend/src/views/__tests__/journal.spec.ts: Đang lưu khi gửi; Đã lưu chỉ khi latest revision được ACK; edit sau ACK xóa nhãn saved ngay; mạng lỗi giữ text và nút Thử lại; unmount/remount hoặc đổi challenge/ngày không mất draft, ACK của A không sửa B; validation/conflict không hiện success; status dùng role/status hoặc aria-live, lỗi có hành động và không chỉ dựa vào màu.
- [ ] T-4 [AC-1, AC-2, AC-3]: Kiểm tra và điều chỉnh riêng seam ACK/refetch trong frontend/src/stores/sync.ts cùng frontend/src/stores/__tests__/sync.spec.ts và frontend/src/api/__tests__/challenges.spec.ts khi cần. RED: journal PUT đã ACK nhưng refetch challenge lỗi vẫn là saved cho đúng revision, global sync còn lỗi; ACK sai generation/epoch bị bỏ cả success/error callback; dirty journal không bị polling/refetch thay text hoặc base version. GREEN: phân biệt server-committed ACK với convergence, giữ hành vi consumer ChallengesView hiện có; không mở rộng public API hay bỏ fence reconcileBeforeWrite.
- [ ] T-5 [AC-2, AC-3, AC-4]: Tích hợp private lifecycle giữa journalDrafts store, frontend/src/stores/auth.ts, frontend/src/stores/account.ts và frontend/src/router/index.ts chỉ tại seam cần thiết. Mở rộng frontend/src/stores/__tests__/auth.spec.ts, frontend/src/stores/__tests__/account.spec.ts và frontend/src/router/__tests__/router.spec.ts: 401/session expiry dừng retry và ẩn draft, cùng owner đăng nhập lại chỉ được mở sau epoch/version reconciliation; owner khác không nhận draft; logout rõ ràng clear draft/cache và vô hiệu callback cũ; epoch đổi quarantine draft và dừng replay, không tự chuyển old draft sang epoch mới; write_state khóa không gửi mutation. Giữ reset của account/query cache, phân biệt expiry với explicit logout thay vì bỏ clearPrivateState toàn cục.
- [ ] T-6 [AC-4, AC-2]: Thêm guard rời phiên trong frontend/src/components/AppShell.vue sử dụng store memory; mở rộng frontend/src/__tests__/App.spec.ts. RED: dirty/error/conflict hoặc command chưa rõ outcome bật beforeunload; clean record không cảnh báo; hủy logout không gọi API, không stop sync hoặc clear draft; xác nhận bỏ mới logout và dọn private state; logout API thất bại không giả báo hoàn tất hoặc làm mất draft. GREEN: listener đăng ký/tháo đúng vòng đời, không chặn route navigation chỉ vì draft được giữ trong phiên; confirm có lựa chọn hủy để quay lại lưu, dùng native confirm hoặc dialog theo pattern hiện có với keyboard/focus đúng.
- [ ] T-7 [AC-1, AC-2, AC-3, AC-4]: Thêm frontend/src/views/__tests__/journal-draft-lifecycle.spec.ts để chứng minh chuỗi load -> edit -> mất response -> edit tiếp -> retry identical -> ACK cũ -> save mới -> reload read từ server và remount/route switch; giữ journal tách Done/progress. Chạy targeted frontend, typecheck, lint, build, contract check và backend journal/contract regression trên PostgreSQL test riêng; bổ sung test backend chỉ nếu coverage thiếu cho unchanged retry contract. Thu bằng chứng browser hai session trên journal thật cho saved/reload, loss/retry, late ACK, unload/logout; ghi command/result và limitation vào receipts, không coi mock frontend là bằng chứng persistence hoặc browser unload thực tế.
<!-- v4:tasks:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY_FOR_V4_START. Story/AC/tasks giữ nguyên phạm vi đã duyệt; control-plane fresh-start và runtime Node 24 đã được xác minh, còn phải vượt qua Git inventory gate trước khi apply.
- planning-approval: Ngày 2026-09-26, chủ sản phẩm xác nhận "Tôi approve" sau review phạm vi Story 1.5: dùng journal Story 2.3, giữ explicit-save, bảo vệ draft trong phiên và các ca nghiệm thu mất mạng/ACK cũ/resource/session/epoch. Duyệt nội dung Story 4 AC/7 tasks và Plan 4 slice A-D; cập nhật này chỉ ghi nhận readiness/control-plane evidence, không phải Human Gate approval để complete_story.
- dependencies: Story 1.1, 1.2, 1.3, 1.4, 2.1 và 2.3 đều done trong _bmad-output/implementation-artifacts/sprint-status.yaml tại HEAD 90007d6f064ab975aaec39d8541132cdde2b6344. Story 1.4 cung cấp reconcile/ACK integration; Story 2.3 cung cấp resource journal đã persisted. Đây là lựa chọn resource nghiệm thu, không sửa dependency domain-neutral trong Epic.
- dependency-evidence: frontend/src/components/ChallengeJournalEditor.vue, frontend/src/api/challenges.ts, backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php, backend/tests/Feature/ChallengeJournalApiTest.php và backend/tests/Feature/ChallengeJournalTest.php đã có trên main; Story 2.3 có Plan/receipts và Human approval durable. Không cần chờ Story 1.6, 2.2 hoặc Epic 4; giữ xử lý conflict hiện có và chặn blind retry.
- source-alignment: Bốn AC ở trên giữ nguyên Story 1.5 trong Epic. FR-003/FR-005 -> AC-1..3; NFR-004/005 -> AC-1..3 và bằng chứng persisted; UX-DR5/14/18 -> trạng thái riêng, draft trong phiên, error/retry, guard AC-4. PRD AC-003 dùng Notes: journal chỉ chứng minh capability Story 1.5, không đánh dấu nghiệm thu Notes hoặc toàn bộ NFR-004 đã hoàn tất.
- architecture-alignment: AD-6/8 là ADOPTED; AD-7/14 vẫn mang nhãn PROPOSED trong spine, được dùng cùng requirements draft/session đã nêu trong Epic/UX, không tự đổi trạng thái quyết định. ADR cho Notes không có nghĩa phải áp autosave lên journal. Epic ghi seed 800 ms; UX §8.1 và PRD §13.4 chưa chốt cadence. Story này giữ explicit-save, không biến 800 ms thành requirement hoặc SLA.
- resolution-B-START: Fresh Story start đã có helper check/apply, fingerprint guard, exact three-file transaction và Runner route; không giả checkpoint, không fallback V3, không thay đổi product code.
- resolution-B-ENV: Node v24.21.0 khả dụng; frontend gates đã chạy trên runtime được hỗ trợ, không cài/nâng dependency và không sửa engines trong Story này.
- baseline-check: Node v24.21.0 — frontend unit 13 files/72 tests PASS; type-check, lint, build và contract:check đều PASS. Đây là regression/baseline evidence, không phải completion evidence cho Story 1.5.
- execution-preconditions: Canonical .agent-state/active-run.json phải vẫn IDLE; kiểm tra lại Git HEAD/branch/worktrees, inventory và exact dirty paths. Hiện main có untracked _bmad/scripts/tests/__pycache__/ và cảnh báo không đọc được _bmad/scripts/.pytest_cache/; không coi inventory này là clean, không xóa cache tự động. Story/Plan cần được lưu bền trước khi implementation; chưa có checkpoint hay receipt của Story 1.5.
- verification-dependencies: Backend integration cần PostgreSQL test riêng và PHP/dependencies phù hợp; bộ test đã được gọi nhưng môi trường không cho kết nối Docker/PostgreSQL nên chưa có kết quả pass. Browser thật chưa chạy; DEP-005 thiết bị/browser và DEP-006 ngưỡng sync vẫn là disclosure nghiệm thu, không tự đặt SLA. Browser thật phải kiểm tra khả năng beforeunload và ghi giới hạn không bảo đảm mọi cách đóng app đều cảnh báo.
<!-- v4:readiness:end -->

## Implementation Boundaries and Verification Design

<!-- v4:risk:start -->
- classification: HIGH — concurrency, idempotency, private auth lifecycle và shared sync seam. Thực hiện adversarial review theo AGENTS.md; không suy ra yêu cầu thêm worker hoặc Human approval tự động chỉ từ nhãn HIGH.
- current-gaps: Journal draft hiện ở component refs và reset khi đổi resource; save success gán lại draft bằng snapshot; pending command đổi ID nếu payload đổi; textarea bị khóa khi save; AppShell logout chưa có draft guard. Đây là quan sát source để định hướng regression, chưa phải ca lỗi runtime đã tái hiện. T-1..6 phải thêm RED tests trước khi sửa.
- model: Record có resource identity, owner identity, authentication generation, data epoch, text, clientRevision, acknowledgedClientRevision, acknowledged snapshot/version, optional immutable pending command, error/conflict và blocked/quarantined state. Không persist record ra browser storage. Cache server và base version của draft là hai khái niệm riêng; refetch không cho stale draft quyền overwrite remote edit.
- command-contract: API hiện dùng body SaveJournalRequest {command_id, data_epoch, base_version, journal}; resource identity ở URL. Không thêm clientRevision vào OpenAPI/backend: lưu revision local trong command closure. ACK JournalMutationResult gồm data_epoch, account_revision và journal snapshot, không echo command_id; bind ACK với immutable request closure rồi kiểm tra challenge_id/local_date/epoch của response trước cập nhật đúng record. Dùng journal_version, không completion version. Không đổi sang headers chỉ vì proposal tổng quát nhắc headers.
- retry-invariant: Outcome chưa rõ phải giữ nguyên command/payload dù user đã gõ revision mới. Replay identical trước khi cho command mới; lỗi validation đã xác định cho phép sửa và tạo command mới. 409 version_conflict giữ local draft/server snapshot và chặn blind retry; 409 stale_data_epoch quarantine; 423 giữ draft/chặn ghi đến khi reconcile; 401/403 dừng writes, khóa private UI theo auth semantics, không coi authorization failure là transport retry. Late error cũng phải có generation/epoch fence như late success.
- saved-invariant: Chỉ ACK đúng latest clientRevision trong đúng resource/generation/epoch mới cho nhãn Đã lưu; gõ tiếp làm dirty ngay. ACK cho revision cũ có thể cập nhật acknowledged base đúng record nhưng không thay text mới. Một network success không chứng minh thiết bị khác đã hội tụ; query refetch failure sau commit là sync error riêng, không được biến commit đã xác nhận thành unknown write rồi gửi command mới tùy ý.
- session-invariant: Explicit logout guard chạy trước auth generation increment/stop sync; cancel giữ nguyên phiên. Sau logout thành công xóa tất cả private drafts/cache và chặn late callbacks. Expiry giữ draft memory nhưng invisible, không đưa draft vào login page/DOM/log. Chỉ cùng owner sau reconciliation mới tiếp tục; epoch thay đổi không auto-replay hay auto-rebase old draft. Full conflict/restore recovery UX thuộc Story 1.6/Epic 6, giữ trạng thái chặn an toàn trong phạm vi này.
- navigation-invariant: Journal resource A và B độc lập; store tồn tại qua route/remount, selection thay đổi không đổi command target đang chạy. Không tự flush hoặc autosave journal khi navigation. Edit vẫn được phép trong lúc gửi; chỉ submission bị serialize. Unload guard áp dụng cả hidden dirty record và uncertain command; không ghi draft vào backup hoặc telemetry.
- regression-oracles: Deferred Promise kiểm soát thứ tự preflight/PUT/ACK/refetch; fake events kiểm tra offline/focus/unload; assertions kiểm tra request count, deep equality payload replay, version, text, saved label và cache của A/B. Chạy same-owner/different-owner, epoch-before-ACK, epoch-after-refetch và logout-during-request. Không test chỉ bằng snapshot markup hoặc sleep theo thời gian thực.
- frontend-commands: Từ frontend, chạy npm.cmd run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts cho A; thêm src/views/__tests__/journal.spec.ts src/stores/__tests__/sync.spec.ts src/api/__tests__/challenges.spec.ts cho B; thêm src/stores/__tests__/auth.spec.ts src/stores/__tests__/account.spec.ts src/router/__tests__/router.spec.ts src/__tests__/App.spec.ts cho C. D chạy npm.cmd run test:unit -- --run; npm.cmd run type-check; npm.cmd run lint; npm.cmd run build; npm.cmd run contract:check. Chỉ chạy test path mới sau khi slice tương ứng tạo file.
- backend-commands: Từ backend với PostgreSQL test riêng, php artisan test tests/Feature/ChallengeJournalTest.php tests/Feature/ChallengeJournalApiTest.php tests/Contract/ChallengeContractTest.php. Dùng existing tests về identical replay/account_revision, owner, empty validation, version conflict, stale epoch và write fence; không coi mock hoặc SQLite là bằng chứng transaction PostgreSQL.
- manual-acceptance: Với journal thật và hai authenticated browser contexts A/B, A sửa rồi gián đoạn request, giữ draft khi chuyển route/quay lại, reconnect và retry, kiểm tra payload cũ được replay nếu outcome chưa rõ; gõ tiếp trước ACK và kiểm tra không saved sai; sau latest ACK reload A và mở B thấy cùng text. Thử unload dirty/clean, logout cancel/confirm, expiry/reauth và epoch quarantine; ghi browser/OS, steps, result. Native close/kill hạn chế môi trường phải được disclosure, không báo PASS chưa thực thi.
- coverage: AC-1 -> T-1..4/T-7 (store + UI + server read); AC-2 -> T-1..7 (memory, retry, route/session); AC-3 -> T-1..5/T-7 (revision/resource/auth/epoch race); AC-4 -> T-5..7 (guard + real browser). Completion evidence cần command/check/result mỗi AC; hiện tất cả AC chưa được nghiệm thu.
- v4-handoff: Plan schema v2 chỉ projection task_refs, không nhân bản AC/tasks. Sau giải quyết blocker, chỉ một action có ủy quyền mỗi invocation; implement_slice tạo checkpoint và Plan/receipt durability theo schema v2, lưu successor verify_slice rồi dừng. Verification dùng manifest/current changed paths, canonical check-verification và escalation; INCOMPLETE giữ nguyên kèm disclosure, không đổi thành PASS. Finalize chỉ tới review/Human Gate; complete cần Human approval fresh đúng scope.
- rollback-boundary: Thay đổi dự kiến frontend và targeted tests; backend/public contract giữ nguyên. Nếu cần đổi API, schema, semantics journal hoặc auth ngoài các invariant đã nêu, dừng để đối chiếu nguồn thay vì mở rộng scope. Rollback phải xét tương thích cache/draft trong phiên và không reset workspace hoặc xóa dữ liệu user.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-15-giữ-bản-đang-nhập-và-thử-lưu-lại-sau-gián-đoạn
- product: docs/product/epics.md#additional-requirements-từ-architecture
- product: docs/product/prd.md#61-truy-cập-và-dữ-liệu-trên-hai-thiết-bị
- product: docs/product/prd.md#7-non-functional-requirements
- product: docs/product/prd.md#111-truy-cập-lưu-và-hai-thiết-bị
- product: docs/product/prd.md#134-warning-được-chấp-nhận-tại-baseline-mvp-v1
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-5--authenticated-api-is-the-only-product-write-boundary-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-7--per-note-in-session-draft-state-machine-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-8--revision-polling-and-refetch-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-14--client-navigation-and-private-cache-lifecycle-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md#8-auto-save-strategy
- ux: docs/ux/ux-spec.md#81-tự-lưu-và-bản-đang-nhập
- ux: docs/ux/ux-spec.md#11-error-states
- ux: docs/ux/ux-spec.md#14-accessibility-considerations
- ux: docs/ux/ux-spec.md#16-dependencies-and-remaining-details
<!-- v4:references:end -->
