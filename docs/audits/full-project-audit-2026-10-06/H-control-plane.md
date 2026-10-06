# WS-H — Control-plane V4 Lite và quy trình agent

[F] Audit worktree `D:\Workspace\Tu_Hoc\New_Project_My_Note\.worktrees\full-project-audit`, branch `audit/full-project-2026-10-06`, HEAD `03dbd098e36245f51a4b8e875e89c1c0bb21acc6`; product/control-plane code baseline `98def5358983072216a28754e87b1cd5f884d258`. `git rev-parse HEAD`, `git branch --show-current`, `git diff --stat 98def53 HEAD -- .agents AGENTS.md CLAUDE.md package.json` exit 0, no code delta. Lead đã đọc canonical pointer IDLE trong preflight; WS-H không đọc thêm runtime, không gọi Runner/Orca/AGY/V3/recovery, không install, không sửa source/Plan/receipt/feature map.

[F] Static scope inventory ở `logs/H-static-inventory.json`: 99 tracked files trong các vùng yêu cầu, gồm 67 top-level `.agents/scripts/*.mjs` (34 test, 33 implementation), ba schema V3, context/router/features/recipes/policy và toàn bộ V4 Runner skill/actions/references. BMAD lock/menu và 54 Story receipts được enumerate riêng. Deep traces tập trung canonical verification/escalation/kernel, transaction/finalization/completion/Runner, context measurement và benchmark evidence contracts. Đây không phải runtime fault-injection hay product executor run.

## Kết quả và giới hạn

[F] B1 Lead chạy **full** `npm run test:v4` tại **03dbd098**, exit 0, 533 cases: 532 PASS, 0 FAIL, 1 SKIP, 573.38 s (`logs/B1.meta.json`, `logs/B1.log`). Source bằng 98def53 nhưng không claim suite đã chạy trên exact commit 98def53. B1 xanh không phủ bug caller risk downgrade vừa tìm được và không thay thế test admission/concurrency cho direct lifecycle helper.

[F] WS-H tạo 11 finding trong `H-findings.json`: 4 HIGH, 7 MEDIUM. H-01/H-10 cần human quyết định assurance/tradeoff; các defect source còn lại là VALID. [I] Không đủ cơ sở claim false `done` hay lạm dụng human approval thực tế; không có CRITICAL mới từ WS-H.

| ID | Severity / disposition | Kết luận và bằng chứng chính |
|---|---|---|
| H-01 | HIGH / NEEDS_HUMAN_DECISION | [F] `complete-story.mjs:298` tự tạo approval input; factory `check-story-completion.mjs:324` gán nhãn human. Pure factory probe exit0. [I] Scope binding không xác thực actor. |
| H-02 | HIGH / VALID | [F] V4 kiểm pointer V3 (`v4-story-runner.mjs:61`), V3 bootstrap không biết reservation V4 (`orchestration-v3.md:218`). [I] Cùng Story/path có thể bị hai lane tác động vì exclusion một chiều. |
| H-03 | HIGH / VALID | [F] Action docs vẫn chỉ direct lifecycle helpers; finalizer/completion thiếu pointer/checkout admission và normal transaction lock, reconcile thiếu lock/journal (`finalize-story.mjs:424`, `complete-story.mjs:294`, `reconcile-story-lifecycle.mjs:152`). [I] Direct entry bypass guards và concurrency safety của Runner. |
| H-04 | HIGH / VALID | [F] `riskLevel:878` ưu tiên request.risk; exact-source probe + actual escalation chọn NO_REVIEW khi Plan HIGH/MEDIUM nhưng request LOW. Actual verifySliceCore isolated branch chọn stub persistence; exit0. |
| H-05 | MEDIUM / VALID | [F] Shared-basis bytes hiện tại50461/50490 so65359 baseline, giảm22.79%/22.75%, thấp hơn criterion30%; eager compiler vẫn thêm control-plane/artifact contract. |
| H-06 | MEDIUM / VALID | [F] Registry chỉ phủ10/192 tracked product/config/test/deploy paths;182 uncovered. Canonical checker vẫn giữ INCOMPLETE/NOT_APPLICABLE. |
| H-07 | MEDIUM / VALID | [F] Cả ba enabled maps check + retry đều exit1 STALE trên baseline. Unexplained drift làm canonical incomplete rồi kernel block. |
| H-08 | MEDIUM / VALID | [F] CI không có root test:v4 job (`.github/workflows/ci.yml`), local B1 không thay CI enforcement. |
| H-09 | MEDIUM / VALID | [F] Runner CODES thiếu successful statuses; CLI không có operation/input; Plan read trước validate nên missing Plan trở thành ERROR (`v4-story-runner.mjs:33`, `:219`, `:394`, `:420`). |
| H-10 | MEDIUM / NEEDS_HUMAN_DECISION | [F] Whole-worktree clean và exact HEAD guard còn chặn unrelated docs (`v4-action-kernel.mjs:1072`, `:1079`). [I] Chọn scope clean phải preserve authority/index/hook safety. |
| H-11 | MEDIUM / VALID | [F] Amelia BD menu gọi legacy bmad-build cho Story;16 menu targets có8 unavailable tại current install. Root routing phải override menu. |

