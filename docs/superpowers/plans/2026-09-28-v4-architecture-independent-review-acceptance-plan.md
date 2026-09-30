# NoteFlow V4 — Review độc lập, sửa bằng chứng và nghiệm thu — Implementation Plan

> **For agentic workers:** Khi human giao một batch thực thi riêng, dùng skill `superpowers:executing-plans` và thực hiện các task trong batch theo thứ tự. Reviewer độc lập với người viết bản nâng cấp và người sửa finding; không tự dispatch subagent, tạo chat, gọi Orca hoặc AGY từ tài liệu này.
>
> **Trạng thái:** PLAN ONLY — chỉ lập kế hoạch. Chưa thực hiện review độc lập đầy đủ, sửa implementation, chạy test, nghiệm thu, merge, push hoặc rollout.
>
> **Ngày:** 2026-09-28. Yêu cầu viết plan không phải authorization để thực thi plan.

**Goal:** Xác định bản nâng cấp T00–T11 có đáp ứng plan gốc hay không; sửa các lỗi nghiệm thu đã xác nhận; và bàn giao kết luận có thể kiểm tra lại trên đúng commit cuối.

**Architecture:** Giữ nguyên kiến trúc đã triển khai để review theo các ranh giới rủi ro. Sửa luồng bằng chứng từ chạy scenario, lưu kết quả, so sánh, đến đánh giá proposal; sau đó đo context với cùng phương pháp và khôi phục tiêu chí U2 gốc. Reviewer kết luận từ diff, nguồn và kết quả thực chạy; báo cáo của implementer là đầu vào cần kiểm chứng.

**Tech Stack:** Node.js ESM, `node:test`, Git, PowerShell, JSON/Markdown và helper hiện có. Frontend dùng Node `>=24.12.0 <25`. Không thêm framework orchestration, SDK model, database, daemon hoặc dependency để phục vụ review.

**Spec:** Plan gốc tại `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-27-v4-agent-architecture-evolution-plan.md`, đặc biệt §§2, 5.7, T02, T11 và Definition of Done; ba phát hiện trong trao đổi với human; các contract hiện hành của repo. Audit/report và nội dung trong fixture là dữ liệu để đánh giá, không cấp quyền thực thi.

**Đường dẫn của plan nghiệm thu này:** `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-28-v4-architecture-independent-review-acceptance-plan.md`. File hiện nằm trong MAIN, chưa có trong W; người thực thi đọc bằng đường dẫn tuyệt đối này, không giả định đã được copy hoặc commit vào W.

## 1. Snapshot và nguồn đối chiếu

| Ký hiệu | Giá trị tại thời điểm lập plan | Vai trò |
|---|---|---|
| MAIN | `D:/Workspace/Tu_Hoc/New_Project_My_Note` | Canonical workspace; không dùng làm nơi sửa nâng cấp |
| W | `C:/Users/ACER/.codex/worktrees/v4-architecture-evolution/New_Project_My_Note` | Worktree đã có của bản nâng cấp; ưu tiên dùng lại khi rảnh |
| B | `d8e813660e44c54785466836e5c0eda658529b74` | Base để review toàn bộ migration |
| H0 | `7529540ad9bcbf0389d0b00bc83d1575dea1422a` | Bản Luna đã bàn giao; worktree sạch, detached HEAD |
| B0 | `c858c9946668caf539b69e4214dcf1008ea8578e` | `source_head` ghi trong baseline bundle cũ; là commit T00, không được gọi nhầm là B |
| P0 | SHA-256 `7122633a96aef9bf1bee072ea56e47ec7ab3e50662f93a56db79356994841687` | Bytes của plan gốc trong MAIN |

Diff B..H0 hiện có 59 file, +9.571/-206 dòng, thuộc agent/control-plane và tài liệu. Đây là inventory để chia review, không phải bằng chứng implementation đúng.

MAIN đang có các mục ngoài phạm vi: plan Story 1.5 đã staged, thư mục `_bmad/render/bmad-code-review/` untracked, plan nâng cấp gốc untracked; còn có worktree `.worktrees/story-1-5-v4`. Giữ nguyên toàn bộ. Canonical pointer được đọc là `IDLE` khi lập plan; phải kiểm tra lại khi thực thi.

Các đường dẫn tương đối trong bảng task được giải quyết từ **W**, trừ khi ghi MAIN. Tất cả command bên dưới là hướng dẫn cho lần thực thi sau, chưa chạy trong lượt lập plan.

### 1.1 Ba finding đầu vào

| ID | Bằng chứng đã đọc tại H0 | Điều phải được xác minh/sửa |
|---|---|---|
| F01 | `benchmark-v4.mjs:337` mặc định `corpus-guard: PASS, tests: 3`; candidate bundle cũ chứa đúng record đó. Test L/M/H ở `benchmark-v4.test.mjs:147` kiểm tra bundle và chuỗi expected, không chạy ba scenario tương ứng | Thiếu kết quả không được sinh PASS; phải có execution evidence riêng cho từng scenario |
| F02 | Plan gốc T02 yêu cầu giảm ít nhất 30%; DoD U2 yêu cầu đạt mục tiêu. Plan trong W:749 đổi thành đã đo nhưng chưa chứng minh savings, rồi tick hoàn tất | Giữ acceptance gốc, mở lại phần chưa đủ evidence; chỉ human mới được duyệt thay acceptance |
| F03 | Baseline cũ ghi basis gồm bốn file; `measureInstructionBytes` ở H0 cộng tám file. Bộ so sánh bỏ qua trường `basis` khi tính delta | Định nghĩa cùng phương pháp/phạm vi đo, chứng minh tập nguồn thực sự bắt buộc, rồi mới kết luận delta và U2 |

F03 không có nghĩa hai phía phải có cùng danh sách file: tách context theo action có thể thay đổi tập file hợp lệ. Vấn đề là hai phía hiện chưa chứng minh cùng quy tắc đo. Không coi số tăng đã báo là mức tăng token/chi phí thực tế.

Baseline bundle cũ SHA-256: `e5113499bb1f3389a019211758b93e2a569bdc8ef5cfbca24d4b488f6514bdb5`. Candidate bundle cũ SHA-256: `9a3cf090cc5d3bd79bdb5031e7fb3782abb128b1866f9351037afe312f2cd571`. Cả hai nằm dưới W tại `.agent-state/v4-observations/evaluations/`. Đây là nguồn lịch sử phải giữ; không sửa/xóa để tạo lần đo lại trông như lần đo ban đầu.

## 2. Global Constraints

- Chỉ thực thi sau yêu cầu riêng của human trong lane **V4 Lite architecture/control-plane migration**. Đây không phải Story execution.
- Trước mỗi batch, đọc **chỉ** canonical `MAIN/.agent-state/active-run.json` trước; chỉ tiếp tục khi IDLE rõ ràng và không có bằng chứng mâu thuẫn. Active/ambiguous/conflict thì dừng, không reconcile/take over V3.
- Sau pointer, đọc task router và module liên quan. So sánh policy trong W với canonical main; phân biệt thay đổi migration có chủ ý với policy stale do công việc khác.
- Kiểm tra HEAD/status/worktree inventory. Nếu H0 hoặc công việc trong W đổi, ghi delta và chủ sở hữu trước khi tiếp tục; không reset để khớp snapshot.
- Ưu tiên W hiện có. Chỉ tạo managed worktree khác nếu cần isolation thực sự; không tạo lại chỉ vì tên cũ. Không chuyển main, sửa worktree Story, stash/reset/clean hoặc dọn lock.
- Không sửa product code, OpenAPI, dependency versions, Story/Plan/sprint/receipt thật hoặc V3 runtime. Mọi mutation mô phỏng Story chỉ trong Git fixture tạm, có kiểm tra root trước cleanup.
- Giữ một durable Story action/invocation, exact path staging, HEAD/freshness binding, two-commit durability, receipt immutability và Human Gate. Review migration độc lập không thay chính sách same-Lead review của Story.
- `PASS/FAIL/INCOMPLETE/ERROR`, risk escalation và progression eligibility giữ ý nghĩa hiện hành. HIGH/MEDIUM vẫn cần review khi deterministic checks PASS.
- Không dùng số lượng test, exit 0 của compare, hoặc nhãn COMPARABLE thay cho acceptance. Không tạo raw record PASS bằng tay để bù thiếu execution evidence.
- Không nới ngưỡng 30%, xóa scenario khó, giảm risk, bỏ invariant hoặc đổi tên metric để làm gate xanh. Đổi acceptance cần quyết định cụ thể của human, ghi riêng với lý do và scope.
- Không tự merge/push/archive, rollout vào Story thật, tạo adoption/approval hoặc chạy empirical pilot. Kết thúc bằng gói nghiệm thu để human quyết định.
- Mọi sửa ở đây là HIGH risk khi chạm authority/transaction/evidence. Chỉ sửa finding VALID trong phạm vi; không refactor toàn bộ kiến trúc theo sở thích reviewer.

