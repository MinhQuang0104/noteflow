---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/product/project-brief.md
  - docs/product/prd.md
  - docs/ux/ux-spec.md
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-PROPOSAL.md
  - docs/architecture/architecture-noteflow-2026-09-12/reviews/review-resolution.md
  - docs/architecture/architecture-noteflow-2026-09-12/reviews/review-vue-laravel-resolution.md
architectureRecommendationsAdopted: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10]
---

# NoteFlow — Phân rã Epic và Story

## Mục đích

Tài liệu tập hợp requirements MVP đã duyệt làm đầu vào phân rã Epic và Story. Product Owner đã chấp nhận các khuyến nghị Architecture D-01…D-10 làm baseline planning; tài liệu này không thay đổi PRD hay Architecture.

## Danh mục requirements

### Functional Requirements

#### Truy cập, đồng bộ và dữ liệu

- **FR-001:** Xác thực owner được cấp sẵn; không có đăng ký công khai.
- **FR-002:** Đồng bộ dữ liệu đã lưu, thay đổi và xóa giữa laptop/điện thoại trực tuyến.
- **FR-003:** Hiển thị trạng thái lưu, lỗi và đồng bộ một cách trung thực.
- **FR-004:** Hiển thị xung đột nội dung để owner chọn; không ghi đè âm thầm.
- **FR-005:** Giữ nội dung chưa lưu trong phiên khi mất mạng để thử lại, không coi là đã lưu.
- **FR-006:** Dùng múi giờ tài khoản cố định cho hôm nay, lịch sử và tuần Thứ Hai–Chủ Nhật.

#### Challenge, ghi nhận và lịch sử

- **FR-007:** Tạo challenge có tên, mô tả tùy chọn, start date hôm nay và target nguyên 1–7 ngày/tuần.
- **FR-008:** Xem danh sách/chi tiết và sửa tên, mô tả challenge.
- **FR-009:** Done tối đa một lần/challenge/ngày, không bắt buộc journal và không đếm trùng.
- **FR-010:** Tạo/sửa journal tùy chọn cho ngày challenge mà không tự Done.
- **FR-011:** Backfill từ start date đến hôm nay; challenge đã archive chỉ đến archive date.
- **FR-012:** Undo Done, giữ journal và tính lại kết quả.
- **FR-013:** Archive ngay, giữ history/record, hủy target chờ, cho sửa lịch sử hợp lệ, không reopen.

#### Tiến độ, streak và mục tiêu

- **FR-014:** Hiển thị số Done/target của tuần, vẫn ghi nhận đến tối đa bảy ngày.
- **FR-015:** Hiển thị history ngày/kết quả tuần theo target có hiệu lực vào thời điểm đó.
- **FR-016:** Áp dụng quy tắc warm-up week và mốc streak từ Thứ Hai cho mọi nhóm target.
- **FR-017:** Tính streak 1–6/7 theo các tuần liên tiếp đạt target.
- **FR-018:** Tính streak 7/7 theo các ngày Done liên tiếp, vẫn hiển thị tiến độ tuần.
- **FR-019:** Hiển thị streak hiện tại/dài nhất với đơn vị rõ ràng và streak khi archive.
- **FR-020:** Một target chờ cho Thứ Hai kế tiếp; cho sửa/hủy và hiển thị target hiện tại/chờ/ngày hiệu lực.
- **FR-021:** Đổi target trong 1–6/7 không tự reset/khôi phục streak.
- **FR-022:** Đổi giữa 1–6/7 và 7/7 bắt đầu streak hiện tại từ 0, không nối đơn vị.
- **FR-023:** Tính lại tiến độ, history, streak, record và calendar Done sau khi facts thay đổi.

#### Vở và ghi chú

- **FR-024:** Tạo/xem/đổi tên vở một cấp; mỗi note thuộc đúng một vở.
- **FR-025:** Có vở mặc định được bảo vệ cho ghi nhanh.
- **FR-026:** Chỉ xóa vở không mặc định khi rỗng.
- **FR-027:** CRUD note văn bản thuần; xóa cần xác nhận, không có thùng rác.
- **FR-028:** Chuyển note giữa vở, giữ nội dung và quan hệ thuộc một vở.
- **FR-029:** Tự lưu note và áp dụng trạng thái lưu/xung đột/gián đoạn.
- **FR-030:** Tìm title/body note đã lưu không phân biệt hoa thường/dấu, không gồm journal, và mở kết quả.

#### Lịch, Hôm nay và backup

- **FR-031:** CRUD sự kiện đơn lẻ có tên, thời điểm bắt đầu/kết thúc, mô tả tùy chọn; xóa cần xác nhận.
- **FR-032:** Sự kiện có giờ được kéo dài qua ngày, end sau start; không có all-day.
- **FR-033:** Lịch tháng và danh sách sự kiện của ngày chọn, gồm sự kiện xuyên ngày.
- **FR-034:** Icon challenge Done đúng ngày, gồm backfill, có tên qua hover/chạm.
- **FR-035:** Giới hạn icon Done; dùng +N mở phần còn lại.
- **FR-036:** Event và Done độc lập; event không tự Done challenge.
- **FR-037:** Today hiển thị challenge active, tiến độ tuần và Done một thao tác.
- **FR-038:** Today hiển thị event trong ngày theo timezone tài khoản.
- **FR-039:** Today có lối vào quick note với vở mặc định.
- **FR-040:** Export toàn bộ product facts cần phục hồi vở, note, challenge, journal, target history, event, timezone và history/record inputs.
- **FR-041:** Import backup đã kiểm tra để thay thế toàn bộ dataset sau xác nhận, không merge.
- **FR-042:** Áp dụng quy tắc chốt streak tại archive date và recalculation sau sửa lịch sử hợp lệ.
- **FR-043:** Done/undo đồng thời cùng kết quả hội tụ; stale opposite conflict giải quyết tường minh, undo giữ journal.
- **FR-044:** Validate backup trước xác nhận; reject invalid/cancelled import không đổi dữ liệu.
- **FR-045:** Restore toàn bộ hoặc giữ dataset trước đó; không suy kết thất bại chỉ vì mất mạng.
- **FR-046:** Khóa write hai thiết bị trong import, reconcile kết quả chưa rõ và refresh trước write tiếp.

