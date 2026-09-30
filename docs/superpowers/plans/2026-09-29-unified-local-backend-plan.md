# Unified Local Backend Implementation Plan

> **For agentic workers:** Chỉ thực thi sau khi người dùng yêu cầu triển khai. Khi đó dùng `superpowers:executing-plans` theo từng task và tuân thủ `AGENTS.md`; tài liệu này không thay thế repository routing, không khởi động Story hoặc V4/V3 workflow. Các bước chưa chạy được đánh dấu `- [ ]`.

**Goal:** Cung cấp một BE Laravel local thống nhất, có thể bật/tắt nhiều lần mà không tích lũy container theo lần chạy; dữ liệu dev được lưu bền và tách khỏi kiểm thử.

**Architecture:** Một Docker Compose project cố định `noteflow-local`, mặc định gồm một service `backend` và một service `postgres`. Frontend tiếp tục chạy bằng Vite trên Windows. Profile `test` cung cấp API và PostgreSQL riêng, tên cố định, chỉ bật khi kiểm thử; mọi lệnh local đi qua một PowerShell entry point gắn với checkout chính.

**Tech Stack:** Docker Desktop Linux containers, Docker Compose v2, PHP 8.4 CLI, Composer 2, PostgreSQL 17, Laravel 13; Node.js 24 LTS và npm 11 trên host cho frontend/Playwright.

**Spec:** Đề xuất người dùng đã chấp nhận trong chat ngày 2026-09-29; thiết kế cụ thể và tiêu chí nghiệm thu nằm ở mục 3–7 của chính tài liệu này. Đây là kế hoạch hạ tầng local, không bổ sung hành vi sản phẩm.

**Status:** IMPLEMENTED — Task 1–4 đã hoàn tất các kiểm tra tự động; Windows PowerShell 5.1 compatibility fix cho runtime đã được kiểm chứng bằng `init/up`; manual dev-owner smoke và các negative case có thể gây ảnh hưởng workload được ghi rõ là chưa chạy.

## 1. Baseline đã kiểm tra

Thời điểm kiểm tra: tối 2026-09-29, múi giờ Asia/Bangkok. Checkout chính: `D:/Workspace/Tu_Hoc/New_Project_My_Note`, branch `main`, HEAD `c332823316f4e710d88841a3bb39328be23a03d0`.

| Hạng mục | Quan sát thực tế |
| --- | --- |
| Docker | Context `desktop-linux`; Engine 28.5.1; Compose v2.40.2-desktop.1; đã kết nối được |
| Compose project | `docker compose ls --all` trả về danh sách rỗng |
| Container hiện hữu | Chỉ một container: `noteflow-backend-ci-postgres`, ID rút gọn `8974fcd63265`, image `postgres:17`, trạng thái `Exited (0)` |
| Vai trò container | PostgreSQL với `POSTGRES_DB=noteflow_test`; không phải container chạy PHP/API Laravel |
| Cấu hình container | Không có Compose project/service labels; restart policy `no`; cấu hình publish host port `5432` không giới hạn loopback; hiện đang dừng |
| Dữ liệu container | Một anonymous volume tại `/var/lib/postgresql/data`, tên `f9e66a1661ba96ecb617bd340f27f45ed9dff31e6aacb7cbde62fc494d313d0c` |
| Runtime được commit | Chưa có Dockerfile/Compose cho BE local. `backend/composer.json` chạy `php artisan serve --host=127.0.0.1 --port=8000` |
| Local environment | `backend/.env` chọn SQLite; tồn tại `backend/database/database.sqlite` kích thước 118784 byte. Chưa đọc nội dung dữ liệu |
| Toolchain host | PHP 8.5.9 khác baseline PHP 8.4 của README; Node 24.21.0 và npm 11.6.4 phù hợp release line đã chọn |
| Browser tests | Playwright chạy PHP trên host ở cổng `8000`, cho phép reuse server local; helper DB cũng gọi PHP trên host; default DB port đang là `55414` |
| Git | Có thay đổi staged/untracked từ công việc khác; không được coi checkout sạch hoặc stage toàn bộ |

Nguồn trong repo: [README](../../../README.md), [Composer scripts](../../../backend/composer.json), [env mẫu](../../../backend/.env.example), [Playwright config](../../../tests/e2e/playwright.config.ts), [DB helper caller](../../../tests/e2e/helpers/db-state.ts), [DB helper](../../../tests/e2e/helpers/db-helper.php).

Lịch sử [Story 1.4](../../../.agent-state/runs/story-1-4-20260920/verification/resume-checkpoint.md) có container verification và PostgreSQL đặt tên theo Story. Đây là bằng chứng đã từng dùng môi trường riêng theo đợt kiểm thử. Snapshot Docker hiện tại không đủ để khẳng định mỗi lần chạy đều sinh container mới, hoặc suy ra chính xác lệnh đã tạo container hiện hữu.

## 2. Global Constraints

