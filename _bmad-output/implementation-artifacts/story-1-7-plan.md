---
schema_version: 2
story_id: "1.7"
story:
  path: _bmad-output/implementation-artifacts/1-7-chay-test-co-lap-cho-tung-worktree.md
  normative_digest: sha256:dd431e6bd23a157b38a4c1fc80fce2d84a9df56fc20a546bdd30a639d5e6d62d
upstream_epic:
  path: docs/product/epics.md
  section_digest: sha256:56a6a93be6a9310dab4cdaf453ef9e1891a3ffb6404c41ed24d17714ea2a4b3c
sprint_key: 1-7-chạy-test-cô-lập-cho-từng-worktree
lifecycle_snapshot: in-progress
execution_status: in-progress
planning_approval:
  decision: APPROVED
  scope: planning
  story_normative_digest: sha256:dd431e6bd23a157b38a4c1fc80fce2d84a9df56fc20a546bdd30a639d5e6d62d
  approved_at: 2026-10-11
readiness:
  status: READY
  story_normative_digest: sha256:dd431e6bd23a157b38a4c1fc80fce2d84a9df56fc20a546bdd30a639d5e6d62d
  dependency_sprint_keys: []
current_slice: B
risk:
  level: MEDIUM
  flags: [shared_boundary]
slices:
  - id: A
    status: reviewed
    baseline_commit: e4cf85d83e898246051096cd71129efc271a3b74
    checkpoint_commit: 9d8fe07fd4ed9c4b54f86256e302fa6cc0cede97
    subject_digest: sha256:a815ea948611c7725d7e4b6e666cbef86f7392840c7fe6eddfc953fd11dea4fa
    changed_paths_sha256: sha256:3d9de3b0db6cb649390c64a28637b6506b7fe1513ed0f98257df4342a98f7eaa
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/A-implementation.json
        digest: sha256:ba8d4c427892eb2424ed3a139dea9a646b7da87e28d9fb25e909a3cd430564b5
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json
        digest: sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/A-review.json
        digest: sha256:675b14a9e95b493f6d1e930a9823fa71a6cde09baa4f653bde22054666de5ea8
    verification:
      status: PASS
      canonical_status: PASS
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: 9d8fe07fd4ed9c4b54f86256e302fa6cc0cede97
      risk_context_digest: sha256:4585339b0cdad1473d7966b081ecaab205b19c1b811e2626248f8fd37bb2761f
      freshness: FRESH_CANDIDATE
      reviewer:
        type: human
        vendor: null
        independent: false
    task_refs: [T-1]
    depends_on: []
    executor: lead
    risk:
      level: MEDIUM
      flags: [shared_boundary]
    scope:
      paths: [compose.local.yaml, scripts/local-runtime.psm1, scripts/local.ps1, scripts/tests/local-runtime.Tests.ps1, tests/e2e/helpers/php-runtime.ts, tests/e2e/helpers/php-runtime.test.ts, tests/e2e/playwright.config.ts]
    verification_obligations:
      - Invoke-Pester -Script scripts/tests/local-runtime.Tests.ps1 -EnableExit
      - node --experimental-strip-types --test tests/e2e/helpers/php-runtime.test.ts
      - powershell.exe -File scripts/local.ps1 test from the Story worktree (per-worktree project, unchanged identity)
      - canonical checkout unchanged - local.ps1 status and the test project name from D:/Workspace/Tu_Hoc/New_Project_My_Note stay noteflow-local
      - AC-6 - run local.ps1 test concurrently from the Story worktree and one disposable detached worktree of the slice checkpoint under D:/Workspace/Tu_Hoc, then test-down and remove it
      - AC-4 - local.ps1 e2e from the Story worktree resets and seeds only its own test project (php-runtime project name), login works on its frontend port
      - AC-7 - test-down from the Story worktree removes only its own project; test-down from the canonical checkout is refused
      - git diff --exit-code main -- .github/workflows/ci.yml backend/phpunit.xml backend/tests/TestCase.php tests/e2e/helpers/db-helper.php
  - id: B
    status: reviewed
    baseline_commit: 74ab16004fdd4b9518213353a81c8cdaefb249ee
    checkpoint_commit: e5d20830fc97c0acece66fe966a2bf1a2e4d891b
    subject_digest: sha256:1b582a780b556390031bcf11c1bd324c26a106c063d5112c82ed120f1c34a690
    changed_paths_sha256: sha256:a199fc9afb4471a0b15c58d1d1481afeda869559527d4a76f574ca1954dc4333
    receipt_refs:
      implementation:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/B-implementation.json
        digest: sha256:9c7d860ee91e328c8d50d3356f3bccf2cc29703f33df889314442de97f0584e5
      verification:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/B-verification.json
        digest: sha256:e67b69e534cd95b8947515053f036ed9e08ccf225d847b9413ba757b1904e389
      review:
        path: _bmad-output/implementation-artifacts/receipts/story-1-7/B-review.json
        digest: sha256:bd0fe4fe0dac012c12bc5b22bdd0f091f669b3e9b5fea94ec61cb57c788da312
    verification:
      status: PASS
      canonical_status: PASS
      escalation_decision: REVIEW_REQUIRED
      progression_eligible: true
    review:
      required: true
      verdict: APPROVE
      reviewed_commit: e5d20830fc97c0acece66fe966a2bf1a2e4d891b
      risk_context_digest: sha256:4585339b0cdad1473d7966b081ecaab205b19c1b811e2626248f8fd37bb2761f
      freshness: FRESH_CANDIDATE
      reviewer:
        type: lead
        vendor: claude
        independent: true
    task_refs: [T-2]
    depends_on: [A]
    executor: agy
    risk:
      level: MEDIUM
      flags: [shared_boundary]
    scope:
      paths: [docs/development/local-runtime.md, scripts/tests/local-runtime-guards.Tests.ps1]
    verification_obligations:
      - Invoke-Pester -Script scripts/tests/local-runtime-guards.Tests.ps1 -EnableExit
blockers: []
unresolved_questions: []
next_action:
  kind: finalize_story
  target: story
autopilot:
  schema_version: 1
  authorized_at: "2026-10-12T06:10:34.145Z"
  authorized_plan_digest: sha256:eb21d13765756ec1eb7daa3d27047fe703f33115f1205257aa1c928dfbbfef26
  authorized_head: 066f76f02a59c88d65808f6b333a413ce97d1ce2
  budgets:
    max_slices: 2
    max_rework_per_slice: 2
    max_minutes_per_slice: 90
  lead_vendor: codex
  revoked: false
---

# Story 1.7 execution plan

Slice A (Lead) implements the per-worktree test runtime and its decision tests;
it is MEDIUM with the Lead as executor, so its review stops for the owner.
Slice B (AGY) adds guard tests and the linked-worktree guide after A, and gets
an independent Lead review.
