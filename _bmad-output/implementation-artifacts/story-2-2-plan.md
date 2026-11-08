---
schema_version: 2
story_id: "2.2"
story:
  path: _bmad-output/implementation-artifacts/2-2-xem-challenge-và-done-nhanh-từ-hôm-nay.md
  normative_digest: sha256:bf1c8726f3361acec0baff9ea7031c11a3c4f0e8fa28976ccd91a366afa1e082
upstream_epic:
  path: docs/product/epics.md
  section_digest: sha256:f9eed2011ff42b128a8c20089e6c0c002b696294c5d052f9fe534833398bdb13
sprint_key: 2-2-xem-challenge-và-done-nhanh-từ-hôm-nay
lifecycle_snapshot: review
execution_status: complete
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:bf1c8726f3361acec0baff9ea7031c11a3c4f0e8fa28976ccd91a366afa1e082
  approved_at: 2026-10-25
readiness:
  status: READY
  story_normative_digest: sha256:bf1c8726f3361acec0baff9ea7031c11a3c4f0e8fa28976ccd91a366afa1e082
  dependency_sprint_keys: [2-1-tạo-và-quản-lý-thông-tin-challenge]
current_slice: C
risk:
  level: HIGH
  flags: [security, concurrency, public_contract]
slices:
  - id: A
    status: reviewed
    baseline_commit: 0d6cefca91934bf383b520185afd5d0c54cbddc1
    checkpoint_commit: 389aad3f2dd59c91bd91482d51787eac880ebfbd
    subject_digest: sha256:f40d69357d59b6edcf0712231d1e29afbdfe542db6281c068ab3e65a1a835ab5
    changed_paths_sha256: sha256:9780207777b3746d559d7791dee0d3c97d2fbb022a5478608187c8c1d28fc766
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/A-implementation.json
        digest: sha256:6a6af202cd6b616272698777e5c2713e33cbe05a7e43de667f5b31cc39310cc9
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/A-verification.json
        digest: sha256:1d8649aea27bbbb2ec60a5cc7ad366f6079e4b39d76c2814a8ddc6af32b33f69
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/A-review.json
        digest: sha256:2be81524a613e37153f8b0cf793dbb9ac97d24cfcc8e9522922c2e20c8d133ff
    task_refs: [T-1, T-2]
    depends_on: []
    executor: lead
    risk:
      level: HIGH
      flags: [security, concurrency]
    scope:
      paths: [backend/app/Modules/Challenges/Application/Commands/MarkCompletionCommand.php, backend/app/Modules/Challenges/Application/UseCases/MarkCompletionUseCase.php, backend/app/Modules/Challenges/Application/UseCases/GetCurrentWeekProgressQuery.php, backend/app/Modules/Challenges/Domain/Exceptions/InvalidCompletionDayException.php, backend/tests/Feature/ChallengeCompletionTest.php, backend/tests/Feature/ChallengeCompletionConcurrencyTest.php, backend/tests/Feature/ChallengeWeekProgressTest.php]
    verification_obligations:
      - powershell.exe -File scripts/local.ps1 test from the Story worktree - full backend suite passes with no warnings
      - vendor/bin/pint --test and composer analyse inside the worktree backend-test container
      - ChallengeWeekProgressTest covers week boundaries (Monday/Sunday in the account timezone), start date inside the week, target in effect, and owner isolation
      - ChallengeCompletionTest covers account-today only, invalid date and is_done false rejection, replay of an identical command, reused command ID with another payload, stale data epoch, closed write fence, and journal text and journal_version unchanged
      - ChallengeCompletionConcurrencyTest proves two concurrent Done commands for the same day leave one completion, one completion_version step and one account_revision step
    verification:
      status: INCOMPLETE
      canonical:
        status: INCOMPLETE
      escalation:
        decision: REVIEW_REQUIRED
      progression_eligible: true
      review_disclosure: owner exact-scope review; canonical recipe not applicable (NO_APPLICABLE_RECIPE)
    review:
      freshness: FRESH_CANDIDATE
      judgment: APPROVE
      reviewed_commit: 389aad3f2dd59c91bd91482d51787eac880ebfbd
      risk_context_digest: sha256:ce0a172d5ac363143289305293f15134bc509213d4cee12eb1df950e38530a32
      reviewer:
        type: human
        vendor: null
        independent: false
  - id: B
    status: reviewed
    baseline_commit: ba050ef727d526a1c19140cc2b2a3f025fc31e4a
    checkpoint_commit: 58888d0001f28f324aaa8de05cf9202271f86aab
    subject_digest: sha256:f40d69357d59b6edcf0712231d1e29afbdfe542db6281c068ab3e65a1a835ab5
    changed_paths_sha256: sha256:cae37c9d15e4cd5fe33e1dabcd78b6bafe2e79db577dd0845dbd09607b0f689c
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/B-implementation.json
        digest: sha256:adb07c79bd11a31b2c46ca72066e093d435cc1173950f2c33c3735b3d8230f5c
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/B-verification.json
        digest: sha256:6ae0aec862a4d25dfe3a1fd7f37cd8159904f422d9527c20836634f0ce2d30ce
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/B-review.json
        digest: sha256:da7f1cd776a524eeae43fb8527f5806df54f57893e44cf7d14c6065cb4411cf8
    task_refs: [T-3]
    depends_on: [A]
    executor: lead
    risk:
      level: HIGH
      flags: [security, public_contract]
    scope:
      paths: [backend/app/Http/Controllers/ChallengeCompletionController.php, backend/app/Http/Controllers/ChallengeController.php, backend/app/Modules/Challenges/Application/UseCases/GetChallengeListQuery.php, backend/routes/api.php, contracts/openapi.yaml, backend/tests/Feature/ChallengeCompletionApiTest.php, backend/tests/Feature/ChallengeApiTest.php, backend/tests/Contract/ChallengeContractTest.php, frontend/src/api/schema.generated.ts, frontend/src/api/challenges.ts, frontend/src/api/__tests__/challenges.spec.ts, frontend/src/views/__tests__/challenges.spec.ts, frontend/src/views/__tests__/journal.spec.ts, frontend/src/views/__tests__/today.spec.ts, frontend/src/__tests__/App.spec.ts]
    verification_obligations:
      - powershell.exe -File scripts/local.ps1 test from the Story worktree - full backend suite passes with no warnings
      - vendor/bin/pint --test and composer analyse inside the worktree backend-test container
      - npm run contract:validate and npm run contract:check in frontend
      - npm run type-check, npm run lint and npm run test:unit -- --run in frontend
      - ChallengeCompletionApiTest covers guest 401, non-owner 404, unknown fields 422, non-today date 422, replay, idempotency reuse, stale epoch and write fence problem details
    verification:
      canonical_applicability: APPLICABLE
      status: INCOMPLETE
      canonical:
        status: INCOMPLETE
      escalation:
        decision: REVIEW_REQUIRED
      progression_eligible: true
      review_disclosure: owner exact-scope review; backend and contract paths are not covered by a canonical recipe (UNMAPPED_CHANGED_PATH); mapped frontend recipes passed
    review:
      freshness: FRESH_CANDIDATE
      judgment: APPROVE
      reviewed_commit: 58888d0001f28f324aaa8de05cf9202271f86aab
      risk_context_digest: sha256:ce0a172d5ac363143289305293f15134bc509213d4cee12eb1df950e38530a32
      reviewer:
        type: human
        vendor: null
        independent: false
  - id: C
    status: reviewed
    baseline_commit: 211981d3157737b674bdf0d5ac34cdb50c56383c
    checkpoint_commit: 0364a9eeb6791eba385cadb589f0132204aa1899
    subject_digest: sha256:f40d69357d59b6edcf0712231d1e29afbdfe542db6281c068ab3e65a1a835ab5
    changed_paths_sha256: sha256:ac48ef0f1da9d64df8daff891a63431ea14579603707c01357b933123590c010
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/C-implementation.json
        digest: sha256:3e5014c90bbf35022b53b00c705742963ea6425306a841fa9ebc2c964741c7ba
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/C-verification.json
        digest: sha256:d9733f98b7f185e477c40737468f1a67e40bda624d0ad14351691968a57a0f58
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-2-2/C-review.json
        digest: sha256:fc0705f7c7a0261a5d1307202cf740b60f65385c8b1396b2e4a3d1bced269cdc
    task_refs: [T-4]
    depends_on: [B]
    executor: agy
    risk:
      level: HIGH
      flags: [public_contract]
    scope:
      paths: [frontend/src/views/TodayView.vue, frontend/src/views/__tests__/today.spec.ts, frontend/src/views/__tests__/account-time.spec.ts]
    verification_obligations:
      - npm run type-check in frontend
      - npm run lint in frontend
      - npm run test:unit -- --run src/views/__tests__/today.spec.ts src/views/__tests__/account-time.spec.ts in frontend
      - today.spec.ts proves the row renders name, Done/target this week and today's state from projection fields only, one tap sends a single Done command without journal, saved appears only after the acknowledgement, a failed request keeps the previous state with retry, and an already-done day shows Done without a second request
      - powershell.exe -File scripts/local.ps1 e2e from the Story worktree after the slice checkpoint
    verification:
      status: PASS
      canonical:
        status: PASS
      escalation:
        decision: REVIEW_REQUIRED
      progression_eligible: true
      review_disclosure: owner exact-scope review of an AGY-authored slice; canonical today-view recipe PASS after the owner-approved anchor refresh 56d2d1e
    review:
      freshness: FRESH_CANDIDATE
      judgment: APPROVE
      reviewed_commit: 0364a9eeb6791eba385cadb589f0132204aa1899
      risk_context_digest: sha256:ce0a172d5ac363143289305293f15134bc509213d4cee12eb1df950e38530a32
      reviewer:
        type: human
        vendor: null
        independent: false
