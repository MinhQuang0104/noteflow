---
schema_version: 2
story_id: "4.2"
story:
  path: _bmad-output/implementation-artifacts/4-2-tạo-quick-note-với-title-tùy-chọn.md
  normative_digest: sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9
upstream_epic:
  path: docs/product/epics.md
  section_digest: sha256:4420968e19ff26b85691bb0de577b71f307e9d11f903a408069e9a2180006c76
sprint_key: 4-2-tạo-quick-note-với-title-tùy-chọn
lifecycle_snapshot: ready-for-dev
execution_status: ready-for-dev
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9
  approved_at: 2026-11-14
readiness:
  status: READY
  story_normative_digest: sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9
  dependency_sprint_keys: [4-1-quản-lý-vở-và-vở-mặc-định]
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
      paths: [backend/database/migrations/2026_11_14_010000_add_content_to_notes_table.php, backend/app/Modules/Notes/Domain/NoteLabel.php, backend/app/Modules/Notes/Domain/Exceptions/InvalidNoteContentException.php, backend/app/Modules/Notes/Application/Commands/CreateNoteCommand.php, backend/app/Modules/Notes/Application/Commands/UpdateNoteCommand.php, backend/app/Modules/Notes/Application/UseCases/GetNoteListQuery.php, backend/app/Modules/Notes/Application/UseCases/CreateNoteUseCase.php, backend/app/Modules/Notes/Application/UseCases/UpdateNoteUseCase.php, backend/app/Http/Controllers/NoteController.php, backend/routes/api.php, contracts/openapi.yaml, backend/tests/Unit/NoteLabelTest.php, backend/tests/Feature/NotePersistenceTest.php, backend/tests/Feature/NoteUseCasesTest.php, backend/tests/Feature/NoteConcurrencyTest.php, backend/tests/Feature/NoteApiTest.php, backend/tests/Contract/NoteContractTest.php, frontend/src/api/schema.generated.ts, frontend/src/api/notes.ts, frontend/src/api/__tests__/notes.spec.ts]
    verification_obligations:
      - powershell.exe -File scripts/local.ps1 test from the Story worktree - full backend suite passes with no warnings
      - vendor/bin/pint --test and composer analyse inside the worktree backend-test container
      - npm run contract:validate and npm run contract:check in frontend
      - npm run type-check, npm run lint and npm run test:unit -- --run src/api/__tests__/notes.spec.ts in frontend
      - NoteLabelTest proves the label is the trimmed title when it has a non-whitespace character, otherwise the first body line with a non-whitespace character trimmed, otherwise "Không tiêu đề", including whitespace-only titles, leading blank body lines and CRLF line breaks
      - NotePersistenceTest proves the migration keeps existing notes with an empty title and body and row_version 1, and PostgreSQL still rejects a note in another owner's notebook
      - NoteUseCasesTest covers create in the default and in another notebook, an unknown or foreign notebook as not found, note_empty for a blank title and body, title and body length limits, title and body stored exactly as sent with line breaks, the label never written to title, list order (updated_at descending, then id) and owner scope, update with a real change, update clearing all text keeping the note, an update without a real change keeping account_revision and row_version, replay, reused command ID, stale base_version with the current snapshot, stale data epoch, closed write fence, one account_revision step per real change and note_count of the notebook list
      - NoteConcurrencyTest proves two concurrent identical create commands leave one note and one account_revision step, and two concurrent updates on the same base_version leave one winner and one version conflict
      - NoteApiTest and NoteContractTest cover guest 401, another owner's note or notebook 404, unknown fields 422, title and body field errors, note_empty and every problem code against the OpenAPI schemas, and the label field in every note response
  - id: B
    status: pending
    task_refs: [T-4]
    depends_on: [A]
    executor: agy
    risk:
      level: MEDIUM
      flags: []
    scope:
      paths: [frontend/src/views/NotesView.vue, frontend/src/components/NoteEditor.vue, frontend/src/views/__tests__/notes.spec.ts, frontend/src/views/TodayView.vue, frontend/src/views/__tests__/today.spec.ts, tests/e2e/quick-note.spec.ts]
    verification_obligations:
      - npm run type-check in frontend
      - npm run lint in frontend
      - npm run test:unit -- --run src/views/__tests__/notes.spec.ts src/views/__tests__/today.spec.ts in frontend
      - notes.spec.ts proves "+ Ghi chú mới" opens an empty editor in the selected notebook with focus in the body, the first typing pause with content sends exactly one create and later pauses send updates with the latest base_version, "Đã lưu" appears only after the acknowledgement of the current content, a failed save keeps the text and shows an error, a brand-new editor that never had text sends no request when left, switching note or leaving with a pending change saves it before switching, the note list shows the server label and a short excerpt ordered by most recent update, and a list load error shows retry instead of the empty state
      - today.spec.ts proves the "Ghi chú mới" header entry opens the Notes workspace with a new editor in the default notebook
      - powershell.exe -File scripts/local.ps1 e2e from the Story worktree after the slice checkpoint - full e2e suite passes, including quick-note.spec.ts (Today entry, body-only note labelled by its first body line, title-only note, leaving an untouched editor creates nothing) and the existing notebooks.spec.ts
blockers: []
unresolved_questions: []
next_action:
  kind: start_story
  target: story
---

# Story 4.2 execution plan

Slice A (Lead) adds title, body and row_version to the notes table, a pure
NoteLabel rule, and the Notes module note list, create and update use cases
under the AD-6 mutation protocol. It exposes them through
GET /v1/notebooks/{id}/notes, POST /v1/notes and PATCH /v1/notes/{id} with the
OpenAPI contract, regenerated types and a typed notes client. The API returns
the derived label so every client uses one rule. Slice A is HIGH, so its review
stops for the owner.

Slice B (AGY) adds the Today "Ghi chú mới" entry, the note list of the selected
notebook and the note editor on top of that client. The editor creates the note
on the first typing pause with content and updates it on later pauses; there is
no Save button. Story 4.3 replaces this simple save with the 800 ms autosave
contract, the non-blocking flush when switching notes and stale-acknowledgement
protection. Slice B is MEDIUM with an AGY executor, so it takes the independent
Lead review path and does not stop for owner review.

Every path in each slice scope is anchored by the notes-backend, notes-client,
notes-view or today-view recipe; anchors of files that do not exist yet use a
placeholder blob, so the slice must create every listed path. A path that turns
out to be unnecessary is a Plan maintenance, not an omission. Slice A paths are
never anchored in a slice B map.
