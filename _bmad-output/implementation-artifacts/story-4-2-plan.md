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
lifecycle_snapshot: review
execution_status: complete
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9
  approved_at: 2026-11-14
readiness:
  status: READY
  story_normative_digest: sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9
  dependency_sprint_keys: [4-1-quản-lý-vở-và-vở-mặc-định]
current_slice: B
risk:
  level: HIGH
  flags: [security, concurrency, migration, public_contract]
slices:
  - id: A
    status: reviewed
    baseline_commit: f7dabf89054c74c0703734bf3ccf10fbd063a3a3
    checkpoint_commit: 712f6712e94984775e2a4099b6fa5a538c5917d6
    subject_digest: sha256:d89477291adc9c76d856ce36a8b92633dab44e57eb7259283f9a73f7b45a31db
    changed_paths_sha256: sha256:137b55ddd55a7be1995913741fea40e31dc5184c9d3c072e9a5395d98c982886
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/A-implementation.json
        digest: sha256:be7f1d09d1435e67da0c88527310e39961bcf04d2f4a2af2c70eeb7dc4670075
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/A-verification.json
        digest: sha256:aeae51d98d51236ce0f988d8f55e8780932715f6028b9e1958721e2fdb270a0d
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/A-review.json
        digest: sha256:15bfffbb62eef08551395d67876725ce3f2fe1345f37deea91dd1fac6b83848a
    task_refs: [T-1, T-2, T-3]
    depends_on: []
    executor: lead
    risk:
      level: HIGH
      flags: [security, concurrency, migration, public_contract]
    scope:
      paths: [backend/database/migrations/2026_11_14_010000_add_content_to_notes_table.php, backend/app/Modules/Notes/Domain/NoteLabel.php, backend/app/Modules/Notes/Domain/Exceptions/InvalidNoteContentException.php, backend/app/Modules/Notes/Application/Commands/CreateNoteCommand.php, backend/app/Modules/Notes/Application/Commands/UpdateNoteCommand.php, backend/app/Modules/Notes/Application/UseCases/GetNoteListQuery.php, backend/app/Modules/Notes/Application/UseCases/CreateNoteUseCase.php, backend/app/Modules/Notes/Application/UseCases/UpdateNoteUseCase.php, backend/app/Http/Controllers/NoteController.php, backend/routes/api.php, contracts/openapi.yaml, backend/tests/Unit/NoteLabelTest.php, backend/tests/Feature/NotebookPersistenceTest.php, backend/tests/Feature/NotePersistenceTest.php, backend/tests/Feature/NoteUseCasesTest.php, backend/tests/Feature/NoteConcurrencyTest.php, backend/tests/Feature/NoteApiTest.php, backend/tests/Contract/NoteContractTest.php, frontend/src/api/schema.generated.ts, frontend/src/api/notes.ts, frontend/src/api/__tests__/notes.spec.ts]
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
    verification:
      status: PASS
      canonical:
        status: PASS
      escalation:
        decision: REVIEW_REQUIRED
      progression_eligible: true
      review_disclosure: owner exact-scope review of an overnight-child-authored HIGH slice; canonical notes-backend, notes-client, notebooks-backend, notebooks-client and journal-frontend recipes PASS
    review:
      freshness: FRESH_CANDIDATE
      judgment: APPROVE
      reviewed_commit: 712f6712e94984775e2a4099b6fa5a538c5917d6
      risk_context_digest: sha256:fda9685a606c4170ef0d3aba9a6a4a1627e5cf10d7f64e86413b5bb61e929d4c
      reviewer:
        type: human
        vendor: null
        independent: false
  - id: B
    status: reviewed
    baseline_commit: 52a075de9354e676e8486b244204651e235c9109
    checkpoint_commit: 5cc46f0cae4f3df8bf6ec95e9ad00daf0e984d66
    subject_digest: sha256:d89477291adc9c76d856ce36a8b92633dab44e57eb7259283f9a73f7b45a31db
    changed_paths_sha256: sha256:2af581edb479899eb888ad0bb6bffcc6c8d404d08e200a8a863beec78b0c65b0
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-implementation-attempt-3.json
        digest: sha256:8c586f0f247632e9be61800baef41551a25a2b3e78cf2042bbb1c03ba8a40d98
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json
        digest: sha256:f7d0c0795e58881e41a2dd2aab180a8eefd1bfb89b16a789cbd7c0edd16ecbbe
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-review-attempt-3.json
        digest: sha256:9c5b169f7472021a241091f12cd3cb078353a3fc7071e2a80032d9b74f69dca9
    task_refs: [T-4]
    depends_on: [A]
    executor: agy
    risk:
      level: MEDIUM
      flags: []
    scope:
      paths: [frontend/src/views/NotesView.vue, frontend/src/components/NoteEditor.vue, frontend/src/views/__tests__/notes.spec.ts, frontend/src/views/TodayView.vue, frontend/src/views/__tests__/today.spec.ts, tests/e2e/quick-note.spec.ts, tests/e2e/notebooks.spec.ts, tests/e2e/helpers/db-helper.php]
    verification_obligations:
      - npm run type-check in frontend
      - npm run lint in frontend
      - npm run test:unit -- --run src/views/__tests__/notes.spec.ts src/views/__tests__/today.spec.ts in frontend
      - notes.spec.ts proves "+ Ghi chú mới" opens an empty editor in the selected notebook with focus in the body, the first typing pause with content sends exactly one create and later pauses send updates with the latest base_version, "Đã lưu" appears only after the acknowledgement of the current content, a failed save keeps the text and shows an error, a brand-new editor that never had text sends no request when left, switching note or leaving with a pending change saves it before switching, the note list shows the server label and a short excerpt ordered by most recent update, and a list load error shows retry instead of the empty state
      - today.spec.ts proves the "Ghi chú mới" header entry opens the Notes workspace with a new editor in the default notebook
      - powershell.exe -File scripts/local.ps1 e2e from the Story worktree after the slice checkpoint - full e2e suite passes, including quick-note.spec.ts (Today entry, body-only note labelled by its first body line, title-only note, leaving an untouched editor creates nothing) and the existing notebooks.spec.ts
    verification:
      status: PASS
      canonical:
        status: PASS
      escalation:
        decision: REVIEW_REQUIRED
      progression_eligible: true
      review_disclosure: independent Lead review of AGY attempt 3 (F-42B-3 correction); focused checks and full e2e PASS
    review:
      freshness: FRESH_CANDIDATE
      judgment: APPROVE
      reviewed_commit: 5cc46f0cae4f3df8bf6ec95e9ad00daf0e984d66
      risk_context_digest: sha256:fda9685a606c4170ef0d3aba9a6a4a1627e5cf10d7f64e86413b5bb61e929d4c
      reviewer:
        type: lead
        vendor: claude
        independent: true
    attempt_history:
      - attempt_id: 1
        status: checkpointed
        baseline_commit: 454beca424944568c925e5061e7a45f0e3cc5bd8
        checkpoint_commit: ac87355d078cb1313d1712f9d5148c2fcee7a0e4
        subject_digest: sha256:d89477291adc9c76d856ce36a8b92633dab44e57eb7259283f9a73f7b45a31db
        changed_paths_sha256: sha256:71af5bebde9d7040416bb0eb3c4d924e328d202663507812305f2f9752396565
        receipt_refs:
          implementation:
            path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-implementation.json
            digest: sha256:2e17027b666d3c66a4323b702047f032d9dc77484363f6f39e5608ae6cda6ef7
      - attempt_id: 2
        status: checkpointed
        baseline_commit: 057136f575a17396be811106193f1826c5589975
        checkpoint_commit: 0594acd5a7fa943393eac327aa3177cc4e23a403
        subject_digest: sha256:d89477291adc9c76d856ce36a8b92633dab44e57eb7259283f9a73f7b45a31db
        changed_paths_sha256: sha256:b5fa6151bac02cf465d3d02d62a23197711fdc6db55eba59b0744d1e7a0686a2
        receipt_refs:
          implementation:
            path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-implementation-attempt-2.json
            digest: sha256:efca91c8e9ec7de18562b896b481d2960dc0277cc8ab1441277baa7ff9640502
    current_attempt:
      attempt_id: 3
      receipt_refs:
        implementation:
          path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-implementation-attempt-3.json
        verification:
          path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json
        review:
          path: _bmad-output/implementation-artifacts/receipts/story-4-2/B-review-attempt-3.json