[F] Lead đã xác nhận độc lập source branches H-01/H-02/H-03 và H-04 source/risk/escalation probe; `node docs/audits/full-project-audit-2026-10-06/logs/crossverify-control-plane.mjs` exit 0 (`logs/phase3-control-plane-probes.meta.json`, `.log`). Cả bốn HIGH được xác nhận bằng source trace và probes ngoài runtime. `CONFIRMED` không có nghĩa đã thực thi durable Story action; H-04 persistence chỉ là stub trong isolated production branch. Disposition cross-review cuối thuộc báo cáo tổng của Lead.

## Fail-closed: check-verification, check-escalation, kernel

[F] `check-verification.mjs:352–383` reject empty/unsafe paths, invalid registry, unknown feature. Registry load `:165–177` reject duplicate enabled IDs/paths; map v2 separates covered paths khỏi dependencies (`:143–162`). Không applicable anchors trả `NOT_APPLICABLE`, `INCOMPLETE`, `complete:false`, `checks:[]` (`:368–374`). Map validators preserve raw STALE/error; cached checks bind cwd/argv/environment/subject (`:188–206`); aggregate checks keep FAIL/error và union coverage (`:306–349`). Không tìm được nhánh current enabled recipe trả PASS vì thiếu paths/evidence trong các traces đã kiểm.

[F] Safe pure probes trong `H-source-inspect.json`: no paths và traversal -> ERROR; unknown feature -> ERROR; backend routes, conflict dialog, toàn bộ migrations -> NOT_APPLICABLE/INCOMPLETE. Chỉ chọn **completely unanchored** paths: script có guard reject nếu path anchored nên không chạy recipe subprocess, build, contract proof hay product executor. CLI exit meaning dự kiến được ghi riêng; đây là API probes trong script exit0, không claim từng verification CLI đã chạy.

[F] Actual read-only `check-escalation.mjs` stdin probes trong `H-failclosed-probes.json`: missing/empty/conflicting evidence và unknown flags -> REVIEW_REQUIRED exit2; raw INCOMPLETE -> REVIEW_REQUIRED exit1; MEDIUM/HIGH complete PASS -> REVIEW_REQUIRED exit1; LOW clean control -> NO_REVIEW exit0. Check-escalation không ghi file và không đọc runtime.

[F] Kernel `runVerificationBundle:1116` rechecks manifest, binds checkpoint subject, validates focused execution evidence; unknown coverage reason block (`:1163`), known INCOMPLETE đòi semantic COVERED/evidence refs (`:1165`), mandatory escalation (`:1174`). Record-review validates fresh exact scope/answers/ordered evidence and rejects bad canonical/focused statuses (`:1529–1575`). `INCOMPLETE` stays raw in receipts/disclosures, không đổi PASS để progress.

[F] **H-04 exception**: `request.risk ?? plan.risk.level` ở `:879` cho caller hạ risk. `:987` dùng nó trong descriptor, `:1171` flags mặc định[], `:1498` chỉ xét descriptor LOW + escalation. Scenario: authoritative HIGH/MEDIUM Plan, clean completely mapped checkpoint, passing checks, request.risk LOW + flags[] -> no-review verified branch. Current finalization vẫn yêu cầu reviewed slices ở `check-story-finalization.mjs:825`, nên không claim completion bypass. Probe giữ tất cả mutations stubbed; full write-path regression cần migration authorization sau audit.

