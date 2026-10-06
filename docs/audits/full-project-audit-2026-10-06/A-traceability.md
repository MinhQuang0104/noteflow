# WS-A — Requirements → Story → Test traceability

[F] Audit ngày 2026-10-06, tại linked worktree D:/Workspace/Tu_Hoc/New_Project_My_Note/.worktrees/full-project-audit, branch audit/full-project-2026-10-06, HEAD 03dbd098e36245f51a4b8e875e89c1c0bb21acc6. Mã nguồn sản phẩm được audit là 98def5358983072216a28754e87b1cd5f884d258; commit chứa plan audit bổ sung docs được mô tả tại AUDIT-PLAN.md:41. Lệnh git rev-parse HEAD và git status --short --branch trong worktree: exit 0.

[F] Phạm vi WS-A gồm 8 Story done, 31 AC; trạng thái Story nằm tại _bmad-output/implementation-artifacts/sprint-status.yaml:39–44 và :48–50. Chỉ hai artifact A-traceability.md/A-findings.json được ghi bởi WS-A. Router read-only và giới hạn audit được đọc tại .agents/routing/task-router.md và AUDIT-PLAN.md:12–25, :102–109; không thực thi Story, Runner, recovery hoặc sửa lifecycle.

[I] Kết quả source coverage: **19 COVERED, 12 PARTIAL, 0 MISSING**. COVERED nghĩa là có assertion/structural check phù hợp phạm vi AC; PARTIAL nghĩa là chỉ chứng minh một phần AC, còn nghĩa vụ chưa có bằng chứng, hoặc đường lỗi đã được WS-E ghi nhận. MISSING dùng khi không tìm thấy assertion thích hợp nào. Các trạng thái này đánh giá nội dung chứng minh, không phải kết quả chạy test ở HEAD audit.

[F] WS-A không chạy BE/FE/E2E runtime suite. Probe Test-Path frontend/node_modules, backend/vendor/autoload.php, tests/e2e/node_modules tại worktree trả false/false/false, exit 0. Runtime verification của WS-A: **NOT_RUN/ENV**. Baseline do Lead ghi tại 01-baseline-checks.md; lịch sử PASS trong Story/receipt chỉ được nhận diện là bằng chứng lịch sử, không chuyển thành PASS hiện tại.

## Nguồn approved intent và giới hạn phạm vi

| Nguồn | Đối chiếu intent [F] | Kết luận phạm vi [I] |
|---|---|---|
| docs/product/prd.md:109–114, :120–123 | FR001 privacy; FR002 sync; FR003 truthful status; FR004 conflict; FR005 memory retry; FR006 account time; FR007/008 challenge; FR009 Done; FR010 optional journal độc lập Done. | 1.1–1.6 là nền tảng; 2.1 là metadata; 2.3 là journal. Không suy diễn rằng toàn bộ FR002/FR009 đã hoàn tất. |
| docs/product/prd.md:193–196, :265–269, :275–277 | NFR004 saved/reload/device; NFR005 truthful; NFR006 convergence; NFR007 privacy. AC003 của PRD nói về Notes draft; AC008 của PRD gồm journal rồi Done. | Journal là resource thật để kiểm chứng nền tảng, không chứng minh Notes hay mọi domain tương lai; AC008 toàn sản phẩm còn phần Done. |
| docs/product/project-brief.md:75–84, :108–125, :170–184 | MVP nhiều domain; journal tùy chọn, Done độc lập; target 1–7; account timezone/Mon–Sun; mất mạng giữ draft trong bộ nhớ, private owner/online. | Không thêm yêu cầu offline durable draft hoặc tự động Done khi viết journal. |
| docs/product/epics.md:151–161, :257, :275, :293 | 1.1–1.3 prerequisite; 1.4–1.6 phải tích hợp với persisted resource thật. Epic 2 cần 1.1–1.3, không bắt buộc toàn Epic 1 xong trước. | Thứ tự kỹ thuật phải theo dependency của từng Story, không theo thứ tự số ID. |
| docs/product/epics.md:313–321, :327–353 | 2.1 metadata; 2.2 phụ thuộc 2.1 và sở hữu Done/current-week progress; 2.3 phụ thuộc 2.1, journal/completion độc lập. | 2.3 done trước 2.2 backlog hợp dependency. Hai chiều thực thi completion/journal cần được định nghĩa rõ khi consumer 2.2 xuất hiện; xem A-03. |
| docs/product/prd.md:343–346; docs/product/project-brief.md:244–258 | Approval baseline và mục tiêu không phải measured product acceptance. | Không lấy approved planning hoặc mục tiêu UX làm bằng chứng runtime. |

[F] Alias trong các bảng dưới đây đều trỏ tới _bmad-output/implementation-artifacts/; số sau dấu hai chấm là dòng trong file:

| Alias | File |
|---|---|
| S11 | 1-1-khởi-tạo-nền-tảng-noteflow-từ-starter-được-duyệt.md |
| S12 | 1-2-đăng-nhập-và-bảo-vệ-dữ-liệu-owner.md |
| S13 | 1-3-dùng-một-ngày-và-tuần-thống-nhất-trên-mọi-thiết-bị.md |
| S14 | 1-4-nhận-dữ-liệu-mới-giữa-hai-thiết-bị.md |
| S15 | 1-5-giu-ban-dang-nhap-va-thu-luu-lai-sau-gian-doan.md |
| S16 | 1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md |
| S21 | 2-1-tạo-và-quản-lý-thông-tin-challenge.md |
| S23 | 2-3-ghi-và-sửa-journal-tùy-chọn.md |

## Ma trận 31 AC

[I] Mỗi trạng thái trong cột cuối là kết luận coverage từ assertion ở cột bằng chứng. [F] Những test được mô tả dưới đây đã đọc thân assertion; việc có file hoặc tên test không được dùng một mình làm bằng chứng. “E2E thật” mô tả nguồn test dùng backend/PostgreSQL, không khẳng định test đã chạy.

### Story 1.1 — 6 AC

| AC và intent [F] | BE / FE / E2E / structural evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.1-AC1 — S11:20–25: scaffold từ starter duyệt, Vue 3/Vite/TS + Laravel 13, monorepo và giới hạn framework | backend/composer.json:9–10 yêu cầu PHP 8.4/Laravel 13. tests/e2e/foundation.spec.ts:9–11 assert app/login NoteFlow. Git ls-tree -r --name-only 7cbfa9ea210fa3b1bf20a6f1c7a0d975a7cbe04c frontend/src backend/app backend/routes (exit 0) cho foundation scaffold; frontend/package.json:11–13 có build/type/contract commands. | **PARTIAL** — cấu trúc/behavior có bằng chứng; assertion không chứng minh provenance của việc dùng generator/create-vue hay toàn bộ negative framework exclusions. Đây là giới hạn chứng minh lịch sử, không kết luận scaffold sai. |
| 1.1-AC2 — S11:27–32: lockfile/reproducible dependency/build/type gates | .github/workflows/ci.yml:40–44 validate/install backend và checks; :56–70 npm ci, lint, type-check, unit, build. frontend/package.json:11–12 khai báo build/type-check. | **COVERED** — gate commands đã cấu hình; fresh clean-install/build result **NOT_RUN/ENV**, không lấy cấu hình CI làm PASS. |
| 1.1-AC3 — S11:34–39: SPA/API/auth/health/same-origin route skeleton | backend/tests/Feature/FoundationHealthTest.php:7–12 assert 200 và exact JSON. frontend/src/api/__tests__/http.spec.ts:18–25 assert path và credentials same-origin; frontend/src/api/__tests__/auth.spec.ts:10–43 assert CSRF initialization/header. tests/e2e/routing.spec.ts:3–30 assert deep-link SPA, API404 JSON, login/logout GET405; :71–83 assert health và API-prefix boundary. | **COVERED** — route/transport boundaries được assert; auth đã được mở rộng bởi 1.2. |
| 1.1-AC4 — S11:41–48: OpenAPI, runtime contract positive/negative và CI drift fail | backend/tests/Contract/FoundationResponseContractTest.php:13–20 validate actual Laravel response; :25–36 deliberate wrong service → ValidationFailed. frontend/scripts/prove-contract-drift.mjs:8–23 tạo controlled schema mutation và reject zero exit; :24–35 restore và require zero exit. .github/workflows/ci.yml:58–62 gọi lint/check/proof. | **COVERED** — có positive/negative assertions và drift proof; WS-A chỉ đọc proof source, không thực thi script ghi contract. |
| 1.1-AC5 — S11:50–55: test runners/build/smoke và responsive không overflow | FoundationHealthTest.php:7–12; frontend/src/api/__tests__/http.spec.ts:18–31 assert success và 503 rejection. tests/e2e/foundation.spec.ts:14–21 kiểm endpoint thật. tests/e2e/responsive.spec.ts:24–36 assert document width và mobile toggle. tests/e2e/playwright.config.ts:20–29 cấu hình laptop1440 và phone390, timezone khác nhau. CI commands tại ci.yml:43–44, :64–70, :114–123. | **COVERED** — smoke/assertions và runner gates có source; kết quả chạy hiện tại **NOT_RUN/ENV**. |
| 1.1-AC6 — S11:57–62: tại thời điểm hoàn tất foundation, không xây sớm business domain/infrastructure ngoài scope | Git tree foundation commit 7cbfa9ea210fa3b1bf20a6f1c7a0d975a7cbe04c (lệnh ls-tree trên, exit 0) có Foundation controller/views, modules placeholder, User và routes nền tảng. | **PARTIAL** — giới hạn scope phụ thuộc commit lịch sử và inspection; không có assertion bao trùm absence. Challenge/journal tồn tại ở audit HEAD theo các Story sau, không dùng chúng để tạo false finding cho AC foundation. |

