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
- Run the commands from the canonical checkout at
  `D:\Workspace\Tu_Hoc\New_Project_My_Note`. The wrapper rejects linked
  worktrees so a worker checkout cannot silently change the shared backend.

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

## Diagnostics and boundaries

Use `doctor` when startup fails or the browser reaches the wrong backend:

```powershell
.\scripts\local.ps1 doctor
```

The output identifies the canonical checkout, HEAD, project, service state,
health, ports, mounts, and non-secret database identity. It does not print
environment secrets.

The existing `noteflow-backend-ci-postgres` container and its anonymous volume
are outside this project and are preserved. The old SQLite file and
`backend/.env` are also preserved; the Docker runtime uses independent
PostgreSQL data. Importing old SQLite data is a separate migration task.

When Docker is unavailable, a port is occupied, the env is incomplete, or a
database health/identity check fails, the wrapper exits with an error and does
not select another port, kill the process holding it, or create a second
project. Concurrent mutating actions are serialized by a lock derived from the
canonical checkout path.
