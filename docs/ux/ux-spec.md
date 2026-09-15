# NoteFlow — UX Specification

- **Phiên bản:** 1.0.
- **Ngày tạo:** 2026-09-12.
- **Trạng thái:** Đặc tả từ UX direction và UX-01–UX-10 đã được chủ sản phẩm đồng ý trong hội thoại; chưa có kết quả kiểm thử giao diện.
- **Nguồn sản phẩm:** [PRD v1.1](../product/prd.md) và [Project Brief v1.3](../product/project-brief.md). Khi khác nhau, áp dụng PRD.
- **Nguồn quyết định UX:** Yêu cầu desktop-first, tối giản, ghi chú nhanh và phê duyệt toàn bộ khuyến nghị UX-01–UX-10 của chủ sản phẩm.
- **Phạm vi:** Trải nghiệm MVP trên web, cấu trúc màn hình, hành vi và trạng thái; không chọn công nghệ hoặc tạo frontend code.

Chi tiết tương tác dưới đây cụ thể hóa hướng UX đã duyệt. Những khoảng trống sản phẩm chưa được phê duyệt trong PRD được giữ tại mục 16; chúng không tự trở thành quyết định đã chốt chỉ vì xuất hiện trong tài liệu này.

## 1. UX Goals

| ID | Mục tiêu UX | Kết quả cần quan sát |
|---|---|---|
| UG-01 | Mở app và tiếp tục công việc nhanh | Sau xác thực, đi thẳng đến Hôm nay ở lần đầu hoặc khu vực gần nhất ở các lần sau; không qua trang giới thiệu hay dashboard trung gian. |
| UG-02 | Tạo ghi chú với ít thao tác | Một lần gọi “Ghi chú mới” mở editor và đặt focus vào nội dung; không bắt nhập tiêu đề hoặc chọn vở trước khi viết. |
| UG-03 | Editor là trung tâm của Ghi chú | Editor chiếm phần rộng nhất; văn bản thuần túy, ít công cụ và không cần chuyển chế độ xem/sửa. |
| UG-04 | Tìm và chuyển note nhanh | Chọn note thay nội dung trong cùng workspace; tìm toàn bộ ghi chú bằng từ khóa và mở trực tiếp kết quả. |
| UG-05 | Điều hướng dễ hiểu | Bốn khu vực chính cố định, vở một cấp, một note thuộc đúng một vở. |
| UG-06 | Thao tác hằng ngày ngắn gọn | Từ Hôm nay, Done một thao tác và nhật ký tùy chọn; tiến độ tuần và đơn vị streak dễ phân biệt. |
| UG-07 | Tin được dữ liệu | Trạng thái lưu chính xác, bản đang nhập không mất khi chuyển note trong phiên, xung đột có lựa chọn rõ ràng. |
| UG-08 | Dùng được bằng bàn phím và chạm | Luồng quan trọng không lệ thuộc hover hoặc shortcut; màn hình nhỏ vẫn thực hiện được đầy đủ chức năng MVP. |

Challenge vẫn là ưu tiên giá trị số 1 theo PRD; editor là trung tâm khi làm việc trong Ghi chú. Việc nhớ khu vực gần nhất giúp đáp ứng thói quen ghi chú mà không loại Hôm nay, Challenge, Lịch hoặc sao lưu khỏi MVP.

“Mở nhanh” được đánh giá từ lúc truy cập đến khi khu vực đích có thể thao tác; “chuyển nhanh” từ lúc chọn note đến khi đúng nội dung sẵn sàng nhập. Chưa đặt ngưỡng mili giây hoặc SLA. Tìm kiếm kế thừa mục tiêu ban đầu khoảng một giây với khoảng 1.000 ghi chú ngắn, còn điều kiện đo thuộc DEP-005–006.

## 2. Approved UX Decisions

| ID | Quyết định đã duyệt | Cách áp dụng |
|---|---|---|
| UX-01 | Lần đầu mở Hôm nay; lần sau khôi phục khu vực và note gần nhất | Ghi nhớ ngữ cảnh trên thiết bị hiện tại. Truy cập trực tiếp một nội dung được ưu tiên hơn lịch sử khôi phục. |
| UX-02 | Tạo note mở editor, focus nội dung | Trong Ghi chú dùng vở đang chọn; từ khu vực khác dùng vở mặc định. |
| UX-03 | Không bắt nhập tiêu đề trước khi viết | Có thể để trống tiêu đề; nhãn danh sách dùng tiêu đề, nếu trống dùng dòng nội dung đầu tiên có chữ, nếu vẫn trống dùng “Không tiêu đề”. Nhãn suy ra không tự ghi thành tiêu đề. |
| UX-04 | Note sắp theo cập nhật gần nhất | Note mới ở đầu; tránh tự dịch chuyển hàng đang được thao tác trong một lượt điều hướng bàn phím. |
| UX-05 | Tìm kiếm nhanh dạng lớp phủ | Tìm toàn bộ note và mở trong Notes Workspace; không có trang Search riêng hoặc tìm nhật ký challenge. |
| UX-06 | Cho chuyển note trong lúc tự lưu | Giữ nội dung và trạng thái theo từng note trong phiên; lỗi của note đang ẩn vẫn có dấu hiệu để quay lại xử lý. |
| UX-07 | Thu gọn riêng danh sách vở và danh sách note | Nhớ lựa chọn trên thiết bị hiện tại; luôn có cách mở lại bằng bàn phím và chuột. |
| UX-08 | Ghi nhanh từ Hôm nay dùng cùng editor | Mở Notes Workspace với note mới trong vở mặc định, không tạo một bản nội dung thứ hai. |
| UX-09 | Xóa note cần xác nhận | Nêu tên note, vở và việc không có thùng rác; chỉ xóa sau xác nhận. |
| UX-10 | Bộ shortcut đã đề xuất, không dùng phím đơn toàn cục | Giữ ánh xạ tại mục 13; phải kiểm thử khả năng nhận phím trong trình duyệt thực tế trước khi coi shortcut hoạt động. |

## 3. Information Architecture

```text
NoteFlow — sau xác thực
├─ Hôm nay
│  ├─ Challenge đang hoạt động: tiến độ tuần, Done hôm nay
│  ├─ Sự kiện diễn ra hôm nay
│  └─ Ghi chú mới → Notes Workspace / vở mặc định
├─ Challenge
│  ├─ Đang hoạt động
│  ├─ Chi tiết challenge
│  │  ├─ Tiến độ tuần, chuỗi hiện tại, kỷ lục
│  │  ├─ Lịch sử ngày/tuần và nhật ký theo ngày
│  │  └─ Mục tiêu hiện tại, mục tiêu chờ, thời điểm áp dụng
│  └─ Đã lưu trữ → lịch sử và chuỗi khi kết thúc theo dõi
├─ Ghi chú
│  ├─ Vở mặc định
│  ├─ Các vở một cấp
│  ├─ Danh sách note của vở đang chọn
│  ├─ Editor dùng chung cho đọc, tạo, sửa
│  └─ Lớp tìm kiếm toàn bộ ghi chú
├─ Lịch
│  ├─ Lịch tháng
│  ├─ Ngày được chọn: sự kiện và challenge đã Done
│  └─ Chi tiết / tạo / sửa sự kiện
└─ Cài đặt và dữ liệu
   ├─ Tài khoản / đăng xuất
   ├─ Múi giờ tài khoản — chỉ đọc
   └─ Xuất / nhập bản sao lưu
```

Trạng thái xác thực, lưu, đồng bộ, xung đột và nhập backup áp dụng xuyên các khu vực. Nhật ký thuộc challenge và ngày tương ứng, không xuất hiện thành note hoặc kết quả tìm note. Sự kiện biểu thị kế hoạch; icon challenge trong lịch biểu thị Done đã ghi nhận.