### Story 1.2 — 4 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.2-AC1 — S12:19: owner login, redirect đích và không public signup | backend/tests/Feature/OwnerAuthenticationTest.php:29–58 assert authenticated owner, regenerated session, redirect và unsafe redirect fallback; :134–140 registration/reset404. frontend/src/__tests__/App.spec.ts:45–54 assert guest sign-in/no signup/private nav hidden. tests/e2e/cross-device-sync.spec.ts:10–15 login bằng form, require /today trước hành trình persisted resource. | **COVERED** — source có actual login integration và UI affordance; không dùng credentials fixture làm secret thật. |
| 1.2-AC2 — S12:20: private data không hiện cho guest/expired/unauthorized | OwnerAuthenticationTest.php:61–114 assert rejected non-owner/guest, private no-store và owner session. frontend/src/router/__tests__/router.spec.ts:23–31 guest deep-link, :55–84 expired account→login/quarantine draft; frontend/src/stores/__tests__/auth.spec.ts:67–106 assert reset generations/reasons. | **PARTIAL** — API privacy nominal được assert. E-05 (PLAUSIBLE) mô tả private RouterView/form còn hiện sau expiry; E-06 (PLAUSIBLE) mô tả rejected refresh giữ loading/stopped coordinator. Các test router/store không chứng minh full-App rendering ở hai đường này; tham chiếu E-findings.json, không tạo ID A trùng root. |
| 1.2-AC3 — S12:21: logout clear private caches và Back không khôi phục private view | OwnerAuthenticationTest.php:117–131 logout204, guest, session/token rotation. frontend/src/stores/__tests__/auth.spec.ts:14–46 assert late session callback không restore/cache clear; :49–64 failed logout giữ state. App.spec.ts:319–355 assert confirmed logout clear draft/cache và route login. tests/e2e/routing.spec.ts:34–68 mocked auth/logout, goBack và require login/no private notes. | **COVERED** — browser Back source dùng response stubs; BE logout semantics được kiểm riêng, không gán mocked test là persistence acceptance. |
| 1.2-AC4 — S12:22: private navigation theo approved information architecture | frontend/src/__tests__/App.spec.ts:58–76 assert thứ tự Today/Challenge/Notes/Calendar/Settings và aria-expanded. tests/e2e/responsive.spec.ts:24–36 assert không overflow và mobile nav toggle. | **COVERED** — assert UI/navigation trực tiếp, không suy diễn rằng nội dung business của các route placeholder đã hoàn tất. |

### Story 1.3 — 3 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.3-AC1 — S13:19: cùng account date/week ở mọi client quanh boundary | backend/tests/Unit/AccountTimeContextTest.php:7–37 assert last-second-Sunday/first-second-Monday UTC với server LA, exact account Ho_Chi_Minh/date/week. backend/tests/Feature/AccountContextTest.php:25–62 assert request timezone/query không đổi canonical account result. frontend/src/views/__tests__/account-time.spec.ts:29–41 assert render canonical date/week. tests/e2e/account-time.spec.ts:4–27 dùng canonical account response stub; playwright.config.ts:20–29 dùng laptopLA/phoneTokyo. | **COVERED** — boundary thật nằm trong BE clock tests; E2E chứng minh rendering trên hai timezone nhưng stub account API, không phải full-stack boundary run. |
| 1.3-AC2 — S13:20: lấy một instant nhất quán cho date/week trong request | AccountTimeContextTest.php:40–60 assert changing clock chỉ được gọi một lần; AccountContextTest.php:25–62 assert one call/exact Sunday context dù clock có thể đổi sang Monday. | **COVERED** — trực tiếp assert capture-once invariant; không chỉ kiểm format. |
| 1.3-AC3 — S13:21: account timezone hiển thị read-only | frontend/src/views/__tests__/account-time.spec.ts:44–52 assert timezone text và không input/select/button. tests/e2e/account-time.spec.ts:33–34 assert settings read-only. AccountContextTest.php:25–62 reject client timezone override bằng expected canonical result. | **COVERED** — cả UI read-only và server source-of-truth có assertion. |

