# V4 overnight queue runner (MVP): design proposal

## Status

**PROPOSED (owner decision, 2026-11-08). Nothing is built yet.** This record is
a design rationale. It is not loaded by the router or by any Runner action, and
it grants no authority. Building it goes through the V4 Lite migration lane, and
each step needs the full `npm run test:v4` suite on its exact commit.

The owner chose this MVP after three review rounds of a fully-automatic lane
kept finding new safety gaps (each round found 4–6 HIGH defects). That design
is kept as `v4-auto-lane-stage2-deferred.md` and is revisited only with real
MVP run data.

**Review stop rule.** This design gets at most one review round. Only HIGH
findings that block building it are fixed. Everything else goes to §8 Risks.

## Objective

Run an owner-approved queue of Stories unattended overnight. Each Story
advances until its **next human stop**. In the morning there is one report that
lists, for every Story, how far it got and the exact owner action needed.

What does not change:

- policy and authority;
- the Human Gate, owner review and `complete_story`;
- integration.

The runner only replaces the owner typing "continue" between autopilot steps.

## Scope

| In | Out (deferred to stage 2) |
|---|---|
| A queue of Stories prepared while the owner is present | Automatic approval, owner proxy, `auto` branch, overlay |
| A driver loop: one fresh headless Lead session per action | Reviewer subagent, decision tiers 1–3 |
| Child-session permissions and a night-time tripwire | Any change to review policy, Human Gate or completion |
| A morning report | Automatic integration into any branch |
| One small kernel helper (K7) | Other kernel changes |

Story worktrees are created from `main` exactly as today. Each Story already
lives on its own branch, so `main` is untouched until the owner runs the
existing `integrate-story` command. A separate automation branch adds nothing
while gates stay manual.

## 1. Flow

```text
evening, owner present
  node .agents/scripts/v4-overnight.mjs prepare --queue <queue.json>
    per Story: validate Plan → worktree from main → registry claim (driver session)
               → start_story → print the exact --authorize-autopilot command
    owner runs each printed authorize command (owner operation stays owner-typed)
    claim refusals (scope overlap, RESOURCE_CONFLICT) → Story left out, listed

night, unattended
  node .agents/scripts/v4-overnight.mjs run --deadline <time>
    preflight: pointer IDLE · canonical checkout clean on main · test:v4 on HEAD
               · Docker/test DB ready · AGY smoke · record night baseline (§3)
    for each prepared Story (sequential):
      loop:
        autopilot-status
        CONTINUE → spawn `claude -p` child in the Story worktree for exactly one
                   action, with lane settings (§2) and the claim generation
                   → after it exits: heartbeat · baseline check (§3)
        STOP     → record reason + owner decision needed → next Story
      stop at the deadline: let the running child finish, then stop
    write report (§4) · never run owner operations · never integrate · never push

morning, owner
  read report → existing flow: review / record-owner-review / approve /
  complete_story / integrate-story → next evening: run again
```

- **Fresh session per action.** Each child re-reads the Plan, Git and receipts
  (V4 Auto rule: chat memory is never evidence), so a crash costs only the
  action in progress.
- **Claim and generation.** The driver holds the claim under its own session id,
  and children reuse that generation.
- **Heartbeat.** The driver sends the registry heartbeat itself.

## 2. Child-session permissions

Children run headless with
`claude -p --settings <absolute path>/.agents/config/overnight-settings.json`,
using an explicit allowlist. They never run with
`--dangerously-skip-permissions`. In `claude -p`, an unlisted tool is denied
rather than prompted, so a gap fails safe and shows up in the report as a STOP.

- **Allow:**
  - the existing V4 allowlist entries;
  - the declared verification commands of the prepared Stories;
  - read-only git;
  - Edit and Write inside the Story worktree.
- **Deny.** Deny takes precedence over allow, so these rules also neutralize the
  broad `Bash(node .agents/scripts/*)` from the project settings.
  - Owner operations: `--approve-exact-scope`, `record-owner-review`,
    `--authorize-autopilot` / `--revoke-autopilot`, `complete_story`,
    `claim --takeover`, `integrate-story`, `story-registry release`.
  - Git commands: `git push`, `reset`, `clean`, `stash`, `rebase`, `update-ref`,
    branch deletion, and checkout or switch of `main`.
  - Edit/Write to `.claude/**`, `.agents/**`, `AGENTS.md`, `<git-common-dir>/**`,
    and the Story's Plan, receipts and `sprint-status.yaml`. Kernel scripts write
    those through node from payloads, not through Edit.
  - Reading `.env*` and credential stores; network installs; `node -e`.
- **K7, the only kernel addition.** `move-worker-contract.mjs` replaces the
  `node -e` contract move in `agy-executor.md` step 6, so AGY slices work
  without allowing arbitrary `node -e`. It is useful on `main` too.

There is no separate guard hook in the MVP. The deny rules plus the night
baseline (§3) are the controls.

**Launch flags (M1, verified on Claude Code 2.1.319):**

