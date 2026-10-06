# Story 1.6 — Remaining Debug Work Implementation Plan

> **For agentic workers:** Khi được phép thực thi, dùng `executing-plans` để theo dõi từng task; V4 Runner và action contract vẫn là authority. Không dùng workflow generic để vượt gate, tự chuyển slice hoặc tự duyệt. Phiên hiện tại **chỉ lập plan**, không thực thi các bước bên dưới.

**Goal:** Khép lại các việc debug còn sót, sửa đúng ba lỗi T-6 đã tái hiện và đưa Story 1.6 trở lại lộ trình kiểm chứng đến Human Gate.

**Architecture:** Tách sửa cơ chế V4 khỏi sửa sản phẩm. Giữ nguyên transaction đã retire, checkpoint/receipt D cũ và scope Challenge Journal; bổ sung đường rework có lịch sử bất biến trước khi tạo checkpoint D sửa lỗi. Verification, review và finalization là các action riêng, dùng bằng chứng mới.

**Tech Stack:** Node.js built-in test runner, Git worktree, V4 schema-v2, Vue/Pinia/Vue Query, Vitest, Playwright, Laravel/PHP, PostgreSQL test riêng.

**Spec:** `AGENTS.md`; `_bmad-output/implementation-artifacts/1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md` (AC-1..AC-4, T-6..T-8); `_bmad-output/implementation-artifacts/story-1-6-plan.md`; `.agents/skills/v4-story-runner/`.

## Ràng buộc chung

- Chỉ làm trong `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\story-1-6`, branch `codex/story-1-6`. Không sửa checkout main hoặc worktree khác.
- Scope sản phẩm vẫn là Challenge Journal/AC-1..AC-4. Sửa D chỉ được chạm `frontend/src/stores/sync.ts` và `frontend/src/stores/__tests__/sync.spec.ts`.
- Không sửa Story intent, API, auth/account production, cadence polling, schema/migrations hoặc feature maps để làm gate xanh.
- Mỗi invocation V4 chỉ làm một action, lưu tối đa một successor rồi dừng. `verify_slice` không sửa code; `CHANGES_REQUIRED` không tự cấp quyền rework.
- Giữ nguyên mọi receipt cũ. Không reset, clean, stash, xóa lock của transaction khác hoặc chạy lại transaction đã ABORTED.
- HIGH risk giữ nguyên. `PASS`, `FAIL`, `INCOMPLETE`, `ERROR` không được đổi nghĩa; thiếu evidence không phải đã qua.
- Runtime theo Story: Node `>=24.12.0 <25`, PHP `^8.4`, PostgreSQL test riêng. Runtime backend/frontend phải đọc đúng worktree, không mượn server main.
- Đây là tài liệu bàn giao, **không phải** canonical Plan, approval cho thay đổi V4 mới, receipt hoặc Human Gate approval. Canonical Plan chưa được chỉnh trong phiên lập plan.

## 1. Mốc bàn giao đã kiểm tra

Kiểm tra read-only ngày 2026-10-03, tại HEAD `0221bfc5622738a0491c94a1ba1a7044c40d8941`:

| Hạng mục | Trạng thái và ý nghĩa |
| --- | --- |
| Git trước khi thêm tài liệu này | Worktree/index sạch; đúng branch Story |
| Canonical V3 pointer | `IDLE`; không khởi động V3/Orca |
| Canonical Plan | `READY`, checkpoint `FRESH`, lifecycle/execution `in-progress`, next `verify_slice:D` |
| Slices | A/B/C `reviewed`; D `checkpointed`, chưa có verification/review receipt; E `pending` |
| Recovery cũ | Transaction `story-1-6-D-verify-map-refresh-a9e0655` đã `ABORTED`, journal/lock gốc đã archive; không còn active lock của nó |
| Sửa infrastructure | Commit `0221bfc` đã có sửa transaction recovery và regression tests; không chứa sửa code sản phẩm |
| Test recovery | Báo cáo phiên debug trước ghi **43/43 PASS**; phiên lập plan này không chạy lại suite |
| Product regressions | D-F1..D-F3 đã tái hiện ở fixture audit trong phiên trước; chưa sửa vào sản phẩm |

Recovery artifacts còn ở `test-results/story-1-6-v4-recovery/` (ignored), trong đó `abort-result-1790993276171.json` ghi `ABORTED` và `FRESH_VERIFICATION_REQUIRED`. Archive nằm trong Git-common directory, không nằm trong product tree. Không chạy lại abort để “bắt đầu sạch”.