### Story 1.4 — 4 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.4-AC1 — S14:29–34: mutation revision tăng đúng một lần, device còn lại converge resource thật | backend/tests/Feature/Story14IntegrationSeamTest.php:148–250 assert revision với create/update/no-op/replay/invalid/stale/fence/epoch. frontend/src/stores/__tests__/sync.spec.ts:328–369 dùng actual QueryObserver và assert updated journal data khi revision tăng. tests/e2e/cross-device-sync.spec.ts:37–96 hai authenticated contexts create/update Challenge, assert PostgreSQL revision1/2 và B converge. | **PARTIAL** — nominal convergence được assert. E-03 CONFIRMED: timer poll và foreground reconcile không chung single-flight, cho synced/allowed khi dữ liệu chưa converge; missing interleaving không được covered bởi test chỉ gọi reconcile() hai lần tại sync.spec.ts:540–575. |
| 1.4-AC2 — S14:36–41: hidden/offline/logout pause và không báo synced sai | sync.spec.ts:457–535 assert stop polling hidden/offline/logout/expiry; cross-device-sync.spec.ts:123–179 simulate visibility, assert poll count không tăng, offline không synced, online converge và logout không poll. | **PARTIAL** — E-07 PLAUSIBLE: late GET rejection chỉ auth-fenced có thể đổi paused/newer state thành error. Tests nominal pause không assert reject-after-offline/hidden ordering. |
| 1.4-AC3 — S14:43–47: focus/reconnect reconcile trước write, serialize và fail closed | sync.spec.ts:540–575 assert two direct reconcile callers dùng một request; :580–638 assert failed preflight/cached context/offline/hidden không được write. cross-device-sync.spec.ts:185–212 đổi account write state thành locked trong DB trước submit và require UI blocked alert. | **PARTIAL** — E-03 CONFIRMED: direct reconcile concurrency test bỏ timer-origin request; preflight có thể allowed sớm trên equal revision trong actual race. |
| 1.4-AC4 — S14:49–54: sync failure actionable, giữ last good data và recovery | sync.spec.ts:739–782 assert failed refetch giữ convergence debt và equal-revision retry; :854–941 assert bounded backoff/manual retry/QueryObserver last-good cache. cross-device-sync.spec.ts:219–268 inject GET failure, assert existing list/actionable Retry rồi recover. | **PARTIAL** — E-03 CONFIRMED và E-06/E-07 PLAUSIBLE giữ khoảng trống recovery/interleaving; nominal retry assertions chưa chứng minh rejected refresh-session và late error fencing. |

### Story 1.5 — 4 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.5-AC1 — S15:22: saving/saved/error trung thực trên persisted journal resource | frontend/src/views/__tests__/journal.spec.ts:151–164 assert typed save và saved; :251–264 assert saving/dirty; :352–405 assert network error/retry và commit ACK vẫn saved khi query convergence lỗi, gõ mới thành dirty. tests/e2e/content-conflict.spec.ts:16–23 require successful PUT rồi saved UI; :71–88 đối chiếu persisted journal/revision/completion facts. | **COVERED** — phân biệt mutation ACK với account convergence; không hoàn tất Notes/NFR004 mọi domain (S15:47). |
| 1.5-AC2 — S15:23: loss network giữ memory draft và retry | journal.spec.ts:272–298 assert per-resource memory/remount; :352–377 assert draft giữ nguyên/error rồi exact equal retry command. frontend/src/views/__tests__/journal-draft-lifecycle.spec.ts:107–206 simulate committed-but-lost response, immutable retry cũ trước command mới, retained draft qua unmount/remount. backend/tests/Feature/ChallengeJournalTest.php:229–243 assert exact replay không thêm revision/ledger và UUID reuse khác payload bị reject. | **COVERED** — lifecycle FE test dùng mock server map, không phải reload persistence. Không yêu cầu draft sống qua reload vì S15:16 giới hạn memory/tab scope. |
| 1.5-AC3 — S15:24: late ACK không overwrite typing mới hoặc nhận vơ latest saved | journal.spec.ts:233–269 defer ACK revision1, gõ revision2, require dirty/new text rồi second save; :327–349 normal save ACK của A khi editor chuyển B giữ B draft/status. journal-draft-lifecycle.spec.ts:107–206 lost response/new typing/retry exact payload. | **COVERED** — đây là normal journal save; conflict resolution thuộc Story1.6 và các lỗi E-01/E-02 được gắn ở 1.6-AC3, không mở ID A khác cho cùng root. |
| 1.5-AC4 — S15:25: dirty unload/logout warning và clear sau successful logout | frontend/src/__tests__/App.spec.ts:80–110 dispatch jsdom beforeunload Event, assert defaultPrevented/listener cleanup; :209–235 clean không warning; :238–355 assert cancel/pending/failure/success logout preserve-or-clear theo outcome. S15:37, :70–71 yêu cầu real browser unload/logout acceptance. D-verification-finalization-repair.json:226–289 chỉ có unit/build/contract và NOT_RUN/INCOMPLETE disclosures. RO rg beforeunload/runBeforeUnload/page reload trong tests/e2e *.spec.ts: exit 1/no match. | **PARTIAL — A-02 HIGH NEEDS_HUMAN_DECISION.** Có synthetic/unit assertion, thiếu native browser unload evidence đã được yêu cầu. [H] Chưa biết browser/platform thật hiển thị warning đúng; không khẳng định đã xảy ra mất draft. |

