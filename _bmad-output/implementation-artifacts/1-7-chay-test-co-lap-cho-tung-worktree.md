---
story_id: "1.7"
title: Chạy test cô lập cho từng worktree
status: done
---

# Story 1.7: Chạy test cô lập cho từng worktree

## Story

<!-- v4:story:start -->
As a developer chạy nhiều Story song song trong các linked worktree, I want chạy test backend và E2E từ mỗi worktree trên database test riêng, So that các Story song song không dùng chung hay ghi đè dữ liệu test và các guard an toàn của database test giữ nguyên.
<!-- v4:story:end -->

## Dependencies and Readiness

<!-- v4:readiness:start -->
- result: READY; owner chose the mechanism (per-worktree Compose test project, database name `noteflow_test` unchanged), placement as Story 1.7 in epic 1, no code-enforced concurrency cap (2026-10-10), and Story risk MEDIUM (2026-10-11).
- dependencies: none.
- scope: local runtime wrapper, local Compose file, Playwright port configuration, wrapper tests and the local runtime guide; no product behavior, API, migration or CI change.
<!-- v4:readiness:end -->

## Acceptance Criteria

<!-- v4:ac:start -->
- AC-1: `scripts/local.ps1` actions `test`, `e2e`, `test-stop` and the new `test-down` run from a linked worktree of this repository; every other action (`init`, `up`, `stop`, `status`, `logs`, `doctor`, `migrate`, `owner`, `rebuild`) still refuses a linked worktree with the existing message.
- AC-2: The canonical checkout keeps Compose project `noteflow-local` and its containers, networks, volumes and host ports exactly as before. A linked worktree uses its own test Compose project `noteflow-test-<id>`, where `<id>` is a stable short hash of the worktree's absolute path, with its own test network and test volumes.
- AC-3: Test identity is unchanged in every checkout: `APP_ENV=testing`, `DB_HOST=postgres-test`, `DB_PORT=5432`, `DB_DATABASE=noteflow_test`, empty `DB_URL`. `backend/phpunit.xml`, `backend/tests/TestCase.php` and `tests/e2e/helpers/db-helper.php` are not modified, and `Assert-TestIdentity` still fails closed on any other identity.
- AC-4: A linked worktree's test services publish no fixed host port that can collide with another checkout: each host port is either absent or deterministic per worktree and checked as free before start, with a clear failure when taken. E2E backend and frontend origins in a linked worktree are per-worktree and reach Playwright through environment variables; the canonical checkout keeps 8001, 8000 and 4173.
- AC-5: Test secrets for a linked worktree are generated on first use into that worktree's git-ignored `deploy/local/.env`; the dev database, dev secrets and the canonical checkout's env file are never written.
- AC-6: Two linked worktrees running `local.ps1 test` at the same time both finish with their own results, and data written by one is not visible to the other.
- AC-7: `test-down` removes only the calling linked worktree's test project containers, network and volumes; from the canonical checkout it is refused and the canonical test data is kept, as `test-stop` does today.
- AC-8: `.github/workflows/ci.yml` is unchanged.
<!-- v4:ac:end -->

## Tasks / Subtasks

<!-- v4:tasks:start -->
- [ ] T-1 [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8]: Move checkout classification, test project naming and port derivation into pure functions in `scripts/local-runtime.psm1`; let `scripts/local.ps1` allow only the test actions in a linked worktree with a per-worktree test project, test secrets and ports; add `test-down`; parameterize `compose.local.yaml` test names and ports with the canonical values as defaults; read E2E origins from environment variables in `tests/e2e/playwright.config.ts`; let the E2E PHP adapter `tests/e2e/helpers/php-runtime.ts` target the calling checkout's test project instead of the fixed `noteflow-local`, covered in `tests/e2e/helpers/php-runtime.test.ts`; cover the decision functions in `scripts/tests/local-runtime.Tests.ps1`.
- [ ] T-2 [AC-1, AC-3, AC-6, AC-7]: Add `scripts/tests/local-runtime-guards.Tests.ps1` asserting the unchanged `noteflow_test` guards and the canonical-only dev actions, and document linked-worktree testing in `docs/development/local-runtime.md` (test actions, `test-down`, at most three worktrees running tests at once is recommended but not enforced, run `test-down` after a Story is integrated).
<!-- v4:tasks:end -->

## Dev Notes / Implementation Notes