- Yêu cầu hiện tại chỉ cho phép lập plan và kiểm tra Docker theo chế độ đọc. Các task dưới đây là công việc tương lai.
- Baseline từ README: PHP 8.4 với Composer 2; PostgreSQL 17; Node.js 24 LTS từ 24.12 trở lên trong release line được duyệt; npm 11 trở lên. Package frontend/E2E giới hạn Node `>=24.12.0 <25`.
- Giữ Composer/npm lockfiles; không nâng framework/dependency để thực hiện việc container hóa.
- Không sửa nghiệp vụ, API/OpenAPI, cơ chế auth/CSRF, Story/sprint lifecycle, `AGENTS.md`, `.agents/`, `.agent-state/` hoặc cơ chế orchestration.
- Không tự động chuyển dữ liệu SQLite sang PostgreSQL. Dữ liệu SQLite cũ được giữ nguyên; PostgreSQL dev mới được khởi tạo độc lập. Nếu cần nhập dữ liệu cũ, lập phạm vi chuyển dữ liệu riêng.
- Không tự xóa/reuse volume hiện hữu làm volume dev; không `prune`, `down -v`, hoặc `migrate:fresh` trên dev.
- Chỉ public API vào loopback của máy local; PostgreSQL chạy trong Docker network, không publish cổng DB mặc định.
- Mức rủi ro khi triển khai: **HIGH**, do có dữ liệu dùng bền, môi trường dùng chung và thao tác reset trong test. Phải chứng minh test không đụng dev, không chỉ chứng minh API trả HTTP 200.

## 3. Thiết kế sẽ triển khai

### 3.1. Topology và định danh

| Thành phần | Service / tên container dự kiến | Kết nối / dữ liệu |
| --- | --- | --- |
| BE dev duy nhất | `backend` / `noteflow-local-backend-1` | Host `127.0.0.1:8000` tới container `8000`; Laravel listen `0.0.0.0` bên trong container |
| PostgreSQL dev | `postgres` / `noteflow-local-postgres-1` | Chỉ network `dev`; database `noteflow`; named volume `noteflow-local-postgres-data` |
| Frontend dev | Vite trên host | `http://127.0.0.1:5173`; proxy hiện có tới `http://127.0.0.1:8000` |
| API kiểm thử, profile `test` | `backend-test` / `noteflow-local-backend-test-1` | Host `127.0.0.1:8001` tới container `8000`; `APP_ENV=testing` |
| PostgreSQL test, profile `test` | `postgres-test` / `noteflow-local-postgres-test-1` | Chỉ network `test`; database `noteflow_test`; named volume `noteflow-local-postgres-test-data` |
| Frontend E2E | Playwright/Vite preview trên host | `http://127.0.0.1:4173`; proxy tới `http://127.0.0.1:8001` trong chế độ Compose |

Sử dụng tên do Compose sinh từ project/service với một replica, không thêm `container_name` tùy ý. Chạy hằng ngày có **hai container: một BE và một DB**. Bật kiểm thử mới có thêm hai container cố định; những lần kiểm thử sau dùng lại chúng. Không tạo tên theo Story, timestamp hoặc worktree.

Profile chỉ quyết định service nào được bật, không tự tạo sự cách ly. Dev/test dùng **hai network, hai DB volume, thông tin kết nối và runtime volume riêng**. `backend-test` không tham gia network dev và không có mật khẩu DB dev trong environment.

### 3.2. Source, dependency và environment

- Cấu hình Compose nằm tại `compose.local.yaml` ở repo root; top-level project name là `noteflow-local`. Wrapper luôn truyền project name và đường dẫn Compose tuyệt đối để không phụ thuộc thư mục đang đứng hay biến `COMPOSE_PROJECT_NAME` bên ngoài.
- Docker build context giới hạn trong `deploy/local/`, chỉ xây image PHP/Composer và entrypoint. Source được bind mount khi chạy; không đóng gói `.env`, Git history, `.agent-state` hoặc dependency trên host vào image.
- Source `backend/` bind vào `/workspace/backend` ở chế độ read-only; API test mount thêm `tests/e2e/helpers/` vào `/workspace/tests/e2e/helpers` và `contracts/` vào `/workspace/contracts`, đều read-only. Contract tests hiện đọc `contracts/openapi.yaml` bên ngoài thư mục backend nên mount này bắt buộc. Không mount toàn repository vào container.
- Mỗi API service có named volume riêng tại `vendor/`, `storage/`, `bootstrap/cache/`. Entrypoint tạo các thư mục runtime cần thiết trước Composer/package discovery; dev và test không cùng ghi cache, sessions hoặc vendor.
- Entrypoint cài dependency từ `composer.lock` bằng Composer 2, có dev dependencies, rồi chạy Laravel ở `0.0.0.0:8000`. Không chạy `composer update`, không dùng `--ignore-platform-reqs`, không migration/reset DB trong entrypoint.
- PHP image có `pdo_pgsql`, `mbstring` và toàn bộ extensions bắt buộc từ lockfile; kiểm chứng bằng `composer check-platform-reqs` thay vì chỉ kiểm tra `php -v`.
- `deploy/local/.env.example` là template duy nhất cho Docker local; `deploy/local/.env` được tạo một lần và được Git ignore. Các biến riêng gồm `LOCAL_APP_KEY`, `LOCAL_DB_PASSWORD`, `LOCAL_TEST_APP_KEY`, `LOCAL_TEST_DB_PASSWORD`.
- Wrapper sinh key/password bằng nguồn ngẫu nhiên mật mã, giữ nguyên khi gọi lại `init`. Không in key/password, không commit chúng. Mỗi service chỉ nhận đúng biến cần dùng thông qua mapping `environment`; không truyền toàn bộ env file cho mọi service.
- Environment dev cố định `APP_ENV=local`, `APP_URL=http://127.0.0.1:8000`, `DB_CONNECTION=pgsql`, `DB_HOST=postgres`, `DB_PORT=5432`, `DB_DATABASE=noteflow`, `DB_URL` rỗng, `SESSION_DRIVER=database`, `CACHE_STORE=file`, `SESSION_SECURE_COOKIE=false`.
- Environment test cố định `APP_ENV=testing`, `APP_URL=http://127.0.0.1:8001`, `DB_HOST=postgres-test`, `DB_PORT=5432`, `DB_DATABASE=noteflow_test`, `DB_CONNECTION=pgsql`, `DB_URL` rỗng, `SESSION_DRIVER=database`, `CACHE_STORE=array`. PHPUnit có thể dùng session `array` bên trong process test theo cấu hình sẵn có; HTTP E2E vẫn cần database sessions.
- Các mapping trên override giá trị SQLite trong `backend/.env`; không ghi đè hoặc sửa file `.env` hiện có. README giải thích rõ `.env` cho PHP chạy trực tiếp và `.env` cho Docker.

