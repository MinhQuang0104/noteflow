# WS-E — Frontend: sync, offline, conflict và UX

## Phạm vi và giới hạn bằng chứng

- [F] Checkout: D:/Workspace/Tu_Hoc/New_Project_My_Note/.worktrees/full-project-audit; branch audit/full-project-2026-10-06; HEAD 03dbd098e36245f51a4b8e875e89c1c0bb21acc6. Lệnh git status --short --branch và git rev-parse HEAD trong checkout này đều exit 0; status đầu lượt chỉ có dòng branch.
- [F] Baseline sản phẩm: 98def5358983072216a28754e87b1cd5f884d258. Lệnh git diff 98def5358983072216a28754e87b1cd5f884d258 03dbd098e36245f51a4b8e875e89c1c0bb21acc6 -- frontend/src exit 0, output rỗng.
- [F] Đã đọc AGENTS.md, .agents/routing/task-router.md và AUDIT-PLAN.md trong worktree; không đọc canonical checkout hoặc runtime pointer. Xác nhận pointer IDLE được tiếp nhận từ Lead.
- [F] Phạm vi đọc gồm toàn bộ bốn store, ba component, router, queryClient, API wrappers, main/App/pinia, các view và unit tests liên quan. Inventory frontend/src không có thư mục modules: lệnh rg --files frontend/src | rg -i '(^|[\\/])modules([\\/]|$)' exit 1, output rỗng. Source vẫn tổ chức qua stores/components/views/api.
- [F] WS-E không install dependency, không sửa source/test/policy/runtime; chỉ ghi E-frontend.md và E-findings.json sau khi Lead cho phép. Không gọi Runner, Orca, AGY, V3 hoặc recovery.
- [F] Lead xác minh độc lập E-01..E-04 bằng hàm trích trực tiếp từ source, với reactive state/transport/query client có stub: logs/crossverify-frontend.mjs:6,19,49,75,90; logs/phase3-frontend-probes.log:1-3,6,21,40,48. Probe ghi integration_test=false; Lead báo execution exit 0.
- [I] Probe xác nhận hành vi logic của hàm ở những trạng thái được cung cấp. Nó không chứng minh Vue scheduling, navigation/browser, PostgreSQL persistence hay toàn bộ API integration.
- [F] Vitest, type-check, lint, build, browser, native unload, mobile/zoom và screen reader trong WS-E: NOT_RUN — nhiệm vụ WS-E giới hạn static read/trace. B1–B15 và integration/E2E do Lead/các workstream tương ứng tổng hợp, không được suy thành PASS từ báo cáo này.

## Kết luận

[I] Frontend có các guard đáng kể cho draft, auth generation, epoch và ACK, nhưng còn đường ghi metadata vào sai challenge, cache ACK vào sai resource, bế tắc retry conflict sau khi gõ tiếp, và mất nghĩa vụ hội tụ do timer polling không dùng cùng single-flight slot. Bốn đường này được Lead tái hiện bằng source-extracted probes; mức tác động tích hợp cần regression trên Vue/API/DB.

| ID | Severity | Classification | Verification |
|---|---|---|---|
| E-04 | CRITICAL | VALID | CONFIRMED — independent source trace + probe |
| E-01 | HIGH | VALID | CONFIRMED — independent source trace + probe |
| E-02 | HIGH | VALID | CONFIRMED — independent source trace + probe |
| E-03 | HIGH | VALID | CONFIRMED — independent source trace + probe |
| E-05 | HIGH | VALID | CONFIRMED — Lead independent source trace + auth/reset probe; browser NOT_RUN |
| E-06 | MEDIUM | VALID | PLAUSIBLE — static trace, chưa xác minh chéo/runtime |
| E-07 | MEDIUM | VALID | PLAUSIBLE — static trace, chưa xác minh chéo/runtime |
| E-08 | MEDIUM | VALID | PLAUSIBLE — static trace, chưa xác minh chéo/runtime |
| E-09 | MEDIUM | VALID | PLAUSIBLE — static markup, chưa browser keyboard test |

## State machine và các kịch bản bắt buộc

### Trạng thái và ownership