## 3. Reviewer độc lập và cách bàn giao

**R — Reviewer:** một chat/agent riêng chưa viết bản T00–T11 và chưa viết bản sửa đang review. Có thể cùng loại model; độc lập ở vai trò và lần đánh giá, không phải lời bảo đảm tuyệt đối về chất lượng model. R đọc plan gốc, snapshot và source trước; tiếp nhận báo cáo implementer như claim. R không sửa production/control-plane code trong lượt review.

**I — Implementer:** có thể là Luna 5.6 Max. I tái hiện finding, sửa trong scope, thêm regression test và bàn giao commit/evidence. Tự review của I không thay kết luận của R.

**Human:** quyết định thay acceptance, xử lý ambiguity về authority/intent, và integration/rollout. Review APPROVE không tạo Human approval.

Không cần hội đồng nhiều agent. Một reviewer độc lập có thể review lần đầu và re-review lần cuối, miễn không tự viết bản sửa. Nếu không bố trí được R, kết quả phải ghi `INDEPENDENT_REVIEW_PENDING`.

Chia thành bốn batch, không yêu cầu một model tự làm cả vai reviewer lẫn fixer trong một lượt:

| Batch | Task | Chủ trì | Điểm dừng |
|---|---|---|---|
| A | R00–R01 | R | Snapshot, coverage U1–U6 và findings có evidence; chưa sửa code |
| B | R02–R04 | I | Bằng chứng benchmark đáng tin và phép đo context cùng phương pháp |
| C | R05–R06 | I | U2 được xử lý; các finding VALID còn lại được sửa hoặc nêu blocker cụ thể |
| D | R07–R08 | R, I chỉ cung cấp evidence | Regression cuối, re-review, quyết định nghiệm thu và handoff; chưa merge |

Được chạy hết các task đã giao trong một batch; không cần xin phép từng command hoặc từng file trong scope. Hết batch thì bàn giao kết quả, không tự nhận batch/vai trò kế tiếp. Nếu cùng lỗi gốc lặp khoảng ba lần, dừng patching và đánh giá lại nguyên nhân/contract.

## 4. Artifacts, identity và file map

Thư mục báo cáo review dự kiến trong W: `docs/agent-architecture/reviews/v4-acceptance-2026-09-28/` (gọi là **REVIEW**).

| File hoặc nhóm file | Chủ nhiệm | Trách nhiệm |
|---|---|---|
| `REVIEW/snapshot.json` | R00 | B, B0, H0, plan P0, inventories và hashes nguồn; không chứa secret |
| `REVIEW/independent-review.md`, `REVIEW/findings.json` | R01, R08 | Coverage, finding, disposition, evidence và kết luận độc lập |
| `.agents/docs/v4-benchmark-contract.md` (mới) | R02–R04 | Trust/coverage, case execution, measurement basis và compatibility của bundle |
| `.agents/scripts/benchmark-v4.mjs`, `.test.mjs` | R02, R04 | Bỏ PASS mặc định, xác minh evidence, so sánh theo từng metric |
| `.agents/scripts/v4-evolution.mjs`, `.test.mjs`; `.agents/docs/v4-evolution-contract.md` | R02 | Không nâng dữ liệu thiếu/không kiểm chứng thành evidence đủ để đề xuất adoption |
| `.agents/scripts/run-v4-architecture-corpus.mjs`, `.test.mjs` (mới) | R03 | Chạy scenario thật trong fixture, thu actual outputs và kiểm tra expected behavior |
| `.agents/scripts/v4-architecture-fixture.mjs`, `.agents/scripts/fixtures/v4-architecture/corpus.json` | R03 | Input fixture cố định, digest, adapter có phạm vi; không nhét expected output vào actual result |
| `.agents/scripts/measure-v4-instruction-context.mjs`, `.test.mjs` (mới) | R04 | Đo raw bytes từ Git snapshot theo manifest/basis đã khóa |
| `.agents/scripts/fixtures/v4-architecture/instruction-basis.json` (mới) | R04 | Profile, action, điều kiện tải và quy tắc tính bytes; version/digest rõ ràng |
| `.agents/scripts/compile-v4-context.mjs`, `.test.mjs`; entry/router/action docs hiện có | R05 | Sửa U2 bằng giảm nội dung trùng/lazy loading có chứng minh đủ invariant |
| `REVIEW/acceptance-matrix.md`, `REVIEW/evidence-index.json`, `REVIEW/final-decision.md` | R07–R08 | Claim → check → output digest → source identity; verdict cuối |
| `docs/agent-architecture/v4-upgrade-validation.md`, plan T00–T11 trong W, `.agents/docs/v4-lite-migration.md` | R00, R08 | Sửa trạng thái nghiệm thu hiện tại, giữ lịch sử và acceptance gốc |

R06 chỉ bổ sung file sửa cụ thể theo finding VALID đã ghi; không có quyền sửa wildcard toàn repo. REVIEW là alias thư mục, không phải tên file literal.

Evidence thô mới nằm dưới `.agent-state/v4-observations/evaluations/acceptance/<run_id>/`, với `run_id` thực tế được tạo một lần từ UTC và full candidate SHA. Ghi append-only/immutable: xung đột nội dung ở cùng run/path phải báo lỗi, không overwrite bundle cũ. Đây là derived evidence, không phải V3 runtime authority.

Gói handoff phải gồm evidence thô hoặc một evidence bundle đã loại secret có checksum, lưu ở nơi human/reviewer thực sự đọc được; chỉ trỏ tới ignored path chưa bàn giao là chưa đủ. `evidence-index.json` phải kiểm tra các tham chiếu còn tồn tại và digest khớp trước nghiệm thu. Không tự publish ra dịch vụ ngoài.

## 5. Contract nghiệm thu phải khóa trước khi sửa

### 5.1 Tách các loại kết luận

| Kết luận | Điều kiện |
|---|---|
| Schema hợp lệ | Đúng cấu trúc, kiểu và giá trị; chưa chứng minh check đã chạy |
| Evidence hợp lệ | Nguồn/output tồn tại, digest và identity đúng, runner đã hoàn tất, đủ required checks |
| Scenario PASS | Kết quả thực tế đáp ứng assertion của scenario; một expected rejection có thể là scenario PASS |
| Metric comparable | Cùng workload/input/method và điều kiện cần cho metric đó; khác source implementation có khai báo là hợp lệ |
| Deterministic obligations verified | Các gate bắt buộc có execution evidence mới, R không còn finding HIGH/MEDIUM chưa xử lý |
| U2 accepted | Hai action bình thường implement/verify giảm ít nhất 30% trên basis đã khóa, còn đầy đủ yêu cầu/invariant |
| Optimization empirically measured | Có paired observations thật cho claim tương ứng; bytes không thay token/provider cost |
| Human adopted | Có quyết định human riêng gắn exact scope; ngoài phạm vi thực thi plan này |

