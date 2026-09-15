# NoteFlow — Product Requirements Document

- **Phiên bản tài liệu:** 1.1.
- **Ngày tạo:** 2026-09-11.
- **Ngày cập nhật và chốt baseline:** 2026-09-12.
- **Trạng thái:** Đã được chủ sản phẩm phê duyệt làm baseline chính thức cho MVP v1; ba phương án xử lý FAIL đã được duyệt, các WARNING còn lại được chấp nhận tại baseline này.
- **Product Owner:** Chủ sản phẩm NoteFlow.
- **Nguồn phạm vi:** [Project Brief v1.3](project-brief.md), các khuyến nghị Q1–Q12 và ba phương án xử lý FAIL được chủ sản phẩm duyệt ngày 2026-09-12.
- **Ngôn ngữ:** Tiếng Việt.
- **Phạm vi tài liệu:** Yêu cầu sản phẩm và nghiệm thu MVP; không quyết định công nghệ, architecture, mô hình dữ liệu hoặc kế hoạch code.

PRD v1.1 là baseline chính thức của MVP v1. Project Brief v1.3 là tài liệu đầu vào; khi có khác biệt do các quyết định review mới được duyệt, PRD này là căn cứ áp dụng. Các ghi chú về điểm dừng trong brief thuộc giai đoạn trước. Việc phê duyệt baseline không phải yêu cầu bắt đầu code hoặc thiết kế architecture trong lần cập nhật này.

Các FR, NFR và Epic dùng ID duy nhất, ổn định trong PRD. Mỗi FR có một Epic chịu trách nhiệm chính và được đối chiếu với tiêu chí nghiệm thu ở mục 11. Các quyết định xử lý FAIL được ghi tại mục 13.3; các WARNING được chấp nhận tại mục 13.4, không chặn việc chốt baseline và không tự được diễn giải thành tính năng hoặc ngưỡng đã duyệt. Thay đổi baseline sau này phải được ghi nhận bằng quyết định sản phẩm và phiên bản tài liệu mới.

## 1. Product Overview

NoteFlow là ứng dụng web cá nhân giúp người dùng duy trì mục tiêu theo tuần, lưu kiến thức trong những cuốn vở số và quản lý sự kiện theo ngày giờ trên laptop lẫn điện thoại.

Challenge là trọng tâm và lý do quay lại thường xuyên. Người dùng đặt mục tiêu từ 1 đến 7 ngày mỗi tuần, tự chọn ngày thực hiện, đánh dấu Done nhanh và có thể ghi bù khi quên ghi nhận. Nhật ký là tùy chọn. Ghi chú hỗ trợ lưu và tìm lại kiến thức; lịch cung cấp góc nhìn thời gian cho sự kiện và những ngày đã hoàn thành challenge.

MVP phục vụ một tài khoản cá nhân của chủ sản phẩm, sử dụng trực tuyến, với thứ tự ưu tiên **Challenge → Ghi chú → Lịch cá nhân**. MVP vẫn bao gồm cả ba mảng, màn hình Hôm nay, đồng bộ giữa thiết bị và xuất/nhập sao lưu.

### 1.1. Vấn đề cần giải quyết

- Khó biết tiến độ thực hiện mục tiêu trong tuần và số ngày còn thiếu.
- Streak theo ngày không phù hợp với mục tiêu chỉ cần thực hiện vài ngày mỗi tuần.
- Quên bấm Done hoặc đánh dấu nhầm làm lịch sử không phản ánh đúng thực tế.
- Bắt buộc viết nhật ký làm tăng công sức ghi nhận hằng ngày.
- Ghi chú khó tổ chức và tìm lại khi số lượng tăng.
- Sự kiện và dữ liệu cá nhân cần dùng nhất quán trên laptop và điện thoại.

### 1.2. Thuật ngữ sản phẩm

| Thuật ngữ | Định nghĩa |
|---|---|
| Challenge N/7 | Mục tiêu thực hiện trong N ngày khác nhau mỗi tuần; N là số nguyên từ 1 đến 7. |
| Done | Ghi nhận người dùng đã thực hiện challenge trong một ngày; không xác thực chất lượng hay khối lượng hoạt động. |
| Tiến độ tuần | Số ngày đã Done trong tuần trên mục tiêu của tuần đó, ví dụ 2/3 hoặc 4/3 ngày. |
| Streak tuần | Số tuần liên tiếp đạt mục tiêu, áp dụng cho challenge 1–6/7. |
| Streak ngày | Số ngày liên tiếp Done, áp dụng cho challenge 7/7. |
| Tuần khởi động | Phần tuần đầu khi ngày bắt đầu không phải thứ Hai; lưu hoạt động nhưng chưa tính streak. |
| Ngày/tuần tài khoản | Ngày tính theo múi giờ tài khoản cố định; tuần từ thứ Hai đến Chủ nhật. Thiết bị không tự thay đổi cách phân ngày. |
| Giai đoạn mục tiêu | Khoảng thời gian một mục tiêu có hiệu lực; lịch sử phải được đánh giá theo đúng mục tiêu của giai đoạn. |
| Cuốn vở | Đơn vị tổ chức ghi chú một cấp; mỗi ghi chú thuộc đúng một cuốn vở. |
| Lưu trữ challenge | Ngừng theo dõi chủ động và giữ lịch sử; không phải tạm nghỉ hoặc streak freeze. |
| Chuỗi khi kết thúc theo dõi | Streak đánh giá đến ngày lưu trữ theo FR-042; không tự giảm theo thời gian, được tính lại khi sửa lịch sử hợp lệ. |

## 2. Goals

| ID | Mục tiêu | Bằng chứng đánh giá |
|---|---|---|
| GOAL-001 | Ghi nhận challenge nhanh trong sinh hoạt hằng ngày. | Done bằng một thao tác từ Hôm nay, không bắt nhập nhật ký; có ghi nhận trong cả ba tuần dùng thử. |
| GOAL-002 | Người dùng tin và hiểu tiến độ cùng streak. | Các tình huống 3/7, 7/7, ghi bù, bỏ Done và đổi mục tiêu đạt tiêu chí mục 11; người dùng không cần tự tính bằng công cụ khác. |
| GOAL-003 | Lưu và tìm lại kiến thức có ích. | Ít nhất ba lần tìm và sử dụng lại ghi chú cũ cho nhu cầu thực tế trong đợt thử. |
| GOAL-004 | Quản lý được lịch cá nhân cơ bản. | Ít nhất ba sự kiện thực tế được tạo và xem lại trong đợt thử. |
| GOAL-005 | Sử dụng dữ liệu cá nhân đáng tin cậy trên hai thiết bị. | Ít nhất một tuần dùng trên cả laptop và điện thoại; không ghi nhận mất dữ liệu trong đợt thử; kiểm chứng xuất/nhập thành công. |
| GOAL-006 | Kiểm chứng giá trị cá nhân trước khi mở rộng. | Cuối ba tuần đầy đủ, chủ sản phẩm muốn tiếp tục dùng NoteFlow làm nơi theo dõi challenge chính và xác định được phần cần giữ, sửa hoặc hoãn. |

Đợt thử có ít nhất một challenge 3/7 và một challenge 7/7. Đây là mục tiêu kiểm chứng, chưa phải kết quả đã đo. Độ dài streak hoặc tỷ lệ hoàn thành mục tiêu cá nhân không được dùng riêng lẻ để kết luận sản phẩm thành công.

## 3. Non-Goals

- Không tối ưu đồng thời cho tất cả sinh viên, developer hoặc nhóm người tự học trong MVP.
- Không xây dựng bộ công cụ cộng tác, mạng xã hội hoặc nền tảng thương mại hóa.
- Không biến challenge thành công cụ đo định lượng, xác minh hành vi hay gây áp lực thực hiện mỗi ngày cho mọi mục tiêu.
- Không thay thế trình soạn thảo phong phú hoặc hệ thống quản lý tri thức nâng cao.
- Không biến lịch thành công cụ tự động lên lịch và hoàn thành challenge.
- Không kết luận khả năng phù hợp thị trường từ kết quả dùng thử của một người.

## 4. Personas

### 4.1. PERSONA-001 — Chủ sản phẩm sử dụng cá nhân

- **Cơ sở:** Người dùng đầu tiên được xác định trong brief; nhu cầu được cung cấp trực tiếp, chưa qua nghiên cứu bên ngoài.
- **Bối cảnh:** Sử dụng laptop và điện thoại để duy trì mục tiêu, ghi kiến thức và xem sự kiện của bản thân.
- **Nhu cầu chính:** Ghi nhận nhanh; tự chọn ngày thực hiện; sửa lịch sử; hiểu đúng tiến độ; tìm lại ghi chú; tiếp tục sử dụng cùng dữ liệu trên thiết bị khác.
- **Điểm khó khăn:** Quên ghi nhận, tần suất mục tiêu không giống nhau, không muốn viết nhật ký bắt buộc và lo nội dung đã nhập chưa được lưu.
- **Kỳ vọng:** Giao diện đơn giản, ngày/tuần nhất quán, dữ liệu riêng tư và có khả năng phục hồi cơ bản.

### 4.2. Nhóm tiềm năng sau MVP

Sinh viên, developer và người thường xuyên tự học là các nhóm giả thuyết. PRD không gán cho họ tuổi, hành vi hay nhu cầu đã được kiểm chứng, và không thêm yêu cầu nghề nghiệp riêng vào MVP.

## 5. User Journeys

