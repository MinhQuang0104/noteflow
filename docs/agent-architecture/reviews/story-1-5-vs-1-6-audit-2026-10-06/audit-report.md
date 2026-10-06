# Audit độc lập: Story 1.5 (V4 cũ) và Story 1.6 (V4 mới)

- Ngày audit: 2026-10-06. Auditor: Claude (Opus 5.5), phiên chỉ đọc.
- Canonical checkout: `D:\Workspace\Tu_Hoc\New_Project_My_Note`, branch `main`, HEAD `e2cc69551686355993cff8d5c8c43e0d8c679118`.
- Pointer: `.agent-state/active-run.json` đọc trước mọi bước khác: `status: IDLE`, `activeRunId: null`, `updatedAt: 2026-09-22T06:13:26Z`. `updatedAt` cũ không mâu thuẫn với IDLE, vì V4 không ghi vào pointer V3. Review 2026-09-30 (H2) đã nêu đây là một khoảng trống thiết kế.
- Phạm vi: chỉ đọc repository, Git, logs và artifacts. Không gọi action mutate của Runner, Orca, AGY hay V3. Không sửa code, Plan, receipt hay index. Tệp duy nhất được tạo là báo cáo này.
- Quy ước: **[F]** là fact có bằng chứng trực tiếp, **[I]** là suy luận, **[H]** là giả thuyết chưa kiểm chứng. Thời điểm trong transcript ghi theo UTC (Z); thời điểm commit ghi theo giờ +07:00.

---

## 1. Kết luận

**Quan sát "1.6 lỗi nhiều hơn 1.5" đúng, nhưng chỉ đúng một phần.**

- **[F] 1.6 thực sự có nhiều sự cố hơn và cần người dùng can thiệp nhiều hơn.**
  - Lượt chat của người dùng trong các phiên Story: khoảng 35 với 1.5 và khoảng 112 với 1.6. Tính theo slice là khoảng 9 so với khoảng 22.
  - Số RECOVERY_REQUIRED: 0 có bằng chứng với 1.5, 4 với 1.6.
  - Tooling V4 được sửa ngay trong lúc Story chạy: 1 commit, khoảng 26 dòng với 1.5; 6 commit, khoảng 3.400 dòng với 1.6.
- **[F] Số lỗi sản phẩm gần như bằng nhau:** 3 ở 1.5, 4 ở 1.6. Trong 4 lỗi của 1.6, có 3 lỗi (D-F1..F3) **là lỗi latent kế thừa**, không phải lỗi mới:
  - D-F1 và D-F2 nằm ở nhánh `catch` từ Story 1.4 (`14bc21b`).
  - D-F3 nằm ở nhánh ACK từ Story 1.5 Slice B (`ad5be8d`).
  - Đối chiếu: `git blame 1fdaa79 -- frontend/src/stores/sync.ts` dòng 171–177 và 357–371, với diff sửa `64ca94d`.
- **[F] Phần chênh lệch chủ yếu nằm ở control-plane V4 mới và môi trường, không nằm ở sản phẩm.** 1.6 là lần chạy thật đầu tiên của V4 mới qua đủ luồng implement → verify → review → finalize → complete. Bản acceptance 2026-09-28 tự ghi rằng "real-Story quality, empirical pilot… remain outside this verdict and pending" (`docs/agent-architecture/reviews/v4-acceptance-2026-09-28/final-decision.md`).

**Nguyên nhân gốc mạnh nhất, độ tin cậy cao:** gói nâng cấp V4 ngày 2026-09-28 (`9e4b831`, +11.364 dòng) đưa vào kernel action, transaction và review mới, nhưng chưa từng được chạy end-to-end trên artifact do chính nó sinh ra. Ba lớp lỗi lộ ra từ đó:

1. **Producer và consumer không khớp schema.** Kernel ghi review receipt với `judgment`/`evidence_refs`/`scope_digest`, còn gate finalization đọc `verdict`/`freshness`. Cả hai cùng `schema_version: '1'` (F-01).
2. **Có trạng thái bán phần nhưng không có action phục hồi.** Gặp ba lần: `SUCCESSOR_PROJECTION_MISMATCH`, staged trước checkpoint, `UNCOMMITTED_FINALIZATION` (F-03).
3. **Thiếu capability cho rework hợp lệ.** Với `CHANGES_REQUIRED`, Runner không có action hợp lệ nào để làm tiếp (F-04).

Ba lớp này bị khuếch đại bởi **môi trường Windows/Codex sandbox** (EPERM, CRLF, runtime E2E; F-08) và **lỗi thao tác của agent** (chạy Slice A/B trên `main`, template successor viết tĩnh; F-07).

**Không nên kết luận "V4 mới tệ hơn".**

- 1.5 đi qua được phần lớn nhờ cơ chế lỏng hơn. Agent tự sửa metadata (commit `5cd0ed2`, `24097f2`, `d7a76f1` sửa thẳng Plan YAML và tạo receipt thay thế) và merge nhánh "resolution" tự do (`d3ebd3e`, `edadf0e`, `fc615d0`).
- 1.6 chặn đúng những đường tắt đó. Các khuyết tật kiểm soát vốn bị che vì thế lộ ra thành lỗi tooling.
- Gate đã phát hiện lỗi thật: D-F1..F3 bị chặn trước khi được approve, E-F1 bị E2E bắt.

**Phát hiện cần xử lý trước Story tiếp theo (F-02, độ tin cậy cao, kiểm chứng hôm nay):** hai bản sửa đã dùng để sinh artifact 1.6 **không có trong `main` và không có trên nhánh nào**:

- `51ee479`: canonical blob và staged recovery cho CRLF.
- `c6afbc7`: review evidence nhiều path.

Story tiếp theo trên `main` sẽ gặp lại `STAGED_CONTENT_MISMATCH` (CRLF) và giới hạn 4 path của evidence producer.

---

## 2. Timeline đối chiếu và các mốc V4

### 2.1 V4 "cũ" và V4 "mới" thực chất là gì