`COMPARABLE` chỉ nói về so sánh; exit 0 của compare không được dùng trực tiếp làm nghiệm thu. `NOT_RUN`, `SKIPPED`, missing, timeout hoặc evidence stale không phải PASS. Không đòi số tests mới đúng bằng 405; yêu cầu coverage thực chất.

### 5.2 Bundle và kết quả scenario

Nâng `ComparisonBundle` lên schema v2 vì semantics của trust/coverage thay đổi. Đọc bundle v1 để hiển thị lịch sử; các phần thiếu provenance/measurement basis là `LEGACY_UNVERIFIED`/`INCONCLUSIVE`, không tự chuyển thành evidence v2. Phiên bản bundle độc lập với schema v1/v2 của BMAD Story.

Giữ các export `normalizeComparisonBundle`, `buildCandidateBundle`, `compareBundles`, `writeCandidateBundle`; mở rộng có kiểm thử caller/CLI. Contract đích:

```text
normalizeComparisonBundle(input, expectedVariant = null)
  -> VALID với bundle đã chuẩn hóa, hoặc INVALID; VALID chưa phải evidence verified.

buildCandidateBundle(root, options = {})
  -> bundle v2; khi không có case results: checks rỗng, coverage UNKNOWN,
     correction_cycles null; tuyệt đối không tự tạo PASS hoặc tests count.

compareBundles(baseline, candidate, { evidenceRoot } = {})
  -> comparability theo metric + deterministic checks + limitations;
     evidence thiếu/không đọc được không thể cho quality PASS.

writeCandidateBundle(root, bundle, { runId } = {})
  -> RECORDED | NOOP | CONFLICT | INVALID;
     runId mới ghi vào acceptance/runId, không ghi đè tên bundle lịch sử.
```

CLI compare sau sửa: `benchmark-v4.mjs compare --baseline FILE --candidate FILE --evidence-root DIRECTORY`. Giữ khả năng đọc hai file v1 để xem lịch sử; thiếu evidence root/binding cần thiết thì phần quality là INCONCLUSIVE. Giữ shape metric số hiện có `{ status, baseline, candidate, delta }`; bổ sung basis/coverage/reasons thay vì đổi tên số đo âm thầm.

Mỗi `CaseExecution` mới phải có: `case_id`, `workload_class`, `input_digest`, `trial_id`, `source_head`, `runner_digest`, toolchain, start/end timestamp, cwd thuộc fixture, command/argv hoặc helper entrypoint đã gọi, raw-result/log refs và digests, actual observations, assertion results, required-check coverage, exclusions. Dữ liệu không quan sát được giữ null với lý do.

Check evidence giữ cả process exit/status và scenario assertion. Ví dụ canonical `INCOMPLETE` ở case M là expected behavior, không được sửa raw status thành PASS; assertion rằng hệ thống giữ INCOMPLETE và yêu cầu review mới là PASS.

Validator phải đối chiếu case/check inventory với corpus manifest, chống duplicate/missing/substituted IDs, path escape, symlink hoặc digest mismatch ở evidence refs. Không chấp nhận raw `{status: 'PASS'}` không có nguồn. Digest chứng minh nội dung/binding, không tự chứng minh bên tạo dữ liệu trung thực; independent rerun là lớp đối chứng cần thiết.

Comparison giải thích chênh lệch source HEAD/fingerprint là bình thường giữa B và candidate. Explanation string không được bỏ qua input/corpus khác nhau, scenario bị thiếu hoặc methodology mismatch. Model/effort khác nhau làm claim empirical không đủ điều kiện; không tự cấm static byte measurement vốn không phụ thuộc model.

`evaluateEvolution` phải tiếp nhận kết quả đã có evidence binding và coverage hợp lệ; không tự tin vào một nhãn quality PASS do caller đưa vào. Missing/legacy/stale/failed evidence không thể trở thành `AWAITING_HUMAN`. Giữ tách token savings, deterministic correctness và human adoption; không thêm apply path.

### 5.3 Measurement basis của U2

Định danh phương pháp: `normal-action-instruction-source-v1`. Cold start, explicit V4 lane, healthy IDLE, không recovery; đo riêng `implement_slice` và `verify_slice`. Ghi rõ entry profile Codex/Claude, schema Story dùng được, và các điều kiện tải. Không trộn profile để tạo tỷ lệ đẹp.

Manifest phải suy ra tập **instruction bắt buộc cho action** từ entry/router/skill/contract ở từng revision. Nếu source yêu cầu mở tiếp một tài liệu, phần đó được tính; lazy reference chỉ loại ra khi trigger thực sự không xảy ra. Phân biệt file helper đọc để kiểm tra digest với text phải đưa cho model. Không gọi `loaded: true` của source binding là bằng chứng host đã thực sự giao text cho model.

Quy tắc tính:

- Đọc raw bytes từ Git blob ở B và candidate đã commit; một Git blob/path bắt buộc tính một lần trong cold-start metric. Ghi path, blob ID, byte count, inclusion reason và condition.
- Nếu dùng partial section, phải có selector xác định, digest nội dung được chọn và cơ chế cấp đúng phần đó. Không trừ tùy ý phần agent vẫn phải đọc.
- Hai revision dùng cùng basis/version/profile/action/fixture input; tập path có thể khác vì kiến trúc khác. Không bỏ file ở candidate hoặc thêm file ở baseline để tạo savings.
- Story-specific requirements/projection bytes báo riêng; không giấu việc chuyển instruction sang projection/memory. Báo thêm tổng context dự kiến cần cho action và chứng minh không làm mất hoặc âm thầm nhân bản yêu cầu.
- Provider-injected context, retries, caching và actual delivery chưa quan sát được ghi ngoài coverage; không báo provider tokens.
- Mục tiêu U2: `candidate_bytes <= 0.70 * baseline_bytes` cho từng action bình thường trong profile nghiệm thu. Không gộp L/M/H ba lần cùng một số rồi gọi là ba measurements độc lập.
- Profile không có baseline hợp lệ, thiếu source hoặc basis không tái lập được: INCONCLUSIVE, không PASS. Reviewer khóa profile/basis trước khi xem tỷ lệ để tránh chọn lại theo kết quả. Nếu scope gốc thực sự mơ hồ, đưa quyết định cụ thể cho human; không tự thu hẹp U2.

B là baseline review và measurement mặc định. B0/bundle cũ là đối chứng lịch sử; phải kiểm tra khác biệt B..B0 có ảnh hưởng instruction/behavior không trước khi dùng thay B. Remeasure từ Git snapshot được ghi là **reconstructed static measurement**, không phải khôi phục provider telemetry hoặc log chạy cũ.

## 6. Tasks và gates

### R00 — Đóng snapshot và mở lại đúng trạng thái nghiệm thu

**Owner:** R. **Depends on:** human giao Batch A.

**Files:** tạo `REVIEW/snapshot.json`; ghi trạng thái UNDER_REVIEW trong validation report và phần evolution mới của migration note; điều chỉnh checkbox/evidence U2/T11 trong plan ở W. Không sửa plan gốc trong MAIN hoặc rewrite lịch sử migration V4 Lite cũ.

**Consumes:** B, H0, B0, P0 và Git inventory thực tế. **Produces:** snapshot cố định và acceptance gốc có thể truy nguyên.

- [ ] Đọc pointer trước, xác minh isolation và inventory; ghi rõ mọi khác biệt với §1, không coi lỗi đọc là clean.
- [ ] Kiểm tra plan gốc đúng P0; so sánh nguyên văn U2/T02/T11 với plan ở W. Tìm evidence nếu human đã riêng biệt duyệt thay U2; không có thì giữ tiêu chí 30% gốc và ghi phần completion hiện tại chưa được nghiệm thu.
- [ ] Ghi hashes của bundles cũ, contracts, corpus và full diff scope; kiểm tra cả evidence ignored bên cạnh Git tracked inventory. Không sao chép secret/provider payload thô vào report.
- [ ] Phân biệt `implemented`, `reported tests`, `independently verified` trong status. Không xóa kết quả T02 lịch sử: ghi T02 từng đo giảm, nhưng nghiệm thu cuối cần phép đo có cùng basis.
- [ ] Commit riêng các file báo cáo/trạng thái đã ghi khi batch thực thi cho phép; exact paths, không stage file của MAIN. Record H0 vẫn là source của initial review, dù docs-only commit mới được tạo.

