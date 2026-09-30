# Đánh giá kiến trúc Agent V4 Lite

Ngày đánh giá: 2026-09-30 · Commit: `6b58b7c` trên `main` · Phạm vi: chỉ đọc

Lõi V4 Lite được thiết kế kỹ: fail-closed, kiểm tra bằng script, mỗi lần gọi làm một action. Tuy vậy, các cơ chế an toàn mà tài liệu mô tả chỉ được code thực thi một phần. Có ba lỗ hổng HIGH:

- agent tự ghi được Human approval;
- V3 không nhìn thấy Story V4 đang chạy;
- các helper finalize/complete/reconcile thiếu pointer guard hoặc lock.

Đánh giá này chưa chạy bộ test control-plane.

## Sơ đồ luồng

```text
CLAUDE.md ─► AGENTS.md (authority, 4 lane) ─► .agents/routing/task-router.md
                                                   │
             .agent-state/active-run.json ◄────────┘  (chỉ IDLE mới đi tiếp)
                          │
      ┌───────────────────┼──────────────────────────────┐
      ▼                   ▼                              ▼
 V4 migration       V4 Story Runner                V3.1 / Orca
 (1 module L1)      Plan.next_action → 1 action    (mặc định khi không opt-in V4)
                          │                        orchestration-v3.md, 43 KB
                          │                        ✘ không biết Story V4 đang chạy (H2)
                          ▼
   Action               Helper mà action doc bảo gọi thẳng   Tự kiểm pointer   Lock + journal
   start_story          start-story.mjs                      có                có
   implement_slice      v4-action-kernel.mjs                 có                có
   verify_slice         v4-action-kernel.mjs                 có                có
   reconcile_lifecycle  reconcile-story-lifecycle.mjs        có                KHÔNG
   finalize_story       finalize-story.mjs                   KHÔNG             KHÔNG
   complete_story       complete-story.mjs                   KHÔNG             KHÔNG
```

Mọi yêu cầu đều đi qua pointer trước, sau đó mới rẽ vào lane. Trạng thái của Story V4 chỉ nằm trong Plan và Git, không nằm trong pointer, nên V3 không thấy được. Khi gọi qua Runner thì có pointer guard chung, nhưng action doc hiện bảo gọi thẳng helper (H3).

## Vấn đề theo mức nghiêm trọng

Tổng cộng 17 phát hiện: 3 HIGH, 8 MEDIUM, 6 LOW. Đường dẫn tính từ gốc repo.