### Non-Functional Requirements

- **NFR-001:** Journey chính dễ dùng trên hai thiết bị; Done từ Today là một thao tác.
- **NFR-002:** UI responsive laptop/điện thoại, hỗ trợ touch và không hover-only.
- **NFR-003:** Tính toán ngày/tuần/tiến độ/streak đúng ở các ca biên và hai thiết bị.
- **NFR-004:** Dữ liệu đã xác nhận lưu còn đúng sau reload và cross-device.
- **NFR-005:** Không hiển thị “đã lưu” khi lưu lỗi; retry trong phiên rõ ràng.
- **NFR-006:** Thiết bị hội tụ hoặc resolve conflict rõ; restore refresh trước write.
- **NFR-007:** Không ai chưa xác thực/không có quyền đọc hoặc sửa dữ liệu cá nhân.
- **NFR-008:** Export/import phục hồi nguyên tử, xử lý đúng invalid/cancel/fail/unknown outcome.
- **NFR-009:** Tìm gần một giây với khoảng 1.000 note ngắn theo điều kiện đo đã chấp nhận.
- **NFR-010:** Người dùng hiểu tiến độ, đơn vị streak, warm-up week và target chờ.

### Additional Requirements từ Architecture

- Một modular monolith Vue 3 SPA + Laravel REST JSON, cùng HTTPS origin/PostgreSQL; không microservice, SSR, Inertia, WebSocket, queue, external search hoặc offline baseline.
- Sanctum session + CSRF; chỉ owner provisioned; private response `no-store`, render text an toàn, logout dọn cache/draft.
- Baseline timezone `Asia/Ho_Chi_Minh`; server-authoritative AccountTimeContext cho mỗi use case.
- Challenge start date hôm nay, bất biến; target 1–7 và chỉ một pending target cho Thứ Hai kế tiếp.
- Persist facts; derive progress/streak/record/calendar Done từ một domain engine; PostgreSQL thực thi ownership và data invariants.
- Mutation dùng UUID idempotency, base version, data epoch, command ledger, typed conflicts; completion/journal version riêng.
- Conflict matrix đã duyệt: whole-note title/body conflict; membership/journal theo component; delete version-check.
- In-memory draft: debounce 800 ms, async navigation flush, một save in-flight/note, retry identical uncertain command, không offline queue qua reload.
- Poll revision/epoch/write state mỗi 5 giây khi visible/online; reconcile login/focus/reconnect; restore fence pause writes/drafts.
- PostgreSQL GIN search saved title/body với NFC/lowercase/unaccent; AND whole-token, không phrase/prefix/substring.
- Backup chỉ `schemaVersion: 1`; validate trước confirm, restore một transaction có fence, success tăng epoch; không backup credentials/session/draft/lock/ledger.
- OpenAPI versioned + generated frontend types + CI contract tests; production chọn provider/budget/limits và đo device/browser, search/sync acceptance.

### UX Design Requirements

- **UX-DR1:** Deep link sau auth; chỉ restore navigation/sidebar preference hợp lệ và ưu tiên direct link.
- **UX-DR2:** Navigation Today → Challenge → Notes → Calendar, account/settings ở cuối, mobile có entry rõ.
- **UX-DR3:** Notes workspace desktop bốn vùng và mobile drill-down, không mất selection/scroll/draft.
- **UX-DR4:** Quick note focus body, title trống, derived label không ghi ngược, bỏ editor mới chưa nhập.
- **UX-DR5:** Autosave/flush không chặn switching; trạng thái saved/error/conflict theo từng note.
- **UX-DR6:** Search overlay có focus, current-results-only, keyboard navigation và empty state.
- **UX-DR7:** Notebook CRUD UI đúng ràng buộc; note move/delete có confirm và cảnh báo draft.
- **UX-DR8:** Today scan-friendly với challenge, progress, Done, journal tùy chọn, event và quick note.
- **UX-DR9:** Challenge detail/history cho backfill, undo, journal, archive, warm-up, pending target và streak/record rõ đơn vị.
- **UX-DR10:** Today/challenge/calendar cập nhật nhất quán sau mutations.
- **UX-DR11:** Calendar month/day, event span, hover/focus/touch Done names và +N accessible.
- **UX-DR12:** Event form có label/validation; event không suy ra Done.
- **UX-DR13:** Settings export/import riêng; inspect, warning replace, confirm, write lock và reconcile.
- **UX-DR14:** Empty/loading/error state rõ, actionable và không lẫn với auth/sync.
- **UX-DR15:** Reflow, touch, focus, accessible labels, contrast, reduced motion, announcements; không color-only.
- **UX-DR16:** Keyboard, skip link, dialog focus/trap, focus after delete và không cản IME/editor.
- **UX-DR17:** Shortcut theo browser thực tế; ghi nhận tested alternative nếu bị chặn.
- **UX-DR18:** Không persist private draft/query content; logout clear và restore quarantine draft cũ.

### FR Coverage Map

- **EPIC-001 — Truy cập riêng tư và tiếp nối giữa các thiết bị:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006.
- **EPIC-002 — Duy trì challenge hằng ngày linh hoạt:** FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-037, FR-043.
- **EPIC-003 — Hiểu tiến độ và duy trì streak:** FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, FR-042.
- **EPIC-004 — Ghi nhanh, tổ chức và tìm lại kiến thức:** FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-039.
- **EPIC-005 — Quản lý lịch cá nhân trong bối cảnh challenge:** FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-038.
- **EPIC-006 — Tự chủ sao lưu và khôi phục dữ liệu:** FR-040, FR-041, FR-044, FR-045, FR-046.

## Epic List

### EPIC-001: Truy cập riêng tư và tiếp nối giữa các thiết bị

Người dùng đăng nhập an toàn, sử dụng cùng dữ liệu cá nhân trên laptop và điện thoại, biết chính xác dữ liệu đã lưu/chưa lưu, và chủ động xử lý xung đột mà không mất dữ liệu.

**FRs covered:** FR-001–006.

