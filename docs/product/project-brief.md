# NoteFlow — Project Brief

- **Loại tài liệu:** Project Brief / đầu vào cho giai đoạn lập kế hoạch BMAD.
- **Ngày tạo:** 2026-09-11.
- **Phiên bản:** 1.3.
- **Trạng thái:** Đã cập nhật các khuyến nghị Q1–Q12 được chủ sản phẩm duyệt trong review PM; các thông tin chưa được cung cấp được ghi riêng tại mục 10. Chưa chuyển sang PRD.
- **Cơ sở:** Trao đổi trực tiếp với chủ sản phẩm. Chưa thực hiện nghiên cứu thị trường hoặc kiểm chứng với người dùng bên ngoài.
- **Ngôn ngữ tài liệu:** Tiếng Việt.

## 1. Problem Statement

Chủ sản phẩm cần một ứng dụng cá nhân để duy trì các mục tiêu như uống nước, học tiếng Anh hoặc tập thể dục; lưu và tìm lại kiến thức; đồng thời quản lý các sự kiện theo ngày giờ. Ứng dụng cần sử dụng được trên cả laptop và điện thoại với giao diện đơn giản.

Nhu cầu quan trọng nhất là cơ chế challenge linh hoạt theo số ngày thực hiện mỗi tuần. Không phải mục tiêu nào cũng cần thực hiện hằng ngày: một challenge có thể yêu cầu 3/7 ngày, challenge khác yêu cầu 7/7 ngày. Người dùng cần tự chọn ngày thực hiện, đánh dấu hoàn thành nhanh, có thể ghi thêm nội dung và ghi bù khi đã làm nhưng quên bấm Done.

MVP cần giải quyết đồng thời ba nhu cầu ở mức độ vừa đủ, theo thứ tự ưu tiên **Challenge → Ghi chú → Lịch cá nhân**, tránh phát triển thành ba công cụ quản lý phức tạp ngay từ đầu.

## 2. Product Vision

**NoteFlow là không gian cá nhân giúp người dùng duy trì mục tiêu theo tuần, lưu kiến thức trong những cuốn vở số và theo dõi lịch trình trên laptop lẫn điện thoại.**

Challenge là trọng tâm của trải nghiệm và lý do quay lại thường xuyên. Sổ ghi chú hỗ trợ lưu trữ, tổ chức và tìm lại kiến thức. Lịch cung cấp góc nhìn theo thời gian cho sự kiện cá nhân và những ngày đã hoàn thành challenge.

Nguyên tắc sản phẩm:

- Ưu tiên thao tác hằng ngày ngắn gọn, đặc biệt là đánh dấu Done.
- Đo sự duy trì theo mục tiêu tuần do người dùng đặt, không mặc định mọi mục tiêu phải làm mỗi ngày.
- Nhật ký là tùy chọn, không cản trở việc ghi nhận hoàn thành.
- Tổ chức ghi chú theo mô hình cuốn vở quen thuộc.
- Hiển thị rõ dữ liệu đã lưu và trạng thái đồng bộ; bảo vệ dữ liệu cá nhân.
- Bắt đầu nhỏ, kiểm chứng bằng việc chủ sản phẩm sử dụng thực tế.

## 3. Target Users

### Người dùng MVP

Chủ sản phẩm là người dùng đầu tiên, dùng NoteFlow để quản lý challenge, ghi chú văn bản và lịch cá nhân của chính mình trên laptop và điện thoại.

### Nhóm người dùng tiềm năng sau MVP

- Sinh viên cần lưu kiến thức và duy trì việc học.
- Developer cần ghi chú kiến thức và theo dõi các mục tiêu cá nhân.
- Người thường xuyên tự học, ghi chú và duy trì thói quen.

MVP chưa tối ưu riêng cho từng nghề nghiệp và chưa phục vụ cộng tác nhóm. Nhu cầu của các nhóm mở rộng vẫn là giả thuyết cần kiểm chứng.

## 4. User Problems

| Vấn đề | Hệ quả cần giải quyết |
|---|---|
| Có mục tiêu nhưng khó thấy mức độ thực hiện trong tuần | Không biết đã đạt bao nhiêu ngày và còn thiếu bao nhiêu ngày |
| Mục tiêu có tần suất khác nhau | Streak theo ngày liên tiếp có thể coi ngày nghỉ hợp lệ là bỏ lỡ |
| Đã thực hiện nhưng quên ghi nhận | Lịch sử và streak không phản ánh đúng thực tế nếu không được ghi bù |
| Viết nhật ký sau mỗi lần thực hiện có thể mất công | Việc nhập nội dung bắt buộc làm tăng thao tác |
| Ghi chú tăng dần, khó tổ chức và tìm lại | Kiến thức đã lưu khó được sử dụng lại |
| Cần theo dõi sự kiện và hoạt động theo ngày | Thiếu một góc nhìn lịch đơn giản |
| Dùng cả laptop và điện thoại | Cần trải nghiệm phù hợp màn hình và dữ liệu nhất quán giữa thiết bị |

