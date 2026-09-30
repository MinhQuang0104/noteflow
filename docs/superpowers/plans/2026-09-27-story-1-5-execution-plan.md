# Story 1.5 Implementation Plan — cập nhật tiến độ và kế hoạch thực hiện

> **For agentic workers:** Đọc `AGENTS.md`, Story và Plan chuẩn trước khi thực hiện. Đây là delta plan bổ sung cho các task đã được duyệt, không thay thế BMAD hoặc cho phép bắt đầu code. Story không chỉ định lane dùng `story-development`/V3.1; chỉ vào V4 Lite khi có yêu cầu rõ của người dùng. Không dùng workflow Superpowers để bỏ qua repository router.

**Goal:** Thực hiện Story 1.5 trên journal đã có, để giữ bản đang nhập trong phiên và lưu/thử lại với trạng thái chính xác.

**Architecture:** Tách draft journal sang Pinia memory store, độc lập với component và query cache. Mỗi resource giữ revision cùng command đang gửi bất biến; ACK bị kiểm tra theo resource, auth generation và data epoch trước khi cập nhật. Giữ API journal và thao tác Lưu hiện hành.

**Tech Stack:** Vue 3, Pinia, TanStack Vue Query, TypeScript, Vitest; API Laravel/PostgreSQL hiện có.

**Spec:** [Story 1.5](../../../_bmad-output/implementation-artifacts/1-5-giu-ban-dang-nhap-va-thu-luu-lai-sau-gian-doan.md).

**Plan chuẩn:** [story-1-5-plan.md](../../../_bmad-output/implementation-artifacts/story-1-5-plan.md), schema v2, 4 slice A–D.

**Baseline kiểm tra:** `main`, HEAD `d8e813660e44c54785466836e5c0eda658529b74`, ngày 2026-09-27, Asia/Bangkok.

## 1. Tiến độ đã đối chiếu

| Hạng mục | Trạng thái tại baseline |
| --- | --- |
| Tổng số Story | 32 |
| Đã hoàn tất | 6: **1.1, 1.2, 1.3, 1.4, 2.1, 2.3** |
| Story đang làm / chờ review | 0 / 0 |
| Backlog trong sprint | 26 |
| Epic 1 / Epic 2 | 4/6 và 2/6 Story done; Epic vẫn `in-progress` vì còn backlog |
| Epic 3 / 4 / 5 / 6 | Chưa có Story done |
| Canonical active pointer | `IDLE`, không có active Run |
| Các `run.json` tìm thấy | 4 `COMPLETE`, 2 `CANCELLED`; không có Run đang mở |
| Git worktree | Chỉ checkout `main` tại thư mục dự án |
| Orca local runtime | `not_running`; không có truy vấn live Run/Task để đối chiếu thêm |

Nguồn: [sprint-status.yaml](../../../_bmad-output/implementation-artifacts/sprint-status.yaml), `.agent-state/active-run.json`, các `run.json` hiện có, Git và `orca status --json`. Đây là đối chiếu hồ sơ/local runtime, không phải lần nghiệm thu lại toàn bộ ứng dụng.

Story hoàn tất gần nhất là **2.3 – Ghi và sửa journal tùy chọn**. Story, sprint và [Plan 2.3](../../../_bmad-output/implementation-artifacts/story-2-3-plan.md) cùng ở `done`/`complete`; Plan có Human approval cho đúng scope, commit hoàn tất `90007d6`. Done Gate được ghi là `SATISFIED_WITH_DISCLOSURES`; các kết quả canonical `INCOMPLETE` đã được công khai và xác nhận trong hồ sơ, không diễn giải thành tất cả kiểm tra đều PASS.

Story **1.5 đã có planning approval ngày 2026-09-26**, `readiness: READY`, `execution_status: ready-for-dev`. Story và sprint vẫn `backlog`, cả 4 slice `pending`, chưa có checkpoint: đây là kế hoạch đã chuẩn bị, không phải Story đang làm dở. Validator xác nhận trạng thái này hợp lệ.

**Chọn Story 1.5 làm tiếp.** Sáu dependency 1.1–1.4, 2.1 và 2.3 đều `done`; journal hiện cung cấp resource lưu thật để nghiệm thu draft/retry. Không cần lập lại yêu cầu hoặc tự động tăng từ 2.3 lên 2.4; Story 2.4 còn phụ thuộc Story 2.2 chưa làm.

