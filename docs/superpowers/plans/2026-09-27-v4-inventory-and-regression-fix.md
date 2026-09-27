# Plan: sửa Git inventory và hai regression tests của V4

**Trạng thái:** chỉ lập kế hoạch theo yêu cầu; chưa sửa code/tests, .gitignore hoặc ACL.

**Goal:** Git inventory hoàn chỉnh trong môi trường thực thi thường; full control-plane regression không còn hai test phụ thuộc trạng thái Story 2.3 thật; `start_story check 1.5` trả READY sau khi thay đổi được commit.

**Architecture:** giữ nguyên fail-closed của start helper và Human Gate. Cache Python được xử lý như artifact sinh tự động; lifecycle tests dùng fixture có trạng thái cố định trong repository Git tạm. Không sửa product code, không đổi lifecycle Story 2.3, không chạy `start_story apply` hoặc implementation Story 1.5.

**Tech stack:** Windows/PowerShell, Git, Node 24.21.0, node:test; ACL Windows chỉ đụng tới khi chẩn đoán chứng minh cần thiết.

**Spec:** AGENTS.md; .agents/docs/v4-artifact-contract.md; docs/superpowers/plans/2026-09-26-v4-fresh-story-start.md.

## Bằng chứng đã kiểm tra ngày 2026-09-27

- HEAD hiện tại: `37eec80ce1945df898edb58517c5a8e89c65bcb2`; có commit `f3398b4` và `37eec80`.
- Canonical `.agent-state/active-run.json`: IDLE; Node `v24.21.0`.
- `git status --short` báo không đọc được `_bmad/scripts/.pytest_cache/`; Get-ChildItem và Get-Acl đều bị từ chối trong phiên kiểm tra này.
- `whoami` của phiên kiểm tra: `desktop-enmq292\codexsandboxoffline`; không mặc định đây là cùng identity/token với terminal VSCode của người dùng.
- `.pytest_cache` là directory, không có LinkType/Target được báo từ Get-Item. Git không track các path cache được kiểm tra; .gitignore hiện chưa có rule cho hai cache Python này.
- Hai tests được chạy focused và đều FAIL: `canonical schema-v2 Story 2.3 remains readable before finalization` tại check-story-plan.test.mjs:91; `actual Story 2.3 is READY with disclosures at the current entry state` tại check-story-finalization.test.mjs:505.
- Test thứ nhất kỳ vọng in-progress/finalize_story nhưng dữ liệu thật là done/complete/next_action null. Test thứ hai gọi finalization gate cho Story đã done/có Human approval; helper từ chối entry state này. Không được sửa Story thật để đáp ứng kỳ vọng cũ.
- `git show 90007d6:.../story-2-3-plan.md` đã có done/complete; hai test files và hai helper tương ứng không đổi giữa 90007d6 và 37eec80. Đây là bằng chứng source về lỗi baseline; vẫn chạy đối chiếu hai tests tại baseline trước khi ghi nhận thực nghiệm baseline PASS/FAIL.

## Ràng buộc toàn cục

- Chỉ triển khai plan khi có yêu cầu thực thi mới. Plan này không tự cấp quyền sửa ACL, xóa cache, chạy start hoặc triển khai Story.
- Trước thay đổi control-plane: kiểm tra pointer canonical IDLE; giữ nguyên V3 runtime.
- Không xóa cache/user files; không reset quyền cả repository, không grant Everyone Full Control, không tắt sandbox hoặc nuốt stderr của Git.
- Không sửa Story/Plan/sprint/receipts/Human approval của Story 2.3 để làm tests xanh.
- Không dùng `test.skip`, mở rộng assertion để chấp nhận mọi trạng thái, hoặc chỉ đổi expectation từ in-progress sang done trên dữ liệu live.
- Sau mỗi nhóm thay đổi, chạy checks trực tiếp; chỉ chạy full regression ở gate cuối hoặc khi failure mới cần điều tra.

## Task 1 — Phân biệt quyền hệ điều hành với identity/sandbox

- [ ] Chạy các lệnh sau trong đúng terminal/agent sẽ chạy helper; ghi stdout, stderr và exit code:

```powershell
whoami
node --version
git rev-parse HEAD
Get-Item -Force -LiteralPath 'D:\Workspace\Tu_Hoc\New_Project_My_Note\_bmad\scripts\.pytest_cache'
Get-ChildItem -Force -LiteralPath 'D:\Workspace\Tu_Hoc\New_Project_My_Note\_bmad\scripts\.pytest_cache' -ErrorAction Stop
Get-Acl -LiteralPath 'D:\Workspace\Tu_Hoc\New_Project_My_Note\_bmad\scripts\.pytest_cache' | Format-List Owner,AccessToString
```

