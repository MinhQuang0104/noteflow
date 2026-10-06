# Backend CI Formatting Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the failing backend CI job without changing application or test-helper behavior.

**Architecture:** Keep the existing repository-wide Pint gate. Format the PHP E2E helper with the locked Pint version and make the documented local command cover the same files as CI.

**Tech Stack:** PHP 8.4, Laravel Pint, Composer, Larastan, Pest, PostgreSQL 17, GitHub Actions.

**Spec:** User request to diagnose and fix the red backend CI job; `.github/workflows/ci.yml` defines the checks.

## Global Constraints

- Preserve unrelated staged and untracked files in the primary checkout.
- No Story lifecycle, orchestration policy, dependency, schema, or application behavior changes.
- Keep PHP 8.4 and PostgreSQL 17 as the authoritative validation environment.
- Do not narrow or bypass the existing CI formatting gate.
- This is a LOW-risk formatting/documentation repair; existing Pint failure is the regression check.

## Evidence

- Run: https://github.com/MinhQuang0104/noteflow/actions/runs/36519849321
- Commit: `4798493e48c4cb772c8b6c1122243ad684a7bff3`.
- Backend fails at `backend/vendor/bin/pint --test`: 80 files, one failing file, `tests/e2e/helpers/db-helper.php`.
- Composer validation/install succeed; analysis and backend tests are skipped after Pint fails.
- Frontend, browser-smoke, and deployment-config jobs pass.
- The README runs Pint inside `backend/`, excluding the PHP helper outside that directory.
- A clean worktree reproduces the helper's quote, concatenation-space, and negation-space violations. Windows CRLF adds a line-ending report locally.

### Task 1: Repair the formatting and align the local gate

**Files:**
- Modify: `tests/e2e/helpers/db-helper.php`
- Modify: `README.md` (Quality gates)
- Check: `.github/workflows/ci.yml` (unchanged)

**Interfaces:** The helper's CLI actions, SQL statements, output JSON, and environment/database rejection checks remain identical.

- [x] Read the failed CI job and reproduce Pint's failure before editing.
- [ ] Run the locked formatter on exactly the failing helper, from the repository root:

  ```powershell
  php backend/vendor/bin/pint tests/e2e/helpers/db-helper.php
  ```

- [ ] Replace the README's backend-only Pint command with a repository-root command:

  ```powershell
  # From the repository root; include PHP E2E helpers as CI does.
  backend\vendor\bin\pint.bat --test

  Set-Location backend
  composer validate --strict
  composer analyse
  php artisan test
  ```

- [ ] Inspect the helper diff to confirm only formatting changes, including unchanged SQL string contents.

### Task 2: Verify the repaired backend gate

**Files:** No additional tracked implementation files.

- [ ] Run repository-wide Pint from a clean checkout: `php backend/vendor/bin/pint --test`; require success.
- [ ] Run `php -l tests/e2e/helpers/db-helper.php`; require no syntax errors.
- [ ] Run the CI backend commands with PHP 8.4 and PostgreSQL 17:

  ```sh
  composer --working-dir=backend validate --strict
  composer --working-dir=backend install --no-interaction --prefer-dist --no-progress
  backend/vendor/bin/pint --test
  composer --working-dir=backend analyse
  cd backend
  php artisan test
  ```

- [ ] Confirm the helper still rejects a non-testing environment and a non-test database before connecting.
- [ ] Inspect `git diff --check` and the exact patch; record executed checks and any remaining limitation.
- [ ] Deliver the tested patch and plan without including the user's unrelated work.