| ID | Bối cảnh và luồng chính | Kết quả mong đợi / nhánh cần xử lý | Epic |
|---|---|---|---|
| UJ-001 | Truy cập tài khoản → tạo challenge → xem mục tiêu và ngày bắt đầu tính streak. | Hiểu tuần khởi động nếu bắt đầu giữa tuần; có thể Done mà không cần nhật ký. | EPIC-001, EPIC-002, EPIC-003 |
| UJ-002 | Mở Hôm nay → xem tiến độ tuần → Done → tùy chọn thêm nhật ký. | Trạng thái lưu, lịch sử, tiến độ và streak được cập nhật; thao tác lặp không đếm thêm. | EPIC-001, EPIC-002, EPIC-003 |
| UJ-003 | Mở lịch sử → chọn ngày → ghi bù hoặc bỏ Done. | Tính lại kết quả theo mục tiêu của giai đoạn đó; không nối streak qua mốc chuyển đơn vị. | EPIC-002, EPIC-003, EPIC-005 |
| UJ-004 | Đổi mục tiêu → xem mục tiêu chờ → sửa/hủy nếu cần → sang tuần mới. | Chỉ một mục tiêu chờ; có hiệu lực đúng mốc; giữ hoặc bắt đầu lại streak đúng nhóm. | EPIC-003 |
| UJ-005 | Ghi nhanh vào vở mặc định → tự lưu → chuyển vở → tìm từ khóa → mở ghi chú cũ. | Nội dung được giữ sau tải lại khi đã lưu; tìm được dù khác hoa/thường hoặc dấu tiếng Việt. | EPIC-004 |
| UJ-006 | Tạo sự kiện → xem lịch tháng/ngày → sửa/xóa → xem các challenge đã Done. | Hỗ trợ sự kiện qua ngày, hover/chạm và danh sách +N; sự kiện không điều khiển Done. | EPIC-005 |
| UJ-007 | Lưu dữ liệu trên laptop → mở điện thoại → tiếp tục sử dụng. | Cùng dữ liệu và ngày/tuần; báo lỗi khi chưa lưu; người dùng chọn nội dung hoặc trạng thái Done/bỏ Done khi có xung đột tương ứng. | EPIC-001 |
| UJ-008 | Lưu trữ challenge → xem chuỗi khi kết thúc theo dõi → sửa một ghi nhận sai trong khoảng ngày hợp lệ. | Rời danh sách đang hoạt động ngay; mục tiêu chờ bị hủy; lịch sử và kỷ lục còn được tính lại đến ngày lưu trữ; không mở lại trong MVP. | EPIC-002, EPIC-003 |
| UJ-009 | Chọn sao lưu → kiểm tra bản sao → xem thông tin/cảnh báo → xác nhận thay thế → kiểm tra kết quả. | Thành công phục hồi toàn bộ; thất bại giữ nguyên dữ liệu trước nhập. Trong lúc nhập tạm ngăn sửa trên hai thiết bị; nếu mất kết nối phải xác định kết quả trước khi nhập lại hoặc sửa dữ liệu. | EPIC-006 |

Khi mất mạng giữa lúc nhập, người dùng thấy trạng thái chưa lưu, nội dung đang nhập được giữ trong phiên để thử lại khi có mạng. Luồng này không cung cấp khả năng thao tác ngoại tuyến hoặc bảo đảm giữ bản chưa lưu sau khi đóng/tải lại trang.

## 6. Functional Requirements

Tất cả FR dưới đây thuộc MVP. “Epic chính” là nơi chịu trách nhiệm về kết quả người dùng, không chỉ định cấu trúc triển khai. Dẫn chiếu “Brief §…” dùng phiên bản 1.3; “Review FAIL-1/2/3” chỉ các quyết định đã duyệt tại mục 13.3.

### 6.1. Truy cập và dữ liệu trên hai thiết bị

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-001 | Cho phép chủ tài khoản truy cập dữ liệu cá nhân sau khi được xác thực; giới hạn dữ liệu cho người được phép. MVP dùng một tài khoản, chưa mở đăng ký công khai. Phương thức đăng nhập chọn sau. | EPIC-001 | Brief §6, §8.4, Q1 |
| FR-002 | Đồng bộ dữ liệu sản phẩm đã lưu giữa laptop và điện thoại khi trực tuyến, bao gồm thay đổi và xóa theo các chức năng được hỗ trợ. | EPIC-001 | Brief §8.4, §12 |
| FR-003 | Thể hiện rõ trạng thái đang lưu, đã lưu, chưa lưu/lỗi và trạng thái đồng bộ phù hợp; khi lưu/đồng bộ thất bại phải thông báo cho người dùng. | EPIC-001 | Brief §2, §8.2, §11 |
| FR-004 | Khi hai thiết bị sửa cùng nội dung và phát sinh xung đột, thông báo để người dùng chọn nội dung cần giữ; không âm thầm ghi đè nội dung xung đột. | EPIC-001 | Brief §8.4, Q8 |
| FR-005 | Khi mất mạng trong lúc nhập, báo chưa lưu và giữ nội dung đang nhập trong phiên để thử lại khi có mạng; không coi đây là một bản đã lưu. | EPIC-001 | Brief §8.4, Q8 |
| FR-006 | Dùng một múi giờ tài khoản cố định trên các thiết bị để xác định hôm nay, ngày lịch sử và tuần thứ Hai–Chủ nhật; không cho đổi múi giờ trong MVP. Giá trị cụ thể thuộc DEP-002. | EPIC-001 | Brief §8.1, Q4 |

### 6.2. Ghi nhận và quản lý challenge

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-007 | Tạo challenge với tên, mô tả tùy chọn, ngày bắt đầu mặc định hôm nay và mục tiêu nguyên N từ 1 đến 7 ngày/tuần; không yêu cầu chọn thứ cố định. Phạm vi ngày bắt đầu khác hôm nay thuộc DEP-001. | EPIC-002 | Brief §8.1, Q3 |
| FR-008 | Xem danh sách/chi tiết challenge và sửa tên, mô tả. Thay đổi mục tiêu tuân theo FR-020; quyền sửa ngày bắt đầu sau khi có hoạt động thuộc DEP-001. | EPIC-002 | Brief §6, §8.1 |
| FR-009 | Done cho một ngày không bắt buộc nhật ký. Mỗi challenge chỉ được tính một lần/ngày; bấm lặp hoặc Done cùng ngày từ hai thiết bị không tạo thêm ngày hoàn thành. Xung đột Done/bỏ Done áp dụng FR-043. | EPIC-002 | Brief §8.1, §12; Review FAIL-2 |
| FR-010 | Ghi và sửa nhật ký gắn với ngày của challenge; chỉ nhập nhật ký không tự đánh dấu Done. Nhật ký được giữ trong challenge, không tự chuyển thành ghi chú riêng. | EPIC-002 | Brief §8.1–2 |
| FR-011 | Với challenge đang hoạt động, cho ghi bù từ ngày bắt đầu đến hôm nay. Với challenge đã lưu trữ, chỉ cho ghi bù từ ngày bắt đầu đến hết ngày lưu trữ theo múi giờ tài khoản. Không cho Done trước ngày bắt đầu, trong tương lai hoặc sau ngày lưu trữ. | EPIC-002 | Brief §8.1, Q2; Review FAIL-1 |
| FR-012 | Cho bỏ Done khi đánh dấu nhầm và giữ nguyên nhật ký; tính lại các kết quả theo FR-023. Với challenge đã lưu trữ, ngày được sửa chỉ nằm từ ngày bắt đầu đến ngày lưu trữ; xung đột trạng thái áp dụng FR-043. | EPIC-002 | Brief §8.1; Review FAIL-1/2 |
| FR-013 | Lưu trữ có hiệu lực ngay, loại challenge khỏi danh sách đang hoạt động; giữ lịch sử, nhật ký, các mục tiêu đã có hiệu lực và kỷ lục; hủy mục tiêu đang chờ. Cho xem lịch sử và sửa nhật ký/ghi nhận từ ngày bắt đầu đến ngày lưu trữ, không ghi nhận ngày sau đó. Không hỗ trợ mở lại. Streak sau lưu trữ áp dụng FR-042. | EPIC-002 | Brief §8.1, Q6; Review FAIL-1 |

### 6.3. Tiến độ, streak và thay đổi mục tiêu

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-014 | Hiển thị số ngày đã Done trên mục tiêu của tuần đó; cho tiếp tục ghi nhận sau khi đạt mục tiêu, ví dụ 4/3, tối đa bảy ngày trong tuần. | EPIC-003 | Brief §8.1 |
| FR-015 | Hiển thị lịch sử hoàn thành theo ngày và kết quả theo tuần; dùng mục tiêu có hiệu lực tại thời điểm tương ứng để đánh giá lịch sử. | EPIC-003 | Brief §8.1 |
| FR-016 | Lấy ngày bắt đầu làm mốc tuần khởi động: bắt đầu giữa tuần thì lưu hoạt động nhưng chưa cộng/ngắt streak, bắt đầu tính từ thứ Hai tiếp theo; bắt đầu thứ Hai thì tính ngay. Áp dụng cho cả 1–6/7 và 7/7. | EPIC-003 | Brief §8.1, Q3 |
| FR-017 | Với challenge 1–6/7 đang hoạt động, tính streak theo số tuần liên tiếp đạt mục tiêu. Tuần đang diễn ra chưa đạt không ngắt chuỗi; đạt mục tiêu thì cộng một tuần; hết tuần chưa đạt thì ngắt. Ghi thêm ngày sau khi đạt không cộng thêm tuần streak. Khi lưu trữ, áp dụng FR-042. | EPIC-003 | Brief §8.1, Q2; Review FAIL-1 |
| FR-018 | Với challenge 7/7 đang hoạt động, tính streak theo ngày Done liên tiếp từ mốc tính streak; không đặt lại khi chuyển tuần. Hôm nay chưa Done vẫn giữ chuỗi từ hôm qua đến hết hôm nay; bỏ lỡ trọn ngày thì ngắt. Vẫn hiển thị tiến độ và kết quả tuần. Khi lưu trữ, áp dụng FR-042. | EPIC-003 | Brief §8.1, Q2; Review FAIL-1 |
| FR-019 | Hiển thị chuỗi hiện tại và dài nhất với đơn vị rõ ràng; với challenge đã lưu trữ, thay nhãn chuỗi hiện tại bằng “Chuỗi khi kết thúc theo dõi” theo FR-042. Kỷ lục dài nhất xét toàn bộ lịch sử cùng đơn vị, giữ các kỷ lục ngày/tuần cũ; không quy đổi hoặc cộng ngày với tuần. | EPIC-003 | Brief §8.1, Q7; Review FAIL-1 |
| FR-020 | Thay đổi mục tiêu có hiệu lực từ thứ Hai tuần sau. Chỉ có một mục tiêu chờ; sửa tiếp thay thế mục tiêu chờ, cho hủy trước hiệu lực; hiển thị mục tiêu hiện tại, mục tiêu chờ và thời điểm áp dụng. Lưu trữ challenge hủy mục tiêu còn đang chờ theo FR-013. | EPIC-003 | Brief §8.1, Q5; Review FAIL-1 |
| FR-021 | Đổi trong nhóm 1–6/7 tiếp tục chuỗi tuần theo kết quả đạt mục tiêu; bản thân việc đổi không đặt lại hoặc khôi phục chuỗi đã ngắt, không đổi mục tiêu dùng để đánh giá tuần cũ. | EPIC-003 | Brief §8.1 |
| FR-022 | Chuyển giữa 1–6/7 và 7/7 bắt đầu chuỗi hiện tại từ 0 khi mục tiêu mới có hiệu lực, sau đó tăng theo đơn vị mới; không thêm tuần khởi động, không nối với chuỗi trước kể cả khi quay lại nhóm cũ. | EPIC-003 | Brief §8.1 |
| FR-023 | Khi ghi bù/bỏ Done hoặc chốt kết quả xung đột trạng thái, tính lại tiến độ, lịch sử, chuỗi hiện tại hoặc chuỗi khi kết thúc theo dõi và kỷ lục bị ảnh hưởng theo mục tiêu từng giai đoạn; không nối streak qua mốc chuyển đơn vị. Lịch cá nhân phản ánh trạng thái Done đã sửa. | EPIC-003 | Brief §8.1, §8.3; Review FAIL-1/2 |

