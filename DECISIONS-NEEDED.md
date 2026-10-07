# DECISIONS-NEEDED

Tài liệu này là Phần C của remediation plan `full-project-audit-2026-10-06`.
Các mục dưới đây chưa được tự ý quyết định hay triển khai. “Luna” là đề xuất
kỹ thuật để người có thẩm quyền cân nhắc; đây không phải bằng chứng đã có
Human Gate hoặc đã đạt acceptance.

## A-01 (+A-02) — Bằng chứng screen reader và cảnh báo unload

**Câu hỏi:** Có thu bằng chứng thủ công trên screen reader thật (Story 1.6
AC4) và cảnh báo unload trên trình duyệt thật (Story 1.5 AC4), hay sửa AC và
ghi disposition chính thức cho các phần không thể tái hiện tự động?

**Lựa chọn và hệ quả:**

1. Giữ nguyên AC và thu đủ hai bằng chứng trên môi trường thật. Mức đảm bảo
   cao nhất, nhưng cần người kiểm tra, môi trường trình duyệt/screen reader và
   artifact có danh tính; chi phí thời gian cao hơn.
2. Sửa AC thành các điều kiện tự động/keyboard có thể kiểm chứng và ghi
   disposition cho phần manual. Phạm vi acceptance thay đổi; AC cũ không được
   tuyên bố đã đạt chỉ bằng test mới.
3. Chấp nhận source/test hiện tại là đủ. Không tốn thêm môi trường, nhưng giữ
   lại khoảng trống về assistive technology và browser lifecycle.

**Đề xuất của Luna:** Chọn 1; nếu môi trường không sẵn sàng thì chọn 2 bằng
quyết định chính thức, ghi rõ phần chưa được kiểm chứng. Không chọn 3 để đóng
finding.

**Gói bị chặn:** Không chặn các commit A1–A8 đã sửa; chặn việc đóng hoàn toàn
nghĩa vụ acceptance lịch sử A-01/A-02 và mọi báo cáo tuyên bố đủ manual evidence.

## A-03 — Ranh giới acceptance giữa Story 2.3 và Story 2.2

**Câu hỏi:** Khi journal và completion cùng tham chiếu một daily record, phần
nào thuộc acceptance của Story 2.3, phần nào thuộc Story 2.2, và invariant
revision/epoch nào là contract chung?

**Lựa chọn và hệ quả:**

1. Một record chung, hai Story cùng sở hữu các trường khác nhau. Tránh dữ liệu
   trùng nhưng tạo coupling và cần ma trận ownership/transaction rõ ràng.
2. Tách journal record và completion record, chỉ liên kết bằng immutable
   reference. Ownership dễ kiểm chứng hơn nhưng thêm dữ liệu và đồng bộ.
3. Để Story 2.3 bao trùm daily record, Story 2.2 chỉ tiêu thụ output. Ít
   thay đổi schema hơn nhưng acceptance của 2.2 phụ thuộc lifecycle của 2.3.

**Đề xuất của Luna:** Chọn 1 nếu sản phẩm bắt buộc một daily record; ban hành
ma trận field ownership và invariant trước khi mở rộng writer. Nếu không bắt
buộc record chung, chọn 2 để giảm coupling.

**Gói bị chặn:** Chặn mọi gói tích hợp/acceptance tiếp theo của Story 2.2/2.3
liên quan daily record; không chặn các remediation A hiện tại.

## C-04 — Chuẩn hóa khoảng trắng của journal

**Câu hỏi:** Journal giữ nguyên khoảng trắng đầu/cuối hay cắt khoảng trắng ở
middleware `TrimStrings` hiện đang áp dụng?

**Lựa chọn và hệ quả:**

1. Giữ nguyên text journal end-to-end. Bảo toàn nội dung người dùng, nhưng
   cần ngoại lệ middleware và contract/test cho whitespace.
2. Trim ở boundary API. Dữ liệu canonical đồng nhất hơn, nhưng thay đổi nội
   dung đã nhập và có thể làm lệch digest/revision.