**Phụ thuộc và điều kiện hoàn tất:** Story 1.1–1.3 là prerequisite trước các domain stories. Story 1.4–1.6 là các capability xuyên suốt, được hoàn tất và nghiệm thu khi resource nghiệp vụ đầu tiên cần capability tương ứng đã tồn tại; không gắn cứng các Story này vào một domain cụ thể nếu capability có thể được chứng minh qua nhiều domain. EPIC-001 chỉ được coi là hoàn tất khi có bằng chứng tích hợp trên resource nghiệp vụ thật.

### EPIC-002: Duy trì challenge hằng ngày linh hoạt

Người dùng tạo và quản lý challenge N/7, ghi Done hoặc nhật ký trong ngày, ghi bù/sửa sai hợp lệ, lưu trữ challenge khi dừng theo dõi, và thao tác Done nhanh từ Hôm nay.

**FRs covered:** FR-007–013, FR-037, FR-043.

**Ghi chú mapping:** PRD ghi EPIC-001 là Epic chính của FR-043. Delivery coverage được đặt tại EPIC-002 vì hành vi xung đột Done/bỏ Done chỉ có thể triển khai và kiểm thử độc lập cùng capability Challenge. PRD không bị thay đổi.

**Phụ thuộc:** Story 1.1–1.3. Các capability xuyên suốt của Story 1.4–1.6 được tích hợp và nghiệm thu cùng resource nghiệp vụ đầu tiên cần chúng; không yêu cầu EPIC-001 hoàn tất toàn bộ trước khi bắt đầu Epic này.

### EPIC-003: Hiểu tiến độ và duy trì streak

Người dùng nhìn đúng tiến độ tuần, lịch sử, streak và kỷ lục theo quy tắc N/7; thay đổi mục tiêu có lịch sử và việc sửa/archiving luôn tính lại kết quả nhất quán.

**FRs covered:** FR-014–023, FR-042.

**Phụ thuộc:** Story 1.1–1.3 và EPIC-002. Các capability xuyên suốt của Story 1.4–1.6 được tích hợp và nghiệm thu khi được các resource liên quan sử dụng.

### EPIC-004: Ghi nhanh, tổ chức và tìm lại kiến thức

Người dùng ghi nhanh vào vở mặc định, tự lưu note văn bản thuần, tổ chức bằng vở, chuyển/xóa an toàn và tìm lại knowledge đã lưu.

**FRs covered:** FR-024–030, FR-039.

**Phụ thuộc:** Story 1.1–1.3. Các capability xuyên suốt của Story 1.4–1.6 được tích hợp và nghiệm thu cùng resource nghiệp vụ đầu tiên cần chúng; không gắn các capability này riêng vào Epic Ghi chú.

### EPIC-005: Quản lý lịch cá nhân trong bối cảnh challenge

Người dùng quản lý sự kiện theo thời gian, xem lịch tháng/ngày và biết challenge nào đã Done trong từng ngày mà không trộn lẫn hai loại hoạt động.

**FRs covered:** FR-031–036, FR-038.

**Phụ thuộc:** Story 1.1–1.3; tận dụng projections từ EPIC-002 và EPIC-003. Các capability xuyên suốt của Story 1.4–1.6 được tích hợp và nghiệm thu khi các resource liên quan sử dụng chúng.

### EPIC-006: Tự chủ sao lưu và khôi phục dữ liệu

Người dùng xuất dữ liệu cá nhân và khôi phục toàn bộ dataset một cách có kiểm soát, nguyên tử và an toàn giữa các thiết bị.

**FRs covered:** FR-040–041, FR-044–046.

**Phụ thuộc:** EPIC-001–005 vì backup bao phủ toàn bộ facts sản phẩm.

## Epic 1: Truy cập riêng tư và tiếp nối giữa các thiết bị

Người dùng đăng nhập an toàn, dùng cùng dữ liệu trên laptop/điện thoại, biết dữ liệu đã lưu và chủ động xử lý xung đột.

### Story 1.1: Khởi tạo nền tảng NoteFlow từ starter được duyệt

As a chủ tài khoản, I want NoteFlow có nền tảng web nhất quán trên laptop và điện thoại, So that các capability MVP có thể được cung cấp an toàn trong cùng một ứng dụng.

**Maps to PRD:** FR-001; NFR-002, NFR-004, NFR-007. **Architecture:** AD-1, AD-5, AD-12, AD-15.

**Contract pipeline requirement:** Foundation JSON health/smoke surface phải nằm trong OpenAPI canonical contract. CI phải giữ OpenAPI validation, generated-types drift check và backend smoke tests, đồng thời chạy automated test đối chiếu Laravel runtime response với schema; Story này không tạo product endpoint.

**Acceptance Criteria:**

**Given** workspace chưa có application scaffold **When** khởi tạo nền tảng **Then** frontend dùng official create-vue Vite/TypeScript SPA và backend dùng Laravel API project trong cùng repository **And** không dùng Inertia, SSR hoặc generated public-registration flow.

**Given** scaffold đã khởi tạo **When** chạy build và smoke check **Then** Vue SPA và Laravel API khởi động được theo cấu trúc cùng origin **And** route API/Sanctum đi tới Laravel còn UI route dùng SPA history fallback.

**Given** dependency baseline được resolve **When** kiểm tra lockfiles **Then** các release line phù hợp Architecture được pin bằng lockfile **And** OpenAPI có vị trí ownership rõ cho wire contracts.

**Given** foundation JSON health/smoke response được cung cấp **When** chạy automated contract test **Then** response đó được khai báo trong OpenAPI và Laravel runtime response được kiểm tra theo schema tương ứng **And** response sai schema làm test và CI thất bại.

**Given** contract pipeline chạy trong CI **When** kiểm tra foundation **Then** OpenAPI validation, generated-types drift check và backend smoke tests vẫn chạy cùng runtime response contract test **And** Story này không tạo product endpoint.

**Given** Story 1.1 hoàn tất **When** kiểm tra persistence/domain **Then** chỉ có setup cần cho foundation **And** chưa tạo trước entity của Challenge, Notes, Calendar hoặc Backup.

### Story 1.2: Đăng nhập và bảo vệ dữ liệu owner

