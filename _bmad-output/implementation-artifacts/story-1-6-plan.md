---
schema_version: 2
story_id: "1.6"
story:
  path: _bmad-output/implementation-artifacts/1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md
  normative_digest: sha256:e47376dc5ccc2d1d34ec3c0466c2165f1654845b9ef0cdaed222acac0db68d76
upstream_epic:
  path: docs/product/epics.md
  section_digest: sha256:2e9a3f2e425a6e1e3b04a5141098c9d8efe9108b1cbf50bd9978d8163eabfdec
sprint_key: 1-6-giải-quyết-xung-đột-nội-dung-giữa-hai-thiết-bị
lifecycle_snapshot: in-progress
execution_status: in-progress
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:e47376dc5ccc2d1d34ec3c0466c2165f1654845b9ef0cdaed222acac0db68d76
  approved_at: 2026-09-30
readiness:
  status: READY
  story_normative_digest: sha256:e47376dc5ccc2d1d34ec3c0466c2165f1654845b9ef0cdaed222acac0db68d76
  dependency_sprint_keys:
    - 1-1-khởi-tạo-nền-tảng-noteflow-từ-starter-được-duyệt
    - 1-2-đăng-nhập-và-bảo-vệ-dữ-liệu-owner
    - 1-3-dùng-một-ngày-và-tuần-thống-nhất-trên-mọi-thiết-bị
    - 1-4-nhận-dữ-liệu-mới-giữa-hai-thiết-bị
    - 1-5-giữ-bản-đang-nhập-và-thử-lưu-lại-sau-gián-đoạn
    - 2-1-tạo-và-quản-lý-thông-tin-challenge
    - 2-3-ghi-và-sửa-journal-tùy-chọn
current_slice: C
risk:
  level: HIGH
  flags: [concurrency, idempotency, security, shared_boundary]