3. Từ chối text có khoảng trắng đầu/cuối. Invariant rõ, nhưng UX kém hơn và
   là breaking validation.

**Đề xuất của Luna:** Chọn 1 cho journal; whitespace là nội dung người dùng,
không tự áp dụng normalization ngầm. Nếu chọn 2 hoặc 3, phải có migration và
contract versioning.

**Gói bị chặn:** Chặn remediation riêng cho C-04, OpenAPI/request tests và
migration dữ liệu liên quan whitespace; không chặn A5 hiện đã giới hạn NUL.

## C-05 — Reprovision owner A → B → A

**Câu hỏi:** Khi owner A được reprovision sau khi từng chuyển sang B, giữ lại
dataset cùng revision/epoch hay retire dataset cũ và tạo epoch mới?

**Lựa chọn và hệ quả:**

1. Giữ dataset và gắn lại cho A. Bảo toàn lịch sử và giảm migration, nhưng
   cần chứng minh không lộ dữ liệu B và xử lý revision/epoch tiếp tục.
2. Retire dataset cũ, tạo dataset/epoch mới cho A. Cách ly tốt hơn, nhưng mất
   continuity hoặc cần cơ chế archive/migrate và xử lý replay.
3. Từ chối reprovision A nếu dataset cũ còn tồn tại. An toàn đơn giản hơn,
   nhưng giảm khả năng vận hành và cần quy trình hỗ trợ thủ công.

**Đề xuất của Luna:** Chưa chọn thay người dùng. Nếu ưu tiên continuity, chọn
1 kèm owner-scoped authorization, monotonic epoch và test A→B→A; nếu ưu tiên
cách ly, chọn 2 và ghi rõ archive/retention.

**Gói bị chặn:** Chặn remediation reprovision/migration, concurrency và
data-retention follow-up; không chặn C-01/C-03 đã hoàn tất.

## D-04 — OpenAPI và CSRF Sanctum/419

**Câu hỏi:** Contract OpenAPI có bao gồm flow CSRF của Sanctum và response 419,
hay chỉ mô tả API contract sau khi browser đã bootstrap CSRF?

**Lựa chọn và hệ quả:**

1. Mô tả cả bootstrap CSRF và 419 trong OpenAPI. Client/contract coverage đầy
   đủ hơn, nhưng spec phụ thuộc deployment/auth middleware và tăng bề mặt API.
2. Giữ OpenAPI cho API resource/auth response, ghi flow CSRF/419 trong tài liệu
   browser/deployment riêng. Spec ổn định hơn nhưng cần liên kết tài liệu rõ.
3. Bỏ qua 419. Spec ngắn hơn nhưng consumer không có contract cho lỗi có thể
   gặp thực tế.

**Đề xuất của Luna:** Chọn 2, đồng thời ghi rõ tài liệu CSRF là một phần bắt
buộc của integration contract; chuyển sang 1 nếu frontend public API cần gọi
bootstrap endpoint trực tiếp.

**Gói bị chặn:** Chặn D-04 contract/OpenAPI và parser/negative test liên quan;
không chặn D-01..D-03, D-05..D-06 đã làm.

## G-01 — Ownership TLS và security headers ở production edge

**Câu hỏi:** Ai là owner và acceptance authority cho TLS termination, HSTS,
security headers và cấu hình edge production?

**Lựa chọn và hệ quả:**

1. App/backend owner. Kiểm tra gần code hơn nhưng không kiểm soát được proxy/CDN
   cuối cùng.
2. Platform/edge owner. Có quyền kiểm tra đúng boundary production, nhưng cần
   artifact/config access và phối hợp ngoài repository.
3. Shared ownership với checklist và test từ origin đến edge. Coverage tốt
   nhất nhưng cần phân định trách nhiệm và môi trường staging.

**Đề xuất của Luna:** Chọn 3: platform chịu trách nhiệm edge, app chịu
origin-level headers, và một checklist acceptance có owner/sign-off cho từng
header/TLS property.

**Gói bị chặn:** Chặn hardening production/edge và security acceptance G-01;
không chặn các check local/deployment-config đã chạy.

