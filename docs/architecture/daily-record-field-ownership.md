# `challenge_daily_records` field ownership

Ngày ban hành: 2026-10-07  
Finding: A-03  
Quyết định áp dụng: một record chung; Story 2.2 và Story 2.3 sở hữu các nhóm
field khác nhau.

Ma trận này đối chiếu migration
[`2026_09_24_010000_create_challenge_daily_records_table.php`](../../backend/database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php)
với code writer hiện có. `challenge_id` và `local_date` tạo primary key; cặp
`owner_id`/`challenge_id` được ràng buộc tới challenge của cùng owner.

## Ma trận field

| Field | Owner | Writer được phép ghi | Invariant cần giữ |
|---|---|---|---|
| `owner_id` | Invariant chung | Chỉ lúc tạo record bởi writer của resource đã xác thực owner; không được đổi trong update | Phải khớp owner của challenge; không được chuyển record giữa owner |
| `challenge_id` | Invariant chung | Chỉ lúc tạo record trong resource challenge đã xác thực; không được đổi trong update | Là một phần của khóa và phải tồn tại trong `challenges` |
| `local_date` | Invariant chung | Chỉ lúc tạo record sau khi kiểm tra ngày hợp lệ; không được đổi trong update | Là một phần của khóa; phải nằm trong khoảng ngày hợp lệ của challenge và account |
| `is_done` | Story 2.2 | Completion writer của Story 2.2; writer journal không được ghi | Chỉ thay đổi theo completion command và phải được giữ nguyên khi journal thay đổi |
| `completion_version` | Story 2.2 | Completion writer của Story 2.2; writer journal không được ghi | Tăng theo thay đổi completion; không dùng làm base version của journal |
| `journal` | Story 2.3 | `SaveJournalUseCase` qua route `PUT /api/v1/challenges/{id}/journals/{date}` | Giữ nội dung hợp lệ của journal; không được thay `is_done` hoặc `completion_version` |
| `journal_version` | Story 2.3 | `SaveJournalUseCase`; đọc bởi `GetJournalQuery` | So khớp với `base_version`; tăng đúng một lần khi journal đổi, không tăng khi replay/no-op |
| `row_version` | Invariant chung | Mỗi writer làm thay đổi record phải tăng đúng một lần; `SaveJournalUseCase` tăng khi journal đổi | Monotonic trên toàn record; không tăng với no-op, replay hoặc rejected conflict |
| `created_at` | Invariant chung | Writer tạo record ghi một lần | Không đổi sau khi record đã tồn tại |
| `updated_at` | Invariant chung | Writer thay đổi record cập nhật cùng transaction | Phản ánh lần thay đổi thành công; không cập nhật bởi read/no-op/conflict |

## Writer hiện có và ranh giới transaction

Writer production duy nhất tìm thấy cho record này là
[`SaveJournalUseCase.php`](../../backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php).
Nó khóa `account_states` của owner, kiểm tra `write_state` và `data_epoch`,
kiểm tra `journal_version` bằng `base_version`, sau đó chỉ ghi `journal`,
`journal_version`, `row_version` và `updated_at` khi nội dung thực sự đổi.
Khi tạo record, các default của migration giữ `is_done = false`,
`completion_version = 0`, và `row_version = 1`; khi cập nhật, writer không đưa
hai field completion vào payload update. `account_revision` và ledger
`mutation_commands` được cập nhật trong cùng transaction để replay không tạo
revision thứ hai.

[`GetJournalQuery.php`](../../backend/app/Modules/Challenges/Application/UseCases/GetJournalQuery.php)
chỉ đọc `journal` và `journal_version`; nó không phải writer.

Các test hiện có kiểm tra ranh giới này trong
[`ChallengeJournalTest.php`](../../backend/tests/Feature/ChallengeJournalTest.php)
và
[`ChallengeJournalApiTest.php`](../../backend/tests/Feature/ChallengeJournalApiTest.php):
journal edit giữ `is_done`/`completion_version`, tăng `row_version`, và
completion-only change không tạo journal conflict.

## Story 2.2 và các finding còn mở

Không tìm thấy artifact implementation của Story 2.2 hoặc completion writer
trong checkout này. Vì vậy tài liệu này đặt ownership/invariant cho writer
tương lai nhưng không tuyên bố completion đã được triển khai hay nghiệm thu,
không tạo Story 2.2 mới, và không sửa schema.

Đối chiếu writer hiện tại không cho thấy vi phạm ma trận: `SaveJournalUseCase`
không ghi `is_done` hoặc `completion_version`, và các test trên chứng minh hai
field đó được giữ nguyên qua journal write. Khi Story 2.2 có writer thật, writer
đó phải được kiểm tra lại cùng invariant `row_version`, khóa, timestamps,
`account_revision`, `data_epoch` và owner scope trước khi tích hợp.