### 6.4. Cuốn vở và ghi chú

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-024 | Tạo, xem và đổi tên cuốn vở một cấp; mỗi ghi chú thuộc đúng một cuốn vở. | EPIC-004 | Brief §8.2 |
| FR-025 | Có cuốn vở mặc định để ghi nhanh khi chưa muốn phân loại. | EPIC-004 | Brief §8.2 |
| FR-026 | Chỉ cho xóa vở rỗng; không cho xóa vở mặc định. Muốn xóa vở còn ghi chú, người dùng phải chuyển hoặc xóa các ghi chú trước. | EPIC-004 | Brief §8.2, Q9 |
| FR-027 | Tạo, đọc, sửa và xóa ghi chú có tiêu đề/nội dung văn bản thuần túy. Xóa yêu cầu xác nhận; không có thùng rác hoặc khôi phục riêng từng ghi chú trong MVP. | EPIC-004 | Brief §8.2, Q9 |
| FR-028 | Chuyển ghi chú giữa các cuốn vở mà giữ nội dung và bảo đảm ghi chú vẫn thuộc đúng một vở. | EPIC-004 | Brief §8.2 |
| FR-029 | Tự lưu khi tạo/sửa ghi chú và hiển thị trạng thái lưu/đồng bộ theo FR-003; áp dụng xử lý xung đột và gián đoạn theo FR-004–005. | EPIC-004 | Brief §8.2, §8.4 |
| FR-030 | Tìm từ khóa trong tiêu đề và nội dung trên toàn bộ ghi chú, không phân biệt hoa/thường hoặc dấu tiếng Việt; cho mở trực tiếp kết quả. Tìm kiếm này không bao gồm nhật ký challenge. | EPIC-004 | Brief §8.2, Q11 |

### 6.5. Lịch cá nhân

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-031 | Tạo, xem, sửa và xóa sự kiện đơn lẻ có tên, thời điểm bắt đầu/kết thúc, mô tả tùy chọn. Xóa phải xác nhận; không có khôi phục riêng từng sự kiện trong MVP. | EPIC-005 | Brief §8.3, Q9 |
| FR-032 | Cho sự kiện có giờ kéo dài qua ngày; thời điểm kết thúc phải sau thời điểm bắt đầu. Không cung cấp loại sự kiện cả ngày. | EPIC-005 | Brief §8.3, Q11 |
| FR-033 | Xem lịch tháng và danh sách sự kiện của ngày được chọn. Sự kiện qua ngày phải có thể được tìm thấy từ các ngày mà nó diễn ra. | EPIC-005 | Brief §8.3; diễn giải hành vi sự kiện qua ngày |
| FR-034 | Hiển thị icon challenge đã Done trong ô ngày tương ứng, gồm ghi bù; hover trên laptop hoặc chạm trên điện thoại xem được tên challenge. | EPIC-005 | Brief §8.3 |
| FR-035 | Khi nhiều challenge đã Done trong một ngày vượt số icon có thể hiển thị, giới hạn icon và có chỉ báo +N để mở danh sách đầy đủ. | EPIC-005 | Brief §8.3 |
| FR-036 | Giữ sự kiện và Done độc lập: sự kiện kết thúc không tự Done; challenge chưa Done không tự được xếp vào ngày; icon biểu thị hoạt động đã hoàn thành. | EPIC-005 | Brief §8.3 |

### 6.6. Hôm nay và sao lưu

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-037 | Hôm nay hiển thị challenge đang hoạt động, tiến độ tuần và Done hôm nay; cho Done bằng một thao tác, không bắt buộc mở nhật ký. | EPIC-002 | Brief §8.4, §12 |
| FR-038 | Hôm nay hiển thị sự kiện trong ngày theo múi giờ tài khoản, bao gồm sự kiện qua ngày đang diễn ra trong ngày đó. | EPIC-005 | Brief §8.4, Q11 |
| FR-039 | Hôm nay cung cấp lối vào ghi chú nhanh, dùng vở mặc định khi chưa phân loại. | EPIC-004 | Brief §8.2, §8.4 |
| FR-040 | Xuất bản sao lưu toàn bộ dữ liệu sản phẩm: vở, ghi chú, challenge/trạng thái và ngày lưu trữ, Done/nhật ký, mục tiêu từng giai đoạn và mục tiêu còn đang chờ, sự kiện, múi giờ và dữ liệu cần phục hồi lịch sử/kỷ lục/chuỗi khi kết thúc theo dõi. | EPIC-006 | Brief §8.4, Q10; Review FAIL-1/3 |
| FR-041 | Nhập bản sao lưu để thay thế toàn bộ dữ liệu sản phẩm hiện tại sau kiểm tra bản sao theo FR-044, cảnh báo rõ và xác nhận của người dùng; không gộp. Phục hồi đúng dữ liệu thuộc FR-040, bảo toàn dữ liệu khi thất bại theo FR-045 và kiểm soát thao tác trong lúc nhập theo FR-046. | EPIC-006 | Brief §8.4, Q10; Review FAIL-3 |

### 6.7. Quy tắc bổ sung sau Quality Review đã được duyệt

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-042 | Chốt streak theo ngày lưu trữ. Với 1–6/7, tuần lưu trữ đã đạt mục tiêu được tính một tuần; nếu chưa đạt thì đánh dấu “kết thúc theo dõi”, không cộng hoặc ngắt chuỗi trước đó. Những tuần đã kết thúc trước tuần lưu trữ vẫn đánh giá bình thường. Với 7/7, ngày lưu trữ đã Done được tính; nếu chưa Done thì giữ chuỗi đến hôm qua, những ngày bỏ lỡ trước ngày lưu trữ vẫn ngắt chuỗi bình thường. Lưu trữ trong tuần khởi động cho streak 0. Hiển thị “Chuỗi khi kết thúc theo dõi”, không tự giảm theo thời gian nhưng tính lại khi sửa lịch sử hợp lệ. Các mốc bắt đầu và chuyển nhóm mục tiêu vẫn áp dụng, không nối chuỗi qua mốc chuyển đơn vị. | EPIC-003 | Review FAIL-1 |
| FR-043 | Hai thiết bị cùng yêu cầu Done cho một ngày thì giữ Done và chỉ tính một ngày; cùng yêu cầu bỏ Done thì giữ chưa Done, không báo xung đột cho hai trường hợp cùng kết quả. Khi yêu cầu Done và bỏ Done đối nghịch dựa trên trạng thái chưa cập nhật, thông báo để người dùng chọn “Đã hoàn thành” hoặc “Chưa hoàn thành”. Trong lúc chưa chọn, giữ trạng thái đã lưu thành công gần nhất và báo thao tác xung đột chưa áp dụng. Sau khi chọn, đồng bộ kết quả và tính lại theo FR-023; bỏ Done giữ nhật ký. Nếu đã thấy trạng thái mới rồi chủ động đổi lại, xử lý như thao tác bình thường. | EPIC-001 | Review FAIL-2 |
| FR-044 | Trước khi cho xác nhận nhập, kiểm tra bản sao lưu đọc được, đầy đủ và thuộc phiên bản được hỗ trợ; hiển thị thông tin bản sao và cảnh báo thay thế toàn bộ. Bản sao hỏng, thiếu dữ liệu hoặc không được hỗ trợ phải bị từ chối với lý do rõ, không thay đổi dữ liệu hiện tại. Hủy trước xác nhận cũng giữ nguyên dữ liệu. | EPIC-006 | Review FAIL-3 |
| FR-045 | Một lần nhập được xác định thành công khi toàn bộ dữ liệu bản sao được phục hồi đúng; nếu nhập thất bại, dữ liệu đã lưu trước khi nhập phải được giữ nguyên và người dùng có thể thử lại. Không để kết quả cuối là dữ liệu chỉ được thay thế một phần. Không kết luận thất bại chỉ vì thiết bị mất kết nối; trường hợp chưa rõ kết quả áp dụng FR-046. | EPIC-006 | Review FAIL-3 |
| FR-046 | Sau xác nhận và trong lúc nhập, tạm ngăn thay đổi dữ liệu sản phẩm trên cả hai thiết bị. Nếu mất kết nối khi nhập, hiển thị “Chưa xác định được kết quả nhập”; khi kết nối lại phải xác định kết quả trước khi cho nhập lại hoặc sửa dữ liệu. Sau thành công, thiết bị còn lại phải cập nhật dữ liệu sau khôi phục trước khi tiếp tục ghi thay đổi. | EPIC-006 | Review FAIL-3 |

