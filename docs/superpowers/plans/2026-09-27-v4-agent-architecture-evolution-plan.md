# NoteFlow V4 — Control-plane và cải tiến có kiểm chứng — Implementation Plan

> **For agentic workers:** Dành cho **Luna 5.6 Max** (model gpt-5.6-luna, reasoning effort max). Khi có yêu cầu triển khai riêng của human, dùng skill superpowers:executing-plans để thực hiện tuần tự từng task. Không mặc định dispatch subagent, Orca hoặc AGY.
>
> **Trạng thái:** IN PROGRESS — human đã ủy quyền triển khai trong lane V4 Lite architecture/control-plane migration; T00–T06 đã hoàn tất, T07 là task kế tiếp.
>
> **Ngày:** 2026-09-27. **Baseline đã đọc:** main, d8e813660e44c54785466836e5c0eda658529b74.
>
> Các đường dẫn dưới đây là tương đối với repository root. Các command là hướng dẫn cho lần triển khai sau; chúng chưa được chạy trong quá trình lập plan.

**Goal:** Nâng cấp sáu năng lực đã thống nhất: tự động hóa điều phối cơ học; context theo action; entrypoint thống nhất; verification nhiều scope; telemetry V4; và vòng thu thập kinh nghiệm, tự đề xuất, đánh giá cải tiến có kiểm chứng.

**Architecture:** Giữ các validator, lifecycle helper, receipt và Human Gate hiện có làm nền. Thêm một kernel mỏng cho phần cơ học của implement_slice/verify_slice, projection context chỉ đọc, registry verification mở rộng và lớp quan sát/kinh nghiệm không có quyền thay đổi product hoặc policy. Semantic coding, đánh giá đủ evidence, semantic review và quyết định adoption vẫn có chủ thể chịu trách nhiệm rõ ràng.

**Tech Stack:** Node.js ESM, node:test, Git CLI, JSON/Markdown, các script .agents hiện có. Khi chạy frontend checks phải dùng Node thỏa engines hiện tại: >=24.12.0 <25. Không thêm orchestration framework, database, vector store hoặc SDK model.

**Spec:** Phạm vi và thiết kế trong chính tài liệu này, đặc biệt các mục 1–7. Authority hiện hành là AGENTS.md, .agents/routing/task-router.md, .agents/docs/v4-artifact-contract.md và .agents/skills/v4-story-runner/SKILL.md. Report audit là tài liệu tham khảo, không phải authorization hoặc spec bắt buộc.

**Cách đọc khi thực thi:** Đọc mục 1–3 và task index một lần để hiểu phạm vi. Mỗi task chỉ load phần contract tương ứng, task đó và evidence của prerequisite; không mặc định nạp lại toàn bộ plan sau mỗi invocation. Checklist trong plan và commit/evidence đã xác minh dùng để bàn giao tiến độ migration, không có quyền thay Story lifecycle. Chỉ tick task sau khi gate của nó thực sự đạt; được cập nhật đúng checkbox và evidence pointer trong file plan này cùng task commit, không tự thay thiết kế đã được human chọn.

## 1. Phạm vi đã thống nhất và bằng chứng

| ID | Hiện trạng đã xác nhận | Năng lực cần tạo | Task |
|---|---|---|---|
| U1 | v4-story-runner.mjs trực tiếp chạy start/finalize/complete; implement/verify chủ yếu trả authorization, Lead nối các bước | Kernel thực thi plumbing và persistence trong từng action, dừng ở semantic boundary | T05–T07 |
| U2 | Entry/router/runner khoảng 30.3 KB; thêm TDD và verification skill khoảng 42.9 KB; runner chứa mọi action và có đoạn verify bị lặp | Entry nhỏ, tài liệu theo action, compact technique recipe, context projection có provenance | T02–T03 |
| U3 | CLAUDE.md yêu cầu V3 bootstrap trước lane selection | Routing nhất quán giữa provider, V4 explicit opt-in, V3 fallback giữ nguyên | T02 |
| U4 | Registry hiện chỉ có challenge-list, chưa hỗ trợ nhiều recipe phù hợp cùng lúc | Multi-recipe routing, kiểm tra đủ changed-path coverage, thêm hai frontend scope có test thật | T04 |
| U5 | Đã có telemetry contract V3 nhưng thiếu baseline V4 đủ để kết luận ROI | Event/usage ledger và report phân biệt measured, estimated, unknown | T01, T08, T11 |
| U6 | Có receipt/checkpoint/review nhưng chưa có vòng chuyển evidence thành kinh nghiệm và proposal được đánh giá | Session/Story observations → kinh nghiệm có phạm vi → proposal → benchmark → human adoption | T08–T11 |

Những kết luận không được giả định:
- KB văn bản không phải token provider hay số tiền tiết kiệm.
- HIGH/MEDIUM vẫn cần review kể cả verification PASS.
- Canonical INCOMPLETE vì registry thiếu scope không có nghĩa chưa chạy focused checks.
- File blob mismatch thuộc changed scope đã được router xử lý; không thay anchor chỉ vì thấy STALE.
- Có thêm memory không tự chứng minh output tốt hơn.
- Mỗi session phải cung cấp được evidence khi có thể; không bắt kiến trúc thay đổi sau mỗi session.

## 2. Global Constraints và authorization

### 2.1 Trước khi Luna được phép bắt đầu

1. Human phải yêu cầu triển khai plan này trong lane **V4 Lite architecture/control-plane migration**. Không coi đây là Story execution.
2. Đọc chỉ canonical .agent-state/active-run.json trước. Chỉ tiếp tục khi schema/status/identity thể hiện IDLE rõ ràng và không có evidence mâu thuẫn.
3. Nếu active, ambiguous hoặc bị mâu thuẫn: dừng và báo; không resume/reconcile/take over V3.
4. Kiểm tra branch, HEAD, Git status, Git/common directories và worktree list. Inventory warning/error không được gọi là clean.
5. Dùng worktree phù hợp đang rảnh; nếu cần isolation mới, dùng công cụ managed worktree của host trước. Không dùng hoặc sửa worktree Story đang có người làm.
6. Nếu làm ở linked worktree, so sánh AGENTS.md và policy liên quan với canonical main; báo stale trước mutation. Không sửa bản ignored trong worktree để thay thế canonical policy.
7. Tại thời điểm lập plan, main đã có file staged docs/superpowers/plans/2026-09-27-story-1-5-execution-plan.md và có worktree .worktrees/story-1-5-v4. Đây là công việc ngoài phạm vi; không stage, unstage, commit, reset hoặc dọn chúng.
8. Nếu HEAD đã thay đổi, đối chiếu các thành phần liên quan với baseline này, ghi baseline thực tế trước triển khai. Không reset repo về SHA trong plan.
9. Lỗi permission phải được xử lý bằng cơ chế approval của host. Không dùng công cụ khác để lách sandbox.

### 2.2 Bất biến phải giữ

- BMAD Story/AC/product intent giữ authority hiện tại; Plan và memory không được tạo yêu cầu mới.
- Giữ một durable Story action mỗi invocation. Không thêm run_slice, auto-next-slice hoặc auto review-to-done.
- start_story, finalize_story, complete_story và approval vẫn dùng helper và exact-scope guard hiện có.
- review_slice độc lập vẫn disabled. Việc ghi review chỉ là substep của verify_slice đã được authorize.
- verify_slice không sửa product code; failure không được tự biến thành quyền fix/reimplement.
- Canonical PASS/FAIL/INCOMPLETE/ERROR giữ nguyên ý nghĩa. Progression eligibility là một quyết định riêng có evidence.
- HIGH/MEDIUM review bắt buộc theo check-escalation.mjs; không giảm risk để tiết kiệm token.
- Receipt đã được tham chiếu là immutable. Replacement phải có nội dung/digest/reference mới và authority phù hợp.
- Giữ exact path staging, expected HEAD, freshness, two-commit implementation durability và recovery bảo toàn partial work.
- Không reset, clean, stash hoặc tự xóa lock khi recovery gặp vấn đề.
- Không sửa V3 leases/generation/worker contract/runtime state. Không thêm V4 ownership vào active-run.json.
- Telemetry và learned experience không được quyết định approval hoặc lifecycle.
- Áp dụng kiến trúc mới không tự cập nhật các Story đang triển khai bằng policy cũ.

### 2.3 Ngoài phạm vi

Không triển khai Story 1.5 hay Story nào khác. Không đổi frontend/backend product code, OpenAPI, dependency versions, AC, sprint status hoặc receipt thật để làm test pass. Không tạo general multi-agent DAG, permanent reviewer, AST/Feature Graph toàn repo, vector database, Semantic Plan Compiler, model auto-routing hoặc provider billing adapter suy đoán. Không có daemon, cron, scheduled task hay API model mới.

Đây là nâng cấp HIGH risk vì chạm control-plane, transaction và authority boundary. Luna phải tự review đối kháng các invariant và negative paths; không tự thêm reviewer agent như cách thay thế việc kiểm chứng.