Lịch sử D phải bảo toàn:

- Baseline: `3aec738a0dfb9024c0afa1662115781d298c7268`.
- Product checkpoint: `1fdaa79a6c347791dd6a72c7500d3bb8e95b7583`.
- Receipt: `_bmad-output/implementation-artifacts/receipts/story-1-6/D-implementation.json`.
- Receipt digest: `sha256:d2ef61816154ce75631ff11f1c0286f273ce5f9a77f77d18b96fb8f7e32147d0`.

### Đính chính plan recovery trước

Tài liệu này thay thế phần tiếp tục công việc/Task 3 của `2026-10-01-story-1-6-v4-recovery-plan.md`, không phủ nhận kết quả recovery đã ghi ở đó.

1. Không thể chỉ đặt D về `pending` rồi dùng một receipt path khác: kernel hiện chỉ nhận `D-implementation.json`; file này đã tồn tại. Đường dẫn khác bị `RECEIPT_PATH_IDENTITY_MISMATCH`, dùng lại đường dẫn cũ bị `IMPLEMENTATION_RECEIPT_ALREADY_EXISTS`.
2. Giữ metadata checkpoint cũ trên slice `pending` cũng bị validator từ chối (`UNEXPECTED_CHECKPOINT_METADATA`). Không sửa YAML thủ công để lách hai kiểm tra này.
3. `record-review` với `CHANGES_REQUIRED` chỉ trả block; nó chưa mở một vòng implement mới.
4. So sánh lại `AGENTS.md`, V3 policy và `story-development` với main: nội dung giống nhau sau chuẩn hóa CRLF/LF. Không có bằng chứng policy drift về nội dung ở ba file này; không cần cập nhật bản ignored.
5. `READY` hiện tại chỉ nói artifact hợp lệ. Nó không chứng minh D hết lỗi hoặc đã được approve.

Nguồn trực tiếp: `.agents/scripts/v4-action-kernel.mjs` (`buildPreview`, `recordSliceReviewCore`), `.agents/scripts/v4-separated-plan.mjs` và kết quả `check-story-plan.mjs check 1.6`.

## 2. Việc còn sót và thứ tự xử lý

| Ưu tiên | Việc | Điều kiện hoàn thành |
| --- | --- | --- |
| P0 | Chốt và kiểm thử đường rework D hợp lệ trong V4 | Tạo được lần sửa mới, giữ nguyên receipt/checkpoint cũ và không mất coverage lịch sử |
| P1 | Sửa D-F1: lỗi refetch đến sau logout/reset | Không làm sống lại error/pending của phiên cũ |
| P1 | Sửa D-F2: lỗi refetch đến sau offline | Giữ paused, vẫn retry được khi trở lại online |
| P1 | Sửa D-F3: ACK invalidation đến sau offline | Không báo synced sai; không nhầm ACK đã lưu với toàn bộ query đã hội tụ |
| P1 | Chuyển regression audit vào suite tracked và kiểm chứng D | RED/GREEN thật, kiểm tra consumers, receipt mới gắn đúng checkpoint |
| P2 | Slice E và full gates | Hai browser/API/PostgreSQL thật, accessibility và evidence đủ bốn AC |
| P2 | Finalize | Đủ điều kiện finalization, dừng Human Gate; chưa complete/merge |

P0 phải xong trước P1. P2 là phần bàn giao để tiếp tục Story sau debug, không phải lý do mở rộng patch T-6.

## Task 1 — Chốt cơ chế rework, không lặp lại recovery đã xong

**Files cần đọc/sửa nếu phương án maintenance được chấp thuận:**

- `.agents/scripts/v4-action-kernel.mjs`, `.agents/scripts/v4-story-runner.mjs`: điều phối và identity của lần implement mới.
- `.agents/scripts/v4-separated-plan.mjs`, `.agents/scripts/check-artifact-contract.mjs`: current attempt và lịch sử checkpoint/receipt.
- `.agents/scripts/check-slice-implementation.mjs`, `.agents/scripts/check-slice-verification.mjs`: gate/binding của attempt hiện hành.
- `.agents/scripts/check-story-finalization.mjs`: coverage và commit set không làm rơi lần implement gốc.
- Các test tương ứng: `v4-action-kernel.test.mjs`, `v4-story-runner.test.mjs`, `check-story-plan.test.mjs`, `check-artifact-contract.test.mjs`, `check-slice-implementation.test.mjs`, `check-slice-verification.test.mjs`, `check-story-finalization.test.mjs`, `v4-verification-flow.test.mjs`.
- Contract docs của Runner chỉ cập nhật cùng một maintenance patch được duyệt; không sửa router hay policy V3 để né guard.

