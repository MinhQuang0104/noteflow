# G5 runbook: parallel Stories and tested integration (owner gate)

G5 (P6 §4) chứng minh hai Story độc lập chạy song song dưới autopilot, mỗi Story
một Lead, rồi cả hai được merge bằng `integrate-story.mjs`. P7 chỉ được bắt đầu
sau khi G5 được ghi là passed trong `README.md`.

## Điều kiện đạt (P6 §4)

1. Hai Lead chạy **cùng lúc**: cả hai `claim` đều `APPLIED`, không có
   `SCOPE_OVERLAP`, `HOT_PATH_CONFLICT` hay `RESOURCE_CONFLICT`.
2. Cả hai Story tới Human Gate. Owner duyệt và `complete_story` → `done`.
3. Cả hai được merge bằng lệnh tích hợp. Story merge sau gặp `main` đã đổi do
   Story trước, nhưng vẫn merge sạch, và approval của nó vẫn hợp lệ: completion
   check `READY` tại `main` mới.
4. Sau cùng `story-registry.mjs status --json` không còn record nào.

## Vì sao chạy trong sandbox clone

Lệnh tích hợp fast-forward nhánh `main` của checkout canonical. `main` thật
(`D:/Workspace/Tu_Hoc/New_Project_My_Note`) chưa có code V4 Auto. Merge Story
smoke vào đó sẽ kéo theo toàn bộ nhánh kiến trúc và đưa code smoke lên `main`.
Vì vậy G5 chạy trong một **bản clone dùng một lần**:

- `D:/Workspace/Tu_Hoc/g5-sandbox`, có `main` đặt tại HEAD nhánh kiến trúc;
- remote `origin` bị xóa, nên không thể push nhầm;
- có pointer V3 riêng (`IDLE`) và registry riêng trong `.git` của clone.

Repo thật, `main` thật và pointer thật không bị đụng tới. Xong G5 thì xóa cả clone.

## Hai Story smoke

| Story | Lead | Branch | Thư mục code |
|---|---|---|---|
| 99.4 | Codex (GPT-6.1 Sol, high) | `story-99-4-g5-codex` | `tools/g5-smoke/s994/` |
| 99.5 | Claude (Opus, **session mới**) | `story-99-5-g5-claude` | `tools/g5-smoke/s995/` |

Mỗi Story (MEDIUM) có hai slice giống G3:

| Slice | Risk | Executor | Đường đi mong đợi |
|---|---|---|---|
| A: `slugify` | LOW | lead | verify `NO_REVIEW` → `verified` |
| B: `truncateWords` | MEDIUM | agy | AGY → `check-slice` READY → scope gate → verify → Lead review → `reviewed` |

`g5-seed.mjs` tạo **cả hai Story trong một commit gốc** trên `main` của sandbox:
stub, feature map và recipe riêng cho từng slice, epic riêng cho từng Story,
Story, Plan và sprint key. Nhờ vậy hai nhánh Story không cùng sửa file seed nào.

Sprint key của 99.4 nằm đầu `development_status`, của 99.5 nằm cuối file. Mỗi
`complete_story` chỉ sửa dòng của Story mình, hai dòng không kề nhau, nên lần
merge thứ hai không xung đột lifecycle.

Không slice nào chạy test backend hay E2E, nên claim không giữ tài nguyên DB.
Chạy thử ngày 2026-10-10 trên clone tạm:

- Plan `READY`; 4 map `VALID`;
- hai claim song song `APPLIED`; `check-slice` `READY`;
- hai merge `--no-ff` liên tiếp vào `main` sạch.

## Bước 0: Owner chuẩn bị (một lần)

1. AGY sẵn sàng như G3: đã đăng nhập, model Gemini 3.8 Flash (Medium).
2. Codex: trong `~/.codex/rules/default.rules`, thêm các dòng `prefix_rule` mới
   của P6 (`story-registry.mjs`, `story-scope.mjs`, `integrate-story.mjs`) từ
   `.agents/skills/v4-story-runner/references/autopilot.md`. Nếu vẫn chạy
   Codex bằng `--dangerously-bypass-approvals-and-sandbox` thì không bắt buộc.