As a chủ tài khoản, I want đăng nhập bằng email và mật khẩu được cấp sẵn, So that chỉ tôi truy cập được dữ liệu cá nhân.

**Maps to PRD:** FR-001; NFR-007. **Covers UX:** UX-DR1, UX-DR2, UX-DR18.

**Acceptance Criteria:**

**Given** credentials hợp lệ **When** owner đăng nhập **Then** session được tạo và điều hướng tới private route hợp lệ hoặc Hôm nay **And** không có đăng ký công khai.

**Given** chưa xác thực hoặc session hết hạn **When** truy cập private page/API **Then** không trả dữ liệu cá nhân **And** yêu cầu đăng nhập.

**Given** owner logout **When** logout hoàn tất **Then** session bị vô hiệu, private cache/draft bị xóa **And** Back không làm lộ dữ liệu.

**Given** owner đã xác thực **When** dùng app shell **Then** navigation có thứ tự Hôm nay → Challenge → Ghi chú → Lịch, account/settings ở cuối **And** mobile có nút mở navigation rõ ràng.

### Story 1.3: Dùng một ngày và tuần thống nhất trên mọi thiết bị

As a chủ tài khoản, I want ứng dụng dùng timezone cố định của tài khoản, So that mọi thiết bị hiểu cùng hôm nay và tuần.

**Maps to PRD:** FR-006; NFR-003, NFR-010.

**Acceptance Criteria:**

**Given** timezone là `Asia/Ho_Chi_Minh` **When** hai thiết bị có timezone khác nhau truy cập gần ranh giới ngày/tuần **Then** chúng hiển thị cùng account date và tuần Thứ Hai–Chủ Nhật.

**Given** một request cần nhiều phép tính thời gian **When** xử lý **Then** toàn bộ dùng cùng instant và AccountTimeContext.

**Given** owner xem settings **When** timezone hiển thị **Then** giá trị là chỉ đọc.

### Story 1.4: Nhận dữ liệu mới giữa hai thiết bị

As a chủ tài khoản, I want thiết bị trực tuyến nhận biết dữ liệu đã lưu thay đổi, So that tôi tiếp tục với trạng thái mới nhất.

**Maps to PRD:** FR-002, FR-003; NFR-004, NFR-006. **Covers UX:** UX-DR14, UX-DR18.

**Dependency note:** Cần ít nhất một persisted mutation và read model để hoàn tất bằng bằng chứng tích hợp; capability polling/revision không bị gắn cứng vào một domain cụ thể.

**Acceptance Criteria:**

**Given** hai thiết bị online **When** A lưu mutation **Then** account revision tăng một lần **And** B phát hiện, refetch và hội tụ.

**Given** tab hidden/offline/session-expired **When** polling đến kỳ **Then** polling pause/stop phù hợp và không báo sync giả.

**Given** focus/reconnect **When** app resume **Then** reconcile revision/epoch trước khi cho ghi stale.

**Given** polling/refetch lỗi **When** lỗi xảy ra **Then** hiển thị sync error actionable và không thay dữ liệu bằng empty state.

### Story 1.5: Giữ bản đang nhập và thử lưu lại sau gián đoạn

As a chủ tài khoản, I want biết nội dung chưa lưu và retry trong phiên, So that mất mạng không làm tôi hiểu nhầm hoặc mất ngay phần đang nhập.

**Maps to PRD:** FR-003, FR-005; NFR-004, NFR-005. **Covers UX:** UX-DR5, UX-DR14, UX-DR18.

**Dependency note:** Cần ít nhất một editable persisted resource có draft/save lifecycle để hoàn tất bằng bằng chứng tích hợp; capability giữ draft và retry không bị gắn cứng vào một domain cụ thể.

**Acceptance Criteria:**

**Given** nội dung đang sửa **When** save chạy/thành công/lỗi **Then** UI hiển thị đúng Đang lưu/Đã lưu/Chưa lưu-Lỗi.

**Given** mất mạng lúc nhập **When** save lỗi **Then** draft còn trong memory để sửa/retry **And** không được gọi là đã lưu.

**Given** response cũ về sau client revision mới **When** xử lý ACK **Then** response cũ không đánh dấu revision mới là đã lưu.

**Given** còn draft chưa lưu **When** reload/close/logout **Then** cảnh báo mất draft khi môi trường hỗ trợ.

### Story 1.6: Giải quyết xung đột nội dung giữa hai thiết bị

As a chủ tài khoản, I want xem và chọn nội dung khi hai thiết bị sửa cùng resource, So that thay đổi không bị ghi đè âm thầm.

**Maps to PRD:** FR-004; NFR-006. **Covers UX:** UX-DR15, UX-DR16.

**Dependency note:** Cần ít nhất một resource có versioned mutation và conflict behavior để hoàn tất bằng bằng chứng tích hợp; capability conflict không bị gắn cứng vào một domain cụ thể.

**Acceptance Criteria:**

**Given** mutation dùng version cũ **When** server có thay đổi xung đột **Then** không mutate **And** trả typed conflict với identity/version/snapshot.

**Given** conflict UI **When** owner mở xử lý **Then** cả draft và saved version đọc được **And** có lựa chọn rõ.

**Given** owner chọn kết quả **When** gửi với version/epoch hiện hành **Then** chỉ kết quả chọn được lưu và thiết bị hội tụ.

**Given** conflict dialog **When** dùng keyboard/touch/screen reader **Then** focus trap, labels, scrolling và focus return hoạt động.

## Epic 2: Duy trì challenge hằng ngày linh hoạt

Người dùng tạo và quản lý challenge N/7, Done nhanh, thêm journal tùy chọn, sửa lịch sử hợp lệ và kết thúc theo dõi mà không mất dữ liệu.

### Story 2.1: Tạo và quản lý thông tin challenge

As a chủ tài khoản, I want tạo và chỉnh sửa challenge N/7, So that tôi bắt đầu theo dõi mục tiêu linh hoạt.

**Maps to PRD:** FR-007, FR-008. **Covers UX:** UX-DR8, UX-DR9. **Depends on:** Story 1.1, 1.2, 1.3.

**Acceptance Criteria:**

