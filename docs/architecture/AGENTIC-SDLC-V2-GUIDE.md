# Agentic SDLC Architecture V2 (historical)

> Superseded for execution and Lead ownership by
> [Agent Architecture V3](../../.agents/policies/orchestration-v3.md) and
> [AGENTS.md](../../AGENTS.md). The V2 examples below are historical, not startup
> instructions. Codex-only/direct implementation and Antigravity exclusion no
> longer apply. Risk, evidence and BMAD principles remain in current policy.
> Read V3 for current bootstrap, durable state, worker and human-gate semantics.

## 1. Mục đích của tài liệu

Tài liệu này giải thích kiến trúc agentic SDLC hiện tại của NoteFlow và cách sử
dụng nó trong quá trình phát triển Story.

Mục tiêu của kiến trúc V2 là:

- dùng một implementation orchestrator duy nhất là Codex;
- giữ BMAD làm nguồn sự thật cho product và architecture;
- ưu tiên kiểm chứng deterministic thay cho nhận xét LLM;
- giảm context, token, planning lặp lại và reviewer round-trip;
- chỉ tăng độ sâu review khi risk hoặc evidence thực sự yêu cầu;
- giữ quyền quyết định product, architecture, merge và release ở đúng nơi.

Tài liệu này diễn giải policy. Khi có mâu thuẫn, `AGENTS.md`, Story đã duyệt và
các BMAD artifact được duyệt là nguồn có thẩm quyền.

## 2. Kiến trúc tổng thể

```text
STORY READY
    |
    v
Codex đọc Story
+ architecture / UX / code liên quan
    |
    v
Readiness + blocker check
    |
    v
Risk classification: LOW | MEDIUM | HIGH
    |
    +---- product/architecture decision chưa được giải quyết
    |                         |
    |                         v
    |                  BMAD / human resolution
    |
    v
Story Tasks/Subtasks là plan mặc định
    |
    +---- thiếu implementation mapping thật sự
    |                         |
    |                         v
    |                  concise delta plan
    |
    v
Codex implementation
    |
    v
Focused deterministic verification
    |
    v
Full available verification
    |
    v
AC-to-evidence + final diff/scope check
    |
    +---- HIGH risk hoặc evidence gap
    |                         |
    |                         v
    |              deeper Codex adversarial review
    |              + targeted executable tests
    |
    v
Deterministic Done Gate
    |
    v
BMAD lifecycle synchronization
    |
    v
Human merge / release authority
```

Đặc điểm quan trọng nhất là flow không có external reviewer bắt buộc, không có
implementation subagent bắt buộc và không tạo plan thứ hai nếu Story đã đủ rõ.

## 3. Thứ tự thẩm quyền

Khi các nguồn thông tin khác nhau đưa ra chỉ dẫn khác nhau, dùng thứ tự sau:

1. yêu cầu trực tiếp của người dùng;
2. BMAD product, architecture, UX, Epic, Story và Acceptance Criteria đã duyệt;
3. evidence deterministic về implementation thực tế;
4. hướng dẫn methodology.

Điều này có nghĩa:

- test không được tự ý thay đổi product requirement;
- methodology không được ghi đè architecture đã duyệt;
- Codex không được tự phát minh behavior để lấp một AC mơ hồ;
- review recommendation không mạnh hơn Story hoặc deterministic evidence;
- nếu product intent phải đổi, việc đó phải quay lại BMAD hoặc human.

## 4. Vai trò của từng thành phần

### 4.1 Codex

Codex là technical orchestrator và implementation agent chính.

Codex chịu trách nhiệm:

- chọn đúng context cần đọc;
- kiểm tra Story readiness và blocker;
- phân loại risk;
- dùng Story Tasks/Subtasks làm plan;
- viết delta plan nếu thật sự cần;
- trực tiếp implement;
- chạy focused và full verification;
- map từng AC sang evidence;
- kiểm tra final diff và scope;
- thực hiện deeper adversarial review cho HIGH risk;
- phân loại finding dựa trên evidence;
- đồng bộ kết quả với BMAD lifecycle.

