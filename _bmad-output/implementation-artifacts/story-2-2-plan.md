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
lifecycle_snapshot: ready-for-dev
execution_status: ready-for-dev
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:bf1c8726f3361acec0baff9ea7031c11a3c4f0e8fa28976ccd91a366afa1e082
  approved_at: 2026-10-25
readiness:
  status: READY
  story_normative_digest: sha256:bf1c8726f3361acec0baff9ea7031c11a3c4f0e8fa28976ccd91a366afa1e082
  dependency_sprint_keys: [2-1-tạo-và-quản-lý-thông-tin-challenge]
current_slice: A
risk:
  level: HIGH
  flags: [security, concurrency, public_contract]
slices:
  - id: A
    status: pending
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
  - id: B
    status: pending
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
  - id: C
    status: pending
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
blockers: []
unresolved_questions: []
next_action:
  kind: start_story
  target: story
---

# Story 2.2 execution plan

Slice A (Lead) adds the shared current-week projection and the MarkCompletion
use case with concurrency and idempotency tests. Slice B (Lead) exposes both
through GET /v1/challenges and PUT /v1/challenges/{id}/completions/{date},
updates the OpenAPI contract, regenerates frontend types and extends the typed
client, because the client validates exact response keys. Slice C (AGY) adds the
one-tap Done control to Today on top of that client. Every slice is HIGH, so
each review stops for the owner.