**Given** form hợp lệ **When** tạo với tên, mô tả tùy chọn và target nguyên 1–7 **Then** challenge có start date là account-today **And** không yêu cầu ngày cố định trong tuần.

**Given** target ngoài 1–7 hoặc không nguyên **When** submit **Then** không tạo và lỗi gắn đúng field.

**Given** challenge tồn tại **When** sửa tên/mô tả **Then** lưu giá trị mới mà không đổi start date, target hoặc history.

### Story 2.2: Xem challenge và Done nhanh từ Hôm nay

As a chủ tài khoản, I want xem tiến độ và Done tại Hôm nay, So that tôi ghi nhận hằng ngày bằng một thao tác.

**Maps to PRD:** FR-009, FR-037; NFR-001, NFR-003. **Covers UX:** UX-DR8, UX-DR10. **Depends on:** Story 2.1.

**Projection ownership:** Story này sở hữu minimum current-week progress projection cần cho Hôm nay, gồm số ngày Done và target hiện hành. Projection phải được cung cấp qua shared domain/query boundary để các màn hình tái sử dụng; UI không tự tính lại tiến độ.

**Acceptance Criteria:**

**Given** challenge active **When** mở Hôm nay **Then** shared current-week projection trả số ngày Done và target hiện hành **And** UI hiển thị tên, Done/target tuần và trạng thái hôm nay mà không tự tính lại tiến độ.

**Given** hôm nay chưa Done **When** bấm Done **Then** ghi đúng ngày, không yêu cầu journal và hiển thị trạng thái save chính xác.

**Given** ngày đã Done **When** gửi Done lặp **Then** chỉ có một completion và tiến độ không tăng thêm.

**Given** request lỗi **When** server chưa xác nhận **Then** UI không báo Done đã lưu và cho retry.

### Story 2.3: Ghi và sửa journal tùy chọn

As a chủ tài khoản, I want ghi journal cho một ngày challenge, So that tôi lưu bối cảnh khi cần.

**Maps to PRD:** FR-010. **Covers UX:** UX-DR8, UX-DR9. **Depends on:** Story 2.1.

**Acceptance Criteria:**

**Given** ngày hợp lệ **When** lưu/sửa journal **Then** journal gắn đúng challenge/ngày.

**Given** ngày chưa Done **When** chỉ lưu journal **Then** trạng thái và tiến độ không đổi.

**Given** completion và journal đổi độc lập **When** lưu một component **Then** component còn lại không bị sửa hoặc conflict giả.

### Story 2.4: Ghi bù và sửa lần Done sai

As a chủ tài khoản, I want backfill hoặc undo một ngày hợp lệ, So that history phản ánh đúng thực tế.

**Maps to PRD:** FR-011, FR-012, FR-023. **Covers UX:** UX-DR9, UX-DR10. **Depends on:** Story 2.2, 2.3.

**Acceptance Criteria:**

**Given** challenge active **When** Done ngày từ start date đến account-today **Then** lưu đúng ngày và cập nhật các read view.

**Given** ngày trước start date hoặc tương lai **When** Done **Then** từ chối không đổi history.

**Given** ngày Done có journal **When** xác nhận undo **Then** chuyển chưa Done và giữ journal.

### Story 2.5: Lưu trữ challenge

As a chủ tài khoản, I want archive challenge, So that danh sách active gọn mà history được giữ.

**Maps to PRD:** FR-013. **Covers UX:** UX-DR9, UX-DR10. **Depends on:** Story 2.4.

**Acceptance Criteria:**

**Given** challenge active **When** xác nhận archive **Then** archive date là account-today và challenge rời active list ngay.

**Given** challenge archived **When** xem/sửa ngày hợp lệ **Then** giữ history/journal/target/record và cho sửa trong start–archive range.

**Given** ngày sau archive **When** ghi completion **Then** từ chối **And** không có Reopen trong MVP.

### Story 2.6: Hội tụ và giải quyết xung đột Done

As a chủ tài khoản, I want Done/undo đồng thời được xử lý an toàn, So that hai thiết bị không tạo kết quả sai.

**Maps to PRD:** FR-043, FR-023; NFR-003, NFR-006. **Covers UX:** UX-DR9, UX-DR10, UX-DR16. **Depends on:** Story 2.4. **Mapping note:** Delivery tại EPIC-002; PRD giữ EPIC-001 là Epic chính.

**Acceptance Criteria:**

**Given** hai request cùng desired Done hoặc cùng undo **When** xử lý đồng thời **Then** hội tụ cùng kết quả, không đếm trùng/không conflict và undo giữ journal.

**Given** request Done và undo đối nghịch từ stale state **When** request sau tới **Then** không mutate và yêu cầu chọn trạng thái cuối.

**Given** chưa resolve **When** render views **Then** giữ trạng thái saved gần nhất và báo conflict chưa áp dụng.

**Given** owner resolve với current version/epoch **When** lưu **Then** thiết bị hội tụ và các projection được tính lại.

## Epic 3: Hiểu tiến độ và duy trì streak

Người dùng hiểu đúng tiến độ, history, streak và record theo từng giai đoạn target.

### Story 3.1: Xem tiến độ tuần và lịch sử theo target

As a chủ tài khoản, I want xem Done/target và kết quả lịch sử, So that tôi biết mức hoàn thành theo từng tuần.

**Maps to PRD:** FR-014, FR-015; NFR-010. **Depends on:** Story 2.4.

**Projection reuse:** Story này tái sử dụng projection engine đã đặt ở Story 2.2 và mở rộng nó cho history, historical target periods và weekly evaluation; dependency sau Story 2.4 được giữ nguyên.

**Acceptance Criteria:**

**Given** challenge 3/7 có 2–7 ngày Done **When** xem tuần **Then** cùng projection engine dùng cho Hôm nay lần lượt trả 2/3 đến 7/3 **And** phần mở rộng history hiển thị đúng từng ngày.

**Given** target thay đổi theo giai đoạn **When** xem tuần cũ **Then** tuần được đánh giá bằng target có hiệu lực của tuần đó.

**Given** đang tải/lỗi/không dữ liệu **When** mở history **Then** các state phân biệt rõ và không dùng empty thay lỗi.

### Story 3.2: Áp dụng tuần khởi động

