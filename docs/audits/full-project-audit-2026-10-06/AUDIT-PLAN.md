# Plan audit & review toàn bộ dự án NoteFlow

- Người thực hiện: **5.6 Luna Max** (Lead audit). Người soạn plan: Claude Opus 5.5, ngày 2026-10-06.
- Baseline: branch `main`, HEAD `98def53` (`fix(v4): harden checkout, receipt versioning and terminal completion checks`), đồng bộ `origin/main`.
- Repo: 634 tracked files. Laravel 13 / PHP 8.4 (`backend/`), Vue 3 + Vite + Pinia + TanStack Query (`frontend/`), Playwright E2E (`tests/e2e/`), OpenAPI (`contracts/openapi.yaml`), control-plane V4 Lite (`.agents/`), BMAD (`_bmad/`, `_bmad-output/`).
- Môi trường: **một linked worktree riêng**. Audit chỉ đọc mã nguồn; chỉ được ghi file báo cáo trong thư mục audit.

---

## 0. Nguyên tắc bắt buộc (đọc trước mọi bước)

1. **Authority.** Đọc `AGENTS.md`, rồi `.agents/routing/task-router.md`. Đây là một **audit chỉ đọc**. Nó không thuộc lane V4 Story, không thuộc V4 migration, cũng không phải V3 Story. Vì vậy:
   - KHÔNG gọi action mutate nào của Runner: `start-story`, `implement-slice`, `verify-slice`, `finalize-story`, `complete-story`, `reconcile-story-lifecycle`.
   - KHÔNG gọi Orca, AGY, V3 workers hay bất kỳ recovery nào.
   - KHÔNG ghi `.agent-state/`, Plan, receipt, `sprint-status.yaml`, feature map hay verification recipe.
2. **Pointer trước.** Đọc `.agent-state/active-run.json` của canonical checkout trước bước đầu tiên. Chỉ tiếp tục khi `status: IDLE`, `activeRunId: null` và không có mâu thuẫn. Nếu khác thì DỪNG và báo cáo.
3. **Không sửa lỗi.** Audit chỉ ghi nhận. Bản sửa nào cũng phải thành backlog để người dùng chọn lane sau (mục 6). Không reset, clean, stash, hay sửa policy copy trong worktree.
4. **Bằng chứng.** Mỗi khẳng định mang một nhãn:
   - **[F]** fact, kèm `file:line`, commit, hoặc lệnh + exit code;
   - **[I]** suy luận;
   - **[H]** giả thuyết chưa kiểm chứng.

   Không bao giờ ghi "pass" cho một check chưa chạy. Check không chạy được ghi `NOT_RUN` kèm lý do.