Các vấn đề trên được rút ra từ yêu cầu của chủ sản phẩm, chưa đại diện cho kết quả khảo sát thị trường.

## 5. User Goals

- Tạo challenge với mục tiêu từ 1 đến 7 ngày mỗi tuần và tự chọn ngày thực hiện.
- Bấm Done nhanh mà không phải viết nhật ký; ghi thêm nội dung khi thấy cần.
- Nhìn được tiến độ tuần và lịch sử theo ngày; xem chuỗi tuần đạt mục tiêu liên tiếp với challenge 1–6/7 và chuỗi ngày hoàn thành liên tiếp với challenge 7/7.
- Ghi bù hoặc sửa một lần đánh dấu nhầm để lịch sử phản ánh đúng hoạt động thực tế.
- Lưu ghi chú văn bản vào những cuốn vở và tìm lại bằng từ khóa.
- Ghi sự kiện theo ngày giờ và xem challenge đã hoàn thành trên lịch.
- Sử dụng cùng dữ liệu cá nhân thuận tiện trên laptop và điện thoại.

## 6. MVP Scope

| Phạm vi | Nội dung MVP | Ưu tiên |
|---|---|---|
| Challenge | Tạo và quản lý mục tiêu N/7 ngày; Done; nhật ký tùy chọn; ghi bù; tiến độ tuần; lịch sử; streak theo tuần cho 1–6/7, theo ngày cho 7/7 | 1 |
| Sổ ghi chú | Cuốn vở chứa các ghi chú văn bản; tạo, sửa, xóa, chuyển ghi chú; tìm kiếm | 2 |
| Lịch cá nhân | Sự kiện đơn lẻ theo ngày giờ; xem tháng và danh sách trong ngày; icon challenge | 3 |
| Trải nghiệm hằng ngày | Màn hình Hôm nay với tiến độ challenge trong tuần, thao tác Done và sự kiện trong ngày | Hỗ trợ luồng chính |
| Sử dụng hai thiết bị | Giao diện phù hợp laptop/điện thoại, lưu dữ liệu và đồng bộ cho một người dùng khi trực tuyến; chưa hỗ trợ ngoại tuyến | Nền tảng |
| Bảo toàn dữ liệu | Kiểm soát truy cập cá nhân, trạng thái lưu/đồng bộ, xuất và nhập bản sao lưu cơ bản | Nền tảng |

Thứ tự ưu tiên hướng dẫn triển khai và quyết định cắt giảm khi cần. Phạm vi MVP đã được duyệt bao gồm cả challenge, ghi chú và lịch ở mức đơn giản, cùng màn hình Hôm nay, đồng bộ trực tuyến và xuất/nhập bản sao lưu. Sản phẩm là web có giao diện thích ứng với màn hình, phục vụ một tài khoản cá nhân, chưa mở đăng ký công khai.

Luồng sử dụng trọng tâm: **Mở Hôm nay → xem tiến độ tuần → bấm Done cho challenge → tùy chọn thêm nội dung → thấy lịch sử và tiến độ cập nhật.**

## 7. Out of Scope

- Cộng tác, phân quyền nhóm, chia sẻ công khai và mạng xã hội.
- AI tạo nội dung, tóm tắt, semantic search hoặc hỏi đáp trên ghi chú.
- Trình soạn thảo phức tạp, tệp đính kèm, OCR, hình ảnh và code block chuyên dụng.
- Thư mục ghi chú nhiều tầng, hệ thống tag kết hợp, backlink và knowledge graph.
- Challenge theo ngày cố định trong tuần; nhiều lượt được tính trong cùng một ngày; đo số ml, số phút hoặc số lần tập để tự đánh giá hoàn thành.
- Bảng xếp hạng, huy hiệu, điểm thưởng và streak freeze.
- Lịch sự kiện lặp, nhắc lịch, lời mời, kéo thả và đồng bộ với lịch bên ngoài.
- Tự đặt giờ thực hiện challenge hoặc tự đánh dấu Done khi một sự kiện kết thúc.
- Ứng dụng native riêng cho từng nền tảng và hỗ trợ thao tác ngoại tuyến, bao gồm ghi chú hoặc Done khi không có mạng.
- Dashboard phân tích nâng cao, thanh toán và thương mại hóa.
- Mở lại challenge đã lưu trữ, đổi múi giờ tài khoản trong MVP, thùng rác/khôi phục riêng từng mục đã xóa, loại sự kiện cả ngày và gộp bản sao lưu với dữ liệu hiện tại khi nhập.

