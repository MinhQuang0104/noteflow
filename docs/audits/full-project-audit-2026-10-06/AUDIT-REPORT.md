# Full project audit — NoteFlow tại98def53

[F] Lead: Codex, ngày2026-10-06. Worktree `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`; branch `audit/full-project-2026-10-06`; checkout trước audit `03dbd098e36245f51a4b8e875e89c1c0bb21acc6`. Code `98def5358983072216a28754e87b1cd5f884d258`; commit03dbd098 chỉ thêm AUDIT-PLAN. Bằng chứng preflight: [00-preflight.md](00-preflight.md). Audit chỉ ghi output trong thư mục này, không sửa source/Plan/receipt/runtime/policy.

[I] Tổng thể **🔴**: có hai đường rủi ro CRITICAL đã xác nhận bằng code/probe—ghi nhầm challenge khi selection đổi trong preflight, và thiếu guard DB test trên đường có destructive setup. Chưa có bằng chứng runtime đầy đủ cho frontend/backend/full stack ở worktree này. Ưu tiên DB safety, resource identity, sync/conflict/privacy và control-plane review/admission trước khi mở rộng writer của Story2.2.

[F] Hợp nhất42 candidates thành41 records: **2 CRITICAL,10 HIGH,26 MEDIUM,2 LOW,1 INFO**; **31 VALID,6 NEEDS_HUMAN_DECISION,3 SPEC_AMBIGUITY,1 FALSE_POSITIVE**. A-02 gộp vào A-01; không nhân finding E bằng WS-B/F coverage gaps. Tất cả12 merged HIGH/CRITICAL có cross-check độc lập, giữ đúng giới hạn [03-cross-verification.md](03-cross-verification.md). CONFIRMED là cơ chế/evidence gap đã chứng minh trong phạm vi trace/probe; không phải toàn bộ browser/DB/AT đã PASS.

## Baseline B1–B15

[F] Command, cwd, elapsed, exit và tail30/full logs: [01-baseline-checks.md](01-baseline-checks.md), [baseline-status.json](baseline-status.json). Exit dưới đây là exit của attempt thật; NOT_RUN là check chưa thực thi đến test/tool chính. Lỗi khởi động không tự là test sản phẩm FAIL.

| Check | Trạng thái | Exit thật | Kết quả / giới hạn |
|---|---|---|---|
| B1 full V4 | PASS | 0 | 533 total:532pass,0fail,1Windows symlink skip;573.382s. Chạy HEAD03dbd098, không claim đã chạy exactcommit98def53. |
| B2 BMAD pytest | NOT_RUN/ENV | 1;retry1 | Bundled Python có, pytest thiếu. |
| B3 FE type | NOT_RUN/ENV | 1;retry1 | vue-tsc thiếu. |
| B4 FE lint | NOT_RUN/ENV | 1;retry1 | run-s thiếu; oxlint/eslint chưa chạy. |
| B5 FE unit | NOT_RUN/ENV | 1;retry1 | Vitest chưa có; no-install/offline retry không có cache; coverage không đo. |
| B6 FE build | NOT_RUN/ENV | 1;retry1 | Vite thiếu. |
| B7 contract lint | NOT_RUN/ENV | 1;retry1 | redocly thiếu. |
| B8 contract drift | NOT_RUN/ENV + READ_ONLY_CONFLICT | check1;retry1;proof— | yaml thiếu; proof cố ý ghi/restores tracked OpenAPI nên không gọi (script:15,25). |
| B9 backend test | NOT_RUN/ENV | 255;correct-cwd retry255 | vendor/autoload thiếu; không Pest case nào chạy. F-00 HIGH theo plan:92. |
| B10 backend static | NOT_RUN/ENV | 1;correct-cwd retry1 | phpstan thiếu. |
| B11 backend style | NOT_RUN/ENV | 1;correct-cwd retry1 | pint thiếu. |
| B12 E2E helpers | PASS | 0 | Runner node --test tương ứng;6/6 helpers, không DB/browser. |
| B13 dependency audit | NOT_RUN/ENV, PARTIAL | FE1;E2E0;Composer0(SKIP);locked100 | E2E --omit=dev scope0production packages; Composer không installed packages; FE/locked advisory endpoint bị network denial. Không kết luận whole dependencies an toàn. |
| B14 Git hygiene | PASS | 0/0/0 | Diff whitespace, tracked-ignore, >=1MiB scan đều sạch;635tracked paths gồm plan. |
| B15 verify-local | NOT_RUN/WORKTREE_GUARD | — | Không gọi worktree/canonical, không bypass guard. |