**Input:** D hiện tại, ba finding phía dưới, receipt cũ và authorization cho maintenance riêng. **Output:** đường rework đã qua fixture tests, chưa sửa sản phẩm, chưa chạy successor.

- [ ] Kiểm tra lại canonical IDLE, HEAD, branch/worktree, index và Plan. Mọi số SHA trong tài liệu này là mốc lịch sử, không dùng thay `git rev-parse HEAD` lúc thực thi.

```powershell
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
node .agents/scripts/check-story-plan.mjs check 1.6
```

- [ ] Chốt **phương án đề xuất: rework cùng slice bằng attempt mới, lịch sử append-only**. Đây là bổ sung capability V4, chưa có sẵn. Không chạy lệnh `rework` tưởng tượng; không giả định request có `receipt_path` là đã được hỗ trợ. Maintenance này phải được cho phép riêng trước khi sửa control-plane.
- [ ] Ghi contract cụ thể: đầu vào bind Story/slice, old checkpoint/receipt digest, HEAD, findings, exact two product paths và fingerprint. Chỉ cho rework khi current D chưa được duyệt, E chưa bắt đầu, không có transaction dở/foreign lock. Kết quả chuyển current attempt sang pending theo projection hợp lệ, lưu lịch sử D cũ, không thay A/B/C/E, không trao review/completion authority.
- [ ] Chọn identity mới đồng bộ cho implementation/verification/review. Ví dụ đề xuất cho attempt thứ hai: `D-implementation-attempt-2.json`, `D-verification-attempt-2.json`, `D-review-attempt-2.json` trong thư mục receipt Story 1.6. Đây là naming contract tương lai, **hiện kernel từ chối**, phải được validator/kernel hỗ trợ và test trước.
- [ ] Ràng buộc lịch sử bằng digest và commit ancestry; không chỉ lưu một câu trong Markdown. Final review phải bao phủ D gốc và phần sửa. Không kéo `baseline_commit` tùy tiện về mốc cũ: range đó còn chứa commit metadata/maintenance. Chứng minh union các implementation attempts loại đúng metadata và vẫn chứa cả thay đổi gốc.
- [ ] Tạo RED trong Git fixture cho: attempt mới vẫn giữ bytes/digest receipt cũ; reject overwrite/cross-Story/cross-slice; reject stale fingerprint/dirty scope/foreign lock; reject giả APPROVE để sang E; finalization không bỏ sót D gốc; rework không chạy implement successor. Test cần assert cả HEAD/index/files/locks khi bị từ chối.
- [ ] Sau RED, sửa đúng contract tối thiểu; test interruption ở ranh giới metadata/commit và retry không tạo duplicate commits. Không thêm hành vi recovery mới nếu không có regression chứng minh cần.
- [ ] Chạy suites liên quan và suite recovery 43 tests cũ; ghi kết quả mới theo thực tế, không chép số 43 thành kết quả của suite đã mở rộng.

```powershell
node --test --test-reporter spec .agents/scripts/check-artifact-contract.test.mjs .agents/scripts/check-story-plan.test.mjs .agents/scripts/check-slice-implementation.test.mjs .agents/scripts/check-slice-verification.test.mjs .agents/scripts/check-story-finalization.test.mjs
node --test --test-reporter spec .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-story-runner.test.mjs .agents/scripts/v4-action-kernel.test.mjs
git diff --check
```

- [ ] Review và commit maintenance riêng bằng exact paths; không trộn hai product files. Chỉ sau đó mới chuyển projection D qua cơ chế đã được test. Dừng sau action chuẩn bị rework; invocation tiếp theo mới implement D.

**Exit gate:** current Plan hợp lệ cho `implement_slice:D` mới, lịch sử D kiểm tra được, E vẫn pending, không có product diff. Nếu capability này không được chấp thuận hoặc không thể làm bounded, báo rõ giới hạn và chọn hướng khác với người dùng; không fallback V3 hay tạo slice giả để lách receipt.

## Task 2 — Sửa ba regression T-6 bằng RED → GREEN