## 7. Non-Functional Requirements

| ID | Thuộc tính | Requirement và cách kiểm chứng | Nguồn |
|---|---|---|---|
| NFR-001 | Dễ sử dụng | Chủ sản phẩm hoàn thành các journey chính trên hai thiết bị mà không cần hướng dẫn trực tiếp. Từ Hôm nay, Done chỉ cần một thao tác, không bắt nhập nội dung. Kiểm chứng qua quan sát và ghi lại điểm gây khó hiểu. | Brief §12 |
| NFR-002 | Tương thích thiết bị | Giao diện web thích ứng laptop/điện thoại; các chức năng quan trọng thao tác được bằng chạm và không phụ thuộc riêng hover. Chạy các journey trên thiết bị/trình duyệt thực tế ghi tại DEP-005. | Brief §6, §9 |
| NFR-003 | Tính đúng đắn | Kết quả ngày, tuần, tiến độ và streak phải thỏa các tình huống mục 11, kể cả biên tuần, ghi bù, bỏ Done, đổi mục tiêu và Done từ hai thiết bị; không có lỗi đếm trùng trong bộ nghiệm thu. | Brief §8.1, §12 |
| NFR-004 | Độ bền dữ liệu đã lưu | Nội dung được báo đã lưu vẫn đúng sau tải lại và khi mở trên thiết bị khác. Kiểm chứng cả ghi chú, nhật ký, Done, mục tiêu và sự kiện; không đánh đồng nội dung còn trong phiên với dữ liệu đã lưu. | Brief §2, §11–12 |
| NFR-005 | Trung thực về trạng thái | Không hiển thị đã lưu khi lưu thất bại. Trong thử nghiệm mất mạng/lỗi lưu, người dùng nhận biết dữ liệu chưa lưu và có thể thử lại trong phiên theo FR-005. | Brief §8.4, §11 |
| NFR-006 | Nhất quán đồng bộ | Hai thiết bị trực tuyến đạt cùng trạng thái dữ liệu sau đồng bộ hoặc sau khi người dùng giải quyết xung đột nội dung/trạng thái Done. Không âm thầm mất nội dung do sửa đồng thời; trạng thái đối nghịch từ dữ liệu chưa cập nhật tuân theo FR-043. Sau nhập sao lưu, cập nhật dữ liệu trước khi ghi tiếp theo FR-046. Ngưỡng độ trễ chưa chốt tại DEP-006, được chấp nhận là WARNING tại baseline. | Brief §8.4, §12; Review FAIL-2/3 |
| NFR-007 | Riêng tư | Trong kiểm tra truy cập, người chưa được xác thực/không được phép không đọc hoặc sửa được dữ liệu cá nhân, kể cả khi truy cập trực tiếp nội dung thay vì qua điều hướng giao diện. Không bổ sung chia sẻ công khai. | Brief §9, §11 |
| NFR-008 | Khả năng phục hồi | Một lượt xuất/nhập có kiểm soát phục hồi đúng toàn bộ dữ liệu thuộc FR-040. Nhập thất bại giữ nguyên dữ liệu đã lưu trước nhập; không có kết quả cuối chỉ phục hồi một phần. Bản sao không hợp lệ và nhánh hủy không làm thay đổi dữ liệu. Mất kết nối khi chưa rõ kết quả phải được kiểm tra theo FR-046, không báo thành công hoặc thất bại khi chưa xác định. | Brief §8.4, §12; Review FAIL-3 |
| NFR-009 | Hiệu năng tìm kiếm | Mục tiêu ban đầu: kết quả trong khoảng một giây với khoảng 1.000 ghi chú văn bản ngắn, ghi rõ thiết bị, trình duyệt, dữ liệu và điều kiện mạng. Đây là mục tiêu để review, chưa là SLA hoặc ngưỡng percentile đã chốt; cần cụ thể hóa phép đo tại DEP-006. | Brief §12 |
| NFR-010 | Dễ hiểu tiến độ | Luôn phân biệt số ngày hoàn thành trong tuần với đơn vị streak; thể hiện rõ tuần khởi động và thời điểm mục tiêu mới có hiệu lực. Chủ sản phẩm giải thích được tiến độ, chuỗi hiện tại và kỷ lục mà không cần công cụ tính bên ngoài. | Brief §8.1, §11–12 |

Không tự đặt cam kết về uptime, tải nhiều người dùng, dung lượng không giới hạn hoặc độ trễ đồng bộ khi chưa có cơ sở. Các NFR trên áp dụng xuyên suốt các Epic có liên quan, không chỉ thuộc Epic truy cập dữ liệu.

## 8. MVP Scope

| Phạm vi | Kết quả bắt buộc của MVP | Ưu tiên |
|---|---|---|
| Challenge | Tạo/quản lý, Done, nhật ký tùy chọn, ghi bù/bỏ Done, lưu trữ và xem/sửa lịch sử. | 1 |
| Tiến độ và streak | Tiến độ tuần, lịch sử, hai loại streak, tuần khởi động, kỷ lục và đổi mục tiêu theo giai đoạn. | 1 |
| Ghi chú | Vở một cấp, vở mặc định, ghi chú văn bản, chuyển vở, tự lưu, tìm kiếm từ khóa. | 2 |
| Lịch | Sự kiện có giờ đơn lẻ, gồm qua ngày; lịch tháng/ngày; icon challenge và +N. | 3 |
| Hôm nay | Challenge, Done nhanh, tiến độ tuần, sự kiện trong ngày và lối vào ghi chú nhanh. | Hỗ trợ luồng chính |
| Sử dụng cá nhân | Web thích ứng màn hình, một tài khoản, trực tuyến, cùng dữ liệu và múi giờ trên hai thiết bị. | Xuyên suốt |
| Bảo toàn dữ liệu | Trạng thái lưu/đồng bộ, giải quyết xung đột nội dung và Done/bỏ Done, giữ bản đang nhập trong phiên khi mất mạng; nhập sao lưu thay thế toàn bộ khi thành công, giữ nguyên dữ liệu khi thất bại và kiểm tra kết quả khi gián đoạn kết nối. | Xuyên suốt |

Thứ tự ưu tiên hướng dẫn triển khai và trao đổi cắt giảm; không tự loại ghi chú, lịch hoặc sao lưu khỏi MVP. Thay đổi phạm vi cần được phản ánh trong quyết định sản phẩm trước khi sửa baseline của PRD.

## 9. Out of Scope

- Cộng tác, phân quyền nhóm, chia sẻ công khai, mạng xã hội và đăng ký công khai cho nhiều người dùng.
- AI tạo/tóm tắt nội dung, semantic search và hỏi đáp trên ghi chú.
- Trình soạn thảo phức tạp, định dạng phong phú, tệp đính kèm, OCR, hình ảnh và code block chuyên dụng.
- Vở/thư mục nhiều tầng, tag kết hợp, backlink và knowledge graph.
- Challenge theo thứ cố định, nhiều lượt tính trong ngày, theo dõi định lượng để tự đánh giá Done.
- Bảng xếp hạng, huy hiệu, điểm thưởng, streak freeze và tạm nghỉ challenge; mở lại challenge đã lưu trữ.
- Sự kiện lặp, loại sự kiện cả ngày, nhắc lịch, lời mời, kéo thả và đồng bộ lịch bên ngoài.
- Tự đặt giờ challenge, tự gán challenge chưa Done vào ngày hoặc tự Done khi sự kiện kết thúc.
- Thao tác ngoại tuyến, ứng dụng native riêng và cam kết giữ nội dung chưa lưu sau khi đóng/tải lại trang.
- Đổi múi giờ tài khoản trong MVP.
- Thùng rác/khôi phục riêng từng ghi chú hoặc sự kiện đã xóa; gộp dữ liệu khi nhập bản sao lưu.
- Dashboard phân tích nâng cao, thanh toán và thương mại hóa.

Khôi phục toàn bộ từ bản sao lưu thuộc MVP; khôi phục riêng một mục đã xóa không thuộc MVP.

## 10. Epic Breakdown

Epic chia theo giá trị người dùng, không theo tầng kỹ thuật. Mỗi FR có đúng một Epic chính; tích hợp giữa Epic vẫn phải thỏa NFR xuyên suốt.

| ID | Tên và kết quả người dùng | FR chịu trách nhiệm chính | Điều kiện hoàn thành ở mức sản phẩm |
|---|---|---|---|
| EPIC-001 | **Truy cập và sử dụng dữ liệu cá nhân trên hai thiết bị.** Người dùng truy cập riêng tư, dùng cùng dữ liệu và hiểu trạng thái lưu/đồng bộ. | FR-001–006, FR-043 | Truy cập được kiểm soát; dữ liệu nhất quán giữa hai thiết bị; lỗi lưu/mất mạng/xung đột nội dung và trạng thái Done được xử lý rõ; cùng ngày và tuần tài khoản. |
| EPIC-002 | **Theo dõi challenge hằng ngày.** Người dùng tạo và quản lý challenge, Done nhanh, ghi nhật ký, sửa ghi nhận và lưu trữ. | FR-007–013, FR-037 | Luồng Hôm nay → Done hoạt động bằng một thao tác; không đếm trùng; ghi bù/bỏ Done và xem lại challenge lưu trữ đáp ứng các quy tắc được chốt. |
| EPIC-003 | **Tiến độ, streak và điều chỉnh mục tiêu.** Người dùng hiểu và tin lịch sử, kỷ lục và tác động của thay đổi mục tiêu. | FR-014–023, FR-042 | Các tình huống streak tuần/ngày, tuần khởi động, sửa lịch sử, chuyển mục tiêu và chuỗi khi kết thúc theo dõi đạt mục 11; đơn vị rõ và không nối chuỗi qua mốc chuyển nhóm. |
| EPIC-004 | **Lưu và tìm lại kiến thức.** Người dùng ghi nhanh, tổ chức trong vở, tự lưu và tìm lại ghi chú. | FR-024–030, FR-039 | CRUD ghi chú, quản lý/chuyển vở, bảo vệ vở mặc định, tự lưu và tìm kiếm không dấu hoạt động trên hai thiết bị. |
| EPIC-005 | **Lịch cá nhân và hoạt động theo ngày.** Người dùng quản lý sự kiện và xem challenge đã hoàn thành trên lịch. | FR-031–036, FR-038 | CRUD sự kiện, sự kiện qua ngày, lịch tháng/ngày, Hôm nay và icon/+N hoạt động bằng hover/chạm; sự kiện độc lập với Done. |
| EPIC-006 | **Sao lưu và khôi phục dữ liệu.** Người dùng chủ động giữ bản sao và phục hồi đầy đủ dữ liệu cá nhân. | FR-040–041, FR-044–046 | Kiểm tra bản sao trước xác nhận; thành công phục hồi toàn bộ, thất bại giữ nguyên dữ liệu trước nhập; tạm ngăn ghi trên hai thiết bị khi nhập và xác định kết quả sau mất kết nối; cảnh báo thay thế, không gộp. |