- [F] SyncStatus là idle/syncing/synced/paused/error; timer khởi điểm 5 giây và backoff tối đa 30 giây: frontend/src/stores/sync.ts:11-14,48-51,61-72.
- [F] reconcile() dùng activeReconcileInfo để join request cùng auth generation: sync.ts:268-299. Timer gọi poll(), nhưng poll() gọi reconcileInternal() trực tiếp: sync.ts:70-71,234-242. Đây là entry point khác chưa đi qua slot đó.
- [F] Draft identity là JSON tuple ownerId/challengeId/localDate; getDraft() yêu cầu authenticated/current generation và không requiresReconciliation: frontend/src/stores/journalDrafts.ts:57-59,107-117.
- [F] Save thường chụp owner/auth generation/client revision/text/base journal version trước async; inFlight Map được giữ từ preflight tới ACK: journalDrafts.ts:640-666. Pending request frozen, gồm command_id/data_epoch/base_version/journal: journalDrafts.ts:518-532.
- [F] Dirty/conflict/pending/quarantined record không bị hydrate ghi đè text/base trong cùng generation: journalDrafts.ts:213-221. ACK cập nhật acknowledgedClientRevision=pending.revision; chỉ latest revision mới trở thành saved: journalDrafts.ts:611-625.
- [I] Những guard này giải quyết phần lớn race của journal store. Consumer UI và metadata handler vẫn có lỗ hổng riêng; kiểm tra store độc lập chưa đủ.

| Kịch bản | Trace và giới hạn |
|---|---|
| Mất mạng giữa save → giữ draft | [F] performSave catch giữ exact pending request cho transport/server failure, status error: journalDrafts.ts:537-562,441-443. Gõ tiếp tăng revision nhưng không thay pending: 269-273. Save tiếp replay request cũ rồi ACK cũ chỉ xác nhận revision đã gửi: 503-533,611-625. [I] Luồng save thường giữ draft đúng; conflict-resolution UI có bế tắc E-02. |
| Hai thiết bị cùng sửa | [F] API parser kiểm identity/version/snapshot hình dạng, store kiểm challenge/date và version: frontend/src/api/challenges.ts:38-68; journalDrafts.ts:81-92,382-399. Resolution gửi payload từ choice/version đã xem, kiểm trước/sau preflight: journalDrafts.ts:358-375,492-531,669-731. [I] Version guard ở store hữu ích; E-01 làm sai cache đích của ACK và E-02 chặn retry sau edit mới. |
| Token/session hết hạn giữa phiên | [F] /account 401/403 stop rồi refreshSession: sync.ts:213-216. /session 401/403 trả null: frontend/src/api/auth.ts:45-54. Auth tăng generation/reset private state/guest: auth store:34-38. Journal draft được giữ memory nhưng ẩn tới same-owner reconciliation: journalDrafts.ts:734-743,112-117,139-203. [I] Journal được khóa; private route/create form chưa được khóa toàn cục (E-05), và /session reject giữ loading (E-06). |
| Epoch đổi | [F] Sync resetQueries hai prefix: sync.ts:153-158; dirty old-epoch save/ACK bị quarantine: journalDrafts.ts:486-489,576-583. Editor có explicit rebase, không auto-send: frontend/src/components/ChallengeJournalEditor.vue:95-133. [I] Guard ngăn replay cũ; cờ UI không sống cùng store qua remount nên có E-08. |
| Double-submit | [F] save/resolveConflict dùng inFlight theo resource trước preflight: journalDrafts.ts:640-666,682-683,715-731. Unit test kiểm chỉ một preflight/request: journalDrafts.spec.ts:182-202,681-708. [F] Metadata chỉ disable khi mutation.isPending, trong khi preflight nằm trước mutateAsync: ChallengesView.vue:356,393,820. [I] Journal serialized; metadata chưa khóa giai đoạn preflight, tạo điều kiện E-04. |
| Reload khi pending | [F] Draft chỉ là ref trong Pinia, không persistence trong journalDrafts.ts:104-105; beforeunload cảnh báo attention của current owner: AppShell.vue:26-39 và journalDrafts.ts:65-73,750-754. Story 1.5 explicitly loại persistence/offline queue qua reload: _bmad-output/implementation-artifacts/1-5-giu-ban-dang-nhap-va-thu-luu-lai-sau-gian-doan.md:14-16,25. [I] Reload được xác nhận sẽ mất pending/draft memory; đây là giới hạn được duyệt, không phải finding yêu cầu thêm offline queue. Native warning thực tế NOT_RUN. |