- [ ] So sánh với PowerShell thường của người dùng. Chỉ nếu cần đọc/sửa ACL, mở riêng PowerShell elevated và chạy lại phần chẩn đoán. Không coi việc VSCode Admin mở được thư mục là đủ để xác nhận agent đã đọc được.
- [ ] Nếu terminal thường đọc được nhưng agent không đọc được: xác minh account/SID/token và sandbox policy. Không tự đổi ACL cho tài khoản đoán từ tên user; không bypass policy bằng chạy agent toàn quyền.
- [ ] Nếu cả terminal thường cũng bị từ chối: quản trị viên kiểm tra owner, inheritance và ACE deny/allow trên đúng folder; sao lưu DACL/ghi owner hiện tại trước khi sửa. Áp dụng quyền tối thiểu cần cho đúng identity: Git cần đọc/liệt kê; pytest có thể cần Modify để ghi cache. Chỉ bật lại inheritance nếu quyền parent được kiểm tra phù hợp. Chỉ xử lý deny cụ thể nếu chứng minh đó là cấu hình sai; không reset quyền toàn repo.
- [ ] Chạy lại phép đọc bằng môi trường thường và agent sau khi sửa ACL; elevated success chỉ là bước chẩn đoán. Nếu quyền bị policy sandbox chặn, ghi nguyên nhân còn lại và dùng cấu hình được hỗ trợ, không giả báo đã sửa.

**Exit criterion:** biết chính xác context nào bị chặn; ACL sửa được kiểm chứng ở process thực tế nếu cache cần đọc/ghi. Chạy Admin không phải tiêu chí nghiệm thu độc lập.

## Task 2 — Loại cache sinh tự động khỏi Git inventory đúng phạm vi

**File dự kiến sửa:** `.gitignore`. **Helper giữ nguyên:** `.agents/scripts/start-story.mjs`.

- [ ] Từ context đọc được folder, xác nhận nội dung là pytest cache, không chứa tài liệu/source người dùng. Kiểm tra không có file tracked bên dưới:

```powershell
git ls-files -- _bmad/scripts/.pytest_cache _bmad/scripts/tests/__pycache__
```

- [ ] Thêm đúng hai rule cho các directory đã xác nhận:

```gitignore
# Generated Python test caches
/_bmad/scripts/.pytest_cache/
/_bmad/scripts/tests/__pycache__/
```

- [ ] Giữ nguyên nội dung cache. Đây là chính sách Git đối với dữ liệu sinh tự động, không sửa helper để bỏ qua warning; mọi lỗi inventory khác vẫn phải fail-closed. Không ignore source, `.agents`, Story/Plan, sprint hoặc receipts.
- [ ] Kiểm tra rule áp dụng và inventory hết warning trong môi trường agent thường:

```powershell
git check-ignore --no-index -v -- _bmad/scripts/.pytest_cache/ _bmad/scripts/tests/__pycache__/
git status --porcelain=v1 --untracked-files=all
git ls-files --others --exclude-standard
```

- [ ] Nếu Git vẫn có stderr hoặc exit khác 0, điều tra path cụ thể thay vì thêm exclusion rộng. `--exclude-unrelated` không chữa được directory không thể enumerate vì chưa có danh sách file và hash đầy đủ.

**Exit criterion:** hai cache được ignore bằng rule chính xác; Git enumeration exit 0 và stderr rỗng trong môi trường chạy helper. ACL cache có thể vẫn cần Task 1 để pytest hoạt động; Git không cần đọc nội dung cache đã được loại đúng chính sách.

## Task 3 — Chứng minh baseline và sửa tests theo fixture

**Files dự kiến sửa:** `.agents/scripts/check-story-plan.test.mjs`, `.agents/scripts/check-story-finalization.test.mjs`; thêm fixture nhỏ dưới `.agents/scripts/fixtures/` chỉ khi không thể tái dùng fixture hiện có mà giữ ý nghĩa tests.

- [ ] Tái hiện focused tại HEAD hiện hành:

```powershell
node --test --test-name-pattern='canonical schema-v2 Story 2.3|actual Story 2.3' .agents/scripts/check-story-plan.test.mjs .agents/scripts/check-story-finalization.test.mjs
```

