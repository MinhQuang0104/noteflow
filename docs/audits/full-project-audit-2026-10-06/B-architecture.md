# WS-B — Kiến trúc và ranh giới module

[F] Phạm vi là code `98def5358983072216a28754e87b1cd5f884d258`, đọc tại checkout `03dbd098e36245f51a4b8e875e89c1c0bb21acc6`; chênh lệch hai commit chỉ là AUDIT-PLAN. Báo cáo không thay đổi kiến trúc hoặc source.

[F] Authority: `ARCHITECTURE-SPINE.md:28` ghi các quyết định đã được tiếp nhận cho planning; các nhãn PROPOSED còn giữ lại không mở lại D-01–D-10. Review Vue/Laravel thay thế giả định Node/server/shared TypeScript của review cũ (`reviews/review-vue-laravel-resolution.md:3`). Không dùng review cũ để yêu cầu sửa stack hiện hành.

| Boundary / quyết định | Đối chiếu [F] | Nhận định [I] |
|---|---|---|
| Vue → JSON controller → Application → Domain | `backend/app/Modules/README.md:3`; `ChallengeController.php:24`; `ChallengeJournalController.php:22`; commands và use cases trong Modules/Challenges/Application | Controller HTTP nằm trong app/Http là bố cục đã duyệt (`ARCHITECTURE-SPINE.md:209`), không phải business module đặt sai chỗ. |
| Validation và transaction | `ChallengeController.php:55` xác thực request rồi tạo command; `CreateChallengeUseCase.php:40`, `UpdateChallengeMetadataUseCase.php:35`, `SaveJournalUseCase.php:26` sở hữu transaction | Controller xử lý shape/HTTP và domain/use case bảo vệ invariant. Một số kiểm tra tên có hai lớp là defense hiện có, không tự coi là lỗi. |
| Domain thuần PHP / clock | `Identity/Domain/AccountTimeContext.php:9`; `Identity/Contracts/Clock.php:7`; `Identity/Application/AccountTimeContextFactory.php:14`; `Identity/Infrastructure/SystemClock.php:11` | Domain không import Illuminate/DB/HTTP; một Clock cung cấp instant cho ngày/tuần canonical. Các `now()` trong write use case ghi audit timestamp, không dùng làm ngày account. |
| AD-5 owner/API/no-store | `backend/routes/api.php:18`; `backend/bootstrap/app.php:16`; `EnsureOwner.php:14`; `PrivateNoStore.php:14` | Boundary server được thể hiện bằng middleware; WS-C có toàn bộ trace query/owner. Không tìm thấy module khác bypass owning use case để ghi product trong phạm vi đã triển khai. |
| AD-6 account lock / ledger / epoch / version | `CreateChallengeUseCase.php:41`; `UpdateChallengeMetadataUseCase.php:36`; `SaveJournalUseCase.php:27`; migrations composite FK/unique được WS-C đối chiếu | Dữ liệu server có transaction/lock và replay protection. Client chọn nhầm resource là E-04, server owner/version hợp lệ không phát hiện intent A/B sai. |
| AD-8 non-overlapping polling / convergence | `ARCHITECTURE-SPINE.md:99`; `frontend/src/stores/sync.ts:242` so với `:268` | E-03 là vi phạm đã xác minh: timer và foreground có thể cùng reconcile. Giữ một finding E-03 để tránh đếm đôi. |
| AD-14 private lifecycle | `ARCHITECTURE-SPINE.md:136`; `frontend/src/stores/auth.ts:34`; `AppShell.vue:188` | E-05 mô tả phần private UI chưa bị ẩn khi session hết hạn; quy tắc này đã được duyệt, không phải yêu cầu mới. |
| AD-15 contract | `ARCHITECTURE-SPINE.md:147`; `contracts/openapi.yaml`; `frontend/src/api/schema.generated.ts` | WS-D đối chiếu 11 operations và 46 operation/status pairs. D-01/D-02/D-03/D-05/D-06 là các điểm yếu guard/schema, không tuyên bố response hiện tại đều sai. |
| Persistence adapter / module coupling | `ARCHITECTURE-SPINE.md:32`; Application use cases import DB facade (`CreateChallengeUseCase.php:12`, `GetChallengeListQuery.php:6`) | Persistence ports của Challenges chưa được tách riêng như mô hình đích. Chưa có bằng chứng tác vụ hiện hành hỏng vì điều này; ghi nợ kiến trúc, không nâng thành finding MEDIUM/HIGH hoặc yêu cầu refactor trước 2.2. |
| Phạm vi chức năng tương lai | `ARCHITECTURE-SPINE.md:67` module ownership; `docs/product/epics.md:345` dependency 2.3→2.1 | Notes/Calendar/Search/Backup và completion 2.2 chưa là tính năng đã hoàn thành. Sự vắng mặt của chúng không tự là lỗi của các Story done. |

[F] Commands đọc: `rg --files backend/app/Modules backend/app/Http/Controllers docs/architecture/architecture-noteflow-2026-09-12`; `rg -n 'Illuminate|DB::|now\(|Carbon' backend/app/Modules`; đọc controllers/use cases/clock/spine/proposal và các review resolution/seams. Không chạy PHP integration vì B9 exit 255 trước khi Pest được khởi động (vendor/autoload thiếu).

## Domain exception → HTTP

| Exception | HTTP hiện hành [F] |
|---|---|
| WriteFenceActiveException | 423 problem+json, `backend/app/Http/Controllers/ChallengeController.php:88`, `backend/app/Http/Controllers/ChallengeJournalController.php:86` |
| StaleDataEpochException / IdempotencyKeyReusedException | 409 problem+json, hai controllers cùng cách map |
| VersionConflictException | 409 gồm resource_id/current_version/current_snapshot, `backend/app/Http/Controllers/ChallengeController.php:210`, `backend/app/Http/Controllers/ChallengeJournalController.php:92` |
| InvalidChallengeName / InvalidTargetDays / InvalidJournalDay / InvalidJournalText | 422 validation errors, controller mapping theo field |
| Owner/resource lookup không có dữ liệu hoặc ID sai | 404, `ChallengeController.php:126`, `ChallengeJournalController.php:25` |

[I] Mapping nhất quán giữa challenge metadata và journal; contract cần làm chặt các subtype theo WS-D. Không thêm 428 chỉ vì bảng plan nêu ví dụ: code và spec hiện hành dùng 409/423 cho epoch/fence.

[I] Sức khoẻ WS-B: 🟡. Layering nền tảng và server invariants có cấu trúc rõ, nhưng AD-8/AD-14 còn finding nghiêm trọng ở frontend. Không tạo ID trùng E/D/C; danh sách finding mới riêng WS-B là rỗng.

```json
[]
```