### D-F1..D-F3 và focus finding cũ

| Finding cũ | Trạng thái source tại HEAD | Bằng chứng |
|---|---|---|
| D-F1: refetch reject sau logout/reset làm sống lại error | [I] RESOLVED ở nhánh refetch được nêu trong finding cũ; runtime NOT_RUN | [F] isCurrentConvergence kiểm auth/request/ACK generation và epoch, catch return trước mutation: sync.ts:145-150,180-182. Deferred tests cả success/failure qua logout/reset/expiry/epoch dùng real QueryObserver: sync.spec.ts:77-158. |
| D-F2: refetch reject sau offline ghi đè paused | [I] RESOLVED ở nhánh journal refetch; /account catch vẫn có E-07 | [F] catch giữ pending và paused khi hidden/offline: sync.ts:182-191; tests kiểm paused/no error/same-revision retry và query data: sync.spec.ts:161-199. |
| D-F3: ACK invalidation sau offline chuyển synced | [I] RESOLVED ở cả ACK resolve/reject callback; runtime NOT_RUN | [F] callback kiểm isCurrentAck, visible/online, giữ pending + paused: sync.ts:358-394; tests success/failure × hidden/offline: sync.spec.ts:201-227. |
| E-F1: focus rơi ra ngoài dialog khi control bị disable | [I] RESOLVED theo source + unit regression; native browser/AT NOT_RUN | [F] capture active element trước DOM patch và nextTick đưa về close control: ContentConflictDialog.vue:62-72,121-126; component tests:74-151. |

[F] Commit sửa D-F1..D-F3: 64ca94d4191e0a8978b3c60f18092ea31a26fc1e, “fix(story-1.6): fence Slice D late convergence callbacks”; git log/git show --stat cho commit này exit 0, sửa sync.ts và sync.spec.ts. Commit focus: 7fde0a933ce3f749d5c4d923018b6610223b09de, “fix(story-1.6): preserve conflict dialog focus and add browser evidence”; git log trên component exit 0.

## Finding chi tiết

### E-04 — Metadata draft của A được gửi sang B nếu đổi selection trong preflight

- Severity CRITICAL; VALID; CONFIRMED ở source/probe, integration persistence NOT_RUN.
- [F] submitEdit lấy trimmedName trước await (ChallengesView.vue:349), nhưng đọc selectedChallenge.value.id sau await (356,375,394); base_version vẫn từ editBaseVersion (398). selectChallenge đổi selectedId/mode và không reset editForm/baseVersion: 215-220. List item vẫn click được: 505-514; isPending chỉ dùng cho nút submit ở 820.
- [F] Probe trích cả selectChallenge và submitEdit, dùng A/B cùng row_version=1: logs/crossverify-frontend.mjs:19-46; output gửi id B, name “edited A”, base_version 1: logs/phase3-frontend-probes.log:6-18.
- [F] Server nhận target từ route ID: backend/app/Http/Controllers/ChallengeController.php:180-187. Use case query challenge theo command challengeId/owner, chỉ so base version với target đó rồi cập nhật name/description: backend/app/Modules/Challenges/Application/UseCases/UpdateChallengeMetadataUseCase.php:86-88,102-115,162-169.
- [I] Kịch bản tích hợp: A và B cùng owner, cùng epoch, row_version=1; mở edit A, nhập A'; bấm Lưu, giữ /account pending; chọn B; preflight trả open. Request PATCH B mang A'/description A và base_version=1; server không có thông tin “người dùng đang sửa A” để từ chối, nên B có thể bị ghi đè mà không conflict.
- [I] Sửa đề xuất: capture immutable target/resource/base version/payload/auth generation/epoch trước await; lock submission từ preflight; re-fence trước dispatch và callback. Regression phải kiểm DB của cả A/B, điều hướng trong preflight, epoch đổi giữa preflight và double-submit.
- Lane: bugfix thường; risk HIGH.