- [ ] Tạo checkout tạm riêng ở commit `90007d6` bằng cơ chế worktree được cho phép; không checkout/reset main. Chạy cùng hai tests trên Node 24.21.0, ghi cùng assertion failure và trạng thái done/complete. Dọn checkout tạm chỉ sau khi xác minh đúng absolute path do lần kiểm tra này tạo. Không sửa snapshot baseline.
- [ ] Trong check-story-plan.test.mjs, thay test phụ thuộc Story 2.3 thật bằng schema-v2 fixture riêng: Story chuẩn marked blocks, Plan digest đúng, sprint in-progress, slices/receipts hợp lệ theo assertion và next_action finalize_story. Kiểm tra valid/READY, lifecycle và action trên chính fixture. Bỏ biến `realRoot`/`real` nếu hết dùng; không còn đọc Story 2.3 ngay lúc import suite.
- [ ] Bổ sung hoặc tái dùng test fixture cho review/done để bảo vệ khả năng đọc terminal state. Test done phải có approval/receipt hợp lệ theo contract; tránh dựng một Plan done giả không đủ evidence. Ưu tiên helper fixture có sẵn khi đáp ứng state cần kiểm tra.
- [ ] Trong check-story-finalization.test.mjs, thay test `actual Story 2.3...` bằng `withFixture(...)` sẵn có. Tạo fixture in-progress, reviewed slices, AC evidence đầy đủ và canonical INCOMPLETE/NOT_APPLICABLE để yêu cầu READY_WITH_DISCLOSURES; kiểm tra human_gate_required=true, human_approval_present=false, target review.
- [ ] Assert scope/AC/slices dựa trên dữ liệu fixture định nghĩa trong test, không hard-code 24 paths của Story thật hoặc tính expected bằng chính output helper. Giữ coverage disclosure/Human Gate. Một fixture đã done không được coi là entry hợp lệ để finalize lại.
- [ ] Chạy hai test files và các suite consumer:

```powershell
node --test .agents/scripts/check-story-plan.test.mjs .agents/scripts/check-story-finalization.test.mjs
node --test .agents/scripts/dual-schema.test.mjs .agents/scripts/finalize-story.test.mjs .agents/scripts/check-story-completion.test.mjs .agents/scripts/start-story.test.mjs .agents/scripts/v4-story-runner.test.mjs
```

**Exit criterion:** tests không còn phụ thuộc lifecycle Story 2.3 thật, giữ nguyên các assertions contract cần bảo vệ, không skip; Story 2.3/receipts/Human approval không đổi.

## Task 4 — Gate cuối và bàn giao

- [ ] Chạy `node --test .agents/scripts/*.test.mjs`. Yêu cầu tất cả tests pass; tổng số có thể thay đổi nếu bổ sung coverage, không ép con số 340 bằng cách bỏ tests.
- [ ] Kiểm tra diff và `git diff --check`; xác nhận chỉ test/fixture, .gitignore và tài liệu evidence thuộc phạm vi. Không cần chạy lại frontend build/unit nếu frontend/dependencies không đổi.
- [ ] Commit chính xác các file đã sửa và plan/evidence cần lưu. Không dùng broad add; không đưa cache vào commit. Phải commit trước gate start vì helper từ chối tracked changes/uncommitted artifacts.
- [ ] Kiểm tra pointer canonical vẫn IDLE, Git inventory sạch và chạy read-only gate:

```powershell
$taskHead = git rev-parse HEAD
node .agents/scripts/check-story-plan.mjs check 1.5
node .agents/scripts/start-story.mjs check 1.5 --expected-head $taskHead
```

- [ ] Yêu cầu Plan valid và start check READY; không truyền fingerprint để apply. Kiểm tra Story/Plan/sprint 1.5 vẫn ở trạng thái trước start và không có checkpoint mới.
- [ ] Bàn giao commit SHA, số tests pass, baseline comparison, cách xử lý cache/ACL, JSON readiness và giới hạn còn lại nếu có. Nếu gate chưa READY, ghi blocker thật và dừng; không hạ gate.

## Nguồn tham khảo quyền Windows

- Microsoft UAC: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works
- Microsoft icacls (xem/sao lưu/cập nhật DACL): https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls

Elevation thay đổi token của process chạy elevated; không bảo đảm process khác dùng account hoặc sandbox token riêng có cùng quyền. Quyền truy cập thực tế phải kiểm chứng trên chính process chạy Git/helper.