blockers: []
unresolved_questions: []
finalization:
  receipt_ref: _bmad-output/implementation-artifacts/receipts/story-2-2/finalization.json
  receipt_digest: sha256:d945f1c862ee88e6fcdf4c3dba9b0177d24a3f1321da9db75c483515a4cd2aa7
  done_gate_disposition: SATISFIED_WITH_DISCLOSURES
  scope_paths_digest: sha256:adff8920bbd34229a7a72efa0a1a080c6e1a10aaaf3a8316624a6aed323a72d4
  implementation_commit_set_digest: sha256:67c78549c256f4d5bbbd2415ee9df80ca2d2f060f7945f0d2d3d3cf727fba22d
  final_scoped_tree_digest: sha256:adf937ff9f640a977a46552a0ad7b62ad76b45e9b00c83478c3dca62fe729165
  prepared_from_head: a03cb63c5fc7764f604c9537004cccac8d9a00a2
human_approval: null
next_action:
  kind: complete_story
  target: story
autopilot:
  schema_version: 1
  authorized_at: "2026-10-25T05:19:35.262Z"
  authorized_plan_digest: sha256:c1389c459ae844952bbe02c5f24752aaaafc8183581405bad2a002f11f11fed8
  authorized_head: 1d0b8f6c36e18098226cb982c19494f92e1743ad
  budgets:
    max_slices: 3
    max_rework_per_slice: 2
    max_minutes_per_slice: 90
  lead_vendor: claude
  revoked: true
---

# Story 2.2 execution plan

Slice A (Lead) adds the shared current-week projection and the MarkCompletion
use case with concurrency and idempotency tests. Slice B (Lead) exposes both
through GET /v1/challenges and PUT /v1/challenges/{id}/completions/{date},
updates the OpenAPI contract, regenerates frontend types and extends the typed
client, because the client validates exact response keys. Slice C (AGY) adds the
one-tap Done control to Today on top of that client. Every slice is HIGH, so
each review stops for the owner.