[F] Retry backend từng có sai cwd ở audit wrapper; log lỗi giữ lại nhưng loại khỏi backend evidence. Correct absolute cwd attempts và quy tắc chỉ-audit-writes được ghi trong baseline/preflight. Không cài node_modules/vendor/copy.env vì user chỉ cho phép ghi audit output. HostPHP8.5.9 khác documentedPHP8.4; không coi thiếu-runtime checks đã verified compatibility.

[F] Khi đóng gói, stdout npm/Composer có khoảng trắng margin làm staged diff-check exit2. Bản văn bản được chuẩn hoá riêng khoảng trắng cuối dòng/EOF; log bị thay định dạng có bản `.log.raw.gz` giữ nguyên byte gốc và SHA256 trong [packaging-whitespace.json](logs/packaging-whitespace.json). Không bỏ output hay thay exit evidence; AUDIT-PLAN/source không được formatter ghi.

## Sức khoẻ từng khu vực

[I] Màu là đánh giá của Lead theo evidence, không phải deterministic PASS.

| WS | Sức khoẻ | Căn cứ [F] / nhận định [I] |
|---|---|---|
| A Requirements/Story/Test | 🔴 | Ma trận31AC:19COVERED/12PARTIAL theo source/history, không fresh runtimePass; missing native-unload/manualAT evidence ở ACdone. Human approval lịch sử disclosed, không coi approval giả. [A-traceability.md](A-traceability.md) |
| B Architecture | 🟡 | Layering/clock/use-case transaction và ownership server có; AD-8/AD-14 vi phạm theo E-03/E-05. Chưa có finding kiến trúc riêng trùng root cause. [B-architecture.md](B-architecture.md) |
| C Backend | 🟡 | Owner/rowlock/ledger/time invariants có trace/test assertions; NUL/cast validation gaps và reprovision decision; B9–B11 chưa xác minh. [C-backend.md](C-backend.md) |
| D Contract | 🟡 | 11operations,46operation/status pairs;22 thiếu explicit contract cases; schema/generator/header guards yếu, không nói mọi current response sai. [D-contract.md](D-contract.md) |
| E Frontend | 🔴 | E-04 wrong-target write; ACK cache key, pending-resolution retry, poll convergence, session privateUI findings. [E-frontend.md](E-frontend.md) |
| F Testing | 🔴 | F-02 unsafe native DB selection/destructive setup; F-01 global parallel reset; B9 startup missing and E2E/realbrowser/AT evidence gaps. [F-testing.md](F-testing.md) |
| G Infra | 🟡 | Local127.0.0.1/test Compose identity có guard; image tags chưa digest-pinned, production edge header responsibility chưa rõ; live Docker check chưa chạy. [G-infra.md](G-infra.md) |
| H Control-plane | 🔴 | B1full xanh nhưng H-04risk downgrade/directhelper/overlap/trust gaps;3mapsSTALE;10/192definedproduct paths covered;context saving22.79%/22.75% dưới original30%criterion. [H-control-plane.md](H-control-plane.md) |
| I Repo/docs | 🟡 | Git hygiene sạch; README capability/timestamp cũ. Chỉ liệt kê branches/worktrees, không xoá. [I-repo-hygiene.md](I-repo-hygiene.md) |

## Top10 ưu tiên

