# Worktree Integration Implementation Plan

> **For agentic workers:** Khi human yêu cầu thực thi, dùng `superpowers:executing-plans` để đi lần lượt qua các task. Quyền hạn và routing trong `AGENTS.md` luôn ưu tiên. Không tự khởi chạy worker/subagent, không chuyển sang triển khai Story, không coi tài liệu này là lệnh merge, push hoặc xóa worktree. Các checkbox hiện đều là việc dự kiến.

**Goal:** Hợp nhất phần công việc đã xác định còn thiếu vào `main`, đồng bộ `main` lên remote, bảo toàn dữ liệu chưa commit và thu hồi ba worktree phụ khi đủ điều kiện.

**Architecture:** Dùng `main` làm nhánh tích hợp. Đưa `19c240d` vào bằng fast-forward nếu điều kiện tại thời điểm thực thi còn khớp báo cáo; hai nhánh Story đã tích hợp không cần merge lại. Sao lưu trước, công bố lịch sử đã duyệt, rồi mới thu hồi worktree; bốn nhánh lịch sử chưa rõ nhu cầu tích hợp được giữ nguyên.

**Tech Stack:** Git, PowerShell trên Windows, cơ chế quản lý workspace hiện có của Orca.

**Spec:** Báo cáo điều tra Git do người dùng cung cấp trong yêu cầu ngày 2026-09-27, được chép lại dưới đây. Đây là đầu vào được chấp nhận, không phải kết quả do người lập kế hoạch xác minh.

## Global Constraints

- Yêu cầu hiện tại: chỉ lập kế hoạch, không code và không xác minh lại báo cáo Git.
- Không có lệnh Git, test, merge, push, checkout hay dọn worktree nào được chạy khi lập tài liệu này. Thay đổi duy nhất của lượt lập kế hoạch là tạo tài liệu này.
- Khi thực thi sau này, các kiểm tra sát thao tác ghi chỉ nhằm tránh dùng trạng thái đã thay đổi; không mở lại một đợt điều tra toàn bộ repo.
- Không sửa sản phẩm, policy, test, `.agent-state/`, trạng thái BMAD Story hoặc sprint để làm cho việc tích hợp trông như đã hoàn tất.
- Trước thao tác tích hợp/thu hồi, đọc canonical `.agent-state/active-run.json`. Nếu active, mơ hồ hoặc bị bằng chứng trực tiếp phủ định thì dừng phần thực thi; không tự reconcile hay tiếp quản V3.
- Không force-push, rebase lịch sử đã có, reset hard, clean hàng loạt, force-remove worktree hoặc force-delete branch trong đợt này.
- Các tài nguyên do Orca quản lý phải được thu hồi bằng cơ chế của Orca theo policy áp dụng ở thời điểm thực thi. Không xóa trực tiếp thư mục để thay thế việc thu hồi workspace.
- Git integration không thay thế Human Gate, không xác nhận Story done và không cấp quyền bỏ qua routing V3/V4.

## Đầu vào và phạm vi

| Checkout/nhánh | HEAD theo báo cáo | Tình trạng | Quyết định trong kế hoạch |
| --- | --- | --- | --- |
| Repo chính, `main` | `37eec80` | 49 commit chưa có trên `origin/main`; có untracked và cảnh báo permission denied | Bảo toàn untracked, tích hợp commit đã xác định, push lịch sử `main` |
| `MinhQuang0104/story-1-4-sync` | `f9ff613` | Đã là ancestor của `main`; 8 commit chưa có trên remote; 10 report untracked | Không merge lại; sao lưu report; thu hồi sau khi `main` được công bố |
| `MinhQuang0104/story-2-1-challenge` | `428cc67` | Sạch; đã là ancestor của `main` và `origin/main` | Không merge lại; thu hồi sau điểm kiểm soát chung |
| `v4-inventory-regression-fix` | `19c240d` | Sạch; thêm một commit ngoài `main`; tổng 50 commit chưa có trên remote, gồm 49 commit của `main` | Tích hợp bằng fast-forward nếu quan hệ lịch sử vẫn như báo cáo |

Commit cần đưa vào: `19c240d test(control-plane): isolate live story regressions`.

Các đường dẫn worktree:

