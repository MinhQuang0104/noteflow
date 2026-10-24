# Local runtime

The canonical local backend is the fixed Docker Compose project
`noteflow-local`. The source checkout is mounted read-only into the PHP
container, while Composer dependencies, Laravel runtime files, and PostgreSQL
data live in named volumes. The Windows host only runs Vite and the Node-based
test tools.

## Prerequisites

- Docker Desktop is running Linux containers and exposes the `desktop-linux`
  context.
- Node.js 24.12 or newer in the approved Node 24 release line and npm 11 are
  installed for Vite.
- Run shared dev runtime commands from the canonical checkout at
  `D:\Workspace\Tu_Hoc\New_Project_My_Note`. The wrapper rejects linked
  worktrees for dev actions so a worker checkout cannot silently change the shared backend.
  Test actions can run safely from linked worktrees (see [Linked-worktree testing](#linked-worktree-testing)).

## First setup and daily lifecycle

From the repository root, initialize the runtime once:

```powershell
.\scripts\local.ps1 init
```

`init` creates `deploy/local/.env` only when it is absent, generates its keys
and passwords with a cryptographic random source, builds `noteflow-local/backend:dev`,
starts `backend` and `postgres`, waits for both health checks, runs normal
Laravel migrations, and checks Composer platform requirements. It never runs a
reset migration and never provisions an owner automatically.

Start or reuse the services later with:

```powershell
.\scripts\local.ps1 up
.\scripts\local.ps1 status
.\scripts\local.ps1 logs
```

Run Vite separately:

```powershell
Set-Location frontend
npm.cmd run dev
```

The browser entry point is `http://127.0.0.1:5173`; Vite proxies to the one
backend at `http://127.0.0.1:8000`. PostgreSQL is reachable only inside the
Compose network and is not published on a host port.

Stop without deleting anything:

```powershell
.\scripts\local.ps1 stop
```

The next `up` reuses the same service containers when image and configuration
are unchanged. `rebuild` intentionally applies a new image and may replace a
service container, but it keeps the generated env file and all named volumes:

```powershell
.\scripts\local.ps1 rebuild
```

## Database and owner operations

Run normal migrations only after the wrapper has verified the dev identity
(`APP_ENV=local`, `DB_HOST=postgres`, `DB_DATABASE=noteflow`, and an empty
`DB_URL`):

```powershell
.\scripts\local.ps1 migrate
```

Provision an owner interactively. The command asks for the password through a
hidden prompt; do not put it in shell history or documentation:

```powershell
.\scripts\local.ps1 owner -OwnerEmail owner@example.com
```

If `deploy/local/.env` is missing while the named database already exists,
`init` stops instead of generating a new password. Restore the original file
from the local secret store, then retry. Never use `down -v`, `prune`, or
`migrate:fresh` for this dev database.

## Test isolation

The `test` Compose profile has its own `backend-test` and `postgres-test`
services, network, and named volumes. It uses host port `127.0.0.1:8001` and
database `noteflow_test`; it cannot reach the dev network. Use the wrapper
actions once the test lane is needed:

```powershell
.\scripts\local.ps1 test
.\scripts\local.ps1 e2e
.\scripts\local.ps1 test-stop
```

Compose E2E mode is selected with `NOTEFLOW_E2E_MODE=compose` by the wrapper.
It runs PHP inside `backend-test`, points the Vite preview at port `8001`, and
does not reuse an unrelated preview or API listener. Native/CI mode remains
available for runners that prepare PHP and PostgreSQL themselves.

Backend tests load the committed, value-free `backend/.env.testing` instead of
the git-ignored `backend/.env`, so a fresh checkout or linked worktree runs the
suite without phpdotenv read warnings. Test values come from `phpunit.xml`,
`compose.local.yaml`, or CI; keep secrets out of that file.

## Linked-worktree testing

When developing stories across multiple git worktrees, test actions can be executed directly from a linked worktree without interfering with the canonical checkout or other worktrees.

### Permitted actions

Only test actions are permitted in a linked worktree:

```powershell
.\scripts\local.ps1 test
.\scripts\local.ps1 e2e
.\scripts\local.ps1 test-stop
.\scripts\local.ps1 test-down
```

All dev actions (`init`, `up`, `stop`, `status`, `logs`, `doctor`, `migrate`, `owner`, `rebuild`) are rejected with an explicit refusal message when called from a linked worktree, preventing any accidental mutation of the shared development backend or database.

### Isolation and naming

Each linked worktree automatically uses its own dedicated Docker Compose test project named `noteflow-test-<id>`, where `<id>` is a deterministic 12-character SHA-256 hash of the worktree's normalized absolute path:
- **Dedicated resources**: Each worktree gets its own isolated network (`noteflow-test-<id>-test`) and named volumes (`noteflow-test-<id>-postgres-test-data`, `noteflow-test-<id>-backend-test-*`).
- **Deterministic ports**: Test backend and E2E frontend ports are deterministically mapped in the 20000–39999 range per worktree and verified to be free before starting.
- **Unchanged test identity**: The test environment preserves the exact same database identity across every checkout (`APP_ENV=testing`, `DB_HOST=postgres-test`, `DB_PORT=5432`, `DB_DATABASE=noteflow_test`, empty `DB_URL`). Dev database, dev volumes, and dev secrets are never touched.
- **Independent data**: Two linked worktrees running `.\scripts\local.ps1 test` concurrently run completely isolated; data written in one test database is never visible to another.

### Host dependencies for E2E testing

The `e2e` action runs Playwright directly on the Windows host. Therefore, a linked worktree requires its own Node dependencies installed in both `frontend` and `tests/e2e` prior to running `.\scripts\local.ps1 e2e`:

```powershell
Push-Location frontend; npm ci; Pop-Location
Push-Location tests/e2e; npm ci; Pop-Location
```

The wrapper does not install these automatically.

### Concurrency recommendation

Running at most three worktrees executing tests at the same time is recommended as a resource guideline for host memory and CPU utilization, though this is not strictly code-enforced.

### Cleanup with `test-down`

After a Story is finished and integrated, remove the linked worktree's test containers, network, and volumes using `test-down`:

```powershell
.\scripts\local.ps1 test-down
```

`test-down` targets only the calling linked worktree's own test project and associated volumes. When executed from the canonical checkout, `test-down` is refused to ensure canonical test data is retained (matching `test-stop` behavior).

## Diagnostics and boundaries

Use `doctor` when startup fails or the browser reaches the wrong backend:

```powershell
.\scripts\local.ps1 doctor
```

The output identifies the canonical checkout, HEAD, project, service state,
health, ports, mounts, and non-secret database identity. It does not print
environment secrets.

The legacy `noteflow-backend-ci-postgres` container and its anonymous volume
were removed by a Docker Desktop factory reset on 2026-10-07, so verification
no longer checks for them. The old SQLite file and
`backend/.env` are also preserved; the Docker runtime uses independent
PostgreSQL data. Importing old SQLite data is a separate migration task.

When Docker is unavailable, a port is occupied, the env is incomplete, or a
database health/identity check fails, the wrapper exits with an error and does
not select another port, kill the process holding it, or create a second
project. Concurrent mutating actions are serialized by a lock derived from the
canonical checkout path.