## 2. Global Constraints

- Phạm vi, AC và T-1…T-7 lấy nguyên từ Story đã duyệt; tài liệu này chỉ bổ sung thứ tự, quan sát source và cách kiểm chứng.
- Giữ explicit-save journal; không thêm autosave, Notes API/UI, offline queue hoặc lưu draft vào localStorage/IndexedDB.
- Giữ nguyên `SaveJournalRequest`, `JournalMutationResult`, journal validation và tính độc lập với Done/progress.
- Full conflict UX thuộc Story 1.6; autosave/chuyển note thuộc Story 4.3. Không mở rộng hai phạm vi này khi gặp ca conflict trong 1.5.
- Rủi ro **HIGH**: auth/private lifecycle, concurrency, idempotency và shared sync boundary; cần Lead adversarial review và kiểm tra âm tính tương ứng.
- `frontend/package.json` và `tests/e2e/package.json` yêu cầu Node `>=24.12.0 <25`; runtime quan sát được là `v24.21.0`.
- Mỗi slice phải có bằng chứng thực thi/review theo lane được ủy quyền. V4 Lite chỉ chạy một action mỗi invocation; `start_story` dừng sau chuyển lifecycle, không triển khai slice A trong cùng invocation.

## 3. Điều kiện trước khi bắt đầu triển khai

- [ ] Nhận yêu cầu bắt đầu Story cụ thể. Yêu cầu ngày 2026-09-27 chỉ kiểm tra và lập plan; chưa gọi start/apply, tạo worker hoặc chuyển lifecycle.
- [ ] Kiểm tra lại HEAD, branch, worktrees và active pointer. Khi có mâu thuẫn với `IDLE`, dừng để báo cáo theo `AGENTS.md`.
- [ ] Hoàn tất Git inventory theo lane được chọn. Hiện `git status --short` báo untracked `_bmad/render/bmad-code-review/`; inventory đầy đủ cảnh báo `Permission denied` ở thư mục con. Không tuyên bố workspace sạch, không tự xóa dữ liệu hoặc thay quyền để vượt gate.
- [ ] Đưa tài liệu kế hoạch được chọn vào trạng thái bền vững theo gate của lane trước execution. Lần lập plan này không tạo commit và không sửa planning approval.
- [ ] Nếu chọn V4 Lite bằng yêu cầu rõ: đọc `v4-story-runner`, dùng `start_story` check/apply theo fingerprint và clean-scope contract; thành công chỉ lưu successor `implement_slice:A` rồi dừng. Nếu dùng V3.1: kiểm tra Orca/AGY và tạo Run theo policy; tình trạng Orca đang tắt không cho phép tự chuyển sang Lead coding.
- [ ] Chuẩn bị PostgreSQL test riêng theo `backend/phpunit.xml` và môi trường browser cho slice D. Hồ sơ trước đây ghi kết nối DB bị chặn; lần này chưa kiểm tra lại DB/browser nên trạng thái là **chưa xác minh**, không coi là lỗi hiện tại đã tái hiện.

## 4. Quan sát source cần đưa vào regression

| Seam hiện có | Quan sát tại HEAD | Task chịu trách nhiệm |
| --- | --- | --- |
| `frontend/src/components/ChallengeJournalEditor.vue` | Draft nằm trong component refs, reset khi resource đổi; success gán snapshot lại vào draft; textarea bị khóa trong lúc save | T-1, T-2, T-3 |
| Cùng component | Command ID đổi khi canonical payload đổi; chưa có pending payload độc lập với text gõ tiếp | T-2 |
| `frontend/src/stores/sync.ts` | `recordMutationAck()` chờ refetch và trả `false` nếu refetch lỗi, dù write đã có ACK | T-4 |
| `frontend/src/stores/auth.ts` | Expiry và explicit logout cùng dùng `clearPrivateState()`; logout tăng generation trước khi API kết thúc | T-5 |
| `frontend/src/components/AppShell.vue` | Logout dừng sync ngay, chưa hỏi về draft; chưa có unload guard | T-6 |

Đây là quan sát source, chưa phải kết quả tái hiện lỗi runtime. Các task phải tạo regression chứng minh hành vi trước khi sửa. Khi chỉnh `sync.ts`, kiểm tra cả consumer `frontend/src/views/ChallengesView.vue`; không đổi semantics toàn cục chỉ để làm một test journal đi qua.