- Repo chính: `D:\Workspace\Tu_Hoc\New_Project_My_Note`.
- Story 1.4: `C:\Users\ACER\orca\workspaces\New_Project_My_Note\story-1-4-sync`.
- Story 2.1: `C:\Users\ACER\orca\workspaces\New_Project_My_Note\story-2-1-challenge`.
- Regression: `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\v4-inventory-regression-fix`.

### Những con số không được cộng dồn

- 8 commit của Story 1.4 đã nằm trong 49 commit của `main`.
- 50 commit của nhánh regression đã bao gồm 49 commit của `main`.
- Với snapshot không đổi, lượng lịch sử cần công bố là 49 + 1 = 50 commit, trước các commit tài liệu được tạo khi thực thi.
- Số commit chưa push của bốn nhánh cũ không chứng minh chúng chưa nằm trong `main`, cũng không chứng minh chúng khác nhau về nội dung.

### File và tài nguyên được xử lý

| Tài nguyên | Cách xử lý dự kiến |
| --- | --- |
| `docs/superpowers/plans/2026-09-27-v4-inventory-and-regression-fix.md` | Sao lưu ngoài checkout, sau fast-forward đưa lại để commit tài liệu bằng đường dẫn cụ thể |
| `docs/superpowers/plans/2026-09-27-worktree-integration-plan.md` | Tài liệu hiện tại; sao lưu và đưa vào cùng commit tài liệu khi thực thi |
| `_bmad/scripts/tests/__pycache__/...` | Cache sinh tự động; chỉ dọn đúng các file đã nhận diện khi không còn tiến trình ghi; không commit cache |
| `.agent-reports/workers/implement-story-1-4/` tại worktree Story 1.4 | Lưu 10 report artifact cùng cấu trúc thư mục và thông tin worktree/HEAD bên ngoài worktree trước khi thu hồi |
| Git refs/object history | Lưu bundle chứa các refs hiện có; thêm mốc khôi phục `main` trước tích hợp |
| Source/test/policy | Không lập thay đổi mới; chỉ nhận nội dung đã có trong `19c240d` |

Không tạo thêm worktree chỉ để thực hiện đợt dọn này. Hai tài liệu cần lưu được gom thành một commit tài liệu sau bước fast-forward để giữ đường tích hợp đơn giản.

## Task 1: Chốt cửa sổ thực thi và bảo toàn dữ liệu

**Tài nguyên:** canonical runtime pointer; các refs trong báo cáo; hai tài liệu; cache; 10 report artifact; thư mục backup ngoài tất cả worktree.

**Đầu vào:** snapshot được người dùng cung cấp và lệnh thực thi riêng trong tương lai.

**Đầu ra:** runtime không có xung đột đang hoạt động; điểm khôi phục Git và bản sao untracked đủ để dọn checkout mà không mất dữ liệu.

- [ ] Tạm ngưng tác vụ đang ghi vào các checkout cần thu hồi; đọc runtime pointer như Global Constraints. Nếu có công việc đang chạy thì dừng đợt tích hợp, không tự sửa runtime.
- [ ] Đối chiếu đúng các điều kiện thao tác: repo chính đang ở `main`/`37eec80`, nhánh regression vẫn trỏ `19c240d`, và không phát sinh thay đổi tracked hoặc lỗi truy cập chưa xử lý. Nếu điều kiện khác báo cáo, không tự mở rộng phạm vi.
- [ ] Dùng thư mục backup ngoài checkout: `D:\Workspace\Tu_Hoc\New_Project_My_Note-integration-backup\2026-09-27`. Không ghi đè một bộ backup đã tồn tại; khi trùng tên, tạo một thư mục mới có thời gian thực thi trong tên.
- [ ] Tạo ref khôi phục `backup/worktree-integration-2026-09-27-main` tại `37eec80`; lưu Git bundle bằng `git bundle create` với `--all` vào bộ backup. Không ghi đè ref backup đã tồn tại. Bundle bảo toàn lịch sử có ref nhưng không chứa file untracked.
- [ ] Sao chép riêng hai tài liệu và toàn bộ 10 report artifact vào bộ backup, giữ đường dẫn tương đối. Ghi lại nhánh, HEAD và đường dẫn checkout nguồn. Bao gồm cả cache trong bản sao nếu cần giữ nguyên hiện trạng; cache không phải nguồn để phục hồi sản phẩm.
- [ ] Trước khi bỏ bản gốc, xác nhận bản sao đọc được và khớp nội dung với nguồn. Kiểm tra bộ bundle mới tạo; đây là kiểm tra bản sao lưu, không phải điều tra lại báo cáo.
- [ ] Đưa các tài liệu untracked ra khỏi checkout bằng bản sao lưu đã xác nhận trong thời gian fast-forward; dọn đúng cache đã nhận diện. Chưa thu hồi worktree Story 1.4 ở bước này.
- [ ] Xử lý cảnh báo permission denied theo đúng đường dẫn phát sinh. Nếu còn vùng dữ liệu không đọc được, giữ nguyên vùng đó và dừng thao tác cần đụng đến nó; không dùng quyền cưỡng chế hoặc bỏ qua rồi ghi nhận checkout sạch.