Codex không có quyền:

- tự thay đổi product intent hoặc architecture đã duyệt;
- đánh dấu Story hoàn tất khi check cần thiết chưa xanh;
- dùng LLM judgment để thay thế test đang có thể viết và chạy;
- tự quyết định irreversible deployment hoặc release.

### 4.2 BMAD

BMAD là specification và lifecycle authority, không phải implementation
orchestrator thứ hai.

BMAD sở hữu:

- product intent và PRD;
- architecture và UX decisions;
- Epics, Stories và Acceptance Criteria;
- readiness và dependency sequencing;
- traceability;
- sprint/Story status;
- Done Gate record;
- giải quyết product hoặc architecture ambiguity.

Flow đúng là:

```text
BMAD artifact
→ Codex implementation + evidence
→ BMAD lifecycle update
```

Không phải:

```text
BMAD artifact
→ một implementation orchestrator
→ Codex
→ một review orchestrator khác
```

### 4.3 `story-development`

`story-development` là repository-level router duy nhất cho approved hoặc
`ready-for-dev` Story.

Skill này chỉ định:

- preflight phải làm gì;
- context nào được đọc;
- khi nào phải dừng vì blocker;
- cách phân loại LOW/MEDIUM/HIGH;
- khi nào cần delta plan;
- cách chọn kỹ thuật Superpowers;
- verification và completion flow.

Skill này không chứa một SDLC độc lập và không tự trở thành implementation
agent.

### 4.4 Superpowers

Superpowers là tập kỹ thuật chọn lọc, không phải orchestration layer mặc định.

| Skill | Khi dùng | Khi không nên dùng |
|---|---|---|
| `test-driven-development` | Behavioral logic, bug regression, rule có input/output rõ | Scaffold thuần túy, comment, metadata hoặc config không có behavior |
| `systematic-debugging` | Có failure hoặc unexpected behavior tái hiện được | Trước khi có failure cụ thể |
| `verification-before-completion` | Trước khi tuyên bố hoàn tất | Không được bỏ qua vì thay đổi “nhỏ” |
| `receiving-code-review` | Khi đã có review feedback thật | Không tự tạo review ceremony |
| `writing-plans` | Story Tasks thiếu implementation mapping | Story đã actionable |

Không đặt các skill sau vào default Story path:

- `requesting-code-review`;
- `subagent-driven-development`;
- `executing-plans`;
- `using-git-worktrees`;
- per-task implementer/reviewer loops.

Chúng vẫn có thể tồn tại như capability upstream hoặc explicit workflow, nhưng
không được tự động kích hoạt cho approved Story.

### 4.5 Deterministic verification

Deterministic verification cung cấp bằng chứng có thể chạy lại được.

Thứ tự ưu tiên:

```text
executable acceptance/integration tests
> contract tests
> typecheck/static analysis
> lint
> build
> smoke/E2E
> runtime assertions
> documented manual evidence
> LLM judgment
```

Một test pass có giá trị hơn nhận xét “implementation có vẻ đúng”. Một test
không phản ánh requirement thì phải sửa test hoặc làm rõ requirement, không được
dùng màu xanh của test để ghi đè Story.

### 4.6 Human developer

Human chịu trách nhiệm cuối cho:

- giải quyết product hoặc architecture decision cần authority;
- duyệt scope change;
- chấp nhận residual risk;
- merge;
- irreversible deployment hoặc release;
- xử lý credential, production access và destructive operation cần approval.

## 5. Cách vận hành một Story

### Bước 1: Preflight

Trước khi chỉnh sửa:

```text
- git status
- current branch
- repository root
- git worktree list
- Story target
- policy drift check nếu đang ở linked worktree
```

Mục đích là tránh sửa nhầm checkout, đè user change hoặc dùng policy cũ trong
worktree.

Ví dụ báo cáo ngắn:

```text
Checkout: feature/story-2-3
Worktree: linked worktree
Policy: matches canonical main policy
Existing changes: none
Target: Story 2.3, status ready-for-dev
```

Nếu policy trong worktree cũ hơn canonical main, phải report trước khi implement.