## Coverage registry và anchor freshness

[F] Universe được định nghĩa bằng toàn bộ Git-tracked paths dưới `frontend/`, `backend/`, `contracts/`, `tests/e2e/`, `deploy/`, `scripts/`, `.github/`, cộng `compose.local.yaml`/root `.env.example` nếu tracked. Không tính docs/control-plane/ignored dependencies. `git ls-files -z` exit0 trong H evidence; schema-v1 map effective coverage là anchors, schema-v2 là covered_paths. Định nghĩa này có cả product tests/config/deploy, không đồng nghĩa192 runtime source files.

| Vùng | Tracked paths | Uncovered |
|---|---:|---:|
| frontend | 60 | 50 |
| backend | 105 | 105 |
| contracts | 1 | 1 |
| tests/e2e | 16 | 16 |
| deploy | 6 | 6 |
| scripts | 2 | 2 |
| .github | 1 | 1 |
| Root compose | 1 | 1 |
| Tổng | **192** | **182** |

[F] Effective covered union10 paths: `frontend/src/router/index.ts`, `views/ChallengesView.vue`, `api/challenges.ts`, `views/__tests__/challenges.spec.ts`, `api/__tests__/challenges.spec.ts`, `components/ChallengeJournalEditor.vue`, `views/__tests__/journal.spec.ts`, `views/TodayView.vue`, `views/__tests__/today.spec.ts`, `views/__tests__/account-time.spec.ts` (prefix `frontend/src/` áp dụng cho các path rút gọn). Dependency-only uncovered gồm auth/account/sync, OpenAPI và generated schema. ContentConflictDialog, identity controllers/domain/auth migrations, time context và mọi backend path completely unmapped. Full182-path list nằm ở phụ lục bên dưới và JSON evidence.

[F] Chỉ chạy validator read-only sau khi đọc code `check-feature-map.mjs` (fs read/hash-object không `-w`). Commands tại audit root:

| Command | Exit / retry1 | Mismatch |
|---|---|---|
| `node .agents/scripts/check-feature-map.mjs check .agents/features/challenge-list.json` | 1 / 1 | api/challenges.ts; api/__tests__/challenges.spec.ts |
| `node .agents/scripts/check-feature-map.mjs check .agents/features/journal-frontend.json` | 1 / 1 | stores/sync.ts |
| `node .agents/scripts/check-feature-map.mjs check .agents/features/today-view.json` | 1 / 1 | api/challenges.ts |

[F] Full outputs/metadata: `logs/H-map-*.log`, `H-map-checks.meta.json`, retry1 equivalents. Git-blob comparison ở H evidence confirms cùng stale anchors. [I] Recipe coverage gaps và stale anchors là hai vấn đề khác nhau: gap cần focused semantic review; unexplained anchor drift ở kernel không nằm trong allowed known coverage reasons và bị chặn. Không chạy enabled recipe chain vì có build/proof product steps ngoài authorized scope.

## Receipts, schema version và SHA availability

[F] `logs/H-source-inspect.json` enumerate **54** tracked receipts:18 implementation v1,18 verification v1,15 review v1,3 story_finalization v1. Tất cả55 unique 40-hex Git-object references tồn tại (`git cat-file -e <sha>` exit0):45 commits,9 trees,1 blob. Tree/blob fields là subject/checkpoint tree/blob, không bị báo nhầm “missing commit”. Bằng chứng SHA đủ chỉ chứng minh availability, không tự chứng minh receipts freshness/authority. Digest strings và sourceDigest64-hex không được giả làm commit SHA.

[F] Historical review dialects: Story1.5/2.3 legacy `verdict`+declared freshness; Story1.6 bound `judgment`+evidence_refs+scope_digest. Current producer phát schema2 ở `v4-action-kernel.mjs:1288`; consumer cho historical boundv1 và legacyv1 có cutoff ancestry ở `v4-finalization-contract.mjs:108–141`, `check-story-finalization.mjs:492–507`. `98def53` fix version/compatibility, B1 regression cover; không sửa bất kỳ receipt nào để “chuẩn hóa”. F-01 đã giải quyết cho contract cụ thể, F-02 đã merge `dabaf16`/`7b4842b`, `f583066` chỉ ghi nhận architecture history đã integrate.