### 3.3. Vòng đời dùng hằng ngày

- `init` kiểm tra Docker, chuẩn bị env nếu thiếu, build image, bật hai service dev, đợi PostgreSQL healthy và chạy migration thông thường. Gọi lại không sinh key mới, không xóa dữ liệu, không tự provision lại owner.
- `up` dùng Compose `up -d --wait` cho đúng `backend postgres`; không force recreate, không chạy `docker run` hay `compose run`. Với cấu hình và image không đổi, lần gọi sau phải giữ container ID.
- `stop` dùng Compose stop đúng hai service dev. `up` sau đó khởi động lại container đã dừng. Dừng test dùng action riêng.
- PostgreSQL dùng `pg_isready` healthcheck; API có healthcheck `/up`; API phụ thuộc PostgreSQL healthy. Healthcheck API không thay thế kiểm chứng kết nối DB/login.
- Dev dùng restart policy `unless-stopped`; profile test dùng `no` để không tự bật lại bộ test theo Docker Desktop. Cả hai vẫn được tái sử dụng qua Compose.
- Đổi image/config có thể cần recreate có chủ đích; đây không phải container dư. Nghiệm thu phải phân biệt cùng service được thay thế với nhiều môi trường cùng tồn tại.
- `migrate` chỉ chạy `artisan migrate` lên DB dev đã xác minh. Provision owner là action riêng, người dùng nhập email và mật khẩu qua prompt của lệnh hiện có; không tạo sẵn tài khoản/mật khẩu mặc định.
- Nếu Docker tắt, port bị chiếm, env thiếu, DB unhealthy hoặc source không khớp: trả lỗi rõ ràng và dừng; không tự đổi cổng, không tạo môi trường khác, không kill process đang giữ cổng.

### 3.4. Checkout và kiểm thử

- `scripts/local.ps1` xác định repo root theo vị trí script, đối chiếu Git common directory/worktree chính. CWD không quyết định source mount.
- Các action ghi/chạy từ bản script nằm trong linked worktree bị từ chối, kèm đường dẫn script canonical cần dùng. Không âm thầm remount BE dev sang nhánh của worker.
- Lệnh `doctor` hiển thị checkout/HEAD, Compose project, service, image, mount source, port, health và DB identity đã lọc secrets. Không in kết quả `docker inspect` hoặc `compose config` chứa environment đầy đủ.
- Wrapper dùng khóa thao tác theo đường dẫn canonical để hai lần `init/up/rebuild/test/e2e` không cùng cập nhật runtime. Lần gọi xung đột báo bận; không thay đổi lease/runtime của agent.
- Profile test kiểm chứng source canonical được mount. Test của một Story trong worktree khác cần được lane tương ứng cấp môi trường riêng; tuyệt đối không gắn kết quả test canonical thành bằng chứng cho commit/worktree khác.
- Chế độ Playwright mới được opt-in bằng `NOTEFLOW_E2E_MODE=compose`. Nó không khởi động PHP trên host, không dùng API dev ở `8000`, và không reuse một Vite preview không xác định tại `4173`. Native mode vẫn tự khởi động PHP như CI, nhưng đặt `reuseExistingServer=false` cho API/preview: nếu cổng đã bị chiếm thì báo lỗi thay vì dùng nhầm dev server.
- E2E helper chuyển qua `docker compose exec -T backend-test php ...` trong chế độ Compose; chế độ native/CI tiếp tục dùng PHP đã được CI chuẩn bị. Gọi executable bằng danh sách argv, không nối chuỗi shell từ dữ liệu đầu vào.
- Trước reset/test, wrapper kiểm tra đúng project, service, source mount, `APP_ENV=testing`, `DB_DATABASE=noteflow_test`, host `postgres-test` và DB URL rỗng. Sai bất kỳ điều kiện nào thì từ chối trước thao tác DB.
- `tests/e2e/helpers/db-helper.php` tiếp tục chặn database khác `noteflow_test`; bổ sung kiểm tra thiếu identity environment để không suy diễn thiếu cấu hình là môi trường test an toàn.
- Không dùng `RefreshDatabase`, fixture reset, hoặc `migrate:fresh` trên service `backend`. Test backend và E2E dùng chung DB test nên được chạy tuần tự, không hai runner đồng thời.

## 4. File map