### Bước 2: Đọc focused context

Luôn đọc:

- Story target;
- Tasks/Subtasks;
- Acceptance Criteria.

Chỉ đọc thêm:

- architecture decision trực tiếp ảnh hưởng change;
- UX behavior liên quan;
- code, contract và test bị tác động;
- sprint/status data cần cho lifecycle.

Không đọc toàn bộ PRD, Epic, architecture và codebase chỉ vì chúng tồn tại. Khi
implementation bắt đầu, context nên chứa thông tin có khả năng ảnh hưởng quyết
định hiện tại.

### Bước 3: Readiness và blocker check

Một Story sẵn sàng khi:

- đã approved hoặc `ready-for-dev`;
- Tasks/Subtasks map hợp lý tới AC;
- dependency cần thiết đã có;
- không còn contradiction giữa Story và approved architecture;
- không cần phát minh product behavior để implement.

Phải dừng và escalate khi:

- AC có hai cách hiểu dẫn tới behavior khác nhau;
- Story yêu cầu phá architecture boundary đã duyệt;
- dependency hoặc contract cần thiết chưa tồn tại;
- implementation chỉ khả thi nếu product scope thay đổi.

### Bước 4: Risk classification

#### LOW

LOW thường có tất cả đặc điểm:

- localized change;
- requirement rõ;
- không thay public contract hoặc shared architecture boundary;
- không liên quan auth/security;
- không migration hoặc destructive behavior;
- không concurrency/consistency risk;
- verification thẳng và chạy được.

Review depth: focused checks, applicable repository checks, AC evidence và diff
inspection.

#### MEDIUM

MEDIUM thường có một hoặc nhiều đặc điểm:

- thay đổi nhiều file hoặc module;
- state transition hoặc persistence behavior;
- API consumer thay đổi nhưng không đổi public contract;
- meaningful integration behavior;
- nhiều unhappy path liên quan nhau;
- regression surface vừa phải.

Review depth: LOW controls cộng với consumer, state transition, integration
boundary và unhappy-path inspection.

#### HIGH

Bất kỳ signal sau đều đẩy Story lên HIGH:

- authentication, authorization hoặc security-sensitive behavior;
- migration, backfill hoặc destructive data change;
- concurrency, idempotency, caching hoặc state consistency;
- backup/restore;
- shared architecture boundary;
- public API/OpenAPI contract;
- time hoặc search semantic invariant;
- cross-module write path hoặc broad refactor;
- irreversible external side effect;
- ambiguous Story/AC;
- incomplete, inconsistent hoặc failing verification.

Review depth: architecture-and-adversarial Codex review cộng targeted tests.

Mẫu classification:

```text
risk_level: MEDIUM

signals:
- changes state in frontend and API
- two consumers depend on the response shape

review_depth:
- inspect both consumers
- test successful and failed state transitions
- run integration and contract checks
```

### Bước 5: Story là plan mặc định

Nếu Tasks/Subtasks đã nói rõ thứ tự và kết quả cần có, implement trực tiếp theo
chúng. Không tạo lại một tài liệu chứa toàn bộ Story.

Chỉ tạo `delta plan` khi thiếu một trong các thông tin:

- file/component bị tác động;
- execution order không hiển nhiên;
- migration/rollback sequence;
- contract callers/consumers;
- high-risk failure modes;
- verification commands.

Mẫu delta plan:

```text
Delta plan

Affected components:
- API request validator
- note editor save client
- existing save integration test

Order:
1. lock the request/response contract with a contract test
2. implement server validation
3. update the client consumer
4. run focused tests, then the full available gate

Risks:
- old client payload must remain accepted

Verification:
- <focused test command>
- <contract test command>
- <full check command>
```

Không đưa vào delta plan:

- product background;
- toàn bộ AC;
- toàn bộ architecture;
- quyết định kỹ thuật đã có trong approved artifacts.

### Bước 6: Implementation và focused verification

Codex trực tiếp implement. Trong quá trình làm:

- thay đổi theo từng behavior có thể kiểm tra;
- dùng TDD cho logic hoặc regression phù hợp;
- chạy focused test sau phần thay đổi liên quan;
- tránh unrelated refactor;
- không đánh dấu task xong dựa trên reasoning thuần túy.

### Bước 7: Full available verification

Sau focused checks, chạy toàn bộ check hiện có và áp dụng cho change, ví dụ:

```text
tests
contract tests
typecheck/static analysis
lint
build
smoke/E2E
```

Chỉ report command thật sự tồn tại và đã chạy. Một check “sẽ được Story khác bổ
sung” không phải evidence hiện tại.

### Bước 8: AC-to-evidence

Mỗi AC phải map sang evidence ngắn gọn:

```text
AC1
Evidence:
- test/check: saves a valid note and returns the approved response shape
- command: <exact command>
- result: PASS

AC2
Evidence:
- test/check: rejects an invalid owner transition
- command: <exact command>
- result: PASS
```

Nếu không thể test deterministic:

```text
AC3
Evidence:
- manual check: verified keyboard focus order in supported browser
- reason: current repository has no executable accessibility harness
- result: PASS
```

Manual evidence phải là ngoại lệ có lý do, không phải cách né test.

### Bước 9: Final diff và scope check

Kiểm tra:

- diff chỉ chứa file liên quan;
- không có debug artifact hoặc generated cache;
- không có accidental requirement/Story edit;
- public contract và architecture boundary đúng;
- không có user change bị ghi đè;
- verification evidence khớp với code trong final diff.

### Bước 10: BMAD lifecycle và human handoff

Khi Done Gate pass:

- đồng bộ Story/sprint status;
- lưu completion evidence ngắn;
- nêu residual risk nếu có;
- chuyển merge/release decision cho human.

BMAD status không phải bằng chứng implementation. Nó chỉ được cập nhật sau khi
evidence chứng minh trạng thái tương ứng.

## 6. High-risk adversarial review

HIGH risk không tạo external reviewer mặc định. Codex mở rộng chiều sâu review:

1. liệt kê architecture decisions và invariants bị ảnh hưởng;
2. thử tạo tình huống làm sai từng invariant;
3. đọc caller và consumer liên quan;
4. kiểm tra unhappy path;
5. kiểm tra rollback/recovery nếu có;
6. thêm negative, concurrency, contract hoặc security tests khi chạy được;
7. chỉ tạo finding có evidence.

Mẫu finding:

```text
Finding: AUTH-01
Classification: VALID
Invariant: A user may access only records owned by that user
Evidence:
- integration test demonstrates cross-owner read succeeds
- affected endpoint: <endpoint>
Required control:
- enforce owner scope and add regression test
```

Các classification hợp lệ:

- `VALID`: evidence xác nhận defect hoặc violation;
- `FALSE_POSITIVE`: code/evidence bác bỏ finding;
- `SPEC_AMBIGUITY`: approved artifacts chưa xác định behavior;
- `NEEDS_HUMAN_DECISION`: cần authority hoặc risk acceptance của human.

Không fix `SPEC_AMBIGUITY` bằng cách chọn behavior mà Codex thấy hợp lý nhất.

## 7. Failure và retry policy

Khi verification fail:

```text
reproduce
→ root cause
→ regression test nếu phù hợp
→ smallest fix
→ affected verification
→ final gate
```

Nếu cùng một underlying failure lặp lại khoảng ba lần, dừng patching và đánh giá
lại:

- architecture assumption có sai không;
- Story có ambiguity không;
- test environment có hỏng không;
- dependency/configuration có thiếu không;
- approved architecture có cần thay đổi không.

Không giải quyết repeated failure bằng cách gọi thêm reviewer.

## 8. Deterministic Done Gate

Story chỉ hoàn tất khi cả chín điều kiện đều đúng:

1. mọi AC có evidence;
2. applicable deterministic checks vừa được chạy;
3. các check đó xanh;
4. final diff đã được inspect;
5. không còn unintended scope change;
6. architecture decisions và domain invariants được tôn trọng;
7. không còn unresolved HIGH hoặc MEDIUM issue;
8. BMAD Story/status lifecycle được đồng bộ;
9. human giữ quyền duyệt irreversible deployment/release.