Không bổ sung vở nhiều tầng, tag, backlink, AI, rich text, đính kèm, nhiều tab editor hoặc dashboard phân tích. Cài đặt không có bộ tùy biến giao diện phức tạp.

## 4. Navigation

### 4.1. Cấp ứng dụng

- Thanh điều hướng trái giữ thứ tự **Hôm nay → Challenge → Ghi chú → Lịch**; tài khoản/cài đặt ở cuối.
- Mục đang mở có nhãn và dấu hiệu chọn ngoài màu sắc. Khi thanh thu gọn, icon vẫn có tên truy cập và tooltip khi hover/focus.
- Không bắt quay lại Hôm nay để chuyển giữa các khu vực.
- Tìm ghi chú có lối vào trong Ghi chú; shortcut có thể gọi từ khu vực khác khi không có dialog chặn. Hủy tìm kiếm trả về ngữ cảnh trước đó; chọn kết quả mở Ghi chú.
- Lần đầu sau xác thực mở Hôm nay. Lần sau khôi phục khu vực gần nhất trên thiết bị hiện tại. Không khôi phục dialog xóa, xung đột cũ hoặc bước xác nhận nhập backup như một hành động tự chạy.
- Link trực tiếp tới note/challenge/ngày được tôn trọng sau xác thực. Back/Forward trả về ngữ cảnh đã truy cập; gõ văn bản và mỗi lần tự lưu không tạo thêm bước lịch sử điều hướng.

### 4.2. Cấp cuốn vở và ghi chú

- Chọn vở thay danh sách note. Nhớ note đang chọn và vị trí cuộn của từng vở trong phiên; nếu chưa có lịch sử thì chọn note cập nhật gần nhất.
- Nếu vở rỗng, editor hiển thị trạng thái rỗng và nút tạo note; không tự tạo note chỉ do chọn vở.
- Chọn note thay nội dung editor trong cùng workspace, giữ danh sách và ngữ cảnh vở. Không hiện màn hình trung gian.
- Khôi phục note đã bị xóa: về danh sách của vở nếu còn tồn tại, báo ngắn “Ghi chú này không còn tồn tại”. Nếu vở cũng không còn, về vở mặc định.
- Khi tìm và mở note khác vở, chọn vở chứa kết quả và hiển thị đúng note. Hủy tìm kiếm không thay lựa chọn hiện tại.
- Cuộn và vị trí nhập của note được giữ trong phiên khi khả thi và nội dung chưa bị thay thế; không tự đặt con trỏ vượt quá văn bản sau đồng bộ.

## 5. Screen Structure

| Màn hình | Cấu trúc và thông tin chính | Hành động |
|---|---|---|
| Xác thực | Tên NoteFlow, biểu mẫu theo phương thức đăng nhập được chọn sau, trạng thái gửi/lỗi | Truy cập tài khoản cá nhân; không có đăng ký công khai. |
| Hôm nay | Ngày theo múi giờ tài khoản; danh sách challenge, tiến độ tuần, Done hôm nay; sự kiện hôm nay; lối vào ghi nhanh | Done trực tiếp, mở chi tiết/nhật ký, tạo challenge, mở sự kiện, tạo note. |
| Notes Workspace | App rail; danh sách vở; danh sách note; editor với tiêu đề, vở, trạng thái lưu, nội dung | Tạo/sửa/chuyển/xóa note; tạo/đổi tên/xóa vở hợp lệ; tìm kiếm; thu gọn vùng phụ. |
| Tìm ghi chú | Lớp phủ có ô “Tìm trong tất cả ghi chú”, danh sách kết quả, nhãn vở và đoạn trích | Gõ từ khóa, chọn kết quả, mở trực tiếp, đóng về ngữ cảnh cũ. |
| Challenge | Danh sách hoạt động, lối vào đã lưu trữ; vùng chi tiết | Tạo, sửa tên/mô tả, Done, ghi bù/bỏ Done, nhật ký, đổi mục tiêu, lưu trữ. |
| Chi tiết challenge | Tiến độ tuần; chuỗi hiện tại và kỷ lục có đơn vị; lịch sử ngày/tuần; ngày đang chọn; mục tiêu chờ | Nhật ký và Done là hai thao tác độc lập. Mở phần đổi mục tiêu khi cần. |
| Challenge lưu trữ | Nhãn lưu trữ/ngày kết thúc; “Chuỗi khi kết thúc theo dõi”; lịch sử và kỷ lục | Sửa lịch sử/nhật ký trong khoảng hợp lệ; không có nút mở lại. |
| Lịch | Điều hướng tháng, nút Hôm nay, lưới tháng, panel ngày, sự kiện và icon Done | Chọn ngày, xem +N, tạo/mở/sửa/xóa sự kiện. |
| Sự kiện | Tên, ngày/giờ bắt đầu, ngày/giờ kết thúc, mô tả tùy chọn; múi giờ tài khoản rõ ràng | Lưu/hủy; xóa qua xác nhận. Hiện cả hai ngày khi sự kiện qua ngày. |
| Cài đặt và dữ liệu | Tài khoản, múi giờ chỉ đọc, xuất backup, nhập backup | Xuất; chọn tệp và kiểm tra; xác nhận thay thế toàn bộ; xem kết quả. |

### 5.1. Notes Workspace

Danh sách vở đặt vở mặc định đầu tiên với nhãn “Mặc định”, sau đó các vở khác; danh sách là một cấp và có cuộn khi cần. Tạo/đổi tên vở dùng biểu mẫu nhỏ tại ngữ cảnh; menu phụ chứa xóa và giải thích lý do không được xóa.

Mỗi hàng note chứa nhãn tiêu đề và đoạn trích ngắn; vở chỉ cần hiện ở kết quả tìm kiếm hoặc khi cần phân biệt ngữ cảnh. Note chưa lưu/lỗi có dấu hiệu riêng, không gộp vào trạng thái “Đã lưu” của note khác.

Editor cho sửa trực tiếp. Nội dung là văn bản thuần túy, giữ xuống dòng và ký tự người dùng nhập; không chuyển cú pháp thành định dạng. Tiêu đề và nội dung có nhãn truy cập riêng. Menu note chứa “Chuyển đến…” và “Xóa ghi chú”; không có ribbon hoặc nút Lưu bắt buộc.

### 5.2. Challenge và Hôm nay

Hôm nay ưu tiên danh sách ngắn dễ quét. Mỗi challenge có tên, tiến độ như “2/3 ngày tuần này” và Done hôm nay; các giải thích dài nằm trong chi tiết. Tuần đang diễn ra chưa đạt không dùng lời lẽ coi người dùng đã thất bại.

Chi tiết hiển thị “Chuỗi hiện tại: 2 tuần” hoặc “Chuỗi hiện tại: 10 ngày”, tách khỏi tiến độ tuần. Kỷ lục ngày và tuần được ghi đơn vị riêng. Tuần khởi động có thông báo ngày bắt đầu tính streak. Mục tiêu chờ hiển thị giá trị mới và ngày thứ Hai áp dụng; cho sửa/hủy tại cùng vị trí.

## 6. Primary User Flows

### PF-01. Mở ứng dụng và tiếp tục ghi chú

1. Người dùng mở app hoặc link trực tiếp; xác thực nếu cần.
2. App mở đích trực tiếp, hoặc khôi phục khu vực gần nhất; chưa có lịch sử thì mở Hôm nay.
3. Nếu khôi phục Ghi chú, tải đúng vở/note đã lưu, hiển thị editor sẵn sàng khi nội dung có thể sử dụng.
4. Người dùng tiếp tục nhập; trạng thái tự lưu phản ánh phiên bản hiện tại.