Command inventory mẫu cho PowerShell:

```powershell
$CanonicalRoot = 'D:\Workspace\Tu_Hoc\New_Project_My_Note'
Get-Content -LiteralPath (Join-Path $CanonicalRoot '.agent-state\active-run.json') -Raw
# Chỉ tiếp tục sau khi xác nhận IDLE rõ ràng.
$UpgradeRoot = 'C:\Users\ACER\.codex\worktrees\v4-architecture-evolution\New_Project_My_Note'
$BaseRef = 'd8e813660e44c54785466836e5c0eda658529b74'
$InitialRef = '7529540ad9bcbf0389d0b00bc83d1575dea1422a'
git -C $UpgradeRoot status --short --branch
git -C $UpgradeRoot rev-parse HEAD
git -C $UpgradeRoot worktree list --porcelain
git -C $UpgradeRoot diff --name-status $BaseRef $InitialRef
git -C $UpgradeRoot diff --check $BaseRef $InitialRef
```

**Gate R00:** người khác xác định được đúng source đã review, nguồn acceptance và các tài sản không được đụng tới. Status hiện tại không còn diễn đạt rằng U2/T11 đã được nghiệm thu độc lập.

### R01 — Review độc lập toàn bộ migration theo ranh giới rủi ro

**Owner:** R. **Depends on:** R00. **Files:** tạo `REVIEW/independent-review.md`, `REVIEW/findings.json`; chỉ đọc source/tests/contracts của các vùng bên dưới.

**Consumes:** diff B..H0 và plan gốc. **Produces:** coverage U1–U6, findings có thể tái hiện, danh sách check thiếu.

| Vùng | File trọng tâm | Điều cần thử bác bỏ |
|---|---|---|
| U1 — Action/transaction | `v4-action-kernel.mjs`, `v4-slice-transaction.mjs`, runner, implementation/finalization/completion helpers và tests | Bypass preview; staged file ngoài scope; metadata smuggle approval; interruption giữa hai commit; hook failure; lock/concurrent caller; recovery replay hoặc xóa partial work |
| U2/U3 — Context/routing | AGENTS/CLAUDE, router, compiler, Runner skill, action/recovery docs | V4 load V3 sớm; thiếu invariant/AC khi projection ngắn; stale sources; schema v1 bị mất đường tương thích; lazy reference vẫn thực tế bắt buộc; một action chạy successor |
| U4 — Verification/review | registry/maps/recipes, `check-verification.mjs`, executor, verification-flow và escalation/reviewer contract | Mixed scope bị đổi thành PASS; focused fail bị che dưới INCOMPLETE; HIGH/MEDIUM bỏ review; stale/cross-scope review; symlink/path/argv/timeout; provenance chỉ do caller tự khai |
| U5 — Observations | `v4-observations.mjs`, observation hooks, các dirty-scope exemptions trong lifecycle helpers | Unknown bị điền 0; số 0 hợp lệ bị coi missing; double count cache/reasoning; repeated export; hook failure ảnh hưởng authority; path exemption che staged/tracked mutation |
| U6 — Experience/evolution | experience/evolution scripts/tests/contracts, context integration | Advice trở thành instruction/allowlist/approval; stale memory vẫn được chọn; proposal vượt scope; evidence bị làm giả; adoption bound sai candidate/evaluation/scope; tồn tại apply path |
| T11 — Nghiệm thu | benchmark, corpus, bundles, validation report và plan diff | F01–F03; case/check không chạy; input digest null; compatibility reason che confounder; quality/cost/adoption bị gộp |

- [ ] Lập checklist từng file trong 59-file diff; nhóm đọc nhỏ, nhưng không bỏ phần nối giữa helper/caller/consumer. Thêm consumer ngoài diff khi boundary bị tác động.
- [ ] Đối chiếu mỗi U1–U6 và từng negative gate của plan gốc với code path và test thực sự assert behavior. Phân biệt test schema/chuỗi expected với test thực thi.
- [ ] Review adversarial vùng HIGH trước. Chạy focused checks hoặc reproduction trong fixture nếu cần xác định finding; không chạy Story thật và không sửa code trong lượt này.
- [ ] Reproduce F01 bằng builder không có case results; trace từ `check_results` đến `metrics.quality`, rồi đến consumer evolution. F02 đối chiếu acceptance; F03 truy inclusion rules/source bindings ở cả hai phía.
- [ ] Kiểm tra schema v1 backward compatibility qua entry/caller hiện có. Compiler chủ động không hỗ trợ một projection mới chưa tự chứng minh legacy execution bị hỏng; phải trace trước khi kết luận.
- [ ] Mỗi finding ghi ID, severity, classification, file/line tại source SHA, trigger, expected/actual, evidence, affected invariant, hướng fix nhỏ nhất, regression cần thêm và owner.
- [ ] Phân loại `VALID`, `FALSE_POSITIVE`, `SPEC_AMBIGUITY`, `NEEDS_HUMAN_DECISION`. Chỉ đóng FALSE_POSITIVE khi có phản chứng. Missing evidence ghi NEED_MORE_EVIDENCE, không tự chuyển thành PASS.
- [ ] Giao Batch B/C danh sách finding VALID. Finding yêu cầu đổi product intent/authority phải tách quyết định cho human trước phần sửa phụ thuộc.

Focused checks hiện có có thể dùng khi liên quan, chạy từ W dưới Node 24:

```powershell
node --test .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-evolution.test.mjs
node --test .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/v4-slice-transaction.test.mjs .agents/scripts/v4-verification-flow.test.mjs
node --test .agents/scripts/compile-v4-context.test.mjs .agents/scripts/check-verification.test.mjs .agents/scripts/v4-check-executor.test.mjs
```

Đây là lựa chọn focused theo finding, không phải yêu cầu chạy tất cả lặp lại mỗi lượt. Ghi command, actual exit, nguồn, log và limitation. Passing tests hiện hữu không tự bác bỏ một finding có repro.

**Gate R01:** mọi vùng có coverage hoặc gap công khai; F01–F03 được disposition; không dùng “không thấy lỗi” để kết luận không có rủi ro. Dừng Batch A và bàn giao, chưa tự nhận vai fixer.

### R02 — Sửa trust của benchmark và consumer evolution

**Owner:** I. **Depends on:** R01. **Files:** benchmark script/test, evolution script/test, benchmark contract mới, evolution contract; fixture bundle builder nếu cần version compatibility.

**Consumes:** F01 và contract §5.2. **Produces:** bundle v2 fail-closed, comparison/evolution không nâng dữ liệu thiếu thành bằng chứng thành công.

- [ ] Thêm regression tái hiện F01 trước khi sửa. Dùng fixture Git và corpus hiện có; không truyền `check_results`; assert không có PASS tự tạo, correction cycles chưa quan sát là null và thiếu evidence không cho quality PASS.
- [ ] Chạy focused test để thấy failure đúng nguyên nhân; lưu output. Nếu test không fail, xác định lại repro thay vì sửa assertion cho khớp implementation.
- [ ] Bỏ default PASS/test count. Giữ missing/invalid/failed/skipped phân biệt; implement schema v2 và đọc v1 với coverage legacy. Không mutate bundle đầu vào hoặc ghi đè observation cũ.
- [ ] Validate inventory của required cases/checks, input bindings, runner/output digests và evidence refs. Mất file, unsafe path, null identity quan trọng hoặc source mismatch phải không đủ điều kiện PASS.
- [ ] Sửa `compareBundles` và caller/CLI để truyền evidence root rõ ràng. Giữ JSON stdout sạch; cập nhật contract exit codes, ghi rõ comparability exit không phải acceptance gate.
- [ ] Trace và sửa consumer `evaluateEvolution` để raw PASS/legacy/incomplete/stale comparison không cho recommendation đủ evidence. Không thêm API apply hoặc tạo Human approval.
- [ ] Thêm negative tests cho duplicate/missing case, missing required check, check status mâu thuẫn exit/log, tampered digest, cross-case/source evidence, failed/skipped/timeout, unknown usage và zero usage hợp lệ.
- [ ] Rerun focused checks, xem final diff, commit exact files với finding IDs.