### E-01 — ACK resolve conflict của A ghi snapshot vào cache key hiện tại B

- Severity HIGH; VALID; CONFIRMED ở source/probe, Vue navigation NOT_RUN.
- [F] confirmConflict chụp challengeId/localDate A: ChallengeJournalEditor.vue:149-153, rồi dùng journalQueryKey.value sau await ở 164; check props còn là A chỉ tới 165 mới thực hiện. saveJournal thường dùng captured key đúng: 188-197.
- [F] Parent editor không có key theo resource: ChallengesView.vue:878-882; chọn challenge khác đổi props trên editor trong detail mode: 215-220.
- [F] Probe ghi snapshot challenge_id A vào key challenge-journal/B: logs/crossverify-frontend.mjs:49-72; logs/phase3-frontend-probes.log:21-37.
- [I] Repro: A conflict → chọn local/server và send; đóng dialog để đổi A→B khi PUT còn pending; ACK A hợp lệ về. Query cache B nhận payload A trước khi UI context check. Dirty record B có thể vẫn giữ text nhờ store, nhưng cache identity đã sai; không được suy rằng DB B bị sửa từ riêng finding này.
- [I] Sửa đề xuất: setQueryData bằng key A đã capture; kiểm snapshot identity/auth/epoch trước cache write. Test cả B clean/dirty, đổi challenge/ngày và về lại A trong khi resolution pending.
- Lane: bugfix thường; risk HIGH.

### E-02 — Pending conflict resolution không retry được qua UI sau khi gõ revision mới

- Severity HIGH; VALID; CONFIRMED ở source/probe, browser flow NOT_RUN.
- [F] sameResolution gồm expectedClientRevision: journalDrafts.ts:94-97; nhánh pending chỉ gọi save nếu metadata lựa chọn khớp toàn bộ: 685-692. Transport error giữ pending command: 441-443.
- [F] Gõ tiếp tăng clientRevision dù pending còn giữ revision cũ: 269-273. Dialog nhận current client revision từ editor: ChallengeJournalEditor.vue:80,296; confirm emit giá trị đó: ContentConflictDialog.vue:112-118. Nút Save thường bị disabled khi conflictSnapshot còn tồn tại: ChallengeJournalEditor.vue:338.
- [F] Probe: requested revision 2 gọi save 0 lần, pending revision 1 gọi 1 lần: logs/crossverify-frontend.mjs:75-87; logs/phase3-frontend-probes.log:40-45.
- [I] Repro: conflict version2/revision1 → chọn local → PUT timeout hoặc mất response sau commit → Để sau → gõ thêm thành revision2 → mở lại, chọn local, confirm. resolveConflict nhận expectedClientRevision2, khác pending choice revision1, return no-op. Chọn server cũng không khớp; Save thường vẫn bị disable, không có đường replay command cũ trong UI.
- [F] Unit store “replays an uncertain resolution unchanged even after a newer local edit” gọi drafts.save trực tiếp: journalDrafts.spec.ts:711-746, cụ thể 735. UI lifecycle retry test không có edit mới giữa timeout/retry: journal-draft-lifecycle.spec.ts:298-344.
- [I] Sửa đề xuất: có action retry pending frozen resolution, độc lập khỏi selection/revision mới; chỉ nhận choice mới sau khi outcome command cũ xác định. Giữ draft revision mới dirty sau ACK cũ. Bổ sung UI integration test, không chỉ gọi store.save.
- Lane: bugfix thường; risk HIGH.

### E-03 — Timer poll bỏ qua single-flight và có thể xóa nghĩa vụ hội tụ