## 3. Quyết định thiết kế cho lần nâng cấp này

### D1 — Kernel mỏng, tái sử dụng helper

Kernel gọi validator/helper hiện có; không viết một bộ lifecycle validator song song. Kernel có thể chuẩn bị manifest, chạy command đã được lựa chọn rõ ràng, thu evidence, tạo receipt, stage exact paths và cập nhật execution projection. Kernel không tự chọn semantics của implementation, không kết luận test đủ prove AC chỉ từ exit code.

Khi thiếu semantic input, trả yêu cầu có cấu trúc rồi dừng. Lead bổ sung input trong phạm vi action đã được cấp quyền. Không cần SDK gọi model: Luna dùng tool/CLI như hiện tại.

### D2 — Giữ action boundary

Một lần implement_slice kết thúc ở checkpoint và metadata commit, next_action là verify_slice của chính slice đó. Một lần verify_slice có thể chạy checks, yêu cầu same-Lead review và ghi kết quả; khi persist successor xong phải dừng.

Các operation prepare/checkpoint/verify/record-review của kernel là substep, không phải action mới được tự cấp quyền. Không tự gọi successor trong cùng vòng.

### D3 — Làm rõ commit metadata cho schema v2

Schema v2 yêu cầu implementation receipt bind checkpoint. Receipt không thể nằm trong implementation commit tự tham chiếu.

- Commit 1: đúng implementation files/tests/contracts của slice; không chứa Plan/receipt/control-plane.
- Commit 2 schema v2: đúng Plan và **implementation receipt mới của slice**.
- Commit 2 schema v1: giữ Plan-only.
- Không thêm Story/sprint lifecycle hoặc receipt của slice khác vào commit 2.
- Helper hiện đã loại implementation receipt tương ứng khỏi otherDirty trong PLAN_UPDATE_PENDING; cần đồng bộ prose với contract này và bổ sung regression test.
- Đây là chỉnh rõ phạm vi metadata của two-commit contract, không bỏ checkpoint hoặc mở rộng Human Gate.
- Nếu partial transaction bị ngắt, giữ index/files/lock/journal; không tự chạy lại coding hoặc chọn commit theo message.

### D4 — Context projection không có authority

Projection chứa nguyên văn normative nội dung cần cho slice và pointer đến nguồn, không viết lại yêu cầu bằng LLM. Giữ toàn bộ risk/invariants cấp Story, tasks của slice, AC liên quan, dependency dispositions và các nguồn architecture/UX được khai báo.

File scope chưa được biết phải biểu diễn là chưa xác định; không lấy scope đoán từ memory làm allowlist. Caller chọn implementation scope semantically theo Story, helper mới kiểm tra exact ownership.

Action context không tải toàn bộ lịch sử receipt. Tuy nhiên validator vẫn được kiểm tra dependency chain theo contract; ít context cho model không đồng nghĩa ít kiểm tra dữ liệu.

### D5 — Verification mở rộng có giới hạn

Giữ file-blob anchors ở phiên bản này. Mở rộng registry và aggregate nhiều recipe trước; không thêm AST/index service.

Thêm journal-frontend và today-view, dùng các test đã tồn tại. Backend journal, migration và public-contract thay đổi chưa được hai recipe này chứng minh; scope đó tiếp tục INCOMPLETE/escalation nếu chưa có recipe tương ứng.

### D6 — Học liên tục, áp dụng có kiểm chứng

Tự động hóa mặc định là ghi observation và rút ra các fact hẹp có thể kiểm tra lại. Semantic reflection chỉ tạo candidate; nó không tự sửa AGENTS.md, skill, code hoặc verification policy.

Khả năng tự tiến hóa ở bản này gồm: phát hiện cơ hội, đưa proposal có evidence, đánh giá trước/sau, trình human adoption và kiểm tra freshness của adoption record. Không có auto-apply policy.

### D7 — Không khóa cứng vào “mỗi invocation là một session”

Provider session ID, invocation ID và Story/action ID là các trường khác nhau. Nếu host không cung cấp session boundary thật, ghi coverage PARTIAL/UNKNOWN, dùng session checkpoint và explicit close-session khi thực sự kết thúc. Không gọi mỗi tool call hoặc mỗi action là một session mới.

Crash không làm mất authority: session observation có thể PARTIAL, còn resume vẫn dựa vào Plan/Git/receipts. Không cài background watcher để giả vờ quan sát được mọi lần đóng app.

## 4. File map và trách nhiệm

Chỉ tạo file khi đến task sở hữu nó; không scaffold toàn bộ trước.

| Task | File tạo mới | File hiện có có thể sửa | Trách nhiệm |
|---|---|---|---|
| T00 | .agents/scripts/v4-architecture-fixture.mjs; .agents/scripts/v4-architecture-baseline.test.mjs; .agents/scripts/fixtures/v4-architecture/corpus.json | Không | Fixture Git độc lập, invariant baseline, danh mục scenario |
| T01 | .agents/docs/v4-observation-contract.md; .agents/scripts/v4-observations.mjs; .agents/scripts/v4-observations.test.mjs | Không sửa v3-telemetry.md | Event, usage normalization, aggregation |
| T02 | .agents/skills/v4-story-runner/actions/start-story.md, reconcile-lifecycle.md, implement-slice.md, verify-slice.md, finalize-story.md, complete-story.md; .agents/skills/v4-story-runner/references/recovery.md, implementation-techniques.md | AGENTS.md; CLAUDE.md; .agents/routing/task-router.md; .agents/context/control-plane.md; .agents/context/context-routing.md; .agents/skills/v4-story-runner/SKILL.md | Entry/lane/action guidance |
| T03 | .agents/scripts/compile-v4-context.mjs; .agents/scripts/compile-v4-context.test.mjs | Action docs T02 | Read-only projection và dependency fingerprint |
| T04 | .agents/verification/registry.json; .agents/features/journal-frontend.json, today-view.json; .agents/verification/journal-frontend.json, today-view.json; .agents/scripts/check-verification.test.mjs | check-verification.mjs; check-feature-map.mjs nếu cần validation field mới; challenge-list manifests chỉ khi refresh có evidence; .agents/context/verification-context.md | Multi-recipe routing, actual test recipes |
| T05 | .agents/scripts/v4-check-executor.mjs; .agents/scripts/v4-check-executor.test.mjs | check-verification.mjs nếu trích xuất process adapter dùng chung | Structured execution evidence |
| T06 | .agents/scripts/v4-slice-transaction.mjs; .agents/scripts/v4-slice-transaction.test.mjs; .agents/scripts/v4-action-kernel.mjs; .agents/scripts/v4-action-kernel.test.mjs; .agents/docs/v4-action-kernel.md | check-slice-implementation.mjs và test; v4-story-runner.mjs và test; v4-artifact-contract.md; implement action doc | Implementation checkpoint và exact metadata persistence |
| T07 | .agents/scripts/v4-verification-flow.test.mjs | Kernel/transaction T06; check-slice-verification.mjs và test nếu cần metadata mới; v4-separated-plan.mjs nếu projection cần validation; verify action doc; targeted-reviewer-contract.md chỉ để mô tả aggregate input | Verification, review continuation, progression |
| T08 | .agents/scripts/v4-observation-hooks.test.mjs | v4-observations.mjs; kernel; v4-story-runner.mjs; common/action docs | Session checkpoint, Story observation hooks |
| T09 | .agents/docs/v4-experience-contract.md; .agents/scripts/v4-experience.mjs; .agents/scripts/v4-experience.test.mjs | compile-v4-context.mjs và test | Derived fact/candidate lifecycle, bounded retrieval |
| T10 | .agents/docs/v4-evolution-contract.md; .agents/scripts/v4-evolution.mjs; .agents/scripts/v4-evolution.test.mjs | Observer/action docs, observation hooks tests | Proposal, evaluation/adoption validation |
| T11 | .agents/scripts/benchmark-v4.mjs; .agents/scripts/benchmark-v4.test.mjs; docs/agent-architecture/v4-upgrade-validation.md | corpus.json; v4-lite-migration.md thêm lịch sử mới, không rewrite evidence cũ | Compare, full regression, handoff/evidence |

Không đổi tên helper public hiện có. Nếu một change thực sự cần sửa file ngoài bảng, ghi lý do và ảnh hưởng trước; product/lifecycle thật vẫn không được mở rộng vào phạm vi.

### 4.1 Storage