Không hiển thị dữ liệu cá nhân trước khi xác thực. Không khôi phục nội dung chưa lưu sau tải lại như thể đó là cam kết sản phẩm. Nguồn: UX-01; FR-001–005.

### PF-02. Tạo note nhanh

1. Từ Hôm nay hoặc khu vực khác, gọi “Ghi chú mới”; từ Ghi chú có thể dùng nút tại danh sách.
2. Mở editor mới ở vở mặc định nếu gọi từ ngoài Ghi chú, hoặc vở đang chọn nếu gọi trong Ghi chú.
3. Focus vào nội dung, cho viết ngay; tiêu đề để trống được.
4. Tự lưu; báo “Đã lưu” khi đúng nội dung hiện tại được xác nhận.
5. Người dùng có thể đặt tiêu đề hoặc chuyển vở sau đó.

Một lần gọi tạo note ứng với một note, không tạo bản sao do lặp gửi khi lưu. Nếu chỉ mở editor mới nhưng chưa nhập gì rồi rời đi, bỏ editor trống chưa lưu; quy tắc này chỉ áp dụng bản mới hoàn toàn, không tự xóa note đã tồn tại. Nguồn: UX-02–03, UX-08; FR-024–025, FR-027–029, FR-039.

### PF-03. Chuyển note trong khi đang lưu

1. Người dùng đang sửa A và chọn B.
2. Giữ văn bản cùng trạng thái chưa lưu của A trong phiên; mở B, hiện trạng thái tải nếu cần.
3. Kết quả lưu A cập nhật A, không đổi editor B hoặc trạng thái lưu của B.
4. Nếu lưu A lỗi, hiện dấu hiệu ở hàng A và thông báo có thể quay lại A; nếu sidebar đang ẩn vẫn có thông báo truy cập được.
5. Quay lại A thấy bản vừa nhập; thử lưu lại khi điều kiện cho phép.

Lỗi của A không bắt đóng B hoặc làm mất focus khi đang gõ. Trước đóng/tải lại/đăng xuất có nội dung chưa lưu, cảnh báo nguy cơ mất bản trong phiên khi môi trường hỗ trợ. Nguồn: UX-06; FR-003–005, FR-029.

### PF-04. Tìm và mở lại note

1. Gọi tìm ghi chú bằng nút hoặc shortcut khả dụng; focus ô tìm kiếm.
2. Gõ từ khóa; tìm trong tiêu đề/nội dung toàn bộ note, không phân biệt hoa/thường và dấu tiếng Việt.
3. Xem tiêu đề, vở và đoạn trích của kết quả; dùng chuột hoặc mũi tên chọn.
4. Enter/chọn mở đúng note trong editor; chọn đúng vở chứa note.
5. Esc trước khi mở kết quả đóng tìm kiếm, trả focus về vị trí gọi.

Không hiển thị kết quả truy vấn cũ như kết quả của truy vấn mới. Không tự tạo note khi không tìm thấy. Nguồn: UX-05; FR-030, AC-026.

### PF-05. Tổ chức và xóa ghi chú

1. Tạo/đổi tên vở bằng biểu mẫu nhỏ và xác nhận.
2. Trong note, chọn “Chuyển đến…” → chọn vở đích → xác nhận chuyển bằng nút “Chuyển”.
3. Sau thành công, giữ editor note đó mở và chuyển ngữ cảnh danh sách sang vở đích; nội dung không đổi, không có hai bản note.
4. Xóa note qua dialog có tên và vở; hủy giữ nguyên, xác nhận mới xóa. Thành công chọn note kế cận hoặc trạng thái vở rỗng.
5. Xóa vở chỉ khi rỗng và không phải vở mặc định; nếu không hợp lệ, giải thích ngay tại hành động.

Khi note còn bản chưa lưu, giữ bản đó gắn với note qua thao tác chuyển. Nếu chuyển không thành công, báo chưa chuyển và giữ bản đang nhập. Xóa được xác nhận cũng có nghĩa bỏ bản đang sửa của chính note đó, phải thể hiện trong cảnh báo nếu có. Nguồn: FR-024–028; AC-023–025.

### PF-06. Tạo challenge và Done hằng ngày

1. Từ Hôm nay/Challenge chọn tạo, nhập tên, mục tiêu nguyên 1–7, mô tả tùy chọn; ngày bắt đầu mặc định hôm nay theo tài khoản.
2. Xem mốc bắt đầu tính streak; nếu giữa tuần, giải thích tuần khởi động bằng ngày cụ thể.
3. Sau tạo, challenge nằm trong danh sách đang hoạt động và Hôm nay.
4. Từ Hôm nay bấm Done một thao tác; trạng thái đang lưu được phân biệt với kết quả đã lưu.
5. Thành công cập nhật Done/tiến độ/streak; nhật ký có thể thêm riêng sau đó.

Bấm Done lặp không đảo về chưa Done. Bỏ Done là hành động riêng, rõ tên. Không bắt chọn thứ cố định. Nguồn: FR-007–010, FR-014–019, FR-037.

### PF-07. Sửa lịch sử, mục tiêu và lưu trữ challenge

1. Mở chi tiết → lịch sử → chọn ngày hợp lệ → ghi bù/bỏ Done/sửa nhật ký; bỏ Done giữ nhật ký.
2. Hiển thị kết quả ngày/tuần và streak được tính lại theo mục tiêu của giai đoạn liên quan.
3. Khi đổi mục tiêu, hiển thị mục tiêu hiện tại, mục tiêu chờ và ngày thứ Hai tuần sau; lần sửa tiếp thay thế mục tiêu chờ, cho hủy trước hiệu lực.
4. Nếu chuyển giữa 1–6/7 và 7/7, giải thích chuỗi hiện tại bắt đầu lại từ 0 khi có hiệu lực; giữ kỷ lục đúng đơn vị. Đổi trong nhóm 1–6/7 không tự đặt lại chuỗi.
5. Lưu trữ qua xác nhận có ngày kết thúc, hủy mục tiêu chờ và thông tin không mở lại được. Thành công rời danh sách hoạt động ngay.
6. Mở đã lưu trữ để xem/sửa từ ngày bắt đầu đến ngày lưu trữ; dùng nhãn “Chuỗi khi kết thúc theo dõi”.

Streak sau lưu trữ không giảm vì thời gian trôi qua nhưng phải tính lại khi sửa lịch sử hợp lệ. Tuần cuối chưa đạt dùng “Kết thúc theo dõi”, không tự gọi là tuần thất bại. Nguồn: FR-011–023, FR-042; AC-035–038.

### PF-08. Quản lý lịch cá nhân

1. Mở Lịch → chọn ngày → xem các sự kiện diễn ra trong ngày và challenge đã Done.
2. Tạo sự kiện với tên, ngày/giờ bắt đầu và kết thúc, mô tả tùy chọn → Lưu.
3. Kiểm tra kết thúc phải sau bắt đầu; nếu qua ngày, hiển thị rõ hai ngày và tìm thấy sự kiện từ cả các ngày nó diễn ra.
4. Mở sự kiện để sửa; xóa cần xác nhận và không có thùng rác.
5. Hover/focus/chạm icon challenge để xem tên; +N mở danh sách đầy đủ.

Sự kiện kết thúc không tự Done. Không xếp challenge chưa Done vào ngày lịch. Không có cả ngày, lặp, kéo thả hoặc nhắc lịch. Nguồn: FR-031–036, FR-038.

### PF-09. Tiếp tục trên thiết bị khác và xử lý xung đột