- Severity HIGH; VALID; CONFIRMED ở source/probe, TanStack transport integration NOT_RUN.
- [F] poll gọi reconcileInternal trực tiếp: sync.ts:234-242; chỉ reconcile đăng ký activeReconcileInfo: 268-299.
- [F] lastRevision/context được cập nhật trước refetch: 124,135-140; pendingConvergence chỉ bật khi failure/lifecycle pause: 174-175,180-191. Lượt mới có equal revision/pending=false sẽ bỏ refetch và set synced: 113-117,193-201. Callback lượt cũ mất current request generation sẽ return: 145-150,180-181.
- [F] Probe chạy hàm poll/reconcile thực, thấy account_reads=2, foreground_allowed=true, failed_refetch_sync_status=synced, pending=false: logs/crossverify-frontend.mjs:90-119; logs/phase3-frontend-probes.log:48-53.
- [I] Repro: đang r1; timer P1 đọc r2, cập nhật revision và treo refetch. Focus/preflight P2 vào slot còn trống, đọc lại r2, không thấy pending nên set synced/return true. Refetch P1 reject; do request generation mới, catch bỏ qua cả error và nghĩa vụ retry. Lượt poll tiếp equal r2 tiếp tục không refetch; “Đã đồng bộ” có thể sai dù query chưa hội tụ.
- [F] AD-8 yêu cầu single non-overlapping polling loop và error observable: ARCHITECTURE-SPINE.md:98-99. Existing single-flight tests chỉ khởi đầu bằng reconcile/start: sync.spec.ts:540-575,1021-1102.
- [I] Sửa đề xuất: timer/focus/preflight/login dùng cùng serialized entry point; biểu diễn convergence debt ngay khi cần refetch, để request mới join hoặc carry debt. Regression phải khởi đầu từ timer poll thật, không thay bằng sync.reconcile.
- Lane: bugfix thường; risk HIGH.

### E-05 — Session expiry không khóa private route/form đang mở

- Severity HIGH; VALID; CONFIRMED — Lead independent auth/reset source probe + App/AppShell/view trace; Vue/browser rendering NOT_RUN.
- [F] Auth expiry reset registered state/cache, owner null, status guest: frontend/src/stores/auth.ts:18-22,34-38. AppShell chỉ điều kiện auth cho nav/status, RouterView luôn render: AppShell.vue:81,126,137,188-189. Router auth guard chỉ là beforeEach: router/index.ts:35-68.
- [F] Challenge createForm là component refs: ChallengesView.vue:42-48; create pane chỉ condition mode=create, không auth: 540; input vẫn bind refs: 584-615. View không registerPrivateStateReset/watch auth để khóa form. [F] Lead probe node logs/crossverify-frontend.mjs exit0, metadata phase3-frontend-probes-final.meta.json; auth guest và form retained, browser_rendered=false.
- [I] Repro: đang /challenges, tạo draft tên/mô tả riêng tư → /account 401 → /session 401/null → auth guest và account reset. Không có navigation mới để beforeEach chạy; component/form hiện tại vẫn sống, create text vẫn render trong input. Write disabled nhờ account context chưa ready, nhưng private UI không được khóa/ẩn và không đưa trực tiếp tới reauthentication.
- [F] AD-14 yêu cầu “Session expiry locks private UI”: ARCHITECTURE-SPINE.md:141. Journal có auth-specific guard riêng ở ChallengeJournalEditor.vue:218-220, nên finding không phủ nhận draft store fence.
- [I] Sửa đề xuất: bảo vệ rendering của private RouterView theo auth state và có reauth affordance giữ đúng in-memory journal policy; khóa ngay khi expiry/loading không hợp lệ. Test app ở create/edit/today/detail mà không thực hiện router.push sau expiry. Không claim server authorization bypass hoặc cross-owner DB disclosure từ static trace này.
- Lane: bugfix thường; risk HIGH.

### E-06 — Refresh session reject để auth mắc ở loading và dừng auto recovery

- Severity MEDIUM; VALID; PLAUSIBLE — static trace.
- [F] refreshSession đặt loading rồi await getSession mà không catch/finally: auth.ts:24-43. getSession throw với network rejection hoặc non-401/403 unsuccessful response: api/auth.ts:45-54.
- [F] Sync đã stop trước khi await refreshSession: sync.ts:213-216. Auth watcher chỉ start khi authenticated, stop khi guest: 490-505. Focus/reconnect chỉ reconcile khi authenticated/isStarted: 470-485.
- [I] Repro: /account 401 rồi /session 503 hoặc transport reject. Auth giữ loading; sync đã stop, không có timer/focus/reconnect tự thử lại. Khi promise reject từ void poll/reconcile, cũng chưa có catch ở caller event/timer: sync.ts:70-71,472,485. Người dùng phải tự tới login hoặc reload; không có explicit session-check error/retry state.
- [I] Sửa đề xuất: kết thúc refresh ở trạng thái có recovery rõ ràng, fence generation và giữ retained draft; bắt rejection ở các void entry point. Regression /account401→session503 và retry sau reconnect; tránh đổi một lỗi kiểm tra phiên thành “đăng xuất đã hoàn tất”.
- Lane: bugfix thường; risk HIGH.

