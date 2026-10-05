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
lifecycle_snapshot: review
execution_status: complete
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
current_slice: E
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
    status: reviewed
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
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/C-verification.json
        digest: sha256:c6c6c12c071e7ecdce0b84997bab4507fff22feed542856d229220d0e5845344
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/C-review.json
        digest: sha256:d1ba655df45dfece07047babf5ec50153f31facbcfa52729658b6254414d8e49
    consumers:
      - frontend/src/stores/journalDrafts.ts
      - frontend/src/views/ChallengesView.vue
    verification_obligations:
      - "T-4: ContentConflictDialog component semantics and events; real-browser/AT obligations remain T-7; NOT_RUN"
      - "T-5: journal and journal-draft-lifecycle integration including close/reopen and invalidated choices; NOT_RUN"
    verification:
      subject:
        commit: 211305dcaee5a6b599c581f47c0e4978c7b1eac8
      changed_paths_sha256: sha256:d64440a6eb066682f7650f58adaa2da97fba7f7f287aa7c1275a37daefdf0d4d
      status: INCOMPLETE
      canonical_status: INCOMPLETE
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
      done_gate_disclosure_required: true
      outstanding_obligation: "Canonical verification is INCOMPLETE because three Slice C paths remain unmapped; browser and accessibility obligations remain in Slice E."
      review_disclosure: "Same-lead HIGH-risk review approved T-4/T-5 focused evidence; canonical status remains INCOMPLETE for three unmapped paths. No browser or screen-reader evidence is claimed."
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: 211305dcaee5a6b599c581f47c0e4978c7b1eac8
      risk_context_digest: sha256:54a5ad338aa76d1b6e60a1b073ecb93ce6e9736508edf87586271961e411c46d
      review_context_digest: sha256:75da57d6b59b82bce5820f2c8d3111889112ae53a1d287b88ab99bcdbcbfbb76
      freshness: FRESH_CANDIDATE
      reviewer: same-lead
  - id: D
    status: reviewed
    depends_on: [C]
    task_refs: [T-6]
    baseline_commit: d3200ef5341d047cda7c43a7b1ba4cdac88b46fd
    checkpoint_commit: 64ca94d4191e0a8978b3c60f18092ea31a26fc1e
    subject_digest: sha256:0d748ad53546e48d99a364914a0bd8aeb47fae5eadad4b45f6eabbe0af1c56f3
    changed_paths_sha256: sha256:fd29e52500f4cb026d79ce31de90fdce07f07cd24cedc22e9eb6664ff87e00f0
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-implementation-attempt-2.json
        digest: sha256:e5ad7deea4dc10511a4a99fa39044fba91c33a2157c42e3ca46b9e0ed9e8ba2c
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-verification-attempt-2.json
        digest: sha256:ba8a151da82f608f510af7b7cdc70c20d5f3eaa46fb0754d6831b9aa8d4bb205
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-review-attempt-2.json
        digest: sha256:0091177f94dc0efde2613e40efff7b72b7b2a15351ed958b70e5f1f092ba752f
    attempt_history:
      - attempt_id: 1
        status: checkpointed
        baseline_commit: 3aec738a0dfb9024c0afa1662115781d298c7268
        checkpoint_commit: 1fdaa79a6c347791dd6a72c7500d3bb8e95b7583
        subject_digest: sha256:2715621f36aee68f7b93684344f0628ce601766e50fbdc71fac91228f0d306a0
        changed_paths_sha256: sha256:fd29e52500f4cb026d79ce31de90fdce07f07cd24cedc22e9eb6664ff87e00f0
        receipt_refs:
          implementation:
            path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-implementation.json
            digest: sha256:d2ef61816154ce75631ff11f1c0286f273ce5f9a77f77d18b96fb8f7e32147d0
    current_attempt:
      attempt_id: 2
      receipt_refs:
        implementation:
          path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-implementation-attempt-2.json
        verification:
          path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-verification-attempt-2.json
        review:
          path: _bmad-output/implementation-artifacts/receipts/story-1-6/D-review-attempt-2.json
    consumers:
      - frontend/src/views/ChallengesView.vue
      - frontend/src/components/ChallengeJournalEditor.vue
      - frontend/src/stores/journalDrafts.ts
    verification_obligations:
      - "T-6: real journal QueryObserver convergence plus sync/draft and stale callback regressions; NOT_RUN"
    verification:
      subject:
        commit: 64ca94d4191e0a8978b3c60f18092ea31a26fc1e
      changed_paths_sha256: sha256:fd29e52500f4cb026d79ce31de90fdce07f07cd24cedc22e9eb6664ff87e00f0
      status: INCOMPLETE
      canonical_status: INCOMPLETE
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
      done_gate_disclosure_required: true
      outstanding_obligation: "Canonical verification remains INCOMPLETE: sync.ts is dependency-only and both changed paths are unmapped. Two-device browser, accessibility/manual AT and full Story gates remain Slice E obligations."
      review_disclosure: "Human APPROVE records bounded T-6 review of attempt 2 plus preserved original attempt 1; fresh focused evidence closes D-F1/D-F2/D-F3. Raw canonical INCOMPLETE is unchanged; no browser/AT evidence, finalization or Human Gate is granted."
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: 64ca94d4191e0a8978b3c60f18092ea31a26fc1e
      risk_context_digest: sha256:54a5ad338aa76d1b6e60a1b073ecb93ce6e9736508edf87586271961e411c46d
      review_context_digest: sha256:4077d2571e8eb304c06ff4a6ced043517f4ca3cc658704c6edd9b786648ea0a7
      pending_fingerprint: sha256:33ee39a4be3e04ba65368dee1c2c72281ec100a60b8d091c5c856de0d9025f7d
      scope_digest: sha256:c85f464ce4ff9d35ae9f5283bc29c8ed8c0fca0ff0cd2564a19a0cc3a7cba807
      freshness: FRESH_CANDIDATE
      reviewer: human
  - id: E
    status: reviewed
    depends_on: [D]
    task_refs: [T-4, T-7, T-8]
    baseline_commit: 93aa010de4618f803b96ea005db3a520986f0157
    checkpoint_commit: 7fde0a933ce3f749d5c4d923018b6610223b09de
    subject_digest: sha256:e096bcba1d1840169f527d143b76b6af81eaae1028db19d77aa619f8142de77e
    changed_paths_sha256: sha256:0ed64dd5e09b4539ddf304b79ccd6cdb27358850db7a8d14ad02027c30d6e1b3
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/E-implementation.json
        digest: sha256:427916ec65a26cd3f30403d109c335fef4f36f487cde3ac578138ef6ec3d0124
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/E-verification.json
        digest: sha256:14cc78be1fa6e3034548eb50829ff83a3937170c1449ed02324df6fe2c81bebc
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-6/E-review.json
        digest: sha256:a7d70ca013a0f54cc51e4c5cbc770e59e77ab4f737921928bab057102076ecad
    verification:
      subject:
        commit: 7fde0a933ce3f749d5c4d923018b6610223b09de
      changed_paths_sha256: sha256:0ed64dd5e09b4539ddf304b79ccd6cdb27358850db7a8d14ad02027c30d6e1b3
      status: INCOMPLETE
      canonical_status: INCOMPLETE
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
      done_gate_disclosure_required: true
      outstanding_obligation: "Canonical verification remains INCOMPLETE because NO_APPLICABLE_RECIPE; T-7 manual screen-reader evidence remains NOT_RUN and is not replaced by automated evidence."
      review_disclosure: "Human APPROVE records bounded Slice E review of fresh attempt-5 evidence; canonical INCOMPLETE and T-7 NOT_RUN remain disclosed; no Human Gate is granted."
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: 7fde0a933ce3f749d5c4d923018b6610223b09de
      risk_context_digest: sha256:54a5ad338aa76d1b6e60a1b073ecb93ce6e9736508edf87586271961e411c46d
      pending_fingerprint: sha256:d7f85628615a9c971f8d7207a9a53be8d3e4f06f55696259870cf1b4ca1fb77d
      scope_digest: sha256:d85b6efeb532b5552360166d5b33e30a0ad748efaa453a0fcd30637165c28a7a
      freshness: FRESH_CANDIDATE
      reviewer: human

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
finalization:
  receipt_ref: _bmad-output/implementation-artifacts/receipts/story-1-6/finalization.json
  receipt_digest: sha256:738e384271a9bcc65861b117d213c2be318079c0830522b1aae388e35bea88ca
  done_gate_disposition: SATISFIED_WITH_DISCLOSURES
  scope_paths_digest: sha256:0fa7441ba4330706c621e85e78bc051628f3a7326fcc10db3f8075b808ec8a76
  implementation_commit_set_digest: sha256:9e32d25e510c7db0af31565d097fa9bc19527d7229e75d452529cd5626fa927e
  final_scoped_tree_digest: sha256:8be3340a8180fadd8c1a82da0a86abb901cf64ea359018e09b26f9425326d70d
  prepared_from_head: bc588adb4e65ab30e63345f9e9d4be62289153cb
