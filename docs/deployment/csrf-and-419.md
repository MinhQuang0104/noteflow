# Sanctum CSRF bootstrap và HTTP 419

Ngày ban hành: 2026-10-07  
Finding: D-04  
Phạm vi: browser first-party SPA dùng session cookie của Sanctum.

Tài liệu này là phần bắt buộc của integration contract cho các client browser.
OpenAPI mô tả resource/auth contract; flow bootstrap CSRF và cách xử lý 419
được ràng buộc ở đây để client không coi một request unsafe là đã được chấp
nhận chỉ vì có session cookie.

## Flow bootstrap

1. Trước lần `POST /login`, browser gọi `GET /sanctum/csrf-cookie` với
   `credentials: 'same-origin'`. Đây là endpoint bootstrap của Sanctum; browser
   lưu cookie `XSRF-TOKEN` do server trả về.
2. Client đọc giá trị `XSRF-TOKEN` từ cookie, URL-decode giá trị đó, rồi gửi
   header `X-XSRF-TOKEN` cùng `credentials: 'same-origin'` trên request unsafe.
   Trong repo, `frontend/src/api/auth.ts` thực hiện bước này cho login và dùng
   token hiện tại cho logout; các mutation challenge/journal dùng cùng quy tắc.
3. Client gửi `POST /login` với body login và XSRF header. Sau khi login thành
   công, session cookie được dùng cho các request `/api/v1/*`; các route private
   yêu cầu `auth:sanctum` và `owner`.
4. Khi session/XSRF cookie được làm mới hoặc hết hạn, client phải gọi lại
   `GET /sanctum/csrf-cookie` trước khi thử lại request unsafe. Browser tự quản
   lý `Set-Cookie`; client không tự tạo token bằng cách khác.

Request GET để đọc resource không thay thế bước bootstrap cho request unsafe.
Mọi request phải giữ same-origin credentials và header `Accept` phù hợp để
nhận lỗi JSON.

## Khi nào trả 419

`backend/bootstrap/app.php` nhận `TokenMismatchException` với status 419 trên
`/login` hoặc `/logout` và chuẩn hóa response JSON thành:

```json
{
  "message": "Phiên bảo mật đã hết hạn. Vui lòng thử lại.",
  "code": "csrf_expired"
}
```

Nguyên nhân tích hợp thường là chưa bootstrap CSRF, header bị thiếu/sai,
cookie đã hết hạn, hoặc session/token không còn khớp. 419 là lỗi bảo vệ request
và khác với 401 (chưa xác thực), 403 (không có quyền), 409 (xung đột state) và
422 (validation).

Contract hiện có khai báo response `419` cho login/logout. Tài liệu này không
thêm endpoint hay response 419 mới vào OpenAPI; nó giải thích cách browser
client xử lý boundary đã có.

## Quy tắc client khi nhận 419

- Không hiển thị thành công, không tự xóa private state, và không coi request
  unsafe đã được server chấp nhận.
- Gọi lại `GET /sanctum/csrf-cookie`, đọc token mới, rồi thử lại tối đa một lần
  với cùng request semantics. Với mutation có `command_id`, giữ nguyên
  `command_id`, `base_version`, `data_epoch` và body đã đóng băng; không tạo
  command mới cho một outcome chưa rõ.
- Nếu lần thử lại vẫn là 419, dừng vòng lặp, hiển thị lỗi phiên bảo mật và
  yêu cầu thao tác login/try again theo UI. Không retry vô hạn hoặc retry mù
  sau các lỗi 401/403/409/422.
- Với logout, 419 chỉ được coi là logout chưa xác nhận. Client hiện tại ném
  `AuthenticationError` có `status = 419`; caller phải báo lỗi và giữ nguyên
  private draft/cache cho tới khi logout thành công hoặc có flow session-expiry
  riêng.

Các kiểm tra client tương ứng nằm trong
`frontend/src/api/__tests__/auth.spec.ts` và
`frontend/src/api/__tests__/challenges.spec.ts`; chúng kiểm tra bootstrap,
same-origin credentials, header decode và việc 419 được biểu diễn thành lỗi có
kiểu.