slices:
  - id: A
    status: reviewed
    depends_on: []
    task_refs: [T-1]
    baseline_commit: e54feb3c3b780eed9de9905858b8c9513fab4c46
    checkpoint_commit: b1731a6707640376cb046be9d77850499bd780d8
    subject_digest: sha256:eee8f64fc1e0358d109751c75ea214b3d4765631666a855db00e3deb1cdae716
    changed_paths_sha256: sha256:5f4ac585b9bca5da6d69d2521e618e385b104258a4811dfd6cdbbd0bea106c98
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/A-implementation.json
        digest: sha256:9bf50f9f6795d70047a410ca49a4e0cb9fdc7161732f261986488cc684856690
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/A-verification.json
        digest: sha256:06015dd4d398045966730d1d883503ec0a79ab6f3e200c606a59f4af75c24b93
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/A-review.json
        digest: sha256:6f79936813a0c46bcb1d5c1c0f2f0b50f4f800c8a8edd0b451fb625476311965
    verification:
      subject:
        commit: b1731a6707640376cb046be9d77850499bd780d8
      changed_paths_sha256: sha256:5f4ac585b9bca5da6d69d2521e618e385b104258a4811dfd6cdbbd0bea106c98
      canonical_applicability: NOT_APPLICABLE
      canonical_status: INCOMPLETE
      progression_eligible: true
      done_gate_disclosure_required: true
      outstanding_obligation: canonical verification remains INCOMPLETE because NO_APPLICABLE_RECIPE; focused backend checks are the T-1 coverage authority
      review_disclosure: Same-lead bounded review approved focused T-1 evidence; canonical backend recipe coverage remains unavailable and is disclosed.
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: b1731a6707640376cb046be9d77850499bd780d8
      risk_context_digest: sha256:54a5ad338aa76d1b6e60a1b073ecb93ce6e9736508edf87586271961e411c46d
      review_context_digest: sha256:d8625fca3adbd458a8d6d368ff907f11dd87cbfc6cae6e2626d35c42bffcc3db
      freshness: FRESH_CANDIDATE
    consumers:
      - frontend/src/api/challenges.ts
      - frontend/src/stores/journalDrafts.ts
      - contracts/openapi.yaml
    verification_obligations:
      - "T-1: journal API/contract/DB invariants and two-connection PostgreSQL contention; backend testing environment; NOT_RUN"
  - id: B
    status: reviewed
    depends_on: [A]
    task_refs: [T-2, T-3]
    baseline_commit: c77298cb2dbb6d59e2d78d1da20fedf9f5f0a677
    checkpoint_commit: 7bf99467a2dabb7ef2362b816ab410e4823024d4
    subject_digest: sha256:c23724e3692896996ec304bffa113ada22e926443398b39c09572d1eb0641c04
    changed_paths_sha256: sha256:0ff80f148b8e5fbdec8988483ead90895c45f93e248711f131778b6cae79e1e4
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/B-implementation.json
        digest: sha256:be470af096c958357604ad63ee23d7f7a2a1839f66a8d9f3e2c643316bf11f49
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/B-verification.json
        digest: sha256:3adf34b7b2009f3057a16796c0c9024cbfe7aa91de91c8a4be16b8427d6febeb
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/B-review.json
        digest: sha256:ca100f3cedc043ec62b35ebfa51e62ba0171c5f430481137936c170df1d0d52e
    verification:
      subject:
        commit: 7bf99467a2dabb7ef2362b816ab410e4823024d4
      changed_paths_sha256: sha256:0ff80f148b8e5fbdec8988483ead90895c45f93e248711f131778b6cae79e1e4
      status: INCOMPLETE
      canonical_status: INCOMPLETE
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
      done_gate_disclosure_required: true
      outstanding_obligation: "Canonical mapping excludes the journal draft store paths; raw canonical status remains INCOMPLETE."
      review_disclosure: "Same-lead HIGH-risk review approved the exact T-2/T-3 focused evidence. Canonical journal recipe remains INCOMPLETE because the store paths are unmapped."
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: 7bf99467a2dabb7ef2362b816ab410e4823024d4
      risk_context_digest: sha256:54a5ad338aa76d1b6e60a1b073ecb93ce6e9736508edf87586271961e411c46d
      review_context_digest: sha256:d796d1192c85afcf71e13bd22e4e35a20d739f4817c886e3ea4dfadd77810999
      freshness: FRESH_CANDIDATE
      reviewer: same-lead
    consumers:
      - frontend/src/components/ChallengeJournalEditor.vue
      - frontend/src/stores/auth.ts
      - frontend/src/stores/account.ts
      - frontend/src/components/AppShell.vue
    verification_obligations:
      - "T-2: typed identity validation and selected resolution payload in journalDrafts/challenges API tests; NOT_RUN"
      - "T-3: single flight, identical retry, revision/auth/epoch/resource fences and private lifecycle regression; NOT_RUN"
  - id: C
    status: checkpointed
    depends_on: [B]
    task_refs: [T-4, T-5]
    baseline_commit: 3925efa6fc7bb9cfea676f880e7e229c30d9d5b0
    checkpoint_commit: 211305dcaee5a6b599c581f47c0e4978c7b1eac8
    subject_digest: sha256:f9c450af54b77765ea9792ee316ad105b4b7b78d53d1384305296c50016294f2
    changed_paths_sha256: sha256:d64440a6eb066682f7650f58adaa2da97fba7f7f287aa7c1275a37daefdf0d4d
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/C-implementation.json
        digest: sha256:632fdf35104ca24e079c57e8611f5002e0076a03f22b9b9edcc9f65724b06878
    consumers:
      - frontend/src/stores/journalDrafts.ts
      - frontend/src/views/ChallengesView.vue
    verification_obligations:
      - "T-4: ContentConflictDialog component semantics and events; real-browser/AT obligations remain T-7; NOT_RUN"
      - "T-5: journal and journal-draft-lifecycle integration including close/reopen and invalidated choices; NOT_RUN"
  - id: D
    status: pending
    depends_on: [C]
    task_refs: [T-6]
    consumers:
      - frontend/src/views/ChallengesView.vue
      - frontend/src/components/ChallengeJournalEditor.vue
      - frontend/src/stores/journalDrafts.ts
    verification_obligations:
      - "T-6: real journal QueryObserver convergence plus sync/draft and stale callback regressions; NOT_RUN"
  - id: E
    status: pending
    depends_on: [D]
    task_refs: [T-7, T-8]
    consumers:
      - tests/e2e/cross-device-sync.spec.ts
      - tests/e2e/helpers/db-state.ts
      - tests/e2e/helpers/db-helper.php
      - .github/workflows/ci.yml
    verification_obligations:
      - "T-7: journal API/PostgreSQL and two browser contexts, mobile/keyboard/manual screen reader; NOT_RUN"
      - "T-8: complete frontend/backend/E2E gates, exact-diff HIGH-risk review and AC evidence; NOT_RUN"
blockers: []
unresolved_questions: []
next_action:
  kind: verify_slice
  target: C
---

# Story 1.6 — V4 upgrade execution projection

Đây là Plan canonical để Runner đọc. Product intent, bốn AC, tám Tasks,
exact file boundaries, readiness và invariants nằm trong Story được bind ở
frontmatter. Plan này không tự cấp quyền start hoặc implementation.

## Trạng thái planning

- Ngày 2026-09-30: chuyển bản planning cũ sang separated schema-v2 theo yêu
  cầu V4 upgrade. Story/sprint giữ backlog; tất cả slices pending.
