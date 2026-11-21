---
story_id: "4.2"
title: Tạo quick note với title tùy chọn
status: done
---

# Story 4.2: Tạo quick note với title tùy chọn

## Story

<!-- v4:story:start -->
As a chủ tài khoản, I want bắt đầu note ngay, So that tôi ghi ý tưởng mà không cần phân loại hoặc đặt title trước.
<!-- v4:story:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY; owner chose two slices on 2026-11-14 (A backend, API, contract and typed client, HIGH, Lead; B Notes and Today UI, MEDIUM, AGY), saving after the user pauses typing with no Save button (create on the first pause with content, update afterwards), and a server-derived label returned by the API.
- dependencies: Story 4.1, recorded done in sprint-status.yaml and implemented on main.
- prerequisites: Story 4.1 notebooks, the default notebook and the minimal notes table; Story 2.1 account revision, data epoch, write state and command ledger; Story 1.4 revision polling and refetch.
- api: GET /v1/notebooks/{id}/notes, POST /v1/notes and PATCH /v1/notes/{id}; mutations carry command_id and data_epoch in the JSON body, and the update also carries base_version.
- scope: FR-027 (create and save note title and body), FR-039 (Today entry to a quick note in the default notebook) and UX-DR4. Story 4.3 owns the 800 ms autosave contract, the non-blocking flush when switching notes, stale-acknowledgement protection and per-note draft state; in this Story, leaving a note with an unsaved change saves it first and waits for the acknowledgement. Moving and deleting notes stay in Story 4.4, search in Story 4.6, keyboard shortcuts (UX-10, DEP-005) stay out of scope.
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: **Given** ở Today hoặc khu vực khác **When** chọn Ghi chú mới **Then** mở editor mới trong vở mặc định và focus body.
- AC-2: **Given** ở một vở Notes **When** tạo note **Then** dùng vở hiện tại.
- AC-3: **Given** editor mới hoàn toàn chưa có text **When** rời đi **Then** không persist note rỗng.
- AC-4: **Given** title trống nhưng body/title có nội dung **When** save **Then** note được lưu; label là title, dòng body không rỗng đầu tiên, hoặc “Không tiêu đề” mà không ghi ngược title.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-3, AC-4]: Add title (NOT NULL, default empty, at most 255 characters), body (NOT NULL text, default empty, at most 100000 characters) and row_version to the notes table, keeping existing rows valid; add a pure NoteLabel rule: the trimmed title when it has a non-whitespace character, else the first body line with a non-whitespace character (trimmed), else "Không tiêu đề", never written back to title.
- [ ] T-2 [AC-2, AC-3, AC-4]: Add the Notes module note list query for one notebook (updated_at descending, then id) and the create and update use cases under the account lock, open write state, data epoch, command ledger and, for update, base_version; create rejects an unknown or foreign notebook as not found and a note whose title and body are both blank as note_empty; update accepts clearing all text, and an update without a real change does not advance account_revision.
- [ ] T-3 [AC-2, AC-3, AC-4]: Expose GET /v1/notebooks/{id}/notes, POST /v1/notes and PATCH /v1/notes/{id} through the versioned OpenAPI contract with a note schema carrying the derived label, and problem details for validation, note_empty, stale version with the current snapshot, stale epoch, write fence and idempotency reuse; regenerate frontend types, add the typed notes client and cover the boundary with API and contract tests.
- [ ] T-4 [AC-1, AC-2, AC-3, AC-4]: Add a "Ghi chú mới" entry in the Today header that opens a new editor in the default notebook, and in the Notes workspace a note list for the selected notebook (label and short excerpt, most recently updated first) with a "+ Ghi chú mới" button that uses the current notebook; the editor has separately labelled title and body fields, focuses the body, creates the note on the first typing pause with content and updates it on later pauses, shows "Đã lưu" only after the acknowledgement of the current content, keeps the text and shows an error on failure, discards a brand-new editor that never had text, and saves a pending change before switching note or leaving; collect UI acceptance evidence.
<!-- v4:tasks:end -->

## Dev Notes / Implementation Notes

