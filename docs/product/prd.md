# NoteFlow — Product Requirements Document

- **Phiên bản:** 1.0.
- **Ngày tạo:** 2026-09-11.
- **Trạng thái:** PRD chính thức được lập theo yêu cầu của chủ sản phẩm; chờ chủ sản phẩm review, chưa được phê duyệt triển khai.
- **Product Owner:** Chủ sản phẩm NoteFlow.
- **Nguồn phạm vi:** [Project Brief v1.3](project-brief.md), bao gồm các khuyến nghị Q1–Q12 đã được duyệt.
- **Ngôn ngữ:** Tiếng Việt.
- **Phạm vi tài liệu:** Yêu cầu sản phẩm và nghiệm thu MVP; không quyết định công nghệ, architecture, mô hình dữ liệu hoặc kế hoạch code.

Yêu cầu mới nhất của chủ sản phẩm cho phép chuyển từ Project Brief sang PRD. Các ghi chú “chưa tạo PRD” trong brief mô tả điểm dừng của giai đoạn trước. Phạm vi sản phẩm trong brief vẫn là cơ sở của tài liệu này.

Các FR, NFR và Epic dùng ID duy nhất, ổn định trong PRD. Mỗi FR có một Epic chịu trách nhiệm chính và được đối chiếu với tiêu chí nghiệm thu ở mục 11. Các chi tiết chưa xác định trong brief được giữ tại mục 13; việc lập PRD không tự biến chúng thành quyết định đã được duyệt.

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
| UJ-007 | Lưu dữ liệu trên laptop → mở điện thoại → tiếp tục sử dụng. | Cùng dữ liệu và ngày/tuần; báo lỗi khi chưa lưu; xung đột nội dung cho người dùng chọn bản giữ. | EPIC-001 |
| UJ-008 | Lưu trữ challenge → xem lại lịch sử → sửa một ghi nhận sai. | Challenge không còn trong danh sách đang hoạt động; lịch sử còn truy cập được; không có thao tác mở lại trong MVP. | EPIC-002, EPIC-003 |
| UJ-009 | Xuất sao lưu → nhập bản sao → đọc cảnh báo thay thế → xác nhận → kiểm tra dữ liệu. | Phục hồi đúng toàn bộ dữ liệu sản phẩm, gồm lịch sử mục tiêu và kỷ lục đúng đơn vị. | EPIC-006 |

Khi mất mạng giữa lúc nhập, người dùng thấy trạng thái chưa lưu, nội dung đang nhập được giữ trong phiên để thử lại khi có mạng. Luồng này không cung cấp khả năng thao tác ngoại tuyến hoặc bảo đảm giữ bản chưa lưu sau khi đóng/tải lại trang.

## 6. Functional Requirements

Tất cả FR dưới đây thuộc MVP. “Epic chính” là nơi chịu trách nhiệm về kết quả người dùng, không chỉ định cấu trúc triển khai. Dẫn chiếu “Brief §…” dùng phiên bản 1.3.

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
| FR-009 | Done cho một ngày không bắt buộc nhật ký. Mỗi challenge chỉ được tính một lần/ngày; bấm lặp hoặc Done cùng ngày từ hai thiết bị không tạo thêm ngày hoàn thành. | EPIC-002 | Brief §8.1, §12 |
| FR-010 | Ghi và sửa nhật ký gắn với ngày của challenge; chỉ nhập nhật ký không tự đánh dấu Done. Nhật ký được giữ trong challenge, không tự chuyển thành ghi chú riêng. | EPIC-002 | Brief §8.1–2 |
| FR-011 | Cho ghi bù ngày thực hiện từ ngày bắt đầu đến hôm nay; không cho Done trước ngày bắt đầu hoặc trong tương lai. Phạm vi sửa lịch sử sau lưu trữ được ghi tại DEP-003. | EPIC-002 | Brief §8.1, Q2 |
| FR-012 | Cho bỏ Done khi đánh dấu nhầm; cập nhật trạng thái hoàn thành và yêu cầu tính lại các kết quả liên quan theo FR-023. | EPIC-002 | Brief §8.1 |
| FR-013 | Cho lưu trữ challenge khi ngừng theo dõi, giữ khả năng xem/sửa lịch sử để sửa sai; loại khỏi danh sách đang hoạt động và không hỗ trợ mở lại trong MVP. Các quy tắc thời gian khi lưu trữ thuộc DEP-003. | EPIC-002 | Brief §8.1, Q6 |

