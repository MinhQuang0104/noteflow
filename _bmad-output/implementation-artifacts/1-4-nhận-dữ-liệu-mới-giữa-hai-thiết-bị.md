# Story 1.4: Nhận dữ liệu mới giữa hai thiết bị

Status: done

## Story

Là một người dùng đang đăng nhập trên nhiều thiết bị,
tôi muốn thiết bị đang hoạt động nhận biết khi dữ liệu tài khoản đã thay đổi ở thiết bị khác,
để dữ liệu hiển thị được làm mới mà không cần tải lại ứng dụng thủ công.

## Requirement Mapping

- Functional requirements: FR-002, FR-003
- Non-functional requirements: NFR-004, NFR-006
- UX decisions: UX-DR14, UX-DR18
- Architecture decisions: AD-6, AD-8

## Dependencies and Readiness

- Story 1.1, 1.2 và 1.3 đã hoàn tất.
- AD-8 đã được chấp nhận và xác định cơ chế revision polling/refetch.
- Repository hiện chưa có một business resource với persisted mutation và read model thực tế để tạo bằng chứng tích hợp hai thiết bị cho AC1.
- AD-6 về mutation versioning/idempotency đã được Product Owner phê duyệt ngày 2026-09-19, gồm account-row lock, epoch/write-state checks, command ledger, resource/base version, typed conflict và quy tắc revision cho state change/retry/no-op.
- Story 2.1 đã được chuẩn bị `ready-for-dev` để cung cấp persisted Challenge resource, create/update mutation và owner-scoped read model; blocker business-resource chỉ được tháo hoàn toàn sau khi Story 2.1 được triển khai và có bằng chứng tích hợp.
- Ngưỡng đồng bộ D-09 vẫn còn mở. Có thể ghi nhận interval/latency thực tế trong kiểm thử, nhưng chưa được tuyên bố một SLA chưa được phê duyệt.

## Acceptance Criteria

### AC1 — Thiết bị thứ hai nhận và hiển thị dữ liệu mới

**Given** cùng một tài khoản đang hoạt động online trên hai thiết bị
**When** thiết bị A lưu thành công một thay đổi dữ liệu
**Then** `account_revision` của tài khoản chỉ tăng đúng một lần cho transaction thay đổi trạng thái đó
**And** thiết bị B phát hiện revision mới, refetch dữ liệu liên quan và hội tụ về dữ liệu mới.

### AC2 — Polling dừng hoặc tạm dừng đúng điều kiện

**Given** ứng dụng bị ẩn, thiết bị offline hoặc phiên đăng nhập hết hạn
**When** polling đồng bộ được đánh giá
**Then** polling tạm dừng hoặc dừng phù hợp với trạng thái hiện tại
**And** giao diện không báo sai rằng dữ liệu đã đồng bộ.

### AC3 — Reconcile trước khi ghi sau focus hoặc reconnect

**Given** ứng dụng vừa lấy lại focus hoặc kết nối mạng
**When** người dùng chuẩn bị tiếp tục thao tác ghi
**Then** ứng dụng reconcile `account_revision` và `data_epoch` trước khi cho phép ghi dựa trên dữ liệu có thể đã cũ.

### AC4 — Lỗi đồng bộ không phá hủy dữ liệu đang hiển thị

**Given** polling hoặc refetch thất bại
**When** ứng dụng xử lý lỗi đồng bộ
**Then** người dùng nhận được trạng thái lỗi có thể hành động
**And** dữ liệu hiện có không bị thay thế bằng trạng thái rỗng chỉ vì request thất bại.

## Tasks / Subtasks

- [x] Xác lập contract trạng thái đồng bộ của tài khoản.
  - [x] Bổ sung `account_revision`, `data_epoch` và `write_state` vào persistence theo architecture đã duyệt (Story 2.1 baseline).
  - [x] Trả các trường này từ `GET /api/v1/account` và cập nhật OpenAPI/contract types liên quan (Story 2.1 baseline).
  - [x] Có migration, backfill/default an toàn và phương án rollback phù hợp (Story 2.1 baseline).