## 5. Thứ tự thực hiện theo Plan chuẩn

### Slice A — T-1, T-2: draft store và save/retry

**Files:** tạo `frontend/src/stores/journalDrafts.ts` và `frontend/src/stores/__tests__/journalDrafts.spec.ts`.

**Seam sử dụng:** `saveChallengeJournal(id, date, payload: SaveJournalRequest): Promise<JournalMutationResult>`, `generateCommandId()` và `sync.reconcileBeforeWrite()`. Revision là dữ liệu local; không thêm trường wire contract.

- [ ] RED các ca đã nêu ở T-1/T-2: sửa sau saved, ACK revision cũ, A/B độc lập, double-submit từ preflight, unknown outcome rồi gõ tiếp và replay nguyên payload.
- [ ] Thực hiện T-1/T-2; khóa submission theo resource từ trước preflight, giữ text mới độc lập với pending command, không tự lưu revision tiếp theo sau ACK.
- [ ] Chạy kiểm tra A ở mục 6; kiểm tra cả late success và late error không vượt resource/generation/epoch fence.
- [ ] Ghi bằng chứng và checkpoint theo lane; review các invariant liên quan trước khi chuyển slice.

### Slice B — T-3, T-4: editor và ACK/refetch

**Files:** sửa `frontend/src/components/ChallengeJournalEditor.vue`, `frontend/src/views/__tests__/journal.spec.ts`; chỉ chỉnh `frontend/src/stores/sync.ts` và các test `sync.spec.ts`, `frontend/src/api/__tests__/challenges.spec.ts` khi regression chứng minh cần thiết.

- [ ] RED UI save/error/retry, edit trong request, remount/đổi ngày/đổi challenge, ACK A khi editor đang ở B, dirty draft gặp refetch, write ACK thành công nhưng refetch lỗi.
- [ ] Thực hiện T-3/T-4; dùng record đúng resource, tách nhãn lưu journal khỏi trạng thái sync toàn cục; giữ validation/conflict và accessibility hiện có.
- [ ] Chạy kiểm tra B và kiểm tra consumer Challenge create/update; không để ACK đã xác nhận bị biến thành write có outcome chưa rõ.
- [ ] Ghi bằng chứng, checkpoint và review trước khi chuyển slice.

### Slice C — T-5, T-6: phiên riêng tư và cảnh báo rời phiên

**Files:** các seam cần thiết trong `frontend/src/stores/auth.ts`, `frontend/src/stores/account.ts`, `frontend/src/router/index.ts`, `frontend/src/components/AppShell.vue`; test tương ứng dưới `stores/__tests__`, `router/__tests__`, `src/__tests__/App.spec.ts`.

- [ ] RED expiry/reauth cùng owner, owner khác, epoch đổi trước/sau ACK, write fence; unload với draft dirty/hidden/unknown và record clean.
- [ ] RED logout cancel/confirm/API failure: cancel không gọi API/stop sync/clear draft; failure không mất draft hoặc báo logout hoàn tất.
- [ ] Thực hiện T-5/T-6; phân biệt expiry giữ memory nhưng khóa UI với explicit logout đã xác nhận; epoch đổi quarantine và dừng replay. Guard chạy trước side effect logout.
- [ ] Chạy kiểm tra C, ghi bằng chứng và review các đường lộ private state qua DOM, cache hoặc callback cũ.

### Slice D — T-7: nghiệm thu tích hợp và Done Gate

**Files:** tạo `frontend/src/views/__tests__/journal-draft-lifecycle.spec.ts`; dùng các backend journal/contract tests hiện có, chỉ bổ sung nếu thiếu coverage của contract không đổi.

- [ ] Chứng minh chuỗi mất response → gõ tiếp → replay command cũ → ACK cũ → bấm Lưu revision mới → đọc lại dữ liệu server, gồm route/remount và hai resource.
- [ ] Chạy toàn bộ kiểm tra mục 6; các mock frontend không thay thế bằng chứng PostgreSQL/persistence.
- [ ] Nghiệm thu browser thật với hai authenticated contexts: save/reload, ngắt kết nối/retry, late ACK, chuyển resource, unload dirty/clean, logout cancel/confirm, expiry và epoch quarantine. Ghi browser/OS, thao tác, kết quả và giới hạn native unload/close.
- [ ] Lead review diff cuối, mapping đủ AC-1…AC-4 → T-1…T-7 → check/command/result, không còn finding HIGH/MEDIUM chưa giải quyết. Phân loại finding theo `AGENTS.md`.
- [ ] Đồng bộ lifecycle qua gate của lane; dừng ở review/Human Gate và chỉ complete khi có Human approval fresh cho đúng final scope. Planning approval của 1.5 không thay thế approval này.