```text
claude -p --restricted --tools "Bash,Read,Edit,Write,Glob,Grep"
  --settings <absolute>/.agents/config/overnight-settings.json
  --strict-mcp-config --permission-prompts none [--allowedTools <Story check commands>]
```

What these flags do:

- **`--restricted`** ignores user, project and local settings files, so the
  project `Bash(node .agents/scripts/*)` never loads. It confines file tools to
  the working directory and refuses `bypassPermissions`.
- **`--permission-prompts none`** denies anything that would prompt.
- **`--allowedTools`** lets the driver add each Story's declared verification
  commands for the run.

**Probe evidence (2026-11-08, headless haiku child in the canonical checkout):**

| Outcome | Commands and tools |
|---|---|
| Allowed | `git status --short`; `git log … && echo ok`; `scripts/local.ps1 test …`; Write to `frontend/src/…` |
| Denied | the Runner with `--approve-exact-scope`; `git status && git push` (compound); `node -e`; `local.ps1 -Command`; unlisted `node <script>`; `npm run build`; `rm`; `touch`; `cat backend/.env`; Read of `backend/.env`; Write to `.agents/`, `_bmad-output/` and outside the worktree |

Claude Code also auto-allows harmless read-only built-ins such as `echo`, even
though they are not on the allowlist. This is accepted, because they cannot
write or execute code.

Verification checks run inside the Runner's own node process, so they do not
need Bash rules. Only the commands the Lead reruns itself for AGY slices do.

## 3. Night baseline (tripwire)

The owner is absent during a run. Some state therefore must not change at all,
and any change is a forgery or an escape. The driver records this state in
preflight and checks it after every child action. **Any difference stops the
whole run**, and the report says what changed.

| Watched | Rule |
|---|---|
| `refs/heads/main` and canonical checkout status | Unchanged. Nobody integrates at night. |
| **Human evidence** in every prepared Story's Plan and receipts | No new `human` review, no `human_approval`, no exact-scope approval, no autopilot authorization or revocation. No human is present, so any such record created overnight is forged. |
| Registry records of prepared Stories | Generation and lane holder unchanged; only heartbeats and state move. |
| `overnight-settings.json`, project `.claude/settings*.json` in each Story worktree, `<git-common-dir>/hooks/**` and `config` | Hashes unchanged. |

**AGY** still runs under Orca with `--dangerously-skip-permissions`, outside the
child permission rules. The human-evidence rule turns its worst abuse, forging
an approval, into a detected stop. The scope gate still catches out-of-scope
writes. This weak point is reduced, not removed (`ARCHITECTURE.md` §7).

## 4. Report

The driver writes `.agent-state/overnight/<run-id>/report.md`, plus
`report.json` for tooling. Both are gitignored.

```markdown
# Overnight run <date> — N Stories: progress summary
## Needs you   per Story: stop reason (autopilot-status / step outcome), exact owner
               command or decision, evidence (commits, check logs), what it unblocks
## Run stopped (if any)   baseline violation or preflight failure, with the diff
## Stats   per Story: actions run, slices checkpointed / verified, rework rounds, minutes
```

Stop reasons come straight from the kernel: `HUMAN_REVIEW_REQUIRED`,
`HUMAN_REQUIRED`, `STOP HUMAN_GATE`, budget exhaustion, check failures,
`WORKER_FAILED`, `NEEDS_HUMAN`. The driver does not reinterpret or tier them.
The "exact owner command" comes from `autopilot-status`'s reported decision.

## 5. Queue

```json
{ "schemaVersion": 1,
  "stories": [ { "id": "2.4",
                 "budgets": { "max_rework_per_slice": 2, "max_minutes_per_slice": 90 },
                 "checks": ["npm run type-check"] } ] }
```

**Queue file.** It lives in the owner's gitignored
`.agent-state/overnight/queue.json`.

- `budgets` go verbatim into the printed `--authorize-autopilot` payload.
- `checks` are extra Bash rules, passed to the children as `--allowedTools`.

There is no separate Plan digest. The owner's own `--authorize-autopilot`
already binds the Plan, and the registry enforces independence through
scope-overlap and resource refusals at claim.

**`prepare` steps (as built in M2).** For each queued Story, in order:

1. Refuse a missing Plan, uncovered slice paths, or an existing Story worktree.
2. Create the worktree with `orca worktree create --base-branch main --setup skip`.
3. Claim the Story under one driver session.
4. Run `start-story check`, then `start-story apply`.
5. Run `npm ci` for `frontend/` or `tests/e2e/` when the slices touch them.
6. Print the authorize command.

Prepared Stories are **merged** into `.agent-state/overnight/state.json`. A
Story prepared on an earlier night keeps its claim and is resumed. `run` drops
a Story whose registry claim is gone (integrated or aborted) and reports it as
`RELEASED`.

**Child result.** The child's `OVERNIGHT_RESULT` line is untrusted. It is used
only to *stop* a Story (for example `HUMAN_REVIEW_REQUIRED`, an in-step outcome
the kernel does not persist), never to continue or approve. A repeated
HEAD + `next_action` without progress stops the Story as `NO_PROGRESS`.