1. Chờ thiết bị A báo đã lưu; mở thiết bị B trực tuyến và nhận dữ liệu đã lưu.
2. Nếu cùng nội dung có xung đột, hiển thị hai bản có nhãn nguồn rõ ràng, cho đọc đầy đủ và chọn bản cần giữ; không chọn mặc định bản mới hơn.
3. Chờ giải quyết thì giữ bản đang nhập trong phiên và báo xung đột chưa được áp dụng; không âm thầm thay editor bằng bản từ thiết bị khác.
4. Sau lựa chọn và lưu thành công, đồng bộ kết quả và cập nhật mọi vùng liên quan.
5. Riêng Done/bỏ Done đối nghịch từ dữ liệu chưa cập nhật: cho chọn “Đã hoàn thành” hoặc “Chưa hoàn thành”. Trong lúc chờ, hiển thị trạng thái đã lưu thành công gần nhất cùng cảnh báo thao tác xung đột chưa áp dụng.

Hai thiết bị cùng Done hoặc cùng bỏ Done không cần dialog xung đột. Chủ động đổi lại sau khi đã thấy trạng thái mới là thao tác bình thường. Nguồn: FR-002–005, FR-023, FR-043.

### PF-10. Xuất và nhập bản sao lưu

1. Vào Cài đặt và dữ liệu → Xuất bản sao lưu → nhận tệp; sao lưu chứa dữ liệu sản phẩm đã lưu, không gọi bản đang nhập chưa lưu là đã được sao lưu.
2. Chọn Nhập → chọn tệp → kiểm tra khả năng đọc, đầy đủ và phiên bản hỗ trợ.
3. Tệp không hợp lệ: thông báo lý do, không cho xác nhận thay thế. Hợp lệ: hiển thị thông tin bản sao đọc được và cảnh báo thay thế toàn bộ dữ liệu, không gộp.
4. Nếu phiên có thay đổi chưa lưu, yêu cầu lưu/giải quyết hoặc chủ động bỏ các thay đổi đó trước bước xác nhận thay thế; không âm thầm xóa bản đang nhập.
5. Người dùng xác nhận → tạm ngăn sửa/Done/xóa/nhập lại trên cả hai thiết bị → hiển thị đang khôi phục.
6. Thành công: hiển thị kết quả, cập nhật dữ liệu mới trước khi cho sửa tiếp, bỏ ngữ cảnh trỏ đến mục không còn tồn tại.
7. Thất bại đã xác định: báo dữ liệu đã lưu trước nhập được giữ nguyên, cho thử lại.
8. Mất kết nối khi chưa biết kết quả: hiển thị “Chưa xác định được kết quả nhập”; kết nối lại và kiểm tra kết quả trước khi cho sửa hoặc nhập lại.

Thiết bị khác có bản đang nhập phải được thông báo khi việc nhập bắt đầu; giữ riêng bản trong phiên nhưng không tự gửi lại nội dung cũ sau khôi phục. Hủy chỉ khả dụng trước khi xác nhận; sau xác nhận không hiển thị lời hứa hủy/hoàn tác quá trình nhập. Nguồn: FR-040–041, FR-044–046; AC-031–032, AC-042–045.

## 7. Layout

### 7.1. Desktop Notes Workspace

```text
┌─────────┬─────────────────┬────────────────────┬──────────────────────────────┐
│ App     │ Cuốn vở         │ Danh sách note     │ Vở hiện tại · Đã lưu   […]   │
│ rail    │ Tìm ghi chú     │ + Ghi chú mới      │ Tiêu đề                      │
│         │ + Vở mới        │                    │──────────────────────────────│
│ Hôm nay │ Mặc định        │ Note đang chọn     │                              │
│ Challenge│ Vở A           │ Note khác          │ Nội dung văn bản             │
│ Ghi chú │ Vở B            │ …                  │                              │
│ Lịch    │                 │                    │                              │
│         │                 │                    │                              │
│ Cài đặt │                 │                    │                              │
└─────────┴─────────────────┴────────────────────┴──────────────────────────────┘
```

Ba vùng nội dung nằm cạnh app rail. Kích thước khởi điểm cho thiết kế desktop rộng: rail 56–64 px, vở 200–240 px, danh sách note 280–320 px; editor nhận phần còn lại và là vùng lớn nhất. Đây là thông số bố cục để điều chỉnh bằng kiểm thử, không phải yêu cầu chiều rộng cố định trên mọi laptop.

- Khi tổng chiều rộng không đủ giữ editor rộng hơn từng sidebar, tự chuyển sang bố cục gọn tại mục 12.
- Header thấp, nền trung tính, một màu nhấn cho chọn/hành động chính; lỗi có biểu tượng và chữ đi kèm.
- Văn bản nội dung có khoảng đệm dễ đọc, xuống dòng tự nhiên. Không kéo editor hẹp thành một “tờ giấy” nhỏ ở giữa màn hình.
- Mỗi danh sách/editor có vùng cuộn độc lập khi cần; không để cuộn danh sách làm mất vị trí nhập.
- Thu gọn sidebar giữ editor đang mở và có nút khôi phục dễ thấy; không yêu cầu shortcut để thoát chế độ tập trung.
- Không thêm thanh công cụ định dạng, panel metadata cố định hoặc nhiều tab note trong MVP.

### 7.2. Các khu vực khác

- **Hôm nay:** danh sách challenge chiếm ưu tiên thị giác; sự kiện trong vùng phụ ở desktop hoặc phía dưới ở màn hình hẹp; “Ghi chú mới” ở header dễ thấy.
- **Challenge:** danh sách và chi tiết cạnh nhau khi đủ rộng; lịch sử, nhật ký và mục tiêu thuộc chi tiết. Không ép mọi trường vào từng thẻ danh sách.
- **Lịch:** tháng ở vùng chính, ngày được chọn ở panel bên cạnh; màn hình hẹp đưa chi tiết ngày xuống dưới.
- **Cài đặt:** một cột nội dung dễ đọc, nhập backup tách khỏi nút xuất và đăng xuất để tránh bấm nhầm.

## 8. Interaction Rules

### 8.1. Tự lưu và bản đang nhập

- Tự lưu ghi chú sau khi nội dung thay đổi và người dùng tạm ngừng gõ; khi chuyển note/khu vực, yêu cầu lưu phần đang chờ mà không bắt đứng lại đợi. Khoảng chờ cụ thể sẽ được kiểm thử, chưa chốt một giá trị thời gian.
- Ngay khi có thay đổi chưa xác nhận, note không còn mang trạng thái “Đã lưu”. Chỉ xác nhận của đúng phiên bản nội dung hiện tại mới cho phép nhãn này.
- Phản hồi lưu cũ đến sau phản hồi mới không được ghi đè văn bản mới hơn hoặc gắn “Đã lưu” sai. Gõ tiếp khi lượt lưu trước còn chạy phải tiếp tục được bảo vệ.
- Tự lưu không đổi focus, con trỏ hoặc vị trí cuộn. Một lượt xác nhận không tạo toast thành công lặp lại liên tục.
- Giữ riêng nội dung đang nhập và trạng thái theo từng note, kể cả note đang ẩn hoặc khi chuyển sang Challenge/Lịch trong cùng phiên.
- Khi mất mạng giữa lúc nhập, báo “Chưa lưu — mất kết nối”, giữ bản đang nhập trong phiên và cho thử lại khi có mạng. Không mở rộng thành tạo note/Done ngoại tuyến hoặc cam kết lưu qua đóng/tải lại trang.
- Đăng xuất hoặc nhập backup khi còn nội dung chưa lưu phải cho người dùng cơ hội giữ lại bằng cách lưu/giải quyết trước, hoặc xác nhận bỏ. Cảnh báo đóng/tải lại trang dùng khả năng sẵn có của môi trường, không hứa chặn được mọi cách đóng trình duyệt.
- “Đã lưu” xác nhận dữ liệu đã lưu của mục đang xem; không tự đồng nghĩa mọi thiết bị đã nhận dữ liệu. Trạng thái đồng bộ được diễn đạt riêng khi cần.