Pseudocode đích của nhánh thiếu evidence — không phải code đã triển khai:

```text
caseResults = suppliedCaseResults[caseId] ?? []
coverage = validateEvidence(caseResults, requiredChecks, executionBinding)
if coverage != COMPLETE_VERIFIED:
    deterministicStatus = INCONCLUSIVE
else if any required assertion failed:
    deterministicStatus = FAIL
else:
    deterministicStatus = PASS
# Persist raw verification status unchanged; never synthesize provider usage.
```

Ví dụ assertion tối thiểu cho test F01, đặt sau phần tạo fixture và chép corpus đã có trong benchmark test:

```javascript
const candidate = buildCandidateBundle(fixture.root, { source_paths: [] })
assert.ok(candidate.cases.every(item => item.check_results.length === 0))
assert.ok(candidate.cases.every(item => item.correction_cycles === null))
assert.ok(candidate.cases.every(item => item.coverage === 'UNKNOWN'))
```

Chạy: `node --test .agents/scripts/benchmark-v4.test.mjs .agents/scripts/v4-evolution.test.mjs .agents/scripts/v4-architecture-baseline.test.mjs`.

**Gate R02:** bundle builder không có kết quả thật không tạo PASS; negative evidence không đi qua quality/evolution gate; compatibility của bundle v1 minh bạch. Chưa tick L/M/H hay U2 chỉ vì unit tests của serializer pass.

### R03 — Chạy corpus L/M/H thật và lưu kết quả theo case

**Owner:** I. **Depends on:** R02. **Files:** corpus runner/test mới, corpus manifest, fixture helper, benchmark tests/builder và contract.

**Interface mới:**

```text
runArchitectureCorpus({ sourceRoot, expectedHead, variant, runId, evidenceRoot })
  -> { run_id, source_head, runner_digest, corpus_digest, cases, evidence_index }

CLI: run-v4-architecture-corpus.mjs --source-root ROOT --expected-head SHA
     --variant baseline|candidate --run-id ID --evidence-root DIRECTORY
```

ROOT/SHA/ID/DIRECTORY là input đã lấy từ R00/runtime inventory, không chọn ngầm từ CWD. Runner dùng fixed harness để gọi helper của **sourceRoot** cần kiểm tra; ghi riêng harness digest và target source digest. Không lấy candidate implementation để giả chạy baseline.

| Scenario | Thiết lập và execution bắt buộc | Assertions |
|---|---|---|
| L mapped/LOW | Fixture có mapped scope, recipe với command thực chạy; gọi đường verification thực của target và escalation | Raw canonical PASS, required checks thực chạy, NO_REVIEW, chỉ một action/đúng metadata scope khi đi qua kernel |
| M mixed/MEDIUM | Một mapped path và một unmapped path; chạy check cho phần mapped, gọi aggregation và escalation | Canonical INCOMPLETE, unmapped path còn trong output, REVIEW_REQUIRED; không tự progression chỉ vì mapped checks PASS |
| H stale/recovery/HIGH | Hai subcase riêng: đổi HEAD/policy sau preview; inject interruption trong transaction rồi inspect/recover bằng helper thật | Stale preview bị từ chối không mutation; partial work/index/journal được bảo toàn; recovery không replay side effect; HIGH không bỏ review |

- [ ] Khóa input của mỗi scenario trong corpus manifest; tính input digest từ fixture specification chuẩn hóa, không từ output hoặc expected label. Cùng scenario ở hai revision giữ cùng input semantics.
- [ ] Tận dụng `createV4Fixture`, `verifyChangedPaths`, escalation CLI, các fixture pattern trong kernel/verification-flow tests. Không import một test file chỉ để kích hoạt suite rồi gọi đó là corpus result.
- [ ] Viết test runner chứng minh helper thật được gọi và assertion nhận actual result. Làm hỏng recipe/anchor hoặc thay input để case tương ứng FAIL; đổi chuỗi expected đơn thuần không được biến execution chưa chạy thành PASS.
- [ ] Chạy từng case trong fixture độc lập. Snapshot Story/Plan/sprint/pointer/index trước/sau theo expected mutation của scenario; snapshot repo thật để chứng minh tests không đụng lifecycle thật.
- [ ] H stale và H recovery ghi hai check IDs/evidence riêng; không dùng một label STALE_RECOVERY_REQUIRED thay cả hai execution.
- [ ] Thu timestamp, source, argv/helper entrypoint, exit, raw result, assertions, log digests và exclusions theo §5.2; builder chỉ tổng hợp kết quả đã thu.
- [ ] Chạy cùng harness trên baseline thích hợp trong isolation. Reuse checkout rảnh hoặc managed worktree tại B nếu cần; baseline adapter chỉ nối API cũ, không bổ sung implementation để làm baseline pass. API không tồn tại: UNSUPPORTED/INCONCLUSIVE cho phép so sánh đó, không synthetic PASS.
- [ ] Tạo bundle/run mới với immutable path. Giữ nguyên hai bundle lịch sử; case còn missing hoặc expected failure bị nuốt phải không đủ điều kiện deterministic non-regression.
- [ ] Commit exact runner/fixture/tests/contract; evidence runtime vẫn có index và phương án handoff.

Chạy tests: `node --test .agents/scripts/run-v4-architecture-corpus.test.mjs .agents/scripts/benchmark-v4.test.mjs`.

Ví dụ chạy candidate sau khi commit source, từ W:

```powershell
$CandidateRef = (git rev-parse HEAD).Trim()
$AcceptanceRunId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + $CandidateRef
$EvidenceRoot = Join-Path $UpgradeRoot ('.agent-state\v4-observations\evaluations\acceptance\' + $AcceptanceRunId)
node .agents/scripts/run-v4-architecture-corpus.mjs --source-root $UpgradeRoot --expected-head $CandidateRef --variant candidate --run-id $AcceptanceRunId --evidence-root $EvidenceRoot
```

**Gate R03:** có executed result và meaningful assertion cho từng case/subcase; required checks count lấy từ runner thực. Fixture PASS chỉ chứng minh deterministic behavior đã bao phủ, không chứng minh chất lượng mọi Story.

### R04 — Chuẩn hóa phương pháp đo và so sánh instruction bytes

**Owner:** I; R kiểm tra basis trước khi dùng số đo làm acceptance. **Depends on:** R02; dùng evidence R03 cho claim kết hợp quality/bytes.

**Files:** measurement helper/test mới, instruction-basis manifest mới, benchmark script/test/contract. Chỉ đọc instruction sources trong task này; tối ưu nội dung là R05.

**Interface mới:**

```text
measureInstructionContext({ gitRoot, revision, basis, profile, action, inputDigest })
  -> MEASURED với source manifest, required_instruction_bytes,
     projection_bytes và coverage; hoặc INCONCLUSIVE/INVALID kèm lý do.

CLI: measure-v4-instruction-context.mjs --baseline-ref SHA --candidate-ref SHA
     --basis FILE --run-id ID --evidence-root DIRECTORY
```