[F] Isolated freshness helpers cho active approved Story1.5 replacements trả FRESH_CANDIDATE và Story1.6 trả FRESH_REUSED. Superseded B/C CHANGES_REQUIRED receipts ở1.5 giữ INVALID/REVIEW_NOT_APPROVED; đúng lịch sử rework, không finding mới. Story2.3 A review thiếu risk_context_digest; actual legacyReviewFreshness trả STALE/RISK_CONTEXT_DIGEST_MISMATCH, current finalization `:504–505` yêu cầu binding đó. [I] Đây là historical compatibility/evidence limitation cần disposition có provenance, không bằng chứng productAC thất bại. Full terminal completion trên artifact thật **NOT_RUN**.

[F] Safety lý do không chạy completion CLI: current `check-story-completion.mjs:253–265` tạo temp shared clone/checkout rồi xóa ở terminal path `:291`. Context compiler cũng có observation write; measurement CLI `measure-v4-instruction-context.mjs:158–160` writes evidence. Chỉ gọi measurement exports với `evidenceRoot:null`, pure receipt helpers và source-extracted branch. Không clone/temp-checkout/compile/measure CLI.

## Instruction measurement

[F] `node docs/audits/full-project-audit-2026-10-06/logs/H-source-inspect.mjs` exit0. Exported `measureInstructionPair` và `measureInstructionContext`, cùng `.agents/scripts/fixtures/v4-architecture/instruction-basis.json`, action/profile/input digest bind vào raw Git blobs; `evidenceRoot:null`. Full source path/blob/bytes/digest/basis/input bindings trong JSON evidence. Source revision current98def53; baseline `d8e813660e44c54785466836e5c0eda658529b74`; historical accepted `0e4c6b939f2a186399b483718601e86b44a694b5`.

| Action | Baseline bytes | Accepted0e4c6b9 | Current98def53 | Current reduction | Criterion30% |
|---|---:|---:|---:|---:|---|
| implement_slice | 65,359 | 45,551 | 50,461 | 22.7941% | NOT_MET |
| verify_slice | 65,359 | 45,580 | 50,490 | 22.7497% | NOT_MET |

[F] Artifact contract riêng tăng từ14,465 lên19,080 bytes; Runner skill3322→3472 và root AGENTS3144→3289 trên cùng accepted/current measurement. Compiler common instruction list vẫn eagerload contract/control-plane. [I] Numerical acceptance regression H-05 không làm verdict0e4c6b9 sai về quá khứ. Phải cải thiện actual sources hoặc có human decision đổi criterion; không đổi basis để làm số đẹp. Projection bytes ở method này bằng0 theo contract, không phải claim Story projection thật0 hoặc token/time savings.

## Policy consistency, skills-lock và dead/duplicate entries

[F] Root/router/Runner skill thống nhất explicit V4 opt-in, pointer-first IDLE, one validated action, no auto approval, no review_slice/autofallback; V3 schemas giữ schemaVersion1, worker Antigravity, Human Gate required (source schema refs trong `H-static-inventory.json`). Không có V4 fields lẫn vào V3 runtime schema. Các boundaries chưa thống nhất:

- [F] Root Done Gate vẫn gọi V3 HUMAN_GATE, V4 complete contract dùng Plan approval và cấm mutate V3 (`AGENTS.md`, `actions/complete-story.md`). [I] SPEC_AMBIGUITY về diễn đạt gate; priorM4 OPEN.
- [F] “Invocation” chưa định nghĩa human-turn hay Runner-call; no automatic continuation vẫn văn bản. [I] PriorF12 OPEN, cần human định nghĩa control boundary.
- [F] Rework có bounded maintenance API (`Runner:243`) nhưng thiếu router/action contract; priorF04 PARTIAL. Digest refresh/rebind không có public action; priorM7 OPEN.
- [F] Router loại normal bugs/features khỏi migration nhưng không khai báo lightweight lane; priorM5 OPEN. Không tự suy ra permission vận hành V3 từ audit.
- [F] request_gate còn trong legacy registry nhưng không authorized; verify action docs không dẫn targeted reviewer contract. [I] Low discoverability/dead-entry debt, không có evidence route fail-open cho disabled review_slice.