### Story 1.6 — 4 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 1.6-AC1 — S16:26: stale version → typed conflict, snapshot đúng, không mutate | backend/tests/Feature/ChallengeJournalTest.php:170–226 assert stale/snapshot changed again typed conflict, persisted row/revision/ledger unchanged; ChallengeJournalApiTest.php:92–115 assert real HTTP409 shape/state. tests/e2e/content-conflict.spec.ts:51–60 assert actual PUT409, typed resource/day/version and equal PostgreSQL before/after. | **COVERED** — conflict signal và side-effect invariants được assert thực chất. |
| 1.6-AC2 — S16:27: cả saved/local text đọc đầy đủ, không chọn mặc định và chỉ resolve sau explicit choice | frontend/src/components/__tests__/ContentConflictDialog.spec.ts:28–59 assert full text/labels/no default choice/confirm disabled/reset on version change. journal.spec.ts:180–230 assert keep draft đến explicit server choice. content-conflict.spec.ts:92–119 require both texts/radios none/choice payload, :126–160 refreshed409 bắt new choice, Escape giữ local. | **COVERED** — nominal decision UX/state có assertion, kể cả repeated conflict. |
| 1.6-AC3 — S16:28: chosen result được lưu và converge hai device | content-conflict.spec.ts:92–119 assert both local/server choice payload, persisted result, A/B converge/no reload; :166–196 real server commit rồi abort response, same-command retry không mutate hai lần. journal-draft-lifecycle.spec.ts:209–269 assert typing mới khi resolve pending giữ dirty; :298–344 retry resolution khi revision không đổi. | **PARTIAL** — E-01 CONFIRMED: resolve ACK của A ghi vào current query key B; E-02 CONFIRMED: sau lost resolve response và typing mới, UI revision2 không retry pending revision1 (store-only direct-save assertion không chứng minh UI); E-03 CONFIRMED ảnh hưởng convergence. Nominal E2E không phủ các interleaving này. |
| 1.6-AC4 — S16:29: keyboard/touch/screen reader, focus/labels/scroll/focus return | ContentConflictDialog.spec.ts:62–147 assert close/Escape/focus reset/announcements/IME/return. content-conflict.spec.ts:202–246 assert accessible description/full plain text/focus trap/Escape-return/touch/320px+200% scroll/no overflow; :240 nêu không claim manual AT. S16:41–42 yêu cầu actual screen-reader platform/browser/AT; receipts/story-1-6/E-verification.json:228 ghi manual_screen_reader NOT_RUN. | **PARTIAL — A-01 HIGH NEEDS_HUMAN_DECISION.** Keyboard/touch/semantics coverage có; actual AT evidence thiếu. S16:100 gọi COVERED bằng fallback chưa chứng minh toàn bộ conjunctive AC. Historical approval có disclosures, không kết luận approval giả. |

### Story 2.1 — 3 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 2.1-AC1 — S21:28: create challenge name/optional description/start today/target 1–7 | backend/tests/Feature/ChallengeApiTest.php:47–95 assert actual account clock start_date, name/description/target, account_revision/row_version và list/detail read. frontend/src/views/__tests__/challenges.spec.ts:82–106 assert create UI không date/weekdays picker. tests/e2e/challenges.spec.ts:141–161, :180–182 assert browser create/details với API stubs. cross-device-sync.spec.ts:60–82 bổ sung real persisted create/convergence. | **COVERED** — không coi mocked Challenge browser flow là DB persistence; persisted seam có test nguồn riêng. |
| 2.1-AC2 — S21:32: invalid target/name field error, giữ input và không create | ChallengeApiTest.php:98–142 assert 8/0/3.5 và blank name422, DBcount0; :186–219 reject unsupported fields. challenges.spec.ts:109–139 assert invalid9/name retained/no API. tests/e2e/challenges.spec.ts:168–172 assert field error/input retained. | **COVERED** — positive/negative both UI và API; không chỉ giới hạn input element. |
| 2.1-AC3 — S21:36: metadata edits đúng challenge, giữ start/target/history facts | ChallengeApiTest.php:145–183 assert name/description, unchanged start/target/target-period, row/revision increments. backend/tests/Feature/ChallengeUseCasesTest.php:190–239 assert persisted metadata và target periods untouched. challenges.spec.ts:142–210 assert selected ID/baseVersion/no fact editors; e2e/challenges.spec.ts:189–204 assert edit/no fact pickers/preserved facts bằng mocked transport. | **PARTIAL** — E-04 CRITICAL CONFIRMED: selected ID thay đổi trong await preflight có thể gửi metadata A sang B. Existing selected-ID assertion dùng stable selection; thiếu swap-during-preflight path. Không tạo A finding trùng E-04. |