| Giai đoạn | Tooling có hiệu lực | Bằng chứng |
|---|---|---|
| 1.5 (09-27 17:56 → 09-28 18:00) | V4 tại `d8e8136` (Runner, start, implement/verify gate, finalize/complete từ 09-26) cộng `aff2934` (split oversized hunk) trên nhánh Story | `git diff --stat a81dc66 cc018ac -- .agents`: 2 tệp, +26/−5 |
| Song song với 1.5 | Gói nâng cấp V4 trên worktree `v4-architecture-evolution` (`c858c99`..`f9af346`), chưa dùng cho 1.5 | graph `git log --graph --all` |
| 09-29 | Tích hợp V4 mới vào main: `9e4b831` (79 tệp, +11.364), thêm `v4-action-kernel.mjs` (1.396 dòng), `v4-slice-transaction.mjs` (775), `v4-check-executor.mjs`, observation, compile-context | `git show --stat 9e4b831` |
| 1.6 (09-30 12:21 → 10-05 09:06) | V4 mới, **thay đổi ngay trong lúc chạy**: `0221bfc`, `c63ee0c` nằm trên nhánh Story; `51ee479`, `c6afbc7`, `f58969a`, `70424b9` chạy từ checkout maintenance riêng (`executor_commit`) | §2.3; transcript 10-04T02:53Z, 09:01Z, 12:30Z, 10-05T01:11Z |

**Policy áp dụng lúc đó [F]:** các quy tắc "một durable action cho mỗi invocation", "`review_slice` disabled", "automatic approval / automatic review-to-done disabled" và "`complete_story` cần structured Human approval" **đã có từ trước 1.5**. Xem `git show a81dc66:.agents/skills/v4-story-runner/SKILL.md`, dòng 12, 110, 130, và `git diff a81dc66 9e4b831 -- AGENTS.md`. Diff này chỉ nén câu chữ, không đổi authority.

Như vậy giữa hai Story, **policy approval không đổi**. Thứ thay đổi là kernel thực thi.

### 2.2 Timeline Story 1.5

Transcript `rollout-2026-09-27T17-09-16-01a0e257`, `…22-14-45-01a0e36e`, `…09-28T11-33-01-01a0e649`.

| Thời điểm | Bước | Kết quả và sự cố |
|---|---|---|
| 09-27 10:09Z → 10:59Z | start | Agent ban đầu chọn V3.1, người dùng yêu cầu V4. `apply` gặp EPERM với lock, rồi `GIT_INVENTORY_INCOMPLETE` (Permission denied ở `_bmad/render`). Agent tạo worktree `story-1-5-v4`, epic digest stale vì CRLF. Commit start `a81dc66`. |
| 09-27 | A implement/verify | `319e9bc`, `d529b83`. Same-lead review APPROVE. |
| 09-27 | B implement | `ad5be8d` |
| 09-27 14:01Z | B verify | `SPLIT_REQUIRED` (hunk quá lớn), sửa tooling `aff2934` |
| 09-27 15:04Z | B verify | **Lỗi sản phẩm**: race ACK cũ cùng epoch (`a0ce8c6`) → `resolve_blocker:B`. Action này không được Runner hỗ trợ (15:21Z), người dùng phải cho phép. Sửa trên nhánh riêng, merge `d3ebd3e`. |
| 09-28 | C implement/verify | `0301a2b`. **Lỗi sản phẩm**: leak warning owner khác (`cc81aaf`) → resolution, merge `edadf0e`. Verify lại phát hiện **lỗi sản phẩm** thứ ba: warning bị nuốt khi refresh session (`9a56436`) → resolution, merge `fc615d0`, rebind `76ce395`. |
| 09-28 | D implement/verify | `01409ee`, `3581fbc`. Backend regression không chạy được (thiếu `vendor`), đã disclose. |
| 09-28 09:33Z | finalize | `STALE`: `UPSTREAM_EPIC_DIGEST_STALE` và receipt B/C/D thiếu `progression_eligible`. Agent tự repair (`5cd0ed2`, `24097f2`, `d7a76f1`) sau khi người dùng "cho phép". Finalize `cc018ac`. |
| 09-28 10:36Z → 11:00Z | Human Gate → complete | Người dùng gửi `approve_exact_scope`. Approval `1e3168a`, complete `c7c8eb4`. Tích hợp vào main bằng fast-forward. |

### 2.3 Timeline Story 1.6

Transcript `…09-30T10-16-35-01a0f050`, `…10-01T08-16-02-…01a0f508`, `…10-03T09-27-15-01a0ff96`, `…10-03T22-28-45-…01a10261`.