### E-07 — /account catch còn ghi đè paused hoặc state của request mới

- Severity MEDIUM; VALID; PLAUSIBLE — static trace.
- [F] outer catch chỉ fence auth/status, không request generation, visible/online hoặc isStarted: sync.ts:202-221. handleOnlineStatusChange(false) đặt paused: 477-482; hidden chuyển paused khi chưa error: 462-468. Inner refetch catch đã có guards tương ứng: 180-191.
- [I] Repro đơn giản: GET /account pending trong authenticated session → offline hoặc hidden đặt paused → transport reject → outer catch tăng failures và đặt error. Race cùng auth: P1 /account treo, P2 success qua E-03, P1 reject về sau sẽ ghi error lên state mới.
- [I] Sửa đề xuất: fence outer account success/error/finally bằng current request/lifecycle/session; offline/hidden giữ paused; current visible-online error vẫn observable. Thêm deferred regressions riêng cho /account, không chỉ journal refetch.
- Lane: bugfix thường; risk HIGH; liên quan D-F2 nhưng còn ở boundary khác.

### E-08 — Cờ epoch của component không theo draft qua remount

- Severity MEDIUM; VALID; PLAUSIBLE — static trace.
- [F] epochChangeBlocked là ref(false) của editor: ChallengeJournalEditor.vue:54; watcher epoch không immediate và chỉ bật nếu thấy transition trên component đang sống: 95-105. Nút explicit rebase chỉ render theo cờ này: 247-263.
- [F] Dirty existing draft cùng auth generation được hydrate giữ nguyên mà không đối chiếu epoch: journalDrafts.ts:213-221. Save sau đó thấy record.dataEpoch khác currentEpoch thì quarantine: 486-489; save quarantined tiếp return no-op: 628-633.
- [I] Repro: draft journal epoch1 dirty → chuyển qua metadata edit/route khác khiến editor unmount → coordinator nhận epoch2 → remount cùng journal. Cờ mới=false và không có transition mới để watcher bật. Save lần đầu quarantine old-epoch record; các lần sau no-op, nhưng nút Tải lại dữ liệu mới nhất không xuất hiện. Quarantine và dừng replay vẫn đúng; đường explicit rebase đang có trong sản phẩm trở nên không truy cập được.
- [I] Sửa đề xuất: derive blocked state từ draft persisted/current epoch thay vì chỉ cờ transition trong component; cung cấp cùng hành động explicit đã có, giữ guard không auto replay. Không đề xuất mở rộng restore protocol hoặc tự quyết cách merge dataset mới.
- Lane: bugfix thường; risk HIGH.

### E-09 — Danh sách challenge không thể mở bằng keyboard

- Severity MEDIUM; VALID; PLAUSIBLE — static markup.
- [F] Challenge row là li @click, không link/button/tabindex/keydown: ChallengesView.vue:505-529. Không có điều khiển keyboard khác bên trong row. Nút edit chỉ xuất hiện sau selectedChallenge/detail: 830-851.
- [I] Repro: mở /challenges với danh sách có item, chỉ dùng Tab/Enter. Row không vào tab order nên không chọn được challenge để mở chi tiết/editor từ màn hình này. Link từ Today là một entry point khác, không thay được task trên danh sách hiện tại.
- [F] UX yêu cầu luồng chính không lệ thuộc chuột/hover, keyboard/touch: docs/ux/ux-spec.md:23,474.
- [I] Sửa đề xuất: dùng link/button native có accessible name và selected state, giữ behavior selection/route, kiểm Tab/Enter/Space khi appropriate. Regression browser keyboard từ /challenges.
- Lane: bugfix thường; risk LOW.