- [ ] Khóa profile/normal-path/basis trước khi tối ưu. Trace inclusion từ cả B và H0, ghi những reference helper đọc nhưng model không cần đọc, và ngược lại. Không chỉ sao chép danh sách `COMMON_INSTRUCTION_PATHS`.
- [ ] Viết tests cho UTF-8 tiếng Việt/multibyte, CRLF/raw blob, source trùng, missing required source, lazy source triggered/untriggered, action khác nhau, profile mismatch và baseline bytes 0. Missing source không được catch rồi cộng 0 như hiện tại.
- [ ] Đọc bytes từ Git object của revision cụ thể; manifest ghi blob/digest và lý do tải. CLI từ chối revision không resolve hoặc source chưa commit ảnh hưởng phép đo.
- [ ] Implement per-metric comparability: khác basis/profile/input/required coverage thì instruction delta INCONCLUSIVE; explanation prose chỉ disclosure, không override guard. Unknown token/correction data giữ null; zero đã đo là giá trị hợp lệ.
- [ ] Remeasure B và H0 dưới basis mới để biết hiện trạng trước sửa U2; lưu thành observation mới, giữ số cũ làm lịch sử non-comparable khi thích hợp.
- [ ] Đo lại candidate sau fix; report theo action/profile, phân biệt unique cold-start source bytes, projection bytes và provider usage chưa quan sát. Không cộng ba bản sao số đo rồi coi là ba sample độc lập.
- [ ] Review diff và commit helper/basis/tests. Nếu phát hiện phải đổi acceptance gốc để đo được, ghi SPEC_AMBIGUITY thay vì tự sửa ngưỡng.

Chạy: `node --test .agents/scripts/measure-v4-instruction-context.test.mjs .agents/scripts/benchmark-v4.test.mjs`.

Sau khi tạo run identity mới theo R03 cho source hiện tại, chạy phép đo từ W:

```powershell
node .agents/scripts/measure-v4-instruction-context.mjs --baseline-ref $BaseRef --candidate-ref $CandidateRef --basis .agents/scripts/fixtures/v4-architecture/instruction-basis.json --run-id $AcceptanceRunId --evidence-root $EvidenceRoot
```

Không tái sử dụng biến `$CandidateRef` hoặc `$AcceptanceRunId` của revision trước sau khi source đã đổi.

**Gate R04:** reviewer có thể tái lập phép đo từ SHA+basis; hai phía cùng methodology; F03 được xử lý. Gate này chưa tự chứng minh giảm 30%.

### R05 — Đạt U2 gốc hoặc trả lại quyết định chưa đạt một cách trung thực

**Owner:** I, R re-review semantic coverage. **Depends on:** R04.

**Files có thể sửa:** AGENTS.md, CLAUDE.md, task router, context modules liên quan, Runner skill, các action/reference docs đã có; `compile-v4-context.mjs` và tests. Không sửa measurement basis chỉ để giảm số đo.

**Consumes:** phép đo B/H0 cùng basis và inventory invariant. **Produces:** context theo action đạt mục tiêu hoặc một blocker định lượng cụ thể; F02 không còn bị che bằng checkbox.

- [ ] Nếu remeasurement cho thấy bản hiện tại đã đạt ít nhất 30% trên các normal action/profile bắt buộc, giữ implementation và chỉ bổ sung evidence; không refactor để hoàn thành task hình thức.
- [ ] Nếu chưa đạt, tìm nội dung trùng và tải eager không cần thiết từ manifest. Chọn patch nhỏ: common entry chứa routing/authority cần chung; action document chứa quy tắc của action; recovery/technique/reference tải theo trigger thật.
- [ ] Đối với mỗi phần bỏ khỏi default context, chỉ ra nguồn authoritative còn lại và cách action nhận được quy tắc khi cần. Không di chuyển instruction sang experience để tránh tính bytes, không cắt AC/risk/dependency/stop condition.
- [ ] Viết regression trước sửa cho đường bị tác động: projection không thiếu task/AC/invariant; stale source bị từ chối; explicit V4 route đúng provider; legacy schema giữ đường tương thích; recovery trigger tải đủ hướng dẫn.
- [ ] Thực hiện thay đổi nhỏ nhất; không viết lại lifecycle validator hoặc đưa authority vào projection. Giữ nguyên toàn bộ negative gate của plan gốc.
- [ ] Commit context change trước final measurement. Chạy lại measurement từ SHA mới và affected behavior checks; so sánh từng action/profile với B dưới basis R04.
- [ ] Nếu không đạt mà phải bỏ invariant/đổi authority mới giảm tiếp được, dừng phần tối ưu đó. Báo số bytes, tỷ lệ thiếu, nguyên nhân và lựa chọn cụ thể cho human; giữ U2 OPEN/NOT_MET. Không tự tuyên bố “đã đo” là hoàn tất.

Assertion số học của gate, chỉ dùng sau khi metric đã được xác nhận comparable. `comparison` là kết quả `compareBundles` cho một profile đã khóa; mỗi required profile phải qua cùng gate:

```javascript
for (const action of ['implement_slice', 'verify_slice']) {
  const metric = comparison.metrics.instruction_bytes[action]
  assert.equal(metric.status, 'MEASURED')
  assert.ok(metric.baseline > 0)
  assert.ok(metric.candidate <= metric.baseline * 0.70)
}
```

Tests semantic/behavior không được thay bằng snapshot toàn bộ Markdown hoặc chỉ tìm thấy một câu invariant trong văn bản.

Chạy affected checks: `node --test .agents/scripts/compile-v4-context.test.mjs .agents/scripts/v4-story-runner.test.mjs .agents/scripts/v4-action-kernel.test.mjs .agents/scripts/v4-verification-flow.test.mjs .agents/scripts/measure-v4-instruction-context.test.mjs`.

**Gate R05:** đạt cả bytes target và invariant coverage, hoặc ghi rõ NOT_MET/INCONCLUSIVE. Kết quả sau không được dẫn tới verdict PASS_ORIGINAL_SCOPE ở R08. Human có thể chọn sửa thêm hoặc duyệt scope khác bằng quyết định riêng; report giữ cả acceptance ban đầu và quyết định mới.

### R06 — Sửa các finding VALID còn lại, không mở rộng kiến trúc tùy ý

**Owner:** I. **Depends on:** R01; thực hiện sau R05 để tránh sửa trùng nguồn đang thay đổi.

**Files:** chỉ file/consumer/test gắn với finding cụ thể trong `REVIEW/findings.json`; cập nhật evidence/disposition. Không mặc định sửa thêm U1–U6 nếu review không tìm ra lỗi.

**Consumes:** finding VALID chưa được R02–R05 xử lý. **Produces:** fix commit và regression evidence cho từng finding.

- [ ] Với mỗi finding, ghi mini-scope ngay trong finding: exact files, invariant, trigger, assertion mong đợi và focused command. Đủ để reviewer đánh giá patch mà không cần lịch sử chat.
- [ ] Tái hiện failure trên H0 hoặc revision bị ảnh hưởng trong fixture. Viết test behavioral cho bug nếu có thể; không đổi fixture/expected để hợp thức hóa lỗi.
- [ ] Sửa root cause nhỏ nhất và kiểm tra caller/consumer, failure/recovery path. Không dùng broad `git add`, chỉnh unrelated staged paths hoặc bỏ freshness check.
- [ ] Chạy regression mới rồi affected existing tests. Ghi cả red/green evidence theo revision; không diễn giải một test chưa chạy là “expected pass”.
- [ ] Commit riêng theo finding hoặc nhóm cùng root cause, exact file scope. I đánh `FIX_IMPLEMENTED`; chỉ R xác nhận `VERIFIED_FIXED` khi re-review.
- [ ] Finding FALSE_POSITIVE giữ counter-evidence. SPEC_AMBIGUITY/NEEDS_HUMAN_DECISION giữ open cho phần phụ thuộc; có thể làm tiếp phần độc lập đã được giao.
- [ ] Nếu không còn finding ngoài F01–F03, ghi R06 `NOT_NEEDED` có tham chiếu review inventory; không tạo thêm refactor để có commit.

**Gate R06:** mỗi finding có disposition và evidence; không unresolved HIGH/MEDIUM bị bỏ qua. Phần vượt scope hoặc đổi intent có quyết định human thật trước khi sửa.

### R07 — Regression cuối và đóng gói bằng chứng có thể kiểm tra lại