### 8.2. Tạo note, tiêu đề và danh sách

- Tạo note không yêu cầu tiêu đề; cho lưu nội dung với tiêu đề trống hoặc tiêu đề với nội dung trống. Editor mới hoàn toàn chưa có dữ liệu chưa cần trở thành note đã lưu.
- Không tự xóa note đã tồn tại khi người dùng xóa hết văn bản. Nhãn khi đó là “Không tiêu đề”.
- Nhãn suy ra từ nội dung dùng dòng đầu tiên có chữ; rút gọn chỉ ở danh sách, không cắt văn bản được lưu. Nhập tiêu đề rõ ràng thay thế nhãn suy ra.
- Sắp theo cập nhật gần nhất. Trong một lượt dùng mũi tên chọn note, giữ ổn định tập/thứ tự điều hướng để phản hồi lưu hoặc đồng bộ không làm người dùng nhảy nhầm hàng. Khi kết thúc lượt thao tác, cập nhật thứ tự và giữ đúng note được chọn theo danh tính.
- Chọn note bằng chuột hiển thị editor, không tự chèn văn bản. Chọn bằng bàn phím có quy tắc focus tại mục 13.
- Menu phụ chỉ chứa thao tác ít dùng; tạo note, chọn vở và tìm kiếm không bị giấu trong menu nhiều tầng.

### 8.3. Tìm kiếm

- Phạm vi cố định: tiêu đề và nội dung của toàn bộ ghi chú đã lưu; không bao gồm nhật ký hoặc sự kiện.
- Ô tìm ghi rõ phạm vi; mở từ vở nào cũng không âm thầm giới hạn trong vở đó.
- Không phân biệt hoa/thường và dấu tiếng Việt. Quy tắc nhiều từ chưa được PRD chốt, được giữ tại mục 16.
- Khi truy vấn thay đổi, phản hồi cũ không được thay kết quả mới. Truy vấn trống hiển thị lời nhắc nhập, không coi là “không có dữ liệu”.
- Bản sửa chưa lưu có thể chưa xuất hiện trong tìm kiếm; note có lỗi vẫn truy cập được qua danh sách/trạng thái lỗi trong phiên. Không hứa tìm kiếm mọi bản chưa lưu.

### 8.4. Challenge, biểu mẫu và hành động có hậu quả

- Done là hành động ghi nhận cho ngày được chỉ định; không dùng nút toggle đảo trạng thái chỉ vì người dùng bấm lặp.
- Cho Done vượt mục tiêu tuần, ví dụ 4/3, tối đa bảy ngày; không vô hiệu hóa vì đã đạt mục tiêu.
- Bỏ Done được đặt tên rõ và giữ nhật ký. Nhật ký dùng vùng nhập theo ngày, có nút lưu riêng và trạng thái lưu; không kích hoạt Done khi lưu nhật ký.
- Tạo/sửa challenge, sự kiện và tên vở dùng Lưu/Hủy rõ ràng. Lỗi nằm cạnh trường tương ứng và giữ lại dữ liệu đã nhập.
- Tên vở/challenge/sự kiện cần có nội dung; mô tả tùy chọn. Giới hạn độ dài hoặc quy tắc trùng tên chưa được tự đặt trong UX này.
- Mục tiêu nhận số nguyên 1–7; thời gian sự kiện kết thúc sau bắt đầu. Ngày lịch sử ngoài khoảng hợp lệ không thể ghi Done và có lý do dễ hiểu.
- Xóa note/sự kiện có dialog xác nhận, mặc định focus hành động an toàn. Không cung cấp toast “Hoàn tác” vì MVP không có khôi phục riêng từng mục.
- Lưu trữ challenge nêu rõ không mở lại, hủy mục tiêu chờ, giữ lịch sử đến ngày lưu trữ. Chi tiết phép tính tiếp tục theo FR-042.
- Nếu hành động thất bại, không làm mục biến mất vĩnh viễn trên UI hoặc báo thành công. Không gửi lặp một thao tác đang xử lý chỉ do nhấn nhiều lần.

### 8.5. Cập nhật liên màn hình

Done, bỏ Done, ghi bù, giải quyết xung đột và lưu trữ phải cập nhật nhất quán Hôm nay, chi tiết challenge và icon lịch. Sửa/chuyển/xóa note phải cập nhật danh sách, kết quả tìm kiếm và ngữ cảnh đang mở. Sự kiện cập nhật cả lịch và Hôm nay. Phần đang chờ xác nhận được phân biệt với trạng thái đã lưu.

## 9. Empty States

| Ngữ cảnh | Nội dung gợi ý | Hành động |
|---|---|---|
| Chưa có challenge hoạt động | “Chưa có challenge đang theo dõi.” | “Tạo challenge”; vẫn hiển thị sự kiện và ghi nhanh. |
| Challenge chưa có lịch sử | “Chưa có ngày hoàn thành.” | Done hôm nay nếu hợp lệ; xem giải thích tuần khởi động khi áp dụng. |
| Chưa có challenge lưu trữ | “Chưa có challenge đã lưu trữ.” | Quay lại đang hoạt động. |
| Vở mặc định chưa có note | “Ghi lại ý tưởng đầu tiên của bạn.” | “Ghi chú mới”, mở editor và focus nội dung. |
| Vở khác rỗng | “Cuốn vở này chưa có ghi chú.” | “Ghi chú mới”; không yêu cầu đổi vở. |
| Editor mới chưa nhập | Placeholder ngắn “Bắt đầu viết…” | Nhập nội dung ngay, tiêu đề tùy chọn. Placeholder không thay nhãn truy cập. |
| Tìm kiếm chưa có truy vấn | “Nhập từ khóa để tìm trong tất cả ghi chú.” | Focus ô tìm kiếm. |
| Tìm không thấy | “Không tìm thấy ghi chú phù hợp.” | Sửa/xóa truy vấn; không đổi sang tìm nhật ký hoặc tự tạo note. |
| Ngày không có sự kiện | “Không có sự kiện trong ngày này.” | “Tạo sự kiện”; challenge Done nếu có vẫn hiển thị riêng. |
| Ngày không có challenge Done | “Chưa có challenge được ghi nhận hoàn thành.” | Không diễn giải thành bỏ lỡ hoặc không có sự kiện. |

Chỉ hiển thị trạng thái rỗng sau khi tải thành công và xác định không có dữ liệu. Không dùng trạng thái rỗng thay cho lỗi tải, chưa xác thực hoặc đang đồng bộ.

## 10. Loading States

| Tình huống | Phản hồi UI | Khả năng tương tác |
|---|---|---|
| Mở app | Khung bố cục ổn định và thông báo “Đang tải…” tại vùng đích | Không bắt chờ dữ liệu của cả ba mảng khi chỉ một khu vực cần dùng; dữ liệu riêng tư chỉ sau xác thực. |
| Tải danh sách vở/note | Khung giữ chỗ có bố cục tương ứng | Không nhấp placeholder như dữ liệu thật; không hiện “Vở rỗng” sớm. |
| Chuyển sang note chưa tải | Giữ sidebar, đánh dấu đúng note đích, editor báo đang tải | Không cho gõ vào nội dung note cũ dưới tiêu đề note mới; lựa chọn mới nhất quyết định editor được mở. |
| Đang tìm | Chỉ báo tại kết quả, giữ truy vấn đang nhập | Cho tiếp tục gõ/đóng; chỉ kết quả đúng truy vấn hiện tại được chọn. |
| Note có thay đổi chờ lưu | “Chưa lưu” rồi “Đang lưu…” khi gửi | Cho gõ và chuyển note; quản lý trạng thái riêng từng note. |
| Đang Done/Lưu biểu mẫu | Trạng thái đang xử lý tại hành động | Chặn gửi trùng chính thao tác đó; phần không liên quan vẫn dùng được. |
| Đồng bộ dữ liệu | Chỉ báo ngắn khi cần; nội dung đang sửa được bảo vệ | Không lấy dữ liệu đến sau ghi đè bản đang nhập mà bỏ qua xử lý xung đột. |
| Đang xuất/kiểm tra backup | “Đang chuẩn bị bản sao…” / “Đang kiểm tra bản sao…” | Không báo tệp sẵn sàng trước khi có kết quả; nhập chưa được xác nhận chưa thay dữ liệu. |
| Đang nhập sau xác nhận | Thông báo cố định “Đang khôi phục dữ liệu…” | Khóa mọi thay đổi sản phẩm trên cả hai thiết bị; không hiện phần trăm giả hoặc nút nhập lại. |