| Thời điểm | Bước | Kết quả và sự cố |
|---|---|---|
| 09-30 03:57Z → 05:22Z | planning → start | Gate đúng thiết kế: `PLANNING_APPROVAL_REQUIRED`, `READINESS_REQUIRED`, `DIRTY_WORKTREE`… Người dùng duyệt planning (05:12Z). Commit `2d4813a`, `2fb9091`, `e54feb3`. |
| 09-30 07:45Z → 08:25Z | A implement | 10 tệp tracked ngoài scope (`_bmad/render/...`) biến mất rồi xuất hiện lại, không rõ nguyên nhân. Checkpoint `b1731a6`/`6b58b7c`. **Chạy trên checkout main.** |
| 09-30 08:43Z → 09:36Z | A verify/review | `record-review` bị chặn bởi tệp untracked của người dùng (`agent-architecture-review-2026-09-30.md`). Same-lead APPROVE (`c77298c`). |
| 09-30 10:21Z → 16:01Z | B implement/verify | `7bf9946`. `record-review` bị chặn bởi `VIBE_CODE_AUDIT.md` (×3 lượt). Agent xác nhận A và B **đã chạy trên main chứ không trên worktree** (16:01Z). |
| 10-01 01:04Z | chuyển nhánh | Commit được chuyển sang `codex/story-1-6`, **main bị rewrite** về `65742b0` (xem cặp commit trùng message `d63e76a`/`9c859e4`, `c44a0e6`/`65742b0`). |
| 10-01 01:16Z | yêu cầu "chạy đến finalize" | Agent tự chạy chuỗi: B record-review (EPERM → CRLF `COMMITTED_METADATA_MISMATCH` → `RECOVERY_BINDING_MISMATCH` → recovered `3925efa`) → C implement (`211305d`) → C verify (`V3_POINTER_NOT_IDLE` giả do safe.directory; `UNEXPLAINED_DRIFT`) |
| 10-01 02:37Z → 04:12Z | sau khi người dùng duyệt sửa anchor | `ea7dd98` → C verify/review same-lead (`3aec738`) → D implement (`1fdaa79`) → D verify `BLOCKED` vì `UNEXPLAINED_DRIFT` → người dùng duyệt `a9e0655` |
| 10-01 05:01Z | D record-review | `RECOVERY_REQUIRED / SUCCESSOR_PROJECTION_MISMATCH`: template agent đưa vào giữ `verify_slice:D`. Không có đường recovery hợp lệ (`RECOVERY_BINDING_MISMATCH`). **Deadlock.** |
| 10-01 05:19Z → 10-03 | audit theo yêu cầu người dùng | Tìm ra D-F1..F3 (lỗi sản phẩm thật). Sửa tooling `0221bfc` (metadata abort và recovery). Lập plan debug. |
| 10-03 | rework | Không có capability rework (`RECEIPT_PATH_IDENTITY_MISMATCH`, `IMPLEMENTATION_RECEIPT_ALREADY_EXISTS`, `UNEXPECTED_CHECKPOINT_METADATA`) → sửa `c63ee0c`. Commit docs làm pending review stale (`STALE_HEAD`, 11:01Z). Verify lại cho `FAIL` (3 lỗi). `rework_slice:D` (`d3200ef`). |
| 10-03 15:03Z → 15:46Z | D attempt 2 | `64ca94d`/`596845b` → verify → **Human** APPROVE (`79365cc`) |
| 10-03 15:48Z | câu hỏi bỏ approve | Xem §4.3 |
| 10-03 15:55Z → 10-04 08:19Z | E | Môi trường: Docker tắt, backend mount main, PostgreSQL không chạy, thiếu dependency. **Lỗi sản phẩm E-F1** (focus/Escape) → scope amendment (`93aa010`). CRLF `STAGED_CONTENT_MISMATCH` → sửa tooling `51ee479` → staged recovery (`7fde0a9`/`9313305`). Verify E 4 lần: harness sai cwd, PostgreSQL chết, E2E vượt giới hạn 120 s, stale `postmaster.pid`. |
| 10-04 08:38Z → 09:48Z | E review | Producer chỉ nhận ≤4 path → sửa tooling `c6afbc7`. EPERM khi tạo lock. Human APPROVE (`bc588ad`). |
| 10-04 09:56Z → 10-05 01:42Z | finalize | Gate `STALE` với 15 blocker (schema review không khớp…) → sửa tooling `f58969a`. Finalize `ERROR STAGED_SCOPE_MISMATCH / UNCOMMITTED_FINALIZATION` (git add lỗi bị che) → sửa tooling `70424b9` → recovery `84140b3` → `HUMAN_GATE_REQUIRED` |
| 10-05 01:53Z → 02:12Z | Human Gate → complete | Người dùng chấp nhận T-7 `NOT_RUN`. `da09369`, `30778c7`. Agent báo "**8 PASS, 18 FAIL**" ở contract tests (02:02Z) nhưng approval và complete vẫn tiến hành. |
| 10-06 | integrate | `e6783cb` (merge Story), `fe2f791` (merge `70424b9`), `e2cc695` (sửa 18 test fixture). **Không merge `51ee479`, `c6afbc7`.** |

### 2.4 Khoảng trống evidence

- Có transcript Codex (`C:\Users\ACER\.codex\sessions\2026\…`) cho cả hai Story. Trích dẫn dựa trên tin nhắn người dùng và `final_answer`/`commentary` đã đọc. Đã bỏ qua phiên subagent "guardian". Chưa đọc từng tool call.
- Observation ledger chỉ có cho 1.6 (186 event: implement/verify/rework). **Không có event** cho record-review, finalize, complete, recovery. 1.5 không có ledger vì ledger ra đời ngày 09-28.
- Tệp ignored trong `.agent-state/v4-evidence/story-1-6/` (70 tệp) còn trong worktree. Chưa đọc hết, chỉ dùng tên tệp và các tham chiếu trong transcript.
- Không tái dựng được ignored policy copies tại thời điểm 1.5. Có thể dùng lời agent ngày 10-01T02:40Z: hai bản chỉ khác nhau về EOL.
- Có một thư mục untracked `_bmad-output/planning-artifacts/research/technical-story-1-5-vs-1-6-v4-audit-2026-10-06/`, tạo 08:43 hôm nay. Có vẻ là một phiên audit khác đang chạy song song. Audit này không đọc và không động vào thư mục đó.

---

## 3. Metrics, incident inventory và findings

### 3.1 Độ phức tạp hai Story

| Chỉ số | 1.5 | 1.6 |
|---|---|---|
| Slices / Tasks | 4 / 7 | 5 / 8 |
| Risk | HIGH: security, concurrency, idempotency, shared_boundary | HIGH: cùng bốn flags |
| Dependency sprint keys | 6 | 7 (thêm 1.5) |
| Diff sản phẩm (frontend, backend, tests, contracts) | 13 tệp, +2.318/−231, chỉ frontend | 18 tệp, +2.137/−87, gồm frontend, backend tests, API, E2E hai trình duyệt |
| Evidence thực chạy | Backend regression **không chạy** (thiếu vendor, disclosed); không có E2E | PostgreSQL contention, 46 E2E, backend 86 tests |
| Canonical verification | `INCOMPLETE/NO_APPLICABLE_RECIPE` ở mọi slice | `INCOMPLETE` ở mọi slice |

**[I]** Khối lượng code tương đương nhau, nhưng 1.6 trải trên nhiều tầng hơn và chạy evidence môi trường thật mà 1.5 đã miễn. Phần lớn sự cố môi trường của 1.6 nằm ở Slice E và không có tương đương ở 1.5.

### 3.2 Sự cố duy nhất sau khi khử trùng lặp

| Loại | 1.5 | 1.6 |
|---|---|---|
| Sản phẩm (VALID, phát hiện trước done) | 3: race ACK, warning leak, warning khi refresh | 4: D-F1/F2/F3 (**latent từ 1.4/1.5**), E-F1 (mới, từ dialog Slice C) |
| Tooling V4: bug hoặc thiếu capability chặn tiến độ | 3: split hunk; `resolve_blocker` không hỗ trợ; receipt/epic digest drift lúc finalize | 8: successor sau lock, deadlock; thiếu rework; CRLF (staged và committed); evidence ≤4 path; schema review producer/consumer; finalize che lỗi git add, không recovery; feature-map drift thành block; pointer bị phân loại sai |
| Môi trường | 3: sandbox perms/inventory; CRLF epic; backend vendor | 4 cụm: sandbox EPERM/ownership (≥5 lần); runtime E (≥5 invocation); giới hạn 120 s; 10 tệp `_bmad/render` mất tạm (không rõ nguyên nhân) |
| Thao tác agent | ≥1: sửa metadata thủ công được người dùng cho phép (repair commits) | 6: chạy A/B trên main; template successor tĩnh; import nhầm helper; payload recovery sai; harness sai cwd; tham số PowerShell bị hỏng (dấu, độ dài) |
| RECOVERY_REQUIRED / transaction kẹt | 0 có bằng chứng | 4 |
| Sửa tooling trong lúc Story chạy | 1 commit (+26) | 6 commit (+3.417/−156) và 2 commit cập nhật anchor |
| Lượt chat của người dùng trong các phiên Story (≈) | 35 (≈9/slice) | 112 (≈22/slice), 9 lần người dùng ngắt |
| Quãng lịch (không phải công sức) | ≈24 giờ | ≈4,9 ngày |