## API, UX, XSS, listener và unit quality

### API/query/router boundary

- [F] api/http.ts chỉ có getFoundationHealth, không phải HTTP interceptor chung: frontend/src/api/http.ts:1-16. Private API wrappers dùng fetch same-origin ở api/auth.ts:37-49,api/account.ts:11-21,api/challenges.ts:106-156.
- [F] CSRF cookie được lấy trước login; token decode và X-XSRF-TOKEN gửi cho unsafe requests: api/auth.ts:19-42,57-71; api/challenges.ts:85-93,121-129.
- [F] Command UUID và data_epoch/base_version nằm trong JSON request body ở api/challenges.ts:166-180,189-198; không có retry loop trong wrappers. Query client tắt retry/refetchOnWindowFocus mặc định: queryClient.ts:3-10. Sync store tự điều phối focus/reconnect.
- [I] Idempotency của journal phụ thuộc frozen request của store, không phụ thuộc một interceptor toàn cục. Error 401 được xử lý ở store/preflight; auth recovery và private-view lock cần sửa theo E-05/E-06. Contract/header naming được đối chiếu sâu ở WS-D, không kết luận drift chỉ vì không thấy header Idempotency-Key.

### XSS và private storage

- [F] Search production frontend/src cho v-html, innerHTML, insertAdjacentHTML, eval, new Function, localStorage, sessionStorage, indexedDB: không có match, rg exit 1. Scan bỏ schema.generated.ts và *.spec.ts.
- [F] Dialog render local/server text bằng interpolation, whitespace-pre-wrap và break-words: ContentConflictDialog.vue:175,179. Metadata text/description dùng interpolation: ChallengesView.vue:517,835,872-874.
- [I] Trong các sink đã kiểm tra chưa thấy đường HTML injection hoặc draft persistence phía frontend. Đây không phải kết luận security toàn bộ dependency/backend/deployment.

### Listener và vòng đời

- [F] Sync attach/detach cùng listener references cho visibility/focus/online/offline: sync.ts:507-545; stop() clear timer/detach: 582-588. beforeunload được attach/remove trong AppShell:26-39.
- [F] AppShell onBeforeUnmount chỉ remove beforeunload, không gọi sync.stop: AppShell.vue:37-39. Các store đăng ký private-state reset không giữ unsubscribe: sync.ts:564; account.ts:20; journalDrafts.ts:756; auth.ts:88-90.
- [I] Không có bằng chứng duplicate listener trong vòng đời SPA thông thường vì start() có isStarted guard: sync.ts:566-575. Full app/store disposal hoặc hot-remount có thể để coordinator sống tiếp; chưa runtime reproduce nên không thêm finding leak production.

### Accessibility, focus và responsive

- [F] AppShell có skip link, main tabindex=-1, tên nav và mobile trigger aria-controls/expanded: AppShell.vue:62-67,125-141,188. CSS có global focus-visible outline: assets/main.css:20-23.
- [F] Journal có label/aria-describedby/aria-invalid, status/error announcements: ChallengeJournalEditor.vue:303-331.
- [F] Native conflict modal dùng aria-labelledby/describedby, focus return, Tab/Shift+Tab trap, Escape + IME guard: ContentConflictDialog.vue:31-55,75-110,142-150. Không default choice; fieldset disabled khi busy; close vẫn available:183-218. Focus recovery có unit assert cụ thể: ContentConflictDialog.spec.ts:74-151.
- [F] Dialog có một cột nhỏ/hai cột md, wrap/scroll và max-height theo viewport: ContentConflictDialog.vue:148,172-179. Challenges layout có một cột/lg ba cột: ChallengesView.vue:454; body min-width 320: assets/main.css:8-11.
- [I] Markup hỗ trợ responsive/focus cho dialog; E-09 còn chặn keyboard list. [H] Long unbroken challenge names/descriptions có thể overflow vì các label/detail không có break-words như dialog (ChallengesView.vue:516-517,833-843,872-874); cần browser 320px/zoom/virtual keyboard trước khi phân loại finding. Browser/AT check NOT_RUN.