**Modify:** `frontend/src/stores/sync.ts`, `frontend/src/stores/__tests__/sync.spec.ts`.

**Read-only consumers:** `frontend/src/stores/journalDrafts.ts`, `frontend/src/components/ChallengeJournalEditor.vue`, `frontend/src/views/ChallengesView.vue` và tests của chúng.

**Input:** D đã được mở rework hợp lệ; audit fixture hiện có tại `frontend/test-results/story-1-6/sync-audit.spec.ts`. **Output:** patch hai file và bằng chứng fresh; chưa verify/review.

### Nguyên nhân và assertions bắt buộc

| Finding | Nguyên nhân đã quan sát | Assertions sau callback muộn |
| --- | --- | --- |
| D-F1 / HIGH | Nhánh `catch` của journal refetch thiếu kiểm tra auth/context như nhánh thành công | Sau logout/reset: `syncStatus === 'idle'`, `syncError === null`, `pendingConvergence === false` |
| D-F2 / MEDIUM | Nhánh lỗi refetch ghi `error` dù offline đã đặt `paused` | Từ trạng thái không có lỗi trước đó: giữ `paused`, không phát sinh error của callback cũ; chưa hội tụ thì còn nghĩa vụ retry |
| D-F3 / MEDIUM | `isCurrentAck` kiểm tra ACK/auth/epoch/revision nhưng chưa bảo vệ visible/online tại callback | ACK vẫn được nhận, nhưng callback offline không chuyển thành `synced`; retry hợp lệ mới hoàn tất hội tụ |

- [ ] Chuyển ba test audit vào `sync.spec.ts`, tái sử dụng fake timers, QueryClient và helper deferred hiện có. Giữ ba assertions dưới đây; `recordMutationAck` trả Promise nên phải `await`, tránh lỗi test giả như probe đầu tiên.

```typescript
// D-F1: start() đang chờ journal refetch, sau đó logout + reset rồi reject.
expect(sync.syncStatus).toBe('idle')
expect(sync.syncError).toBeNull()
expect(sync.pendingConvergence).toBe(false)

// D-F2: đang chờ refetch, handleOnlineStatusChange(false), rồi reject.
expect(sync.syncStatus).toBe('paused')
expect(sync.syncError).toBeNull()

// D-F3: ACK đã được chấp nhận nhưng invalidation còn treo.
expect(await sync.recordMutationAck(2, 1, 1)).toBe(true)
// Sau offline và resolve deferred invalidation:
expect(sync.syncStatus).toBe('paused')
```

- [ ] Chạy test tracked trước khi sửa production để xác nhận RED do đúng behavior, không do watcher tự start, Promise chưa flush hoặc mock hỏng. Fixture audit hiện có chứa đầy đủ setup/reproduction; đọc nó trước khi chuyển. Lưu command, exit code và failure output.

```powershell
# cwd: frontend
npm.cmd run test:unit -- --run src/stores/__tests__/sync.spec.ts
```

- [ ] Sửa tối thiểu **cả success lẫn error** ở boundary refetch/ACK: callback không còn thuộc auth/request/epoch hiện hành phải return trước khi mutate; callback hiện hành nhưng hidden/offline không đánh dấu synced hoặc ghi đè paused; pending convergence chỉ clear sau lần hội tụ hợp lệ.
- [ ] Không xóa lỗi hợp lệ của request mới chỉ vì callback cũ trở về. Giữ semantics: một nhóm query lỗi ở context hiện hành/online vẫn là error + pending; retry tại cùng account revision phải thực sự refetch; ACK đã commit có thể trả accepted trước khi global sync hoàn tất.
- [ ] Bổ sung matrix deferred regression: refetch và ACK × resolve/reject × logout/expiry/đổi generation/đổi epoch/hidden/offline. Thêm hai nhánh “callback cũ về sau success mới” và “callback cũ về sau error mới”; xác nhận không ghi đè state mới. Không cần nhân bản test đã tồn tại nhưng phải ghi mapping test name cho mỗi invariant.
- [ ] Thêm kiểm tra trở lại visible/online tại cùng revision: journal query thực sự được refetch và pending được clear sau thành công. Giữ real QueryObserver tests, dirty/conflict/pending/quarantined draft và revision-specific ACK regressions; không chỉ spy số lần gọi.
- [ ] Sau khi chuyển đủ ba test vào tracked suite và lưu logs, loại bản `sync-audit.spec.ts` trùng khỏi vị trí được Vitest discover. Dùng patch có mục tiêu; không xóa cả `test-results` hay recovery artifacts. Đây là cleanup fixture do agent tạo, không phải xóa tests người dùng.
- [ ] Chạy GREEN, kiểm tra consumers và static checks; ghi results mới:

```powershell
# cwd: frontend
npm.cmd run test:unit -- --run src/stores/__tests__/sync.spec.ts src/stores/__tests__/journalDrafts.spec.ts src/views/__tests__/journal.spec.ts src/views/__tests__/journal-draft-lifecycle.spec.ts src/api/__tests__/challenges.spec.ts
npm.cmd run type-check
npm.cmd exec -- eslint src/stores/sync.ts src/stores/__tests__/sync.spec.ts
# cwd: Story worktree root
git diff --check
git diff -- frontend/src/stores/sync.ts frontend/src/stores/__tests__/sync.spec.ts
```

**Exit gate:** ba RED thành GREEN, lifecycle/retry/consumer checks không regress, diff chỉ đúng hai product files. Không claim đã sửa dựa riêng vào code inspection.

## Task 3 — Lưu checkpoint sửa D, rồi verify/review riêng

**Files:** hai product files ở Task 2; canonical Plan và receipt attempt mới theo contract Task 1. Không rewrite receipt D cũ.

**Input:** patch GREEN + current Plan/action hợp lệ. **Output:** checkpoint D sửa lỗi và sau các invocation riêng mới có verification/review cho checkpoint đó.

- [ ] Đảm bảo tài liệu bàn giao/maintenance đã được lưu thành commit riêng trước khi prepare product action. Untracked plan cũng có thể gây `DIRTY_SCOPE_MISMATCH`; không giấu nó bằng stash.
- [ ] Chạy implementation gate và context gate theo action contract từ HEAD thực tế. Scope vẫn T-6/AC-3, HIGH, đúng hai paths. Dừng nếu gate không READY.
- [ ] Lưu request, preview, command output, result theo attempt/transaction ID mới trong `test-results/story-1-6-debug/`. Không tái sử dụng ID `story-1-6-D-verify-map-refresh-a9e0655` hoặc old review fingerprint.
- [ ] Thực hiện một `implement_slice:D`: commit implementation chứa hai files; commit metadata chứa đúng Plan + receipt implementation mới. Xác nhận successor `verify_slice:D`, rồi dừng invocation.
- [ ] Invocation verification tiếp theo chạy canonical aggregate trên mọi manifest path và focused CheckSpecs mới. Kiểm chứng cả phần journal convergence ban đầu lẫn correction, không chỉ vài dòng bugfix. Raw canonical `INCOMPLETE` do dependency-only/unmapped paths vẫn giữ nguyên cùng disclosure.
- [ ] Review HIGH-risk trên exact diff/history và consumers; evidence không thiếu/reorder unit. Budget hiện hành: tối đa 4 paths, 6 hunks/path, 240 diff lines/unit; chia units bằng producer, không bỏ hunk vượt budget.
- [ ] `record-review` chỉ APPROVE nếu đủ bằng chứng và không còn HIGH/MEDIUM chưa xử lý. Nếu `CHANGES_REQUIRED`, dừng và quay lại cơ chế rework đã duyệt, không sửa code trong verify action. Không suy ra approval từ recovery thành công.
- [ ] Metadata template phải lấy `CURRENT_SLICE`, `NEXT_ACTION_KIND`, `NEXT_ACTION_TARGET` từ prepared action, không hardcode successor cũ. Lưu pending evidence và review input trước apply để recovery không phụ thuộc chat.
- [ ] Sau record thành công kiểm tra Plan/receipt digest/freshness, metadata exact paths, sạch index/worktree và successor `implement_slice:E`. Chỉ ghi successor, không chạy E trong cùng invocation.

**Exit gate debug:** D được kiểm chứng/review đúng checkpoint sửa, ba findings có test closure, lịch sử gốc không mất, không còn transaction dở do debug. Đến đây mới coi phần debug hiện tại đã khép lại; chưa coi Story hoàn tất.

## Task 4 — Bàn giao Slice E và finalization sau debug

**Create:** `tests/e2e/content-conflict.spec.ts`.

**Chỉ sửa helper khi test chứng minh cần:** `tests/e2e/helpers/db-state.ts`, `tests/e2e/helpers/db-helper.php`.