Cách đếm: tin nhắn người dùng trong các phiên Story của transcript, loại các sự kiện mở trang, abort và thông báo subagent. Có lẫn một số tin không thuộc Story (tóm tắt, tích hợp), nên chỉ dùng để so sánh thô. Số commit không được dùng làm số lỗi. Timestamp không dùng để suy ra công sức hay token.

### 3.3 Gate dừng đúng thiết kế, không tính là failure

`PLANNING_APPROVAL_REQUIRED` và `READINESS_REQUIRED` lúc start 1.6; `REVIEW_REQUIRED` cho mọi slice HIGH; quyết định review còn là placeholder bị từ chối (10-03T10:46Z, 10-04T09:08Z); D verify `FAIL` do 3 audit test (10-03T11:19Z); scope amendment cho E-F1; `HUMAN_GATE_REQUIRED`; T-7 `NOT_RUN` được giữ và disclose. Tất cả đều đúng contract.

### 3.4 Findings

**F-01 · HIGH · VALID · tin cậy cao · 1.6 / A–E / finalize_story.**
Producer và consumer review receipt không khớp, lại không có version để phân biệt.

- **[F]** `receipts/story-1-5/A-review.json` có `verdict`, `freshness`, `evidenceRefs`, `review_output.judgment`. `receipts/story-1-6/A-review.json` có `judgment`, `evidence_refs`, `scope_digest`, `reviewer`. Cả hai đều `schema_version: '1'`.
- Kernel ghi `judgment` (`.agents/scripts/v4-action-kernel.mjs:1294`). Gate trước `f58969a` lại đòi `verdict`/`freshness`, dẫn tới 15 blocker `REVIEW_NOT_APPROVED`/`REVIEW_FRESHNESS_INVALID` cho A–E (transcript 10-04T09:56Z, 10:12Z).
- Đã sửa cho receipt mới bằng `f58969a`. Nhưng hôm nay (đã chạy) `check-story-completion.mjs check 1.5 --expected-head e2cc695` trả `INVALID`, gồm `REVIEW_FRESHNESS_INVALID:A..D`.
- **[I]** Contract mới đã vô hiệu hóa ngược receipt 1.5. Giải thích khác: một phần là do drift sau merge (xem F-11).
- Cách xác minh: chạy finalization checker trên snapshot `cc018ac` với checker HEAD.
- Nguồn gốc: acceptance 09-28 không có kịch bản finalize/complete trên receipt do kernel sinh ra.

**F-02 · HIGH · VALID · tin cậy cao · trạng thái tại HEAD.**
Hai bản sửa dùng để sinh artifact 1.6 không có trong main.

- **[F]** `git merge-base --is-ancestor` cho `51ee479` và `c6afbc7` đều trả **NO**. `git branch -a --contains` rỗng.
- Trên main: `grep -c gitTransformContext .agents/scripts/v4-slice-transaction.mjs` = 0.
- `git diff main c6afbc7 -- .agents/scripts/prepare-change-evidence.mjs` vẫn còn `MAX_PATHS = 4`.
- So sánh committed metadata vẫn là chuỗi thô: `v4-slice-transaction.mjs:515-518`, `:670`, `:743`.
- Repo đang để `core.autocrlf=true`.
- Hậu quả: receipt E (`7fde0a9`, `9313305`, `E-review.json` với 9 evidence unit trên 5 path) không thể tái tạo bằng tooling của main. Story tiếp theo có ≥5 path hoặc tệp CRLF sẽ bị chặn lại.

**F-03 · HIGH · VALID · tin cậy cao · 1.6 / D, E / record-review, implement, finalize.**
Có những trạng thái hợp lệ mà không có action hợp lệ nào để đi tiếp. Gặp ba lần.

- (a) `SUCCESSOR_PROJECTION_MISMATCH`. Metadata được validate **sau** khi lấy lock và đặt cờ mutation. Recovery chỉ replay đúng input cũ (plan recovery F2/F3; `v4-action-kernel.mjs:1362`).
- (b) Staged trước checkpoint E (`checkpoint_commit=null`).
- (c) `UNCOMMITTED_FINALIZATION`: lỗi `git add` bị che thành `STAGED_SCOPE_MISMATCH` (`finalize-story.md` sau `70424b9`).
- Mỗi lần đều cần một bản sửa tooling riêng (`0221bfc`, `51ee479`, `70424b9`) và thêm 2–4 lượt cho phép.
- Trigger của (a) là input sai của agent, nhưng cơ chế khiến sai sót đó thành deadlock 2 ngày là của kernel.
- **[I]** Recovery được thiết kế theo từng pha, sau khi sự cố xảy ra. Các pha khác chưa có ma trận fault-injection, nên rủi ro lặp lại vẫn còn.

**F-04 · MEDIUM · VALID · tin cậy cao · 1.5 B/C, 1.6 D / rework.**
Không có đường hợp lệ từ `CHANGES_REQUIRED` hay blocker sang sửa code.

- **1.5:** `resolve_blocker` không được hỗ trợ (transcript 09-27T15:21Z). Agent dùng nhánh resolution và receipt tên tùy ý (`B-resolution-implementation.json`, `C-resolution-implementation-3.json`).
- **1.6:** kernel cố định danh tính receipt. `record-review CHANGES_REQUIRED` chỉ trả về block (debug plan §1). Sửa bằng `c63ee0c` (append-only attempts).
- Hiện tại `rework_slice` chạy được qua lane maintenance (`maintenance_authorization=V4_LITE_REWORK`). Chưa có trong router (`.agents/routing/task-router.md` vẫn liệt kê 6 action) và chưa có action contract.