- [x] Tích hợp revision vào mutation thực tế đầu tiên.
  - [x] Dùng account-row locking và kiểm tra epoch/write-state theo quyết định kiến trúc được duyệt (Story 2.1 baseline).
  - [x] Mỗi transaction thật sự thay đổi trạng thái chỉ tăng `account_revision` đúng một lần (Story 2.1 baseline).
  - [x] Không tạo mutation minh họa hoặc resource giả chỉ để hoàn thành Story này (Sử dụng Challenge resource thực tế).
- [x] Xây dựng SPA sync coordinator theo AD-8 (`frontend/src/stores/sync.ts`).
  - [x] Dùng TanStack Vue Query theo approved stack.
  - [x] Poll ban đầu mỗi 5 giây khi visible và online, bảo đảm không có request chồng lấn (`inFlight` fence).
  - [x] Reconcile khi focus/reconnect; tạm dừng khi hidden/offline; dừng khi logout hoặc nhận `401`.
  - [x] Chặn late response bằng auth-generation/request-generation fence.
  - [x] Bounded backoff khi thất bại (5s -> 10s -> 20s -> 30s) và cho phép bấm "Thử lại".
- [x] Xử lý cache, refetch và lỗi đồng bộ (`frontend/src/components/AppShell.vue`, `frontend/src/views/ChallengesView.vue`).
  - [x] Invalidate/refetch các owner-scoped query (`queryKey: ['challenges']`) khi revision thay đổi; clear cache khi `data_epoch` thay đổi.
  - [x] Không ghi đè dirty draft khi background refetch thành công (cảnh báo non-destructive nếu remote version tăng).
  - [x] Không chuyển dữ liệu hợp lệ thành empty state khi refetch lỗi; hiển thị actionable retry banner.
  - [x] Hiển thị lỗi đồng bộ với trạng thái chi tiết (Đã đồng bộ, Đang đồng bộ..., Ngoại tuyến, Lỗi đồng bộ).
- [x] Tạo bằng chứng tích hợp với business resource thực tế (`tests/e2e/cross-device-sync.spec.ts`).
  - [x] Kiểm thử hai browser context cùng tài khoản trên PostgreSQL 17 (`DB_PORT=55414`).
  - [x] Chứng minh mutation ở thiết bị A làm thiết bị B tự động hội tụ về read model mới qua 5s polling (AC1).
  - [x] Bao phủ hidden/offline, focus/reconnect, session expiry, polling/refetch failure và late response (AC2, AC3, AC4).
- [x] Thực hiện HIGH-risk adversarial review trước Done Gate.
  - [x] Invariant 1: `account_revision` strictly monotonic per state change, never increments on replay/no-op/error. (PASS - `ChallengeUseCasesTest`, `Story14IntegrationSeamTest`)
  - [x] Invariant 2: `data_epoch` bump clears client query cache and cancels stale inflight drafts. (PASS - `sync.ts` & `ChallengesView.vue`)
  - [x] Invariant 3: Auth isolation & generation fencing discards responses after logout or user switch. (PASS - `sync.spec.ts`)
  - [x] Invariant 4: Non-open `write_state` blocks local mutations via `reconcileBeforeWrite()`. (PASS - `cross-device-sync.spec.ts` AC3)
  - [x] Invariant 5: Preserves dirty drafts across background refetch without data loss. (PASS - `challenges.spec.ts`, `cross-device-sync.spec.ts`)

## Risk Classification

**HIGH** — Story chạm shared account-state boundary, public API/OpenAPI contract, cross-device concurrency, cache invalidation và stale-write protection.

## Readiness Gate

**PASS / READY FOR DEV — refreshed 2026-09-20**

Readiness evidence at canonical `main`, commit `81a78a96b9a0fa6a4ba108cf403faba40655cbcd`:

