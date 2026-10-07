# Edge security checklist

Ngày ban hành: 2026-10-07  
Finding: G-01  
Mô hình ownership: shared ownership giữa edge/hosting và app origin.

Checklist này phân định boundary và cách thu evidence. Cột sign-off được giữ
trống cho owner có thẩm quyền; tài liệu không coi cấu hình production edge là
đã tồn tại chỉ vì local compose hoặc README có nhắc tới nó.

| Property | Owner | Cách kiểm | Sign-off |
|---|---|---|---|
| TLS termination | Edge/hosting | Kiểm tra cấu hình load balancer/CDN/reverse proxy và dùng `curl -sSIL https://<public-host>/up` để xác nhận certificate, protocol, redirect HTTP→HTTPS và host cuối | |
| HSTS (`Strict-Transport-Security`) | Edge/hosting | Gọi HTTPS ở public edge, kiểm tra header có `max-age` phù hợp và `includeSubDomains`/`preload` chỉ khi policy đã được phê duyệt; đối chiếu config edge | |
| CSP (`Content-Security-Policy`) | App origin | Gọi response HTML qua origin và public edge, ghi nhận toàn bộ policy; đối chiếu middleware/web server nếu có. Không tìm thấy CSP header trong code app hiện tại | |
| `X-Content-Type-Options` | App origin | Kiểm tra `nosniff` trên HTML, JSON và asset responses ở origin và edge. Không tìm thấy header này trong code app hiện tại | |
| `frame-ancestors` / `X-Frame-Options` | App origin | Kiểm tra CSP `frame-ancestors` và/hoặc `X-Frame-Options` trên HTML, rồi thử policy trong browser hoặc scanner ở public edge. Không tìm thấy header này trong code app hiện tại | |
| `Referrer-Policy` | App origin | Gọi HTML/API ở origin và edge, kiểm tra header và policy đã được platform phê duyệt. Không tìm thấy header này trong code app hiện tại | |
| `Permissions-Policy` | App origin | Gọi HTML/API ở origin và edge, kiểm tra directive được trả về khớp policy deployment. Không tìm thấy header này trong code app hiện tại | |
| Cookie `Secure` / `SameSite` | App origin (edge phải giữ nguyên thuộc tính) | Kiểm tra `Set-Cookie` của session và XSRF cookie trên HTTPS bằng browser DevTools hoặc `curl -I`; đối chiếu `backend/config/session.php`, `SESSION_SECURE_COOKIE` và `SESSION_SAME_SITE`. Repo local đặt `SESSION_SECURE_COOKIE=false`, `SameSite` mặc định `lax`; README yêu cầu production đặt secure=true | |

## Evidence đã thấy trong app origin

Code app hiện đặt `Cache-Control: private, no-store` cho các response private
qua [`PrivateNoStore.php`](../../backend/app/Http/Middleware/PrivateNoStore.php)
và đặt lại header này trong exception responder cho login/logout/session tại
[`bootstrap/app.php`](../../backend/bootstrap/app.php). Đây là header cache
privacy, không phải bằng chứng cho HSTS, CSP, clickjacking, referrer hay
permissions policy.

Session cookie được cấu hình qua
[`config/session.php`](../../backend/config/session.php): `secure` đọc từ
`SESSION_SECURE_COOKIE`, còn `same_site` đọc từ `SESSION_SAME_SITE` và mặc
định `lax`. `backend/.env.example` và `compose.local.yaml` là cấu hình local;
không phải sign-off cho production.

Không tìm thấy trong checkout này cấu hình production edge hoặc middleware app
phát các security headers còn lại. Vì vậy các ô sign-off ở trên phải được
platform/app owner xác nhận bằng response thực từ origin và public edge.