### Story 2.3 — 3 AC

| AC và intent [F] | BE / FE / E2E evidence [F] | Coverage [I] và giới hạn |
|---|---|---|
| 2.3-AC1 — S23:27: read/create/edit journal theo đúng challenge và account day | ChallengeJournalTest.php:72–88 assert owner/challenge/day/text/version trong DB; :137–167 reject invalid day/foreign owner/no revision. ChallengeJournalApiTest.php:60–75 actual HTTP save/read; :118–134 guest/foreign/not-found/invalid date. journal.spec.ts:119–164 assert selected ID/account day/optional editor/existing text/typed journal version/save. content-conflict.spec.ts:26–44, :71–88 tạo challenge và saved journal qua actual APIs/DB helper. | **COVERED** — assert identity/day/persistence; không phát minh maxlength/delete requirement. |
| 2.3-AC2 — S23:28: journal không tự Done hay tăng progress; Done không cần journal | ChallengeJournalTest.php:72–88 assert is_done=false/completion_version0/donecount0 và challenge row không đổi khi create journal; :91–114 fixture is_done=true/completion_version4 được journal edit giữ nguyên. journal.spec.ts:151–164 assert payload không có completion/is_done. content-conflict.spec.ts:71–88 assert persisted is_done=false/completion_version0 sau save. | **COVERED** trong journal-owned behavior — negative Done facts và optional journal có assertion. Actual Done command/current-week progress projection thuộc 2.2 (epics.md:327–339), chưa được claim hoàn tất. |
| 2.3-AC3 — S23:29: component completion/journal độc lập, đổi một không mất thành phần kia và không false conflict | ChallengeJournalTest.php:91–114 journal edit giữ completion fixture; :117–134 direct DB completion update rồi journal command base_version cũ vẫn thành công. ChallengeJournalApiTest.php:77–89 cũng direct DB completion update rồi PUT journal, assert completion preserved. frontend payload-only assertion tại journal.spec.ts:151–164. backend/routes/api.php:21–43 chưa có completion/Done mutation route. | **PARTIAL — A-03 MEDIUM SPEC_AMBIGUITY.** Hiện có journal-direction và completion-fixture evidence. Chưa chứng minh reverse direction bằng production Done consumer. Dependency chỉ 2.1: không đòi implement 2.2 để hợp thức hóa thứ tự 2.3; cần BMAD định nghĩa acceptance split và consumer check tương lai. |

## Dependency 2.3 → 2.1 và backlog 2.2

[F] docs/product/epics.md:345 và S23:19–20 định nghĩa 2.3 cần 2.1/auth/time nền tảng; docs/product/epics.md:327–329 đặt Done/current-week progress vào 2.2. sprint-status.yaml:48–50 ghi 2.1 done, 2.2 backlog, 2.3 done. S15:45–46 và S16:49 còn nêu rõ không cần chờ 2.2.

[I] Không có finding “dependency 2.2 thiếu nên 2.3 không được done”. Điểm cần quyết định ở A-03 là mức bằng chứng mà AC3 đang bao hàm: producer journal đã giữ completion field; production completion consumer của Story sau chưa có để kiểm chiều ngược. Việc sửa acceptance wording/track consumer evidence phải qua BMAD/human, không tự thêm dependency.

[F] ChallengeJournalTest.php:117–134 và ChallengeJournalApiTest.php:77–89 dùng DB update trực tiếp, không gọi production Done use case. [I] Do đó test “completion-only changes…” chứng minh journal-version conflict independence, không chứng minh future completion implementation giữ journal.

## Sprint key, filename và consumer

| Story | Sprint key / actual filename [F] | V4 consumer [F] | Kết luận [I] |
|---|---|---|---|
| 1.5 | sprint-status.yaml:43 có dấu; S15 filename không dấu. story-1-5-plan.md:5 dùng actual filename; :10 dùng accented sprint_key. | .agents/scripts/v4-separated-plan.mjs:169 đọc safePath(plan.story.path); .agents/scripts/complete-story.mjs:40–46, :183 đọc/rewrite path; :186 update sprint theo key. | Path và lifecycle key được tách rõ; không có current V4 pipeline failure chỉ từ chênh dấu. |
| 1.6 | sprint-status.yaml:44 có dấu; S16 filename không dấu. story-1-6-plan.md:5 actual path; :10 sprint_key. | Cùng path/key consumers trên. .agents/scripts/check-story-plan.mjs:174–188 kiểm exact sprint key, không suy filename từ key cho schema-v2 Plan path. | Candidate “key không khớp file nên lifecycle hỏng” là A-04 INFO FALSE_POSITIVE. |