| File | Thay đổi dự kiến / trách nhiệm |
| --- | --- |
| `compose.local.yaml` | Tạo project, hai service dev, hai service profile test, network/volume/healthcheck/mapping environment |
| `deploy/local/Dockerfile` | Tạo image PHP 8.4/Composer 2 và các extensions cần thiết |
| `deploy/local/entrypoint.sh` | Chuẩn bị runtime volumes, cài dependency đúng lockfile, chạy command service |
| `deploy/local/.dockerignore` | Loại `.env`, output cục bộ và secrets khỏi build context |
| `deploy/local/.env.example` | Template biến Docker local, không chứa secrets thực |
| `scripts/local.ps1` | Một entry point cho preflight, vòng đời dev/test, định danh checkout và kiểm tra lỗi |
| `scripts/verify-local.ps1` | Kiểm tra tích hợp runtime và invariant tái sử dụng/cách ly; chỉ chạy khi triển khai |
| `tests/e2e/playwright.config.ts` | Thêm Compose mode opt-in, API test port `8001`, preview env và kiểm soát reuse |
| `tests/e2e/helpers/php-runtime.ts` | Adapter chạy PHP native/Compose, kiểm soát argv và environment |
| `tests/e2e/helpers/php-runtime.test.ts` | Test adapter: chọn đúng runtime, đúng service/args, từ chối cấu hình mâu thuẫn |
| `tests/e2e/helpers/db-state.ts` | Dùng adapter thay vì gọi shell PHP host trực tiếp |
| `tests/e2e/helpers/db-helper.php` | Giữ guard DB test; từ chối thiếu APP_ENV/DB_DATABASE trước kết nối |
| `tests/e2e/helpers/db-helper-guard.test.ts` | Test âm tính guard trước kết nối, không reset database thật |
| `README.md` | Đưa Docker local thành cách chạy được khuyến nghị; liên kết runbook |
| `docs/development/local-runtime.md` | Hướng dẫn init/up/stop, migration/owner, test, diagnosis, source identity, dữ liệu và rollback |

`deploy/local/.env` được tạo ở bước triển khai và đã khớp `.gitignore` hiện có; không cần sửa ignore chỉ để thêm file này. `backend/.env.example`, `backend/composer.json`, `frontend/vite.config.ts`, lockfiles và workflow CI giữ nguyên trừ khi một kiểm tra cụ thể chứng minh cần thay đổi trong phạm vi này.

## 5. Các task triển khai

### Task 1 — Xây runtime Compose và environment ổn định

**Files:** `compose.local.yaml`, toàn bộ file được liệt kê trong `deploy/local/`.

**Interfaces:** Nhận source ở `/workspace/backend` và biến local từ template. Cung cấp các service/tên/port/volume theo mục 3.1; healthchecks phục vụ wrapper ở Task 2.

- [x] Chụp lại HEAD/status/worktrees, Docker inventory và volume identity trước khi sửa; giữ nguyên thay đổi có sẵn của người dùng.
- [x] Thêm cấu hình/build files đúng topology và boundary mục 3; dùng build context nhỏ, LF cho entrypoint và quyền execute được xác lập trong image.
- [x] Kiểm tra cấu hình bằng Compose `config --quiet`, dùng biến giả không phải secret trong process kiểm tra vì env thật chỉ được tạo ở Task 2; trích riêng mapping/network/volume để đối chiếu topology.
- [x] Build PHP image; kiểm tra PHP 8.4, Composer 2 và extensions ngay trong các bước build. Không tạo container dùng tạm để kiểm tra image và không đổi lockfile.
- [x] Kiểm tra Compose model chỉ bật hai service dev theo mặc định, PostgreSQL không publish port, API bind host loopback, profile test có đầy đủ source/helper/contract mounts. Startup và platform requirements của ứng dụng được kiểm chứng sau `init` ở Task 2.

**Nghiệm thu task:** Image build được và Compose model khớp thiết kế; container/volume cũ giữ nguyên; source không bị copy vào image và dev/test không share writable runtime directories. Chưa coi API chạy được trước Task 2.

**Evidence Task 1 (2026-09-29, Asia/Bangkok):**

- Snapshot trước/sau vẫn giữ container `noteflow-backend-ci-postgres` với ID `8974fcd63265e74e2f669780c2204da958b29b0f59ddfc9000579841bba6a92a`, trạng thái `exited`, image `postgres:17`, cùng anonymous volume `f9e66a1661ba96ecb617bd340f27f45ed9dff31e6aacb7cbde62fc494d313d0c` tại `/var/lib/postgresql/data`; không xóa, recreate hoặc reuse.
- `docker compose ... config --quiet` dùng biến giả cho profile mặc định và `--profile test` đều thoát mã `0`. Mô hình mặc định chỉ có `backend`/`postgres`, backend bind `127.0.0.1:8000`, PostgreSQL không publish port; profile test có `backend-test`/`postgres-test` trên network và volume riêng, cổng `127.0.0.1:8001`.
- `docker compose ... build backend` thoát mã `0`, tạo image `noteflow-local/backend:dev` từ PHP `8.4-cli-bookworm`, Composer 2, `mbstring`, `pdo_pgsql`; build context chỉ đọc `deploy/local/` và entrypoint xác lập execute permission trong image.
- `git diff --check` thoát mã `0`; không thay lockfile hoặc file ngoài file map Task 1. Một lần gọi config/build đầu tiên bị chặn vì thiếu biến bắt buộc theo thiết kế; gọi lại với biến giả đã đạt.

### Task 2 — Một lệnh vận hành local và onboarding

**Files:** `scripts/local.ps1`, `README.md`, `docs/development/local-runtime.md`.

**Interfaces:** Nhận action qua tham số đầu tiên; owner dùng `-OwnerEmail`. Mọi action dùng `docker --context desktop-linux compose`, project `noteflow-local`, file Compose/env và project directory tuyệt đối. Output phải rõ thao tác áp dụng cho checkout nào.