### 10.1. Ưu tiên và quan hệ phụ thuộc sản phẩm

- EPIC-001 cung cấp điều kiện sử dụng riêng tư, trực tuyến và xuyên thiết bị cho các Epic còn lại; phải được kiểm chứng với dữ liệu thực của các luồng sản phẩm.
- EPIC-002 và EPIC-003 là ưu tiên giá trị đầu tiên. EPIC-003 dựa trên hoạt động và lịch sử mục tiêu của challenge; EPIC-002 dùng kết quả tiến độ trên Hôm nay.
- EPIC-004 tiếp theo về ưu tiên; lối vào ghi nhanh hoàn thiện thêm Hôm nay.
- EPIC-005 dùng lịch sử Done từ EPIC-002/EPIC-003 để hiển thị icon; sự kiện và danh sách hôm nay bổ sung vào trải nghiệm hằng ngày.
- EPIC-006 bao phủ dữ liệu của EPIC-001–005 và phải được kiểm chứng trước khi MVP được coi là có khả năng phục hồi dữ liệu sử dụng thật.

Hôm nay được hoàn thiện qua EPIC-002, EPIC-004 và EPIC-005. PRD chưa chia stories, lên sprint hoặc quy định trình tự xây dựng thành phần kỹ thuật.

## 11. Acceptance-level Product Requirements

Các tiêu chí dưới đây mô tả kết quả quan sát được, không phải mã kiểm thử. “Đã lưu” nghĩa là ứng dụng đã xác nhận lưu thành công. Các tình huống ngày/tuần sử dụng cùng múi giờ tài khoản và challenge đang hoạt động, trừ khi nêu khác.

### 11.1. Truy cập, lưu và hai thiết bị

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-001 | FR-001; NFR-007 | Người chưa được xác thực hoặc không được phép mở trực tiếp dữ liệu cá nhân; sau đó chủ tài khoản truy cập hợp lệ. | Người không được phép không đọc/sửa được dữ liệu; chủ tài khoản truy cập được. MVP không có đăng ký/chia sẻ công khai. |
| AC-002 | FR-002, FR-003; NFR-004, NFR-006 | Tạo/sửa một ghi chú, nhật ký, Done, mục tiêu và sự kiện trên laptop, chờ báo đã lưu rồi mở điện thoại trực tuyến; kiểm tra thêm xóa ghi chú/sự kiện. | Hai thiết bị đạt cùng trạng thái sau đồng bộ; tải lại giữ đúng dữ liệu đã lưu. Ghi lại thời gian đồng bộ, đánh giá ngưỡng khi DEP-006 được chốt. |
| AC-003 | FR-003, FR-005, FR-029; NFR-005 | Đang nhập ghi chú thì mạng gián đoạn trước khi lưu thành công; sau đó có mạng lại trong cùng phiên. | Báo chưa lưu/lỗi; giữ nội dung đang nhập trong phiên; có thể thử lưu lại và sau thành công thấy nội dung trên thiết bị khác. Không báo đã lưu trong lúc thao tác thất bại. |
| AC-004 | FR-004; NFR-006 | Hai thiết bị sửa cùng nội dung từ các trạng thái khác nhau và phát sinh xung đột. | Người dùng được báo và chọn nội dung cần giữ; không có ghi đè âm thầm trước quyết định; sau giải quyết và đồng bộ, hai thiết bị thấy cùng nội dung. |
| AC-005 | FR-006; NFR-003 | Hai thiết bị có múi giờ hệ thống khác nhau cùng xem tài khoản tại thời điểm gần nửa đêm hoặc chuyển tuần. | Cùng “hôm nay”, cùng tuần thứ Hai–Chủ nhật và cùng ngày ghi nhận theo múi giờ tài khoản; không có thao tác đổi múi giờ tài khoản trong MVP. |

### 11.2. Ghi nhận challenge và lịch sử

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-006 | FR-007, FR-008 | Tạo challenge 3/7 không có mô tả, dùng ngày bắt đầu mặc định; mở chi tiết rồi sửa tên/mô tả. Thử mục tiêu 0, 8 hoặc không nguyên. | Tạo được challenge hợp lệ, mặc định hôm nay, không bắt chọn thứ; thông tin sửa được lưu; không chấp nhận mục tiêu ngoài 1–7 nguyên. Không tự sửa ngày bắt đầu hoặc mục tiêu hiện hành qua thao tác sửa tên. |
| AC-007 | FR-009, FR-037; NFR-001, NFR-003 | Từ Hôm nay, bấm Done cho challenge chưa Done; bấm lặp và thử Done cùng ngày từ thiết bị thứ hai. | Một thao tác đủ ghi nhận, không bắt nhật ký; chỉ một ngày hoàn thành được tính; Hôm nay hiển thị Done và tiến độ cập nhật. |
| AC-008 | FR-010 | Chỉ nhập nhật ký cho một ngày chưa Done; sửa nội dung; sau đó đánh dấu Done mà không nhập thêm nhật ký. | Nhật ký tự nó không làm tăng tiến độ; nội dung sửa được giữ; Done thành công không cần nội dung mới; nhật ký không tự xuất hiện thành ghi chú riêng. |
| AC-009 | FR-011 | Với challenge đang hoạt động, chọn một ngày đã qua từ ngày bắt đầu trở đi để ghi bù; thử ngày trước ngày bắt đầu và ngày tương lai. | Ghi bù ngày hợp lệ được lưu, kể cả ngày cũ không nằm trong tuần hiện tại; hai loại ngày không hợp lệ bị từ chối. |
| AC-010 | FR-012, FR-014, FR-023 | Challenge 3/7 đang có 3/3 ngày trong tuần hiện tại; bỏ Done một ngày trong tuần có nhật ký. | Tiến độ thành 2/3; trạng thái ngày, kết quả tuần, streak và icon lịch được tính lại; không giữ kết quả 3/3 cũ; nhật ký còn nguyên. |
| AC-011 | FR-013, FR-020, FR-037 | Lưu trữ challenge đang hoạt động có mục tiêu chờ áp dụng; sau đó xem/sửa một nhật ký cũ và đi qua mốc mục tiêu chờ trước đây. | Rời danh sách đang hoạt động ngay; giữ lịch sử/nhật ký/mục tiêu đã có hiệu lực và kỷ lục; hủy mục tiêu chờ, mục tiêu đó không tự áp dụng sau lưu trữ; nhật ký trong khoảng hợp lệ sửa được; không mở lại challenge. Streak và giới hạn ngày được kiểm tra tại AC-035–038. |
| AC-012 | FR-014, FR-015 | Challenge 3/7 có hai ngày Done trong tuần; tiếp tục Done ở ngày thứ ba, thứ tư và các ngày còn lại. | Tiến độ lần lượt 2/3, 3/3, 4/3 và tối đa 7/3; lịch sử thể hiện đúng từng ngày; kết quả đạt mục tiêu không yêu cầu dừng ở ba ngày. |