## 6. Expected throughput

The MVP keeps every existing human stop, so how far a Story gets depends on its
slice mix:

| Slice | Overnight outcome |
|---|---|
| LOW | Runs through |
| MEDIUM, AGY executor | Runs through (`INDEPENDENT_LEAD_REVIEW`) |
| MEDIUM, Lead executor | Stops for owner review (`SAME_LEAD_REVIEW`) |
| HIGH | Stops at every slice review |
| Story end | Stops at `complete_story` (Human Gate) |

The best queue candidates are Stories whose slices are LOW or AGY-executed.
Measuring where real runs stop is the input to the stage 2 decision.

## 7. Prerequisites and open items

1. **Backend recipe.** Story 2.2 is blocked by `VERIFICATION_NOT_APPROVABLE`,
   because canonical verification is `INCOMPLETE` without a backend recipe.
   Any backend Story hits the same stop. Land the recipe on `main` first.
2. **Shared test-DB lock.** Claim reserves `backend-test-db` / `e2e-db` until
   release, and a Story waiting at a human stop keeps holding it. As things
   stand, only one backend Story can be prepared per night. Story 1-7
   (per-worktree test runtime) is done, and `agy-executor.md` keeps the locks
   only "for any resource that remains shared". Check whether
   `backend-test-db` is still shared; if not, retire it as a separate, small
   `main` change.
3. **UNVERIFIED CLI behaviour, pinned in M1:**
   - how `claude -p --settings` merges with user and project settings;
   - that deny-rule patterns match the Runner argv forms used by children.
4. Where `prepare` creates worktrees: plain `git worktree add`, or Orca, so the
   owner sees them on the phone.

### M0 decisions (owner, 2026-11-08)

| # | Decision |
|---|---|
| M0-1 | Backend recipes are written **on demand, at Story planning time on `main`, before `start_story`**, following the Story 1.7 precedent (`3721785`). The planning commit adds the feature map, the verification recipe and stub files for new paths. The kernel reads recipes from the Story's own checkout (`check-verification.mjs` `loadRecipe`), and a started Story keeps its pinned policy, so a recipe added later never reaches it. `prepare` refuses a Story whose slice scope paths are not covered by a recipe. The first backend recipe is written for the next backend Story queued. Checks: focused `scripts/local.ps1 test` filters, `pint` and `phpstan`. |
| M0-1b | Story 2.2 does not get a recipe. The owner revokes its autopilot (permanent for that Story) and finishes it through the manual owner-review flow. |
| M0-2 | Run a concurrency smoke test: two linked worktrees running backend tests at the same time. If it passes, stop inferring `backend-test-db` at claim for linked worktrees, as a separate small `main` change. `e2e-db` stays, because concurrent E2E is not proven. |
| M0-3 | `prepare` creates Story worktrees through **Orca**, so the owner can see them and their Lead/AGY terminals from the phone. |

## 8. Risks

- **Same OS account.** The deny rules and night baseline detect abuse after at
  most one action; they do not prevent it.
- **AGY outside the permission rules.** It is contained by the scope gate and
  the human-evidence tripwire.
- **Low throughput on HIGH Stories.** This is accepted. It is the price of
  keeping the gates, and the data decides stage 2.

## 9. Build steps

| Step | Content | Gate |
|---|---|---|
| M0 | (a) Owner revokes Story 2.2 autopilot; (b) concurrent backend-test smoke, then retire `backend-test-db` for linked worktrees if it passes | Owner; smoke evidence; `test:v4` |
| M2 add | `prepare` recipe-coverage refusal (M0-1) | Test: uncovered slice path refuses the Story |
| M1 | K7 `move-worker-contract.mjs` + `agy-executor.md` step 6; `overnight-settings.json`; deny-rule tests | `test:v4`; each deny blocks; AGY delivery and Story commands pass |
| M2 | `v4-overnight.mjs prepare` / `run`: preflight, loop, heartbeat, baseline, report | `test:v4`; tests: STOP routing, deadline, every baseline violation stops the run, never calls owner operations. **Built 2026-11-08**, tests fake every external command. The `prepare` happy path (Orca create, claim, start) and a real child run are first exercised in M3. |
| M2b | Put the payload lessons that children need into a child-readable place: `references/implementation-techniques.md` or the driver prompt. Children cannot read the Lead's memory. Known lessons (2026-11-08, Story 2.2): run `prepare` before `verify` to get the preview (`PREVIEW_REQUIRED`); `record-review` needs a `plan_template` with tokens (model: `verificationTemplate` in `v4-verification-fixture.mjs`); warm the worktree test runtime before a 120 s backend check. Add whatever Story 2.2 slices B and C reveal. | `test:v4`; a dry child run reaches `verify` without these errors |
| M3 | Pilot: one night with 1–2 LOW / AGY-heavy Stories | Owner reads the report, runs the morning flow |
| M4 | After about five runs, review the stop data and decide on stage 2 | Owner |