- Story 2.1 implementation `428cc671bd95a1ac9962812f1ffbd0bd39eff8bd` is an ancestor of HEAD; no subsequent product-code changes. Its completed V3 run records human approval and integration.
- Real Challenge persistence, owner-scoped list/detail, create/update, account-state API, AD-6 account lock and command ledger exist. This refresh supersedes the historical missing-resource statements above.
- From `backend`, with PowerShell `$env:DB_PORT='55414'`: `php artisan test tests/Feature/Story14IntegrationSeamTest.php tests/Feature/ChallengeConcurrencyTest.php tests/Feature/AccountContextTest.php tests/Contract/ChallengeContractTest.php` — PASS, 12 tests / 81 assertions on dedicated PostgreSQL 17.
- Same environment: `php artisan test tests/Feature/ChallengeUseCasesTest.php tests/Feature/ChallengePersistenceTest.php tests/Feature/ChallengeApiTest.php` — PASS, 25 tests / 177 assertions; covers owner isolation, revision, replay/no-op, epoch/write-state and migration rollback/remigrate.
- Initial port-5432 attempt failed before assertions because PostgreSQL was unavailable; the dedicated test database resolved that environment issue.
- Reuse existing Tasks 1–2 implementation from Story 2.1. Remaining Tasks supply coordinator, lifecycle/cache/draft safety and two-browser integration. AC1–AC4 are unchanged; backend HTTP seam tests alone do not complete AC1. D-09 remains open.

The historical gate conditions below are now satisfied:

Story chỉ có thể chuyển sang `ready-for-dev` khi:

1. Có một business resource thực tế với persisted mutation và read model để cung cấp bằng chứng end-to-end cho AC1.
2. Story 2.1 đã triển khai AD-6 cho Challenge create/update và có bằng chứng `account_revision` tăng đúng một lần cho transaction thật sự thay đổi trạng thái, không tăng lại cho retry/no-op.
3. Phạm vi tích hợp với Challenge read model và mutation consumers được xác nhận mà không thay đổi ngầm Acceptance Criteria.

Cho đến khi các điều kiện này được đáp ứng, không được bắt đầu product implementation hoặc mở V3 execution run cho Story 1.4.

## Implementation Notes

- Các Tasks/Subtasks ở trên là implementation plan; không cần tạo một plan lớn khác.
- Story này nên được triển khai cùng hoặc ngay sau mutation/read model thật đầu tiên, thay vì xây một vertical slice giả chỉ phục vụ polling.
- Chu kỳ 5 giây là baseline kiến trúc hiện tại, không phải cam kết SLA cho D-09.

## References

- `docs/product/epics.md` — Epic 1, Story 1.4
- `docs/architecture.md` — AD-6, AD-8 và account-state contract
- `docs/product/prd.md` — FR-002, FR-003, NFR-004, NFR-006
- `docs/ux-design-specification.md` — UX-DR14, UX-DR18
- `.agents/policies/orchestration-v3.md` — readiness và execution ownership

## Dev Agent Record

### Implementation

- Triển khai Pinia Sync Store `frontend/src/stores/sync.ts` điều phối chu kỳ polling 5s không chồng lấn (`inFlight`), tích hợp TanStack Vue Query, backoff lũy thừa khi lỗi mạng (5s->10s->20s->30s), auth-generation & monotonic request-generation fencing, lắng nghe visibilitychange/online/offline để tạm dừng và tự động reconcile khi focus/reconnect, và dừng khi logout/401.
- Cập nhật `frontend/src/components/AppShell.vue` với chỉ báo đồng bộ trực quan, cảnh báo `write_state`, và khởi động sync store.
- Cập nhật `frontend/src/views/ChallengesView.vue` bảo vệ dirty draft khi background refetch diễn ra, thông báo non-destructive khi phiên bản trên server thay đổi, hiển thị retry banner khi refetch lỗi mà không xóa danh sách Challenge hiện hữu (AC4), kích hoạt `reconcileBeforeWrite()` để chặn ghi khi tài khoản bị khóa ghi (AC3).
- Bổ sung test helper độc lập `tests/e2e/helpers/db-helper.php` và `tests/e2e/helpers/db-state.ts` thao tác trực tiếp với PostgreSQL qua PDO fail-closed cho môi trường testing, loại bỏ hoàn toàn các test fixture khỏi mã nguồn production (command `SetAccountWriteState.php` đã được xóa bỏ theo review S14-F06).
- Xây dựng bộ kiểm thử End-to-End `tests/e2e/cross-device-sync.spec.ts` gồm 5 kịch bản tương tác với 2 browser context độc lập chạy trên PostgreSQL 17 thực tế.