**Evidence:** AC matrix và manual AT record cùng artifact review của E. Không thay `.github/workflows/ci.yml`, E2E config hoặc local wrapper chỉ vì chúng được liệt kê là consumer.

- [ ] Trước E, xác minh ports/runtime/backend source và PostgreSQL test DB riêng. Không dùng chung DB với dev/main, không kill server không rõ chủ. Wrapper local từ chối linked worktree không phải lý do sửa wrapper trong Story: chọn runtime cô lập đọc đúng source hoặc CI được phép.
- [ ] Viết E2E RED/GREEN theo T-7: hai contexts cùng owner/challenge/date; A save/B stale không mutate; chọn local và chọn server; DB chỉ lưu kết quả được chọn; cả clean views hội tụ không reload; dirty view giữ draft.
- [ ] Thêm A thay đổi lần nữa khi B đang chọn → re-conflict; abort response sau API thật commit → retry cùng UUID/payload không tăng revision lần hai. Không thay API bằng mocks cho các assertions persistence.
- [ ] Desktop/phone: Tab/Shift+Tab trap, focus return, labels, Escape, touch, long text/wrap và zoom/reflow. Ghi manual screen-reader evidence thật gồm người kiểm tra, ngày, OS/browser/AT/version, thao tác và kết quả; nếu chưa có thì ghi NOT_RUN và không claim AC-4 đầy đủ.
- [ ] Chạy focused E2E rồi full T-8 trên source checkpoint được bind. Các command sau là kế hoạch, chưa chạy trong phiên này:

```powershell
# cwd: tests/e2e; chỉ sau runtime preflight
npm.cmd test -- content-conflict.spec.ts --workers=1
# cwd: frontend
npm.cmd run contract:validate
npm.cmd run contract:check
npm.cmd run contract:proof
npm.cmd run lint
npm.cmd run type-check
npm.cmd run test:unit -- --run
npm.cmd run build-only
# cwd: backend; PostgreSQL testing environment đã pin
composer validate --strict
php vendor/bin/pint --test
composer analyse
php artisan test
# cwd: tests/e2e
npm.cmd test -- --workers=1
```

- [ ] Map AC-1 → typed conflict/non-mutation/backend contention; AC-2 → hai bản và lựa chọn; AC-3 → selected persistence/idempotent retry/query convergence; AC-4 → browser + manual AT. Revalidate evidence A/B/C khi scope/runtime thay đổi; receipt cũ không mặc nhiên là fresh evidence cho whole Story.
- [ ] E cũng đi implementation → verification → review bằng các invocation riêng. Không trộn full-suite fixes ngoài scope; failure phải phân loại và có action sửa riêng.
- [ ] Chỉ khi next action hợp lệ là `finalize_story`, chạy read-only finalization gate. Yêu cầu READY hoặc READY_WITH_DISCLOSURES theo contract; disclosure không bù cho behavioral failure, thiếu AT bắt buộc hay HIGH/MEDIUM còn mở.
- [ ] Finalize đúng contract, kiểm tra output `HUMAN_GATE_REQUIRED` và lifecycle `review`. Dừng tại đó; không `complete_story`, ghi Human approval, merge/push hoặc tích hợp branch.

**Exit gate Story:** bàn giao review/Human Gate với evidence đủ AC và mọi limitation nói rõ. Story chưa `done` trước approval exact scope của người dùng.

## Kiểm tra kế hoạch và trạng thái thực thi

- [x] Đã phân biệt recovery hoàn tất với rework/product fixes còn thiếu.
- [x] Đã xác nhận giới hạn receipt/rework bằng source, không coi đường dẫn tùy ý là capability sẵn có.
- [x] Đã giữ scope T-6 cho bugfix và tách T-7/T-8 sang E.
- [x] Đã chỉ rõ fixture ignored cần chuyển vào tracked tests để full suite không chạy bản audit trùng.
- [x] Đã phân biệt test lịch sử với commands dự kiến; không claim test mới đã chạy.
- [x] Đã bảo toàn Human Gate và dừng trước mọi execution trong phiên chỉ lập plan.
- [ ] Task 1 thực thi.
- [ ] Task 2 thực thi.
- [ ] Task 3 thực thi.
- [ ] Task 4 thực thi.

**Bước tiếp theo được đề xuất:** xem xét/chốt Task 1 (capability rework V4 có lịch sử). Chưa gọi lại `verify_slice:D` hoặc `record-review` để mong block tự hết; chúng không sửa ba lỗi sản phẩm đã biết.