<!-- v4:risk:start -->
- classification: MEDIUM — local test infrastructure shared by every Story; owner accepted MEDIUM (2026-10-11).
- invariant: No action from any checkout writes the dev database, dev volumes or dev secrets.
- invariant: The `noteflow_test` identity guards in `backend/phpunit.xml`, `backend/tests/TestCase.php`, `tests/e2e/helpers/db-helper.php` and `Assert-TestIdentity` are not weakened.
- invariant: The canonical checkout's Compose project, names, volumes and ports behave exactly as before.
- invariant: Destructive cleanup (`test-down`) only ever targets the calling linked worktree's own test project.
- boundary: The Compose file pins `name:` values for test networks and volumes (`noteflow-local-test`, `noteflow-local-postgres-test-data`, `noteflow-local-backend-test-*`); a linked worktree must not reuse them.
- boundary: `backend-test` bind-mounts `./backend` read-only and mounts named volumes over `backend/vendor`, `backend/storage` and `backend/bootstrap/cache`; Docker cannot create a missing mount point inside a read-only bind, and a fresh linked worktree has no git-ignored `backend/vendor`. Before starting the test project, the wrapper creates any missing mount-point directory in the calling linked worktree only (attempt 1 failed here, tag `evidence/story-1-7-attempt-1`).
- boundary: `tests/e2e/helpers/php-runtime.ts` runs E2E database commands through `docker compose --project-name noteflow-local exec backend-test`; from a linked worktree it must use that worktree's test project name, passed by the wrapper, or E2E would reset the canonical test database (attempt 2 stopped here, tag `evidence/story-1-7-attempt-2`). The canonical default stays `noteflow-local`.
- boundary: Sanctum reads `SANCTUM_STATEFUL_DOMAINS` (default includes only `127.0.0.1:4173`); a linked worktree's E2E frontend port must be added to it for the backend serving E2E, or session login fails there. Configure it through `compose.local.yaml`, do not edit `backend/config/sanctum.php`.
- boundary: `e2e` runs Playwright on the host, so a linked worktree needs its own `frontend` and `tests/e2e` dependencies installed before `e2e`; document it, do not install automatically.
<!-- v4:risk:end -->

## References

<!-- v4:references:start -->
- product: docs/product/epics.md#story-17-chạy-test-cô-lập-cho-từng-worktree
- architecture: docs/development/local-runtime.md
<!-- v4:references:end -->

## Dev Agent Record

<!-- v4:completion:start -->
### Dev Agent Record

- Finalization receipt: _bmad-output/implementation-artifacts/receipts/story-1-7/finalization.json
- Done Gate disposition: SATISFIED

### AC Evidence / Results

- AC-1: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018); _bmad-output/implementation-artifacts/receipts/story-1-7/B-verification.json (sha256:e67b69e534cd95b8947515053f036ed9e08ccf225d847b9413ba757b1904e389)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-2: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-3: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018); _bmad-output/implementation-artifacts/receipts/story-1-7/B-verification.json (sha256:e67b69e534cd95b8947515053f036ed9e08ccf225d847b9413ba757b1904e389)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-4: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-5: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-6: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018); _bmad-output/implementation-artifacts/receipts/story-1-7/B-verification.json (sha256:e67b69e534cd95b8947515053f036ed9e08ccf225d847b9413ba757b1904e389)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-7: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018); _bmad-output/implementation-artifacts/receipts/story-1-7/B-verification.json (sha256:e67b69e534cd95b8947515053f036ed9e08ccf225d847b9413ba757b1904e389)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required; APPLICABLE/PASS; complete=true; disclosure=not-required
- AC-8: evidence=COVERED; mode=fallback; fallback: receipt-level PASS evidence
  Receipts: _bmad-output/implementation-artifacts/receipts/story-1-7/A-verification.json (sha256:d946ffc7bf55a736df3e39a1cd7331717d6b24bdd054aa349a39c2326a32d018)
  Canonical disposition: APPLICABLE/PASS; complete=true; disclosure=not-required

### Completion Notes

- Evidenced behavior: `scripts/local.ps1` actions `test`, `e2e`, `test-stop` and the new `test-down` run from a linked worktree of this repository; every other action (`init`, `up`, `stop`, `status`, `logs`, `doctor`, `migrate`, `owner`, `rebuild`) still refuses
- Evidenced behavior: The canonical checkout keeps Compose project `noteflow-local` and its containers, networks, volumes and host ports exactly as before. A linked worktree uses its own test Compose project `noteflow-test-<id>`, where `<id>` is a stable short h
- Evidenced behavior: Test identity is unchanged in every checkout: `APP_ENV=testing`, `DB_HOST=postgres-test`, `DB_PORT=5432`, `DB_DATABASE=noteflow_test`, empty `DB_URL`. `backend/phpunit.xml`, `backend/tests/TestCase.php` and `tests/e2e/helpers/db-helper.php`
- Evidenced behavior: A linked worktree's test services publish no fixed host port that can collide with another checkout: each host port is either absent or deterministic per worktree and checked as free before start, with a clear failure when taken. E2E backen
- Evidenced behavior: Test secrets for a linked worktree are generated on first use into that worktree's git-ignored `deploy/local/.env`; the dev database, dev secrets and the canonical checkout's env file are never written.
- Evidenced behavior: Two linked worktrees running `local.ps1 test` at the same time both finish with their own results, and data written by one is not visible to the other.
- Evidenced behavior: `test-down` removes only the calling linked worktree's test project containers, network and volumes; from the canonical checkout it is refused and the canonical test data is kept, as `test-stop` does today.
- Evidenced behavior: `.github/workflows/ci.yml` is unchanged.

### File List

- compose.local.yaml
- docs/development/local-runtime.md
- scripts/local-runtime.psm1
- scripts/local.ps1
- scripts/tests/local-runtime-guards.Tests.ps1
- scripts/tests/local-runtime.Tests.ps1
- tests/e2e/helpers/php-runtime.test.ts
- tests/e2e/helpers/php-runtime.ts
- tests/e2e/playwright.config.ts

### Change Log

- Finalization recorded for Human Gate: in-progress -> review; next action complete_story.
- Human approval recorded for the exact review scope: review -> done; next action terminal.
<!-- v4:completion:end -->