**Điểm kiểm soát:** Có bản sao lịch sử và untracked ngoài các thư mục sẽ bị thu hồi; repo chính sẵn sàng cho thao tác tích hợp. Chỉ có bundle là chưa đủ để xóa worktree chứa report untracked.

## Task 2: Đưa commit regression vào `main`

**Tài nguyên:** `main`, `v4-inventory-regression-fix`, commit `19c240d`.

**Đầu vào:** điểm khôi phục và checkout đã được chuẩn bị ở Task 1.

**Đầu ra:** `main` chứa `19c240d`, không tạo commit merge hoặc bản cherry-pick trùng.

- [ ] Tại repo chính đang ở `main`, dùng lệnh dự kiến `git merge --ff-only 19c240d`.
- [ ] Nếu fast-forward bị từ chối thì dừng task, giữ refs và backup. Không tự đổi sang merge thông thường, rebase hoặc cherry-pick.
- [ ] Ghi nhận mốc tích hợp: với snapshot đầu vào không đổi, `main` lúc này trỏ `19c240d`, chứa 50 commit chưa có trong `origin/main` theo snapshot.
- [ ] Không chạy merge/cherry-pick cho hai nhánh Story; phần lịch sử của chúng đã nằm trong `main` theo báo cáo.

**Điểm kiểm soát:** `main` chứa đúng commit regression. Tên commit `test(...)` không tự chứng minh kiểm thử đã pass.

## Task 3: Hoàn tất tài liệu và điều kiện công bố

**File:** hai tài liệu trong `docs/superpowers/plans/` đã nêu; không sửa source hoặc viết test mới.

**Đầu vào:** mốc tích hợp Task 2, tài liệu đã sao lưu, bằng chứng kiểm thử hiện có của công việc regression.

**Đầu ra:** một candidate `main` có lịch sử và tài liệu được bảo toàn, đủ bằng chứng cho phạm vi công bố.

- [ ] Đưa hai tài liệu từ backup trở lại repo chính. Nếu một đường dẫn đã có nội dung tracked sau tích hợp, giữ cả bản backup và xử lý khác biệt có chủ đích, không ghi đè mù quáng.
- [ ] Đọc bằng chứng đi kèm công việc regression và kế hoạch `2026-09-27-v4-inventory-and-regression-fix.md` khi thực thi. Báo cáo hiện tại không cung cấp nội dung tài liệu, lệnh test hay kết quả test; kế hoạch này không đoán tên lệnh.
- [ ] Với source/test không đổi so với checkpoint, dùng bằng chứng còn hiệu lực mà policy cho phép. Nếu thiếu bằng chứng hoặc policy yêu cầu chạy mới, chạy đúng deterministic checks/regression được công việc đó định nghĩa trước khi push. Ghi command, phạm vi và kết quả thật; nếu không xác định được bộ checks thì dừng ở candidate local.
- [ ] Nếu kiểm thử lỗi, giữ candidate và backup, báo lỗi để xử lý theo routing của repo; không trộn một vòng sửa code vào đợt tích hợp này.
- [ ] Stage riêng hai đường dẫn tài liệu, xem nội dung staged rồi commit với thông điệp `docs: preserve worktree integration plans`. Không dùng `git add .`, không đưa cache hoặc toàn bộ worker reports vào repo theo quán tính.
- [ ] Ghi lại full commit ID của candidate trước khi push. Nếu không có commit khác phát sinh, có một commit tài liệu sau `19c240d`: tổng cộng 51 commit so với `origin/main` trong snapshot ban đầu.