As a chủ tài khoản, I want biết khi nào streak bắt đầu tính, So that tuần bắt đầu giữa chừng không bị coi là thất bại.

**Maps to PRD:** FR-016; NFR-003, NFR-010. **Covers UX:** UX-DR9. **Depends on:** Story 3.1.

**Acceptance Criteria:**

**Given** start date giữa tuần **When** có hoặc thiếu Done trong tuần đầu **Then** facts được lưu nhưng không cộng/ngắt streak và UI nêu ngày bắt đầu tính kế tiếp.

**Given** start date Thứ Hai **When** đánh giá streak **Then** tính ngay từ ngày đó.

**Given** target 1–6/7 hoặc 7/7 **When** áp dụng warm-up **Then** cùng một mốc được dùng cho cả hai nhóm.

### Story 3.3: Tính streak theo tuần cho target 1–6/7

As a chủ tài khoản, I want xem streak tuần, So that tôi biết số tuần liên tiếp đạt target.

**Maps to PRD:** FR-017, FR-019. **Depends on:** Story 3.2.

**Acceptance Criteria:**

**Given** các tuần hoàn tất liên tiếp đạt target **When** xem challenge **Then** current/longest streak tăng đúng một lần mỗi tuần và có đơn vị “tuần”.

**Given** tuần hiện tại chưa đạt nhưng chưa kết thúc **When** xem streak **Then** streak trước đó chưa bị ngắt.

**Given** một tuần đã kết thúc không đạt **When** tính streak **Then** current streak ngắt; Done vượt target không cộng thêm tuần.

### Story 3.4: Tính streak theo ngày cho target 7/7

As a chủ tài khoản, I want xem streak ngày cho challenge 7/7, So that chuỗi liên tục phản ánh đúng từng ngày.

**Maps to PRD:** FR-018, FR-019. **Depends on:** Story 3.2.

**Acceptance Criteria:**

**Given** các ngày Done liên tiếp **When** xem challenge **Then** current/longest streak có số đúng và đơn vị “ngày”, không reset ở ranh giới tuần.

**Given** hôm nay chưa kết thúc và chưa Done **When** xem streak **Then** giữ chuỗi đến hôm qua.

**Given** bỏ lỡ trọn một ngày **When** sang ngày tiếp theo **Then** current streak ngắt nhưng weekly progress vẫn đúng.

### Story 3.5: Lên lịch thay đổi target

As a chủ tài khoản, I want thay đổi target từ tuần sau, So that history cũ và streak không bị diễn giải lại.

**Maps to PRD:** FR-013, FR-020, FR-021, FR-022. **Covers UX:** UX-DR9. **Depends on:** Story 2.5, 3.3, 3.4.

**Acceptance Criteria:**

**Given** challenge active **When** đặt target mới **Then** chỉ một pending target có hiệu lực Thứ Hai kế tiếp và UI hiển thị current/pending/effective date.

**Given** pending target tồn tại **When** sửa hoặc hủy **Then** thay thế hoặc xóa đúng pending period, không đổi target hiện hành.

**Given** pending target tồn tại **When** owner archive challenge **Then** pending target bị hủy trong cùng transaction với archive.

**Given** đổi trong 1–6/7 **When** target có hiệu lực **Then** weekly streak tiếp tục theo kết quả và history cũ giữ target cũ.

**Given** đổi giữa 1–6/7 và 7/7 **When** có hiệu lực **Then** current streak bắt đầu từ 0 theo đơn vị mới, không có warm-up mới và records theo từng đơn vị được giữ riêng.

### Story 3.6: Tính lại và chốt streak khi archive

As a chủ tài khoản, I want kết quả được tính lại sau sửa history và chốt đúng khi archive, So that streak/record luôn phản ánh facts.

**Maps to PRD:** FR-019, FR-023, FR-042; NFR-003, NFR-010. **Covers UX:** UX-DR9, UX-DR10. **Depends on:** Story 3.5.

**Acceptance Criteria:**

**Given** backfill/undo/resolve conflict **When** lưu thành công **Then** progress/history/current streak/longest record/calendar projection được derive lại từ target timeline.

**Given** archive challenge 1–6/7 giữa tuần **When** tuần đã đạt target **Then** tính một tuần; nếu chưa đạt thì “Kết thúc theo dõi” không cộng/ngắt chuỗi trước.

**Given** archive challenge 7/7 **When** archive day Done/chưa Done **Then** tính hoặc giữ chuỗi đến hôm qua theo rule và các missed day trước đó vẫn có hiệu lực.

**Given** sửa history archived trong range **When** lưu **Then** “Chuỗi khi kết thúc theo dõi” và record được tính lại, không trôi theo thời gian.

## Epic 4: Ghi nhanh, tổ chức và tìm lại kiến thức

Người dùng ghi nhanh, tự lưu, tổ chức và tìm lại note văn bản thuần.

### Story 4.1: Quản lý vở và vở mặc định

As a chủ tài khoản, I want tổ chức note trong các vở một cấp, So that knowledge có nơi lưu rõ ràng.

**Maps to PRD:** FR-024, FR-025, FR-026. **Covers UX:** UX-DR3, UX-DR7. **Depends on:** Story 1.4.

**Acceptance Criteria:**

**Given** account mới/restore hợp lệ **When** mở Notes **Then** có đúng một vở mặc định được gắn nhãn và đứng đầu.

**Given** tên hợp lệ **When** tạo/đổi tên vở **Then** vở xuất hiện đúng một cấp.

**Given** vở mặc định hoặc vở còn note **When** yêu cầu xóa **Then** từ chối với lý do/action rõ.

**Given** vở không mặc định và rỗng **When** xác nhận xóa **Then** xóa và focus chuyển hợp lệ.

### Story 4.2: Tạo quick note với title tùy chọn

As a chủ tài khoản, I want bắt đầu note ngay, So that tôi ghi ý tưởng mà không cần phân loại hoặc đặt title trước.

**Maps to PRD:** FR-027, FR-039. **Covers UX:** UX-DR4. **Depends on:** Story 4.1.

**Acceptance Criteria:**