Mẫu completion report:

```text
Story: <id/title>
Risk: MEDIUM
Plan: Story Tasks used directly; no delta plan required

AC evidence:
- AC1: PASS — <test/check>
- AC2: PASS — <test/check>

Verification:
- <command>: PASS
- <command>: PASS

Diff/scope:
- inspected
- no unintended changes

Issues:
- no unresolved HIGH/MEDIUM issue

Lifecycle:
- Story/status synchronized

Human action:
- review and approve merge/release
```

## 9. Ví dụ áp dụng

### Ví dụ A: LOW — thay đổi validation cục bộ

Story yêu cầu giới hạn một field đã tồn tại và Tasks chỉ rõ validator/test cần
đổi.

```text
Risk: LOW
Why:
- localized validation behavior
- no contract shape change
- no auth, migration or concurrency

Plan:
- use Story Tasks directly

Execution:
1. add failing boundary tests
2. update validator
3. run focused test
4. run full applicable checks
5. map AC to tests and inspect diff
```

Không cần:

- persistent implementation plan;
- code-review agent;
- whole-architecture reload.

### Ví dụ B: MEDIUM — thay đổi state qua UI và API

Story thêm một transition đã được architecture cho phép. Frontend, API và hai
consumer cùng bị tác động nhưng public contract không đổi.

```text
Risk: MEDIUM
Why:
- multi-module state behavior
- multiple consumers
- meaningful integration surface

Delta plan:
- list affected consumer files
- define implementation order
- list focused integration commands

Additional review:
- inspect both consumers
- test valid and invalid transitions
- verify retry/error UI
```

Vẫn không cần external reviewer. Review depth tăng bằng evidence và consumer
inspection.

### Ví dụ C: HIGH — authorization/owner isolation

Story thay đổi truy cập dữ liệu theo owner.

```text
Risk: HIGH
Signals:
- authorization boundary
- cross-module read/write path
- security impact

Invariants:
- user A cannot read or mutate user B data
- unauthenticated request cannot access protected resource

Adversarial checks:
- valid-owner read/write
- cross-owner read/write
- missing/invalid authentication
- indirect lookup path
- batch/list endpoint leakage
```

Nếu Story không nói rõ admin có được cross-owner access hay không, finding phải là
`SPEC_AMBIGUITY`; Codex không tự thêm admin behavior.

### Ví dụ D: HIGH — backup/restore

Story thay đổi restore flow.

```text
Risk: HIGH
Signals:
- destructive replacement
- rollback/recovery requirement
- data consistency invariant

Required evidence:
- invalid backup rejected before mutation
- complete restore succeeds atomically
- failure leaves original dataset intact
- retry behavior after unknown result is defined and tested
```

Manual “đã đọc code và thấy ổn” không đủ cho destructive path khi executable
integration test có thể được viết.

### Ví dụ E: blocker — AC mơ hồ

AC nói “search phải nhanh và chính xác” nhưng không định nghĩa matching semantic,
ordering hoặc performance threshold.

Hành động đúng:

```text
Risk: HIGH
Finding: SPEC_AMBIGUITY
Missing decisions:
- exact/prefix/substring/fuzzy matching
- case and accent sensitivity
- result ordering
- measurable latency target

Action:
- stop implementation
- request BMAD/human resolution
```

Hành động sai là Codex tự chọn fuzzy search rồi viết implementation.

## 10. Cách dùng kiến trúc hiệu quả

### Nên làm

- bắt đầu từ Story và AC, không bắt đầu từ methodology;
- chỉ load context có khả năng thay đổi quyết định;
- biến risk thành test/review depth cụ thể;
- giữ delta plan ngắn và chỉ chứa khoảng trống implementation;
- chạy focused checks sớm để feedback nhanh;
- chạy full applicable gate trước completion;
- lưu AC evidence ngắn, có command và result;
- escalate ambiguity thay vì đoán;
- report rõ check nào chưa tồn tại.