[F] `skills-lock.json` có15 entries; tất cả15 `.agents/skills/<id>/SKILL.md` tồn tại,13 BMAD có module manifests và hai Orca guides không có BMAD manifests. Tất cả15 raw/LF-normalized local SKILL SHA khác computedHash ghi trong lock. **Không kết luận lock hỏng**: repo không cung cấp algorithm/upstream snapshot cho computedHash (có thể hash toàn directory), không pin upstream revision trong entries, và local wrappers được sửa theo policy. [I] Hash/provenance consistency **UNVERIFIED**, cần installer algorithm + upstream version trước update audit; không install hay truy vấn mạng trong WS-H.

[F] Orca-cli và orchestration `.claude`/`.agents` copies bằng bytes, mỗi pair một SKILL.md; BMAD architecture test source có equality assertions (`_bmad/scripts/tests/test_agent_architecture.py:253–256`). Duplicate vẫn còn, nên priorL5 PARTIAL nhưng không claim current copies đã lệch.

[F] BMAD customization menus có16 skill targets,8 available/8 absent. Các missing targets: `bmad-brainstorming`, `bmad-product-brief`, `bmad-prfaq`, `bmad-project-context`, `bmad-qa-generate-e2e-tests`, `bmad-retrospective`, `bmad-prd`, `bmad-ux`. Current exposed catalog cũng không có chúng. Amelia menu BD `customize.toml:58–61` route feature/fix/Story sang `bmad-build`, trái chính bmad-build frontmatter legacy-only và root approvedStory routing; không có `_bmad/custom` override trong worktree. H-11 đề nghị menu team overrides hoặc hide unavailable choices, không tự kích hoạt dead targets.

## Prior status, kiểm tra đã chạy và bàn giao

[F] `prior-findings-status.md` phủ đủ35 ids:09-30H1–H3/M1–M8/L1–L6 (17),10-06F-01..F-15 (15),AcceptanceF01..F03 (3). Fix integration, new metric regression và historical limitations được tách rõ. Không lặp F-02 đã resolved; không mở lại D-F1/F2/F3 được64ca94d sửa để gộp bug async khác.

| Audit command / method | Kết quả | Evidence |
|---|---|---|
| H-source-inspect.mjs | exit0 | H-source-inspect.json; mọi Git child command/exit riêng |
| H-failclosed-probes.mjs | exit0 | H-failclosed-probes.json; actual escalation child exits riêng, all6 assertions true |
| check-feature-map từng3 maps | exit1, retry1exit1 | H-map logs + meta; reproduced once |
| static scope inventory | exit0 | H-static-inventory.json |
| git diff --check audit scope | exit0 sau final report append | H-delivery-validation.json; chỉ check whitespace, không product mutation |
| full test:v4 | Lead exit0 tại03dbd098 | B1.log/B1.meta.json, không rerun subset |
| enabled recipe executors / Story Runner / completion CLI / context compiler CLI / measurement CLI | NOT_RUN | Mutating product/evidence/runtime/temp-clone behavior ngoài authorized scope |

[I] Sau review, ưu tiên bind risk trước, sau đó direct-helper admission/lock và mutual exclusion; human quyết định approval actor assurance. Recipe upkeep/coverage, CI/CLI và context budget là migration backlog riêng. Mọi proposal trong WS-H là mô tả, không patch hay successor execution.

## Phụ lục — toàn bộ uncovered tracked product paths

[F] Danh sách182 paths sau được lấy trực tiếp từ `H-source-inspect.json.coverage.uncovered_paths`, command exit0; bao gồm test/config/deploy theo universe đã khai báo. Full JSON còn phân biệt dependency-only anchors với completely unmapped paths.