## 8. Core Features

### 8.1. Challenge và tiến độ tuần

**Yêu cầu đã xác nhận:**

- Người dùng đặt số ngày thực hiện trong tuần, từ 1/7 đến 7/7.
- Không cố định thứ trong tuần; người dùng tự chọn ngày thực hiện.
- Mỗi ngày có thể đánh dấu Done mà không cần nhập nội dung nhật ký.
- Cho phép ghi bù cho ngày đã thực hiện nhưng quên đánh dấu.
- Có lịch hiển thị lịch sử hoàn thành và streak.
- Challenge 1–6/7 hiển thị streak theo số tuần liên tiếp đạt mục tiêu; riêng 7/7 hiển thị theo số ngày hoàn thành liên tiếp ngay trong MVP.
- Challenge có ngày bắt đầu giữa tuần có tuần khởi động; bắt đầu tính streak từ thứ Hai tiếp theo. Mốc này dựa trên ngày bắt đầu, không dựa trên ngày tạo.
- Thay đổi mục tiêu áp dụng từ tuần sau, giữ nguyên cách đánh giá các tuần trước.
- Đổi mục tiêu trong nhóm 1–6/7 giữ streak tuần; chuyển giữa nhóm 1–6/7 và 7/7 bắt đầu chuỗi mới khi mục tiêu mới có hiệu lực, giữ lịch sử và kỷ lục cũ đúng đơn vị. Đổi mục tiêu không tạo thêm tuần khởi động.

**Quy tắc vận hành chi tiết:** Các quy tắc dưới đây, bao gồm các mặc định về streak trước đây, đã được chủ sản phẩm duyệt. Các thông tin còn chưa xác định được ghi riêng tại mục 10.