**F-05 · MEDIUM · VALID · tin cậy cao · 1.6 A, B, D / record-review.**
Transaction metadata đòi **cả worktree** sạch. Pending review bị buộc vào HEAD.

- `v4-action-kernel.mjs:1075` từ chối mọi tệp untracked.
- Tệp tài liệu của người dùng chặn 4 lần (09-30T09:23Z, 15:22Z, 15:58Z; 10-03T10:52Z). Commit các tệp đó làm pending stale (`STALE_HEAD`, 10-03T11:01Z), phải verify lại toàn bộ.
- Pending review lúc đầu không bền vững (09-30T15:58Z).
- Trạng thái ở HEAD: chưa sửa.
- Giải thích khác: yêu cầu sạch là để bảo đảm commit đúng scope. Tuy nhiên `stageExact` đã stage theo đúng danh sách path, nên đòi sạch cả repo là quá rộng [I].

**F-06 · MEDIUM · VALID · tin cậy trung bình-cao · 1.6 C, D / verify.**
Feature-map anchor bị lệch sau mỗi slice và trở thành block.

- `UNEXPLAINED_DRIFT` ở C và D, mỗi lần cần người dùng duyệt một commit governance (`ea7dd98`, `a9e0655`).
- Canonical verification `INCOMPLETE` ở **mọi** slice của cả hai Story (`NO_APPLICABLE_RECIPE`/`UNMAPPED`). Vì vậy canonical không đóng góp tín hiệu, chỉ đóng góp ma sát.
- Trạng thái ở HEAD: chưa sửa.

**F-07 · HIGH · VALID · tin cậy cao · 1.6 A, B / implement, verify.**
Agent chạy sai checkout.

- Đã có worktree `codex/story-1-6`, nhưng A/B commit lên `main`. Agent tự xác nhận lúc 09-30T16:01Z.
- Hậu quả: tệp của người dùng ở main chặn `record-review`, phải chuyển commit và **rewrite main**.
- Rule "Checkout safety" trong AGENTS.md đã có từ trước.
- Bản sửa: không có bản sửa tooling nào. Runner không kiểm tra Story có đang chạy đúng worktree hay không.

**F-08 · MEDIUM · VALID · tin cậy cao · cả hai Story.**
Môi trường Windows/Codex sandbox.

- EPERM khi tạo lock ở `.git` (1.5 start; 1.6 10-01T01:37Z, 10-04T09:23Z), dubious ownership (10-04T03:11Z, 10-05T01:16Z), npm EACCES (10-01T01:22Z).
- Runtime E: PostgreSQL không chạy, stale pid, backend mount main.
- `MAX_TIMEOUT_MS = 120_000` (`v4-check-executor.mjs:16-17`) với 46 E2E trong một check.
- Phần lớn đã được xử lý bằng chạy ngoài sandbox hoặc harness ignored. Chưa có preflight môi trường chuẩn trong repo.

**F-09 · HIGH · VALID · tin cậy cao · sản phẩm, sync.ts.**
Lớp lỗi "callback bất đồng bộ đến muộn" lặp lại qua nhiều Story.

- 1.4 có S14-F01..F09. 1.5 có race ACK. 1.6 có D-F1..F3, nguồn ở `14bc21b` (1.4) và `ad5be8d` (1.5).
- Same-lead review của 1.5 B đã sửa nhánh success nhưng không phủ nhánh reject và nhánh offline.
- D-F1..F3 được tìm bởi **audit do người dùng yêu cầu** (10-01T05:19Z), không phải bởi verify gate lần đầu (focused 88/88 PASS). Gate chỉ `FAIL` sau khi các test audit được đưa vào.
- Đã sửa trong `64ca94d`. Ma trận test cho invariant vẫn chưa được chuẩn hóa thành recipe.

**F-10 · MEDIUM · VALID · tin cậy cao · 1.6 / complete.**
Bản sửa tooling làm hỏng test suite, nhưng approval vẫn tiếp tục.

- `f58969a` khiến 18 test completion và 1 test Runner fail. Agent báo lúc 10-05T02:02Z ("8 PASS, 18 FAIL").
- Human approval và complete vẫn tiến hành. Sửa ngày 10-06 bằng `e2cc695`.
- Nguyên nhân: các bản sửa maintenance chỉ chạy tập test focused (37/37, 95 focused) mà không chạy toàn bộ control-plane suite.

**F-11 · MEDIUM · VALID · tin cậy cao · trạng thái tại HEAD.**
Gate completion mất hiệu lực sau khi tích hợp.

- Đã chạy hôm nay: 1.6 trên main trả `STALE` với `HUMAN_APPROVAL_REVIEW_HEAD_MISMATCH` và `PRODUCT_OR_SCOPE_DRIFT_AFTER_APPROVAL`. 1.5 trả `INVALID`.
- Approval bị buộc vào chuỗi parent trực tiếp, đúng như audit trước tích hợp đã cảnh báo (10-05T02:50Z).
- Hệ quả: không dùng completion gate làm regression guard trên main được.
- `UNRELATED_WORKTREE_DRIFT` hôm nay do thư mục research untracked gây ra. Đó là nhiễu môi trường, không phải lỗi Story.

**F-12 · MEDIUM · SPEC_AMBIGUITY · tin cậy cao · contract chung.**
"Invocation" chưa được định nghĩa, và hướng dẫn của agent không nhất quán.

- Ngày 10-01 agent đã chạy ≥6 durable action trong **một lượt người dùng** (record-review B → implement C → verify C → record-review C → implement D → verify D). Agent hiểu "một action cho mỗi invocation" là cho mỗi lần gọi Runner.
- Ngày 10-03T10:23Z agent lại nói chạy xuyên nhiều action là không được phép.
- Policy (`AGENTS.md`, SKILL.md) không định nghĩa invocation là lượt người dùng hay lời gọi Runner.

**F-13 · MEDIUM · NEEDS_HUMAN_DECISION · tin cậy cao · Human Gate / review.**
Danh tính người phê duyệt chỉ là nhãn tự khai.