| ID | Mức | Vấn đề | Dẫn chứng | Hệ quả |
| --- | --- | --- | --- | --- |
| H1 | HIGH | Human Gate chỉ được bảo vệ bằng lời văn | `.agents/scripts/complete-story.mjs:298` (lệnh `approve` tự dựng input phê duyệt); `.agents/scripts/v4-story-runner.mjs:340`, `:183-188` (cờ `--approve-exact-scope`) | Agent chạy một lệnh là commit được "Human approval". Điều này trái với `AGENTS.md:28` và `actions/complete-story.md:3-4` |
| H2 | HIGH | V3 và V4 chỉ loại trừ nhau theo một chiều | V4 kiểm tra pointer ở `v4-story-runner.mjs:60-72`; `orchestration-v3.md` và `story-development/SKILL.md` không nhắc tới V4 lần nào | Story 1.6 đang `in-progress` nhưng `active-run.json` vẫn là `IDLE`. Một run V3 trên cùng Story hoặc cùng file sẽ không bị chặn |
| H3 | HIGH | Helper thiếu pointer guard, lock hoặc journal mà tài liệu cam kết | `finalize-story.mjs:380` và `complete-story.mjs` không đọc pointer, không có lock; `reconcile-story-lifecycle.mjs` đọc pointer nhưng không có lock. Tài liệu cam kết ở `actions/reconcile-lifecycle.md:21`, `v4-story-runner/SKILL.md:29` | Action doc bảo gọi thẳng script (`actions/finalize-story.md:18`) nên bỏ qua guard của Runner. Lần start Story 1.6 không có event observation nào, tức cũng đã gọi thẳng |
| M1 | MEDIUM | Runner trả mã thoát lỗi cho cả trạng thái thành công | Bảng `CODES` ở `v4-story-runner.mjs:32-42` thiếu `DONE`, `APPROVAL_DURABLE_PENDING_COMPLETION`, `NOOP`, `REVIEW_REQUIRED`, `UNAUTHORIZED_ACTION`; dòng `:360` mặc định về 5 | Hoàn tất Story thành công vẫn trả mã lỗi 5. Test không kiểm tra mã thoát |
| M2 | MEDIUM | Kernel không có lệnh chạy được | `v4-action-kernel.mjs:1300-1392` chỉ export hàm JS; CLI của Runner không nhận `--operation` hay `--input` (`:332-347`); `actions/implement-slice.md:21-25` và `actions/verify-slice.md:7` không ghi lệnh nào | Agent phải tự dựng JSON input lớn và tự viết `node -e`. Đây là bước tốn token và dễ sai nhất |
| M3 | MEDIUM | Tải context vượt quy tắc của chính hệ thống | `compile-v4-context.mjs:75-81` luôn nạp `control-plane.md` và `v4-artifact-contract.md` (14,5 KB), trái với `context-routing.md:13` và `control-plane.md:3` | `implement_slice` của Story 1.6 đo được 27.072 byte hướng dẫn và 10.465 byte projection. Cộng cả Story và Plan là khoảng 65 KB (16–20 nghìn token) trước khi đọc dòng code nào |
| M4 | MEDIUM | Mâu thuẫn về Done Gate | `AGENTS.md:28` đòi "V3 HUMAN_GATE approval", còn `AGENTS.md:12` cấm V4 động vào runtime V3 | Không rõ Story V4 hoàn tất theo gate nào |
| M5 | MEDIUM | Thiếu lane cho việc nhỏ ngoài Story | `AGENTS.md:12` loại "normal bugs/features" khỏi V4; `task-router.md:15` đẩy các việc đó sang V3 | Sửa một dòng CI (commit `c332823`) về lý thuyết phải qua V3/Orca, còn thực tế thì làm tự do |
| M6 | MEDIUM | Khoảng 420 test control-plane không chạy trong CI | `.github/workflows/ci.yml:40-70` chỉ chạy backend và frontend | Lỗi hồi quy trong `.agents/scripts` sẽ lọt qua |
| M7 | MEDIUM | Ràng buộc digest dễ gãy | Story 1.5 cần 3 commit sửa tay: `5cd0ed2`, `24097f2`, `d7a76f1` | Sửa Epic là khóa luôn Story đang chạy. Không có action chính thức nào để làm mới digest |
| M8 | MEDIUM | Thiếu Plan thì trả `ERROR` thay vì `PLAN_MISSING` | `v4-story-runner.mjs:172` đọc file trước khi validate, trái với `v4-story-runner/SKILL.md:22` | Agent nhận lỗi chung, không biết là cần tạo Plan |
| L1 | LOW | Action chết `request_gate` | `v4-story-runner.mjs:27` | Gây nhiễu khi đọc code |
| L2 | LOW | Event observation không có `invocation_id` và `session_id` | Các file trong `.agent-state/v4-observations/events` | Không liên kết được event với phiên chạy |
| L3 | LOW | Worktree và văn bản Plan đã cũ | `.worktrees/story-1-6` vẫn ở `c332823` trong khi Story 1.6 được commit thẳng lên `main`; `story-1-6-plan.md:112` vẫn ghi "giữ backlog" | Dễ nhầm checkout thực thi |
| L4 | LOW | Contract review không được trỏ tới | `actions/verify-slice.md` không nhắc tới `.agents/review/targeted-reviewer-contract.md` | Review có thể không theo contract |
| L5 | LOW | Skill bị chép tay thành hai bản | `orchestration` và `orca-cli` giống hệt nhau ở `.claude/skills` và `.agents/skills` | Dễ lệch nhau về sau |
| L6 | LOW | Văn bản quy tắc quá đặc | `AGENTS.md:18` và `CLAUDE.md:3` dùng thuật ngữ nội bộ không có định nghĩa | Model dễ hiểu sai |

## Điểm mạnh

Phần lõi đáng giữ nguyên. Các đề xuất bên dưới chỉ nhằm thu hẹp khoảng cách giữa tài liệu và code.