blockers: []
unresolved_questions: []
finalization:
  receipt_ref: _bmad-output/implementation-artifacts/receipts/story-4-2/finalization.json
  receipt_digest: sha256:965e50f40ccd61d3c2047701fae4ac4d43254164c30bba0d1848e6d7c901ae79
  done_gate_disposition: SATISFIED
  scope_paths_digest: sha256:c56498be33a982324e4a32cf0a11f534e683d674b409cdddf6af1d4afc09baee
  implementation_commit_set_digest: sha256:81ff720220381e2d7f2933392ddd33c950eb210c42fad24adb2ddd0e5d62e99b
  final_scoped_tree_digest: sha256:2b6880f39bb8ee83a95203fd27aba16b4cbe6c344de74e96949a8805a6284bd9
  prepared_from_head: c9a147a88d99e1fccbe8bfa613d59ee1a44de363
human_approval:
  schema_version: 1
  story_id: "4.2"
  approver_type: "human"
  decision: "APPROVED"
  approved_at: "2026-11-21T02:21:45.407Z"
  story_normative_digest: "sha256:dbd935cb2f74779047b22664aa2a6c7948790b8bc6b5b5c6082fb03127e86ad9"
  finalization_receipt_digest: "sha256:965e50f40ccd61d3c2047701fae4ac4d43254164c30bba0d1848e6d7c901ae79"
  done_gate_summary_digest: "sha256:3677557d326bfa6da684402357ba4e0edb0a556d1ad57ed24c285d870d15e8ff"
  scope_paths_digest: "sha256:c56498be33a982324e4a32cf0a11f534e683d674b409cdddf6af1d4afc09baee"
  implementation_commit_set_digest: "sha256:81ff720220381e2d7f2933392ddd33c950eb210c42fad24adb2ddd0e5d62e99b"
  final_scope_digest: "sha256:2b6880f39bb8ee83a95203fd27aba16b4cbe6c344de74e96949a8805a6284bd9"
  final_scoped_tree_digest: "sha256:2b6880f39bb8ee83a95203fd27aba16b4cbe6c344de74e96949a8805a6284bd9"
  approved_review_head: "72170a954c6b247c3fecb77f967bf6370491f763"
  approved_commit: "72170a954c6b247c3fecb77f967bf6370491f763"
  approved_action: "complete_story"
  disclosures_acknowledged: true
next_action:
  kind: complete_story
  target: story
autopilot:
  schema_version: 1
  authorized_at: "2026-11-14T08:16:41.932Z"
  authorized_plan_digest: sha256:660a21bfe45c40c2d9abab42f45b3bec716d70e0528d001c28150b4e8ad32e43
  authorized_head: df466230131daaed8766cdeb30d695f3d0dccaf1
  budgets:
    max_slices: 2
    max_rework_per_slice: 2
    max_minutes_per_slice: 90
  lead_vendor: claude
  revoked: true
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