[F] Legacy sprint helper .agents/skills/bmad-sprint-planning/scripts/sprint_plan.py:269–280 chỉ nâng ready-for-dev nếu filename đúng key.md; :280 merge existing status nên current done entries được giữ. [I] Heuristic này là watchpoint nếu tương lai dựng sprint từ absent/backlog entries mà không có ID/path mapping; WS-A không chạy helper, không chứng minh current failure và không đề nghị rename hàng loạt Story.

## Plan, receipts và historical Human Gate

[F] Schema-v2 Plans tồn tại cho 1.5/1.6/2.3 (rg --files _bmad-output/implementation-artifacts -g story-*-plan.md: exit 0). Từng Plan:2 là schema_version2; :11–12 là lifecycle_snapshot done/execution_status complete, next_action null tại dòng cuối YAML. Story 1.1–1.4/2.1 thuộc lịch sử trước tách Plan; S21:94 nêu no-plan-required. [I] Không dùng thiếu schema-v2 Plan cho các Story lịch sử để tạo obligation hồi tố.

| Story | Plan / finalization facts [F] | Human approval được ghi trong Plan [F] | Kết luận [I] |
|---|---|---|---|
| 1.5 | story-1-5-plan.md:175–182 finalization SATISFIED_WITH_DISCLOSURES; :32 onward bốn slices reviewed. receipts/story-1-5/finalization.json:19–21 disposition có disclosures, finalization target review. | Plan:183–199 human APPROVED ngày 2026-09-28, approved_review_head cc018ac3092bf9c2886165f3a60c35dc0607c8bd, disclosures_acknowledged true; :200 next_action null. | Finalization review là bước trước human complete, không phải mâu thuẫn với done sau đó. Native unload evidence vẫn PARTIAL (A-02), không phủ nhận recorded approval. |
| 1.6 | story-1-6-plan.md:277–284 finalization SATISFIED_WITH_DISCLOSURES; five slices reviewed; receipts/story-1-6/E-verification.json:228 manual AT NOT_RUN. | Plan:285–301 human APPROVED ngày 2026-10-05, approved_review_head 84140b3888aa08adb022df9c196cbd069a93104c, disclosures_acknowledged true; :302 next_action null. | Historical completion/disclosures có record đồng bộ; automated fallback không chứng minh actual screen reader AC4 (A-01). |
| 2.3 | story-2-3-plan.md:142–149 finalization SATISFIED_WITH_DISCLOSURES; four slices reviewed. receipts/story-2-3/finalization.json:19–21 finalization target review. | Plan:150–166 human APPROVED ngày 2026-09-26, approved_review_head c56ad3be86501ec09fcf42accd4c7ef019099ba4, disclosures_acknowledged true; :167 next_action null. | Lifecycle nhất quán; ambiguous breadth of AC3 được ghi A-03, không dựng giả định thiếu Human Gate. |

[F] RO Node probe (node --input-type=module qua stdin; chỉ fs.readFileSync, crypto và git cat-file -t; exit 0) kiểm các path/digest trong ba Plans: 1.5 có 12 receipt references, 1.6 có 16, 2.3 có 12; tất cả 40 đều khớp stable-key semantic JSON sha256. Ba finalization receipt digests khớp Plan và Human approval; scope_paths_digest/implementation_commit_set_digest/final_scoped_tree_digest khớp cả ba nguồn. Tất cả 13 slice summaries reviewed/progression_eligible=true. 39 unique Git objects được Plan tham chiếu đều tồn tại: 34 commit, 5 tree. [I] Đây là integrity/consistency evidence của artifact lịch sử, không phải fresh product verification và không phải external xác thực danh tính người approve.

[F] Ba finalization semantic digests đã kiểm:

- 1.5: sha256:e548bb55756743d318210f297cce00d08e079f3eb9cf2358a2a2176c2c5585ba (Plan:177).
- 1.6: sha256:738e384271a9bcc65861b117d213c2be318079c0830522b1aae388e35bea88ca (Plan:279).
- 2.3: sha256:742915682e8c82ac79939b2594b10d0823880659c99ff5a8197d3e8fb9034847 (Plan:144).

[F] git show --stat các terminal completion commits (exit 0) chỉ chứa đúng Story, Plan và sprint-status.yaml: 1.5 c7c8eb4ca634f21bdc4ddeb928affe4610863782; 1.6 30778c73443601286d7e8d048b6edaa1c52690dc; 2.3 90007d6f064ab975aaec39d8541132cdde2b6344. S14:181 ghi exact implementation f9ff613e2039436b57cb05355bba34c88381354a được human approve; S21:128 ghi exact scope 428cc671bd95a1ac9962812f1ffbd0bd39eff8bd; S12:146 ghi human approval sau đoạn review chronology tại :138.