[F] Mọi entry sau được Lead xác minh chéo; severity là đánh giá [I] theo rubric plan. Table xếp ưu tiên theo tác động, không thay toàn bộ41 records ở [findings.json](findings.json). H-01/F-00 cũng HIGH và vẫn nằm trong decision list/baseline.

| ID | Severity / classification | Cơ chế hoặc evidence gap | File:line [F] |
|---|---|---|---|
| E-04 | CRITICAL / VALID | Draft metadataA có thể gửi updateB khi đổi selection trong awaited preflight, row_version bằng nhau | frontend/src/views/ChallengesView.vue:394 |
| F-02 | CRITICAL / VALID | Native DB identity có thể kế thừa target ngoài test; concurrency setup delete toàn bảng chưa guard | backend/tests/Feature/ChallengeConcurrencyTest.php:17; backend/phpunit.xml:30 |
| E-03 | HIGH / VALID | Timer và foreground reconcile overlap, refetch fail có thể mất convergence debt và vẫn synced | frontend/src/stores/sync.ts:242 |
| E-01 | HIGH / VALID | ACK conflictA ghi snapshot vào query keyB sau switch editor | frontend/src/components/ChallengeJournalEditor.vue:164 |
| E-02 | HIGH / VALID | Gõ sau unknown resolution outcome đổi revision khiến current UI không replay pending command | frontend/src/stores/journalDrafts.ts:685 |
| E-05 | HIGH / VALID | Session expiry chuyển guest nhưng private route/form hiện tại vẫn có rendering path | frontend/src/components/AppShell.vue:188 |
| H-04 | HIGH / VALID | request.riskLOW override PlanHIGH/MEDIUM→NO_REVIEW→verified branch | .agents/scripts/v4-action-kernel.mjs:878 |
| H-03 | HIGH / VALID | Direct lifecycle helper path không enforce Runner admission/lock/journal | .agents/scripts/finalize-story.mjs:424 |
| H-02 | HIGH / VALID | V3 normal bootstrap không quan sát reservation StoryV4; loại trừ chỉ một chiều | .agents/scripts/v4-story-runner.mjs:61; .agents/policies/orchestration-v3.md:220 |
| A-01 | HIGH / NEEDS_HUMAN_DECISION | Story1.6AC4 manualAT NOT_RUN; Story1.5AC4 thiếu nativeunload evidence, vẫn có COVERED fallback | _bmad-output/implementation-artifacts/receipts/story-1-6/E-verification.json:228; frontend/src/__tests__/App.spec.ts:103 |