**Owner:** I chuẩn bị nguồn/evidence; R kiểm tra và trực tiếp rerun các check đối chứng cần thiết. **Depends on:** R02–R06 không còn sửa code dự kiến.

**Files:** `REVIEW/acceptance-matrix.md`, `REVIEW/evidence-index.json`; evidence trong run directory mới; cập nhật validation report theo actual results.

**Consumes:** candidate revision đã commit, basis/corpus/harness cố định. **Produces:** evidence mới gắn đúng source, không chỉ tổng số test.

- [ ] Chốt `tested_source_head` và digest toàn bộ executable/config/instruction sources có liên quan. Ghi Node/npm/Git, OS, corpus/basis/runner digests, checkout status và command cwd.
- [ ] Chạy full control-plane suite một lần sau các fix cuối; không dùng số 404 pass cũ làm evidence của commit mới.
- [ ] Chạy các frontend recipe gates dưới Node `>=24.12.0 <25`. Dùng dependency lock hiện có; nếu cần `npm ci` thì chỉ trong isolation đã xác minh, không cập nhật package/lock. Environment thiếu: BLOCKED/INCONCLUSIVE, không đổi Node engines để pass.
- [ ] Chạy L/M/H corpus bằng runner mới và instruction measurement cuối. Mỗi check evidence phải có command/helper, output/log digest, actual status và source binding.
- [ ] Xác minh negative matrix bên dưới bằng existing tests và regression mới. Chỉ thêm test khi còn invariant chưa có coverage có ý nghĩa; không đếm tên test làm proof.
- [ ] Kiểm tra Git diff hygiene, exact changed paths, real Story/sprint/receipt/V3 pointer invariance, và không có thay đổi product ngoài fixture. Unexpected external concurrent changes phải được quy nguồn, không tự reset chúng.
- [ ] R đối chứng ít nhất: missing-evidence không PASS; một L/M/H run; phép đo từ basis; vùng HIGH có finding/fix. Chỉ rerun rộng hơn nếu source đổi, failure hoặc coverage gap mới đòi hỏi.
- [ ] Kiểm tra tất cả evidence refs có thật/digest đúng; đóng gói evidence cho human/reviewer. Không chỉ đưa link ignored local path rồi archive mất checkout.

Full control-plane command từ W, PowerShell:

```powershell
$V4AcceptanceTests = @(Get-ChildItem -LiteralPath .agents/scripts -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
node --test @V4AcceptanceTests
```

Frontend recipe gates từ `W/frontend`:

```powershell
node --version
npm.cmd run type-check
npm.cmd run test:unit -- --run src/views/__tests__/journal.spec.ts src/views/__tests__/challenges.spec.ts src/api/__tests__/challenges.spec.ts src/views/__tests__/today.spec.ts src/views/__tests__/account-time.spec.ts
npm.cmd run contract:check
```

Không invent root `npm test`. Ghi `$LASTEXITCODE`/output cho từng command trước command tiếp theo; một lệnh sau thành công không xóa failure trước. Harness chạy command phải dùng argv/cwd rõ ràng, không shell-string interpolation.

Nếu symlink test bị skip trên Windows, ghi test cụ thể và coverage còn thiếu; skip không phải pass. Có thể dùng môi trường đã có hỗ trợ để kiểm chứng tương đương, không tự cài dịch vụ/đổi security policy. Reviewer quyết định gap còn là blocker hay đã có bằng chứng tương đương theo invariant.

**Gate R07:** commands thực chạy, không fail chưa xử lý; skipped/unsupported đều có disposition; required negative coverage có evidence; U2 verdict có số đo tái lập được. Không cần provider usage/pilot để xác minh implementation cơ học, nhưng các claim đó vẫn INCONCLUSIVE.

### R08 — Re-review độc lập và quyết định nghiệm thu đúng scope

**Owner:** R. **Depends on:** R07. **Files:** hoàn tất independent review/findings/final decision, acceptance matrix, validation report, plan trong W và phần evolution mới của migration note.

**Consumes:** initial diff B..H0, fix diff H0..candidate, final integrated diff B..candidate và evidence. **Produces:** verdict độc lập cùng gói handoff, chưa adoption.

- [ ] Đọc fix diff theo finding; xác nhận regression thực sự bắt bug ở phiên bản trước và pass trên nguồn sửa. Không chỉ đọc lời giải thích của I.
- [ ] Đối chiếu integrated diff: fix không tạo bypass ở consumer khác, không scope creep, không đổi acceptance/invariant ngoài quyết định human đã ghi.
- [ ] Review toàn bộ U1–U6 ở mức coverage contract; vùng đã review và không đổi có thể tái dùng evidence binding đúng, không phải đọc lại toàn bộ code không liên quan.
- [ ] Đóng finding bằng evidence cụ thể; tìm hở ở luồng scenario result → bundle → compare → evolution. Xác nhận thiếu data không có đường được nâng thành approval hoặc authority.
- [ ] Khôi phục reporting rõ ràng trong plan/validation/migration note: số lượng test actual, U2 đạt/chưa đạt, benchmark fixture coverage, provider/real-Story limitations, human adoption chưa xảy ra.
- [ ] Chọn một verdict trong §8 và ghi lý do. I không được đổi verdict của R thành APPROVE bằng cách sửa report.
- [ ] Ghi `tested_source_head`, `reviewed_source_head` và `handoff_head` riêng. Nếu final docs commit làm HEAD đổi, giữ đúng SHA đã chạy; chứng minh diff chỉ ở report không normative. Nếu gate áp dụng yêu cầu HEAD tuyệt đối hoặc source có ý nghĩa thay đổi, rerun gate đó; không sửa SHA trong log cho trông fresh.
- [ ] Không cố ghi SHA tự tham chiếu của commit chứa chính report. Handoff cuối có thể ghi full current HEAD và hash gói report sau khi docs commit xong; mọi approval sau này phải gắn actual integration scope.
- [ ] Bàn giao diff, findings, matrix, evidence index/bundle và limitations cho human. Giữ worktree; không tự merge/push/archive hoặc tạo human-adoption record.

**Gate R08:** người khác có thể truy từ từng claim về source/check/output; người sửa không tự nghiệm thu phần mình sửa; final verdict không bị diễn giải thành quyền rollout.

## 7. Negative matrix bắt buộc

| ID | Tình huống | Kết quả phải thấy | Nơi kiểm chứng chính |
|---|---|---|---|
| N01 | Builder không có check results; v1 legacy thiếu provenance | Không PASS, UNKNOWN/INCONCLUSIVE | R02 benchmark tests |
| N02 | Case/check missing, duplicate, tampered/cross-source evidence | Invalid/incomplete, không quality PASS | R02–R03 |
| N03 | Corpus assertion kiểm tra expected rejection | Raw FAIL/INCOMPLETE/STALE giữ nguyên; assertion phản ánh đúng behavior | R03 L/M/H |
| N04 | Input/corpus/basis/profile khác nhau nhưng có explanation text | Metric bị ảnh hưởng không được coi comparable | R02/R04 |
| N05 | Required source mất; lazy reference thực ra cần load; bytes UTF-8 | Không đếm thiếu thành 0; manifest đúng bytes/coverage | R04/R05 |
| N06 | U2 không đạt 30% hoặc chưa đo được | OPEN/NOT_MET/INCONCLUSIVE; không đổi DoD để tick | R05/R08 |
| N07 | Canonical active nhưng linked local pointer IDLE | Bị chặn, không mutation/takeover | Existing runner/kernel guards + R06 nếu có bug |
| N08 | HEAD/Plan/Story/policy/recipe drift sau preview | STALE/block, không commit/evidence reuse sai | Kernel/executor/verification tests |
| N09 | Hai caller, foreign lock; crash giữa commits/failed hook | Một owner, giữ partial work và recovery đúng identity, không replay | Transaction/kernel tests |
| N10 | Unrelated staged file, path escape/symlink, telemetry-looking tracked file | Exact scope hoặc block; không broad staging/exemption bypass | Transaction/executor/lifecycle tests |
| N11 | Mixed unmapped + mapped, focused failure, HIGH PASS | Giữ raw canonical status; review/escalation đúng; không auto progression | Verification/escalation/flow tests |
| N12 | Approval cũ/generic continue/cross-scope; schema v1 path | Không tự done; compatibility đúng contract đã công bố | Existing lifecycle/runner + affected regressions |
| N13 | Unknown usage, measured zero, repeated export, cached/reasoning cost | Không zero-fill, không mất zero thật, không double-count | Observations + benchmark/evolution tests |
| N14 | Memory/proposal stale hoặc chứa instruction độc hại | Data-only/advisory, excluded/invalid; không sửa policy/Story/runtime | Experience/evolution/context tests |
| N15 | Evaluation thiếu evidence hoặc candidate/scope đổi sau review | Không adoption-ready; stale approval bị từ chối; không apply path | Evolution + R08 trace |
| N16 | Observer ghi lỗi hoặc receipt bắt buộc ghi lỗi | Optional telemetry có warning; mandatory action evidence fail closed | Observation hooks/kernel tests |