- Lệnh `approve` (`complete-story.mjs:298`) và cờ `--approve-exact-scope` (`v4-story-runner.mjs:185, 352`) cho phép agent ghi `approver_type: human`.
- `reviewer` là giá trị do request cung cấp, mặc định `same-lead` (`v4-action-kernel.mjs:1301`). Checker finalization không kiểm tra trường này.
- Review 09-30 (H1) đã nêu và vẫn còn ở HEAD.
- Trong 1.6 **không có dấu hiệu lạm dụng**. Transcript có lệnh APPROVE rõ của người dùng lúc 10-03T15:28:49Z, 10-04T09:08:18Z, 10-05T01:53Z. Nhưng repo không tự chứng minh được điều này.

**F-14 · LOW · VALID · Observability.**
Ledger không ghi record-review, finalize, complete, recovery (186 event chỉ thuộc implement/verify/rework). Đo sự cố phải dựa vào transcript.

**F-15 · LOW · VALID · tin cậy trung bình · 1.6.**
Lệnh của agent không phù hợp Windows: PowerShell làm hỏng chữ có dấu (10-01T03:05Z), vượt giới hạn độ dài dòng lệnh (03:43Z), harness ignored tự viết sai `cwd` (10-04T04:06Z). Mỗi lỗi tốn 1–2 lượt.

**Bằng chứng trái chiều đã cân nhắc:**

- 1.5 cũng nhiều sự cố. Chúng ít hiện ra vì được giải quyết bằng sửa thủ công, và người dùng chấp thuận nhanh.
- Gate V4 mới đã ngăn approve D khi có lỗi thật. Không có bằng chứng gate nào chặn sai một thay đổi sản phẩm đúng.
- Một phần "lỗi" là gate đúng thiết kế (§3.3).

---

## 4. Tự chạy, tự approve, finalize

### 4.1 Tách các loại approval

| Điểm | Ai được quyết theo policy lúc đó | Thực tế 1.5 | Thực tế 1.6 | Phân loại khi bị chặn |
|---|---|---|---|---|
| Planning approval | Người dùng (bản ghi durable) | Duyệt 09-26 | Duyệt 09-30T05:12Z | Gate đúng thiết kế |
| Review slice (MEDIUM/HIGH) | Lead được review (same-lead hợp lệ; "same-Lead review is not Human Gate") | Same-lead ở mọi slice | Same-lead ở A/B/C; **người dùng** ở D/E | Không bị chặn vì quyền. Bị chặn vì metadata/tooling (F-01, F-03, F-05) |
| Ghi review receipt (`record-review`) | Kernel, theo fingerprint/scope | Không có kernel, agent tự ghi | Kernel (lock, journal) | Bug và môi trường (EPERM, CRLF, successor) |
| Finalize | Agent, khi gate READY; dừng ở `review` | Chạy sau khi tự repair | Cần `f58969a` và `70424b9` | Bug và thiếu capability |
| Complete (Human Gate) | **Chỉ** structured Human approval | Người dùng | Người dùng | Đúng thiết kế |

### 4.2 Yêu cầu chạy liền một mạch đã thật sự diễn ra

- **[F]** Ngày 10-01T01:16Z người dùng yêu cầu "chạy … đến finalize_story, dừng ở Human Gate". Agent **đã tự chạy và tự approve** B, C (same-lead) và implement C, D.
- Agent dừng ở D vì `UNEXPLAINED_DRIFT`, rồi `SUCCESSOR_PROJECTION_MISMATCH`. Sau đó audit theo yêu cầu người dùng tìm ra lỗi sản phẩm thật.
- Vì vậy điểm nghẽn không nằm ở quyền tự approve slice. Điểm nghẽn là tooling, môi trường, và việc D có lỗi thật.
- Từ 10-03 trở đi, việc chạy từng bước là do chính prompt người dùng gửi (10-03T10:23Z) và do agent khẳng định không được chạy liên tiếp. Điều này mâu thuẫn với cách agent đã làm ngày 10-01 (F-12).

### 4.3 Câu hỏi "bỏ qua approve"

- 10-03T15:48Z người dùng hỏi có thể bỏ qua approve để chạy tới finalize không. Agent đáp "Không." (15:49Z).
- Agent đính chính lúc 15:50Z: chỉ dẫn của người dùng có ưu tiên cao hơn tệp MD. Nhưng gate approval đã được code thực thi, nên muốn bỏ thì phải đổi contract qua lane maintenance, không thể ghi `APPROVE` giả.
- Phân loại: **hiểu nhầm và giao tiếp chưa tốt** ở câu trả lời đầu. Nội dung đính chính thì đúng policy: AGENTS.md "Explicit human direction binds", nhưng automatic approval bị disabled trong chính policy đó và trong code.

### 4.4 Phần nào tự động hóa được

| Mức | Nội dung | Điều kiện |
|---|---|---|
| **Theo policy hiện tại, không cần đổi** | Same-lead review và `record-review` cho slice khi đủ evidence; chạy tuần tự implement → verify → record-review → … → finalize **nếu định nghĩa invocation là một lời gọi Runner** | Cần làm rõ F-12. Dừng ngay ở RECOVERY_REQUIRED, CHANGES_REQUIRED, `INCOMPLETE` có lý do không thuộc danh sách cho phép, hoặc khi disclosure mới cần Human |
| **Cần đổi policy** | Driver "run-until-gate" chính thức: một lượt người dùng cho phép chuỗi action, mỗi action vẫn là một transaction riêng | Người dùng duyệt thay đổi AGENTS.md/Router. Driver phải dừng khi gặp mã lỗi không thuộc danh sách tiếp tục được |
| **Nên giữ độc lập** | Human Gate cho `complete_story`; quyết định về scope amendment; chấp nhận `NOT_RUN` như T-7; review người cho slice HIGH có finding đã sửa (như D attempt 2) | Không đổi nghĩa PASS/INCOMPLETE. Không cấp approval từ chat chung chung |

**Khi agent review chính công việc của mình:** policy lúc đó cho phép same-lead review và yêu cầu disclose. Receipt 1.6 ghi `reviewer: same-lead`, Plan có `review_disclosure` (A–C), nên **hợp lệ theo policy**. Bài học của D-F1..F3 là same-lead review đã bỏ sót lớp lỗi async. Với các boundary HIGH lặp lại (sync.ts), nên có reviewer độc lập (một subagent tươi hoặc người).

---

## 5. Khuyến nghị

### P0 — trước Story tiếp theo