[I] Không có finding lifecycle done-vs-receipt inconsistency được xác nhận từ các nguồn trên. Các task checklist/planning seeds hoặc “canonical INCOMPLETE” được giữ làm disclosure lịch sử, không đọc thành fake approval hoặc runtime PASS. Bằng chứng AT/native unload còn thiếu được nêu độc lập vì toàn AC cần nhiều hơn unit fallback.

## Findings và khử trùng lặp

| ID | Severity / classification / verification | Kết luận [I] từ evidence [F] |
|---|---|---|
| A-01 | HIGH / NEEDS_HUMAN_DECISION / CONFIRMED | 1.6-AC4 yêu cầu actual screen reader; manual_screen_reader NOT_RUN. Có keyboard/touch/semantic tests và historical disclosed approval. Cần manual AT evidence/decision rõ về obligation. |
| A-02 | HIGH / NEEDS_HUMAN_DECISION / CONFIRMED | 1.5-AC4 yêu cầu real native unload evidence; chỉ có synthetic/unit fallback hiện được tìm thấy. Lead có thể gom A-02 vào A-01 ở consolidated report vì cùng root thiếu nghĩa vụ manual/browser evidence; A-02.related_prior_finding=A-01 giữ trace từng AC. |
| A-03 | MEDIUM / SPEC_AMBIGUITY / CONFIRMED | 2.3-AC3 chỉ kiểm production journal direction với completion fixtures; dependency không đòi 2.2. BMAD cần chốt acceptance split và giao reverse consumer evidence cho 2.2. |
| A-04 | INFO / FALSE_POSITIVE / CONFIRMED | Chênh dấu key/filename đã được Plan.story.path + sprint_key xử lý đúng. Legacy exact-filename heuristic là watchpoint, không chứng minh current pipeline lỗi. |

[F] E-findings.json đã ghi E-01/E-02/E-03/E-04 CONFIRMED và E-05/E-06/E-07 PLAUSIBLE; các AC liên quan được gắn PARTIAL trong ma trận. [I] Không cấp ID A mới cho late resolve ACK, immutable-resolution retry, timer/preflight race, wrong-selected-challenge write hoặc auth rendering/recovery vì cùng root đã có WS-E owner. A-01/A-02 đã gửi early cho Lead; Lead độc lập đọc lại Story1.6:29/:41/E-verification:228 và Story1.5:25/:37/:70–71/App.spec.ts:80–110/E2E absence, xác nhận evidence gaps.

## Lệnh audit chỉ đọc và giới hạn kiểm chứng

| Lệnh/check chạy tại worktree [F] | Exit/result [F] | Ý nghĩa [I] |
|---|---|---|
| git rev-parse HEAD; git status --short --branch | 0; HEAD/branch như phần đầu; untracked files nằm trong audit output | Xác định snapshot; WS-A không commit hoặc đổi tracked files. |
| git ls-tree -r --name-only 7cbfa9ea210fa3b1bf20a6f1c7a0d975a7cbe04c frontend/src backend/app backend/routes | 0; foundation controller/view/routes/placeholders | Historical stage evidence cho 1.1, không phải exhaustive negative test. |
| rg -n 'beforeunload\|runBeforeUnload\|page\.reload\|pageA\.reload\|pageB\.reload' tests/e2e -g '*.spec.ts' | 1; không có match | Không thấy native unload/page-reload assertions trong E2E spec inventory. Không chạy trình duyệt. |
| Test-Path frontend/node_modules; Test-Path backend/vendor/autoload.php; Test-Path tests/e2e/node_modules | 0; false/false/false | Runtime suites WS-A NOT_RUN/ENV. |
| node --input-type=module (RO digest/object probe) | 0; receiptRefs12/16/12, failures[], finalDigestMatches=true, scopeMatches=true, objects39/types34commit5tree/unavailable[] | Stable-key JSON digest và Git-object existence; không import Runner/action modules. |
| git show --stat c7c8eb4ca634f21bdc4ddeb928affe4610863782; git show --stat 30778c73443601286d7e8d048b6edaa1c52690dc; git show --stat 90007d6f064ab975aaec39d8541132cdde2b6344 | 0; ba lifecycle files mỗi commit | Historical completion commit scope. |

[F] Digest probe dùng JSON.parse rồi đệ quy sort object keys, giữ array order, JSON.stringify và SHA256; không dùng raw file-byte hash. Object probe dùng git cat-file -t, chấp nhận cả commit và tree theo actual type. [I] Những khác biệt raw-byte formatting hoặc SHA tree không phải missing commit/integrity findings.

[H] Actual browser-native unload/close warning và actual screen-reader experience còn chưa được WS-A kiểm chứng; runtime performance, real cross-device timing/races và backend persisted execution ở audit HEAD phụ thuộc baseline/verification của Lead. Không có tuyên bố product PASS từ workstream này.