Chỉ báo tải không nhấp nháy làm gián đoạn người dùng và không dịch chuyển vùng đang có focus. Thời gian/chiến lược tải là quyết định triển khai cần đo, không được biến các nhãn trên thành lời hứa hiệu năng.

## 11. Error States

| Lỗi/trạng thái | Thông báo và xử lý | Điều phải bảo toàn |
|---|---|---|
| Đăng nhập thất bại/hết phiên | Báo cần truy cập lại, giữ đích điều hướng; nếu đang có bản chưa lưu, thông báo rõ trước thao tác rời phiên | Không hiển thị dữ liệu cho người chưa được phép; không hứa bản chưa lưu sống qua mọi luồng xác thực. |
| Lỗi tải danh sách/note | “Không tải được …” và “Thử lại” tại vùng lỗi | Không thay bằng trạng thái rỗng; không cho sửa nội dung chưa tải đúng. |
| Mất mạng trong khi nhập | “Chưa lưu — mất kết nối. Nội dung hiện chỉ được giữ trong phiên này.”; thử lại khi có mạng | Bản đang nhập, danh tính note và trạng thái chưa lưu. |
| Lưu note thất bại | “Chưa lưu được ghi chú” và “Thử lại”; note đang ẩn có dấu hiệu lỗi truy cập được | Không mất bản đang nhập, không báo đã lưu dựa vào phiên bản cũ. |
| Tìm kiếm thất bại | “Không tìm được lúc này” và thử lại; giữ truy vấn | Không báo “Không có kết quả” như một kết luận dữ liệu. |
| Xung đột nội dung | Cho đọc hai bản và chọn nội dung cần giữ; nêu rõ bản nào sẽ được thay thế | Không âm thầm ghi đè; có thể đóng tạm nhưng trạng thái chưa giải quyết vẫn còn và không tự gửi đè. |
| Xung đột Done/bỏ Done | Chọn “Đã hoàn thành” / “Chưa hoàn thành”; nêu rõ challenge và ngày | Giữ trạng thái đã lưu gần nhất trong lúc chờ; giữ nhật ký. |
| Mục đã bị xóa trên thiết bị khác | Báo mục không còn tồn tại; nếu không có bản đang sửa thì quay về ngữ cảnh hợp lệ | Nếu có bản đang sửa, giữ trong phiên và ngừng gửi lại; không tự tái tạo mục. Chính sách sửa đối nghịch xóa còn tại mục 16. |
| Validation | Lý do cạnh trường: tên còn trống, mục tiêu ngoài 1–7, kết thúc không sau bắt đầu, ngày không hợp lệ | Giữ các trường hợp lệ và đưa focus đến lỗi đầu tiên khi gửi. |
| Chuyển/xóa/lưu trữ thất bại | Báo hành động chưa hoàn tất và cho thử lại | Không hiển thị trạng thái thành công giả hoặc bỏ bản đang nhập. |
| Backup không hợp lệ | Nêu lý do đọc lỗi/thiếu dữ liệu/phiên bản không hỗ trợ; chọn tệp khác | Dữ liệu hiện tại không đổi. |
| Nhập thất bại đã xác định | “Khôi phục thất bại. Dữ liệu đã lưu trước khi nhập được giữ nguyên.” | Không có kết quả cuối thay thế một phần; cho thử lại. |
| Mất mạng khi chưa biết kết quả nhập | “Chưa xác định được kết quả nhập” | Giữ khóa thay đổi; kiểm tra kết quả khi kết nối lại trước sửa hoặc nhập lại. |

Lỗi cần hành động không chỉ tồn tại trong toast tự biến mất. Thông báo phải có văn bản dễ hiểu, tên mục/ngày liên quan khi cần và hành động phục hồi phù hợp. Lỗi nền không tự cướp focus khỏi editor; khi người dùng chọn giải quyết mới mở dialog.

## 12. Responsive Behavior

Desktop-first nghĩa là tối ưu không gian làm việc và bàn phím trên laptop trước, đồng thời giữ đầy đủ luồng quan trọng trên điện thoại theo NFR-002.

| Chế độ | Ghi chú | Các màn hình khác |
|---|---|---|
| Desktop đủ rộng | App rail + vở + danh sách note + editor; editor lớn nhất | Challenge danh sách/chi tiết; lịch tháng/panel ngày cạnh nhau. |
| Laptop hẹp / viewport thu nhỏ | Thu gọn vở trước; giữ danh sách note và editor nếu đủ chỗ. Có nút mở vở và khôi phục sidebar | Giảm số vùng cạnh nhau, không cắt mất hành động chính hoặc ép chữ quá nhỏ. |
| Điện thoại / viewport rất hẹp | Một vùng mỗi lần: vở → danh sách note → editor. Quay lại giữ vị trí danh sách và bản đang nhập | Hôm nay một cột; challenge danh sách → chi tiết; lịch tháng và danh sách ngày xếp dọc. |

- Chuyển chế độ theo không gian thực tế; breakpoint cụ thể được kiểm thử với DEP-005, không tự coi các chiều rộng minh họa là ngưỡng nghiệm thu.
- Trên điện thoại, bốn khu vực chính nằm trong menu điều hướng có nút mở rõ ràng; header editor giữ nút về danh sách, vở hiện tại và trạng thái lưu. Tránh thanh cố định chiếm vùng bàn phím.
- Khi bàn phím ảo mở, con trỏ và trường đang nhập phải còn nhìn thấy; nội dung cuộn được, hành động đóng/quay lại không bị che hoàn toàn.
- Tìm kiếm dùng lớp phủ vừa viewport, trên điện thoại có thể chiếm màn hình; kết quả và ô tìm không bị bàn phím che mất toàn bộ.
- Dialog dài và so sánh xung đột có cuộn; hai bản đặt cạnh nhau trên desktop, xếp dọc trên điện thoại, đều đọc được đầy đủ.
- Calendar vẫn có góc nhìn tháng; điều chỉnh số icon mỗi ô theo chỗ trống và +N phản ánh đúng số bị ẩn. Chạm có cùng thông tin như hover.
- Thu gọn sidebar do viewport tạm thời không ghi đè lựa chọn desktop đã nhớ. Đổi kích thước không tạo editor mới, mất nội dung hoặc đặt lại vị trí đang nhập.

## 13. Keyboard Interactions

### 13.1. Ánh xạ UX-10 đã được duyệt