### 6.3. Tiến độ, streak và thay đổi mục tiêu

| ID | Requirement | Epic chính | Nguồn |
|---|---|---|---|
| FR-014 | Hiển thị số ngày đã Done trên mục tiêu của tuần đó; cho tiếp tục ghi nhận sau khi đạt mục tiêu, ví dụ 4/3, tối đa bảy ngày trong tuần. | EPIC-003 | Brief §8.1 |
| FR-015 | Hiển thị lịch sử hoàn thành theo ngày và kết quả theo tuần; dùng mục tiêu có hiệu lực tại thời điểm tương ứng để đánh giá lịch sử. | EPIC-003 | Brief §8.1 |
| FR-016 | Lấy ngày bắt đầu làm mốc tuần khởi động: bắt đầu giữa tuần thì lưu hoạt động nhưng chưa cộng/ngắt streak, bắt đầu tính từ thứ Hai tiếp theo; bắt đầu thứ Hai thì tính ngay. Áp dụng cho cả 1–6/7 và 7/7. | EPIC-003 | Brief §8.1, Q3 |
| FR-017 | Với 1–6/7, tính streak theo số tuần liên tiếp đạt mục tiêu. Tuần đang diễn ra chưa đạt không ngắt chuỗi; đạt mục tiêu thì cộng một tuần; hết tuần chưa đạt thì ngắt. Ghi thêm ngày sau khi đạt không cộng thêm tuần streak. | EPIC-003 | Brief §8.1, Q2 |
| FR-018 | Với 7/7, tính streak theo ngày Done liên tiếp từ mốc tính streak; không đặt lại khi chuyển tuần. Hôm nay chưa Done vẫn giữ chuỗi từ hôm qua đến hết hôm nay; bỏ lỡ trọn ngày thì ngắt. Vẫn hiển thị tiến độ và kết quả tuần. | EPIC-003 | Brief §8.1, Q2 |
| FR-019 | Hiển thị chuỗi hiện tại và dài nhất với đơn vị rõ ràng. Kỷ lục dài nhất xét toàn bộ lịch sử cùng đơn vị, giữ các kỷ lục ngày/tuần cũ; không quy đổi hoặc cộng ngày với tuần. | EPIC-003 | Brief §8.1, Q7 |
| FR-020 | Thay đổi mục tiêu có hiệu lực từ thứ Hai tuần sau. Chỉ có một mục tiêu chờ; sửa tiếp thay thế mục tiêu chờ, cho hủy trước hiệu lực; hiển thị mục tiêu hiện tại, mục tiêu chờ và thời điểm áp dụng. | EPIC-003 | Brief §8.1, Q5 |
| FR-021 | Đổi trong nhóm 1–6/7 tiếp tục chuỗi tuần theo kết quả đạt mục tiêu; bản thân việc đổi không đặt lại hoặc khôi phục chuỗi đã ngắt, không đổi mục tiêu dùng để đánh giá tuần cũ. | EPIC-003 | Brief §8.1 |
| FR-022 | Chuyển giữa 1–6/7 và 7/7 bắt đầu chuỗi hiện tại từ 0 khi mục tiêu mới có hiệu lực, sau đó tăng theo đơn vị mới; không thêm tuần khởi động, không nối với chuỗi trước kể cả khi quay lại nhóm cũ. | EPIC-003 | Brief §8.1 |
| FR-023 | Khi ghi bù/bỏ Done, tính lại tiến độ, lịch sử, chuỗi hiện tại và kỷ lục bị ảnh hưởng theo mục tiêu từng giai đoạn; không nối streak qua mốc chuyển đơn vị. Lịch cá nhân phản ánh trạng thái Done đã sửa. | EPIC-003 | Brief §8.1, §8.3 |

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
| FR-040 | Xuất bản sao lưu toàn bộ dữ liệu sản phẩm: vở, ghi chú, challenge/trạng thái lưu trữ, Done/nhật ký, mục tiêu từng giai đoạn và mục tiêu chờ, sự kiện, múi giờ và dữ liệu cần phục hồi lịch sử/kỷ lục. | EPIC-006 | Brief §8.4, Q10 |
| FR-041 | Nhập bản sao lưu để thay thế toàn bộ dữ liệu sản phẩm hiện tại sau cảnh báo rõ và xác nhận của người dùng; không gộp. Phục hồi đúng các dữ liệu thuộc FR-040. | EPIC-006 | Brief §8.4, Q10 |

