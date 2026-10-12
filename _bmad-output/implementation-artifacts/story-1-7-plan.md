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
current_slice: A
risk:
  level: MEDIUM
  flags: [shared_boundary]
slices:
  - id: A
    status: pending
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
    status: pending
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
  kind: implement_slice
  target: A
---

# Story 1.7 execution plan

Slice A (Lead) implements the per-worktree test runtime and its decision tests;
it is MEDIUM with the Lead as executor, so its review stops for the owner.
Slice B (AGY) adds guard tests and the linked-worktree guide after A, and gets
an independent Lead review.