| Tổ hợp dự kiến | Lệnh | Phạm vi và focus |
|---|---|---|
| Ctrl/Cmd + N | Ghi chú mới | Vở hiện tại trong Ghi chú, vở mặc định ở khu vực khác; focus nội dung. |
| Ctrl/Cmd + K | Tìm ghi chú | Lớp tìm toàn bộ ghi chú; focus ô tìm, đóng về vị trí gọi. |
| Ctrl/Cmd + Shift + N | Vở mới | Trong Ghi chú; mở biểu mẫu và focus tên vở. |
| Alt + ↑ / ↓ | Note trước/sau | Trong Notes Workspace khi môi trường cho phép; theo danh sách vở hiện tại, giữ note đích đúng và không vòng lại bất ngờ ở đầu/cuối. |
| Ctrl/Cmd + 1…4 | Hôm nay / Challenge / Ghi chú / Lịch | Điều hướng khu vực khi không có dialog chặn. |
| Esc | Đóng lớp trên cùng | Tìm kiếm, menu, tooltip mở rộng hoặc dialog có thể hủy; không xóa nội dung, không coi là hủy một lượt nhập backup đã xác nhận. |

**Giới hạn môi trường:** Một số tổ hợp đã đề xuất trùng lệnh trình duyệt/hệ điều hành hoặc lệnh soạn thảo; đặc biệt N, Shift+N và 1…4. Phê duyệt UX-10 chốt ý định và ánh xạ mong muốn, chưa chứng minh web app nhận được mọi tổ hợp. Không coi một lệnh đã triển khai thành công nếu trình duyệt thực tế xử lý phím trước ứng dụng. Trước nghiệm thu phải kiểm thử DEP-005 và ghi nhận tổ hợp thay thế khả dụng nếu cần; không quảng bá shortcut chưa hoạt động. Không bổ sung chế độ tùy biến shortcut phức tạp vào MVP để giải quyết vấn đề này.

### 13.2. Điều hướng bàn phím không phụ thuộc shortcut toàn cục

- Tab/Shift+Tab đi qua các điều khiển theo thứ tự đọc: app navigation → vở → danh sách note → điều khiển editor → tiêu đề → nội dung. Có lối bỏ qua điều hướng để đến vùng chính/editor nhanh.
- Trong danh sách note đang focus, ↑/↓ đổi hàng được focus; Enter mở note và chuyển focus sang editor. Không bắt Tab qua hàng nghìn note. Hàng đang focus và note đang mở có thể phân biệt.
- Trong tìm kiếm, ↑/↓ đổi kết quả đang chọn, Enter mở, Esc đóng. Chỉ một kết quả được kích hoạt cho một lần nhấn.
- Space/Enter kích hoạt nút theo vai trò điều khiển. Phím mũi tên trong editor giữ hành vi chỉnh sửa văn bản bình thường; không dùng phím đơn toàn cục để chuyển khu vực.
- Lịch và lịch sử có cách di chuyển ngày bằng bàn phím, Enter chọn ngày, rồi Tab đến danh sách chi tiết/hành động. Ngày chọn, hôm nay và ngày đã Done được phân biệt bằng nhãn.
- Dialog nhận focus vào tiêu đề/trường đầu tiên phù hợp; dialog xóa/nhập thay thế ưu tiên hành động an toàn. Tab ở trong dialog, đóng trả focus về điều khiển gọi hoặc vị trí hợp lệ gần nhất nếu mục đã bị xóa.
- Không chạy shortcut nền trong dialog, khi đang tổ hợp ký tự tiếng Việt/IME hoặc khi tổ hợp cần dành cho việc chỉnh sửa đang diễn ra. Mọi lệnh đều có nút/menu tương đương dùng được bằng Tab và Enter.
- Khi tạo note mới, focus vào nội dung theo UX-02; khi chỉ mở app hoặc chuyển khu vực bằng điều hướng thông thường, đưa focus đến vùng/tiêu đề phù hợp, không tự mở bàn phím ảo vô cớ.

## 14. Accessibility Considerations

- Dùng cấu trúc trang có điều hướng, vùng chính, tiêu đề và danh sách rõ ràng; tên truy cập cho mọi nút icon, vở, note và hành động theo ngày.
- Trạng thái chọn/focus/lỗi/Done không chỉ phân biệt bằng màu. Focus luôn nhìn thấy và không bị header, panel hoặc bàn phím che.
- Text và điều khiển có tương phản dễ đọc; không dùng chữ phụ quá nhạt cho thông tin lưu, ngày hoặc tiến độ quan trọng. Chưa tuyên bố chứng nhận tiêu chuẩn accessibility trong tài liệu này.
- Hỗ trợ phóng to chữ và thu hẹp viewport bằng reflow; tránh cuộn ngang toàn trang để đọc note. Chuỗi dài xuống dòng khi cần mà không sửa dữ liệu gốc.
- Vùng chạm đủ rộng và có khoảng cách giữa Done, menu và xóa; icon nhỏ trong lịch phải có mục tương đương ở danh sách ngày để dễ thao tác.
- Hover tooltip cũng xuất hiện khi focus và có tương đương bằng chạm. +N có tên như “Xem thêm 3 challenge đã hoàn thành ngày …”.
- Gán nhãn đầy đủ cho ô tiêu đề/nội dung, ngày/giờ bắt đầu và kết thúc; placeholder chỉ là gợi ý. Thông báo lỗi liên kết với trường và được đọc khi người dùng gửi biểu mẫu lỗi.
- Đọc tiến độ có nghĩa, ví dụ “Đã hoàn thành 2 trên mục tiêu 3 ngày trong tuần”; streak nêu rõ ngày/tuần, không chỉ icon lửa và số.
- Thông báo lưu/đồng bộ cho công nghệ hỗ trợ theo cách không ngắt liên tục mỗi lần gõ; lỗi cần xử lý được thông báo rõ nhưng không tự giật focus.
- Tôn trọng lựa chọn giảm chuyển động; không cần animation để hiểu Done, chuyển note hoặc trạng thái tải.
- Kiểm thử các luồng chính bằng bàn phím thuần, chạm, phóng to và trình đọc màn hình; đặc biệt focus sau xóa, chuyển note đang lưu, dialog xung đột và khóa nhập backup.

## 15. UX Decisions Affecting Architecture

Các mục dưới đây là hành vi architecture cần hỗ trợ, không chỉ định framework, database, API hoặc nhà cung cấp.

| ID | Quyết định / ràng buộc UX | Hệ quả cần thiết kế | Nguồn |
|---|---|---|---|
| AX-01 | Khôi phục khu vực/note và sidebar theo thiết bị | Có ngữ cảnh điều hướng bền qua lần mở app, tách khỏi dữ liệu nội dung; kiểm tra mục còn tồn tại và quyền truy cập; link trực tiếp ưu tiên hơn khôi phục | UX-01, UX-07; FR-001 |
| AX-02 | Editor dùng chung, chuyển note không chờ lưu | Vòng đời bản đang nhập/lượt lưu không phụ thuộc editor đang hiển thị; trạng thái theo danh tính note, xử lý phản hồi đến không đúng thứ tự | UX-02, UX-06, UX-08; FR-029 |
| AX-03 | Trạng thái lưu chính xác và bảo vệ bản trong phiên | Phân biệt nội dung hiện tại, nội dung đã xác nhận, lỗi và đồng bộ; cảnh báo rời phiên; không coi bộ nhớ trong phiên là lưu ngoại tuyến | FR-003–005; NFR-004–006 |
| AX-04 | Không ghi đè xung đột giữa hai thiết bị | Nhận biết thay đổi dựa trên bản chưa cập nhật, giữ các nội dung để người dùng chọn, áp dụng kết quả nhất quán; xử lý sửa đối nghịch xóa cần quyết định riêng | FR-004, FR-043; PF-09 |
| AX-05 | Note tạo nhanh, tiêu đề trống, vở một cấp | Hỗ trợ tiêu đề trống và nhãn suy ra; vở mặc định luôn xác định được; chuyển vở không nhân bản; kiểm tra xóa vở rỗng cả khi dữ liệu thay đổi từ thiết bị khác | UX-02–03; FR-024–028 |
| AX-06 | Tìm toàn bộ note không dấu, mở trực tiếp, thứ tự gần nhất | Có khả năng tìm tiêu đề/nội dung đã lưu nhất quán, phục vụ danh sách hiệu quả, loại phản hồi truy vấn cũ, giữ danh tính selection qua sắp xếp | UX-04–05; FR-030; NFR-009 |
| AX-07 | Hôm nay, lịch và challenge có cùng tiến độ/Done | Các góc nhìn dùng quy tắc ngày/tuần và kết quả nhất quán; Done lặp không đếm thêm; ghi bù/đổi mục tiêu/lưu trữ cập nhật lịch sử và các góc nhìn liên quan | FR-006–023, FR-034–038, FR-042–043 |
| AX-08 | Nhập backup thay thế toàn bộ với khóa hai thiết bị | Kiểm tra trước nhập, kết quả toàn bộ hoặc giữ nguyên khi thất bại, trạng thái nhập có thể kiểm tra sau mất mạng, ngăn ghi dữ liệu cũ sau khôi phục | FR-040–041, FR-044–046 |
| AX-09 | Mở app nhanh và responsive không mất bản đang nhập | Khu vực đích có thể sẵn sàng mà không đợi toàn bộ sản phẩm; thay layout không đặt lại phiên editor; đo các mốc mở/chuyển/tìm trên thiết bị thật | UG-01–04; NFR-001–002, NFR-009 |
| AX-10 | Keyboard và accessibility xuyên các vùng | Quản lý focus/lệnh theo ngữ cảnh, không xung đột IME/dialog; bố cục và danh sách hiệu quả vẫn phải dùng được với bàn phím/công nghệ hỗ trợ | UX-10; mục 13–14 |