5. **Phân loại finding** theo `AGENTS.md`: `VALID` / `FALSE_POSITIVE` / `SPEC_AMBIGUITY` / `NEEDS_HUMAN_DECISION`. Severity: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFO` (rubric ở mục 5). Không tự bịa hành vi mong đợi. Khi AC hay spec không rõ thì ghi `SPEC_AMBIGUITY`.
6. **Retry.** Một lệnh fail thì reproduce một lần và ghi output. Nếu sau khoảng 3 lần vẫn fail do môi trường thì ghi `NOT_RUN/ENV` và đi tiếp, không sa lầy.

---

## 1. Phase 0: Preflight & tạo worktree

Chạy từ canonical checkout `D:\Workspace\Tu_Hoc\New_Project_My_Note`:

```powershell
Get-Content .agent-state/active-run.json          # phải IDLE
git status -sb; git worktree list; git log -1 --format='%H %s'
git fetch origin; git rev-parse main origin/main  # ghi lại cả hai
git worktree add .worktrees/full-project-audit -b audit/full-project-2026-10-06 main
```

- `.worktrees/` đã nằm trong `.gitignore`.
- Worktree được tạo từ commit chứa plan này, tức là `98def53` cộng thêm một commit chỉ chứa docs. Code được audit vẫn là `98def53`. Ghi rõ cả hai SHA vào báo cáo.
- Nếu worktree đã có sẵn (người soạn plan đã tạo trước) thì không tạo lại. Chỉ xác minh path, branch và SHA.

Trong worktree:

```powershell
cd .worktrees/full-project-audit
git rev-parse --git-dir --git-common-dir          # xác nhận là linked worktree
```

- **Checkout safety** (`AGENTS.md`): so sánh `AGENTS.md`, `.agents/policies/orchestration-v3.md` và `.agents/skills/story-development/` của worktree với `main` qua `git diff main -- <paths>`. Ghi kết quả vào `00-preflight.md`.
- Tạo thư mục output `docs/audits/full-project-audit-2026-10-06/` trong worktree. Mọi file audit đều ghi vào đây.
- Cài dependency trong worktree. `node_modules/` và `vendor/` bị ignore nên worktree mới sẽ trống:
  ```powershell
  cd frontend;  npm ci
  cd ../tests/e2e; npm ci
  cd ../../backend; composer install --no-interaction
  ```
  Nếu backend cần `.env` thì copy từ `.env.example`, chỉ trong worktree. Không bao giờ copy `.env` thật từ canonical.
- Ghi phiên bản `node`, `npm`, `php`, `composer`, `docker`, `python` vào `00-preflight.md`.

**Đầu ra:** `00-preflight.md`, gồm pointer, SHA, worktree path, policy diff, versions và danh sách lệnh đã chạy.

---

## 2. Phase 1: Baseline deterministic checks

Chạy toàn bộ trong worktree. Mỗi check ghi: lệnh, cwd, exit code, thời gian chạy và tail khoảng 30 dòng output. Lưu log đầy đủ ở `logs/<check>.log`.

| # | Khu vực | Lệnh (cwd) | Ghi chú |
|---|---|---|---|
| B1 | V4 control-plane | `npm run test:v4` (root) | Bắt buộc chạy full suite, không chạy subset |
| B2 | BMAD scripts | `python -m pytest _bmad/scripts/tests -q` (root) | |
| B3 | FE type | `npm run type-check` (frontend) | |
| B4 | FE lint | `npm run lint` (frontend) | Gồm oxlint và eslint |
| B5 | FE unit | `npx vitest run` (frontend) | Ghi số test và coverage nếu có |
| B6 | FE build | `npm run build-only` (frontend) | |
| B7 | Contract lint | `npm run contract:validate` (frontend) | |
| B8 | Contract drift | `npm run contract:check` và `npm run contract:proof` (frontend) | `schema.generated.ts` phải khớp với `openapi.yaml` |
| B9 | BE test | `composer test` (backend) | Pest: Unit, Feature, Contract |
| B10 | BE static | `composer analyse` (backend) | Larastan, level theo `phpstan.neon` |
| B11 | BE style | `vendor/bin/pint --test` (backend) | |
| B12 | E2E helpers | `npx vitest run helpers` hoặc runner tương ứng (tests/e2e) | Theo cấu hình của thư mục |
| B13 | Dependency audit | `npm audit --omit=dev` (frontend, tests/e2e); `composer audit` (backend) | Lệnh read-only, cần mạng |
| B14 | Git hygiene | `git diff --check main`, `git ls-files \| xargs` kiểm file lớn, `git ls-files -i -c --exclude-standard` | Tìm file đã track nhưng lẽ ra phải ignore |

**Giới hạn đã biết, phải ghi rõ:** `scripts/verify-local.ps1` (Docker + Playwright full stack) **từ chối chạy trong linked worktree**, theo `Assert-CanonicalCheckout` ở dòng 39–60. Vì vậy:
- trong worktree, ghi B15 (`verify-local.ps1`) là `NOT_RUN/WORKTREE_GUARD`;
- không sửa script và không chạy nó từ canonical trên danh nghĩa audit;
- đề xuất trong báo cáo: người dùng tự chạy `scripts/verify-local.ps1` từ canonical tại cùng SHA, rồi dán kết quả vào phụ lục.

Nếu B1 hoặc B9 fail thì vẫn tiếp tục audit, nhưng finding tương ứng tối thiểu là `HIGH`.

**Đầu ra:** `01-baseline-checks.md` (bảng PASS/FAIL/NOT_RUN và exit code) và `logs/`.

---

## 3. Phase 2: Review theo workstream

Luna Max có thể chia các workstream cho sub-agent chạy song song. Mỗi sub-agent nhận đúng một workstream, chỉ đọc và trả về finding theo template ở mục 5. Lead tự hợp nhất và khử trùng lặp. Thứ tự ưu tiên khi thiếu thời gian: **C, D, E, H, A, B, F, G, I**.

### WS-A: Requirements → Story → Test traceability
- Nguồn: `docs/product/prd.md`, `epics.md`, `project-brief.md`; các story trong `_bmad-output/implementation-artifacts/*.md`; `sprint-status.yaml`.
- Lập ma trận: mỗi AC của các story `done` (1.1–1.6, 2.1, 2.3) → test chứng minh (BE, FE unit hoặc E2E) → trạng thái (`COVERED` / `PARTIAL` / `MISSING`).
- Kiểm tra:
  - Thứ tự phụ thuộc: 2.3 đã `done` trong khi 2.2 còn `backlog`. Phần 2.3 có giả định nào về 2.2 hay không?
  - Tên story trong `sprint-status.yaml` khớp với tên file hay không. Lưu ý dấu tiếng Việt: các file 1.5, 1.6 không dấu, còn key 1.5, 1.6 trong YAML có dấu.
  - `story-*-plan.md` và receipts có nhất quán với trạng thái `done` không.
- Đầu ra: `A-traceability.md`, gồm ma trận và finding.

### WS-B: Kiến trúc & ranh giới module
- Nguồn: `docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md` và `ARCHITECTURE-PROPOSAL.md`, kèm các review của chúng; `backend/app/Modules/README.md`.
- Đối chiếu với mã nguồn:
  - Layering `Modules/{Challenges,Identity}/{Application,Domain}` so với controller đặt ở `app/Http/Controllers`. Có business logic nào rò vào controller hay request không?
  - Domain exceptions được map thành HTTP response ở đâu, có nhất quán không.
  - Các quyết định kiến trúc đã duyệt mà code chưa theo, hoặc code làm vượt quyết định.
- Đầu ra: `B-architecture.md`.

### WS-C: Backend: bảo mật, toàn vẹn dữ liệu, đồng thời (rủi ro cao nhất)
- **Auth & owner isolation:**
  - Sanctum, `EnsureOwner`, `PrivateNoStore`, `AuthenticatedSessionController`, `LoginRequest`, `ProvisionOwner` command và migration `add_owner_admission`.
  - Mọi route trong `backend/routes/*` có middleware đúng không?
  - IDOR: tìm mọi query thiếu điều kiện owner.
  - Rate-limit login; token lifetime và revoke; CSRF/cookie nếu dùng SPA auth.
- **Idempotency & concurrency:**
  - `mutation_commands`, `IdempotencyKeyReusedException`, `VersionConflictException`, `StaleDataEpochException`, `WriteFenceActiveException`.
  - Transaction boundary và lock (`lockForUpdate`), unique index trong migration.
  - Race window giữa kiểm tra idempotency và ghi.
  - Đối chiếu `ChallengeConcurrencyTest` và `JournalConflictConcurrencyTest`: các test này có thật sự tạo được race không?
- **Time invariants:**
  - `AccountTimeContext`, logic ngày/tuần (Story 1.3), timezone, DST, ranh giới tuần, `InvalidJournalDayException`.
  - Nhập journal cho ngày tương lai hoặc ngày quá cũ.
- **Validation:** độ dài và ký tự của `InvalidChallengeNameException` / `InvalidJournalTextException`, `target_days` (1–7).
- **Migrations:** khả năng rollback, index, FK và cascade, nullable so với domain.
- **Secrets:** quét repo tìm key, token, mật khẩu hard-code (`.env.example`, `deploy/local`, `compose.local.yaml`, `config/*`).
- Mọi finding ở WS-C phải kèm một kịch bản tấn công hoặc lỗi cụ thể (input → kết quả sai). Nếu có thể chứng minh bằng test tạm thì viết test đó **trong thư mục scratch ngoài repo** hoặc chỉ mô tả, không commit test.
- Đầu ra: `C-backend.md`.

### WS-D: API contract
- Đối chiếu ba bên: `contracts/openapi.yaml`, `backend/routes/api.php` + controllers + response thật, và `frontend/src/api/*.ts` + `schema.generated.ts`.
- Mỗi endpoint cần có: schema request/response, mã lỗi (401, 403, 404, 409, 422, 423/428 cho fence/epoch, nếu có), và một contract test trong `backend/tests/Contract/`.
- Liệt kê: endpoint thiếu contract test; status code có trong code nhưng không có trong spec, và ngược lại; field FE dùng mà spec không khai báo.
- Đầu ra: `D-contract.md`, gồm bảng endpoint × kiểm tra.

### WS-E: Frontend: sync, offline, conflict, UX
- Trọng tâm:
  - `frontend/src/stores/` (đặc biệt `sync.ts`). Audit 2026-10-06 đã ghi các lỗi latent ở nhánh `catch` và nhánh ACK (D-F1..F3); cần kiểm tra lại toàn bộ state machine.
  - `ContentConflictDialog.vue`, `ChallengeJournalEditor.vue`, `modules/`, `queryClient.ts`, `router/` (guard auth), `api/http.ts` (retry, 401 handling, idempotency key).
- Các kịch bản bắt buộc phải lần theo code:
  - mất mạng giữa lúc save → giữ bản nháp (Story 1.5);
  - hai thiết bị cùng sửa → conflict (Story 1.6);
  - token hết hạn giữa phiên;
  - data epoch thay đổi;
  - double-submit;
  - reload trang khi đang có pending mutation.
- Thêm: rò bộ nhớ hoặc listener, `v-html` / XSS, accessibility (label, focus trap của dialog, keyboard), responsive, empty, error và loading state, i18n tiếng Việt.
- Chất lượng unit test: test có assert hành vi hay chỉ snapshot hoặc mock rỗng?
- Đầu ra: `E-frontend.md`.

### WS-F: E2E & chiến lược test tổng thể
- `tests/e2e/*.spec.ts`, `helpers/` (db-helper.php, php-runtime), `playwright.config.ts` và script patch Windows `scripts/patch-playwright-windows-cleanup.mjs`. Script này can thiệp vào `node_modules`, cần đánh giá rủi ro.
- Kiểm tra:
  - Độ cô lập dữ liệu giữa các test.
  - Nguồn flaky: `waitForTimeout`, selector dễ vỡ.
  - Guard của DB helper có ngăn chạm vào DB thật không.
  - Khoảng trống: kịch bản nào ở WS-E chưa có E2E.
- Lập bản đồ test pyramid: số test mỗi tầng; module nào không có test.
- Đầu ra: `F-testing.md`.

### WS-G: Hạ tầng local & deploy
- `compose.local.yaml`, `deploy/local/*`, `deploy/nginx/*`, `scripts/local.ps1`, `scripts/verify-local.ps1`, `docs/development/local-runtime.md`, `deploy/README.md`.
- Kiểm tra:
  - Port bind ra `0.0.0.0` hay `127.0.0.1`.
  - Default credentials.
  - Header bảo mật trong nginx (CSP, X-Frame-Options, HSTS nếu áp dụng).
  - `APP_DEBUG`.
  - Image tag đã được pin chưa.
  - Docs có khớp với script không.
- Đầu ra: `G-infra.md`.

### WS-H: Control-plane V4 Lite & quy trình agent
- **Phạm vi:** `.agents/scripts/*.mjs` (khoảng 72 file), `.agents/context/*`, `.agents/routing/*`, `.agents/schemas/*`, `.agents/features/*`, `.agents/verification/*`, `.agents/policies/*`, `.agents/skills/v4-story-runner/` và `CLAUDE.md` / `AGENTS.md`.
- **Đối chiếu finding cũ:**
  - Lấy các finding trong `docs/agent-architecture/reviews/agent-architecture-review-2026-09-30.md`, `story-1-5-vs-1-6-audit-2026-10-06/audit-report.md` (F-01..F-08) và `v4-acceptance-2026-09-28/findings.json`.
  - Với từng finding, xác định trạng thái tại HEAD: `RESOLVED` (ghi commit fix + test), `PARTIAL` hay `OPEN`. Đặc biệt F-02 (bản sửa không nằm trên branch nào), F-01 (schema producer/consumer của receipt), F-03 (trạng thái bán phần không có recovery) và F-04 (rework sau `CHANGES_REQUIRED`).
- **Coverage của verification:** registry chỉ có 3 feature (`challenge-list`, `journal-frontend`, `today-view`). Lập danh sách path sản phẩm không thuộc `covered_paths` nào, ví dụ identity/auth, sync store, conflict dialog, account context, migrations. Hệ quả là các path này luôn `INCOMPLETE`/`NOT_APPLICABLE`.
- **Fail-closed:** đọc `check-verification.mjs`, `check-escalation.mjs` và `v4-action-kernel.mjs`, tìm nhánh có thể trả `PASS` hoặc `NO_REVIEW` khi thiếu dữ liệu. Chỉ chạy các script **read-only** (`check-*.mjs check ...`, `measure-v4-instruction-context.mjs`), và chỉ sau khi đã đọc code để xác nhận chúng không ghi.
- **Tính nhất quán của policy:** `AGENTS.md`, router, context, skill, V3 policy có quy tắc nào mâu thuẫn không. Ví dụ: memory ghi `review_slice` disabled trong khi skill vẫn hướng dẫn dùng nó. Đo kích thước instruction context.
- **Receipts:** `_bmad-output/implementation-artifacts/receipts/story-*`. Kiểm tra schema version nhất quán và SHA được tham chiếu có tồn tại trong lịch sử (`git cat-file -e`).
- **BMAD skills** (`.agents/skills/bmad*`, `skills-lock.json`): lock có khớp nội dung không, có skill trùng lặp hay chết không.
- Đầu ra: `H-control-plane.md`.

### WS-I: Tài liệu, lịch sử Git & vệ sinh repo
- README, docs/* có lỗi thời so với code không. `docs/superpowers/plans/*` đã hoàn tất hay còn treo.
- `.gitattributes` và CRLF (đã từng gây sự cố ở F-08).
- File lớn hoặc file generated bị track (`frontend/src/api/schema.generated.ts` là chủ ý; xác nhận lại). `tests/e2e/test-results` có bị track không.
- Branch hoặc worktree mồ côi (`git branch -a`, `git worktree list`). **Chỉ liệt kê, không xoá.**
- Commit message, merge đúng quy trình (`git log --merges --oneline`).
- Đầu ra: `I-repo-hygiene.md`.

---

## 4. Phase 3: Xác minh chéo finding

1. Với mỗi finding `HIGH`/`CRITICAL`, Lead (hoặc một sub-agent khác người tìm ra) **xác minh độc lập**: đọc lại code, tái hiện bằng lệnh hoặc trace, rồi gán `CONFIRMED` hoặc `REJECTED → FALSE_POSITIVE`.
2. Khử trùng lặp giữa các workstream và gom các finding cùng nguyên nhân gốc.
3. Mọi finding `VALID` phải có ít nhất một bằng chứng **[F]**. Finding chỉ có [I]/[H] thì hạ xuống `PLAUSIBLE`, ghi cách kiểm chứng, và không xếp vào nhóm ưu tiên.

---

## 5. Template & rubric

**Rubric severity:**
- `CRITICAL`: mất hoặc hỏng dữ liệu, lộ dữ liệu giữa owner, vượt auth, secret bị lộ, hoặc gate báo `PASS`/`done` sai trên một đường có thật.
- `HIGH`: lỗi đồng thời hoặc idempotency có thể xảy ra, AC đã `done` nhưng không có bằng chứng, contract drift làm FE hỏng, control-plane có đường fail-open, baseline B1/B9 fail.
- `MEDIUM`: thiếu test cho unhappy path, lệch kiến trúc có hệ quả, docs sai dẫn đến thao tác sai, UX hoặc a11y chặn tác vụ.
- `LOW`/`INFO`: style, nợ kỹ thuật nhỏ, cải thiện.

**Template finding** (dùng trong `findings.json` và các file WS):

```json
{
  "id": "C-03",
  "workstream": "C",
  "title": "…",
  "severity": "HIGH",
  "classification": "VALID | FALSE_POSITIVE | SPEC_AMBIGUITY | NEEDS_HUMAN_DECISION",
  "verification": "CONFIRMED | PLAUSIBLE",
  "evidence": [{"kind": "F", "ref": "backend/app/...php:42", "note": "…"}],
  "failure_scenario": "input/trạng thái cụ thể → kết quả sai",
  "affected_paths": ["…"],
  "related_prior_finding": "F-01 | null",
  "proposed_fix": "mô tả, không phải patch",
  "proposed_lane": "V3 Story | V4 migration | bugfix thường | human decision",
  "risk_of_fix": "LOW | MEDIUM | HIGH"
}
```

---

## 6. Phase 4: Báo cáo & bàn giao

Toàn bộ nằm trong `docs/audits/full-project-audit-2026-10-06/`, trên branch `audit/full-project-2026-10-06`:

| File | Nội dung |
|---|---|
| `AUDIT-REPORT.md` | Kết luận tổng (sức khoẻ từng khu vực: 🟢🟡🔴), top 10 finding, các rủi ro trước Story tiếp theo (2.2), danh sách `NEEDS_HUMAN_DECISION` |
| `00-preflight.md`, `01-baseline-checks.md` | Phase 0–1 |
| `A-…md` … `I-…md` | Chi tiết từng workstream |
| `findings.json` | Tất cả finding theo template, sắp xếp theo severity |
| `prior-findings-status.md` | Trạng thái các finding của audit/review trước tại HEAD |
| `remediation-backlog.md` | Nhóm bản sửa thành các gói nhỏ có thứ tự phụ thuộc. Mỗi gói ghi lane, risk, check phải chạy, và **không gói nào được tự thực thi** |
| `logs/` | Log của các lệnh baseline |

**Kết thúc:**
1. `git add docs/audits/full-project-audit-2026-10-06` và commit **chỉ thư mục audit** trên branch audit. Message `docs(audit): full project audit at <sha>`, kèm attribution theo quy ước.
2. Chạy `git status` để xác nhận không còn thay đổi nào khác (dependency install không được để lại file tracked bị sửa; nếu có thì báo cáo, không revert bừa).
3. **Không merge vào `main`, không push, không xoá worktree.** Báo cho người dùng: SHA commit audit, đường dẫn worktree, và các bước họ cần làm (review, chạy `verify-local.ps1` từ canonical, quyết định backlog).

---

## 7. Điều kiện DỪNG ngay và báo cáo

- Pointer khác `IDLE`, hoặc có run hay worktree V3/V4 đang hoạt động trên cùng phạm vi.
- Phát hiện secret thật trong repo. Khi đó báo ngay, không chép giá trị secret vào báo cáo; chỉ ghi `file:line` và loại secret.
- Một lệnh tưởng là read-only lại làm thay đổi file tracked hoặc `.agent-state/`.
- Cần quyết định sản phẩm hay kiến trúc để tiếp tục. Ghi `NEEDS_HUMAN_DECISION` và đi tiếp phần còn lại; chỉ dừng khi nó chặn toàn bộ audit.

## 8. Checklist hoàn thành

- [ ] Pointer `IDLE` được ghi kèm thời điểm đọc; worktree và SHA được ghi lại
- [ ] B1–B14 có trạng thái và exit code; B15 ghi `NOT_RUN/WORKTREE_GUARD`
- [ ] WS-A…WS-I đều có file, kể cả khi "không có finding" (ghi rõ đã kiểm tra những gì)
- [ ] Mọi HIGH/CRITICAL đã được xác minh chéo
- [ ] `prior-findings-status.md` phủ hết các finding cũ
- [ ] `remediation-backlog.md` có lane và risk cho từng gói
- [ ] Chỉ một commit trên branch audit, chỉ chứa thư mục audit; không merge, không push