### Không nên làm

- tạo plan dài bằng cách copy lại Story;
- gọi reviewer chỉ vì Story “quan trọng” nhưng không xác định failure mode;
- coi số finding là thước đo review quality;
- chạy toàn bộ skills theo một checklist cố định;
- đọc toàn bộ repository cho mọi Story;
- dùng status `done` để suy ra test đã pass;
- claim CI/test pass khi command chưa tồn tại;
- sửa product scope trong lúc xử lý implementation finding;
- tạo thêm agent khi repeated failure chưa được root-cause.

## 11. Quick reference

| Tình huống | Hành động |
|---|---|
| Story Tasks đã actionable | Implement trực tiếp |
| Thiếu file mapping hoặc execution order | Viết delta plan ngắn |
| Behavioral logic mới | Dùng TDD |
| Có failure tái hiện được | Dùng systematic debugging |
| Multi-module/state/integration | MEDIUM, inspect consumers và unhappy paths |
| Auth, migration, concurrency, contract, backup | HIGH, deeper Codex review + targeted tests |
| AC mơ hồ | Dừng, `SPEC_AMBIGUITY`, escalate |
| Test chưa tồn tại nhưng đáng ra có thể viết | Thêm deterministic test |
| AC không thể automated test hợp lý | Manual evidence ngắn + lý do |
| User yêu cầu code review riêng | Có thể dùng optional `bmad-code-review` |
| Chuẩn bị tuyên bố hoàn tất | Chạy fresh Done Gate |

## 12. Trạng thái repository hiện tại

Tại thời điểm V2 được thiết lập:

- canonical policy nằm trong `AGENTS.md`;
- canonical approved-Story router là `.agents/skills/story-development/`;
- BMAD artifacts vẫn là nguồn sự thật cho NoteFlow;
- Antigravity không còn trong active architecture;
- product CI/test/lint/typecheck/build/contract/smoke dự kiến từ Story 1.1 chưa
  được coi là executable evidence cho tới khi Story đó thực sự implement chúng;
- legacy BMAD Build renderer còn unresolved spaced placeholders và không nằm trên
  approved Story path;
- linked worktree cũ có thể chứa policy cũ và phải được kiểm tra drift trước khi
  tiếp tục phát triển.

## 13. Tóm tắt một câu

Kiến trúc V2 dùng BMAD để quyết định **xây cái gì**, Codex để trực tiếp **xây như
thế nào**, deterministic evidence để chứng minh **đã xây đúng**, risk routing để
quyết định **cần kiểm tra sâu tới đâu**, và human để quyết định **có chấp nhận,
merge hoặc release hay không**.

## 14. Lộ trình đọc policy và skill files

Nếu muốn hiểu kiến trúc từ source thay vì chỉ đọc tài liệu diễn giải này, hãy đọc
các file dưới đây theo đúng thứ tự. Thứ tự quan trọng vì project policy có quyền
cao hơn generic skill guidance.

### Nhóm A — Lõi kiến trúc, nên đọc hết theo thứ tự

1. [Project Agent Instructions](../../AGENTS.md)

   Bắt đầu ở đây để hiểu authority order, canonical Story router, risk routing,
   selective Superpowers, failure policy và Deterministic Done Gate. Đây là
   policy cao nhất trong repository cho agent execution.

2. [Story Development Router](../../.agents/skills/story-development/SKILL.md)

   Đọc để hiểu một approved hoặc `ready-for-dev` Story thực sự đi qua các bước
   nào: preflight, focused context, readiness, risk, plan, implementation,
   verification, escalation và BMAD handoff.

3. [Story Risk Rubric](../../.agents/skills/story-development/references/complexity-rubric.md)

   Đọc để phân biệt LOW, MEDIUM và HIGH, đồng thời hiểu risk làm tăng review
   depth và evidence như thế nào mà không tự động thêm agent.

4. [BMAD Entry Skill](../../.agents/skills/bmad/SKILL.md)

   Đọc để hiểu BMAD được kích hoạt như một specification/lifecycle system như
   thế nào. Khi nội dung generic trong BMAD khác project routing, `AGENTS.md` và
   `story-development` được ưu tiên.