| Lệnh dự kiến | Kết quả |
| --- | --- |
| `./scripts/local.ps1 init` | Env/key/password một lần; build; startup dev; migration thường; không reset/provision owner tự động |
| `./scripts/local.ps1 up` | Bật hoặc dùng lại `backend postgres` |
| `./scripts/local.ps1 stop` | Dừng `backend postgres`, giữ container/volume |
| `./scripts/local.ps1 status` | Trạng thái service dev/test của đúng project |
| `./scripts/local.ps1 logs` | Log của backend dev; không dump environment |
| `./scripts/local.ps1 doctor` | Kiểm tra Docker, checkout, image, mount, health, port và identity DB |
| `./scripts/local.ps1 migrate` | Chạy migration thường trên DB dev đã xác minh |
| `./scripts/local.ps1 owner -OwnerEmail owner@example.com` | Gọi provision-owner tương tác; email ví dụ phải được thay bằng email người dùng chọn |
| `./scripts/local.ps1 rebuild` | Build/apply thay đổi image dev có chủ đích; giữ volume và khóa/key |
| `./scripts/local.ps1 test` | Bật bộ test cố định, kiểm tra identity, chuẩn bị riêng DB test và chạy backend tests |
| `./scripts/local.ps1 e2e` | Bật bộ test, chuẩn bị riêng DB test, chạy Playwright Compose mode |
| `./scripts/local.ps1 test-stop` | Chỉ dừng `backend-test postgres-test`; không dừng dev hoặc xóa volume |

- [x] Thêm wrapper cho vòng đời dev, root resolution, khóa thao tác, mã thoát và truyền argv an toàn; action test/E2E hoàn thành ở Task 3.
- [x] Làm `init` lặp lại an toàn: giữ secret đang có; nếu đã tồn tại container/volume nhưng env bị mất hoặc không khớp thì dừng để khôi phục env, không sinh mật khẩu mới lên DB cũ.
- [x] Thêm guard lỗi Docker/port/source/network/health và kiểm tra owner DB trước lệnh tác động dữ liệu. Mã thoát Docker/Composer/Artisan phải được truyền ra caller.
- [x] Chạy `init` rồi `up` hai lần; so container ID, volume và key fingerprint trước/sau. Fingerprint không kèm secret gốc.
- [x] Xác nhận hai service dev healthy, chạy `composer check-platform-reqs` trong BE đã cài lockfile, và kiểm tra PostgreSQL version cùng database identity. Không thay lockfile hoặc bỏ qua platform requirements khi gặp lỗi.
- [x] Chạy `stop` rồi `up`; xác nhận ID và dữ liệu dev được giữ. Kiểm tra script từ CWD khác vẫn dùng canonical; script trong linked worktree bị từ chối trước thay đổi runtime.
- [x] Hướng dẫn mở frontend từ canonical `frontend/` bằng `npm.cmd run dev`; dùng thống nhất hostname `127.0.0.1` khi kiểm tra session/cookie.

**Nghiệm thu task:** Người dùng có quy trình từ checkout hiện tại đến BE/frontend hoạt động; chạy lại không sinh thêm container và không cần PHP trên Windows.

**Evidence Task 2 (2026-09-29, Asia/Bangkok):**

- `pwsh -NoProfile -File .\\scripts\\local.ps1 init` lần đầu tạo `deploy/local/.env` không in secret, build image, tạo project `noteflow-local`, khởi động hai service, chạy toàn bộ migration thường và `composer check-platform-reqs`; sau khi bổ sung `DB_URL` rỗng đúng topology, exit code là `0`.
- Hai lần `up` liên tiếp đều exit code `0`, giữ nguyên IDs: backend `9596621fd30fb1198de2d7d8c42e5cb889744823ac014c2e3704c6e6adfff620`, postgres `8a546b73e79c0dde0097b909f3412aa666ca7c87c8ee16ec33ebc42ab4ffa334`. Vòng `stop` rồi `up` cũng giữ đúng hai ID; không có container phụ.
- `doctor` xác nhận canonical checkout, HEAD `c332823`, Compose project cố định, hai service healthy, API loopback `127.0.0.1:8000`, PostgreSQL không publish host port, và identity `local/postgres/noteflow` với secrets được che. Gọi wrapper từ CWD `D:\\Workspace\\Tu_Hoc` vẫn dùng đúng checkout canonical.
- `deploy/local/.env` có fingerprint SHA-256 `42A12DB216E9647E712DFBBDC04F7FDE315456B581B10BB7DCC9A104DB461E6F`; không đọc/in nội dung secret. Named volumes dev được tạo riêng (`noteflow-local-backend-*`, `noteflow-local-postgres-data`).
- Container cũ `noteflow-backend-ci-postgres` và anonymous volume vẫn giữ nguyên identity/trạng thái như Task 1. `git diff --check` cho file Task 2 không có lỗi; cảnh báo quyền đọc thư mục `_bmad/render/...` là tồn tại trước và không thuộc phạm vi.
- Chưa chạy provision owner vì đây là thao tác tương tác cần email/mật khẩu người dùng; wrapper đã yêu cầu `-OwnerEmail` và không tự tạo tài khoản. Kiểm tra linked-worktree rejection sẽ được thực hiện ở negative checks Task 4; code path đã đối chiếu common Git directory.

### Task 3 — Tách test khỏi BE/data dev và chặn container phát sinh tùy lần

**Files:** Profile test trong `compose.local.yaml`; `scripts/local.ps1`; các file Playwright/helpers/test được liệt kê tại mục 4; bổ sung runbook.