- Planning decision APPROVED ngày 2026-09-30 cho đúng scope Challenge Journal
  và AC-1..AC-4; readiness READY, execution đã chuyển sang ready-for-dev.
  Chưa có checkpoint, verification, implementation/review receipt,
  finalization hoặc Human Gate approval.
- next_action start_story là action V4 đã được chuẩn bị sau khi các artifact
  và checkout vượt qua read-only start gate. Kết quả READY của
  check-story-plan chỉ chứng minh hợp lệ về artifact/binding, không thay kết
  quả start-story check.
- V4 upgrade dùng schema-v2 và action contracts hiện có; không mutate
  canonical V3 runtime, không bootstrap story-development/Orca, không cần
  nâng schema hoặc sửa router.

## Slice projection

| Slice | Task refs | Dependency | Deliverable để review |
| --- | --- | --- | --- |
| A | T-1 | none | Journal server contract và concurrency evidence |
| B | T-2, T-3 | A | Resolution state, retry và lifecycle guards |
| C | T-4, T-5 | B | Dialog và journal editor integration |
| D | T-6 | C | Journal query convergence |
| E | T-7, T-8 | D | Hai thiết bị, accessibility và full verification |

Mỗi implement_slice chỉ làm slice hiện tại. Commit implementation chứa
exact paths của task; commit metadata kế tiếp chỉ Plan và implementation
receipt mới bind checkpoint thực. Successor là verify_slice của cùng
slice; dừng trước successor. Verify không sửa product code. HIGH risk luôn
đi review có evidence/fingerprint đầy đủ; không đặt review_slice hoặc tự
đổi status để đi tiếp. Sau slice E, successor hợp lệ là finalize_story;
finalization dừng ở review/Human Gate, complete_story là authority riêng.

## Planning-to-start handoff

1. Planning decision đã được ghi nhận ngày 2026-09-30 cho đúng scope và
   normative digest hiện tại; approval/readiness cùng bind vào digest.
2. Readiness đã đủ: execution_status là ready-for-dev, blocker đã được
   giải quyết, mọi slice vẫn pending. Story/Plan/sprint lifecycle tiếp tục
   ở backlog để fresh-start contract xử lý.
3. Commit bộ planning artifacts bằng exact paths vào checkout thực thi,
   bảo toàn thay đổi người dùng. Worktree story-1-6 đang tồn tại nhưng
   không tự nhận uncommitted files từ main; phải chuyển các artifacts
   bằng Git workflow được cho phép trước khi gọi Runner tại đó.
4. Với yêu cầu start V4 rõ ràng, đọc canonical IDLE và chạy check-story-plan,
   sau đó start-story check theo HEAD mới. Chỉ dùng apply với fingerprint
   do check READY mới sinh ra; fingerprint không được tạo sẵn trong plan.
5. start_story thành công chỉ commit lifecycle, persist implement_slice:A
   rồi dừng. Không nối start và implement A trong một invocation.

## V4 upgrade verification disclosures

Registry hiện có các recipes journal-frontend, challenge-list, today-view.
Journal recipe chỉ phủ các paths hiện khai báo; không chứng minh store
resolution mới, dialog mới, backend hoặc browser persistence. Chạy
canonical aggregate trên tất cả changed paths cùng focused CheckSpecs
theo Story. INCOMPLETE/ERROR/FAIL vẫn giữ nguyên và đi escalation; focused
checks không đổi raw canonical result thành PASS. Không cập nhật anchor
hash hoặc thêm recipe trong product slice chỉ để bỏ cảnh báo.

Schema-v2 không dùng slice.scope/purpose/implementation của schema-v1.
Exact edit paths được nêu trong Story Tasks. Nếu context projection trả
file_scope UNKNOWN, phải đọc task tương ứng và xác minh exact paths trước
staging; không hiểu UNKNOWN là rỗng hoặc quyền sửa cả repo. Consumers và
verification obligations ở frontmatter là projections để hỗ trợ đọc
context, không phải các checks đã chạy hoặc receipts.

Review units tuân thủ prepare-change-evidence: tối đa 4 paths, 6 hunks/path,
240 diff lines/unit. Chia units nếu tool yêu cầu; không bỏ phần diff vượt
budget, không gọi một review incomplete là APPROVE.

## Read-only diagnostics

Từ checkout chứa Story/Plan:

~~~text
node .agents/scripts/check-story-plan.mjs check 1.6
node .agents/scripts/start-story.mjs check 1.6 --expected-head <actual-HEAD>
~~~

Lấy actual-HEAD bằng git rev-parse HEAD tại thời điểm chạy. Các lệnh này
không start Story. Không chạy context compiler hay action transaction
trong phiên planning chỉ để tạo observation/evidence giả.