- Source/policy/contracts/tests: Git-tracked paths trong bảng.
- Runtime observations, derived experience và proposals: canonical .agent-state/v4-observations/, với các subdirectory events, sessions, experience, candidates, evaluations. Chỉ subtree mới này được ghi; không sửa V3 pointer/runs/leases.
- Runtime telemetry được phép ghi đồng thời theo event ID bằng atomic create; không dùng chung một JSON array cần read-modify-write.
- Kernel transaction journal/lock: resolved Git common directory, dưới noteflow-v4-transactions. Đây là Git transaction identity, không phải V3 lease hoặc authority thay Plan.
- Durable Story receipt: thư mục receipts của Story theo contract hiện có, chỉ trong Story action được authorize.
- Adoption record đã được human duyệt trong tương lai: .agents/evolution/adoptions/<candidate-id>.json; bản upgrade này chỉ tạo validator và tài liệu, không bịa adoption record.
- Derived data có thể tái dựng/tái xác minh; mất telemetry/memory không được làm mất product truth hoặc làm Story thành done.

## 5. Contract dữ liệu và API cần ổn định

Các tên sau là interface dự kiến cần triển khai, không phải lời khẳng định chúng đã tồn tại. Các module dùng root tuyệt đối, paths trong payload là repo-relative được kiểm tra traversal/symlink. Mỗi CLI có help, input validation, JSON output và exit code rõ ràng.

### 5.1 Observation và cost ledger — T01

EventEnvelope bắt buộc:
- schema_version = 1; event_id; observed_at; source_kind; source_id.
- story_id, slice_id, action, invocation_id, session_id: nullable khi chưa biết, không tự suy từ branch name.
- repository identity, worktree identity, source_head và architecture fingerprint.
- event_type; coverage (MEASURED/PARTIAL/UNKNOWN); sanitized payload; provenance.
- event_type chỉ nhận action_started, action_finished, check_finished, context_delivered, usage_imported, session_checkpoint, session_closed, story_review_snapshot, story_completed, reflection_requested, diagnostic.
- Không lưu secret, raw chain-of-thought, full transcript hoặc product text vào telemetry.

UsageRecord:
- provider, model, effort, source/export ID, provider_request_id nếu có.
- uncached_input_tokens, cached_input_tokens, output_tokens, reasoning_tokens.
- output_includes_reasoning và input_includes_cached phải có true/false/unknown.
- units, inclusion semantics, observation window, exclusions.
- unknown là null + reason, không phải 0.
- Phân biệt provider measurement, operator-supplied measurement và estimate.
- Một request chỉ tính một lần; parent export và child records không được cộng trùng.
- Cùng ID cùng payload → NOOP; cùng ID khác payload → CONFLICT, không overwrite.
- Không tính reasoning lần nữa nếu nó đã nằm trong output.
- Context bytes ghi từ payload thực sự giao cho model; bytes generated/projected riêng với bytes delivered.
- Chưa có provider export thì token/cost report là UNKNOWN; không quy đổi byte thành usage thực.

API:
- recordObservation(canonicalRoot, event) → RECORDED | NOOP | CONFLICT | ERROR.
- summarizeObservations(events, selection) → totals + coverage + unknowns + sources, không sinh lifecycle decision.
- CLI verbs: record --input <json>, summarize --story <id>, session-checkpoint --input <json>, close-session --input <json>, import-usage --input <normalized-json>.
- Bản đầu nhận normalized JSON có provenance; không giả định có API lấy usage theo session.
- Mỗi event tối đa 64 KiB UTF-8. Oversize bị từ chối với diagnostic; không cắt một event rồi gọi nó complete.

Telemetry write failure tạo warning/coverage gap, không nới gate hoặc đảo ngược một action đã thành công. Evidence bắt buộc của kernel là contract khác và phải fail closed nếu không lưu được.

### 5.2 Context projection — T03

compileActionContext(root, storyId, action, sliceId, options) trả JSON gồm:
- identity: Story, action, slice, validated next_action, expected HEAD.
- source bindings: Story normative digest, Plan digest, policy/skill/recipe digests.
- requirements: nguyên văn task/AC được chọn theo task_refs, toàn bộ risk/invariants Story, declared refs.
- dependency_dispositions và blockers/questions.
- action_instruction_paths; lazy_reference_paths cùng trigger.
- known scope/consumers/checks kèm nguồn; unknown fields ghi explicit.
- output_contract_ref và stop conditions.
- experience_advice: danh sách rỗng trước T09; sau đó chỉ advisory có provenance.
- projection_fingerprint; byte counters cho projection và instruction dependencies.

CLI: compile-v4-context.mjs check <story-id> --action <action> [--slice <slice>] --expected-head <sha>.
Mặc định stdout, không ghi Plan hay source. Không gọi script mutation.

Missing source, stale digest, missing task/AC link hoặc ambiguous action → BLOCKED/STALE/INVALID theo nguyên nhân. Không sinh capsule trông hợp lệ bằng cách bỏ phần thiếu. CLI phải chấp nhận fail-closed pointer/routing policy như đường vào V4.

### 5.3 Structured check execution — T05

CheckSpec:
- id; cwd; argv array; purpose; classification (behavioral/static/contract/map).
- required; referenced_paths; explicit environment identity hoặc reason unknown.
- commands đến từ recipe đã xác minh hoặc Lead-selected focused manifest bind Story/scope.
- Không lấy command từ learned text, tự parse shell string, hoặc chạy qua shell.
- Recipe chỉ dùng check-mode; cấm install, deployment, formatter write, destructive Git hoặc production-data command.
- Các npm scripts phải kiểm tra nội dung hiện tại; tên script không tự chứng minh read-only.

executeCheck(root, spec, subject) trả CheckEvidence:
- check ID, canonical command digest, executable/toolchain identity.
- exit status, duration nếu đo được, PASS/FAIL/ERROR.
- subject identity: checkpoint/tree hoặc pre-checkpoint worktree content manifest, không bịa commit.
- output digest và diagnostic excerpt có giới hạn/redaction; full relevant evidence ref khi cần.
- process provenance và input bindings, không chỉ summary do model tự gõ.
- timeout/process launch failure → ERROR, không PASS hoặc silently skipped.
- stdout cap 4 MiB/process, default timeout 120 s; override chỉ từ trusted CheckSpec đã preview.
- Giữ phân biệt expected RED failure trong TDD và failed acceptance verification.

Worktree subject gồm danh sách path, blob/content identity và file type/mode liên quan. Trước khi dùng evidence sau checkpoint, xác minh nội dung đã kiểm tra tương ứng checkpoint; source/toolchain/reference drift yêu cầu rerun.

### 5.4 Kernel — T06/T07

KernelInput v1:
- story_id, slice_id, action, operation, invocation_id, expected_head.
- current Plan/Story/context fingerprint.
- exact owned paths hoặc checkpoint candidate rõ ràng cho recovery.
- selected focused CheckSpecs/evidence refs.
- semantic coverage judgment khi cần, với task/AC refs và supporting evidence.
- review result và complete bounded evidence coverage khi record-review.

API:
- prepareAction(root, input) → read-only preview + fingerprint + required semantic inputs.
- checkpointImplementation(root, input, fingerprint) → APPLIED | NOOP | BLOCKED | STALE | RECOVERY_REQUIRED | ERROR.
- verifySlice(root, input, fingerprint) → APPLIED | REVIEW_REQUIRED | BLOCKED | STALE | ERROR.
- recordSliceReview(root, input, fingerprint) → APPLIED | REVIEW_REQUIRED | BLOCKED | STALE | RECOVERY_REQUIRED | ERROR.
- inspectActionTransaction(root, transactionId) → observable state; read-only.

CLI v4-action-kernel.mjs:
- prepare <story> <slice> --action implement_slice|verify_slice --input <json>.
- run-check --input <json>.
- checkpoint <story> <slice> --input <json> --fingerprint <digest>.
- verify <story> <slice> --input <json> --fingerprint <digest>.
- record-review <story> <slice> --input <json> --fingerprint <digest>.
- inspect --transaction <id>.

prepare/run-check không có authority chạy successor. No argument lấy từ chat history. Fingerprint bao gồm HEAD, Plan/Story, exact paths/content, policy/action contract, command specs và evidence dependencies; áp dụng phải recheck dưới lock.

Runner integration phải giữ backward compatibility: đường gọi cũ không có kernel input vẫn có hành vi/authorization hiện hành. Thêm explicit kernel operation/input thay vì làm một lệnh readiness cũ bỗng mutation. Chỉ bật action docs sang kernel sau các task test tương ứng pass.

Runner flags mới: --kernel-operation prepare|checkpoint|verify|record-review, --kernel-input <json-path>, và --kernel-fingerprint <sha256> cho mutation sau preview. Các flags này chỉ hợp lệ khi Plan đang yêu cầu implement_slice/verify_slice tương ứng; không được trộn với --approve-exact-scope hoặc --start-fingerprint. Story/action/slice trong input phải khớp CLI và validated Plan. Không truyền run-check/inspect như một Story action.

### 5.5 Verification aggregation — T04/T07

Registry v1 chứa schema_version và recipes, mỗi entry có featureId, path, enabled; không scan rồi tự tin cậy mọi JSON trong thư mục. Duplicate ID/path hoặc enabled recipe không đọc được → ERROR.