### AC Evidence

```text
AC1 — Thiết bị thứ hai nhận và hiển thị dữ liệu mới
Evidence:
- test/check: AC1 — two real browser contexts converge on Challenge mutation via 5s polling against PostgreSQL
- command: npx playwright test cross-device-sync.spec.ts -g "AC1"
- result: PASS (exit code 0)

AC2 — Polling dừng hoặc tạm dừng đúng điều kiện
Evidence:
- test/check: AC2 — polling pauses when hidden or offline, stops on logout, does not falsely claim synced
- command: npx playwright test cross-device-sync.spec.ts -g "AC2"
- result: PASS (exit code 0)

AC3 — Reconcile trước khi ghi sau focus hoặc reconnect
Evidence:
- test/check: AC3 & AD-8 — reconcile before write respects write_state
- command: npx playwright test cross-device-sync.spec.ts -g "AC3"
- result: PASS (exit code 0)

AC4 — Lỗi đồng bộ không phá hủy dữ liệu đang hiển thị
Evidence:
- test/check: AC4 — sync error does not destroy existing challenge list (non-destructive)
- command: npx playwright test cross-device-sync.spec.ts -g "AC4"
- result: PASS (exit code 0)
```

### Completion Notes

- 2026-09-19: Tạo Story artifact và đánh giá readiness theo Agent Architecture V3.
- 2026-09-19: Xác định blocker là thiếu business mutation/read model thực tế và quyết định mutation contract đã được phê duyệt.
- 2026-09-19: AD-6 đã được Product Owner phê duyệt; Story vẫn `BLOCKED` cho đến khi Story 2.1 triển khai Challenge mutation/read model và cung cấp bằng chứng tích hợp.
- 2026-09-21: Hoàn thành triển khai Tasks 3–6 trên worktree `MinhQuang0104/story-1-4-sync`. Tất cả các deterministic check (backend pint, phpstan, phpunit; frontend contract, lint, typecheck, vitest; e2e playwright; architecture unittest) đều đạt 100% PASS. Chuyển trạng thái Story sang `review`.
- 2026-09-21: Tiếp thu kết quả Independent Lead review: loại bỏ test fixture khỏi production code (xóa `SetAccountWriteState.php`, khôi phục `DatabaseSeeder.php`, gỡ bỏ `window.__queryClient`), cấu hình PostgreSQL service và array cache trong CI browser-smoke, hoàn thiện sync coordinator (reconcile fail-closed khi rớt mạng/ẩn tab, observable refetch error với throwOnError, fence mutation ACK sau await invalidation, tránh trùng lặp transport và tự động reconcile khi re-login), bổ sung đầy đủ unit/E2E regression test. Trạng thái Story duy trì `review`.
- 2026-09-22: Human phê duyệt exact scope `7b8b97b..f9ff613`; local `main` được fast-forward tới implementation đã verify. Story chuyển sang `done`; không push remote.

## Change Log

- 2026-09-19: Tạo bản draft; giữ sprint status ở `backlog`; chưa triển khai product code.
- 2026-09-20: Refresh readiness gate PASS; phê duyệt Story 1.4 sẵn sàng triển khai.
- 2026-09-21: Hoàn thành triển khai sync coordinator, cache/draft safety, 2-context E2E test suite trên PostgreSQL; hoàn thành xử lý các phát hiện từ Independent Lead review (S14-F01..F09) bao gồm loại bỏ production test command; duy trì trạng thái `review`.
- 2026-09-22: Human Gate APPROVED; tích hợp exact implementation commit `f9ff613e2039436b57cb05355bba34c88381354a` vào local `main` và đồng bộ lifecycle sang `done`.