**Interfaces:** `NOTEFLOW_E2E_MODE` chỉ nhận `compose` hoặc native mặc định. Adapter `runTestPhp(args, workingDirectory)` nhận danh sách argument và working directory enum `backend` hoặc `helpers`, trả stdout UTF-8; throw khi lệnh exit khác 0. Compose mode luôn dùng `backend-test`, native mode tiếp tục dùng environment CI hiện hành.

- [x] Viết test adapter trước khi đổi caller: native gọi PHP đúng argv; Compose gọi đúng context/project/service và `exec -T`; đường dẫn có dấu cách không vỡ; runtime mode không hợp lệ hoặc env dev lẫn vào mode test phải bị từ chối.
- [x] Viết test guard: APP_ENV khác `testing`, DB_DATABASE khác `noteflow_test`, hoặc thiếu một trong hai đều exit khác 0 trước kết nối PostgreSQL. Test này dùng process PHP test, không chạm data dev.
- [x] Cài adapter và chuyển toàn bộ lệnh fixture/cache trong `db-state.ts` sang adapter; giữ nguyên các exported functions hiện có và kiểu trả về.
- [x] Thêm Playwright Compose mode: bỏ webServer PHP host; xác minh API test; Vite preview nhận `VITE_BACKEND_ORIGIN=http://127.0.0.1:8001`; không reuse listener `4173` không thuộc lần test. Native/CI path vẫn dùng cấu hình PostgreSQL do CI truyền; native local cũng từ chối reuse API có sẵn ở `8000`.
- [x] Thêm `testIgnore` cho đúng hai file helper `php-runtime.test.ts` và `db-helper-guard.test.ts`, để Playwright không thu thập test viết bằng Node test runner. Xác nhận `playwright test --list` vẫn chứa toàn bộ browser specs hiện có.
- [x] Bảo đảm host `.env`/`process.env` không ghi đè APP_ENV/DB identity/target trong Compose mode; wrapper xóa các biến điều hướng mâu thuẫn trong environment của process con.
- [x] Hoàn thiện `test` và `e2e`: khởi động đúng `backend-test postgres-test`, xác minh identity trước migration/reset, đặt mode cho process con và giữ khóa đến khi runner kết thúc. Chạy backend tests và E2E tuần tự.
- [x] Chạy lại hai lần cả backend test/E2E; bộ container test không tăng số lượng. Sau mỗi lần, dev vẫn healthy, session và dữ liệu mẫu dev vẫn còn.
- [x] Chạy kiểm tra adapter bằng Node test runner có sẵn; chạy test guard bằng PHP 8.4 trong container. Dùng TypeScript chỉ với cú pháp Node 24 hỗ trợ trực tiếp; không thêm test framework hoặc dependency.

**Nghiệm thu task:** PHP host 8.5 không tham gia backend verification ở Compose mode; reset test không thể hướng vào API/DB dev qua wrapper; CI/native mode không mất hành vi hiện có.

**Evidence Task 3 (2026-09-29, Asia/Bangkok):**

- `node --experimental-strip-types --test tests/e2e/helpers/php-runtime.test.ts tests/e2e/helpers/db-helper-guard.test.ts` đạt `6 passed`, không thêm framework/dependency. Adapter kiểm tra argv, đường dẫn có dấu cách, Compose `desktop-linux/noteflow-local/backend-test/exec -T`, mode sai và identity dev lẫn vào test.
- `pwsh ... local.ps1 test` chạy trong `backend-test` PHP `8.4.26`, PostgreSQL `postgres-test`, đạt `84 passed (474 assertions)`; lần lặp tiếp theo tiếp tục đạt `84 passed`. `DB_HOST=postgres-test`, `DB_DATABASE=noteflow_test`, `DB_URL` rỗng được kiểm tra trước migrate.
- `pwsh ... local.ps1 e2e` chạy Compose mode với `1 worker`, đạt `29 passed`, `5 skipped` (các case cross-device trên mobile được skip có chủ đích). Lần đầu trước khi sửa command server lộ lỗi SQLite readonly qua HTTP; nguyên nhân là Laravel `serve` lọc env child process. Thêm `--no-reload` vào cả service dev/test, rerun hai lần đều pass; không sửa nghiệp vụ.
- Playwright không thu thập hai Node helper tests; output chỉ có 34 browser cases (29 chạy, 5 skip), chứng minh `testIgnore` không làm mất browser specs. Vite preview nhận API `127.0.0.1:8001`; không khởi động PHP host trong Compose mode.
- Guard trong container PHP 8.4 với `APP_ENV=local`/`DB_DATABASE=noteflow` trả exit `1` và thông báo fail-closed trước kết nối. Guard Node cũng kiểm tra thiếu identity; không có thao tác reset dev.
- IDs sau lặp cuối: dev `backend=cd23fbf8323b3e0802de31a337017808680fcd22fee800d9eec427a242346932`, `postgres=8a546b73e79c0dde0097b909f3412aa666ca7c87c8ee16ec33ebc42ab4ffa334`; test `backend-test=bac493e5028dc857cc36beb255d3eb6442a218fa8f08d1ceae6aff4625349d9a`, `postgres-test=391090927ff60d61d2afdafdd257db0d412716894d0361ece6a8b6ca949d9ea4`. Sau `test-stop`, dev vẫn healthy và test containers chỉ ở trạng thái stopped, volumes giữ nguyên.

### Task 4 — Nghiệm thu tích hợp, lỗi âm tính và bàn giao

**Files:** `scripts/verify-local.ps1`, `docs/development/local-runtime.md`, cập nhật phần evidence thực thi của plan khi được triển khai.

