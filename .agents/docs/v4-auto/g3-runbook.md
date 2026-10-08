# G3 runbook: autopilot live smoke (owner gate)

G3 (P3 §4) chứng minh autopilot chạy được với Lead thật: mỗi vendor đưa một
Story nhỏ, dùng một lần, tới Human Gate mà không cần owner duyệt từng slice.
P5 chỉ được bắt đầu sau khi G3 được ghi là passed trong `README.md`.

## Điều kiện đạt

1. Lead không hỏi owner ở từng slice, trừ các lần dừng HUMAN mà policy bắt buộc.
   Hỏi quyền lệnh (permission prompt) được ghi lại riêng: đó là lỗ hổng
   allowlist, không phải lỗi autopilot.
2. Receipt ghi đúng vendor/reviewer: Plan có `autopilot.lead_vendor`; review
   receipt của slice B có `reviewer: {type: lead, vendor: <vendor>, independent: true}`.
3. Story dừng ở Human Gate (`autopilot-status` → `STOP` / `HUMAN_GATE`).

## Hai Story smoke

| Story | Lead | Worktree / branch | Ghi chú |
|---|---|---|---|
| 99.2 | Codex (GPT-6.1 Sol, high) | `story-99-2-g3-codex` / `MinhQuang0104/story-99-2-g3-codex` | chạy trước |
| 99.3 | Claude (Opus, **session mới**) | `story-99-3-g3-claude` / `MinhQuang0104/story-99-3-g3-claude` | chạy sau khi 99.2 xong |

Chạy lần lượt, không song song: chạy song song là việc của G5. Cả hai branch
tách từ nhánh kiến trúc (code P1–P2.2 chưa có trên main) và **không bao giờ merge**.

Mỗi Story (MEDIUM) có hai slice, phủ đúng luồng V4 Auto:

| Slice | Risk | Executor | Đường đi mong đợi |
|---|---|---|---|
| A: `slugify` | LOW | lead | implement → verify `NO_REVIEW` (policy `PROGRESS`) → slice `verified` (P2.2) |
| B: `truncateWords` | MEDIUM | agy | AGY implement → scope gate → checkpoint → verify `REVIEW_REQUIRED` → Lead review → `APPROVE_ALLOWED` (independent) → `reviewed` |

Sau slice B: `finalize_story` → `HUMAN_GATE_REQUIRED`.

`g3-seed.mjs` dựng sẵn bốn file stub, Story, Plan, mục Epic, sprint key và mỗi
slice một feature map + recipe. Recipe riêng là bắt buộc: dùng chung một map thì
khi verify slice B, thay đổi đã commit của slice A bị coi là drift. File stub có
sẵn ở base để map neo được blob, nhờ đó verify chuẩn của slice A ra `PASS` và
slice A đi được đường NO_REVIEW (đã dry-run: Plan `READY`, map `VALID`, verify
chuẩn `PASS`).

## Bước 0: Owner chuẩn bị (một lần)

1. Pointer canonical `D:/Workspace/Tu_Hoc/New_Project_My_Note/.agent-state/active-run.json` là `IDLE`.
2. AGY sẵn sàng như G1: đã đăng nhập, model Gemini 3.8 Flash (Medium).
3. Allowlist (`.agents/skills/v4-story-runner/references/autopilot.md`):
   - Claude: ghi khối `permissions.allow` vào
     `<worktree 99.3>/.claude/settings.local.json`. File này nằm trong
     `.git/info/exclude`, nên không làm bẩn cây làm việc của Story. Làm sau bước 1.
   - Codex: thêm cùng các prefix vào cấu hình duyệt lệnh của Codex.

## Bước 1: Claude dựng worktree (khi owner nói "chuẩn bị G3")

Với mỗi Story:

1. `orca worktree create` với base là nhánh kiến trúc, để worktree hiện trong Orca.
2. `node .agents/docs/v4-auto/g3-seed.mjs <worktree> <2|3> <codex|claude>`, rồi
   xem lại diff và commit `chore(g3): seed disposable smoke Story 99.N`.
3. Gate: `check-story-plan.mjs check 99.N` → `READY`; `check-feature-map.mjs check`
   cả hai map → `VALID`; cây làm việc sạch.
