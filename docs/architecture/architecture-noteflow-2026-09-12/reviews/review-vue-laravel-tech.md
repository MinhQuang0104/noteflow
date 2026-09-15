# Vue/Laravel current-technology review — 2026-09-13

## Scope

Review of only the stack, deployment, and authentication claims in `ARCHITECTURE-SPINE.md` and `ARCHITECTURE-PROPOSAL.md`. Sources were checked against current first-party documentation and upstream repositories on 2026-09-13. Application behavior, product requirements, data design, Tailwind, Vitest, and Playwright are outside this lens.

## Verdict

**NEEDS ONE CORRECTION.** The Vue/Laravel architecture direction is viable and the selected Laravel, PHP, Vue, Router, Vite, Node, TypeScript, Sanctum, TanStack Vue Query, Pest/PHPUnit, and PostgreSQL release lines are compatible. The one hard mismatch is Pinia 3: the documents also require the current official `create-vue` scaffold, and that scaffold now selects Pinia 4.

## High finding

### TECH-01 — Pinia 3 conflicts with the current official create-vue scaffold

- **Evidence in the documents:** The spine says to use the official `create-vue` scaffold while its Stack table pins Pinia `3.x`; the proposal likewise specifies “Router 5 / Pinia 3” and says compatible patches will be selected at scaffold time.
- **Official evidence:** Vue identifies `create-vue` as its official/recommended Vite-powered scaffolder. The current upstream `create-vue` templates select Vue `^3.5.42`, Vite `^8.2.2`, Vue Router `^5.2.0`, TypeScript `~6.0.0`, and Pinia `^4.0.3`. [Vue Quick Start](https://vuejs.org/guide/quick-start), [create-vue base template](https://github.com/vuejs/create-vue/blob/main/template/base/package.json), [TypeScript template](https://github.com/vuejs/create-vue/blob/main/template/config/typescript/package.json), [Router template](https://github.com/vuejs/create-vue/blob/main/template/config/router/package.json), [Pinia template](https://github.com/vuejs/create-vue/blob/main/template/config/pinia/package.json).
- **Impact:** A builder cannot simultaneously follow “current official scaffold without version divergence” and the Pinia 3 release-line pin. Letting the scaffold run as documented produces Pinia 4; forcing Pinia 3 introduces an unexplained downgrade and makes the current-scaffold claim false.
- **Required correction:** Change Pinia `3.x` / “Pinia 3” to Pinia `4.x` / “Pinia 4” in both documents. Exact patch selection remains a lockfile decision during implementation.

## Verified claims

| Claim | Result | Official evidence |
| --- | --- | --- |
| Laravel 13 supports PHP 8.3–8.5; PHP 8.4 is a valid baseline | Pass | Laravel lists PHP 8.3–8.5 for Laravel 13. PHP 8.4 remains actively supported through 2026-12-31 and receives security support through 2028-12-31. [Laravel release matrix](https://laravel.com/framework/docs/13.x/releases), [PHP supported versions](https://www.php.net/supported-versions.php). |
| Vue 3 with the official create-vue Vite SPA scaffold | Pass | Vue recommends `npm create vue@latest` for a Vite-based Vue SPA; the current template remains on Vue 3. [Vue Quick Start](https://vuejs.org/guide/quick-start), [create-vue repository](https://github.com/vuejs/create-vue). |
| Vue Router 5 | Pass | The current official scaffold selects Vue Router `^5.2.0`, and upstream Router is on the 5.x line. [create-vue Router template](https://github.com/vuejs/create-vue/blob/main/template/config/router/package.json), [Vue Router releases](https://github.com/vuejs/router/releases). |
| Vite 8 with Node 24 LTS `>=24.12` | Pass | The current create-vue engine constraint is `^22.18.0 || >=24.12.0`; Vite 8 requires Node `^20.19.0 || >=22.12.0`. Node 24 is an LTS line. The selected Node constraint satisfies both. [create-vue base template](https://github.com/vuejs/create-vue/blob/main/template/base/package.json), [Vite 8 release](https://vite.dev/blog/announcing-vite8), [Node release status](https://nodejs.org/en/about/previous-releases). |
| TypeScript 6 | Pass | TypeScript 6 is stable, and the current create-vue TypeScript template selects `~6.0.0`. [TypeScript 6 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [create-vue TypeScript template](https://github.com/vuejs/create-vue/blob/main/template/config/typescript/package.json). |
| Laravel Sanctum 4 with Laravel 13 and PHP 8.4 | Pass | Sanctum 4.3.1 added Laravel 13 support; the 4.x package supports Illuminate 13 and requires PHP 8.2+, so PHP 8.4 fits. [Sanctum changelog](https://github.com/laravel/sanctum/blob/4.x/CHANGELOG.md), [Sanctum package constraints](https://github.com/laravel/sanctum/blob/4.x/composer.json). |
| TanStack Vue Query 5 with Vue 3 and TypeScript 6 | Pass | Vue Query v5 requires Vue 3.3+ and its current TypeScript support window includes TypeScript 6. [Vue Query v5 migration guide](https://tanstack.com/query/latest/docs/framework/vue/guides/migrating-to-v5), [Vue Query TypeScript guide](https://tanstack.com/query/latest/docs/framework/vue/typescript). |
| Pest 5 / PHPUnit 13 on PHP 8.4 | Pass | Pest 5 requires PHP 8.4+ and is built on PHPUnit 13; PHPUnit 13 also requires PHP 8.4+. [Pest support policy](https://pestphp.com/docs/support-policy), [Pest upgrade guide](https://pestphp.com/docs/upgrade-guide), [PHPUnit 13 announcement](https://phpunit.de/announcements/phpunit-13.html). |
| PostgreSQL 17 remains supported | Pass | PostgreSQL 17 is supported through 2029-11-08. Selecting a provider-managed current 17.x minor is valid even though PostgreSQL 18 is newer. [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/). |

## Deployment and authentication fit

The same-origin topology is technically sound. Nginx or an equivalent web server can serve the compiled Vue assets and route Laravel requests to PHP-FPM, provided only the Laravel public entry point is web-accessible and SPA fallback excludes API, login, and Sanctum routes as the documents require. Laravel's deployment guidance supports Nginx/PHP-FPM and requires requests to enter through `public/index.php`. [Laravel deployment](https://laravel.com/framework/docs/13.x/deployment).

The private object-storage transfer claim is supported at the framework level. Laravel 13 supports S3-compatible endpoints plus temporary download and upload URLs. The documents correctly defer provider-specific presigned-upload, CORS, immutability, size, and timeout verification to deployment rather than claiming those checks are complete. [Laravel filesystem](https://laravel.com/framework/docs/13.x/filesystem).

Sanctum's first-party SPA mode matches the proposed same-origin session design: it uses Laravel cookie sessions rather than browser-stored bearer tokens, protects routes with `auth:sanctum`, initializes CSRF through `/sanctum/csrf-cookie`, and sends the decoded `XSRF-TOKEN` in `X-XSRF-TOKEN`. The documents' separation between an HttpOnly session cookie and a client-readable XSRF cookie is correct. [Laravel Sanctum SPA authentication](https://laravel.com/framework/docs/13.x/sanctum#spa-authentication).

## Lockfile boundary

This review validates release-line compatibility, not an installable dependency graph. Composer and frontend lockfiles must select exact patches during scaffold/implementation, followed by install, build, typecheck, and integration checks. That deferred lockfile work does not block the architecture after TECH-01 is corrected.

No other hard mismatch was found in the reviewed scope.