### Loading, empty, error, i18n

- [F] Journal load/error/retry/empty/unsaved error giữ text được render riêng: ChallengeJournalEditor.vue:218-245,319-342. Challenge list có loading/empty/background error banner + retry: ChallengesView.vue:465-503. Today có challenge loading/error/retry/empty: TodayView.vue:54-70; account-time error ở 31-36. Settings có loading/error: AccountSettingsView.vue:10-15.
- [I] State thông thường có thông báo/affordance; expired session recovery và epoch-remount error còn thiếu hành động theo E-05/E-06/E-08.
- [F] HTML lang=vi: frontend/index.html:2; labels/status/dialog chủ yếu tiếng Việt ở các component/view kể trên. API challenge fallback message là tiếng Anh: api/challenges.ts:137; create/edit catch render error.message: ChallengesView.vue:324,415. Backend validation/name error tiếng Anh: ChallengeController.php:175.
- [I] Có đường lỗi hiển thị tiếng Anh trong giao diện Việt; chưa có i18n translation layer trong inventory. Đây là hạn chế LOW ghi nhận, không quy thành AC chưa được duyệt về đa ngôn ngữ.

### Unit assert quality và khoảng trống

- [F] Inventory có 16 *.spec.ts; mọi file có expect(...). Lệnh rg --files frontend/src | rg '\.spec\.ts$' | Measure-Object -Line cho Lines=16; rg -l 'expect\(' frontend/src --glob '*.spec.ts' exit 0 liệt kê đủ 16 file. Search toMatchSnapshot/toMatchInlineSnapshot/.skip/.todo không có match, exit 1.
- [F] Test có behavioral assertions: immutable retry request/revision state và double submit (journalDrafts.spec.ts:182-235), owner/auth/epoch quarantine (243-438), native semantics/emitted choice/focus (ContentConflictDialog.spec.ts:28-151), query cache thực bằng QueryObserver (sync.spec.ts:77-105,161-227,328-454). API tests kiểm credentials/token/body/status: api/__tests__/auth.spec.ts:10-69; api/__tests__/challenges.spec.ts:88-185,250-399.
- [F] Lifecycle test mock cả preflight và recordMutationAck success: journal-draft-lifecycle.spec.ts:91-94. Unit store mock hai seams tương tự: journalDrafts.spec.ts:87-88. “Reload” trong lifecycle là unmount/remount trên cùng Pinia sau saved, không phải page reload còn pending: journal-draft-lifecycle.spec.ts:194-205.
- [I] Unit suite không chỉ snapshot/mock rỗng; nhưng seams mock và coverage chọn từng nhánh đã bỏ sót tổ hợp thật: conflict timeout + typing + UI retry (E-02), resolution ACK crossing resource (E-01), timer poll + foreground reconcile + late failed refetch (E-03), metadata resource switch trong preflight (E-04), session expiry khi đang đứng yên trên private view (E-05).
- [I] Ưu tiên regression qua consumer UI/real QueryClient cho E-01..E-03, API/DB target assertion cho E-04, full App/router render cho E-05/E-06, account-promise lifecycle cho E-07 và remount + keyboard cho E-08/E-09. Không lấy source-extracted probes làm thay integration regression.

## Bàn giao

[F] E-findings.json dùng đúng fields của mục 5, liên kết prior finding chỉ khi cùng boundary đã biết. E-01..E-04 có independent source/probe confirmation; E-05..E-09 cần Lead giữ giới hạn static evidence hoặc xác minh thêm. Không có patch sản phẩm hay Story completion trong WS-E.

[F] Read-only validation E-findings.json bằng Get-Content -Raw | ConvertFrom-Json, so sánh 13 required fields và kiểm mỗi object có evidence: exit 0, Count=9. Kết quả inventory unit files (16) và rg -l expect được chạy riêng, đều exit 0. Đây là validation artifact/search, không phải product test PASS.

[I] Thứ tự remediation nên là E-04, nhóm E-01/E-02, E-03/E-07, E-05/E-06, E-08, E-09. Giữ các guard D-F1..D-F3 và immutable draft/ACK regressions khi sửa; mọi gói phải được người dùng chọn lane riêng.