## 6. Lệnh kiểm chứng dự kiến

Những lệnh sản phẩm dưới đây **chưa chạy trong lần lập kế hoạch này**. Chỉ gọi test path mới sau khi slice tương ứng tạo file.

Từ `frontend/`:

```powershell
# Slice A
npm.cmd run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts

# Slice B, bao gồm regression slice A
npm.cmd run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts src/views/__tests__/journal.spec.ts src/stores/__tests__/sync.spec.ts src/api/__tests__/challenges.spec.ts

# Slice C, bao gồm regression draft/editor/sync
npm.cmd run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts src/views/__tests__/journal.spec.ts src/stores/__tests__/sync.spec.ts src/stores/__tests__/auth.spec.ts src/stores/__tests__/account.spec.ts src/router/__tests__/router.spec.ts src/__tests__/App.spec.ts

# Slice D: toàn bộ unit, static và build/contract gates
npm.cmd run test:unit -- --run
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
npm.cmd run contract:check
```

Từ `backend/`, sau khi xác nhận kết nối PostgreSQL test riêng:

```powershell
php artisan test tests/Feature/ChallengeJournalTest.php tests/Feature/ChallengeJournalApiTest.php tests/Contract/ChallengeContractTest.php
```

Contract regression cần giữ identical replay không tăng `account_revision` hai lần, owner isolation, empty validation, version conflict, stale epoch và write fence. Không thay PostgreSQL bằng SQLite để kết luận transaction đúng.

Nếu dùng V4 Lite, bổ sung các check verification/receipt/freshness theo Runner đang áp dụng. Kết quả canonical `INCOMPLETE` phải giữ nguyên và xử lý theo escalation/disclosure contract; không đổi thành PASS chỉ vì focused tests qua.

## 7. Bằng chứng của lần kiểm tra/lập plan này

| Kiểm tra đã thực hiện | Kết quả |
| --- | --- |
| `node .agents/scripts/check-story-plan.mjs check 1.5` | Exit 0, `READY`, `checkpointState: NONE`, slice A, `nextAction: start_story` |
| `node .agents/scripts/check-story-plan.mjs check 2.3` | Exit 0, `READY`, execution `complete`, lifecycle `done`, checkpoints `FRESH`, next action null |
| Parse sprint YAML bằng package `yaml` đã có trong frontend | 32 Story: 6 done, 26 backlog, 0 in-progress/review/ready-for-dev |
| Đọc canonical pointer và 6 Run snapshots | Pointer IDLE; tất cả Run terminal |
| `git branch --show-current`, `git worktree list`, `git log` | Main tại baseline nêu trên; một worktree; có commit complete 2.3 |
| `git status --short --untracked-files=all` | Có cảnh báo quyền đọc `_bmad/render/bmad-code-review/...`; chưa thể chứng nhận exact clean inventory |
| `orca status --json` | Local app/runtime `not_running`; không khởi động runtime để lập plan |
| `node --version` | `v24.21.0` |

`bmad-sprint-planning/scripts/sprint_plan.py status` không chạy được vì cache offline thiếu `ruamel-yaml>=0.18`; đã dùng parser YAML có sẵn để đối chiếu và kiểm tra thủ công thứ tự/nguồn. Không cài dependency hoặc sửa sprint để xử lý lỗi công cụ. Trường `last_updated` của sprint vẫn ghi 19/09, chậm hơn các lifecycle commit; kết luận dựa trên giá trị Story, Plan, receipts và Git, không dựa riêng timestamp này.

**Kết quả bàn giao:** giữ nguyên Story/Plan/sprint chuẩn và runtime state; bổ sung tài liệu delta plan này. Bước tiếp theo khi có yêu cầu triển khai là preflight/start Story 1.5 theo lane được ủy quyền, chưa phải chạy thẳng slice A.