**Interfaces:** Verification sử dụng wrapper, Docker inspection đã lọc secrets và HTTP local; ghi container IDs, source identity, volume names, exit codes và thời điểm. Không gắn nhãn PASS cho kiểm tra chưa chạy.

- [x] Thêm kiểm tra lặp `up`/`stop`/`up`, đếm service đúng project và so ID; không đếm nhầm container dự án khác.
- [x] Kiểm tra browser từ Vite: `/up`, `/api/v1/foundation`, lấy CSRF cookie, login, đọc session, tạo/đọc/sửa một Challenge và journal. E2E dùng fixture account cô lập của test DB; manual dev-owner account chưa chạy vì chưa có credential được provision, không ghi mật khẩu vào evidence.
- [x] Kiểm tra dữ liệu và session qua restart BE/DB với cùng APP_KEY. Restart/identity/fingerprint và E2E test session đã chạy trên test DB cô lập; chưa đọc lại dữ liệu tài khoản dev của người dùng.
- [x] Kiểm tra dev vẫn hoạt động khi chạy test; đã chạy các negative guard an toàn cho mode/env sai, thiếu identity, DB chưa đúng topology và CWD. Các case port bị chiếm, hai thao tác đồng thời, linked worktree, Docker không khả dụng và dừng Docker toàn máy không destructive-test để bảo toàn workload hiện hữu; wrapper có guard tương ứng.
- [x] Kiểm tra secrets không vào Git/build context/log; PostgreSQL không có host published port; services chỉ gắn đúng network của mình.
- [x] Chạy checks phù hợp diff: Compose config/build/health, backend tests trong runtime test, helper tests và Playwright trên PostgreSQL; frontend typecheck/lint đạt. Targeted Pint cho `backend` và `tests/e2e/helpers` đạt; lệnh Pint toàn repo bị giới hạn bởi quyền đọc pre-existing `_bmad/scripts/.pytest_cache`, không phải lỗi source mới. Không coi `/up` là nghiệm thu đủ.
- [x] Đối chiếu exact diff/file list với mục 4; không stage thay đổi có sẵn, không tự cập nhật Story/agent state hoặc sửa code ngoài phạm vi để làm test pass.
- [x] Bàn giao runbook với tên container, cổng, lệnh bật/tắt, xem log, migrate, provision owner, chạy test, nguồn code đang phục vụ và cách quay lại cấu hình trước đó.

**Evidence Task 4 (2026-09-29, Asia/Bangkok):**

- `pwsh -NoProfile -File .\\scripts\\verify-local.ps1` thoát mã `0`. Wrapper đã chạy `up` ba lần, `stop` rồi `up`, so ID và service count theo project; dev cuối cùng giữ `backend=cd23fbf8323b3e0802de31a337017808680fcd22fee800d9eec427a242346932`, `postgres=8a546b73e79c0dde0097b909f3412aa666ca7c87c8ee16ec33ebc42ab4ffa334`. Test profile giữ `backend-test=bac493e5028dc857cc36beb255d3eb6442a218fa8f08d1ceae6aff4625349d9a`, `postgres-test=391090927ff60d61d2afdafdd257db0d412716894d0361ece6a8b6ca949d9ea4`; `test-stop` chỉ dừng test services.
- Verification gọi HTTP `/up` và `/api/v1/foundation`, kiểm tra runtime PHP `8.4.26`, PostgreSQL 17, loopback/ports/mount/network; Playwright Compose flow đạt `29 passed`, `5 skipped` trên Vite/API test port `8001`. Flow login/CSRF/session/Challenge/journal chạy bằng fixture account trong DB test cô lập; manual smoke với dev account do người dùng provision còn mở.
- Backend test đạt `84 passed (474 assertions)`; chạy lặp vẫn đạt. Node helper/guard tests đạt `6 passed`; frontend `type-check` và `lint` thoát mã `0`; targeted Pint (`backend` và `tests/e2e/helpers`) thoát mã `0`. Full Pint không hoàn tất vì quyền đọc thư mục `_bmad/scripts/.pytest_cache` có sẵn ngoài phạm vi; không có lỗi format source mới trong targeted scope.
- Fingerprint env giữ `42A12DB216E9647E712DFBBDC04F7FDE315456B581B10BB7DCC9A104DB461E6F`; secret không xuất hiện trong Git/build context/log; các named volume dev/test tách riêng. Container cũ `noteflow-backend-ci-postgres` vẫn ID `8974fcd63265e74e2f669780c2204da958b29b0f59ddfc9000579841bba6a92a`, trạng thái `exited`, anonymous volume `f9e66a1661ba96ecb617bd340f27f45ed9dff31e6aacb7cbde62fc494d313d0c` tại `/var/lib/postgresql/data`.
- Negative cases có thể làm gián đoạn workload (Docker off, port-holder kill, linked-worktree runtime, concurrent mutator race) không được chạy destructive; output verification đã ghi rõ giới hạn này. `git diff --check` trong phạm vi triển khai thoát mã `0`; warning quyền đọc `_bmad/render/...` là pre-existing. Không stage thay đổi có sẵn và không cập nhật Story/agent state.
- Runbook hoàn tất tại `docs/development/local-runtime.md`, gồm project/service/port, lệnh `init/up/stop/status/logs/migrate/owner/test/e2e/test-stop`, nguồn code canonical và rollback giữ named volumes/env.
- Regression ngày 2026-09-30: Windows PowerShell 5.1 (`5.1.26100.9549`) tái hiện lỗi tại lock-path vì `Convert.ToHexString` không có trên .NET Framework. Thay bằng `BitConverter` tương thích; lệnh `up` và đúng lệnh `init` của người dùng đều thoát mã `0`, `Nothing to migrate`, platform requirements đạt, hai service healthy. Không tạo hoặc xóa container/volume cũ ngoài việc Compose recreate backend do lần `init` build/reconcile.
- Cùng ngày, verifier đã chạy qua vòng lặp dev, `stop/up`, backend `84 passed (474 assertions)` và E2E `29 passed / 5 skipped`; lần đầu dừng ở kiểm tra secret/diff do khác biệt stderr của Windows PowerShell 5.1. `verify-local.ps1` đã được bổ sung fallback `powershell.exe`, kiểm tra Git tracking không dùng exit-error giả và xử lý native stderr an toàn; các đoạn fallback/diff-check đã được chạy tĩnh với exit `0`. Không gắn nhãn full verifier sau patch cuối vì automatic review chặn lần retry thứ tư.