### 11.3. Streak và chuyển mục tiêu

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-013 | FR-016, FR-019; NFR-010 | Hai challenge 3/7 và 7/7 có ngày bắt đầu thứ Tư, có Done trong phần tuần đầu; đối chiếu với challenge bắt đầu thứ Hai. | Các ngày tuần đầu vẫn vào lịch sử/tiến độ nhưng không cộng hoặc ngắt streak; bắt đầu tính từ thứ Hai tiếp theo. Challenge bắt đầu thứ Hai được tính ngay; người dùng nhận biết tuần khởi động. |
| AC-014 | FR-017, FR-019 | Challenge 3/7 hoàn thành ba ngày khác nhau trong mỗi tuần của hai tuần đủ điều kiện liên tiếp. | Sau đạt mục tiêu tuần thứ hai, streak là 2 tuần; các ngày Done thêm trong tuần đó không cộng thêm tuần streak. |
| AC-015 | FR-017 | Đang có streak 2 tuần; tuần mới chưa đủ ba ngày. Kiểm tra trước và sau khi tuần kết thúc mà chỉ có hai ngày Done. | Trong tuần vẫn giữ 2 tuần; khi tuần kết thúc chưa đạt, chuỗi hiện tại bị ngắt về 0. |
| AC-016 | FR-018, FR-019 | Challenge 7/7 Done 10 ngày liên tiếp từ mốc tính streak, đi qua thứ Hai. | Streak là 10 ngày, không đặt lại ở biên tuần; vẫn có tiến độ tuần và ghi nhận tuần đủ bảy ngày là đạt mục tiêu. |
| AC-017 | FR-018 | Challenge 7/7 có chuỗi đến hôm qua; hôm nay chưa Done. Kiểm tra trong hôm nay rồi sau khi hết ngày mà vẫn chưa Done. | Trong hôm nay giữ chuỗi đến hôm qua; sau khi bỏ lỡ trọn ngày, chuỗi hiện tại bị ngắt về 0. |
| AC-018 | FR-011, FR-012, FR-015, FR-023 | Trong cùng giai đoạn 3/7, ba tuần đã kết thúc lần lượt có 3, 2, 3 ngày Done; ghi bù một ngày cho tuần giữa. Thử tương tự với một ngày thiếu giữa chuỗi 7/7; sau đó bỏ Done lại. | Trường hợp tuần được tính lại thành ba tuần đạt liên tiếp; trường hợp ngày được nối đúng trong cùng giai đoạn. Bỏ Done lại tính về kết quả đúng, kể cả chuỗi dài nhất bị ảnh hưởng; không giữ kỷ lục sai từ lần đánh dấu nhầm. |
| AC-019 | FR-020 | Giữa tuần, đặt mục tiêu chờ 5/7 rồi sửa thành 4/7; kiểm tra mục tiêu hiện tại và mốc áp dụng. Thử hủy trước hiệu lực; trong lần khác giữ mục tiêu chờ đến tuần sau. | Chỉ còn một mục tiêu chờ 4/7; mục tiêu hiện tại không đổi trong tuần. Hủy thì không còn thay đổi chờ; nếu giữ thì 4/7 có hiệu lực từ thứ Hai tiếp theo. |
| AC-020 | FR-021 | Có streak 2 tuần ở 3/7; đặt 5/7 cho tuần sau và hoàn thành năm ngày trong tuần mới. | Các tuần cũ vẫn đánh giá theo 3/7; sau đạt tuần mới, streak là 3 tuần. Đối chiếu trường hợp chuỗi đã ngắt: đổi mục tiêu không tự khôi phục chuỗi. |
| AC-021 | FR-019, FR-020, FR-022 | Chuyển 3/7 → 7/7, và một trường hợp riêng 7/7 → 3/7, tại mốc mục tiêu mới có hiệu lực. | Chuỗi hiện tại bắt đầu từ 0. Với 7/7, Done thứ Hai đầu tiên cho 1 ngày; với 3/7, đạt ba ngày tuần đầu cho 1 tuần. Không có tuần khởi động mới; lịch sử/kỷ lục cũ còn đúng đơn vị. |
| AC-022 | FR-019, FR-022, FR-023 | Challenge từng có kỷ lục 4 tuần, chuyển sang 7/7 rồi quay lại 3/7; ghi bù ngày thuộc giai đoạn cũ. | Chuỗi hiện tại không nối qua bất kỳ mốc chuyển nhóm nào; kỷ lục tuần vẫn xét toàn bộ lịch sử tuần và được tính lại nếu ghi bù ảnh hưởng; kỷ lục ngày được giữ riêng. Không cộng hoặc quy đổi ngày với tuần. |

### 11.4. Ghi chú

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-023 | FR-024, FR-025, FR-027, FR-029, FR-039; NFR-004 | Từ Hôm nay mở ghi nhanh khi chưa phân loại, nhập tiêu đề/nội dung; chờ tự lưu rồi tải lại. Tạo và đổi tên một cuốn vở. | Ghi chú nằm trong vở mặc định, giữ đúng văn bản sau tải lại; cuốn vở mới/đổi tên được lưu, không có phân cấp vở nhiều tầng. |
| AC-024 | FR-024, FR-028 | Chuyển một ghi chú từ vở A sang vở B rồi tìm/mở lại ghi chú. | Nội dung không đổi, ghi chú thuộc B và không còn thuộc A; không tạo hai bản vì thao tác chuyển. |
| AC-025 | FR-026, FR-027 | Thử xóa vở mặc định, vở còn ghi chú và vở thường rỗng. Với ghi chú, hủy rồi xác nhận xóa trong hai lần thao tác riêng. | Hai vở được bảo vệ không bị xóa; vở thường rỗng xóa được. Hủy xóa giữ ghi chú; xác nhận xóa loại ghi chú khỏi vở/tìm kiếm sau đồng bộ; không có thùng rác. |
| AC-026 | FR-030; NFR-009 | Có ghi chú chứa “Học tiếng Anh”, ghi chú khác chỉ chứa từ khóa trong nội dung và một nhật ký challenge có từ khóa đó; tìm “HOC TIENG ANH”. | Tìm thấy ghi chú phù hợp từ tiêu đề hoặc nội dung dù khác hoa/thường và dấu; mở đúng ghi chú. Nhật ký challenge không trở thành kết quả ghi chú. Đo hiệu năng trên khoảng 1.000 ghi chú theo DEP-006. |

### 11.5. Lịch và Hôm nay

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-027 | FR-031, FR-032, FR-033, FR-038 | Tạo sự kiện 23:00 ngày A đến 01:00 ngày B theo múi giờ tài khoản; xem lịch tháng, danh sách A/B và Hôm nay tương ứng; sửa mô tả. | Tạo/sửa được sự kiện qua ngày; tìm thấy sự kiện trong hai ngày có thời gian diễn ra; thông tin nhất quán giữa các góc nhìn. |
| AC-028 | FR-031, FR-032 | Thử tạo sự kiện kết thúc bằng hoặc trước bắt đầu; với sự kiện hợp lệ, hủy rồi xác nhận xóa ở hai lần riêng. | Thời gian không hợp lệ bị từ chối; hủy xóa giữ sự kiện, xác nhận xóa loại sự kiện khỏi lịch/Hôm nay sau đồng bộ; không có loại cả ngày hoặc khôi phục riêng sự kiện. |
| AC-029 | FR-034, FR-035 | Một ngày có số challenge Done lớn hơn sức chứa icon của ô ngày; xem trên laptop và điện thoại. | Icon đúng ngày; hover/chạm xem tên; +N phản ánh số challenge bị ẩn và mở được toàn bộ danh sách, không bỏ sót challenge. |
| AC-030 | FR-023, FR-034, FR-036 | Tạo/kết thúc một sự kiện nhưng không Done challenge; sau đó ghi bù rồi bỏ Done một ngày cũ. | Sự kiện không tự Done; challenge chưa hoàn thành không có icon lịch thực hiện. Ghi bù thêm icon đúng ngày, bỏ Done xóa icon đó và cập nhật số +N nếu có. |

### 11.6. Sao lưu và kiểm chứng tổng thể

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-031 | FR-040, FR-041, FR-042; NFR-008 | Chuẩn bị dữ liệu gồm vở/ghi chú, challenge hoạt động/lưu trữ cùng ngày lưu trữ, Done/nhật ký, các giai đoạn mục tiêu, mục tiêu còn đang chờ của challenge hoạt động, kỷ lục ngày/tuần, sự kiện và múi giờ; xuất rồi nhập có kiểm soát. | Phục hồi đúng toàn bộ dữ liệu và kết quả lịch sử/kỷ lục/chuỗi khi kết thúc theo dõi, quan hệ ghi chú–vở; giữ mục tiêu còn đang chờ và ngày/trạng thái lưu trữ; không khôi phục lại mục tiêu đã bị hủy lúc lưu trữ thành mục tiêu chờ. |
| AC-032 | FR-041 | Dữ liệu hiện tại có một mục không nằm trong bản sao lưu; bắt đầu nhập rồi hủy trước xác nhận. Lần khác xác nhận nhập cùng bản sao. | Trước khi nhập có cảnh báo thay thế toàn bộ. Hủy giữ nguyên dữ liệu hiện tại; xác nhận nhập thành công đưa dữ liệu về bản sao, không giữ mục mới theo cách gộp. |
| AC-033 | NFR-001, NFR-002, NFR-010 | Chủ sản phẩm thực hiện UJ-001–009 trên laptop/điện thoại thực tế; giải thích ví dụ 4/3 ngày, streak tuần/ngày, tuần khởi động và mục tiêu chờ. | Hoàn thành không cần hướng dẫn trực tiếp; chức năng quan trọng dùng được bằng chạm; hiểu đúng các khái niệm mà không cần công cụ tính ngoài. Ghi lại lỗi và điểm gây khó hiểu. |
| AC-034 | NFR-003, NFR-004, NFR-006, NFR-008; GOAL-001–006 | Thử nghiệm ba tuần đầy đủ với ít nhất một challenge 3/7 và một challenge 7/7. | Đạt các bằng chứng mục 2: ghi nhận cả ba tuần, có tuần dùng hai thiết bị, ít nhất ba lần dùng lại ghi chú và ba sự kiện thực tế, không ghi nhận mất dữ liệu, có đánh giá tiếp tục sử dụng và danh sách điều chỉnh. |

### 11.7. Nghiệm thu bổ sung cho ba quyết định Quality Review