Feature map mới dùng schema_version 2, covered_paths và anchor_blobs. covered_paths là subset tường minh của anchor_blobs; anchor_blobs chứa cả các dependency cần kiểm tra freshness. Dependency-only path có thể kích hoạt affected recipe nhưng không được tự tính là covered change. Legacy challenge-list giữ cách hiểu v1 (covered paths = anchor keys) để không migration ngầm. Check/type/registry validity nằm trong code; tên feature hoặc một câu scope_boundary không thay thế coverage validation.

Giữ raw single-recipe canonical output và exit meanings. Thêm aggregate v2 cho multi-recipe:
- schema_version, changedPaths, recipes chứa nguyên kết quả từng recipe.
- matchedPaths, unmatchedPaths, checks, escalationReasons, status, complete.
- Không bỏ path khi aggregate; không dùng recipe scope_boundary để giấu unmatched path.
- Với aggregate: ERROR nếu lỗi chạy/parse; FAIL nếu recipe có FAIL; INCOMPLETE nếu còn partial/unmapped/drift; PASS chỉ khi coverage đủ và mọi required check PASS.
- Nếu single-recipe legacy đặt INCOMPLETE dù một behavioral check FAIL, kernel vẫn chặn progression vì required behavioral check failed.
- Map drift là metadata issue riêng; không nhầm với behavioral failure.
- Shared command chỉ deduplicate khi cwd, argv, environment và subject đều giống nhau; mỗi recipe vẫn có ref tới evidence đó.
- Deterministic escalation vẫn dùng check-escalation.mjs, truyền input hợp lệ giữ nguyên canonical evidence.
- LOW complete PASS không judgment flags mới được NO_REVIEW; MEDIUM/HIGH không đổi.

INCOMPLETE progression chỉ xét các lý do coverage đã biết: NO_APPLICABLE_RECIPE, UNMAPPED_CHANGED_PATH, UNEXPLAINED_DRIFT. Phải có fresh focused evidence đủ cho obligations, semantic coverage judgment có nguồn, required review APPROVE và disclosure. Unknown reason, missing authoritative source, stale receipt, canonical ERROR/FAIL hoặc required behavioral failure đều chặn. Không tự chuyển INCOMPLETE thành PASS.

### 5.6 Experience — T09

ExperienceEntry v1:
- id, kind, claim, scope, source Story/session/event/receipt refs.
- source head, relevant path/recipe/policy digests, evidence status.
- lifecycle: candidate → active → stale → deprecated.
- validation basis, last_validated_at, invalidation triggers, limitations.

Hai loại:
1. verified_fact: fact hẹp như “command X đã PASS cho subject Y”, hoặc “recipe được duyệt tham chiếu path Z ở digest W”. Có thể active tự động sau deterministic validation.
2. semantic_hypothesis: bài học, heuristic hoặc đề xuất do Lead rút ra. Giữ candidate cho tới khi có evaluation/adoption phù hợp; không tự nâng thành quy tắc.

Một lần test PASS không tạo fact “test này luôn đủ cho feature”. Không học quyền bỏ review hoặc giảm risk. Receipt legacy thiếu provenance phải gắn giới hạn; không được tự nâng trust.

API:
- extractExperience(canonicalRoot, observations) → entries + rejected/unknown reasons.
- validateExperience(root, entry) → VALID | STALE | INVALID.
- selectExperience(root, query) → tối đa 3 entries, tổng tối đa 6 KiB, có source refs.
- Query bind action, feature/paths, risk và current digests; không load toàn bộ kho.
- Không có match → empty; không phải error chặn implementation.
- Dependency digest đổi → stale và không được inject như advice hợp lệ.
- Learned content là dữ liệu không đáng tin để cấp quyền: không chấp nhận embedded command/instruction làm workflow.

### 5.7 Evolution proposal và evaluation — T10/T11

EvolutionCandidate v1:
- candidate_id, hypothesis, observed_problem, evidence_refs.
- baseline architecture commit/fingerprint và workload class.
- exact proposed control-plane scope, expected_effect, quality_risks.
- evaluation cases, cost accounting, stop/rollback description.
- status: PROPOSED | EVALUATING | INCONCLUSIVE | REJECTED | AWAITING_HUMAN | ADOPTED.
- Proposal chỉ chứa mô tả thay đổi, không có command để auto-apply.

EvaluationResult:
- baseline/candidate identity, input dataset digest, model/effort/toolchain.
- deterministic checks, semantic/manual evidence nếu có, measured costs và coverage.
- quality findings, correction cycles, known exclusions, comparability verdict.
- Chỉ assert savings cho metric thực sự đo và comparable.
- Synthetic fixture pass được gọi là deterministic non-regression, không gọi là real-Story quality proof.
- Không có real provider usage → token savings INCONCLUSIVE.

ComparisonBundle v1 dùng bởi benchmark-v4 gồm schema_version, variant, source_head, architecture_fingerprint, corpus_digest, toolchain, model/effort (nullable) và cases. Mỗi case có case_id, workload_class, input_digest, trial_id, check_results, instruction_bytes, observed_usage, correction_cycles, coverage và exclusions. Baseline bundle lưu tại .agent-state/v4-observations/evaluations/architecture-upgrade-baseline.json; candidate tại architecture-upgrade-candidate.json cùng thư mục. T00 ghi baseline identity/check results, T01 chỉ bổ sung observation có nguồn; không overwrite baseline bằng số đo của code mới. Không có số đo baseline cho metric nào thì so sánh metric đó INCONCLUSIVE.

AdoptionRecord:
- candidate/evaluation digests, exact reviewed change scope/commit, human decision source.
- Ghi bởi Lead chỉ sau human instruction thực tế; không do reflection sinh ra.
- Approval kiến trúc riêng với Story completion approval; không tái sử dụng lẫn nhau.
- Candidate/scope/baseline/evaluation đổi → approval stale.

API:
- proposeEvolution(root, boundedEvidence) → candidates, tối đa 3 mỗi Story.
- validateEvolutionCandidate(root, candidate) → VALID | INVALID | STALE.
- evaluateEvolution(candidate, comparison) → kết luận có evidence, không apply.
- validateAdoption(record, candidate, evaluation, scope) → VALID | INVALID | STALE.
- Không có auto-apply method hoặc CLI verb.

## 6. Recipes mở rộng cụ thể

### journal-frontend

Covered change anchors ban đầu:
- frontend/src/components/ChallengeJournalEditor.vue
- frontend/src/views/ChallengesView.vue
- frontend/src/api/challenges.ts
- frontend/src/views/__tests__/journal.spec.ts
- frontend/src/api/__tests__/challenges.spec.ts

Read-only context/dependency pointers:
- frontend/src/stores/auth.ts
- frontend/src/stores/account.ts
- frontend/src/stores/sync.ts
- contracts/openapi.yaml
- frontend/src/api/schema.generated.ts (đường dẫn output đã đối chiếu với frontend/scripts/generate-openapi-types.mjs).

Checks chạy từ frontend:
- npm run type-check
- npm run test:unit -- --run src/views/__tests__/journal.spec.ts src/views/__tests__/challenges.spec.ts src/api/__tests__/challenges.spec.ts
- npm run contract:check

Boundary: optional journal UI và typed client behavior đang được những test trên exercise. Không chứng minh backend persistence, migration hoặc toàn bộ behavior của file API chỉ nhờ path match. Shared ChallengesView/client change còn kích hoạt challenge-list khi phù hợp.

### today-view

Covered change anchors:
- frontend/src/views/TodayView.vue
- frontend/src/views/__tests__/today.spec.ts
- frontend/src/views/__tests__/account-time.spec.ts

Dependency pointers:
- frontend/src/api/challenges.ts
- frontend/src/stores/account.ts
- frontend/src/stores/auth.ts

Checks chạy từ frontend:
- npm run type-check
- npm run test:unit -- --run src/views/__tests__/today.spec.ts src/views/__tests__/account-time.spec.ts

Boundary: Today account-day rendering, journal entry point và read failure hiện có test. Không chứng minh toàn bộ time invariant, auth hoặc backend bằng recipe này.

Trong cả hai recipe:
- Xác minh đường dẫn/check thực tế trước khi tạo manifest.
- Anchor hash lấy từ scope đã review và checks đã chạy. Không auto rehash chỉ để che unexplained drift.
- Missing prerequisites/environment ghi ERROR/INCOMPLETE với lý do; không “PASS vì đã định nghĩa command”.
- Mapped coverage là coverage của registry, không phải bằng chứng tự động về đầy đủ AC.

## 7. Cơ chế học sau session và Story

### 7.1 Session

- Entry có session ID thật thì record once; thiếu ID thì ghi unknown với local observation window, không gọi đó là provider session.
- Kernel ghi action/check/context events khi thực sự xảy ra.
- Trước khi Lead yield, ghi session_checkpoint cho phần đã quan sát; chỉ close-session nếu boundary thật đã biết.
- Crash hoặc đóng app không quan sát được để PARTIAL. Invocation sau có thể nối evidence đã tồn tại, không tạo retrospective facts giả.
- Mặc định không gọi thêm model cho session reflection. Tổng hợp counters/facts bằng code.
- Retry chỉ tạo event mới khi có attempt mới; đọc lại cùng receipt không tăng số lần thực thi.