| ID | Component / tệp | Phạm vi nhỏ nhất | Lợi ích | Rủi ro | Kiểm chứng và điều kiện hoàn tất |
|---|---|---|---|---|---|
| P0-1 | Tích hợp `51ee479` (`v4-slice-transaction.mjs`, `v4-action-kernel.mjs`, `references/recovery.md`) và `c6afbc7` (`prepare-change-evidence.mjs`) vào main | Merge hoặc cherry-pick có review; giải quyết xung đột với `0221bfc`/`c63ee0c`/`f58969a`/`70424b9`; áp canonical-blob cho cả so sánh **committed metadata** (`:518/:670/:743`) | Tránh lặp lại CRLF và giới hạn 4 path; tái tạo được artifact 1.6 | Xung đột merge trong kernel | Full control-plane suite xanh; test mới: Plan CRLF với `autocrlf=true` qua record-review, finalize; evidence 5–16 path. `git merge-base --is-ancestor 51ee479 main` = yes |
| P0-2 | Gate chất lượng cho bản sửa tooling (quy trình; `package.json` hoặc script `.agents/scripts`) | Mọi commit `fix(v4)` phải chạy **full** `node --test .agents/scripts/*.test.mjs` trước khi dùng cho Story; ghi kết quả vào commit hoặc PR | Tránh F-10 (18 test đỏ đi qua approval) | Chạy lâu hơn (khoảng 7 phút) | Kịch bản: cố tình commit fixture hỏng thì quy trình chặn. Hoàn tất khi checklist có dòng này và 1 Story chạy theo |
| P0-3 | Kiểm tra checkout trong Runner (`v4-story-runner.mjs` bootstrap) | Nếu Story có worktree gắn với branch Story mà cwd là canonical main thì dừng (`WRONG_CHECKOUT`) | Tránh lặp F-07 | Cần định nghĩa nguồn ánh xạ Story → worktree (Plan hoặc sprint) | Test: chạy `implement_slice` từ main khi tồn tại `.worktrees/story-x` thì bị chặn, không mutation |
| P0-4 | Nối producer/consumer (`v4-finalization-contract.mjs`, schema receipt) | Tăng `schema_version` review receipt lên `2` cho dạng kernel, checker đọc theo version; giữ đường đọc v1 cho 1.5 | Đóng F-01, ngừng vô hiệu hóa ngược 1.5 | Thêm nhánh code | Test round-trip: receipt do `record-review` sinh ra phải qua `check-story-finalization` (fixture từ kernel thật, không viết tay). Completion check 1.5 tại `cc018ac` = READY |

### P1 — giảm ma sát hợp lệ

| ID | Nội dung | Kiểm chứng |
|---|---|---|
| P1-1 | Định nghĩa "invocation" trong `AGENTS.md`/SKILL.md (F-12). Nếu người dùng muốn, thêm driver `run-until-gate` (§4.4) với danh sách mã dừng | Kịch bản: chuỗi A→finalize trên fixture, dừng đúng ở REVIEW có finding, RECOVERY, Human Gate |
| P1-2 | Nới yêu cầu worktree sạch (F-05): chỉ cấm dirty trong scope Story và Plan/receipt; tệp untracked ngoài scope được liệt kê và bind vào fingerprint; pending review bind theo scope/tree digest thay vì HEAD | Test: thêm tệp `docs/x.md` untracked thì record-review vẫn thành công và tệp đó không vào commit. Commit docs ngoài scope thì pending không stale |
| P1-3 | Ma trận fault-injection cho mọi pha transaction: start, implement, metadata, finalize, complete (F-03). Mỗi pha phải có `prepare-*/apply-*` recovery hoặc abort | Mỗi điểm `maybeFail` đều có test recovery tương ứng |
| P1-4 | Đưa `rework_slice` vào router và viết action contract (F-04) | `task-router.md` liệt kê action; test Runner route được |
| P1-5 | Recipe sync.ts: biến ma trận callback (refetch/ACK × resolve/reject × logout/epoch/offline/hidden) thành CheckSpec bắt buộc cho thay đổi `frontend/src/stores/sync.ts` (F-09) | Recipe map `sync.ts` (hiện đang dependency-only); canonical không còn `UNMAPPED` cho path này |
| P1-6 | Preflight môi trường chuẩn (F-08): script read-only kiểm tra quyền ghi `.git`, `autocrlf`, ownership, port, PostgreSQL test, dependency; timeout theo từng CheckSpec, có trần riêng cho E2E | Chạy trước `implement_slice` của slice cần runtime; kết quả lưu vào evidence |

### P2

| ID | Nội dung |
|---|---|
| P2-1 | Approval nhận biết merge (F-11): bind theo tree/scope digest và chứng minh product tree không đổi sau merge |
| P2-2 | Feature-map anchors (F-06): checkpoint của slice tự đề xuất patch anchor như một artifact riêng cần duyệt, hoặc chấp nhận drift đã được review theo receipt |
| P2-3 | Ghi observation cho record-review, finalize, complete, recovery (F-14) |
| P2-4 | Đưa Human approval qua kênh không thể tự ký (F-13), nếu người dùng muốn siết: token hoặc commit do người dùng tự tạo; hoặc ghi rõ đây là rủi ro chấp nhận |

---

## 6. Giữ V4 mới, sửa chọn lọc hay phục hồi cơ chế cũ

| Phương án | Lợi | Hại | Khi nào chọn |
|---|---|---|---|
| **A. Giữ V4 mới nguyên trạng** | Integrity cao, gate bắt được lỗi thật | Story tiếp theo gần chắc gặp lại F-02 và F-05, còn F-11 vẫn tồn tại | Không khuyến nghị |
| **B. Giữ V4 mới, sửa chọn lọc (P0 cộng một phần P1)** | Giữ fail-closed, transaction và append-only rework; bỏ ma sát không mang giá trị an toàn | Cần thêm 1–2 vòng maintenance | **Khuyến nghị** |
| **C. Phục hồi cơ chế cũ** (sửa metadata thủ công, resolution branch tự do, receipt tên tùy ý) | Nhanh hơn trong ngắn hạn | Mất khả năng kiểm chứng, receipt 1.5 đã bị chính tooling hiện tại coi là INVALID; đi ngược cam kết "không sửa YAML thủ công" | Chỉ phục hồi một **ý tưởng**: lane `resolve/rework` được Human cho phép rõ ràng. Ý tưởng này đã có ở dạng an toàn qua `c63ee0c` |

Điều kiện để chọn B: P0-1 và P0-4 xong cùng full suite xanh, và một Story pilot nhỏ (risk MEDIUM) chạy tới finalize mà không phải sửa tooling giữa chừng. Nếu vẫn phải sửa tooling trong pilot, cân nhắc đóng băng V4, chạy Story bằng V3.1 cho đến khi ma trận P1-3 hoàn tất.