- **Fail-closed nhất quán:** `UNKNOWN` không bao giờ bị hiểu là rỗng. `INCOMPLETE` và `ERROR` không bị đổi thành `PASS`.
- **Transaction chặt ở start và implement:** kiểm tra theo fingerprint rồi mới apply, stage đúng từng đường dẫn, và chia hai commit riêng. Ví dụ ở Story 1.6: `b1731a6` chứa code, `6b58b7c` chứa Plan và receipt.
- **Không lấy trạng thái từ chat:** Plan, Git và receipt là nguồn sự thật, nên phiên mới có thể tiếp tục an toàn.
- **Pointer V3 nhất quán:** cả 5 run trong `.agent-state/runs` đều đã `COMPLETE` hoặc `CANCELLED`, khớp với `IDLE`.
- **Có đo lường thật:** compiler ghi số byte context. Batch D đo được mức giảm 30% so với V3 và không claim những gì chưa có bằng chứng.
- **Nạp tài liệu lười:** `recovery.md` và `implementation-techniques.md` chỉ được nạp khi thật sự cần.

## Chi phí mở rộng

Thêm một action mới cần sửa ít nhất 8 chỗ. Danh sách action bị lặp tay ở 4 nơi (mục 1–4). Đánh giá: khó mở rộng, chi phí từ trung bình đến cao.

1. `.agents/routing/task-router.md:13`
2. `.agents/skills/v4-story-runner/SKILL.md:12`
3. `V4_AUTHORIZED_ACTIONS`, `routeAction` và `runV4Story` trong `v4-story-runner.mjs`
4. Bảng action trong `compile-v4-context.mjs`
5. Action doc mới
6. Helper `.mjs` mới cùng test
7. Phần validate `next_action` trong `check-story-plan.mjs`
8. `.agents/docs/v4-artifact-contract.md`

Thêm một lane mới còn khó hơn: phải sửa `AGENTS.md`, `CLAUDE.md` và router, và không có registry nào để khai báo lane.

## Đề xuất ưu tiên

Nên làm theo thứ tự dưới đây. Mục 1–3 đóng ba lỗ hổng HIGH và nên xong trước khi Story 1.6 tới `finalize_story`.

- [ ] **Chặn tự phê duyệt (H1):** bỏ lệnh `approve` và cờ `--approve-exact-scope` khỏi các CLI mà agent gọi được. Thay bằng một bước người dùng tự làm, ví dụ gõ mã xác nhận, hoặc chỉ chấp nhận commit phê duyệt có chữ ký hay có tác giả là người.
- [ ] **Đưa V4 vào pointer (H2):** `start_story` ghi `storyId` và `mode: V4` vào pointer; `complete_story` trả pointer về `IDLE`. Khi đó V3 bootstrap sẽ chặn nếu pointer không phải `IDLE`.
- [ ] **Một cửa vào duy nhất (H3, M2):** mọi action đều đi qua `v4-story-runner.mjs run --operation … --input file.json`. Runner đảm nhận pointer guard, lock, journal và observation. Action doc chỉ gọi Runner.
- [ ] **Đưa bộ test `.agents/scripts` vào CI (M6)**, đồng thời thêm test cho mã thoát (M1) và trường hợp thiếu Plan (M8).
- [ ] **Gom danh sách action về một registry JSON** để router, SKILL, Runner và compiler cùng đọc. Viết lại `AGENTS.md` để làm rõ Done Gate của V4 và thêm lane cho việc nhỏ (M4, M5).
- [ ] **Giảm context (M3):** bỏ `control-plane.md` khỏi đường Story và tách `v4-artifact-contract.md` theo từng action.
- [ ] **Thêm action chính thức để làm mới digest (M7)** và dọn các worktree cũ (L3).

## Câu hỏi mở và phạm vi

- [ ] Human Gate cần chặt đến đâu: chỉ cần xác nhận trong terminal, hay phải là commit do chính người phê duyệt tạo?
- [ ] Việc nhỏ ngoài Story (sửa CI, bug một dòng) nên đi lane nào?

Về phạm vi: đánh giá này chỉ đọc code, tài liệu, lịch sử git và `.agent-state`, và chưa chạy bộ test control-plane. Người đánh giá cũng chưa đọc kỹ `orchestration-v3.md` (43 KB) và phần lớn khoảng 1 MB script. Vì vậy M1 và M8 cần được xác nhận thêm bằng một lần chạy thật.