4. Báo owner: đường dẫn worktree, HEAD.

## Bước 2: Owner cấp quyền autopilot (mỗi Story)

Quyền này là quyết định của owner. Owner tự chạy (Git Bash, trong worktree),
hoặc nói rõ với Claude "cấp autopilot cho 99.N" để Claude chạy hộ:

```bash
node .agents/scripts/v4-story-runner.mjs run 99.2 --expected-head "$(git rev-parse HEAD)" \
  --authorize-autopilot '{"action":"authorize_autopilot","story_id":"99.2","lead_vendor":"codex","budgets":{"max_slices":2,"max_rework_per_slice":1,"max_minutes_per_slice":60}}'
```

Với 99.3, dùng `"story_id":"99.3","lead_vendor":"claude"`. Kết quả mong đợi:
`"status":"AUTHORIZED"` và một commit `chore(story-99.N): record autopilot authorization`.
PowerShell 5.1 làm mất dấu nháy kép trong JSON khi truyền cho `node`, nên dùng
Git Bash.

## Bước 3: Mở Lead trong Orca và giao việc

Mở terminal của vendor tương ứng trong worktree của Story (Codex cho 99.2;
**session Claude mới** cho 99.3, không dùng session đang soạn kiến trúc), rồi dán:

```text
Implement Story 99.N by V4 Lite under the owner's recorded autopilot
authorization. Follow CLAUDE.md / AGENTS.md routing: read the canonical V4
pointer first and continue only on IDLE, then use the v4-story-runner skill
and references/autopilot.md. Loop: run autopilot-status with the current HEAD;
on CONTINUE run exactly the named action to its next durable state, then
repeat. Slice B declares executor agy: deliver it per
references/agy-executor.md; you still own the scope gate, checkpoint,
verification and review. Never call record-owner-review, approve the Human
Gate, run complete_story, edit settings, push, or reset/clean/stash. On STOP,
report the reason, HEAD, and the exact owner decision needed.
```

Trong lúc chạy, owner chỉ quan sát và ghi lại:

- mỗi câu hỏi Lead đặt ra (đếm cho điều kiện 1);
- mỗi permission prompt (lỗ hổng allowlist; duyệt nếu lệnh nằm trong phạm vi Story);
- thời gian mỗi slice.

Chỉ trả lời các lần dừng HUMAN của policy. Nếu Lead dừng với lý do khác
`HUMAN_GATE`, chụp lại output và báo Claude chẩn đoán. Đừng tự sửa Plan hay receipt.

## Bước 4: Human Gate

Lead dừng ở `HUMAN_GATE`. Owner xem Story, diff và Done Gate như một Story thật.
Tùy chọn trên branch dùng một lần này: duyệt rồi hoàn tất, để kiểm luôn P2.2 với
Lead thật:

```bash
node .agents/scripts/v4-story-runner.mjs run 99.N --expected-head "$(git rev-parse HEAD)" --approve-exact-scope
node .agents/scripts/v4-story-runner.mjs run 99.N --expected-head "$(git rev-parse HEAD)"
```

Lệnh thứ hai phải trả về `DONE`.

## Bước 5: Thu bằng chứng (Claude làm theo yêu cầu)

- `git log` của branch smoke; trạng thái slice trong Plan: `[verified, reviewed]`.
- Receipt verification của A: `escalation {decision: NO_REVIEW, risk: LOW}`, không có review receipt.
- Receipt implementation của B: `worker` mang ID Orca thật, scope gate `PASS`.
- Receipt review của B: reviewer `{type: lead, vendor, independent: true}`.
- Plan `autopilot.lead_vendor`; finalization receipt; số câu hỏi và permission prompt.
- Ghi kết quả vào dòng G3 trong `README.md`.

## Bước 6: Dọn dẹp (Claude)

Đóng terminal, `orca worktree rm` (lệnh chạy bất đồng bộ, kiểm tra lại), xóa
hai branch smoke, rồi lưu trữ và xóa journal của 99.2/99.3 trong
`.git/noteflow-v4-transactions` và `.git/noteflow-v4-lifecycle`. Không merge,
không push.