```text
.github/workflows/ci.yml
backend/.editorconfig
backend/.env.example
backend/.gitattributes
backend/.gitignore
backend/app/Console/Commands/ProvisionOwner.php
backend/app/Http/Controllers/AccountContextController.php
backend/app/Http/Controllers/Auth/AuthenticatedSessionController.php
backend/app/Http/Controllers/ChallengeController.php
backend/app/Http/Controllers/ChallengeJournalController.php
backend/app/Http/Controllers/Controller.php
backend/app/Http/Controllers/FoundationHealthController.php
backend/app/Http/Middleware/EnsureOwner.php
backend/app/Http/Middleware/PrivateNoStore.php
backend/app/Http/Requests/LoginRequest.php
backend/app/Models/User.php
backend/app/Modules/Challenges/Application/Commands/CreateChallengeCommand.php
backend/app/Modules/Challenges/Application/Commands/SaveJournalCommand.php
backend/app/Modules/Challenges/Application/Commands/UpdateChallengeMetadataCommand.php
backend/app/Modules/Challenges/Application/UseCases/CreateChallengeUseCase.php
backend/app/Modules/Challenges/Application/UseCases/GetChallengeDetailQuery.php
backend/app/Modules/Challenges/Application/UseCases/GetChallengeListQuery.php
backend/app/Modules/Challenges/Application/UseCases/GetJournalQuery.php
backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php
backend/app/Modules/Challenges/Application/UseCases/UpdateChallengeMetadataUseCase.php
backend/app/Modules/Challenges/Domain/Exceptions/IdempotencyKeyReusedException.php
backend/app/Modules/Challenges/Domain/Exceptions/InvalidChallengeNameException.php
backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalDayException.php
backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalTextException.php
backend/app/Modules/Challenges/Domain/Exceptions/InvalidTargetDaysException.php
backend/app/Modules/Challenges/Domain/Exceptions/StaleDataEpochException.php
backend/app/Modules/Challenges/Domain/Exceptions/VersionConflictException.php
backend/app/Modules/Challenges/Domain/Exceptions/WriteFenceActiveException.php
backend/app/Modules/Identity/Application/AccountTimeContextFactory.php
backend/app/Modules/Identity/Contracts/Clock.php
backend/app/Modules/Identity/Domain/AccountTimeContext.php
backend/app/Modules/Identity/Infrastructure/SystemClock.php
backend/app/Modules/README.md
backend/app/Providers/AppServiceProvider.php
backend/artisan
backend/bootstrap/app.php
backend/bootstrap/cache/.gitignore
backend/bootstrap/providers.php
backend/composer.json
backend/composer.lock
backend/config/app.php
backend/config/auth.php
backend/config/cache.php
backend/config/database.php
backend/config/filesystems.php
backend/config/logging.php
backend/config/mail.php
backend/config/queue.php
backend/config/sanctum.php
backend/config/services.php
backend/config/session.php
backend/database/.gitignore
backend/database/factories/UserFactory.php
backend/database/migrations/0001_01_01_000000_create_users_table.php
backend/database/migrations/2026_09_16_135722_create_personal_access_tokens_table.php
backend/database/migrations/2026_09_18_000000_add_owner_admission_to_users_table.php
backend/database/migrations/2026_09_18_010000_create_account_states_table.php
backend/database/migrations/2026_09_19_010000_add_revision_fields_to_account_states_table.php
backend/database/migrations/2026_09_19_020000_create_challenges_and_target_periods_tables.php
backend/database/migrations/2026_09_19_030000_create_mutation_commands_table.php
backend/database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php
backend/database/seeders/DatabaseSeeder.php
backend/phpstan.neon
backend/phpunit.xml
backend/public/.htaccess
backend/public/index.php
backend/public/robots.txt
backend/routes/api.php
backend/routes/console.php
backend/routes/web.php
backend/storage/app/.gitignore
backend/storage/app/private/.gitignore
backend/storage/app/public/.gitignore
backend/storage/framework/.gitignore
backend/storage/framework/cache/.gitignore
backend/storage/framework/cache/data/.gitignore
backend/storage/framework/sessions/.gitignore
backend/storage/framework/testing/.gitignore
backend/storage/framework/views/.gitignore
backend/storage/logs/.gitignore
backend/tests/Contract/AccountContextContractTest.php
backend/tests/Contract/AuthResponseContractTest.php
backend/tests/Contract/ChallengeContractTest.php
backend/tests/Contract/FoundationResponseContractTest.php
backend/tests/Contract/OpenApiResponseValidator.php
backend/tests/Feature/AccountContextTest.php
backend/tests/Feature/ChallengeApiTest.php
backend/tests/Feature/ChallengeConcurrencyTest.php
backend/tests/Feature/ChallengeJournalApiTest.php
backend/tests/Feature/ChallengeJournalTest.php
backend/tests/Feature/ChallengePersistenceTest.php
backend/tests/Feature/ChallengeUseCasesTest.php
backend/tests/Feature/FoundationHealthTest.php
backend/tests/Feature/JournalConflictConcurrencyTest.php
backend/tests/Feature/OwnerAuthenticationTest.php
backend/tests/Feature/ProvisionOwnerCommandTest.php
backend/tests/Feature/Story14IntegrationSeamTest.php
backend/tests/Pest.php
backend/tests/TestCase.php
backend/tests/Unit/.gitkeep
backend/tests/Unit/AccountTimeContextTest.php
compose.local.yaml
contracts/openapi.yaml
deploy/README.md
deploy/local/.dockerignore
deploy/local/.env.example
deploy/local/Dockerfile
deploy/local/entrypoint.sh
deploy/nginx/noteflow.conf
frontend/.editorconfig
frontend/.gitattributes
frontend/.gitignore
frontend/.oxlintrc.json
frontend/.prettierrc.json
frontend/env.d.ts
frontend/eslint.config.ts
frontend/index.html
frontend/package-lock.json
frontend/package.json
frontend/scripts/generate-openapi-types.mjs
frontend/scripts/prove-contract-drift.mjs
frontend/src/App.vue
frontend/src/__tests__/App.spec.ts
frontend/src/api/__tests__/account.spec.ts
frontend/src/api/__tests__/auth.spec.ts
frontend/src/api/__tests__/http.spec.ts
frontend/src/api/account.ts
frontend/src/api/auth.ts
frontend/src/api/http.ts
frontend/src/api/schema.generated.ts
frontend/src/assets/main.css
frontend/src/components/AppShell.vue
frontend/src/components/ContentConflictDialog.vue
frontend/src/components/__tests__/ContentConflictDialog.spec.ts
frontend/src/main.ts
frontend/src/modules/.gitkeep
frontend/src/pinia.ts
frontend/src/queryClient.ts
frontend/src/router/__tests__/router.spec.ts
frontend/src/stores/__tests__/account.spec.ts
frontend/src/stores/__tests__/auth.spec.ts
frontend/src/stores/__tests__/journalDrafts.spec.ts
frontend/src/stores/__tests__/sync.spec.ts
frontend/src/stores/account.ts
frontend/src/stores/auth.ts
frontend/src/stores/journalDrafts.ts
frontend/src/stores/sync.ts
frontend/src/views/AccountSettingsView.vue
frontend/src/views/DeepLinkView.vue
frontend/src/views/FoundationView.vue
frontend/src/views/LoginView.vue
frontend/src/views/PrivatePlaceholderView.vue
frontend/src/views/__tests__/journal-draft-lifecycle.spec.ts
frontend/tsconfig.app.json
frontend/tsconfig.json
frontend/tsconfig.node.json
frontend/tsconfig.vitest.json
frontend/vite.config.ts
frontend/vitest.config.ts
scripts/local.ps1
scripts/verify-local.ps1
tests/e2e/account-time.spec.ts
tests/e2e/challenges.spec.ts
tests/e2e/content-conflict.spec.ts
tests/e2e/cross-device-sync.spec.ts
tests/e2e/foundation.spec.ts
tests/e2e/helpers/db-helper-guard.test.ts
tests/e2e/helpers/db-helper.php
tests/e2e/helpers/db-state.ts
tests/e2e/helpers/php-runtime.test.ts
tests/e2e/helpers/php-runtime.ts
tests/e2e/package-lock.json
tests/e2e/package.json
tests/e2e/playwright.config.ts
tests/e2e/responsive.spec.ts
tests/e2e/routing.spec.ts
tests/e2e/scripts/patch-playwright-windows-cleanup.mjs
```