**Given** ở Today hoặc khu vực khác **When** chọn Ghi chú mới **Then** mở editor mới trong vở mặc định và focus body.

**Given** ở một vở Notes **When** tạo note **Then** dùng vở hiện tại.

**Given** editor mới hoàn toàn chưa có text **When** rời đi **Then** không persist note rỗng.

**Given** title trống nhưng body/title có nội dung **When** save **Then** note được lưu; label là title, dòng body không rỗng đầu tiên, hoặc “Không tiêu đề” mà không ghi ngược title.

### Story 4.3: Chỉnh sửa, tự lưu và chuyển note không gián đoạn

As a chủ tài khoản, I want chuyển note trong khi autosave, So that tôi làm việc nhanh mà không mất draft.

**Maps to PRD:** FR-029; NFR-004, NFR-005. **Covers UX:** UX-DR3, UX-DR5. **Depends on:** Story 4.2.

**Acceptance Criteria:**

**Given** note thay đổi và ngừng gõ 800 ms **When** autosave chạy **Then** save đúng note với client revision/base version/epoch.

**Given** đang sửa A **When** chọn B **Then** flush A bất đồng bộ, mở B ngay và giữ state riêng của A.

**Given** ACK của A về khi B đang mở **When** xử lý **Then** không đổi editor/focus của B và chỉ latest revision A được marked saved.

**Given** resize/mobile back-forward **When** layout đổi **Then** không remount mất draft, selection hoặc scroll hợp lệ.

### Story 4.4: Chuyển và xóa note an toàn

As a chủ tài khoản, I want chuyển hoặc xóa note có kiểm soát, So that tôi tổ chức lại mà không tạo bản sao hay xóa nhầm.

**Maps to PRD:** FR-027, FR-028. **Covers UX:** UX-DR7, UX-DR16. **Depends on:** Story 4.3.

**Acceptance Criteria:**

**Given** note tồn tại **When** chuyển sang vở khác **Then** giữ identity/content, thuộc đúng một vở và các list cập nhật.

**Given** move lỗi hoặc stale **When** server từ chối **Then** note ở vở cũ, draft được giữ và UI không báo thành công.

**Given** yêu cầu delete **When** chưa xác nhận **Then** không đổi dữ liệu; sau xác nhận xóa hard-delete và không có trash.

**Given** note có draft **When** xác nhận delete **Then** cảnh báo nêu draft sẽ mất và focus trả về vị trí hợp lệ.

### Story 4.5: Giải quyết conflict note và remote delete

As a chủ tài khoản, I want kiểm soát thay đổi note đồng thời, So that draft không bị ghi đè hoặc tự tái tạo note đã xóa.

**Maps to PRD:** FR-004, FR-029; NFR-006. **Covers UX:** UX-DR5, UX-DR16. **Depends on:** Story 4.4.

**Acceptance Criteria:**

**Given** stale whole-note save **When** title/body đã đổi từ thiết bị khác **Then** giữ draft và saved snapshot để owner chọn, không auto-merge.

**Given** note bị remote delete **When** local save tới sau **Then** không recreate; giữ draft trong session với retry disabled và thông báo rõ.

**Given** owner resolve conflict **When** save lựa chọn với current version **Then** lưu đúng snapshot chọn và devices hội tụ.

### Story 4.6: Tìm và mở note đã lưu

As a chủ tài khoản, I want tìm note bằng từ khóa tiếng Việt, So that tôi nhanh chóng dùng lại knowledge.

**Maps to PRD:** FR-030; NFR-009. **Covers UX:** UX-DR6, UX-DR17. **Depends on:** Story 4.2.

**Acceptance Criteria:**

**Given** saved title/body chứa “Học tiếng Anh” **When** tìm “HOC TIENG ANH” **Then** tìm thấy bằng AND whole-token, không phân biệt dấu/hoa thường và không gồm journal/event.

**Given** nhiều query liên tiếp **When** response cũ về sau **Then** không thay current results.

**Given** chọn result **When** mở **Then** route đúng note/notebook/version; keyboard Up/Down/Enter/Escape hoạt động theo context.

**Given** khoảng 1.000 note ngắn **When** chạy fixture trên matrix đã duyệt **Then** ghi phép đo và đáp ứng mục tiêu khoảng một giây hoặc báo chưa đạt.

## Epic 5: Quản lý lịch cá nhân trong bối cảnh challenge

Người dùng quản lý event và xem challenge đã Done theo ngày mà không trộn hai loại hoạt động.

### Story 5.1: Tạo và quản lý event có giờ

As a chủ tài khoản, I want CRUD event đơn lẻ, So that tôi theo dõi lịch trình cá nhân.

**Maps to PRD:** FR-031, FR-032. **Covers UX:** UX-DR12. **Depends on:** Story 1.3, 1.4.

**Acceptance Criteria:**

**Given** tên/start/end hợp lệ **When** tạo/sửa event **Then** lưu instant UTC từ account timezone và hiển thị lại đúng local time.

**Given** end không sau start **When** submit **Then** từ chối tại field liên quan, không mutate.

**Given** event qua ngày **When** save **Then** được chấp nhận; không có all-day/recurrence/reminder.

**Given** delete **When** chưa/sau confirm **Then** giữ nguyên hoặc hard-delete tương ứng.

### Story 5.2: Xem lịch tháng và danh sách ngày

As a chủ tài khoản, I want xem month calendar và ngày đã chọn, So that tôi thấy event diễn ra khi nào.

**Maps to PRD:** FR-033. **Covers UX:** UX-DR11, UX-DR15, UX-DR16. **Depends on:** Story 5.1.

**Acceptance Criteria:**

**Given** event range half-open qua nhiều ngày **When** xem các ngày nó diễn ra **Then** event xuất hiện đúng mọi ngày giao range và không xuất hiện tại end boundary ngoài range.

**Given** chọn ngày bằng touch/keyboard **When** Enter/chạm **Then** day list hiển thị đúng event và selected/today có label phân biệt.

**Given** mobile/desktop **When** render **Then** month/day xếp dọc hoặc cạnh nhau, không mất chức năng.

### Story 5.3: Hiển thị challenge Done trên lịch