## 7. Non-Functional Requirements

| ID | Thuộc tính | Requirement và cách kiểm chứng | Nguồn |
|---|---|---|---|
| NFR-001 | Dễ sử dụng | Chủ sản phẩm hoàn thành các journey chính trên hai thiết bị mà không cần hướng dẫn trực tiếp. Từ Hôm nay, Done chỉ cần một thao tác, không bắt nhập nội dung. Kiểm chứng qua quan sát và ghi lại điểm gây khó hiểu. | Brief §12 |
| NFR-002 | Tương thích thiết bị | Giao diện web thích ứng laptop/điện thoại; các chức năng quan trọng thao tác được bằng chạm và không phụ thuộc riêng hover. Chạy các journey trên thiết bị/trình duyệt thực tế ghi tại DEP-005. | Brief §6, §9 |
| NFR-003 | Tính đúng đắn | Kết quả ngày, tuần, tiến độ và streak phải thỏa các tình huống mục 11, kể cả biên tuần, ghi bù, bỏ Done, đổi mục tiêu và Done từ hai thiết bị; không có lỗi đếm trùng trong bộ nghiệm thu. | Brief §8.1, §12 |
| NFR-004 | Độ bền dữ liệu đã lưu | Nội dung được báo đã lưu vẫn đúng sau tải lại và khi mở trên thiết bị khác. Kiểm chứng cả ghi chú, nhật ký, Done, mục tiêu và sự kiện; không đánh đồng nội dung còn trong phiên với dữ liệu đã lưu. | Brief §2, §11–12 |
| NFR-005 | Trung thực về trạng thái | Không hiển thị đã lưu khi lưu thất bại. Trong thử nghiệm mất mạng/lỗi lưu, người dùng nhận biết dữ liệu chưa lưu và có thể thử lại trong phiên theo FR-005. | Brief §8.4, §11 |
| NFR-006 | Nhất quán đồng bộ | Hai thiết bị trực tuyến đạt cùng trạng thái dữ liệu sau đồng bộ hoặc sau khi người dùng giải quyết xung đột. Không âm thầm mất nội dung do sửa đồng thời. Ngưỡng độ trễ chưa chốt tại DEP-006. | Brief §8.4, §12 |
| NFR-007 | Riêng tư | Trong kiểm tra truy cập, người chưa được xác thực/không được phép không đọc hoặc sửa được dữ liệu cá nhân, kể cả khi truy cập trực tiếp nội dung thay vì qua điều hướng giao diện. Không bổ sung chia sẻ công khai. | Brief §9, §11 |
| NFR-008 | Khả năng phục hồi | Một lượt xuất/nhập có kiểm soát phục hồi đầy đủ và đúng nội dung, quan hệ ghi chú–vở, mục tiêu từng giai đoạn, mục tiêu chờ, múi giờ, lịch sử và kỷ lục. Việc nhập không được coi là thành công khi dữ liệu phục hồi thiếu hoặc sai. | Brief §8.4, §12 |
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
| Bảo toàn dữ liệu | Trạng thái lưu/đồng bộ, xử lý xung đột nội dung, giữ bản đang nhập trong phiên khi mất mạng, xuất/nhập toàn bộ. | Xuyên suốt |

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
| EPIC-001 | **Truy cập và sử dụng dữ liệu cá nhân trên hai thiết bị.** Người dùng truy cập riêng tư, dùng cùng dữ liệu và hiểu trạng thái lưu/đồng bộ. | FR-001–006 | Truy cập được kiểm soát; dữ liệu nhất quán giữa hai thiết bị; lỗi lưu/mất mạng/xung đột nội dung được xử lý rõ; cùng ngày và tuần tài khoản. |
| EPIC-002 | **Theo dõi challenge hằng ngày.** Người dùng tạo và quản lý challenge, Done nhanh, ghi nhật ký, sửa ghi nhận và lưu trữ. | FR-007–013, FR-037 | Luồng Hôm nay → Done hoạt động bằng một thao tác; không đếm trùng; ghi bù/bỏ Done và xem lại challenge lưu trữ đáp ứng các quy tắc được chốt. |
| EPIC-003 | **Tiến độ, streak và điều chỉnh mục tiêu.** Người dùng hiểu và tin lịch sử, kỷ lục và tác động của thay đổi mục tiêu. | FR-014–023 | Các tình huống streak tuần/ngày, tuần khởi động, sửa lịch sử và chuyển mục tiêu đạt mục 11; đơn vị rõ và không nối chuỗi qua mốc chuyển nhóm. |
| EPIC-004 | **Lưu và tìm lại kiến thức.** Người dùng ghi nhanh, tổ chức trong vở, tự lưu và tìm lại ghi chú. | FR-024–030, FR-039 | CRUD ghi chú, quản lý/chuyển vở, bảo vệ vở mặc định, tự lưu và tìm kiếm không dấu hoạt động trên hai thiết bị. |
| EPIC-005 | **Lịch cá nhân và hoạt động theo ngày.** Người dùng quản lý sự kiện và xem challenge đã hoàn thành trên lịch. | FR-031–036, FR-038 | CRUD sự kiện, sự kiện qua ngày, lịch tháng/ngày, Hôm nay và icon/+N hoạt động bằng hover/chạm; sự kiện độc lập với Done. |
| EPIC-006 | **Sao lưu và khôi phục dữ liệu.** Người dùng chủ động giữ bản sao và phục hồi đầy đủ dữ liệu cá nhân. | FR-040–041 | Xuất/nhập có kiểm soát khôi phục đúng toàn bộ dữ liệu và kết quả lịch sử; nhập thay thế có cảnh báo/xác nhận, không gộp. |

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
| AC-010 | FR-012, FR-014, FR-023 | Challenge 3/7 đang có 3/3 ngày trong tuần hiện tại; bỏ Done một ngày trong tuần. | Tiến độ thành 2/3; trạng thái ngày, kết quả tuần, streak và icon lịch được tính lại; không giữ kết quả 3/3 cũ. |
| AC-011 | FR-013, FR-037 | Lưu trữ challenge đang hoạt động, sau đó mở lại lịch sử để xem/sửa một nội dung nhật ký đã có. | Challenge không còn trong danh sách đang hoạt động trên Hôm nay; lịch sử vẫn còn và nội dung sửa được lưu; không có chức năng mở lại challenge. Cách dừng streak, phạm vi sửa Done và mục tiêu chờ sau lưu trữ được nghiệm thu sau khi DEP-003 được chốt. |
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
| AC-031 | FR-040, FR-041; NFR-008 | Chuẩn bị dữ liệu gồm vở/ghi chú, challenge hoạt động/lưu trữ, Done/nhật ký, các giai đoạn mục tiêu, mục tiêu chờ, kỷ lục ngày/tuần, sự kiện và múi giờ; xuất rồi nhập trong lần thử có kiểm soát. | Phục hồi đúng toàn bộ dữ liệu và kết quả tính lịch sử, kỷ lục, quan hệ ghi chú–vở; mục tiêu chờ và trạng thái lưu trữ được giữ. |
| AC-032 | FR-041 | Dữ liệu hiện tại có một mục không nằm trong bản sao lưu; bắt đầu nhập rồi hủy trước xác nhận. Lần khác xác nhận nhập cùng bản sao. | Trước khi nhập có cảnh báo thay thế toàn bộ. Hủy giữ nguyên dữ liệu hiện tại; xác nhận nhập thành công đưa dữ liệu về bản sao, không giữ mục mới theo cách gộp. |
| AC-033 | NFR-001, NFR-002, NFR-010 | Chủ sản phẩm thực hiện UJ-001–009 trên laptop/điện thoại thực tế; giải thích ví dụ 4/3 ngày, streak tuần/ngày, tuần khởi động và mục tiêu chờ. | Hoàn thành không cần hướng dẫn trực tiếp; chức năng quan trọng dùng được bằng chạm; hiểu đúng các khái niệm mà không cần công cụ tính ngoài. Ghi lại lỗi và điểm gây khó hiểu. |
| AC-034 | NFR-003, NFR-004, NFR-006, NFR-008; GOAL-001–006 | Thử nghiệm ba tuần đầy đủ với ít nhất một challenge 3/7 và một challenge 7/7. | Đạt các bằng chứng mục 2: ghi nhận cả ba tuần, có tuần dùng hai thiết bị, ít nhất ba lần dùng lại ghi chú và ba sự kiện thực tế, không ghi nhận mất dữ liệu, có đánh giá tiếp tục sử dụng và danh sách điều chỉnh. |

