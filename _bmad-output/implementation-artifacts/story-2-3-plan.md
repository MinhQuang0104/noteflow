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
current_slice: B
risk:
  level: HIGH
  flags: [security, concurrency, public_contract]
  assessed_against: Story 2.3; AD-2, AD-4, AD-6, AD-15; API and journal write boundaries
slices:
  - id: A
    purpose: persistence/application
    status: reviewed
    scope: backend challenge daily-record persistence and SaveJournal application use case
    depends_on: []
    checkpoint_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
    status_transition:
      from: in-progress
      to: reviewed
      marker: LEGACY_SLICE_STATUS_MIGRATED_AFTER_VERIFICATION
      reason: Fresh focused verification and a fresh reused HIGH-risk approval satisfy Slice A progression.
    verification:
      evidence_status: fresh
      subject:
        mode: checkpoint
        baseline_commit: 815915710aefcf07bfe89394e9816da591d72248
        checkpoint_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
        verified_from_head: 19c3a84b4cf50af4d567b9d9c8ad9511958633c9
        changed_paths_sha256: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
        checkpoint_freshness: FRESH
        source_freshness: FRESH
        reference_freshness: FILE_LEVEL_FRESH
        post_checkpoint_drift: []
        working_drift: []
      changed_paths_sha256: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
      changed_paths:
        - backend/app/Modules/Challenges/Application/Commands/SaveJournalCommand.php
        - backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php
        - backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalDayException.php
        - backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalTextException.php
        - backend/database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php
        - backend/tests/Feature/ChallengeJournalTest.php
        - backend/tests/Feature/ChallengePersistenceTest.php
      focused_checks:
        - id: focused-behavioral-tests
          kind: behavioral
          command: "php artisan test tests/Feature/ChallengeUseCasesTest.php tests/Feature/ChallengeJournalTest.php tests/Feature/ChallengePersistenceTest.php tests/Feature/ChallengeConcurrencyTest.php"
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          environment: "PHP 8.5.9; Laravel 13.32.0; Pest 5.2.0; PostgreSQL 17.11; noteflow_test@127.0.0.1:5432 as noteflow"
          summary: "29 tests passed; 164 assertions"
        - id: php-syntax
          kind: static-syntax
          command: "php -l on each of the five exact implementation and migration paths listed in files"
          files:
            - backend/app/Modules/Challenges/Application/Commands/SaveJournalCommand.php
            - backend/app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php
            - backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalDayException.php
            - backend/app/Modules/Challenges/Domain/Exceptions/InvalidJournalTextException.php
            - backend/database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          tool: "PHP 8.5.9"
          summary: No syntax errors in all five files.
        - id: pint
          kind: style
          command: "vendor/bin/pint --test <the exact seven changed paths>"
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          tool: "Pint 1.32.1"
          summary: "Structured result: passed; check-only mode; no files formatted"
        - id: targeted-phpstan
          kind: static-analysis
          command: "vendor/bin/phpstan analyse --memory-limit=1G --no-progress app/Modules/Challenges/Application/Commands/SaveJournalCommand.php app/Modules/Challenges/Application/UseCases/SaveJournalUseCase.php app/Modules/Challenges/Domain/Exceptions/InvalidJournalDayException.php app/Modules/Challenges/Domain/Exceptions/InvalidJournalTextException.php database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php"
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          tool: "PHPStan 2.2.14; backend/phpstan.neon; level 6"
          scope_basis: "Repo PHPStan convention manages app/routes; Pest tests are covered by behavioral execution, php -l where applicable, and Pint, not forced through an unconfigured Pest static-analysis extension."
          summary: No errors.
        - id: migration-rollback-reapply
          kind: database-migration
          command: "APP_ENV=testing DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE=noteflow_test DB_USERNAME=noteflow DB_PASSWORD=<redacted> php artisan migrate|migrate:rollback --database=pgsql --path=database/migrations/2026_09_24_010000_create_challenge_daily_records_table.php --force --no-interaction"
          sequence:
            - step: precondition_cleanup_rollback
              result: PASS
              exit_code: 0
            - step: apply
              result: PASS
              exit_code: 0
            - step: rollback
              result: PASS
              exit_code: 0
            - step: reapply
              result: PASS
              exit_code: 0
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          environment: "Disposable/reused noteflow-v4lite-pg17; PostgreSQL 17.11; database noteflow_test"
          summary: Target migration applied, rolled back, and re-applied successfully without production or external data access.
        - id: exact-diff-check
          kind: git-whitespace
          command: "git diff --check 815915710aefcf07bfe89394e9816da591d72248 e67a2f0dc852e9f2a0333644ce3c1b12a8e641db"
          result: PASS
          exit_code: 0
          subject_digest: sha256:db7ce9a9cd6fe329d30e8ba01dd429cb3d374f8435b3d4258619880f9a2cf36c
          tool: Git exact-pair diff check
          summary: No whitespace errors.
      canonical:
        command: "node .agents/scripts/check-verification.mjs check auto with the exact seven changed paths passed individually via --changed"
        input_digest: sha256:c4e3e0bf8ed712c62718540b4acdd522dd83d6ffc2705e9e050029629ec10e62
        process_exit: 2
        featureId: null
        matchedPaths: []
        applicability: NOT_APPLICABLE
        status: INCOMPLETE
        complete: false
        checks: []
        escalationReasons: [NO_APPLICABLE_RECIPE]
      escalation:
        command: ".agents/scripts/check-escalation.mjs with canonical verification forwarded unchanged"
        input_digest: sha256:fb8c009d4c783972b48957bab5530d6e2347e35c3738061545ab6c7dd408ce11
        process_exit: 1
        risk: HIGH
        judgment_flags: [SECURITY_AUTH, CONCURRENCY_STATE, PUBLIC_CONTRACT]
        decision: REVIEW_REQUIRED
        reasons: [HIGH_RISK_REVIEW, JUDGMENT_CONCURRENCY_STATE, JUDGMENT_PUBLIC_CONTRACT, JUDGMENT_SECURITY_AUTH, VERIFICATION_INCOMPLETE, VERIFICATION_NO_APPLICABLE_RECIPE]
      progression_eligible: true
      progression_reasons:
        - Frozen checkpoint, source, references, and exact seven-path scope are fresh with no drift.
        - All focused behavioral, syntax, style, static-analysis, migration, and exact-diff checks passed.
        - Canonical NOT_APPLICABLE/INCOMPLETE disposition is preserved and understood, not reclassified as PASS.
        - HIGH-risk escalation is valid and the prior approval is fresh for this exact checkpoint and evidence.
        - No blocker or unresolved ambiguity exists.
    verification_obligations:
      - canonical_verification_disposition: NOT_APPLICABLE/INCOMPLETE
        done_gate_disclosure_required: true
        coverage_authority: focused_checks
        reason: NO_APPLICABLE_RECIPE
    review:
      required: true
      verdict: APPROVE
      findings_total: 0
      findings_blocking: 0
      reviewed_commit: e67a2f0dc852e9f2a0333644ce3c1b12a8e641db
      freshness:
        status: FRESH_REUSED
        review_rerun: false
        reasons:
          - reviewed_commit equals checkpoint_commit and the checkpoint is an ancestor of verified_from_head.
          - Exact seven implementation paths have no checkpoint-to-HEAD or working-tree drift.
          - Story source and architecture/UX references are fresh.
          - HIGH risk and security, concurrency, and public-contract judgment flags are unchanged.
          - All fresh focused checks passed and canonical disposition remains NOT_APPLICABLE/INCOMPLETE.
          - No new blocker, ambiguity, or blocking finding exists.
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
  kind: implement_slice
  target: B
---