---

## 7. Checklist, nguồn đã đọc, kiểm tra đã chạy, dữ liệu còn thiếu

### 7.1 Checklist trước Story tiếp theo

- [ ] `51ee479` và `c6afbc7` đã vào main; full suite `.agents/scripts` xanh (ghi số và thời điểm chạy).
- [ ] Checker finalization đọc được receipt do kernel sinh ra (test round-trip).
- [ ] Đã xác định worktree Story và agent đang chạy **trong** worktree đó; `git worktree list` khớp.
- [ ] Worktree không còn tệp untracked ngoài scope, hoặc P1-2 đã xong.
- [ ] Preflight: quyền ghi `.git/noteflow-v4-transactions`, `core.autocrlf`, ownership, dependency, runtime test cô lập (nếu có E2E).
- [ ] Chốt nghĩa của "invocation" và cách chạy liền (từng bước hay run-until-gate).
- [ ] Nếu Story chạm `sync.ts`: dùng ma trận callback F-09 làm CheckSpec bắt buộc.

### 7.2 Nguồn đã đọc

`AGENTS.md`, `CLAUDE.md`, `.agents/routing/task-router.md`, `.agents/skills/v4-story-runner/SKILL.md` (HEAD và `a81dc66`), `actions/verify-slice.md`, `actions/finalize-story.md`, `actions/complete-story.md`, `story-1-5-plan.md`, `story-1-6-plan.md`, receipts `story-1-5/*` và `story-1-6/*` (danh sách tệp; schema của A-review và E-review), `docs/superpowers/plans/2026-10-01-story-1-6-v4-recovery-plan.md`, `…2026-10-03-story-1-6-debug-remaining-plan.md`, `docs/agent-architecture/reviews/v4-acceptance-2026-09-28/final-decision.md`, `agent-architecture-review-2026-09-30.md` (phần findings), graph Git từ 09-20, `git show --stat` các commit V4/Story/repair, `git blame` sync.ts, diff `64ca94d`, các đoạn liên quan trong `v4-action-kernel.mjs`, `v4-slice-transaction.mjs`, `v4-check-executor.mjs`, `complete-story.mjs`, `v4-story-runner.mjs`, observation events của 1.6, transcript Codex (tin nhắn người dùng và trả lời của agent) ngày 09-27, 09-28, 09-30, 10-01, 10-03, 10-04, 10-05, 10-06.

### 7.3 Kiểm tra đã chạy hôm nay (đều chỉ đọc)

- `node .agents/scripts/check-story-plan.mjs check 1.5` và `check 1.6`: cả hai `READY`, `done`, `nextAction: null`.
- `node .agents/scripts/check-story-completion.mjs check 1.5|1.6 --expected-head e2cc695`: 1.5 `INVALID` (11 lý do), 1.6 `STALE` (3 lý do). Xem F-01 và F-11.
- `git merge-base --is-ancestor` cho 6 commit `fix(v4)`: `51ee479` và `c6afbc7` không có trên main.
- `git status --porcelain` trước và sau mỗi lệnh: chỉ có `?? _bmad-output/planning-artifacts/`, có từ trước, không phải do audit tạo.
- **Chưa chạy** toàn bộ test suite V4 (khoảng 7 phút, tạo fixture tạm). Các con số test trong báo cáo (43/43, 157, 212, 8 PASS/18 FAIL…) là **kết quả lịch sử** lấy từ transcript và commit message.

### 7.4 Dữ liệu còn thiếu

- Chi tiết tool call (lệnh và output đầy đủ) trong transcript cho từng incident. Mới đọc commentary và final.
- Nguyên nhân 10 tệp `_bmad/render` biến mất ngày 09-30. Không có log filesystem.
- Lý do người dùng ngắt 9 lần trong 1.6. Transcript chỉ ghi `turn_aborted`.
- Nội dung đầy đủ `.agent-state/v4-evidence/story-1-6/*` và transaction archive trong `.git` common directory (chưa liệt kê).
- Bằng chứng định lượng về token và thời gian: không suy ra từ timestamp.

---

## Nếu chỉ sửa ba việc để Story tiếp theo ổn định hơn

1. **Đưa `51ee479` và `c6afbc7` vào main, đồng thời sửa so sánh committed metadata theo canonical blob (P0-1).**
   - Vì sao: đây là lỗi đã biết, có bản sửa, nhưng chưa được tích hợp. Lỗi chắc chắn tái diễn trên Windows với `autocrlf=true` và với slice có ≥5 path.
   - Kiểm chứng: `merge-base --is-ancestor` = yes; test CRLF end-to-end qua record-review và finalize; test evidence 5–16 path; full suite xanh.
2. **Thêm test round-trip "receipt do kernel sinh ra → finalization → completion", và version hóa schema review (P0-4 cùng P0-2).**
   - Vì sao: F-01 và F-10 cho thấy các mảnh V4 đã được kiểm tra riêng lẻ, không được kiểm tra nối nhau. Đây là nguồn chính của chuỗi block lúc finalize.
   - Kiểm chứng: một fixture Story nhỏ chạy start → implement → verify → record-review → finalize → approve → complete bằng chính kernel. Completion check 1.5 tại `cc018ac` = READY. Bắt buộc full suite trước mỗi `fix(v4)`.
3. **Chặn sai checkout và nới yêu cầu "cả worktree sạch" thành "scope sạch" (P0-3 cùng P1-2).**
   - Vì sao: hai nguyên nhân này tạo ra nhiều lượt can thiệp thủ công nhất mà không mang giá trị an toàn (F-05, F-07).
   - Kiểm chứng: chạy action từ main khi Story có worktree thì `WRONG_CHECKOUT`; có tệp docs untracked thì record-review vẫn thành công và commit chỉ gồm Plan cùng receipt.

**Mức tin cậy của thứ tự:** việc 1 và 2 có bằng chứng mạnh, gồm code, kết quả gate hôm nay và transcript. Việc 3 có bằng chứng về số lần lặp, nhưng chưa định lượng được nó làm tăng thời gian chờ bao nhiêu. Ma trận fault-injection (P1-3) có thể quan trọng ngang việc 3. Với dữ liệu hiện có, chưa đủ để xếp hạng chắc chắn giữa hai việc này.