### 11.7. Điều kiện review và nghiệm thu

- Review PRD xác nhận phạm vi, quy tắc, Epic và tiêu chí sản phẩm; không đồng nghĩa phần mềm đã được nghiệm thu.
- Các AC có kết quả cụ thể là cơ sở kiểm chứng khi triển khai được cho phép. NFR có ngưỡng chưa xác định phải được cụ thể hóa trước nghiệm thu phần liên quan, không tự coi là đạt.
- Các tình huống được đánh dấu phụ thuộc DEP-001, DEP-003 hoặc DEP-004 cần quy tắc bổ sung trước khi đặc tả/triển khai phần đó; không ngăn việc chủ sản phẩm review PRD hiện tại.
- Chưa có kết quả kiểm thử phần mềm hay dữ liệu dùng thử ở thời điểm lập PRD này.

## 12. Risks

| ID | Rủi ro và ảnh hưởng | Hướng xử lý ở mức sản phẩm | Liên quan |
|---|---|---|---|
| RISK-001 | Ba mảng tính năng làm MVP quá lớn hoặc mất trọng tâm. | Giữ thứ tự ưu tiên, phạm vi ghi chú/lịch cơ bản và đánh giá mọi đề xuất mới theo mục 8–9. | Toàn bộ Epic |
| RISK-002 | Người dùng nhầm tiến độ tuần với streak ngày/tuần. | Luôn ghi đơn vị và mốc hiệu lực; kiểm chứng khả năng giải thích bằng AC-013–022, AC-033. | EPIC-003; NFR-010 |
| RISK-003 | Ghi bù, chuyển mục tiêu, biên thời gian hoặc lưu trữ làm sai lịch sử/kỷ lục. | Đánh giá theo mục tiêu từng giai đoạn; kiểm tra tình huống biên; chốt DEP-001–003 trước phần liên quan. | EPIC-002, EPIC-003 |
| RISK-004 | Hai thiết bị sửa đồng thời hoặc mất mạng gây ghi đè/mất nội dung. | Trạng thái lưu trung thực, chọn nội dung khi xung đột, giữ bản đang nhập trong phiên; chốt riêng xung đột Done/bỏ Done. | EPIC-001; DEP-004 |
| RISK-005 | Lộ dữ liệu hoặc sao lưu thiếu khiến không thể tin ứng dụng. | Kiểm chứng truy cập và xuất/nhập với toàn bộ loại dữ liệu, gồm các giai đoạn mục tiêu và kỷ lục. | EPIC-001, EPIC-006 |
| RISK-006 | Người dùng hiểu nhầm nhập sao lưu là gộp, làm mất dữ liệu mới hơn. | Cảnh báo rõ thay thế toàn bộ và yêu cầu xác nhận; kiểm chứng cả nhánh hủy và xác nhận. | FR-041; AC-032 |
| RISK-007 | Icon dày hoặc phụ thuộc hover làm lịch khó dùng trên điện thoại. | Giới hạn icon, +N, chạm để xem thông tin và thử trên thiết bị thực tế. | EPIC-005; NFR-002 |
| RISK-008 | Một người dùng thử tạo kết luận quá sớm về thị trường. | Chỉ xác nhận giá trị cá nhân; nghiên cứu nhóm mở rộng trước quyết định phục vụ nhiều người. | GOAL-006; Future Scope |
| RISK-009 | Mục tiêu hiệu năng chưa đủ điều kiện đo dẫn đến đánh giá không nhất quán. | Ghi dữ liệu, thiết bị, mạng, mốc bắt đầu/kết thúc phép đo và ngưỡng trước nghiệm thu hiệu năng. | NFR-009; DEP-005–006 |