[H] DB thật/credential/reachability không được thử; audit không gây hay quan sát việc xoá DB. [F] F-02 config/destructive call path được đối chiếu bởi hai reviewers và pure probes; Compose/CI explicit environment là counterevidence có phạm vi. Laravel URL merge được đọc tại [pinned framework source](https://raw.githubusercontent.com/laravel/framework/cdd8b33c246719acdd118c705ce8c7ab5ef48a96/src/Illuminate/Support/ConfigurationUrlParser.php); PHPUnit nonforce behavior tham chiếu [official XML docs13.4](https://docs.phpunit.de/en/13.4/xml-configuration-file.html#the-env-element), exact13.3.3 runtime chưa chạy. Không có blanket statement test helper guard hiện có bị vô hiệu: PDO helper vẫn pin noteflow_test, app/test harness là boundary khác.

## NEEDS_HUMAN_DECISION

[F] Sáu records có classification này trong merged JSON; quyết định đề nghị sau là [I].

- A-01 HIGH: thu manual screen-reader + native dirty/clean unload/logout evidence hoặc formal disposition nghĩa vụ AC; giữ lịch sử disclosed approvals và NOT_RUN.
- F-00 HIGH: chọn môi trường dependency/runtime verification được phép và có DB isolation để lấy B9–B11/full-stack evidence còn thiếu.
- H-01 HIGH: chọn mức assurance cho Human Gate: trusted conversation/caller hay actor approval evidence ngoài quyền ghi metadata của agent.
- C-05 MEDIUM: định nghĩa dataset/ledger/revision/epoch khi reprovisionA→B→A; không tự chọn xoá hoặc giữ dữ liệu.
- G-01 MEDIUM: xác định production edge nào sở hữu TLS/CSP/frame/HSTS và acceptance response check.
- H-10 MEDIUM: whole-worktree clean hay scope clean cho metadata/pending guards; giữ immutable authority/fingerprint protection khi lựa chọn.

[F] Ba SPEC_AMBIGUITY là A-03 (completion↔journal evidence), C-04 (journal whitespace/TrimStrings), D-04 (CSRF contract scope). [I] Cần disposition riêng nếu sửa dựa vào expected behavior. Các prior OPEN policy ambiguities (gate wording, lightweight lane, invocation boundary, upstream rebind) vẫn được ghi trong prior/backlog, không mặc định authorize workflow mới.

## Trước Story2.2 và bàn giao

[F] epics.md:345 xác định2.3 phụ thuộc2.1; không bịa dependency2.3→2.2. [I] Completion2.2 sẽ thêm writer, nên ưu tiên DB safety R00, missing verification R01, resource/sync/conflict/privacy R02–R05. Nếu chọn V4, risk/admission R08 và map/recipe freshness R10 cần disposition phù hợp trước execution. Tất cả gói có lane/risk/dependencies/checks ở [remediation-backlog.md](remediation-backlog.md); không gói nào được audit tự thực thi.

[F] [prior-findings-status.md](prior-findings-status.md) phủ35/35 finding cũ:16OPEN,9PARTIAL,10RESOLVED. Fix mất branch F-02, receipt versioning F-01 và các incident recovery F-03 đã RESOLVED theo exact scope + ancestry/test evidence. Không reopen resolved defect chỉ vì một scenario mới ở boundary gần đó. Completion artifact CLI không chạy do temp-clone write; report chỉ dùng source/regression/pure evidence đúng phạm vi.

[I] Người dùng review báo cáo và chọn backlog/lane; chạy `scripts/verify-local.ps1` từ **canonical tại source tương đương**, dùng isolated Compose lane theo runbook rồi ghi exactSHA/exit/log vào phụ lục của lượt review sau. Không chạy native destructive tests với inherited DB chưa kiểm tra. Cần cung cấp manualAT/native-browser evidence và decisions ở trên để khép nghiệm thu còn thiếu.

## Checklist mục8 và evidence đóng gói

- [x] [F] PointerIDLE có thời điểm; path/branch/code+checkoutSHA ghi ở00-preflight. Pointer được đọc lại trước commit trong logs/precommit-verification.json.
- [x] [F] B1–B14 có trạng thái/actual attempt exits; B15NOT_RUN/WORKTREE_GUARD; unexecuted proof/B15 không bịa exit/PASS.
- [x] [F] A–I đều có report, kể cả WS-B không newunique finding.
- [x] [F] Tất cả12 merged HIGH/CRITICAL và A-02 trước dedupe có Lead cross-check;03-cross-verification+logs.
- [x] [F] prior report đủ35finding cũ và fix/test/source bounds.
- [x] [F] BacklogR00–R15 có lane/risk/check/dependency; không thực thi bản sửa.
- [ ] [I] Khâu hậu kiểm sau commit: đúng **một** commit mới từ03dbd098, message `docs(audit): full project audit at 98def53`, chỉ thư mục audit; gitshow/rev-list/status; không merge/push/xoá worktree. SHA và evidence hậu kiểm được ghi trong thông điệp bàn giao cuối vì một commit không thể tự chứa SHA của chính nó.

[F] [logs/precommit-verification.json](logs/precommit-verification.json) ghi source-byte inventory634 paths, pointer, status scope, artifact/schema/ref checks và prior coverage trước đóng gói. Việc chuẩn bị report không tự xác nhận thành công commit; Lead chỉ báo hoàn thành sau hậu kiểm actual commit. Không có hoạt động fix/Runner/Orca/AGY/V3/recovery được thực hiện trong audit.