Ưu tiên trao đổi architecture sớm: AX-02–04 và AX-08, vì các quyết định này chi phối vòng đời nội dung, độ tin cậy đồng bộ và khả năng phục hồi. AX-01, AX-06 và AX-09 chi phối trải nghiệm mở app và switching nhanh. Không mặc định cần kiến trúc ngoại tuyến hoặc ứng dụng native để đáp ứng các mục này.

## 16. Dependencies and Remaining Details

| Điểm còn cần xác định | Trạng thái và cách xử lý trong UX |
|---|---|
| Ngày bắt đầu challenge ngoài hôm nay, quyền sửa sau hoạt động — DEP-001 | Đặc tả luồng mặc định hôm nay; chưa mở tùy chọn quá khứ/tương lai hoặc quyền sửa như một quyết định đã duyệt. |
| Giá trị múi giờ tài khoản — DEP-002 | UI dùng giá trị tài khoản cố định; không tự lấy múi giờ máy hoặc timezone môi trường làm giá trị sản phẩm. |
| Thiết bị/trình duyệt — DEP-005 | Cần trước kiểm thử responsive, bàn phím/IME, shortcut và accessibility thực tế. |
| Ngưỡng lưu/đồng bộ/tìm kiếm — DEP-006 và PRD §13.4 | Có hành vi tự lưu/rời note trong tài liệu này; khoảng chờ, mốc đo, ngưỡng và quy mô dữ liệu cụ thể chưa chốt. Không coi là đã PASS hiệu năng. |
| Phương thức xác thực/vận hành — DEP-008 | Màn hình và luồng đăng nhập cụ thể phụ thuộc lựa chọn sau; không mặc định nhà cung cấp hay thời lượng phiên. |
| Phạm vi xung đột văn bản và sửa đối nghịch xóa — PRD §13.4 | Có UX giữ bản/hiển thị xung đột; chưa tự chọn chính sách gộp, tạo bản sao hoặc khôi phục note đã xóa. Done/bỏ Done đã chốt theo FR-043. |
| Khớp truy vấn nhiều từ — PRD §13.4 | Không tự chọn khớp cụm từ hay tất cả/từng từ. Giữ yêu cầu tiêu đề/nội dung, không dấu/không phân biệt hoa thường. |
| Quy tắc trường và giới hạn | Tiêu đề note trống đã được UX-03 giải quyết; chưa chốt giới hạn độ dài, trùng tên hoặc mặc định giá trị biểu mẫu chưa có nguồn. |
| Shortcut trùng lệnh hệ thống | Kiểm thử ánh xạ đã duyệt; tổ hợp thay thế nếu cần phải được ghi lại trước hoàn thiện hướng dẫn/phép nghiệm thu. Không cần thiết kế thêm chức năng sản phẩm để tiếp tục đặc tả. |

Các phụ thuộc trên không chặn việc tạo tài liệu UX này; chúng là đầu vào còn thiếu cho phần thiết kế/kiểm chứng liên quan. DEP-003–004 đã đóng trong PRD và không yêu cầu xác nhận lại. Không mở lại baseline sản phẩm hoặc thay đổi thứ tự ưu tiên bằng tài liệu UX.

## 17. UX Verification Checklist

Đây là danh sách kiểm chứng khi có giao diện; chưa phải kết quả kiểm thử phần mềm.

- Lần đầu mở Hôm nay; mở lại đúng khu vực/note trên thiết bị; xử lý được link trực tiếp và mục đã bị xóa.
- Một lần gọi Ghi chú mới đưa focus vào nội dung và đúng vở; tiêu đề trống lưu được; đóng editor mới chưa nhập không sinh note rác.
- Sửa A → chuyển B trước khi A lưu → sửa B → quay lại A: cả hai bản đúng; phản hồi đến muộn không đổi nhầm editor hoặc báo lưu sai.
- Tạo/sửa note → xác nhận đã lưu → tải lại/mở thiết bị khác: văn bản giữ đúng theo AC-002, AC-023.
- Tìm “HOC TIENG ANH” thấy note chứa “Học tiếng Anh” trong tiêu đề hoặc nội dung; không tìm nhật ký; truy vấn thay đổi nhanh không mở nhầm kết quả cũ.
- Chuyển vở/xóa note xử lý đúng selection, trạng thái chưa lưu và xác nhận; vở mặc định/vở còn note được bảo vệ.
- Done một thao tác, nhấn lặp không bỏ Done/đếm thêm; nhật ký riêng; bỏ Done giữ nhật ký; kết quả Hôm nay/Challenge/Lịch nhất quán.
- Các tình huống 3/7, 7/7, tuần khởi động, chuyển mục tiêu và lưu trữ giữ đúng nhãn, đơn vị, khoảng ngày theo AC-013–022, AC-035–038.
- Mất mạng khi nhập báo chưa lưu và giữ bản trong phiên; xung đột cho chọn, không ghi đè âm thầm; lỗi note đang ẩn vẫn tìm đến được.
- Sự kiện qua ngày xuất hiện trong các ngày diễn ra; +N, hover/focus/chạm mở đủ thông tin và không liên kết tự động sự kiện với Done.
- Nhập backup kiểm tra trước xác nhận, khóa hai thiết bị, thất bại giữ nguyên dữ liệu, mất mạng hiển thị chưa xác định kết quả và không cho sửa/nhập lại sớm.
- Các luồng quan trọng dùng được bằng Tab/Enter, bàn phím trong danh sách, chạm và màn hình hẹp; ghi rõ shortcut nào hoạt động trên môi trường thực tế.
- Ghi số thao tác và thời gian mở app/tạo/chuyển/tìm note; ghi thiết bị, trình duyệt, mạng và dữ liệu thử; không kết luận đạt ngưỡng chưa được chốt.

---

**Bàn giao:** UX direction và UX-01–UX-10 đã được đồng ý; tài liệu này cụ thể hóa để phục vụ architecture và triển khai ở bước được cho phép tiếp theo. Chưa tạo frontend code, chọn stack hoặc thực thi kiểm thử ứng dụng.
