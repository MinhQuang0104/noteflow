---
schema_version: 2
story_id: "4.1"
story:
  path: _bmad-output/implementation-artifacts/4-1-quản-lý-vở-và-vở-mặc-định.md
  normative_digest: sha256:af4cbd4342b6387656f8e58cb90fff49377addae6de98d635364fb0289c956f5
upstream_epic:
  path: docs/product/epics.md
  section_digest: sha256:35c66c11102ff1d071557b13db8816d0eafb637ae5194c66b316a3cf895503bc
sprint_key: 4-1-quản-lý-vở-và-vở-mặc-định
lifecycle_snapshot: in-progress
execution_status: in-progress
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:af4cbd4342b6387656f8e58cb90fff49377addae6de98d635364fb0289c956f5
  approved_at: 2026-11-08
readiness:
  status: READY
  story_normative_digest: sha256:af4cbd4342b6387656f8e58cb90fff49377addae6de98d635364fb0289c956f5
  dependency_sprint_keys: [1-4-nhận-dữ-liệu-mới-giữa-hai-thiết-bị]
current_slice: A
risk:
  level: HIGH
  flags: [security, concurrency, migration, public_contract]
slices:
  - id: A
    status: pending
    task_refs: [T-1, T-2, T-3]
    depends_on: []
    executor: lead
    risk:
      level: HIGH
      flags: [security, concurrency, migration, public_contract]
    scope:
      paths: [backend/database/migrations/2026_11_08_010000_create_notebooks_and_notes_tables.php, backend/app/Console/Commands/ProvisionOwner.php, backend/app/Modules/Notes/Application/DefaultNotebookProvisioner.php, backend/app/Modules/Notes/Application/Commands/CreateNotebookCommand.php, backend/app/Modules/Notes/Application/Commands/RenameNotebookCommand.php, backend/app/Modules/Notes/Application/Commands/DeleteNotebookCommand.php, backend/app/Modules/Notes/Application/UseCases/GetNotebookListQuery.php, backend/app/Modules/Notes/Application/UseCases/CreateNotebookUseCase.php, backend/app/Modules/Notes/Application/UseCases/RenameNotebookUseCase.php, backend/app/Modules/Notes/Application/UseCases/DeleteNotebookUseCase.php, backend/app/Modules/Notes/Domain/Exceptions/IdempotencyKeyReusedException.php, backend/app/Modules/Notes/Domain/Exceptions/StaleDataEpochException.php, backend/app/Modules/Notes/Domain/Exceptions/WriteFenceActiveException.php, backend/app/Modules/Notes/Domain/Exceptions/VersionConflictException.php, backend/app/Modules/Notes/Domain/Exceptions/InvalidNotebookNameException.php, backend/app/Modules/Notes/Domain/Exceptions/NotebookNotDeletableException.php, backend/app/Http/Controllers/NotebookController.php, backend/routes/api.php, contracts/openapi.yaml, backend/tests/Feature/NotebookPersistenceTest.php, backend/tests/Feature/NotebookUseCasesTest.php, backend/tests/Feature/NotebookConcurrencyTest.php, backend/tests/Feature/NotebookApiTest.php, backend/tests/Feature/ProvisionOwnerCommandTest.php, backend/tests/Contract/NotebookContractTest.php, frontend/src/api/schema.generated.ts, frontend/src/api/notebooks.ts, frontend/src/api/__tests__/notebooks.spec.ts]
    verification_obligations:
      - powershell.exe -File scripts/local.ps1 test from the Story worktree - full backend suite passes with no warnings
      - vendor/bin/pint --test and composer analyse inside the worktree backend-test container
      - npm run contract:validate and npm run contract:check in frontend
      - npm run type-check, npm run lint and npm run test:unit -- --run src/api/__tests__/notebooks.spec.ts in frontend
      - NotebookPersistenceTest proves a second default notebook for one owner is rejected by PostgreSQL, a notebook with a note cannot be deleted at the database level, a note cannot reference another owner's notebook, and the migration backfills exactly one default notebook for an existing account
      - ProvisionOwnerCommandTest proves provisioning creates exactly one default notebook named "Ghi chú nhanh" and re-provisioning the same owner does not create a second one
      - NotebookUseCasesTest covers list order (default first, then created_at and id), note_count, trimmed name rules, duplicate names, rename of the default notebook, delete of an empty notebook, notebook_is_default and notebook_not_empty rejections, replay, reused command ID, stale base_version with current snapshot, stale data epoch, closed write fence, one account_revision step per real change and owner isolation
      - NotebookConcurrencyTest proves two concurrent identical create commands leave one notebook and one account_revision step, and two concurrent renames on the same base_version leave one winner and one version conflict
      - NotebookApiTest and NotebookContractTest cover guest 401, another owner's notebook 404, unknown fields 422, name field errors and every problem code against the OpenAPI schemas
  - id: B
    status: pending
    task_refs: [T-4]
    depends_on: [A]
    executor: agy
    risk:
      level: HIGH
      flags: [public_contract]
    scope:
      paths: [frontend/src/views/NotesView.vue, frontend/src/router/index.ts, frontend/src/views/__tests__/notes.spec.ts, frontend/src/router/__tests__/router.spec.ts, tests/e2e/notebooks.spec.ts, tests/e2e/helpers/db-helper.php]
    verification_obligations:
      - npm run type-check in frontend
      - npm run lint in frontend
      - npm run test:unit -- --run src/views/__tests__/notes.spec.ts src/router/__tests__/router.spec.ts in frontend
      - notes.spec.ts proves the default notebook renders first with the "Mặc định" label from is_default, the list has one level, create and rename send one command each and show the new name only after the acknowledgement, a field error keeps the typed name, delete of the default or a non-empty notebook explains the reason without sending a request, a server notebook_is_default or notebook_not_empty rejection is shown at the action, the confirm dialog focuses Hủy, cancel keeps the notebook, a confirmed delete moves selection and focus to the notebook above, and a load error shows retry instead of the empty state
      - db-helper.php reset clears notes and notebooks and seeds exactly one default notebook for the e2e owner
      - powershell.exe -File scripts/local.ps1 e2e from the Story worktree after the slice checkpoint
blockers: []
unresolved_questions: []
next_action:
  kind: implement_slice
  target: A
---

# Story 4.1 execution plan

Slice A (Lead) adds the notebooks table and a minimal notes table with the
PostgreSQL guards for one default notebook per owner, owner-compatible
membership and delete restriction. It creates the default notebook during owner
provisioning and backfills it for existing accounts. It then adds the Notes
module list and create/rename/delete-empty use cases under the AD-6 mutation
protocol, exposes them through /v1/notebooks with the OpenAPI contract,
regenerated types and a typed client, because the client validates exact
response keys. Slice B (AGY) replaces the /notes placeholder with the notebook
column and the e2e path on top of that client. Both slices are HIGH, so each
review stops for the owner.

Every path in each slice scope is anchored by the notebooks-backend,
notebooks-client or notes-view recipe; anchors of files that do not exist yet
use a placeholder blob, so the slice must create every listed path. A path that
turns out to be unnecessary is a Plan maintenance, not an omission.