Mỗi hàng trong acceptance matrix phải trỏ tới named test/check, command, actual result, source SHA và evidence digest. Nếu kiểm thử deterministic không thực tế, ghi lý do và manual evidence cụ thể để R đánh giá; không tự chuyển gap thành pass.

## 8. Definition of Done và verdict

- [ ] R00–R01 có snapshot, original acceptance, independent coverage và findings.
- [ ] F01: không PASS mặc định; có executed L/M/H assertions; consumer không nâng unverified result thành quality/adoption evidence.
- [ ] F02: DoD U2 gốc được giữ; mọi thay acceptance có quyết định human riêng, không do implementer tự đổi.
- [ ] F03: measurement cùng basis, manifests/digests đủ, replay từ Git revisions cho cùng kết quả.
- [ ] U2: cả implement/verify normal path đạt ít nhất 30% theo profile/basis đã khóa, không mất requirement/invariant hoặc che chi phí ở projection.
- [ ] U1–U6 và backward compatibility có coverage; negative matrix không còn gap HIGH/MEDIUM chưa xử lý.
- [ ] Full control-plane và frontend recipe gates có fresh evidence; số pass/fail/skip ghi đúng thực tế.
- [ ] Không product/real Story/V3 runtime mutation; không unexpected staged/untracked scope trong W.
- [ ] Không còn finding VALID HIGH/MEDIUM chưa được reviewer xác nhận xử lý.
- [ ] Evidence package đọc được, liên kết đúng source; report/plan/migration note không overclaim.
- [ ] Independent reviewer đưa verdict; human integration/adoption vẫn pending.

Verdict cuối:

| Verdict | Khi nào dùng |
|---|---|
| `PASS_ORIGINAL_SCOPE` | Tất cả nghĩa vụ deterministic và U2 gốc đạt; đủ review/evidence. Chưa phải human adoption |
| `CHANGES_REQUIRED` | Có lỗi đã xác nhận hoặc acceptance không đạt cần sửa |
| `NEED_MORE_EVIDENCE` | Code chưa bị kết luận sai nhưng thiếu execution, comparability hoặc review coverage |
| `NEEDS_HUMAN_DECISION` | Chỉ có thể tiếp tục phần phụ thuộc bằng đổi acceptance/authority/intent hoặc chọn xử lý gap cụ thể |

Nếu human duyệt acceptance mới, lập decision record gắn scope và điều kiện mới rồi nghiệm thu theo record đó; không gọi là PASS_ORIGINAL_SCOPE. “Implementation verified”, “optimization measured” và “human adopted” phải tiếp tục là ba trạng thái riêng.

Chưa có provider export, paired pilot hoặc real-Story quality observations không tự làm thất bại phần implementation đã đủ deterministic evidence. Nhưng không được dùng kết quả này tuyên bố tiết kiệm token, cải thiện chất lượng Story hoặc kiến trúc tự tiến hóa thành công trong thực tế.

## 9. Handoff prompts cho các lượt sau

Các prompt dưới đây chỉ để human sử dụng khi muốn bắt đầu batch tương ứng. Không prompt nào được gửi hoặc thực thi trong lượt lập plan.

**Batch A — giao reviewer độc lập:**

> Đọc chỉ canonical pointer `D:/Workspace/Tu_Hoc/New_Project_My_Note/.agent-state/active-run.json` trước; nếu IDLE rõ ràng thì đọc plan `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-28-v4-architecture-independent-review-acceptance-plan.md` và thực hiện chỉ Batch A (R00–R01) trong lane V4 Lite architecture/control-plane migration. Review bản H0 `7529540ad9bcbf0389d0b00bc83d1575dea1422a` so với B `d8e813660e44c54785466836e5c0eda658529b74` tại worktree đã ghi trong plan. Giữ plan gốc làm acceptance. Bạn là reviewer độc lập: chỉ ghi báo cáo/trạng thái nghiệm thu, không sửa implementation. Kiểm chứng F01–F03 và coverage U1–U6; findings cần source, repro và invariant cụ thể. Dừng sau báo cáo Batch A, không tự triển khai bản sửa.

**Batch B — giao Luna sửa luồng evidence:**

> Thực hiện chỉ Batch B (R02–R04) của plan `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-28-v4-architecture-independent-review-acceptance-plan.md`, dựa trên findings độc lập Batch A. Đọc canonical pointer trước theo entry rule. Giữ baseline và bundle lịch sử; sửa default PASS, evidence provenance/consumer, actual L/M/H corpus và phép đo cùng basis. Viết regression có ý nghĩa, dùng fixtures, ghi actual results. Không đổi tiêu chí giảm 30%, product/Story/V3 state hoặc tự merge. Dừng với commit/evidence và danh sách việc còn lại cho Batch C.

**Batch C — giao Luna xử lý U2 và remaining findings:**

> Thực hiện chỉ Batch C (R05–R06) của plan `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-28-v4-architecture-independent-review-acceptance-plan.md`. Đọc canonical pointer trước theo entry rule. Dùng basis đã khóa để đạt U2 gốc mà giữ đủ invariant; sửa finding VALID còn lại trong exact scope. Nếu acceptance không đạt hoặc cần đổi authority/intent, báo quyết định cụ thể thay vì tự hạ chuẩn. Bàn giao source commit, evidence và limitations; không tự nghiệm thu, merge hoặc rollout.

**Batch D — giao reviewer re-review và nghiệm thu:**

> Thực hiện chỉ Batch D (R07–R08) của plan `D:/Workspace/Tu_Hoc/New_Project_My_Note/docs/superpowers/plans/2026-09-28-v4-architecture-independent-review-acceptance-plan.md` với vai reviewer độc lập, không tự viết bản sửa. Đọc canonical pointer trước theo entry rule. Xác minh source identity, full regression/recipe evidence, trực tiếp chạy checks đối chứng cần thiết, re-review fix diff và integrated diff, rồi đưa một verdict trong plan. Báo tested/reviewed/handoff HEAD riêng và bàn giao evidence đọc được. Không tạo approval/adoption, không merge/push/archive hoặc chạy Story thật.

Nếu human chưa giao batch kế tiếp, giữ nguyên worktree và artifacts. Empirical pilot chỉ là công việc tiếp theo sau một authorization riêng: paired inputs/model/effort, ít nhất ba paired repetitions cho mỗi workload class được claim theo plan gốc, gồm retry/reflection cost và không thay policy giữa Story đang chạy. Plan này không khởi chạy pilot đó.

## 10. Phạm vi của lượt lập tài liệu

Tại thời điểm tạo tài liệu này: chỉ đọc policy, plan, source, Git inventory và evidence đã có; chỉ tạo chính file kế hoạch này trong MAIN. Không thay code, plan gốc, report của Luna, trạng thái runtime hoặc worktree W; không chạy test và không tuyên bố bất kỳ gate R00–R08 nào đã pass.