### 7.2 Story

- finalize thành công → story_review_snapshot; chưa gọi Story completed.
- complete thành công với approval đúng scope → story_completed.
- Hooks observational không được thực thi successor hoặc ghi Human approval.
- Story retrospective dùng các events/receipts có identity; thiếu usage hoặc legacy evidence phải giữ unknown.
- Một semantic reflection tùy điều kiện sau Story, dùng cùng Lead, không permanent reviewer.
- Chỉ yêu cầu reflection khi có repeated failure/correction, missing recipe, repeated context loading hoặc đề xuất cụ thể của human; otherwise NO_CANDIDATE là kết quả hợp lệ.
- Evidence input mặc định tối đa 12 KiB summary có refs; output tối đa 4 KiB và 3 candidates. Nếu thiếu evidence cho claim thì candidate INSUFFICIENT_EVIDENCE, không tự khái quát.
- Token/requests của reflection được tính vào total Story cost nếu đo được; không chỉ báo savings của execution.

### 7.3 Apply và rollback

- Reflection không thay file tracked, không ghi active policy, không start worker.
- Future human-authorized experiment dùng candidate và baseline cố định trong isolated scope; không sửa kiến trúc giữa một Story đang chạy.
- Với changes ảnh hưởng authority, risk/review, lifecycle, freshness, receipt hoặc recovery: human approval exact scope luôn bắt buộc.
- Bản này cũng không auto-apply các policy changes được xem là LOW.
- Rollback chọn phiên bản kiến trúc trước bằng Git trong một task có authority; không rewrite Story history/receipts, không xóa user work.
- Sau rollback hoặc dependency drift, invalidation làm learned entries tương ứng stale.

## 8. Thứ tự triển khai và checkpoint

Thứ tự đề nghị: T00 → T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11.

Đây là thứ tự task control-plane của migration, không thay quy tắc một durable Story action mỗi invocation. Luna làm tuần tự để giảm context và tránh thay đồng thời nhiều guard.

Mỗi task:
- Load đúng contract/file/task của nó và prerequisites cần thiết.
- Với behavior change, chạy test mới fail vì behavior chưa có, rồi implement nhỏ nhất và chạy lại.
- Với prose edit thuần túy, dùng review invariant và routing scenarios; không viết test chỉ kiểm tra câu chữ.
- Review exact diff, ghi command/result thật và limitations.
- Commit exact owned files sau khi checks của task pass nếu invocation triển khai có quyền Git mutation; không commit các file đang staged của người khác.
- Nếu cùng root cause lặp khoảng ba lần, dừng patch loop để đánh giá lại; không mở rộng scope ngầm.

### T00 — Baseline và fixture độc lập

**Depends on:** không.
**Files:** fixture, baseline test và corpus trong file map.
**Consumes:** policy/helper hiện tại.
**Produces:** createV4Fixture(options) trả root/canonicalRoot và cleanup cho fixture riêng; corpus scenario IDs ổn định.

- [x] Ghi baseline HEAD, runtime versions và Git inventory thực tế vào evidence của task.
- [x] Chạy baseline control-plane suite trước khi thay behavior. Không lấy kết quả cũ trong report làm kết quả hiện tại.
- [x] Lưu baseline ComparisonBundle theo 5.7, gồm instruction source paths/digests/bytes hiện tại và kết quả checks thực chạy; usage chưa đo giữ null. Baseline này là observation, không sửa runtime V3.
- [x] Tạo disposable repository fixtures cho schema v1/v2, canonical/linked worktree, pending/checkpointed/review/done; mọi Story identity phải là synthetic fixture.
- [x] Tạo assertions cho IDLE guard, stale source/receipt (existing artifact-contract baseline plus fixture source-digest guard), wrong slice, exact staging, one-action stop, Human Gate unchanged.
- [x] Corpus có L: mapped LOW và unknown scope; M: multi-consumer scope và incomplete coverage; H: stale approval/receipt và interrupted transaction.
- [x] Fixture không đọc lifecycle thật của Story 2.3/1.5 để quyết định expected result.
- [x] Run: node --test .agents/scripts/v4-architecture-baseline.test.mjs.
- [x] Commit exact fixture/test/corpus khi baseline pass.

**Gate:** baseline được ghi trung thực; fixture isolated. Nếu baseline fail không liên quan, ghi blocker và xử lý theo authority riêng, không sửa product để thông qua migration.

**T00 evidence (2026-09-28):** baseline HEAD `d8e813660e44c54785466836e5c0eda658529b74`; Node `v24.21.0`; npm `11.6.4`; Git `2.49.0.windows.1`; inventory was clean except the human-provided plan in the isolated worktree. Baseline command `node --test (Get-ChildItem -LiteralPath .agents/scripts -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object { $_.FullName })`: 340 pass, 0 fail, 394715.4608 ms. T00 command `node --test .agents/scripts/v4-architecture-baseline.test.mjs`: 6 pass, 0 fail, 13617.0268 ms. Runtime bundle: `.agent-state/v4-observations/evaluations/architecture-upgrade-baseline.json`; provider usage remains `null`, while the pre-T02 instruction baseline is recorded as 30,565 UTF-8 bytes for both implement/verify; scenario fault-injection cases are not yet executed.

### T01 — Observation contract và cost ledger

**Depends on:** T00.
**Files:** observation contract, module và test.
**Consumes:** EventEnvelope/UsageRecord tại 5.1; semantics của v3-telemetry.md.
**Produces:** recordObservation, summarizeObservations và CLI T01.

- [x] Viết tests: duplicate event NOOP; duplicate conflict không overwrite; partial usage giữ null; parent/child request không cộng hai lần; reasoning subset không cộng lại.
- [x] Thêm negative cases: traversal, foreign repository ID, oversized payload, secret-bearing field, malformed units/source semantics.
- [x] Implement atomic per-event writes và deterministic aggregation; không thêm service.
- [x] Report phải tách generated bytes, delivered bytes, estimates và provider measurement.
- [x] Test permission/write failure: event warning không tự đổi progression hoặc active-run.
- [x] Run: node --test .agents/scripts/v4-observations.test.mjs.
- [x] Kiểm tra diff và commit đúng ba file T01.

**Gate:** có ledger usable với dữ liệu measured hoặc unknown; không cần và không được fabricate V4 token baseline.

**T01 evidence (2026-09-28):** `node --test .agents/scripts/v4-observations.test.mjs` — 6 pass, 0 fail, 31498.0896 ms; combined T00/T01 run — 12 pass, 0 fail, 33267.5437 ms. Events use exclusive per-ID JSON creation, duplicate payloads are NOOP, conflicts are retained as conflicts, usage unknowns remain null with reasons, parent exports suppress child double-counting, and write errors leave the IDLE pointer unchanged. No provider usage was fabricated.

### T02 — Routing nhất quán và instruction theo action

**Depends on:** T00, T01 để ghi baseline kích thước.
**Files:** entrypoints/router/context/common runner skill, sáu action docs và hai references.
**Consumes:** authority và action contracts hiện tại.
**Produces:** một common entry nhỏ, đúng một action document cho next_action hợp lệ, lazy triggers rõ.

- [x] Lập invariant checklist: canonical pointer; named lane; Story authority; one action; exact scope; risk/review; no auto fallback; human approval; interrupted transaction.
- [x] Sửa CLAUDE.md để đọc AGENTS rồi chọn lane, không ép V3 bootstrap trước routing.
- [x] Rút AGENTS về authority/routing/invariants; detail có thể chuyển sang đúng action contract nhưng không bỏ điều kiện gating.
- [x] Tách all-action skill; loại đoạn verify lặp. Common entry không tự thực thi action.
- [x] Implementation-techniques giữ RED đúng nguyên nhân → GREEN → refactor trong scope, fresh checks và exact diff; full upstream technique chỉ load khi trigger. Quy tắc local V4 phải nói rõ cách ưu tiên để không mâu thuẫn skill generic.
- [x] Recovery reference chỉ lazy-load khi state thực sự cần; common entry vẫn phải biết khi nào dừng.
- [x] Review bằng routing scenarios: explicit V4; explicit V3; no lane; ambiguous lanes; active pointer; generic continue tại Human Gate; unknown action.
- [x] Đo UTF-8 bytes của context instruction mặc định cho implement/verify so với baseline. Mục tiêu giảm ít nhất 30% cho đường bình thường; đây là acceptance về bytes, không về provider tokens.
- [x] Commit đúng document files; không sửa policy V3 hoặc skills upstream khác.

**Gate:** không mất invariant; provider routing nhất quán; action docs rõ đầu vào/đầu ra/stop. Tài liệu chuyển sang kernel chỉ khi T06/T07 đã pass, nên ban đầu vẫn chỉ dẫn helper hiện hành.