| ID | Requirement liên quan | Điều kiện và hành động | Kết quả nghiệm thu |
|---|---|---|---|
| AC-035 | FR-013, FR-017, FR-019, FR-023, FR-042 | Challenge 3/7 có chuỗi hai tuần trước tuần hiện tại, Done hai ngày trong tuần rồi lưu trữ thứ Năm; sau đó đi qua các tuần tiếp theo. Ghi bù một ngày hợp lệ trong tuần cuối để đủ ba ngày, rồi bỏ Done lại. | Ban đầu hiển thị “Chuỗi khi kết thúc theo dõi: 2 tuần”, tuần cuối chưa đạt mang trạng thái kết thúc theo dõi; không tự giảm theo thời gian. Ghi bù đủ mục tiêu cho 3 tuần; bỏ Done lại cho 2 tuần. Nếu đã đạt tuần cuối trước khi lưu trữ thì tuần đó được tính ngay. Tuần thất bại đã kết thúc trước tuần lưu trữ vẫn ngắt chuỗi bình thường. |
| AC-036 | FR-013, FR-018, FR-019, FR-023, FR-042 | Challenge 7/7 có chuỗi năm ngày đến hôm trước ngày lưu trữ; lưu trữ khi ngày hiện tại chưa Done. Sau đó ghi bù chính ngày lưu trữ và bỏ Done lại; kiểm tra thêm lịch sử có một ngày bỏ lỡ trước ngày lưu trữ. | Chuỗi khi kết thúc theo dõi ban đầu là 5 ngày; ghi bù ngày lưu trữ cho 6 ngày; bỏ Done lại cho 5 ngày, không mất nhật ký. Thời gian trôi qua không làm giảm chuỗi; ngày bỏ lỡ trước ngày lưu trữ vẫn ngắt chuỗi theo lịch sử thực tế, không được bỏ qua. |
| AC-037 | FR-016, FR-022, FR-042 | Lưu trữ challenge 3/7 và 7/7 trong tuần khởi động dù có Done. Trường hợp khác lưu trữ sau khi đã chuyển nhóm mục tiêu. | Trong tuần khởi động giữ hoạt động nhưng chuỗi khi kết thúc bằng 0. Sau chuyển nhóm, không lấy chuỗi ở nhóm cũ nối vào chuỗi kết thúc của nhóm mới; vẫn giữ kỷ lục đúng đơn vị. |
| AC-038 | FR-010, FR-011, FR-012, FR-013, FR-023, FR-042 | Với challenge đã lưu trữ, ghi bù/bỏ Done và sửa nhật ký cho ngày từ ngày bắt đầu đến ngày lưu trữ; thử ngày trước ngày bắt đầu và ngày sau ngày lưu trữ, kể cả khi ngày sau đó đã thành quá khứ. | Chỉ khoảng ngày bắt đầu–ngày lưu trữ được chỉnh sửa; không nhận các ngày ngoài khoảng. Thay đổi hợp lệ cập nhật lịch sử, tiến độ, chuỗi kết thúc, kỷ lục và icon; bỏ Done giữ nhật ký. |
| AC-039 | FR-009, FR-012, FR-043; NFR-003, NFR-006 | Hai thiết bị cùng yêu cầu Done cho một challenge/ngày; trong trường hợp riêng, cả hai cùng yêu cầu bỏ Done. | Cùng Done cho đúng một ngày hoàn thành; cùng bỏ Done cho chưa hoàn thành; không có yêu cầu giải quyết xung đột trong hai trường hợp cùng kết quả, nhật ký được giữ. |
| AC-040 | FR-023, FR-043; NFR-006 | Một thiết bị đã lưu thay đổi trạng thái challenge/ngày, thiết bị kia gửi yêu cầu đối nghịch dựa trên trạng thái chưa cập nhật. Kiểm tra riêng lựa chọn giữ Done và lựa chọn giữ chưa Done. | Báo xung đột, cho chọn “Đã hoàn thành”/“Chưa hoàn thành”. Khi chưa chọn, giữ trạng thái đã lưu thành công gần nhất và báo thao tác xung đột chưa áp dụng. Sau chọn, hai thiết bị đồng bộ cùng kết quả; tiến độ, streak, kỷ lục và icon được tính lại, nhật ký không mất. |
| AC-041 | FR-012, FR-043 | Người dùng đã nhìn thấy trạng thái cập nhật từ thiết bị kia rồi chủ động đổi lại. | Xử lý thay đổi bình thường, không yêu cầu giải quyết xung đột chỉ vì thao tác trước đó đến từ thiết bị khác; bỏ Done giữ nhật ký. |
| AC-042 | FR-041, FR-044; NFR-008 | Chọn lần lượt bản sao hỏng, thiếu dữ liệu, phiên bản không được hỗ trợ và bản sao hợp lệ. Với bản hợp lệ, xem thông tin rồi hủy trước xác nhận. | Bản không hợp lệ bị từ chối với lý do, không thay đổi dữ liệu. Bản hợp lệ được kiểm tra trước khi cho xác nhận; có thông tin bản sao và cảnh báo thay thế toàn bộ. Hủy giữ nguyên dữ liệu hiện tại. |
| AC-043 | FR-041, FR-045; NFR-008 | Sau khi xác nhận nhập, gây lỗi nhập trong lần thử có kiểm soát, gồm trường hợp lỗi phát sinh khi quá trình nhập đã bắt đầu xử lý dữ liệu. | Khi xác định nhập thất bại, toàn bộ dữ liệu đã lưu trước nhập vẫn nguyên vẹn, không có kết quả thay thế một phần; báo thất bại và cho thử lại. Khi thử lại thành công, phục hồi toàn bộ theo AC-031. |
| AC-044 | FR-041, FR-046; NFR-006 | Trong lúc nhập sau xác nhận, thử sửa/Done/xóa dữ liệu từ cả hai thiết bị; sau nhập thành công, tiếp tục thao tác trên thiết bị còn lại đang có dữ liệu cũ. | Tạm ngăn thay đổi trong lúc nhập trên cả hai thiết bị. Thiết bị còn lại phải cập nhật dữ liệu sau khôi phục trước khi ghi tiếp; không ghi dữ liệu cũ đè lên kết quả khôi phục. |
| AC-045 | FR-045, FR-046; NFR-008 | Mất kết nối trên thiết bị nhập sau xác nhận, trước khi nhận kết quả; kết nối lại. Thử riêng tình huống quá trình nhập đã thành công và tình huống đã thất bại. | Hiển thị “Chưa xác định được kết quả nhập”, không tự kết luận thành công/thất bại. Khi có mạng phải kiểm tra kết quả trước khi cho nhập lại hoặc sửa dữ liệu: thành công hiển thị dữ liệu phục hồi đầy đủ, thất bại giữ nguyên dữ liệu trước nhập và cho thử lại. |

### 11.8. Điều kiện baseline và nghiệm thu

- Chủ sản phẩm đã phê duyệt PRD v1.1 làm baseline chính thức của MVP v1 ngày 2026-09-12. Việc này không đồng nghĩa phần mềm đã được triển khai hoặc nghiệm thu.
- Ba FAIL của Quality Review đã có phương án được duyệt và yêu cầu/AC tương ứng; DEP-003 và DEP-004 đã đóng ở mức quyết định sản phẩm.
- Các WARNING còn lại được chấp nhận tại baseline theo mục 13.4. Không yêu cầu review lại chỉ để chốt baseline; không tự bổ sung scope hoặc ngưỡng chưa được cung cấp.
- Các AC cụ thể là cơ sở nghiệm thu khi triển khai được cho phép. Với phép đo chưa có ngưỡng, ghi kết quả thực tế và trạng thái chưa định lượng; việc chấp nhận WARNING không biến phép đo đó thành kết quả PASS.
- Chưa có kết quả kiểm thử phần mềm hay dữ liệu dùng thử trong lần cập nhật tài liệu này.

## 12. Risks

| ID | Rủi ro và ảnh hưởng | Hướng xử lý ở mức sản phẩm | Liên quan |
|---|---|---|---|
| RISK-001 | Ba mảng tính năng làm MVP quá lớn hoặc mất trọng tâm. | Giữ thứ tự ưu tiên, phạm vi ghi chú/lịch cơ bản và đánh giá mọi đề xuất mới theo mục 8–9. | Toàn bộ Epic |
| RISK-002 | Người dùng nhầm tiến độ tuần với streak ngày/tuần. | Luôn ghi đơn vị và mốc hiệu lực; kiểm chứng khả năng giải thích bằng AC-013–022, AC-033. | EPIC-003; NFR-010 |
| RISK-003 | Ghi bù, chuyển mục tiêu, biên thời gian hoặc lưu trữ làm sai lịch sử/kỷ lục. | Đánh giá theo mục tiêu từng giai đoạn; kiểm chứng lưu trữ theo FR-042 và AC-035–038. DEP-001–002 còn được theo dõi; DEP-003 đã đóng. | EPIC-002, EPIC-003 |
| RISK-004 | Hai thiết bị sửa đồng thời hoặc mất mạng gây ghi đè/mất nội dung. | Trạng thái lưu trung thực, chọn nội dung khi xung đột, giữ bản đang nhập trong phiên; áp dụng FR-043 và AC-039–041 cho Done/bỏ Done. | EPIC-001; DEP-004 đã đóng |
| RISK-005 | Lộ dữ liệu hoặc sao lưu thiếu khiến không thể tin ứng dụng. | Kiểm chứng truy cập và xuất/nhập với toàn bộ loại dữ liệu, gồm các giai đoạn mục tiêu và kỷ lục. | EPIC-001, EPIC-006 |
| RISK-006 | Người dùng hiểu nhầm nhập sao lưu là gộp, làm mất dữ liệu mới hơn. | Cảnh báo rõ thay thế toàn bộ và yêu cầu xác nhận; kiểm chứng cả nhánh hủy và xác nhận. | FR-041; AC-032 |
| RISK-007 | Icon dày hoặc phụ thuộc hover làm lịch khó dùng trên điện thoại. | Giới hạn icon, +N, chạm để xem thông tin và thử trên thiết bị thực tế. | EPIC-005; NFR-002 |
| RISK-008 | Một người dùng thử tạo kết luận quá sớm về thị trường. | Chỉ xác nhận giá trị cá nhân; nghiên cứu nhóm mở rộng trước quyết định phục vụ nhiều người. | GOAL-006; Future Scope |
| RISK-009 | Mục tiêu hiệu năng chưa đủ điều kiện đo dẫn đến đánh giá không nhất quán. | Ghi dữ liệu, thiết bị, mạng, mốc bắt đầu/kết thúc phép đo và ngưỡng trước nghiệm thu hiệu năng. | NFR-009; DEP-005–006 |
| RISK-010 | Nhập sao lưu lỗi hoặc mất kết nối gây dữ liệu thay thế một phần hoặc nhập lại khi kết quả chưa rõ. | Kiểm tra bản sao, giữ nguyên dữ liệu khi thất bại, ngăn thay đổi trong lúc nhập và xác định kết quả trước khi tiếp tục; kiểm chứng AC-042–045. | EPIC-006; FR-044–046 |

## 13. Dependencies

### 13.1. Phụ thuộc và trạng thái quyết định

Những điểm này được kế thừa từ Brief §10.2 hoặc là điều kiện để kiểm chứng yêu cầu đã có. DEP-003 và DEP-004 được giữ ID để truy vết nhưng đã đóng bởi quyết định review mới. Các thông tin chưa xác định còn lại và WARNING được chấp nhận khi chốt baseline; giữ nguyên trạng thái thực tế, không tự chọn thêm giá trị hoặc coi là lý do phải mở lại baseline.