- Mỗi challenge có tên, mô tả tùy chọn, ngày bắt đầu và mục tiêu tuần.
- Ngày bắt đầu mặc định là hôm nay theo múi giờ tài khoản và là mốc xác định tuần khởi động. Phạm vi cho phép chọn ngày bắt đầu khác hôm nay hoặc sửa ngày này sau khi có hoạt động chưa được chốt.
- Mỗi challenge chỉ được tính một lần trong mỗi ngày; bấm Done lặp không tạo thêm lượt.
- Nhật ký tùy chọn gắn với ngày thực hiện; chỉ nhập nhật ký chưa được tính là hoàn thành.
- Cho sửa nội dung, bỏ Done khi đánh dấu nhầm và lưu trữ challenge khi ngừng theo dõi; lịch sử được giữ lại.
- Challenge đã lưu trữ vẫn cho xem và sửa lịch sử để sửa sai; chưa hỗ trợ mở lại challenge trong MVP.
- Tiến độ hiển thị theo số ngày hoàn thành trên mục tiêu, ví dụ 2/3 ngày. Khi vượt mục tiêu, tiếp tục ghi nhận, ví dụ 4/3 ngày, tối đa 7 ngày trong tuần.
- Tuần được tính từ thứ Hai đến Chủ nhật theo một múi giờ tài khoản cố định, thống nhất trên các thiết bị; chưa hỗ trợ đổi múi giờ trong MVP. Giá trị múi giờ cụ thể chưa được cung cấp.
- Với challenge 1–6/7, streak là số tuần liên tiếp đạt mục tiêu. Tuần đang diễn ra chưa đạt mục tiêu không làm ngắt chuỗi. Khi tuần đó đạt mục tiêu, chuỗi tăng; nếu kết thúc tuần mà chưa đạt, chuỗi bị ngắt.
- Với challenge 7/7, streak là số ngày hoàn thành liên tiếp, không đặt lại khi chuyển tuần. Hôm nay chưa Done vẫn giữ chuỗi từ hôm qua cho đến hết hôm nay; bỏ lỡ trọn một ngày sẽ ngắt chuỗi. Tiến độ tuần vẫn hiển thị để biết đã hoàn thành bao nhiêu trên 7 ngày.
- Hiển thị chuỗi hiện tại và chuỗi dài nhất cùng đơn vị rõ ràng: tuần cho 1–6/7, ngày cho 7/7.
- Chuỗi dài nhất là kỷ lục trên toàn bộ lịch sử cùng đơn vị, bao gồm các giai đoạn trước khi chuyển nhóm mục tiêu. Khi quay lại một nhóm mục tiêu, kỷ lục cùng đơn vị vẫn được giữ; chuỗi hiện tại vẫn bắt đầu mới theo quy tắc chuyển nhóm.
- Ghi bù hoặc bỏ Done làm tính lại tiến độ và streak của các ngày/tuần bị ảnh hưởng. Cho ghi bù toàn bộ khoảng từ ngày bắt đầu đến hôm nay; không ghi hoàn thành cho ngày tương lai hoặc trước ngày bắt đầu challenge.
- Challenge có ngày bắt đầu giữa tuần có tuần đầu là tuần khởi động: vẫn lưu hoạt động nhưng không cộng hoặc làm đứt streak; bắt đầu tính từ thứ Hai của tuần đầy đủ kế tiếp. Áp dụng cùng mốc bắt đầu cho streak theo tuần và theo ngày. Challenge bắt đầu vào thứ Hai được tính ngay từ ngày đó.
- Thay đổi mục tiêu có hiệu lực từ tuần sau; các tuần trước được đánh giá theo mục tiêu áp dụng tại thời điểm đó.
- Mỗi challenge chỉ có một mục tiêu đang chờ áp dụng. Sửa lại trước khi có hiệu lực sẽ thay thế mục tiêu chờ trước đó; cho phép hủy thay đổi đang chờ. Hiển thị rõ mục tiêu hiện tại, mục tiêu chờ và thời điểm có hiệu lực.
- Khi đổi trong nhóm 1–6/7, ví dụ 3/7 → 5/7, chuỗi tuần đang có được tiếp tục theo quy tắc đạt mục tiêu; việc đổi mục tiêu tự nó không đặt lại hoặc khôi phục chuỗi đã ngắt.
- Khi chuyển từ 1–6/7 sang 7/7 hoặc ngược lại, chuỗi hiện tại bắt đầu lại từ 0 tại thời điểm mục tiêu mới có hiệu lực và tăng theo lần hoàn thành ngày/tuần tương ứng. Không nối với chuỗi trước khi chuyển, kể cả khi quay về một nhóm mục tiêu đã dùng trước đó.
- Lịch sử và kỷ lục cũ được giữ với đơn vị gốc; không quy đổi hoặc cộng trực tiếp số tuần với số ngày. Ghi bù vẫn cập nhật lịch sử theo mục tiêu từng giai đoạn, không nối chuỗi qua mốc chuyển đơn vị.
- Đổi mục tiêu không tạo thêm tuần khởi động; hoạt động từ thứ Hai khi mục tiêu mới có hiệu lực được tính ngay theo quy tắc mới.

Ví dụ: challenge tập thể dục 3/7 ngày hoàn thành vào thứ Hai, Năm và Chủ nhật được tính là một tuần đạt mục tiêu. Hai tuần liên tiếp đều đạt tạo streak 2 tuần. Challenge học tiếng Anh 7/7 hoàn thành 10 ngày liên tiếp từ mốc bắt đầu tính streak hiển thị streak 10 ngày, dù chuỗi đi qua ranh giới tuần; hoàn thành đủ bảy ngày trong một tuần vẫn được ghi nhận là tuần đạt mục tiêu.

Streak phản ánh sự đều đặn do người dùng tự ghi nhận, không xác thực chất lượng hay khối lượng hoạt động.

### 8.2. Sổ ghi chú văn bản

- Tạo, đổi tên và quản lý những cuốn vở một cấp; mỗi ghi chú thuộc một cuốn vở.
- Tạo, đọc, sửa và xóa ghi chú có tiêu đề và nội dung văn bản thuần túy.
- Chỉ cho xóa cuốn vở rỗng; không cho xóa cuốn vở mặc định. Xóa ghi chú cần xác nhận; chưa có thùng rác hoặc khôi phục riêng từng ghi chú đã xóa trong MVP.
- Chuyển ghi chú giữa các cuốn vở.
- Có cuốn vở mặc định để ghi nhanh khi chưa muốn phân loại.
- Tự lưu và hiển thị trạng thái lưu/đồng bộ rõ ràng.
- Tìm theo từ khóa trong tiêu đề và nội dung trên toàn bộ ghi chú, không phân biệt hoa/thường và dấu tiếng Việt; mở trực tiếp kết quả.
- Nhật ký challenge được giữ trong challenge, chưa tự chuyển thành ghi chú riêng.