**T02 evidence (2026-09-28):** `node --test .agents/scripts/check-story-finalization.architecture.test.mjs` — 4 pass, 0 fail, 96 ms. Routing review covered explicit V4, explicit V3, missing/ambiguous lane, active/ambiguous pointer, generic continuation at Human Gate, and unknown action; the common entry only routes and never executes an action. UTF-8 instruction basis before T02 was 30,565 bytes; the split action projections measured 19,468 bytes for `implement_slice` (36.31% reduction) and 18,899 bytes for `verify_slice` (38.17% reduction), meeting the 30% byte goal; this is not a provider-token claim. `git diff --check` passed. The six action docs preserve one-action, exact-scope, risk/review, recovery, and Human Gate boundaries; implementation techniques and recovery details are lazy references. No V3 policy/upstream skill was modified.

### T03 — Context projection có provenance

**Depends on:** T02.
**Files:** compile-v4-context.mjs và test; action docs.
**Consumes:** current validated Story/Plan và action metadata.
**Produces:** compileActionContext và projection tại 5.2.

- [x] Test slice chỉ nhận tasks/AC của nó nhưng vẫn giữ risk/invariants cấp Story và dependency dispositions.
- [x] Test AC/task/ref thiếu, source digest drift, wrong action, active pointer: không có READY projection.
- [x] Test không đọc unrelated historical receipt detail cho model; dependency validation cần thiết vẫn hoạt động.
- [x] Test context request không làm thay đổi source, Plan, index hoặc runtime state.
- [x] Implement JSON projection, fingerprint và byte counts; không dùng LLM để tóm tắt normative text.
- [x] Test unknown file scope không biến thành empty allowlist hay quyền sửa toàn repo.
- [x] Run: node --test .agents/scripts/compile-v4-context.test.mjs.
- [x] Commit exact T03 files.

**Gate:** mỗi field quan trọng truy được nguồn; stale dependency không dùng projection cũ; model vẫn có thể yêu cầu thêm evidence có mục đích.

**T03 evidence (2026-09-28):** `node --test .agents/scripts/compile-v4-context.test.mjs` — 3 pass, 0 fail, 4799.5067 ms; combined T00–T03 regression (`v4-architecture-baseline`, `v4-observations`, finalization architecture guard, and context projection) — 19 pass, 0 fail, 15902.5417 ms. The projection is read-only and fingerprinted, carries selected task/AC text plus Story risk, dependency dispositions and source digests, records projection/instruction bytes, and keeps unknown scope/consumers/checks as `status: UNKNOWN` with `paths/items: null`. Wrong action, expected-head drift, Story digest drift, missing task links, and an active canonical pointer return no projection. v1 plans lacking explicit normalized task/AC fields fail closed rather than infer scope; v2 is the READY projection path. Action docs now require a `READY` projection before implementation or verification.

### T04 — Multi-recipe verification và hai scope thật

**Depends on:** T00, T02.
**Files:** registry, hai feature maps, hai recipes, router/test và verification context.
**Consumes:** explicit changed paths và recipe manifests.
**Produces:** aggregate contract tại 5.5, giữ single-feature compatibility.

- [x] Test mapped-only, unmapped-only, mixed scope, multiple recipes, shared checks, dependency-only changed path không bị tính là covered, recipe invalid và execution failure.
- [x] Bỏ hard-code chỉ một FEATURE khỏi selection; registry là allowlist có version, duplicate/missing IDs fail closed.
- [x] Giữ full changed-path union và raw per-recipe output; không overwrite result bằng summary thuận tiện.
- [x] Implement aggregation/dedup đúng cwd/argv/environment/subject.
- [x] Thêm journal-frontend và today-view theo mục 6; inspect tests thực tế và ghi boundary limitations.
- [x] Xác nhận generated-type reference frontend/src/api/schema.generated.ts vẫn khớp generator tại execution HEAD; nếu đã đổi, cập nhật reference có evidence, không tạo file product mới.
- [x] Chạy recipe tests trong supported environment, giữ command/exit evidence. Không khởi tạo backend DB hoặc cài dependency ngầm.
- [x] Nếu refresh challenge-list anchors, review delta và rerun applicable tests; lưu lý do, không rehash để tránh review.
- [x] Run: node --test .agents/scripts/check-verification.test.mjs.
- [x] Run frontend type-check, focused unit tests và contract:check trong mục 6.
- [x] Commit exact registry/router/map/recipe/docs/tests.

**Gate:** runtime có thể route nhiều recipe; unmatched scope vẫn non-PASS; cả hai recipe có test execution evidence thật trước khi tuyên bố active.

**T04 evidence (2026-09-28):** `node --test .agents/scripts/check-verification.test.mjs` — 5 pass, 0 fail, 1490.2304 ms. `node .agents/scripts/check-feature-map.mjs check` returned `VALID` for challenge-list, journal-frontend, and today-view. The registry routes the legacy challenge-list plus schema-v2 `journal-frontend` and `today-view`; mapped-only, unmapped-only, mixed, multi-recipe, shared-check dedup, dependency-only, invalid-registry, execution-failure, and unavailable-environment cases are covered. The generated reference is confirmed by `frontend/scripts/generate-openapi-types.mjs` resolving `contracts/openapi.yaml` to `frontend/src/api/schema.generated.ts`; `npm run contract:check` exited 0.

Real recipe evidence under Node `v24.21.0` after `npm ci` in the isolated worktree: `npm run type-check` exited 0; journal recipe focused tests — 3 files, 26 tests passed, 12.60 s; today recipe focused tests — 2 files, 4 tests passed, 1.30 s; `node .agents/scripts/check-verification.mjs check auto --changed frontend/src/views/ChallengesView.vue` — aggregate challenge-list + journal-frontend PASS, all 6 aggregate checks PASS, shared type-check deduplicated by cwd/argv/environment/subject; `check today-view --changed frontend/src/views/TodayView.vue` — PASS, 2 files/4 tests. Challenge-list map anchors were refreshed only for reviewed current-HEAD drift from `0caa6cb`/`51a867f` (`ChallengesView.vue`, `api/challenges.ts`, `api/__tests__/challenges.spec.ts`), then the map validator and applicable recipes were rerun. No product files, backend DB, or runtime V3 state were changed; recipe limitations remain the documented frontend boundaries.

### T05 — Check executor và provenance

**Depends on:** T01, T04.
**Files:** v4-check-executor.mjs và test; minimal process adapter extraction nếu cần.
**Consumes:** CheckSpec và subject.
**Produces:** executeCheck và CheckEvidence, dùng được bởi registry và kernel.

- [x] Test argv-with-spaces, Unicode paths, cwd normalization, symlink/traversal rejection, timeout và unavailable executable trên fixture.
- [x] Test secrets redaction, bounded diagnostic và output digest.
- [x] Test RED nonzero result không bị coi là acceptance PASS; fabricated summary thiếu provenance không đủ cho reusable evidence.
- [x] Implement spawn không shell, Windows hidden processes, bounded output và explicit toolchain identity.
- [x] Test drift sau check làm evidence không reusable; Node/npm version ngoài supported range được báo rõ.
- [x] Test các check không được phép không chạy dù nằm trong learned candidate.
- [x] Run: node --test .agents/scripts/v4-check-executor.test.mjs.
- [x] Rerun check-verification tests nếu adapter đổi.
- [x] Commit exact T05 files.

**Gate:** kết quả dựa vào process quan sát được; adapter không nâng permissions và không thay output semantics của canonical verifier.

**T05 evidence (2026-09-28):** `node --test .agents/scripts/v4-check-executor.test.mjs` — 4 pass, 1 skipped, 0 fail, 506.7885 ms. The tests cover direct argv with spaces/Unicode, cwd normalization, traversal, timeout, unavailable executable, bounded/redacted diagnostics, output digest, expected nonzero RED, fabricated evidence rejection, trusted recipe/focused-manifest source, learned-command denial before spawn, worktree subject drift, and unsupported Node/npm ranges. The symlink test is present but skipped because this Windows environment denies symlink creation; the executor still rejects symlinks via `lstat`/realpath checks. `node --test .agents/scripts/check-verification.test.mjs .agents/scripts/v4-check-executor.test.mjs` — 9 pass, 0 fail, 1322.485 ms. The adapter uses direct `spawnSync` with `shell: false`, Windows-hidden processes, a 4 MiB cap, 120 s maximum trusted timeout, explicit toolchain/environment identity, bounded redacted diagnostics, and no learned-command execution.

### T06 — Kernel implementation checkpoint và recovery

**Depends on:** T03, T05.
**Files:** kernel/transaction/docs/tests; implementation helper/tests; runner/tests; artifact contract và implementation action doc.
**Consumes:** validated input, exact scope, focused evidence.
**Produces:** prepareAction, checkpointImplementation, inspectActionTransaction.