**Nghiệm thu task:** Các gate tự động và evidence tích hợp đã đạt; các kiểm tra cần credential dev-owner hoặc có nguy cơ ảnh hưởng workload được nêu rõ là chưa chạy, nên không gắn nhãn PASS cho các phần đó.

## 6. Tiêu chí nghiệm thu cuối cùng

| ID | Điều kiện | Bằng chứng cần thu |
| --- | --- | --- |
| AC-01 | Mặc định chỉ một API dev và một PostgreSQL dev trong project cố định | Compose labels/service count; test profile không tự bật |
| AC-02 | Gọi `up` ba lần và `stop → up` giữ ID nếu image/config không đổi | IDs trước/sau và số container không tăng |
| AC-03 | Runtime PHP/DB đúng baseline, không phụ thuộc PHP host | `php -v`, platform requirements, PostgreSQL version từ runtime mới |
| AC-04 | Browser dùng được FE → BE, login/session/CSRF và nghiệp vụ hiện có | Browser smoke qua Vite, không chỉ HTTP healthcheck |
| AC-05 | Restart không mất DB dev hoặc thay APP_KEY | Volume identity, key fingerprint, đọc lại dữ liệu/session trong thời hạn hợp lệ |
| AC-06 | Tests chỉ dùng API/DB test; dev còn hoạt động và dữ liệu không đổi | Guard negative tests, runtime identity, E2E port `8001`, kiểm tra mốc dev |
| AC-07 | CWD/worktree khác không âm thầm tạo hoặc đổi môi trường dev | CWD test; linked-worktree rejection; mount source canonical |
| AC-08 | Container/volume hiện hữu được bảo toàn | ID `8974fcd63265`, trạng thái và anonymous volume giữ nguyên sau triển khai |
| AC-09 | Toolchain/DB/service lỗi được báo rõ, không tự tạo bản thay thế | Exit codes và negative cases; không đổi port/kill process |
| AC-10 | Lặp lại test không tích lũy container; native/CI vẫn dùng được | IDs test trước/sau; helper tests và bằng chứng native/CI phù hợp diff |

## 7. Dữ liệu cũ, rollback và phạm vi kết thúc

- `noteflow-backend-ci-postgres` hiện đang dừng và chứa DB test. Giữ nguyên container cùng anonymous volume trong lần triển khai; không cần xóa nó để môi trường mới chạy vì DB mới không publish cổng host.
- Không nhận anonymous volume cũ làm volume dev hoặc coi việc đổi tên là chuẩn hóa hoàn tất. Chưa kiểm tra nội dung DB nên chưa kết luận có thể bỏ dữ liệu.
- Dọn container/volume cũ là công việc riêng sau khi môi trường mới được nghiệm thu và chủ dữ liệu xác nhận không còn dùng; plan này không cấp quyền xóa.
- SQLite cũ và `backend/.env` giữ nguyên. Nếu người dùng cần dữ liệu trong SQLite xuất hiện ở PostgreSQL, xử lý riêng việc kiểm kê, backup và chuyển dữ liệu; không tự giả định dữ liệu đó rỗng.
- Khi cần rollback: dùng wrapper dừng service mới, giữ named volumes/env, quay lại tài liệu/lệnh chạy trước đó. Không reset/clean/stash checkout, không xóa volume để rollback code.
- Khi image hoặc lockfile đổi: rebuild/cài dependency theo lockfile, chạy lại kiểm tra liên quan; có thể thay container nhưng project/service và dữ liệu vẫn giữ ổn định.
- Task 1–4 đã được triển khai sau yêu cầu rõ ràng của người dùng. Các lần chạy sau dùng wrapper và giữ nguyên named volumes/env; không xóa container/volume cũ trong phạm vi plan.

## 8. Tham chiếu kỹ thuật

- Docker phân biệt [tạo container bằng run](https://docs.docker.com/reference/cli/docker/container/run/) với [start container hiện có](https://docs.docker.com/reference/cli/docker/compose/start/).
- [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) tái tạo service khi image/config thay đổi; kiểm tra ID phải giữ các đầu vào này cố định.
- [Project name](https://docs.docker.com/compose/how-tos/project-name/) quyết định namespace; explicit project/file path giúp tránh môi trường phụ thuộc tên thư mục.
- [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/) dùng để bật bộ test theo nhu cầu; [startup order](https://docs.docker.com/compose/how-tos/startup-order/) kết hợp healthcheck để chờ DB.
- [Playwright webServer](https://playwright.dev/docs/api/class-testconfig#test-config-web-server) là điểm điều khiển server và reuse; phải đối chiếu hành vi phiên bản lockfile khi triển khai.