### 8.3. Lịch cá nhân

- Tạo, xem, sửa và xóa sự kiện đơn lẻ với tên, thời điểm bắt đầu/kết thúc và mô tả tùy chọn.
- Sự kiện có giờ được phép kéo dài qua ngày; thời điểm kết thúc phải sau thời điểm bắt đầu. Chưa hỗ trợ loại sự kiện cả ngày. Xóa sự kiện cần xác nhận; chưa hỗ trợ thùng rác hoặc khôi phục riêng từng sự kiện đã xóa.
- Xem lịch tháng và các sự kiện của ngày được chọn.
- Hiển thị icon nhỏ cho challenge đã hoàn thành trong từng ô ngày, bao gồm ngày được ghi bù.
- Rê chuột trên laptop để xem tên challenge ngắn gọn; chạm trên điện thoại để xem cùng thông tin.
- Khi có nhiều challenge trong một ngày, hiển thị số lượng giới hạn và chỉ báo +N để mở danh sách đầy đủ.
- Không tự gán challenge chưa thực hiện vào một ngày cụ thể vì mục tiêu được đặt theo tuần.
- Sự kiện lịch là kế hoạch; Done của challenge là ghi nhận thực hiện. Hai trạng thái độc lập.

### 8.4. Màn hình Hôm nay và dữ liệu cá nhân

- Hiển thị challenge đang hoạt động, tiến độ tuần và trạng thái Done hôm nay; cho thao tác nhanh.
- Hiển thị sự kiện trong ngày và lối vào ghi chú nhanh.
- Đồng bộ cùng dữ liệu cá nhân trên laptop và điện thoại, với phương thức đăng nhập được chọn ở bước thiết kế sau.
- Khi hai thiết bị sửa cùng nội dung và phát sinh xung đột, thông báo để người dùng chọn nội dung cần giữ; không âm thầm ghi đè nội dung xung đột.
- Khi mất mạng trong lúc nhập, báo chưa lưu và giữ nội dung đang nhập trong phiên để thử lưu lại khi có mạng. Đây là xử lý gián đoạn trong phiên, không phải chế độ thao tác ngoại tuyến hay cam kết giữ bản chưa lưu sau khi đóng/tải lại trang.
- Có khả năng xuất và nhập bản sao lưu cơ bản để giảm rủi ro mất dữ liệu. Bản sao lưu bao gồm toàn bộ dữ liệu sản phẩm: cuốn vở, ghi chú, challenge và trạng thái lưu trữ, Done/nhật ký, mục tiêu theo từng giai đoạn và mục tiêu đang chờ, sự kiện, múi giờ và dữ liệu cần thiết để phục hồi đúng lịch sử/kỷ lục.
- Nhập bản sao lưu thay thế toàn bộ dữ liệu sản phẩm hiện tại sau cảnh báo rõ ràng và xác nhận của người dùng; không gộp dữ liệu trong MVP.

## 9. Constraints

- MVP dành cho một người dùng trước; giao diện và thao tác phải đơn giản.
- Thứ tự ưu tiên đã chốt: Challenge → Ghi chú → Lịch cá nhân.
- Phải sử dụng được trên laptop và điện thoại; chức năng quan trọng không được phụ thuộc riêng vào thao tác rê chuột.
- MVP yêu cầu kết nối mạng để thao tác; chủ sản phẩm đã xác nhận chưa cần ghi chú hoặc Done ngoại tuyến.
- Ghi chú tập trung vào văn bản thuần túy và mô hình cuốn vở.
- Challenge đếm số ngày thực hiện mỗi tuần, không đếm nhiều lượt trong ngày.
- Phải nhất quán về ngày, tuần và lịch sử khi đồng bộ hoặc ghi bù.
- Dữ liệu ghi chú, nhật ký và lịch là dữ liệu cá nhân; cần giới hạn truy cập và có khả năng khôi phục cơ bản.
- Chưa có ngân sách, thời hạn phát hành, công nghệ hoặc nhà cung cấp được chốt. Brief không cam kết các lựa chọn này.
- Chủ sản phẩm đã review và duyệt các khuyến nghị PM Q1–Q12; chỉ cập nhật Project Brief ở bước này. Chưa tạo PRD, viết code hoặc thiết kế architecture theo phạm vi công việc hiện tại.