- [x] Viết real-Git tests cho hai commits: commit 1 đúng product fixture paths; commit 2 schema v2 đúng Plan + implementation receipt; schema v1 Plan-only.
- [x] Test stale HEAD, stale preview, wrong action/slice, dirty unknown index, unrelated staged file và active canonical pointer.
- [x] Preview bind working files/modes, Plan/Story/recipe/policy digests; apply recheck sau acquiring Git-common lock.
- [x] Lock identity gồm repository/worktree/action/slice/transaction; same-scope concurrent caller bị chặn. Không quảng cáo lock này thay cho coordination của mọi tool Git khác.
- [x] Tạo journal trước mutation; ghi phase/checkpoint SHA khi có. Không dùng commit subject để đoán ownership.
- [x] Chỉ stage exact paths; kiểm tra staged set trước và sau commit. Hooks làm thay đổi scope phải được phát hiện.
- [x] Sau commit 1, receipt lấy checkpoint identity thật; metadata commit atomic theo exact set.
- [x] Test failure sau write, sau stage, sau commit 1, trước commit 2, sau commit hook; preserve partial work và báo RECOVERY_REQUIRED.
- [x] Recovery khác invocation phải có human-authorized recovery input và observable journal/explicit checkpoint; không tự xóa lock hoặc replay implementation.
- [x] Rerun cùng transaction đã hoàn thành trả NOOP với cùng durable successor; không có commit thứ ba.
- [x] Đồng bộ D3 trong artifact contract/action docs. Không migrate historical receipts.
- [x] Runner chỉ dùng kernel khi có operation/input explicit; helper readiness cũ không trở thành write operation.
- [x] Test reject kernel flags trộn approval/start flags, hoặc input Story/action/slice khác validated Plan; không cho metadata input trở thành quyền complete_story.
- [x] Run: node --test .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/check-slice-implementation.test.mjs .agents/scripts/v4-story-runner.test.mjs.
- [x] Inspect adversarial diff và commit exact T06 files.

**Gate:** final state checkpointed, next_action verify_slice cùng slice; không tự verification. Recovery không cần chat history và không bỏ mất files/index.

**T06 evidence (2026-09-28):** `node --test .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/check-slice-implementation.test.mjs .agents/scripts/v4-story-runner.test.mjs` — 48 pass, 0 fail, 47.699 s. Real-Git fixtures prove schema-v2 commit 1 implementation-only plus commit 2 Plan+new implementation receipt, schema-v1 Plan-only, exact staged/commit scopes, working-file/mode and Plan/Story/recipe/policy bindings, stale HEAD/preview/policy, active canonical pointer, dirty/unrelated index, same-scope lock identity, pre-commit scope injection, journal phases, failures after stage/write/commit 1/before commit 2, explicit checkpoint recovery without replay, and completed-transaction `NOOP` with no third commit. Runner/helper regression passes and keeps the old readiness helper read-only. The adversarial review added preview-fingerprint revalidation, receipt identity/immutability checks, completion/finalization authority rejection, binary-safe Git blob comparison, and D3 documentation updates. No historical receipt, Story lifecycle, sprint status, V3 pointer, or product code was changed.

### T07 — Kernel verification, bounded review và progression

**Depends on:** T04–T06.
**Files:** verification flow test; kernel/transaction; relevant helper/projection tests/docs.
**Consumes:** fresh checkpoint manifest, CheckSpecs, canonical aggregate và semantic judgments có evidence.
**Produces:** verifySlice, recordSliceReview.

- [ ] Test canonical output được truyền nguyên ý nghĩa sang escalation; HIGH/MEDIUM luôn REVIEW_REQUIRED.
- [ ] Chạy focused checks qua executor, canonical recipes và escalation trong thứ tự được định nghĩa; không sửa product.
- [ ] Canonical/required check failure giữ non-progressing state; không tự chọn fix action.
- [ ] Khi review cần thiết, prepare-change-evidence tạo bounded groups và oversized units; giữ đầy đủ coverage.
- [ ] Trả REVIEW_REQUIRED với immutable pending evidence refs, exact questions/scope/fingerprint; same Lead review theo contract hiện có.
- [ ] NEED_MORE_EVIDENCE chỉ cho evidence round trong budget; CHANGES_REQUIRED chặn progression.
- [ ] record-review reject stale checkpoint/policy, missing unit, duplicate unit, reordered unit, incomplete questions hoặc approve sai scope.
- [ ] LOW complete PASS/no flags có thể persist verification không review. INCOMPLETE chỉ progression qua điều kiện 5.5 và disclosure.
- [ ] Metadata commit chỉ Plan + fresh verification/review receipts cần thiết; không sửa old receipts, Story normative text hoặc sprint.
- [ ] Successor lấy từ validated dependency graph/current slice; multiple eligible ambiguity không được đoán từ file order.
- [ ] Final slice chỉ persist finalize_story; không execute finalization.
- [ ] Test retry không duplicate receipts/commits; product/index drift trong lúc review làm continuation STALE.
- [ ] Run: node --test .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/check-slice-verification.test.mjs .agents/scripts/v4-action-kernel.test.mjs.
- [ ] Commit exact T07 files sau review invariant.

**Gate:** plumbing chạy bằng code, semantic review vẫn rõ chủ thể; canonical INCOMPLETE không biến thành PASS và Human Gate không bị chạm.

### T08 — Hooks quan sát sau session và Story

**Depends on:** T01, T06–T07.
**Files:** hooks test, observation module, runner/kernel và lifecycle action docs.
**Consumes:** actual kernel/helper results, explicit host/Lead session checkpoint metadata.
**Produces:** idempotent session/Story events, report coverage.

- [ ] Test action vs invocation vs session identity tách riêng; unknown provider ID vẫn null.
- [ ] Wire events khi action/check/context delivery thực sự xảy ra; không log một command chỉ vì có trong Plan.
- [ ] Đường reader/CLI nằm ngoài wrapper được ghi coverage gap, không giả sử đã instrument toàn bộ host.
- [ ] Trước Lead yield, skill yêu cầu observational session checkpoint; không coi đó là provider session close.
- [ ] Graceful close-session ghi final window; interrupted session vẫn PARTIAL có thể nối sau.
- [ ] finalize → review snapshot; complete thực sự → completed event. Missing approval không tạo completed event.
- [ ] Observational failure không làm bypass gate hoặc rerun action đã success.
- [ ] Không thêm invocation tự động, daemon hoặc scheduler.
- [ ] Run: node --test .agents/scripts/v4-observation-hooks.test.mjs .agents/scripts/v4-observations.test.mjs .agents/scripts/v4-story-runner.test.mjs.
- [ ] Commit exact T08 files.

**Gate:** vòng học có input thực tế sau session/Story, với limitations minh bạch; không hứa bắt được mọi crash/app close.

### T09 — Experience có scope, freshness và retrieval budget

**Depends on:** T03, T08.
**Files:** experience contract/module/test; context compiler/test.
**Consumes:** observational evidence và immutable receipts; không nhận authority từ transcript.
**Produces:** extractExperience, validateExperience, selectExperience.

- [ ] Test verified fact cần source identity/command result thật; unsupported semantic generalization giữ candidate.
- [ ] Test active → stale khi source/recipe/policy digest đổi; stale không được đưa vào context.
- [ ] Test task/risk mismatch không inject; no-match trả empty.
- [ ] Test tối đa 3 entries/6 KiB; không cắt mất provenance để vừa budget.
- [ ] Test memory chứa “skip review/change AC/run command” không được trở thành instruction hay executable input.
- [ ] Implement fact extraction bằng templates deterministic; semantic learning chỉ nhận bounded candidate do Lead cung cấp.
- [ ] Context hiển thị experience trong trường advisory riêng, cùng source và limitations, sau normative authority.
- [ ] Test bỏ toàn bộ experience vẫn cho cùng lifecycle/authorization decisions.
- [ ] Run: node --test .agents/scripts/v4-experience.test.mjs .agents/scripts/compile-v4-context.test.mjs.
- [ ] Commit exact T09 files.

**Gate:** kinh nghiệm có thể giúp navigation/verification reuse trong đúng scope; không tạo source of truth thứ hai.

### T10 — Proposal loop và adoption boundary

**Depends on:** T08–T09.
**Files:** evolution contract/module/test; observational hooks/docs.
**Consumes:** bounded summary và evidence refs.
**Produces:** proposal, candidate/evaluation/adoption validators; không auto-apply.