## H-01 — Mức đảm bảo của Human Gate

**Câu hỏi:** Human Gate có thể dựa trên ý định trong hội thoại hay cần bằng
chứng approval được xác thực bởi actor/hệ thống bên ngoài?

**Lựa chọn và hệ quả:**

1. Tin vào hội thoại. Workflow đơn giản, nhưng agent có thể tự tạo payload
   mang nhãn human và không chứng minh được actor.
2. Bắt buộc approval ngoài hệ thống, có actor identity, timestamp và scope
   binding. Assurance mạnh hơn nhưng cần provider/UX và credential boundary.
3. Hybrid: hội thoại nêu ý định, external evidence cấp authority; thiếu
   evidence thì chỉ preview/blocked. An toàn nhưng phức tạp hơn lựa chọn 1.

**Đề xuất của Luna:** Chọn 3. Không coi `approve_exact_scope` do cùng process
   tạo ra là bằng chứng độc lập; cho tới khi có actor contract thì không tuyên
   bố Human Gate đã được xác thực.

**Gói bị chặn:** Chặn các đề xuất B6 liên quan approval assurance/H-05 và mọi
   thay đổi completion authority; không chặn B1–B5 vì các gói đó không mutate
   V3 runtime hay tự quyết định external actor.

## H-02 — Cơ chế đặt chỗ chung V3/V4

**Câu hỏi:** V3 và V4 dùng reservation/ownership marker chung hay chỉ áp dụng
quy tắc chống overlap giữa hai lane?

**Lựa chọn và hệ quả:**

1. Reservation chung, V3 và V4 cùng đọc/ghi marker. Chống overlap rõ nhưng
   cần thay đổi V3 runtime và giao thức tương thích.
2. Quy tắc disjoint scope + kiểm tra conflict tại boundary. Ít coupling hơn,
   nhưng cần chứng minh mọi path chung đều được nhận diện.
3. Lock/lease trung gian do orchestration layer quản lý. Có lifecycle/expiry,
   nhưng thêm authority và failure/recovery surface.

**Đề xuất của Luna:** Chưa triển khai trước khi chọn 1/2/3. Luna nghiêng về 2
cho V4 Lite nếu có inventory path đầy đủ; chọn 1 nếu V3 cần biết trực tiếp
reservation để bảo vệ shared Story.

**Gói bị chặn:** Chặn H-02 và mọi thay đổi V3/V4 co-location, gồm phần bị loại
trong B6; không tự mutate `.agent-state`.

## H-10 — Phạm vi yêu cầu “worktree sạch”

**Câu hỏi:** Lifecycle transaction yêu cầu sạch toàn bộ worktree hay chỉ sạch
đúng scope đã bind?

**Lựa chọn và hệ quả:**

1. Sạch toàn bộ worktree. Dễ chứng minh và an toàn với hook/index, nhưng một
   tài liệu unrelated của user có thể chặn lifecycle.
2. Sạch theo scope đã bind, giữ unrelated changes. UX tốt hơn, nhưng phải
   chứng minh exact path/index/HEAD/hook và không staging nhầm dữ liệu.
3. Cho caller chọn mỗi invocation. Linh hoạt, nhưng làm yếu tính deterministic
   và dễ biến exclusion thành bypass.

**Đề xuất của Luna:** Chọn 2 với scope digest, exact staging, index/hook guards
và explicit unrelated exclusions; không cho caller hạ guard hoặc biến unknown
thành clean. Nếu chưa có các invariant đó, tạm dùng 1.

**Gói bị chặn:** Chặn quyết định/policy follow-up H-10 và mọi nới lỏng
whole-worktree guard trong H-05/H-06/H-11/I-02; B2 hiện vẫn giữ admission/lock
contract và không tự nới scope.

## Quy trình sau khi có quyết định

Người có thẩm quyền cần ghi lựa chọn, owner, ngày hiệu lực và artifact/AC bị
ảnh hưởng cho từng ID. Chỉ sau đó mới mở gói bị chặn tương ứng; các gói B6 và
H-02 không được suy ra là đã được phê duyệt từ tài liệu này.