## 10. Quyết định sau review và thông tin còn thiếu

### 10.1. Các khuyến nghị đã được duyệt

Ngày 2026-09-11, chủ sản phẩm đồng ý thực hiện theo các khuyến nghị trong mục “Các câu hỏi cần bạn quyết định” của phân tích PM. Các quyết định dưới đây đã được đưa vào phạm vi và quy tắc ở trên; không còn là giả định chờ duyệt.

| Quyết định | Nội dung được duyệt |
|---|---|
| Q1 — Phạm vi MVP | Giữ Hôm nay, đồng bộ trực tuyến, xuất/nhập sao lưu; web thích ứng màn hình, một tài khoản cá nhân, chưa đăng ký công khai. Giữ mô hình vở một cấp, tìm kiếm từ khóa và icon lịch chỉ biểu thị ngày đã Done. |
| Q2 — Mặc định streak | Giữ chuỗi trong kỳ đang diễn ra theo mục 8.1; hiển thị chuỗi dài nhất; cho ghi bù từ ngày bắt đầu đến hôm nay. |
| Q3 — Mốc bắt đầu | Dùng ngày bắt đầu để tính tuần khởi động, mặc định hôm nay. Khuyến nghị chưa chọn phạm vi ngày khác hôm nay hoặc quyền sửa ngày bắt đầu. |
| Q4 — Múi giờ | Một múi giờ tài khoản cố định cho MVP, dùng chung trên các thiết bị; chưa hỗ trợ đổi múi giờ. Giá trị cụ thể chưa được cung cấp. |
| Q5 — Mục tiêu chờ | Chỉ giữ một mục tiêu chờ áp dụng; lần sửa cuối thay thế lần trước; cho hủy trước khi có hiệu lực. |
| Q6 — Lưu trữ challenge | Cho xem/sửa lịch sử của challenge đã lưu trữ để sửa sai; chưa hỗ trợ mở lại trong MVP. |
| Q7 — Kỷ lục | Chuỗi dài nhất tính trên toàn bộ lịch sử cùng đơn vị; chuỗi hiện tại bắt đầu mới khi chuyển nhóm theo quy tắc đã chốt. |
| Q8 — Xung đột và mất mạng | Báo xung đột để người dùng chọn nội dung cần giữ; báo chưa lưu khi mất mạng và giữ nội dung đang nhập trong phiên để thử lại. |
| Q9 — Xóa dữ liệu | Chỉ xóa vở rỗng, bảo vệ vở mặc định; xác nhận trước khi xóa ghi chú/sự kiện; chưa thêm thùng rác. |
| Q10 — Sao lưu | Sao lưu toàn bộ dữ liệu sản phẩm, gồm mục tiêu theo giai đoạn và múi giờ; nhập thay thế toàn bộ sau cảnh báo và xác nhận, không gộp. |
| Q11 — Sự kiện và tìm kiếm | Sự kiện có giờ được đi qua ngày, kết thúc sau bắt đầu; chưa có loại cả ngày. Tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt. |
| Q12 — Kiểm chứng | Dùng thiết bị thực tế của chủ sản phẩm để chốt điều kiện kiểm thử; giữ thử nghiệm ba tuần đầy đủ tại mục 12. |

### 10.2. Thông tin chưa được xác định

Việc duyệt khuyến nghị không cung cấp thêm các giá trị mà khuyến nghị chưa nêu. Những điểm dưới đây vẫn được ghi là chưa xác định, không mặc định coi là đã chốt:

- Phạm vi ngày bắt đầu được chọn (quá khứ/tương lai) và quyền sửa ngày bắt đầu sau khi đã có hoạt động.
- Giá trị múi giờ tài khoản cụ thể.
- Thiết bị, hệ điều hành và trình duyệt thực tế dùng để kiểm thử; độ trễ đồng bộ chấp nhận được.
- Ngân sách, ngày bắt đầu dùng thử và thời hạn phát hành.

Các chi tiết sản phẩm cần làm rõ khi đặc tả tiếp gồm mốc dừng đánh giá streak khi lưu trữ challenge, phạm vi sửa lịch sử sau lưu trữ, xử lý mục tiêu đang chờ của challenge đã lưu trữ và xung đột Done/bỏ Done. Review này chưa đưa ra khuyến nghị cụ thể để chốt các tình huống đó.

### 10.3. Giả thuyết cần kiểm chứng qua sử dụng