**Điểm kiểm soát:** Phân biệt rõ “Git đã tích hợp” với “đủ bằng chứng để công bố”. Không đánh dấu Story done hoặc tạo Human approval thay cho người dùng.

## Task 4: Đồng bộ `main` lên remote

**Tài nguyên:** local `main`, remote `origin/main`.

**Đầu vào:** candidate và bằng chứng Task 3.

**Đầu ra:** remote chứa candidate đã chọn, bao gồm cả phần lịch sử Story 1.4 chưa được push.

- [ ] Khi thực thi, fetch remote một lần để tránh push theo ref đã lỗi thời. Đây là kiểm tra điều kiện công bố tại thời điểm ghi; hiện tại chưa chạy.
- [ ] Chỉ tiếp tục khi tip remote hiện hành là ancestor của candidate và cơ chế bảo vệ nhánh cho phép cách công bố đã chọn. Nếu remote phân kỳ hoặc đòi PR thì giữ candidate, đi theo cơ chế review của repo; không force-push hay tự sửa lịch sử.
- [ ] Công bố candidate bằng push thông thường, chỉ nhắm `main`; lệnh dự kiến khi được phép push trực tiếp là `git push --no-follow-tags origin main:main`.
- [ ] Lưu ý phạm vi: push này công bố toàn bộ 49 commit cũ của `main`, thêm `19c240d` và commit tài liệu; không phải chỉ công bố riêng commit regression. Nếu phần lịch sử đó chưa được phép công bố, dừng trước push.
- [ ] Xác nhận remote đã nhận đúng candidate sau thao tác. Khi phản hồi mạng không rõ ràng, kiểm tra remote thay vì giả định thành công hoặc thất bại.

**Điểm kiểm soát:** Chỉ bắt đầu thu hồi worktree khi remote đã chứa candidate và dữ liệu ngoài Git đã được bảo toàn. Không cần push riêng hai nhánh Story để đưa nội dung của chúng lên `main`.

## Task 5: Thu hồi ba worktree phụ và nhánh đã tích hợp

**Tài nguyên:** ba checkout phụ và ba nhánh tương ứng.

**Đầu vào:** candidate đã được công bố, bộ backup, trạng thái không có tác vụ đang chạy.

**Đầu ra:** còn repo chính làm checkout hoạt động cho phạm vi công việc này.

- [ ] Thu hồi Story 2.1 trước: worktree đã sạch và tích hợp theo báo cáo. Đóng/thu hồi workspace qua Orca theo policy áp dụng; không thao tác trực tiếp trên thư mục để bỏ qua metadata của Orca.
- [ ] Thu hồi Story 1.4 tiếp theo: trước hết bảo đảm cả 10 report vẫn có bản sao ngoài worktree. Chỉ bỏ các bản gốc đã được lưu khi chuẩn bị thu hồi; không dùng force để bỏ qua untracked. Thu hồi workspace qua Orca.
- [ ] Thu hồi native worktree regression bằng cơ chế Git. Lệnh dự kiến: `git worktree remove "D:/Workspace/Tu_Hoc/New_Project_My_Note/.worktrees/v4-inventory-regression-fix"`. Không thêm `--force`.
- [ ] Sau khi không còn checkout sở hữu từng nhánh, xóa local branch đã tích hợp bằng `git branch -d` nếu cơ chế thu hồi chưa làm việc đó: `MinhQuang0104/story-2-1-challenge`, `MinhQuang0104/story-1-4-sync`, `v4-inventory-regression-fix`.
- [ ] Nếu Git từ chối xóa nhánh/worktree, giữ lại và ghi lý do; không nâng lên `-D` hoặc `--force`.
- [ ] Giữ ref backup và bộ backup ngoài repo qua một đợt sử dụng bình thường sau tích hợp. Không xóa backup cùng lượt thu hồi này. Không xóa remote branch trong phạm vi kế hoạch.

**Điểm kiểm soát:** Không còn ba worktree phụ khi mọi bước thu hồi đã thành công; mọi ngoại lệ phải được ghi là còn tồn tại, không báo đã dọn sạch toàn bộ.