3. Claude: không cần làm gì. `.claude/settings.json` có sẵn trong sandbox.

## Bước 1: Claude dựng sandbox (khi owner nói "chuẩn bị G5")

```bash
SANDBOX=D:/Workspace/Tu_Hoc/g5-sandbox
git clone D:/Workspace/Tu_Hoc/New_Project_My_Note "$SANDBOX"
git -C "$SANDBOX" checkout -B main origin/MinhQuang0104/agent-arch-orca-agy-loop
git -C "$SANDBOX" remote remove origin
mkdir -p "$SANDBOX/.agent-state"
cp D:/Workspace/Tu_Hoc/New_Project_My_Note/.agent-state/active-run.json "$SANDBOX/.agent-state/"
node "$SANDBOX/.agents/docs/v4-auto/g5-seed.mjs" "$SANDBOX"
git -C "$SANDBOX" add -A && git -C "$SANDBOX" commit -m "chore(g5): seed disposable Stories 99.4 and 99.5"
```

Kiểm tra trước khi đi tiếp:

- `check-story-plan.mjs check 99.4` và `99.5` → `READY`;
- 4 map `g5-99*` → `VALID`;
- pointer sandbox `IDLE`; `git remote -v` rỗng.

Sau đó:

1. `orca repo add --path D:/Workspace/Tu_Hoc/g5-sandbox`.
2. Hai lần `orca worktree create --repo path:D:/Workspace/Tu_Hoc/g5-sandbox --name story-99-N-g5-<vendor> --base-branch main`.
3. Claim từng Story từ worktree của nó, rồi ghi lại `record.generation` (mong đợi 1):
   ```bash
   node .agents/scripts/story-registry.mjs claim 99.4 --worktree "<worktree 99.4>" --lead-vendor codex --session g5-codex
   node .agents/scripts/story-registry.mjs claim 99.5 --worktree "<worktree 99.5>" --lead-vendor claude --session g5-claude
   ```
   Cả hai phải `APPLIED`. Đây là bằng chứng cho điều kiện 1.
4. Báo owner: đường dẫn hai worktree, HEAD, generation.

## Bước 2: Owner cấp quyền autopilot (mỗi Story, Git Bash, trong worktree)

```bash
node .agents/scripts/v4-story-runner.mjs run 99.4 --expected-head "$(git rev-parse HEAD)" \
  --authorize-autopilot '{"action":"authorize_autopilot","story_id":"99.4","lead_vendor":"codex","budgets":{"max_slices":2,"max_rework_per_slice":1,"max_minutes_per_slice":60}}'
```

Với 99.5 thì dùng `"story_id":"99.5","lead_vendor":"claude"`. Mong đợi
`AUTHORIZED`. Owner cũng có thể nói "cấp autopilot cho 99.N" để Claude chạy hộ.

## Bước 3: Mở hai Lead **cùng lúc** trong Orca

- **Codex** cho 99.4: mở `cmd` trong worktree và chạy
  `codex --no-daemon --dangerously-bypass-approvals-and-sandbox`.
- **Claude** cho 99.5: mở một session mới trong worktree của nó.

Dán cho mỗi Lead, thay N và vendor cho đúng:

```text
Implement Story 99.N by V4 Lite under the owner's recorded autopilot
authorization. This is a G5 parallel smoke inside a disposable sandbox clone;
another Story runs at the same time in a sibling worktree. Follow CLAUDE.md /
AGENTS.md routing: read the V4 pointer first and continue only on IDLE, then
use the v4-story-runner skill and references/autopilot.md.

The Story is already claimed: use --lead-generation 1 on every fenced Runner
call (checkpoint, verify, record-review, rework, finalize_story), and update
`story-registry.mjs heartbeat 99.N --generation 1 --state <STATE>` on each
state change. Loop: run autopilot-status with the current HEAD and generation;
on CONTINUE run exactly the named action to its next durable state, then
repeat. Slice B declares executor agy: run `story-scope.mjs check-slice` and
deliver it per references/agy-executor.md; you still own the scope gate,
checkpoint, verification and review.

Never claim or take over, call record-owner-review, approve the Human Gate,
run complete_story or integrate-story, edit settings, push, or
reset/clean/stash. On STOP, report the reason, HEAD, and the exact owner
decision needed.
```