- Ba mảng challenge, ghi chú và lịch ở phạm vi đã duyệt đủ đáp ứng nhu cầu cá nhân mà vẫn đơn giản.
- Mô hình vở một cấp và tìm kiếm từ khóa đủ để lưu và tìm lại kiến thức ban đầu.
- Kết quả dùng thử cá nhân chưa đại diện cho nhu cầu của các nhóm người dùng mở rộng.

## 11. Risks

| Rủi ro | Ảnh hưởng | Hướng xử lý |
|---|---|---|
| Scope tăng vì kết hợp challenge, ghi chú và lịch | MVP chậm hoàn thành, trải nghiệm thiếu tập trung | Bảo vệ thứ tự ưu tiên; giữ ghi chú và lịch ở phạm vi cơ bản |
| Người dùng nhầm đơn vị streak giữa các loại challenge | Hiểu sai tiến độ hoặc kỳ vọng chuỗi tăng hằng ngày với mục tiêu 3/7 | Ghi rõ đơn vị tuần cho 1–6/7 và ngày cho 7/7; hiển thị đồng thời tiến độ tuần và lịch đánh dấu từng ngày |
| Ghi bù, đổi mục tiêu hoặc khác biệt múi giờ làm sai lịch sử | Mất niềm tin vào tiến độ | Chốt quy tắc ngày/tuần; giữ mục tiêu theo từng tuần; kiểm tra các tình huống biên |
| Sửa trên hai thiết bị hoặc mạng gián đoạn | Dữ liệu bị ghi đè hoặc mất | Thiết kế lưu/đồng bộ và xử lý xung đột rõ ràng; không báo đã lưu khi chưa lưu thành công |
| Mất hoặc lộ dữ liệu cá nhân | Người dùng không thể tiếp tục tin cậy ứng dụng | Kiểm soát truy cập và xác minh khả năng xuất/nhập bản sao lưu |
| Icon lịch quá dày hoặc chỉ có hover | Khó sử dụng trên điện thoại | Hỗ trợ chạm, giới hạn icon và có danh sách mở rộng |
| Kết quả dùng thử chỉ phản ánh một người | Đánh giá quá sớm khả năng phục vụ thị trường | Xác nhận giá trị cá nhân trước; nghiên cứu nhóm mở rộng sau |

## 12. Success Criteria

Các tiêu chí dưới đây là **mục tiêu nghiệm thu và kiểm chứng đề xuất**, chưa phải kết quả đã đo.

### Khả năng sử dụng và tính đúng đắn

- Chủ sản phẩm thực hiện được các luồng chính trên cả laptop và điện thoại mà không cần hướng dẫn trực tiếp.
- Từ màn hình Hôm nay, đánh dấu Done bằng một thao tác, không bắt buộc nhập nội dung.
- Các tình huống 3/7, 7/7, ghi bù, bỏ Done, chuyển tuần, tuần khởi động và thay đổi mục tiêu cho kết quả đúng theo quy tắc được duyệt.
- Challenge 3/7 đạt mục tiêu hai tuần liên tiếp hiển thị streak 2 tuần; challenge 7/7 hoàn thành 10 ngày liên tiếp từ mốc bắt đầu tính streak hiển thị 10 ngày và không bị đặt lại khi qua thứ Hai.
- Với 7/7, hôm nay chưa Done không làm ngắt chuỗi trước khi hết ngày; ghi bù một ngày bỏ lỡ tính lại chuỗi ngày đúng. Các ngày trong tuần khởi động được lưu nhưng không cộng streak.
- Đổi 3/7 → 5/7 giữ chuỗi tuần đang có và đánh giá tuần mới theo mục tiêu 5 ngày; không thay đổi kết quả các tuần trước.
- Đổi 3/7 → 7/7 hoặc 7/7 → 3/7 bắt đầu chuỗi mới khi mục tiêu có hiệu lực, giữ lịch sử và kỷ lục cũ đúng đơn vị; không thêm tuần khởi động, không nối chuỗi qua mốc chuyển đơn vị khi ghi bù hoặc khi quay lại nhóm mục tiêu cũ.
- Bấm Done nhiều lần hoặc từ hai thiết bị không làm tăng số ngày hoàn thành sai.
- Thay đổi đã lưu hiển thị nhất quán trên thiết bị còn lại khi trực tuyến; lỗi lưu/đồng bộ được thông báo rõ ràng.
- Tạo và sửa ghi chú không mất nội dung sau tải lại; xuất rồi nhập lại bản sao lưu khôi phục đúng dữ liệu trong một lần thử có kiểm soát.
- Với bộ dữ liệu thử khoảng 1.000 ghi chú văn bản ngắn, tìm kiếm trả kết quả trong khoảng một giây ở điều kiện thử nghiệm được ghi lại. Đây là mục tiêu ban đầu, cần hiệu chỉnh khi thiết kế kỹ thuật.
- Tạo sự kiện, xem lịch và mở tên challenge bằng cả hover và chạm hoạt động đúng trên hai loại thiết bị.
- Các quyết định review được kiểm tra trong nghiệm thu: thay thế/hủy mục tiêu đang chờ; kỷ lục cùng đơn vị khi quay lại nhóm mục tiêu; xem/sửa lịch sử challenge đã lưu trữ; bảo vệ vở mặc định và vở còn ghi chú; xác nhận xóa ghi chú/sự kiện; tìm không dấu/không phân biệt hoa thường; sự kiện qua ngày và kiểm tra giờ kết thúc.
- Khi sửa nội dung đồng thời, người dùng được thông báo xung đột và chọn nội dung cần giữ. Khi mất mạng lúc nhập, ứng dụng báo chưa lưu và giữ nội dung trong phiên để thử lại.
- Bản sao lưu phục hồi đúng toàn bộ dữ liệu sản phẩm, gồm lịch sử mục tiêu, mục tiêu đang chờ, trạng thái lưu trữ và múi giờ; nhập thay thế yêu cầu cảnh báo và xác nhận.