5. [BMAD Routing Knowledge](../../.agents/skills/bmad/references/help.md)

   Đọc phần implementation/quality và “what's next” để thấy approved Stories đã
   được route sang `story-development`, còn Code Review chỉ là explicit option.

6. [BMAD Sprint Planning](../../.agents/skills/bmad-sprint-planning/SKILL.md)

   Đọc để hiểu readiness, sprint status và lifecycle record. Skill này quản lý
   planning/status; nó không thay Codex implement Story.

Sau sáu file trên, bạn đã hiểu đầy đủ control plane chính:

```text
BMAD specification/lifecycle
→ story-development routing
→ Codex implementation
→ deterministic evidence
→ BMAD status synchronization
→ human authority
```

### Nhóm B — Kỹ thuật được gọi có điều kiện

7. [Superpowers Skill Mechanics](../../.agents/skills/superpowers/using-superpowers/SKILL.md)

   File này giải thích cách skill được phát hiện và gọi. Đây là generic upstream
   guidance, không phải Story lifecycle. Project-specific routing trong
   `AGENTS.md` vẫn có quyền cao hơn.

8. [Verification Before Completion](../../.agents/skills/superpowers/verification-before-completion/SKILL.md)

   Đọc để hiểu nguyên tắc “evidence before claims” và lý do completion luôn cần
   fresh verification.

9. [Test-Driven Development](../../.agents/skills/superpowers/test-driven-development/SKILL.md)

   Đọc khi Story có behavioral logic hoặc regression. TDD không phải ceremony
   bắt buộc cho scaffold, documentation hoặc config thuần túy.

10. [Systematic Debugging](../../.agents/skills/superpowers/systematic-debugging/SKILL.md)

    Đọc khi có failure hoặc unexpected behavior thực tế. Skill này định nghĩa
    reproduce → root cause → smallest fix → verification.

11. [Writing Plans](../../.agents/skills/superpowers/writing-plans/SKILL.md)

    Đọc khi Story Tasks/Subtasks không đủ actionable. Trong V2, output cần dùng
    là delta plan ngắn, không phải một bản sao đầy đủ của Story.

12. [Receiving Code Review](../../.agents/skills/superpowers/receiving-code-review/SKILL.md)

    Chỉ đọc và dùng khi đã có feedback thật. Mục tiêu là verify finding trước
    khi fix, không đồng ý hoặc sửa một cách máy móc.

### Nhóm C — Optional hoặc legacy, không thuộc default Story path

13. [Optional BMAD Code Review](../../.agents/skills/bmad-code-review/SKILL.md)

    Chỉ dùng khi user yêu cầu code review riêng. Skill này không phải Done Gate
    bắt buộc và không được chạy sau mọi Story.

14. [Legacy BMAD Build](../../.agents/skills/bmad-build/SKILL.md)

    Chỉ dùng khi user gọi rõ `bmad-build` cho freeform work không phải approved
    BMAD Story. Approved Stories phải đi qua `story-development`.

### Những file không cần đọc để hiểu V2

- `_bmad/render/**`: generated snapshot của legacy renderer, hiện còn unresolved
  placeholders và không nằm trên active approved-Story path;
- `.worktrees/**`: có thể là checkout chứa policy cũ, không phải canonical policy;
- Superpowers `subagent-driven-development`, `requesting-code-review`,
  `executing-plans` và `using-git-worktrees`: capability upstream, không thuộc
  default V2 flow;
- Antigravity integration: đã bị loại khỏi canonical architecture.

### Lộ trình đọc nhanh

Nếu chỉ có khoảng 15 phút, đọc theo thứ tự:

```text
AGENTS.md
→ story-development/SKILL.md
→ complexity-rubric.md
→ verification-before-completion/SKILL.md
```

Nếu sẽ trực tiếp vận hành Story, đọc tiếp BMAD routing/sprint files và chỉ mở
TDD, debugging, planning hoặc review skill đúng lúc signal tương ứng xuất hiện.