human_approval:
  schema_version: 1
  story_id: "1.6"
  approver_type: "human"
  decision: "APPROVED"
  approved_at: "2026-10-05T01:58:31.447Z"
  story_normative_digest: "sha256:e47376dc5ccc2d1d34ec3c0466c2165f1654845b9ef0cdaed222acac0db68d76"
  finalization_receipt_digest: "sha256:738e384271a9bcc65861b117d213c2be318079c0830522b1aae388e35bea88ca"
  done_gate_summary_digest: "sha256:2b6c364f6c956fee929f42e888f4a4a562fdbbf1b49d3b2c45145e99ee03b7d4"
  scope_paths_digest: "sha256:0fa7441ba4330706c621e85e78bc051628f3a7326fcc10db3f8075b808ec8a76"
  implementation_commit_set_digest: "sha256:9e32d25e510c7db0af31565d097fa9bc19527d7229e75d452529cd5626fa927e"
  final_scope_digest: "sha256:8be3340a8180fadd8c1a82da0a86abb901cf64ea359018e09b26f9425326d70d"
  final_scoped_tree_digest: "sha256:8be3340a8180fadd8c1a82da0a86abb901cf64ea359018e09b26f9425326d70d"
  approved_review_head: "84140b3888aa08adb022df9c196cbd069a93104c"
  approved_commit: "84140b3888aa08adb022df9c196cbd069a93104c"
  approved_action: "complete_story"
  disclosures_acknowledged: true
next_action:
  kind: complete_story
  target: story
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
| E | T-4 (E-F1 only), T-7, T-8 | D | Sửa E-F1, hai thiết bị, accessibility và full verification |

### Planning scope amendment — 2026-10-04

Human đã duyệt bổ sung T-4 vào Slice E, chỉ để sửa finding E-F1: focus
rơi về BODY và Escape không đóng dialog sau conflict lần hai. Phần T-4
bổ sung này chỉ cho phép sửa `frontend/src/components/ContentConflictDialog.vue`
và regression tests tại
`frontend/src/components/__tests__/ContentConflictDialog.spec.ts`, trong
intent/invariants T-4 hiện có; không mở rộng API/store hoặc product semantics.

T-7/T-8 và toàn bộ diff E hiện có được giữ nguyên. Amendment chỉ thay
planning projection của E; Story intent/normative digest, slices A–D,
checkpoints, receipts và lifecycle không đổi. E vẫn pending, `next_action`
vẫn là `implement_slice:E`; đây không phải implementation, verification,
review approval hoặc Human Gate.

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