## 13. Dependencies

### 13.1. Phụ thuộc và chi tiết chưa xác định

Những điểm này được kế thừa từ Brief §10.2 hoặc là điều kiện để kiểm chứng yêu cầu đã có. Chúng không làm thay đổi phạm vi MVP đã duyệt và không được ghi thành cam kết kỹ thuật. Chủ sản phẩm đã cho phép tạo PRD; không cần mở lại các quyết định Q1–Q12 chỉ để lập tài liệu.

| ID | Nội dung cần xác định | Trạng thái hiện tại | Thời điểm cần / phần bị ảnh hưởng |
|---|---|---|---|
| DEP-001 | Phạm vi ngày bắt đầu khác hôm nay và quyền sửa ngày bắt đầu sau khi có hoạt động. | Chỉ đã chốt mặc định hôm nay và dùng ngày bắt đầu làm mốc tuần khởi động. | Trước đặc tả/triển khai khả năng chọn hoặc sửa ngày bắt đầu ngoài luồng mặc định; FR-007–008, FR-011, FR-016. |
| DEP-002 | Múi giờ tài khoản cụ thể. | Đã chốt một múi giờ cố định, dùng chung thiết bị; giá trị chưa được cung cấp. Không tự lấy múi giờ của máy làm quyết định sản phẩm. | Trước cấu hình tài khoản và nghiệm thu ngày/tuần/lịch; FR-006 và các AC thời gian. |
| DEP-003 | Mốc dừng đánh giá streak khi lưu trữ, phạm vi sửa lịch sử sau lưu trữ và xử lý mục tiêu đang chờ. | Đã chốt lưu trữ giữ lịch sử, cho sửa sai và không mở lại; chưa chốt chi tiết thời gian. | Trước triển khai/nghiệm thu đầy đủ lưu trữ; FR-011, FR-013, FR-017–023, AC-011. |
| DEP-004 | Cách giải quyết Done và bỏ Done gần đồng thời từ hai thiết bị. | Đã chốt Done lặp không đếm trùng; chọn nội dung khi xung đột văn bản. Chưa xác định thao tác trạng thái nào thắng khi đối nghịch. | Trước triển khai/nghiệm thu xung đột trạng thái challenge; FR-002, FR-009, FR-012, NFR-006. |
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

**Điểm dừng:** PRD v1.0 đã được lập từ Project Brief v1.3 để chủ sản phẩm review. Chưa phê duyệt triển khai; chưa viết code, tạo architecture hoặc chia implementation stories. Chờ phản hồi review của chủ sản phẩm.