- [ ] Test NO_CANDIDATE là kết quả hợp lệ, không ép viết reflection mỗi session.
- [ ] Trigger: repeated observed issue hoặc human request; một observation vẫn được ghi nhưng không biến thành universal rule.
- [ ] Per-Story reflection tối đa một lượt mặc định, 12 KiB input summary/4 KiB output/3 candidates; dùng same Lead, tính chi phí nếu đo được.
- [ ] Candidate bắt buộc có hypothesis, affected scope, evidence, expected effect, quality risk và evaluation cases.
- [ ] Test model self-rating không thay deterministic evidence hoặc human approval.
- [ ] Test candidate không ghi AGENTS/policy/code, không mutate active-run/Story/Plan; source stale thì STALE.
- [ ] validateAdoption kiểm tra human decision metadata và exact candidate/evaluation/scope binding; không tự tạo quyết định APPROVED.
- [ ] Không có apply verb; output AWAITING_HUMAN chỉ xuất hiện khi evidence đủ cho đề xuất adoption theo giới hạn report.
- [ ] Test thiếu measurements → INCONCLUSIVE, thiếu quality checks → không AWAITING_HUMAN theo claim chất lượng.
- [ ] Run: node --test .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-observation-hooks.test.mjs.
- [ ] Commit exact T10 files.

**Gate:** hệ thống tự tìm cơ hội và tự đề xuất được; human vẫn quyết định adoption, không có policy self-modification.

### T11 — Benchmark, full regression và bàn giao

**Depends on:** T00–T10.
**Files:** benchmark tool/test, corpus, validation report, historical migration note.
**Consumes:** comparable baseline/candidate observations và fixed corpus.
**Produces:** compare report có deterministic/empirical/inconclusive tách biệt.

- [ ] benchmark-v4.mjs compare --baseline <json> --candidate <json> nhận normalized result bundles; không tự gọi provider hoặc tạo product Story.
- [ ] Test reject comparison khác workload/source digest/model/effort/toolchain mà thiếu explicit comparability reason; giữ từng metric coverage.
- [ ] Chạy L/M/H corpus bằng fixtures với fault injection và guard cases; không dùng lifecycle Story thật làm mutable fixture.
- [ ] Đo instruction bytes trước/sau theo action, command/helper count và repeated artifact reads khi có observation.
- [ ] Đánh giá LOW no-review, MEDIUM mandatory review, HIGH negative/recovery; không dùng tỷ lệ review giảm làm mục tiêu cho HIGH.
- [ ] Full control-plane regression theo mục 9. Không chạy lại toàn bộ product suite nhiều lần nếu không có thay đổi/failure mới.
- [ ] Frontend checks cho recipes phải được chạy dưới engine phù hợp; unavailable environment không được ghi PASS.
- [ ] Nếu human sau này cho phép empirical pilot: dùng paired workloads cùng model/effort và input snapshot, ghi tất cả retry/reflection cost. Ít nhất 3 paired repetitions cho mỗi workload class được claim; số này chỉ là screening, không chứng minh generalization.
- [ ] Nếu chưa có empirical pilot/provider export: báo implementation validated bằng deterministic evidence, token savings/real-Story quality impact INCONCLUSIVE. Không tự chạy Story thật để lấp dữ liệu.
- [ ] Viết docs/agent-architecture/v4-upgrade-validation.md gồm coverage U1–U6, commands/results, remaining limitations, adoption/rollback considerations.
- [ ] Review final diff và Git inventory, xác nhận không có product/Story/sprint/V3 runtime changes ngoài fixture.
- [ ] Commit exact T11 files; trình human final migration scope. Không tự merge/deploy hoặc gán hoàn tất cho Story khác.

**Gate:** tất cả deterministic obligations pass, không unresolved HIGH/MEDIUM finding; performance claims được giới hạn đúng evidence. Rollout vào Story mới do human quyết định.

## 9. Verification commands và negative matrix

Chỉ chạy trong lần triển khai được authorize. Root package.json hiện không có test script; không invent npm test ở root.

Full control-plane suite từ repository root, PowerShell:

    $v4TestFiles = @(Get-ChildItem -LiteralPath .agents/scripts -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
    node --test @v4TestFiles

Frontend recipe gate từ frontend/:

    npm.cmd run type-check
    npm.cmd run test:unit -- --run src/views/__tests__/journal.spec.ts src/views/__tests__/challenges.spec.ts src/api/__tests__/challenges.spec.ts src/views/__tests__/today.spec.ts src/views/__tests__/account-time.spec.ts
    npm.cmd run contract:check

Trên host không phải Windows, dùng npm executable tương ứng; process adapter phải xử lý portable argv, không shell-string substitution.

Diff hygiene:

    git diff --check

| Nhóm | Trường hợp bắt buộc | Expected behavior |
|---|---|---|
| Authority | active/ambiguous canonical pointer; linked worktree có local IDLE giả | BLOCKED, không mutation |
| Scope | unrelated staged path; rename/delete/symlink path; missing inventory | exact scope hoặc fail closed, không broad add |
| Freshness | HEAD/Story/Plan/policy/toolchain drift giữa preview và apply | STALE/rerun, không dùng evidence cũ |
| Durability | crash từng window trước/sau hai commits, failed hooks | preserve partial work, exact recovery snapshot |
| Concurrency | hai apply cùng scope; foreign lock | một owner hợp lệ, caller khác bị chặn, không xóa lock của nhau |
| Idempotency | cùng transaction/event/Story observation được gọi lại | NOOP hoặc same result, không duplicate side effect |
| Verification | mixed mapped/unmapped; nhiều recipe; check failure dưới INCOMPLETE | giữ raw results, không false PASS/progression |
| Review | HIGH PASS; stale approval; incomplete evidence units | review required hoặc stale/block |
| Human Gate | generic continue; missing/exact-scope stale approval | không done |
| Context | thiếu AC/invariant/source; unrelated history lớn | không bỏ requirement để giảm bytes |
| Telemetry | null usage; inclusive reasoning; repeated exports; reflection cost | không zero-fill/double-count/hide cost |
| Learning | stale experience; malicious instructions; pattern chỉ một mẫu | stale/candidate/data-only, không authority |
| Evolution | absent measurements; quality regression; stale candidate | INCONCLUSIVE/REJECTED/STALE, không auto-apply |
| Isolation | genuine Story 1.5/2.3 status thay đổi độc lập | tests không phụ thuộc live lifecycle |

Không viết test thuần so khớp văn bản hướng dẫn, hoặc snapshot toàn file chỉ để hợp thức hóa edit. Test phải falsify behavior/invariant có ý nghĩa.

## 10. Definition of Done của migration

- [ ] U1: implement/verify mechanical steps có executable path; model chỉ cung cấp semantic work/judgment cần thiết.
- [ ] U2: context theo action và projection có provenance; instruction bytes giảm theo mục tiêu mà invariant vẫn đủ.
- [ ] U3: Codex/Claude đi cùng lane selection; V3 fallback đúng explicit routing.
- [ ] U4: multi-recipe có coverage/aggregation tests; journal-frontend và today-view có executed checks.
- [ ] U5: measured/estimated/unknown phân biệt; usage totals không double-count; session coverage minh bạch.
- [ ] U6: observations → experience → proposal → evaluation hoạt động; stale memory bị loại; auto-apply policy không tồn tại.
- [ ] Backward compatibility: schema v1/v2, existing action/lifecycle checks, Human Gate và negative gates còn pass.
- [ ] Exact-scope/recovery/concurrency tests đủ evidence; no silent reset hoặc state takeover.
- [ ] Full control-plane suite và recipe gates có fresh executed evidence.
- [ ] Final diff không chứa product implementation, real Story lifecycle rewrite hoặc V3 runtime mutation.
- [ ] Không unresolved HIGH/MEDIUM finding.
- [ ] Human nhận exact migration diff và validation report để quyết định integration/rollout.

Phân biệt ba trạng thái trong báo cáo cuối:
1. Implementation verified: deterministic implementation obligations đã pass.
2. Optimization measured: chỉ khi có comparable measurements thật cho claim tương ứng.
3. Human adopted: chỉ khi human duyệt exact migration/candidate scope.

Không dùng trạng thái 1 để tự suy ra trạng thái 2 hoặc 3.

## 11. Handoff cho Luna

Human có thể dùng prompt sau **khi thực sự muốn bắt đầu triển khai**:

> Triển khai plan docs/superpowers/plans/2026-09-27-v4-agent-architecture-evolution-plan.md bằng Luna 5.6 Max trong lane V4 Lite architecture/control-plane migration. Đọc canonical active-run pointer trước, chỉ làm khi IDLE rõ ràng. Thực hiện tuần tự từng task, giữ toàn bộ invariant và ngoài-phạm-vi trong plan. Tái sử dụng helper hiện có; không triển khai Story 1.5 hoặc Story khác, không gọi Orca/AGY/subagent theo mặc định, không thay V3 runtime state. Dùng isolated scope phù hợp, giữ nguyên công việc đang có của người khác. Báo evidence và limitations thật; không tự merge, áp dụng Human approval hoặc chạy successor Story action. Nếu gặp ambiguity làm đổi authority/product intent, dừng đúng boundary và trình quyết định cụ thể.

Tài liệu này được tạo ở chế độ plan-only. Không task triển khai, test result, token saving, human adoption hoặc architecture rollout nào được đánh dấu đã hoàn thành tại thời điểm lập plan.
