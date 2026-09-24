---
schema_version: 1
story_id: "2.3"
title: Ghi và sửa journal tùy chọn
source:
  path: docs/product/epics.md
  anchor: "#story-23-ghi-và-sửa-journal-tùy-chọn"
  section_digest: "sha256:9f84d9a7345bcdef32ba331badce7e424564e4094bb34414c3eaa9a28e0d2514"
sprint_key: 2-3-ghi-và-sửa-journal-tùy-chọn
architecture_refs:
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-2--server-authoritative-account-clock-proposed
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-4--modules-own-data-and-mutations-proposed
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-6--versioned-idempotent-mutations-adopted
  - docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md#ad-15--phptypescript-api-contract-ownership-adopted
ux_refs:
  - docs/ux/ux-spec.md#52-challenge-và-hôm-nay
  - docs/ux/ux-spec.md#84-challenge-biểu-mẫu-và-hành-động-có-hậu-quả
execution_status: in-progress
lifecycle_snapshot: in-progress
current_slice: A
risk:
  level: HIGH
  flags: [security, concurrency, public_contract]
  assessed_against: Story 2.3; AD-2, AD-4, AD-6, AD-15; API and journal write boundaries
slices:
  - id: A
    purpose: persistence/application
    status: in-progress
    scope: backend challenge daily-record persistence and SaveJournal application use case
    depends_on: []
    checkpoint_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
    verification:
      evidence_status: complete
      focused_tests: "PASS: 29 tests / 164 assertions"
      php_l: PASS
      pint: PASS
      targeted_phpstan: PASS
      git_diff_check: PASS
      migration_rollback_reapply: PASS
      router_status: NOT_APPLICABLE
      gate_status: INCOMPLETE
    review:
      required: true
      verdict: APPROVE
      findings_total: 0
      findings_blocking: 0
      reviewed_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
  - id: B
    purpose: API/public contract
    status: pending
    scope: backend challenge API boundary and versioned OpenAPI contract
    depends_on: [A]
  - id: C
    purpose: typed frontend client
    status: pending
    scope: frontend generated types and challenge API client
    depends_on: [B]
  - id: D
    purpose: UI/acceptance
    status: pending
    scope: frontend Today and Challenge journal UI with acceptance evidence
    depends_on: [C]
constraints:
  - Journal reads and writes remain owner-scoped.
  - A journal belongs to one challenge and one account-local day.
  - Journal writes do not change completion or progress.
  - Journal and completion have independent logical versions.
  - Stale journal writes conflict without changing saved text.
  - Identical command retries replay the prior outcome without another mutation.
  - Journal writes preserve the account lock, data epoch, and write-state fence.
  - Valid active days use server-derived account-today.
  - Journal content never appears in logs or errors.
resolved_decisions:
  - Reject whitespace-only journal text.
  - Do not invent journal clear or delete behavior.
  - Do not impose an arbitrary journal length limit.
blockers: []
unresolved_questions: []
checkpoints:
  slice_a_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
  integration_commit: null
  completion_commit: null
next_action:
  kind: verify_slice
  target: A
---