### Giá trị trong sử dụng thực tế

Kế hoạch thử nghiệm cá nhân trong ba tuần đầy đủ đã được duyệt, với ít nhất một challenge 3/7 và một challenge 7/7. Dùng laptop và điện thoại thực tế của chủ sản phẩm, ghi lại thiết bị/trình duyệt và điều kiện thử; ngày bắt đầu và các ngưỡng hiệu năng chưa có vẫn cần được xác định:

- Chủ sản phẩm ghi nhận challenge trong cả ba tuần và có ít nhất một tuần dùng được trên cả laptop lẫn điện thoại.
- Người dùng hiểu đúng tiến độ và streak mà không cần tự tính lại bằng công cụ khác.
- Có ít nhất ba lần tìm và sử dụng lại ghi chú cũ cho một nhu cầu thực tế.
- Có ít nhất ba sự kiện cá nhân thực tế được tạo và xem lại trên lịch.
- Không ghi nhận sự cố mất dữ liệu trong đợt thử; lưu lại mọi lỗi hoặc thao tác gây khó hiểu để đánh giá.
- Cuối đợt thử, chủ sản phẩm muốn tiếp tục dùng NoteFlow làm nơi theo dõi challenge chính và xác định được phần nào cần giữ, sửa hoặc hoãn.

Độ dài streak hoặc tỷ lệ hoàn thành mục tiêu cá nhân không được dùng riêng lẻ để kết luận sản phẩm thành công. Trọng tâm là khả năng ghi nhận đáng tin cậy, tìm lại kiến thức và sử dụng lặp lại.

## 13. Future Opportunities

Chỉ xem xét sau khi có bằng chứng từ MVP:

- Nhắc thực hiện challenge hoặc cảnh báo tuần sắp kết thúc mà chưa đạt mục tiêu.
- Thống kê xu hướng và tổng kết tuần nâng cao; streak theo ngày cho 7/7 đã nằm trong MVP.
- Theo dõi định lượng như lượng nước, thời gian học hoặc số buổi trong ngày.
- Challenge theo ngày cố định, tạm nghỉ hoặc các quy tắc linh hoạt hơn.
- Liên kết ghi chú với challenge, lên lịch thực hiện challenge và sự kiện lặp.
- Đồng bộ lịch bên ngoài.
- Chế độ ngoại tuyến, PWA hoặc ứng dụng native nếu trải nghiệm thực tế đòi hỏi.
- Mở rộng định dạng ghi chú, đính kèm, tag hoặc liên kết kiến thức khi văn bản và cuốn vở không còn đủ.
- Thử nghiệm với sinh viên, developer và người tự học khác trước khi quyết định mở rộng nhiều người dùng.

---

**Điểm dừng:** Phiên bản 1.3 đã ghi nhận các khuyến nghị Q1–Q12 được chủ sản phẩm duyệt và cập nhật nhất quán phạm vi, quy tắc, giới hạn và tiêu chí kiểm chứng liên quan. Các thông tin chưa được cung cấp được giữ rõ tại mục 10.2. Chưa tạo PRD, viết code hoặc thiết kế architecture.