## Task 6: Giữ riêng bốn nhánh lịch sử và bàn giao

**Tài nguyên:** bốn local branch không gắn worktree.

| Nhánh | Commit chưa push theo báo cáo | Xử lý trong đợt này |
| --- | ---: | --- |
| `chore/agent-architecture-v3-foundation` | 1 | Giữ nguyên ref, có trong bundle, chưa merge hoặc xóa |
| `chore/agent-architecture-v3-live-failover-poc` | 4 | Giữ nguyên ref, có trong bundle, chưa merge hoặc xóa |
| `chore/agent-architecture-v3-orca-runtime` | 2 | Giữ nguyên ref, có trong bundle, chưa merge hoặc xóa |
| `chore/agent-architecture-v3-runtime-reconciliation` | 3 | Giữ nguyên ref, có trong bundle, chưa merge hoặc xóa |

- [ ] Ghi bốn nhánh trên là phạm vi còn bảo lưu. Không cộng 1 + 4 + 2 + 3 vào lượng công việc cần merge.
- [ ] Nếu sau này cần xử lý cả các nhánh này, làm một đợt riêng để xác định thông tin chưa có trong báo cáo: nội dung còn cần thiết hay đã được thay thế/tích hợp theo cách khác. Không merge hàng loạt các thay đổi kiến trúc V3 vào main hiện tại.
- [ ] Trong đợt riêng đó, phân loại rõ: đã nằm trong lịch sử thì có thể thu hồi nhánh; nội dung tương đương/đã bị thay thế thì giữ bằng chứng lưu trữ trước khi đề xuất xóa; còn thay đổi cần dùng thì lập phạm vi tích hợp và routing riêng. Bước này chưa được thực hiện hay được giả định kết quả.
- [ ] Bàn giao full commit ID đã công bố, vị trí backup, danh sách worktree/nhánh đã thu hồi, các nhánh còn giữ, cùng kết quả kiểm tra thực sự đã chạy.

**Điểm kiểm soát:** Hoàn tất tích hợp ba worktree không được diễn đạt thành “mọi local branch đều đã được tích hợp”.

## Xử lý gián đoạn và khôi phục

- Trước push: giữ `main`, các refs và backup tại trạng thái đang có. Ref `backup/worktree-integration-2026-09-27-main` và bundle cho phép lấy lại lịch sử trước tích hợp; không tự reset hard để quay lại.
- Sau push: nếu cần đảo thay đổi, đề xuất revert có review trên lịch sử hiện có; không ép remote quay về commit cũ.
- Nếu mới thu hồi được một phần worktree: tiếp tục dựa trên danh sách đã ghi, chỉ thao tác với tài nguyên còn tồn tại. Không lặp lại lệnh xóa theo giả định.
- Nếu cần khôi phục report/tài liệu: dùng bản sao ngoài checkout. Git bundle không khôi phục được file vốn chưa tracked.
- Nếu cần mở lại worktree: dùng ref còn giữ hoặc ref từ bundle; với workspace Orca, đi qua cơ chế của Orca để metadata và checkout nhất quán.

## Tiêu chí hoàn tất khi thực thi

- [ ] `main` chứa `19c240d` và nội dung của hai nhánh Story đã được báo cáo là tích hợp.
- [ ] Candidate đã được công bố lên `origin/main` bằng cơ chế được repo cho phép.
- [ ] Hai tài liệu được lưu có chủ đích; cache không bị commit; 10 report có bản sao đọc được ngoài worktree.
- [ ] Ba worktree phụ đã được thu hồi, hoặc từng ngoại lệ còn giữ được nêu rõ.
- [ ] Ba nhánh tương ứng chỉ được xóa sau khi thu hồi checkout và bảo toàn lịch sử.
- [ ] Bốn nhánh lịch sử còn được giữ và có trong backup; không có khẳng định thiếu căn cứ rằng chúng đã được tích hợp.
- [ ] Không có thay đổi ngoài phạm vi vào code, policy, runtime hay lifecycle BMAD.

**Tình trạng tại thời điểm viết:** Chỉ lập kế hoạch. Chưa chạy bất kỳ bước thực thi hoặc kiểm chứng Git/test nào ở trên.