Trong lúc chạy, owner ghi lại:

- câu hỏi Lead đặt ra;
- permission prompt;
- thời gian mỗi slice;
- `node .agents/scripts/story-registry.mjs status` vài lần: phải thấy **cả hai**
  Story cùng ở trạng thái đang chạy.

Lần dừng nào khác `HUMAN_GATE` thì chụp output và báo Claude.

Lỗi đã biết từ G3 (F-G3-3): auto mode của Claude có thể chặn `finalize_story`.
Khi đó owner tự chạy lệnh finalize mà Lead in ra, như ở G3.

## Bước 4: Human Gate (mỗi Story)

```bash
node .agents/scripts/v4-story-runner.mjs run 99.N --expected-head "$(git rev-parse HEAD)" --approve-exact-scope
node .agents/scripts/v4-story-runner.mjs run 99.N --expected-head "$(git rev-parse HEAD)"
```

Lệnh thứ hai phải trả về `DONE`. Lúc này `story-registry.mjs status` báo
Story là `READY_TO_INTEGRATE`.

## Bước 5: Tích hợp (owner, Git Bash, từ worktree của Story)

Story xong trước được tích hợp trước:

```bash
node .agents/scripts/integrate-story.mjs integrate 99.N --generation 1 --canonical D:/Workspace/Tu_Hoc/g5-sandbox
```

- Lệnh chạy full `npm run test:v4` trên bản merge, nên mất khoảng 10 phút và
  không in gì cho tới khi xong. Mong đợi `"status":"APPLIED"` kèm `mergeCommit`.
- **Tùy chọn:** chạy lệnh của Story thứ hai trong lúc lệnh đầu chưa xong. Mong
  đợi `CONFLICT` `INTEGRATION_BUSY`, và `main` không đổi. Chờ lệnh đầu xong rồi
  chạy lại.
- Story thứ hai phải `APPLIED` dù `main` đã có merge của Story đầu.
- Có `MERGE_CONFLICT` hoặc check fail thì dừng, giữ log (đường dẫn nằm trong
  output) và báo Claude. Không tự sửa.

## Bước 6: Thu bằng chứng (Claude làm theo yêu cầu)

- `git -C D:/Workspace/Tu_Hoc/g5-sandbox log --oneline --graph main`: hai commit
  `merge(story-99.N): integrate`.
- Trong sandbox `main`: `check-story-completion.mjs check 99.4 --expected-head <main HEAD>`,
  và tương tự cho 99.5 → cả hai `READY` (approval còn hợp lệ sau merge).
- `story-registry.mjs status --json` không còn record. `release --merged` xóa
  record; chỉ `--abort` mới lưu vào `aborted/`. Marker `MERGED` và log tích hợp
  nằm ở `<git-common-dir>/noteflow-v4-runs/integration/`.
- Receipt của từng Story như G3: A `NO_REVIEW`/LOW, B có worker ID Orca thật và
  reviewer `{type: lead, independent: true}`.
- Thời gian hai Story chồng lên nhau; số câu hỏi và permission prompt.
- Ghi kết quả vào dòng G5 trong `README.md` của nhánh kiến trúc.

## Bước 7: Dọn dẹp (Claude, sau khi đã có bằng chứng)

1. Đóng terminal; `orca worktree rm` hai worktree, rồi kiểm tra lại vì lệnh
   chạy bất đồng bộ.
2. Owner gỡ repo `g5-sandbox` khỏi Orca trong giao diện. CLI không có lệnh gỡ repo.
3. Xóa thư mục `D:/Workspace/Tu_Hoc/g5-sandbox`. Mọi branch, registry và
   journal của G5 nằm trong clone này, nên repo thật không còn gì để dọn.
