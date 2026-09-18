# NoteFlow

NoteFlow is a Vue 3 single-page application with a Laravel 13 JSON API. Both
applications ship from one repository and are served behind one HTTPS origin.

## Prerequisites

- Node.js 24 LTS, version 24.12 or newer in the approved release line
- npm 11 or newer
- PHP 8.4 with Composer 2
- PostgreSQL 17
- Docker for the Nginx configuration check

The repository currently contains no compatibility claim for host Node 22 or
PHP 8.5. CI is the authoritative pinned environment.

## Install from lockfiles

```powershell
Set-Location backend
Copy-Item .env.example .env
composer install --no-interaction --prefer-dist --no-progress
php artisan key:generate
php artisan migrate

Set-Location ..\frontend
npm.cmd ci

Set-Location ..\tests\e2e
npm.cmd ci
npx.cmd playwright install chromium
```

Create the PostgreSQL databases and credentials named in `backend/.env.example`
before running migrations. Tests that access persistence must use PostgreSQL;
SQLite is not accepted as substitute evidence.

The frontend keeps `@emnapi/wasi-threads` and `tslib` as explicit dev pins to
work around the npm bundled-dependency lockfile defect tracked in
[`npm/cli#9321`](https://github.com/npm/cli/issues/9321). They make a fresh
`npm ci` reproducible with Tailwind's optional WASM package.

## Run locally

Start Laravel and Vite in separate terminals:

```powershell
Set-Location backend
composer dev
```

```powershell
Set-Location frontend
npm.cmd run dev
```

Vite proxies `/api`, `/sanctum`, `/login`, `/logout`, and `/up` to
`http://127.0.0.1:8000`. Override the target with `VITE_BACKEND_ORIGIN` when
needed. Browser code always uses relative URLs and same-origin credentials.

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
Set-Location backend
composer validate --strict
vendor\bin\pint.bat --test
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

This foundation contains no Challenge, Notes, Today, Calendar, Search, or Backup
domain behavior. It also introduces no public signup, Redis, queue worker,
WebSocket/Reverb service, SSR, external search service, deployment provider, or
production release action.