<!-- v4:risk:start -->
- classification: HIGH for slice A (migration, owner security, versioned concurrent writes and a public API/OpenAPI contract); MEDIUM for slice B (UI consumer of the slice A client with new view state, no contract change).
- invariant: One create command creates at most one note; an identical retry replays the stored acknowledgement, a reused command ID with another payload is rejected, and two concurrent identical creates leave one note and one account_revision step.
- invariant: Every note mutation keeps the account lock, write-state fence, data epoch and command ledger; a stale base_version returns the current snapshot, and each real change advances account_revision and row_version exactly once.
- invariant: The label is derived on read from title and body and is never stored into title; title and body are stored exactly as sent, including line breaks.
- invariant: The server never creates an empty note; the client never sends a create for an editor that never had text, and clearing an existing note keeps it with the label "Không tiêu đề".
- boundary: All reads and writes are owner-scoped; another owner's note or notebook is not found, and a note can only be created in a notebook of the same owner.
- boundary: The UI never shows "Đã lưu" before the server acknowledges the current content, keeps the typed text on any save error, and shows an empty note list only after a successful load.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-42-tạo-quick-note-với-title-tùy-chọn
- product: docs/product/prd.md#fr-027
- product: docs/product/prd.md#fr-039
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-4--modules-own-data-and-mutations-proposed
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
- architecture: docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
- ux: docs/ux/ux-spec.md#pf-02-tạo-note-nhanh
- ux: docs/ux/ux-spec.md#82-tạo-note-tiêu-đề-và-danh-sách
- ux: docs/ux/ux-spec.md#51-notes-workspace
<!-- v4:references:end -->

## Dev Agent Record

<!-- v4:completion:start -->
### Dev Agent Record

- Finalization receipt: _bmad-output/implementation-artifacts/receipts/story-4-2/finalization.json
- Done Gate disposition: SATISFIED

### AC Evidence / Results

- AC-1: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json (sha256:f7d0c0795e58881e41a2dd2aab180a8eefd1bfb89b16a789cbd7c0edd16ecbbe)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-2: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-4-2/A-verification.json (sha256:aeae51d98d51236ce0f988d8f55e8780932715f6028b9e1958721e2fdb270a0d); _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json (sha256:f7d0c0795e58881e41a2dd2aab180a8eefd1bfb89b16a789cbd7c0edd16ecbbe)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-3: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-4-2/A-verification.json (sha256:aeae51d98d51236ce0f988d8f55e8780932715f6028b9e1958721e2fdb270a0d); _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json (sha256:f7d0c0795e58881e41a2dd2aab180a8eefd1bfb89b16a789cbd7c0edd16ecbbe)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-4: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-4-2/A-verification.json (sha256:aeae51d98d51236ce0f988d8f55e8780932715f6028b9e1958721e2fdb270a0d); _bmad-output/implementation-artifacts/receipts/story-4-2/B-verification-attempt-3.json (sha256:f7d0c0795e58881e41a2dd2aab180a8eefd1bfb89b16a789cbd7c0edd16ecbbe)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required

### Completion Notes

- Evidenced behavior: **Given** ở Today hoặc khu vực khác **When** chọn Ghi chú mới **Then** mở editor mới trong vở mặc định và focus body.
- Evidenced behavior: **Given** ở một vở Notes **When** tạo note **Then** dùng vở hiện tại.
- Evidenced behavior: **Given** editor mới hoàn toàn chưa có text **When** rời đi **Then** không persist note rỗng.
- Evidenced behavior: **Given** title trống nhưng body/title có nội dung **When** save **Then** note được lưu; label là title, dòng body không rỗng đầu tiên, hoặc “Không tiêu đề” mà không ghi ngược title.

### File List

- backend/app/Http/Controllers/NoteController.php
- backend/app/Modules/Notes/Application/Commands/CreateNoteCommand.php
- backend/app/Modules/Notes/Application/Commands/UpdateNoteCommand.php
- backend/app/Modules/Notes/Application/UseCases/CreateNoteUseCase.php
- backend/app/Modules/Notes/Application/UseCases/GetNoteListQuery.php
- backend/app/Modules/Notes/Application/UseCases/UpdateNoteUseCase.php
- backend/app/Modules/Notes/Domain/Exceptions/InvalidNoteContentException.php
- backend/app/Modules/Notes/Domain/NoteLabel.php
- backend/database/migrations/2026_11_14_010000_add_content_to_notes_table.php
- backend/routes/api.php
- backend/tests/Contract/NoteContractTest.php
- backend/tests/Feature/NoteApiTest.php
- backend/tests/Feature/NoteConcurrencyTest.php
- backend/tests/Feature/NotePersistenceTest.php
- backend/tests/Feature/NoteUseCasesTest.php
- backend/tests/Feature/NotebookPersistenceTest.php
- backend/tests/Unit/NoteLabelTest.php
- contracts/openapi.yaml
- frontend/src/api/__tests__/notes.spec.ts
- frontend/src/api/notes.ts
- frontend/src/api/schema.generated.ts
- frontend/src/components/NoteEditor.vue
- frontend/src/views/NotesView.vue
- frontend/src/views/TodayView.vue
- frontend/src/views/__tests__/notes.spec.ts
- frontend/src/views/__tests__/today.spec.ts
- tests/e2e/helpers/db-helper.php
- tests/e2e/notebooks.spec.ts
- tests/e2e/quick-note.spec.ts

### Change Log

- Finalization recorded for Human Gate: in-progress -> review; next action complete_story.
- Human approval recorded for the exact review scope: review -> done; next action terminal.
<!-- v4:completion:end -->