As a chủ tài khoản, I want thấy challenge đã Done ở đúng ngày, So that lịch phản ánh hoạt động thực tế.

**Maps to PRD:** FR-034, FR-035, FR-036, FR-023. **Covers UX:** UX-DR10, UX-DR11. **Depends on:** Story 3.6, 5.2.

**Acceptance Criteria:**

**Given** completion Done/backfill **When** xem ngày **Then** hiển thị icon và tên qua hover/focus/touch.

**Given** số icon vượt capacity responsive **When** render cell **Then** hiển thị đúng +N và mở full accessible list.

**Given** undo/history correction **When** lưu **Then** icon/+N cập nhật đúng.

**Given** event kết thúc hoặc challenge chưa Done **When** xem lịch **Then** không tự tạo Done/icon.

### Story 5.4: Xem event trong Hôm nay

As a chủ tài khoản, I want xem event hôm nay cùng challenge, So that tôi có một điểm bắt đầu ngày.

**Maps to PRD:** FR-038. **Covers UX:** UX-DR8, UX-DR10. **Depends on:** Story 5.1.

**Acceptance Criteria:**

**Given** event giao account-day hôm nay **When** mở Today **Then** event xuất hiện theo thứ tự thời gian, gồm event qua ngày.

**Given** event được create/edit/delete **When** mutation thành công **Then** Today và Calendar hội tụ cùng dữ liệu.

**Given** device timezone khác account timezone **When** mở Today **Then** membership vẫn theo account timezone.

## Epic 6: Tự chủ sao lưu và khôi phục dữ liệu

Người dùng xuất và khôi phục toàn bộ dataset có kiểm soát, nguyên tử và an toàn giữa thiết bị.

### Story 6.1: Xuất backup đầy đủ và nhất quán

As a chủ tài khoản, I want tải backup toàn bộ dữ liệu đã lưu, So that tôi chủ động giữ bản sao.

**Maps to PRD:** FR-040; NFR-008. **Depends on:** EPIC-001–005.

**Acceptance Criteria:**

**Given** dataset hợp lệ **When** export **Then** snapshot schemaVersion 1 chứa đúng facts FR-040 từ một REPEATABLE READ snapshot/time context.

**Given** export **When** kiểm tra manifest **Then** không chứa credentials/session/draft/lock/ledger/operation hoặc nội dung chưa ACK.

**Given** export lỗi/timeout **When** operation kết thúc chưa thành công **Then** không cung cấp file thiếu như backup hợp lệ và có status/retry rõ.

### Story 6.2: Kiểm tra backup trước xác nhận import

As a chủ tài khoản, I want xem backup hợp lệ và hậu quả trước import, So that tôi không vô tình thay dữ liệu bằng file lỗi.

**Maps to PRD:** FR-041, FR-044. **Covers UX:** UX-DR13. **Depends on:** Story 6.1.

**Acceptance Criteria:**

**Given** file đọc được, đầy đủ, hash/schema v1 hợp lệ **When** preflight **Then** hiển thị metadata/tóm tắt và cảnh báo replace-all; chưa đổi live data.

**Given** corrupt/incomplete/unsupported file **When** preflight **Then** từ chối với lý do rõ và live data không đổi.

**Given** preflight hợp lệ **When** owner cancel trước confirm **Then** live data không đổi và không bắt đầu restore.

**Given** import UI **When** dùng keyboard/screen reader/mobile **Then** action an toàn được ưu tiên, labels/focus/scroll hoạt động.

### Story 6.3: Khôi phục toàn bộ dataset nguyên tử

As a chủ tài khoản, I want restore toàn bộ hoặc giữ nguyên dữ liệu cũ, So that import không để dataset dở dang.

**Maps to PRD:** FR-041, FR-045, FR-046; NFR-006, NFR-008. **Depends on:** Story 6.2.

**Acceptance Criteria:**

**Given** preflight hợp lệ và owner confirm **When** restore được bắt đầu **Then** server tạo durable import operation và bật account write fence trước khi replacement bắt đầu **And** operation status có thể được query bằng operation ID.

**Given** import operation đang active **When** có product mutation từ bất kỳ thiết bị nào **Then** server chặn mutation bằng trạng thái lỗi typed phù hợp và không cho write đi xuyên qua fence.

**Given** restore thành công **When** transaction commit **Then** mọi module facts được replace nguyên tử, constraints giữ đúng, epoch/revision tăng, operation chuyển sang succeeded và fence được mở theo cùng quy tắc commit của AD-9.

**Given** lỗi được inject giữa restore **When** transaction fail **Then** rollback toàn bộ, dataset/epoch cũ còn nguyên, operation chuyển sang failed và fence chỉ được mở lại theo recovery/locking rule của AD-9.

**Given** thiết bị khởi tạo import mất response **When** kết nối lại **Then** kết quả operation vẫn query được bằng operation ID **And** server không yêu cầu suy đoán thành công hay thất bại từ trạng thái kết nối.

**Given** snapshot restored **When** kiểm chứng round trip **Then** notebooks/notes/challenges/daily records/targets/events/timezone và derived results khớp backup.

### Story 6.4: Khóa ghi và phục hồi sau kết quả import chưa rõ

As a chủ tài khoản, I want mọi thiết bị dừng ghi và xác minh kết quả import, So that draft cũ không ghi đè dataset phục hồi.

**Maps to PRD:** FR-046; NFR-006, NFR-008. **Covers UX:** UX-DR13, UX-DR18. **Depends on:** Story 6.3.

**Acceptance Criteria:**

**Given** account state báo `write_state` khác open **When** client quan sát operation đang active **Then** client pause draft saves và product mutations, giữ bản đang nhập trong phiên và không báo thao tác đã được lưu.

**Given** thiết bị import mất kết nối trước response **When** reconnect **Then** client hiển thị kết quả chưa rõ, query operation ID và không cho import/write lại trước reconcile.

**Given** restore succeeded **When** thiết bị khác nhận epoch mới **Then** dừng retry cũ, clear server cache, quarantine old drafts và refetch trước enable writes.

**Given** restore failed chắc chắn **When** client reconcile operation status và account state **Then** client chỉ mở lại mutation/draft save sau khi `write_state` trở về open và owner có thể retry.