| ID | Nội dung cần xác định | Trạng thái hiện tại | Thời điểm cần / phần bị ảnh hưởng |
|---|---|---|---|
| DEP-001 | Phạm vi ngày bắt đầu khác hôm nay và quyền sửa ngày bắt đầu sau khi có hoạt động. | Chỉ đã chốt mặc định hôm nay và dùng ngày bắt đầu làm mốc tuần khởi động. | Trước đặc tả/triển khai khả năng chọn hoặc sửa ngày bắt đầu ngoài luồng mặc định; FR-007–008, FR-011, FR-016. |
| DEP-002 | Múi giờ tài khoản cụ thể. | Đã chốt một múi giờ cố định, dùng chung thiết bị; giá trị chưa được cung cấp. Không tự lấy múi giờ của máy làm quyết định sản phẩm. | Trước cấu hình tài khoản và nghiệm thu ngày/tuần/lịch; FR-006 và các AC thời gian. |
| DEP-003 | Mốc dừng đánh giá streak khi lưu trữ, phạm vi sửa lịch sử sau lưu trữ và xử lý mục tiêu đang chờ. | Đã đóng ngày 2026-09-12: chốt theo ngày lưu trữ, chỉ sửa từ ngày bắt đầu đến ngày lưu trữ, hủy mục tiêu chờ; FR-013, FR-042. | Áp dụng trực tiếp baseline; kiểm chứng AC-011, AC-035–038. |
| DEP-004 | Cách giải quyết Done và bỏ Done gần đồng thời từ hai thiết bị. | Đã đóng ngày 2026-09-12: thao tác cùng kết quả không xung đột; thao tác đối nghịch từ trạng thái chưa cập nhật yêu cầu người dùng chọn, theo FR-043. | Áp dụng trực tiếp baseline; kiểm chứng AC-039–041. |
| DEP-005 | Laptop/điện thoại, hệ điều hành và trình duyệt dùng thử. | Đã duyệt dùng thiết bị thực tế của chủ sản phẩm; danh sách chưa có. | Trước kiểm chứng tương thích và usability; NFR-001–002, AC-033. |
| DEP-006 | Độ trễ đồng bộ chấp nhận được; cách đo và ngưỡng hiệu năng tìm kiếm. | Tìm kiếm có mục tiêu ban đầu khoảng một giây/1.000 ghi chú ngắn; chưa chốt độ dài ghi chú, mạng, số lần đo hoặc percentile. Chưa có ngưỡng đồng bộ. | Trước nghiệm thu NFR-006, NFR-009; không ghi thành SLA trong PRD hiện tại. |
| DEP-007 | Ngân sách, ngày bắt đầu thử và hạn phát hành. | Chưa cung cấp; thời lượng thử ba tuần đầy đủ đã duyệt. | Trước cam kết lịch phát hành và kế hoạch thử có ngày cụ thể. |
| DEP-008 | Phương thức truy cập tài khoản và điều kiện vận hành web trực tuyến. | Yêu cầu kiểm soát truy cập/đồng bộ đã rõ; chưa chọn phương thức đăng nhập, công nghệ hoặc nhà cung cấp. | Khi chủ sản phẩm cho phép giai đoạn thiết kế tiếp theo; PRD chỉ định nghĩa kết quả cần đạt. |
| DEP-009 | Bộ dữ liệu nghiệm thu và bản sao lưu dùng kiểm chứng. | Chưa tạo dữ liệu thử. Cần đủ trường hợp challenge 3/7, 7/7, chuyển nhóm, ghi bù, lưu trữ, vở/ghi chú và sự kiện qua ngày. | Trước thực thi bộ AC và kiểm chứng phục hồi; không cần dữ liệu cá nhân thật để review tài liệu. |

### 13.2. Điều kiện sử dụng

- Người dùng có laptop, điện thoại và kết nối mạng để thao tác MVP.
- Tài khoản dùng cùng múi giờ và truy cập được dữ liệu sản phẩm trên cả hai thiết bị.
- Người dùng giữ được bản sao lưu đã xuất để thực hiện khôi phục khi cần.
- Khi bước thiết kế được cho phép, mọi lựa chọn triển khai phải đáp ứng FR/NFR và được đánh giá riêng; PRD không yêu cầu một framework, database, API hoặc nhà cung cấp cụ thể.

### 13.3. Quyết định xử lý FAIL đã được duyệt

| Quyết định | Nội dung baseline được duyệt ngày 2026-09-12 | Requirement / nghiệm thu |
|---|---|---|
| Review FAIL-1 | Lưu trữ ngay, giữ lịch sử và sửa sai đến ngày lưu trữ; hủy mục tiêu chờ; chốt chuỗi theo ngày lưu trữ, không tự giảm theo thời gian, tính lại khi sửa lịch sử; không mở lại. | FR-011–013, FR-019–020, FR-023, FR-042; AC-011, AC-035–038 |
| Review FAIL-2 | Cùng Done hoặc cùng bỏ Done không xung đột; hai yêu cầu đối nghịch từ dữ liệu chưa cập nhật cần người dùng chọn; giữ trạng thái đã lưu gần nhất trong lúc chờ, đồng bộ và tính lại sau chọn; bỏ Done giữ nhật ký. | FR-009, FR-012, FR-023, FR-043; AC-010, AC-039–041 |
| Review FAIL-3 | Kiểm tra bản sao trước xác nhận; thành công thay thế toàn bộ, thất bại giữ nguyên dữ liệu trước nhập; tạm ngăn ghi trên hai thiết bị; khi mất kết nối phải xác định kết quả trước khi nhập lại hoặc sửa. | FR-040–041, FR-044–046, NFR-008; AC-031–032, AC-042–045 |

### 13.4. WARNING được chấp nhận tại baseline MVP v1

Chủ sản phẩm quyết định giữ baseline hiện tại sau khi xử lý ba FAIL, chấp nhận các WARNING còn lại mà chưa yêu cầu điều chỉnh. Danh sách này ghi nhận giới hạn đã biết; không bổ sung requirement hoặc tự chốt chi tiết chưa có.

- NFR về độ trễ đồng bộ, hiệu năng tìm kiếm và danh sách thiết bị kiểm thử còn thiếu mức đo/điều kiện cụ thể; DEP-005–006 tiếp tục được theo dõi.
- Phạm vi ngày bắt đầu khác hôm nay và quyền sửa ngày bắt đầu vẫn chưa chốt tại DEP-001; múi giờ cụ thể vẫn chưa được cung cấp tại DEP-002.
- Thời điểm tự lưu, hành vi rời màn hình khi đang lưu và quy tắc trường được để trống chưa được mở rộng trong lần cập nhật này. Riêng bỏ Done giữ nhật ký đã được chốt trong Review FAIL-2.
- Định nghĩa chi tiết xung đột nội dung văn bản, phạm vi đối tượng và sửa đối nghịch với xóa vẫn giữ như bản trước; quy tắc xung đột Done/bỏ Done đã được chốt riêng.
- Cách khớp truy vấn nhiều từ trong tìm kiếm chưa bổ sung; giữ yêu cầu không phân biệt hoa/thường và dấu đã có.
- Nội dung lặp giữa FR/NFR/AC và phụ thuộc hai chiều EPIC-002/EPIC-003 được chấp nhận; giữ nguyên sáu Epic, đối chiếu khi phân rã công việc ở giai đoạn được cho phép.
- Cách diễn đạt “nhắc lịch” trong Out of Scope và “nhắc thực hiện challenge” trong Future Scope giữ nguyên; Future Scope vẫn không phải cam kết MVP.

Việc chấp nhận WARNING không có nghĩa các thuộc tính chưa đo đã đạt kiểm thử; không phát sinh yêu cầu code, architecture hoặc bổ sung tính năng trong lần chốt này.

## 14. Future Scope

Các hướng dưới đây chỉ được xem xét sau khi có bằng chứng từ MVP; không phải cam kết roadmap hoặc điều kiện hoàn thành các Epic hiện tại.

| Hướng mở rộng | Bằng chứng cần trước khi đưa vào phạm vi |
|---|---|
| Nhắc thực hiện challenge hoặc cảnh báo tuần sắp hết. | Người dùng thường bỏ quên dù luồng ghi nhận hiện tại đã dễ sử dụng. |
| Thống kê xu hướng và tổng kết tuần nâng cao. | Tiến độ/lịch sử cơ bản không đủ cho nhu cầu nhìn lại thực tế. Streak ngày cho 7/7 đã thuộc MVP. |
| Theo dõi định lượng: lượng nước, thời gian học, nhiều buổi. | Nhu cầu đo lượng hoạt động được xác nhận; cần quy tắc mới, không tự suy từ Done. |
| Challenge theo thứ cố định, tạm nghỉ hoặc quy tắc linh hoạt hơn. | Quy tắc N/7 và lưu trữ hiện tại không đáp ứng các tình huống dùng thật. |
| Liên kết ghi chú–challenge, lên lịch thực hiện và sự kiện lặp. | Người dùng cần chuyển qua lại/lập kế hoạch thường xuyên đến mức đáng mở rộng mô hình đơn giản. |
| Đồng bộ lịch ngoài. | Có nhu cầu hợp nhất lịch thực tế và chấp nhận thêm phạm vi tích hợp. |
| Ngoại tuyến, PWA hoặc native. | Hạn chế trực tuyến/giao diện web gây trở ngại rõ trong thử nghiệm. |
| Định dạng ghi chú, đính kèm, tag hoặc liên kết kiến thức. | Văn bản thuần túy, vở một cấp và tìm từ khóa đã không còn đủ. |
| Mở rộng cho sinh viên, developer và người tự học khác. | Nghiên cứu/thử nghiệm bên ngoài xác nhận nhu cầu trước khi mở nhiều tài khoản hoặc đăng ký công khai. |

---

**Baseline chính thức:** PRD v1.1 đã được chủ sản phẩm phê duyệt làm baseline cho MVP v1 ngày 2026-09-12, bao gồm ba quyết định xử lý FAIL và việc chấp nhận các WARNING còn lại. Không còn chờ review để chốt baseline. Lần cập nhật này chỉ sửa PRD; chưa viết code, tạo architecture hoặc chia implementation stories.
