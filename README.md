# NoteFlow

NoteFlow is a Vue 3 single-page application with a Laravel 13 JSON API. Both
applications ship from one repository and are served behind one HTTPS origin.

## Prerequisites

- Node.js 24 LTS, version 24.12 or newer in the approved release line
- npm 11 or newer
- Docker Desktop with Linux containers and the `desktop-linux` context
- PHP 8.4 with Composer 2 and PostgreSQL 17 for native/CI checks

The repository currently contains no compatibility claim for host Node 22 or
PHP 8.5. CI is the authoritative pinned environment.

## Install from lockfiles

```powershell
Set-Location backend
Copy-Item .env.example .env
composer install --no-interaction --prefer-dist --no-progress
php artisan key:generate
php artisan migrate
php artisan noteflow:provision-owner owner@example.com

Set-Location ..\frontend
npm.cmd ci

Set-Location ..\tests\e2e
npm.cmd ci
npx.cmd playwright install chromium
```

Create the PostgreSQL databases and credentials named in `backend/.env.example`
before running migrations. Tests that access persistence must use PostgreSQL;
SQLite is not accepted as substitute evidence.

The owner provisioning command asks for the password twice using hidden prompts.
Run it directly in a trusted terminal so the password is never placed in shell
history. Production must use HTTPS and set `SESSION_SECURE_COOKIE=true`; public
registration and password-reset routes are intentionally absent.

### Local test login

The local Docker database has one owner account for manual testing:

- Email: `admin@example.com`
- Password: `NF-local-admin-2026!X7q`

This credential is for the local environment only. The application calls this
single admin-capable role `owner` internally.

The frontend keeps `@emnapi/wasi-threads` and `tslib` as explicit dev pins to
work around the npm bundled-dependency lockfile defect tracked in
[`npm/cli#9321`](https://github.com/npm/cli/issues/9321). They make a fresh
`npm ci` reproducible with Tailwind's optional WASM package.

## Run locally

Use the fixed Docker Compose project for the backend. Run these commands from
the canonical checkout; the first command creates `deploy/local/.env` once,
builds the PHP 8.4 image, starts PostgreSQL and Laravel, and runs normal
migrations:

```powershell
.\scripts\local.ps1 init
.\scripts\local.ps1 up
```

Start Vite in a second terminal:

```powershell
Set-Location frontend
npm.cmd run dev
```

Vite proxies `/api`, `/sanctum`, `/login`, `/logout`, and `/up` to the single
backend at `http://127.0.0.1:8000`. Use `scripts/local.ps1 status`, `logs`,
`migrate`, `stop`, or `doctor` for the corresponding runtime operation. The
backend does not run PHP on the Windows host. See the
[local runtime runbook](docs/development/local-runtime.md) for test isolation,
owner provisioning, diagnostics, and data/rollback boundaries.

## Contract workflow

The canonical wire contract is `contracts/openapi.yaml`. Laravel owns runtime
serialization and validation; generated browser types live in
`frontend/src/api/schema.generated.ts`.

```powershell
Set-Location frontend
npm.cmd run contract:validate
npm.cmd run contract:generate
npm.cmd run contract:check
npm.cmd run contract:proof
```

`contract:proof` changes the OpenAPI document temporarily, proves stale types
are rejected, restores the exact contract, and proves the clean check passes.

## Quality gates

```powershell
# From the repository root; include PHP E2E helpers as CI does.
backend\vendor\bin\pint.bat --test

Set-Location backend
composer validate --strict
composer analyse
php artisan test

Set-Location ..\frontend
npm.cmd run contract:validate
npm.cmd run contract:check
npm.cmd run lint
npm.cmd run type-check
npm.cmd run test:unit -- --run
npm.cmd run build-only

Set-Location ..\tests\e2e
npm.cmd test
```

The Playwright suite starts Laravel and Vite preview itself. It covers the Vue
shell, Laravel foundation response, direct SPA deep links, backend-owned paths,
and horizontal overflow at 1440×900 and 390×844.

On Windows only, the E2E package postinstall applies the bounded cleanup
workaround described in
[`microsoft/playwright#42109`](https://github.com/microsoft/playwright/issues/42109).
Linux/CI dependencies are left unchanged.

The GitHub Actions workflow supplies the authoritative Node 24.12, PHP 8.4,
PostgreSQL 17, browser, and Nginx verification environments.

## Current capabilities

- **Challenge:** create and update weekly goals, view the list/detail state, and
  keep the server-owned start date and target days unchanged during metadata edits.
- **Today:** show the owner’s server-authoritative account date and the current
  challenge progress for that day.
- **Journal:** read and save a daily journal without changing completion state,
  with version-aware conflict resolution for concurrent edits.
- **Sync and conflict handling:** reconcile account context, data epoch,
  idempotent writes, write fences, authentication expiry, and journal drafts
  across refreshes and device-like sessions.

The current delivery record is the
[`sprint status`](_bmad-output/implementation-artifacts/sprint-status.yaml),
and the system boundaries are documented in the
[`architecture spine`](docs/architecture/architecture-noteflow-2026-09-12/ARCHITECTURE-SPINE.md).

## Structure and boundaries

```text
frontend/   Vue UI and generated API types
backend/    Laravel JSON API
contracts/  Versioned OpenAPI source
tests/e2e/  Playwright same-origin smoke tests
deploy/     Nginx production routing boundary
```

The dependency direction is `Vue UI → JSON API → Application → Domain`.
Future PHP domain code must remain independent of Laravel, Eloquent, network,
database, and system-clock APIs.

The current MVP scope does not include Notes, Calendar, Search, or Backup
domain behavior. It also introduces no public signup, Redis, queue worker,
WebSocket/Reverb service, SSR, external search service, deployment provider, or
production release action.
