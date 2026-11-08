# V4 Auto lane, stage 2: deferred design

## Status

**DEFERRED (2026-11-08). Revision 3. Not built.** The owner chose the overnight MVP (`v4-overnight-runner-design.md`) as the next step; this stage-2 design is revisited only with MVP run data. A third review (2026-11-08) found two more HIGH gaps, listed at the end, which must be fixed before any phase K work.

Original status: **PROPOSED (owner brainstorm, 2026-11-08). Revision 3.**
This record is a design rationale. It is not loaded by the router or by any
Runner action, and it grants no authority. Root `AGENTS.md`, the router and the
Runner contracts stay authoritative on `main`. Each building phase (§12) goes
through the V4 Lite migration lane and needs the full `npm run test:v4` suite on
its exact commit.

History:

- **Revision 1** claimed no kernel change.
- **Revision 2**, after an independent review, added inert kernel capabilities
  and a safety section.
- **Revision 3**, after a second independent review, fixes six problems:
  - self-asserted subagent reviews;
  - an authorization check the caller could satisfy;
  - resources still held by `AUTO_DONE` records;
  - `AGENTS.md` being overwritten on sync;
  - leftover "Human" provenance;
  - tripwire false alarms.

**Root cause.** The driver and its child sessions run under the same OS account.
Every safety rule therefore follows one principle:

- **Anchor authority where children cannot write.** That means
  `refs/heads/auto`, guarded by the tripwire, and the driver's process memory.
- **Never trust an artifact a child produced.** Re-check it against those
  anchors instead.

## Objective

Let the owner hand a queue of pre-approved Stories to the agents and have them
implemented end to end while the owner is away. Implementation runs without
permission prompts and without the per-Story Human Gate. Meanwhile the
architecture on `main` keeps evolving, unaffected, until the owner explicitly
promotes the result.

This builds on V4 Auto (`v4-auto-design.md`). It reuses the Runner, the
registry, the AGY executor, the scope gate and integration. It adds:

- a long-lived branch with an authorization overlay that exists only on that
  branch;
- a driver loop (the optional P4 of V4 Auto);
- safety guards;
- a driver-spawned reviewer;
- a final decision report;
- a few inert kernel capabilities.

## Decisions (owner, 2026-11-08)

| # | Decision |
|---|---|
| L1 | No OS sandbox. Isolation comes from Git anchors, the guard hook, permission allow/deny rules, the driver tripwire and driver-held ledgers (§7). |
| L2 | A long-lived branch `auto` = `main` + overlay `O`. `O` exists only on `auto` (§4). |
| L3 | Story branches and worktrees for the lane are created from `auto`, not from `main`. |
| L4 | The per-Story Human Gate is removed on `auto`. The driver acts as owner proxy under an owner-committed authorization, and its approvals are recorded as `owner-proxy`, never as `human`. The only human gate is **promote** `auto` → `main` (§5). |
| L5 | Input is an owner-approved queue. Authorization is bound to each Plan's normative digest. Only independent Stories are allowed. |
| L6 | A reviewer (Opus) reviews every HIGH slice and every MEDIUM slice the Lead itself implemented. The **driver** spawns the reviewer and records its verdict. A MEDIUM slice implemented by AGY keeps the kernel's existing independent Lead review. Max 2 review rounds per slice (§8). |
| L7 | Failures are sorted into four tiers. Tier 1 "decide and flag" is allowed, but only for cases the kernel already permits. Any `SPEC_AMBIGUITY` and any file outside the expected scope go to tier 2 (§9). |
| L8 | Output is one report file at the end of the run (§10). |
| L9 | The owner keeps monitoring through the existing Orca phone pairing. The lane runs in the owner's own Orca, so there is no conflict. |
| L10 | The Lead on this lane is Claude. |
| L11 | Kernel capabilities K1–K7 land on `main`, inert unless a verified auto-lane authorization is present. The authorization itself reaches `main` only through promote, as history (§3). |

## 1. Topology

```text
canonical checkout (D:/.../New_Project_My_Note)   stays on main, pointer lives here
auto worktree      (linked, e.g. .../noteflow-auto)  driver home + integration target
story worktrees    (linked, from auto)               one per queued Story

main ──●──────●───────────●───────────────▶  canonical; Human Gate; no O
        \      \ sync      ▲ promote (owner command, O paths removed)
auto ────O──────●────S1────S2────●──(O re-applied)──▶
                 \   ▲  \   ▲    ▲ sync after promote
story-a           ●──┘   \  │
story-b                   ●─┘
```

- **Canonical checkout.** It must stay clean and on `main`, because the V3
  pointer and integration both depend on it. `auto` therefore lives in its own
  linked worktree. That worktree is the driver's home and the target of Story
  integration.
- **Policy pin.** A Story pins `controlPlaneCommit` to the `auto` commit it was
  created from. With K4, policy drift is reported against `auto`. Until K4
  lands, every lane Story reports `INFO_DRIFT` against `main`. This is expected
  and only informational.
- **Stacking.** Later Stories start from the latest `auto`, so they already
  include earlier auto-done Stories. Even so, the queue accepts only
  independent Stories (L5).

### Sync `main` → `auto` (owner or driver preflight, no child session)

1. Merge `main` into `auto` in the auto worktree.
2. **Restore `O`, using the manifest in `authorization.json` (§6):**
   - Every `O` file except `AGENTS.md` is restored to the manifest version.
   - For `AGENTS.md`, keep `main`'s version and re-insert the `## Auto lane`
     block at the end. Only the block is hashed, so concurrent `main` edits to
     `AGENTS.md` survive.
3. Commit the restore as `chore(auto): restore overlay`.
4. **Conflicts:**
   - On `O` paths, the manifest wins.
   - On any other path (for example `sprint-status.yaml`), abort the merge and
     stop for the owner, as `MERGE_CONFLICT` does today. Never resolve them
     automatically.
5. The `O` integrity check is a hard postcondition.

The restore step is mandatory. After a promote, `main` descends from `auto` and
contains the deletion of the `O` paths. A plain merge would silently apply that
deletion and wipe `O` without any conflict.

## 2. Run lifecycle

```text
owner (before leaving)
  commit queue.json + authorization.json (with O manifest) on auto
  in the auto worktree:
    node .agents/auto/driver/v4-auto-driver.mjs run --authorization-sha256 <sha>

driver preflight                         any failure → tier 3, report, exit
  canonical pointer IDLE · canonical checkout clean on main · auto worktree clean
  sha == hash of refs/heads/auto:.agents/auto/authorization.json · not expired
  queue hash matches · O files match the manifest
  full npm run test:v4 + O tests on auto
  Docker / test DB ready · AGY smoke (terminal create, tui-idle, close)
  record tripwire baseline (§7)

for each queue entry (sequential, queue order):
  verify Plan normative digest == approved   mismatch → skip, tier 2
  worktree + branch from auto → registry claim (lane: auto) → start_story
  --authorize-autopilot (per-slice budgets, auto_authorization_sha256, K6)
  loop:
    autopilot-status
    CONTINUE → fresh headless `claude -p` child runs exactly one action
               (implement_slice may deliver to AGY per agy-executor.md)
    after every child action: tripwire + hash checks          change → tier 3
    REVIEW_REQUIRED on a reviewer-tier slice → driver review step (§8)
    STOP HUMAN_GATE at complete_story → driver owner-proxy completion (§5)
    other STOP → classify (§9): tier 2 → park Story, next entry; tier 3 → stop run
    authorization expired mid-run → revoke autopilot for this Story, tier 3
  ledger cross-check (§7) → integrate story → auto (K1) → re-baseline tripwire
  → registry AUTO_DONE (K5)

driver wrap-up
  write report (§10) · keep parked worktrees · never promote, never push
```

- **Fresh session per action.** Each action re-reads the Plan, Git and receipts,
  so a crash or compaction costs only the action in progress (V4 Auto rule:
  chat memory is never evidence).
- **Claim and generation.** The driver holds the claim under its own session id.
  Child sessions run under the same generation, so no owner takeover is needed
  per action.
- **Driver-only operations.** Only the driver process performs owner-proxy
  operations, reviewer spawning, review recording for reviewer-tier slices,
  integration and sync.

## 3. Kernel capabilities on `main` (inert by default)

These are the only kernel edits the lane needs. Each one is a separate
migration-lane change with its own tests. Without a verified auto-lane
authorization, behaviour on `main` is identical to today.

| # | Change | Why |
|---|---|---|
| K1 | `integrate-story.mjs --target-branch <name>` (default `main`): the target checkout must be clean and on that branch, and the base, moved check and fast-forward use `refs/heads/<target>`. **Default integration into `main` refuses** any diff that adds `.agents/auto/**` or a Plan approval with `owner-proxy` provenance. Only promote mode may bring them in. | Integration is hard-coded to `main`. Without the refusal, a main-lane Story could smuggle an authorization file or a proxy approval onto `main`. |
| K2 | Reviewer type `subagent`, accepted **only** through a new operation `record-subagent-review`. Plain `record-review` refuses `subagent`, as it refuses `human` today. With a verified authorization, a PASS yields `APPROVE_ALLOWED` for MEDIUM or HIGH. `SPEC_AMBIGUITY` / `NEEDS_HUMAN_DECISION` still yield `HUMAN_REQUIRED`. The authorization is read from the durable `plan.autopilot` record (K6), not from the request. | Today `record-review` would accept a self-asserted `subagent` reviewer. |
| K3 | Approval provenance, end to end: the Plan approval gains `provenance: {type: 'owner-proxy', authorization_sha256, auto_commit}`; `approvalRecordForSnapshot` emits `approver_type: 'owner-proxy'`; the commit messages and note in `complete-story.mjs` say "owner-proxy approval (authorization <sha>)" instead of "Human approval". The completion check accepts `owner-proxy` only when `auto_commit:.agents/auto/authorization.json` hashes to `authorization_sha256`. That history anchor still resolves on `main` after promote. The `human_approval` key name stays, for schema compatibility. The proxy never uses `record-owner-review`, which keeps forcing `human`. | `complete-story.mjs` writes "Human approval" in two commits and a note; `approver_type` is hard-coded to `human`. |
| K4 | `story-registry.mjs policy-drift --base <ref>` (default `refs/heads/main`). | Drift compares against `main` only. |
| K5 | Registry schema v3 with a reader. A new state `AUTO_DONE` is set by integration into a non-`main` target. An `AUTO_DONE` record **releases its resources** but keeps its scope reservation and its `lane: auto` field. Promote releases it fully. `claim` refuses an `AUTO_DONE` Story. | After integration the claim is released, so the `main` lane could restart the Story. Resources that stay held would block the next queued Story (`RESOURCE_CONFLICT`). |
| K6 | At claim, the registry records `lane: auto`. `--authorize-autopilot` accepts `auto_authorization_sha256` and stores it in `plan.autopilot`. A Story is **verified auto-lane** only when all three hold: the record says `lane: auto`; `controlPlaneCommit` is reachable from `refs/heads/auto`; the stored sha equals the hash of the blob at `refs/heads/auto:.agents/auto/authorization.json`. | The revision 2 check used the caller's own tree and "branch is not `main`", which every Story branch and detached checkout satisfies. |
| K7 | Script `move-worker-contract.mjs` replaces the `node -e` contract move in `agy-executor.md` step 6. | The lane denies `node -e`, and the replacement also helps `main`. |

Because K6 anchors on `refs/heads/auto` and the tripwire (§7) treats any
non-driver move of that ref as tier 3, a child cannot mint its own authorization.
A main-lane Story has no `lane: auto` record, so K2, K3 and K6 never activate on
the `main` lane.

## 4. Overlay `O`

`O` is a fixed list of paths, kept in `.agents/auto/overlay-paths.json`:

| Path | Purpose |
|---|---|
| `.agents/auto/authorization.json` | Owner grant: lane enabled, owner-proxy operations, run budgets, expiry, queue hash, **`O` manifest** |
| `.agents/auto/queue.json` | Approved queue: Story id, Plan normative digest and budgets per entry; run deadline |
| `.agents/auto/decisions/` | Owner answers to report items |
| `.agents/auto/policy.md` | Lane rules: owner proxy, decision tiers (§9), report contract |
| `.agents/auto/review-policy.md` | When and how often to review (§8) |
| `.agents/auto/claude-settings.json` | Headless permission allow/deny list and guard hook registration (§7) |
| `.agents/auto/reviewer.md` | Reviewer instructions, used by the driver-spawned reviewer session |
| `.agents/auto/overlay-paths.json` | This list |
| `.agents/auto/driver/v4-auto-driver.mjs` | Driver loop, owner proxy, reviewer spawn, tripwire, ledgers, report writer |
| `.agents/auto/driver/auto-guard.mjs` | PreToolUse guard hook |
| `.agents/auto/driver/build-review-bundle.mjs` | Reviewer context builder |
| `.agents/auto/tests/` | Tests for the files above, run by the driver preflight and by promote |
| `AGENTS.md` block `## Auto lane` | Explicit override for `auto` sessions (see below) |

Rules:

- **Kernel logic.** `O` never edits Runner, kernel or registry logic. It uses
  only existing operations plus K1–K7.
- **Reviewer file.** It moves from `.claude/agents/` into `O`, because the
  driver spawns the reviewer itself (§8). Child sessions then have no reviewer
  agent they could invoke and self-report.
- **Tests.** `O` tests live under `.agents/auto/tests/`, not in
  `.agents/scripts/`. This keeps them out of the `test:v4` inventory
  (`v4-test-names.json`), which changes on almost every `main` commit and
  would conflict on every sync.
- **Project settings.** `.claude/settings.json` is not changed, because a test
  keeps it equal to the allowlist in `autopilot.md`.
- **The `AGENTS.md` block** is an explicit, scoped override. On `auto`, under a
  verified authorization, it replaces two root rules:
  - "automatic approval / automatic review-to-done stay disabled";
  - "`complete_story`, owner review and Human Gate stay manual" (D-P5-a).

  The block is appended and never edits root sentences, so tests that pin those
  sentences keep passing.
- **Integrity check.** It runs in preflight, after every sync, and in promote.
  It compares every `O` file, and the `AGENTS.md` block by itself, against the
  manifest in the owner-authenticated `authorization.json`. On promote it
  verifies that no `O` path and no block remain on `main`.

## 5. Owner proxy and promote

**Owner proxy.** On `auto`, the driver process itself performs the owner
operations that `authorization.json` allows:

- `--approve-exact-scope`
- `complete_story`
- integration into `auto` (K1)

`record-owner-review` is **not** a proxy operation. Reviewer-tier slices are
approved through `record-subagent-review` (K2). Every proxy call is anchored by
K6, and the resulting approvals carry `owner-proxy` provenance (K3). This keeps
H-01 honest: the authority is the owner's committed grant, and the evidence says
so instead of claiming a human looked. The driver refuses to start on `main` or
when the integrity check fails. Every owner-proxy action is listed in the
report.

"Done" on `auto` means **auto-done**. A Story's lifecycle entry reaches `main`
only through promote.

**Promote** (owner command only, run from the canonical checkout):

1. Take the integration lock and merge `auto` into a scratch worktree at the
   current `main`, reusing the K1 mechanics in promote mode (`--no-ff`, no
   rebase).
2. Remove every `O` path and strip the `AGENTS.md` block.
3. Run the integration checks:
   - full `npm run test:v4`;
   - the `O` tests;
   - the completion check of each promoted Story. It accepts `owner-proxy`
     approvals through the K3 history anchor.
   - a leak test asserting that no `O` path or block remains.
4. Only on success, fast-forward canonical `main` and fully release the
   `AUTO_DONE` records (K5). Never push.
5. Run the next sync with the overlay restore (§1).

**Partial promote.** Later Stories are built on earlier ones, so a partial
promote can only take a **prefix** of `auto`: all Stories up to a chosen
integration commit. To leave a Story out, revert it on `auto` first, and then
promote.

Before promoting, the owner reviews `main..auto` (or `main..<prefix commit>`)
together with the report. This is the human gate the lane keeps. The owner's
promote commit is the human act, and it is recorded as such.

## 6. Queue and authorization contracts (draft)

```json
// .agents/auto/queue.json
{ "schemaVersion": 1, "deadline": "2026-11-09T07:00:00+07:00",
  "stories": [
    { "id": "2-4", "planDigest": "<Plan normative digest>",
      "autopilotBudgets": { "max_rework_per_slice": 2, "max_minutes_per_slice": 90 },
      "storyBudgets": { "slices": 3, "reviewRounds": 2, "minutes": 180 } } ] }

// .agents/auto/authorization.json
{ "schemaVersion": 1, "owner": "Quang", "issuedAt": "...", "expiresAt": "...",
  "queueSha256": "<sha256 of queue.json>",
  "ownerProxy": ["approve_exact_scope", "complete_story", "integrate_auto"],
  "runBudgets": { "minutes": 480, "storyFailuresBeforeStop": 2 },
  "overlayManifest": { "<O path>": "<sha256>", "AGENTS.md#auto-lane-block": "<sha256>" } }
```

- **Plan digest.** `planDigest` is the Plan's existing normative digest. The
  Runner binds autopilot to the Plan at `authorized_head` after `start_story`.
  The driver checks that the digest at that point equals the approved one.
- **Budgets.** `autopilotBudgets` use the Runner's own keys and limits
  (`max_rework_per_slice` ≤ 3; `max_minutes_per_slice` 5–240). The driver
  enforces `storyBudgets` and `runBudgets`.
- **Authenticity.** Git cannot tell an owner commit from an agent or merge
  commit. So the owner types `--authorization-sha256` on the driver command
  line. Through `overlayManifest`, that one sha authenticates the queue, the
  driver, the guard, the settings, the reviewer and the `AGENTS.md` block. The
  driver compares it with the blob at `refs/heads/auto`, which only the driver
  moves while a run is live (tripwire). Integration into `auto` refuses any
  Story diff touching `.agents/**`, `.claude/**` or `AGENTS.md`. Story lifecycle
  commits only touch `_bmad-output/`, so the refusal never blocks them.
- **Validator** (`v4-auto-driver.mjs validate`): checks schemas, expiry, the
  queue hash, the manifest, each Plan's digest and readiness, and independence
  (no shared expected-scope paths, no declared dependency).

## 7. Safety without a sandbox

Headless child sessions use an **allowlist**, never
`--dangerously-skip-permissions`. In `claude -p`, an unlisted tool is denied,
not prompted, so a gap fails safe and surfaces as a tier 2/3 item.

### Settings sources

- Children are launched with
  `--settings <absolute path in the auto worktree>/.agents/auto/claude-settings.json`.
  The path is never relative and never inside the Story worktree.
- The Story worktree's project settings would also load and add
  `Bash(node .agents/scripts/*)`. The lane neutralizes them with **deny rules**,
  because deny takes precedence over allow. Where the CLI supports it, the
  project source is also excluded (UNVERIFIED: `--setting-sources`).
- Before each spawn, the driver checks the hashes of the lane settings, the
  guard, and the Story worktree's `.claude/settings.json` and
  `.claude/settings.local.json` against the manifest and the baseline.

### Allow

- Explicit script paths for the child's actions:
  - `prepare` / `checkpoint` / `verify` / `record-review` (Lead reviewer only) /
    `prepare-rework` / `apply-rework` / `finalize`;
  - read-only `autopilot-status` and the check scripts;
  - `build-worker-contract`, `check-worker-scope`, `move-worker-contract` (K7);
  - `orca orchestration` / `orca terminal`.
- The declared verification commands of the queued Stories.
- Read-only git.
- Edit and Write inside the Story worktree, except the deny paths below.
- No `git add` / `git commit`. The kernel scripts make every commit.

### Deny (children)

- Edit/Write to:
  - `.claude/**`, `.agents/**`, `AGENTS.md`;
  - `<git-common-dir>/**` (registry, locks, hooks, config);
  - the Story's Plan, receipts and `sprint-status.yaml` under
    `_bmad-output/implementation-artifacts/`. Only the kernel writes those,
    from payloads.
- These scripts and operations:
  - `integrate-story`, `start-story`;
  - `story-registry claim`, `release` and `--takeover`;
  - `--authorize-autopilot`, `--revoke-autopilot`, `--approve-exact-scope`;
  - `record-owner-review`, `record-subagent-review`, `complete_story`.
- Git commands: `git push`, `reset`, `clean`, `stash`, `rebase`, `update-ref`,
  branch deletion, and checkout or switch of `main` or `auto`.
- Reading `.env*` and credential stores.
- Network installs (`npm install`, `composer require`, …).
- `node -e`, and running `node` on any script that is not listed, including
  new files.

### Guard hook (`auto-guard.mjs`, PreToolUse)

The hook matches Bash, PowerShell, Edit, Write and MCP tools. It re-checks every
deny case, and also writes outside the Story worktree and its gitignored
`.agent-state/` evidence. Every block is logged, and a block is a **tier 3**
event.

### Tripwire (driver, after every child action)

| Watched | Rule |
|---|---|
| `refs/heads/auto` | Must equal the baseline. Only the driver moves it (integration, sync), and the driver re-baselines after its own operation. Any other move is tier 3. |
| `refs/heads/main` | May move, because `main` keeps evolving. A move is tier 3 only if the new `main` commits contain `O` paths, the `AGENTS.md` block, `owner-proxy` approvals, or commits from a lane Story branch. Otherwise the driver re-baselines and notes the move in the report. |
| Canonical checkout and auto worktree | Status must be unchanged. |
| `<git-common-dir>/hooks/**` and `<git-common-dir>/config` | Hashes must be unchanged. |
| Lane settings, guard, Story worktree settings | Hashes must match the manifest and baseline. |

### Review ledger

The driver keeps in its own process memory, and in its log, a ledger of every
reviewer session it spawned (bundle fingerprint and verdict). Before integrating
a Story, it requires that every `subagent` review in the Plan matches a ledger
entry. A mismatch is tier 3. AGY or a child could forge a review file, but it
cannot write into the driver's memory.

### AGY

AGY still runs under Orca with `--dangerously-skip-permissions`, so the guard
does not apply to it. Its containment:

- the worktree, the contract scope and the mechanical scope gate. Those
  protected paths are never in a Story's expected scope.
- the hash checks before the next spawn;
- the tripwire, including git hooks and config;
- the review ledger;
- the integration refusal of `.agents/**`, `.claude/**` and `AGENTS.md` diffs.

This weak point is reduced, not removed (see `ARCHITECTURE.md` §7).

## 8. Reviewer

**When** (`review-policy.md`, enforced by the driver):

| Slice | Review | Recorded by | Kernel path |
|---|---|---|---|
| LOW | Deterministic checks plus Lead review | child | existing |
| MEDIUM, AGY-authored | Lead review | child, `record-review` | existing `INDEPENDENT_LEAD_REVIEW` |
| MEDIUM, Lead-authored | Reviewer (Opus) | **driver**, `record-subagent-review` | K2 |
| HIGH (any author) | Reviewer (Opus) | **driver**, `record-subagent-review` | K2 |
| HIGH Story | Optionally one whole-Story review at `finalize_story` | driver | K2 |

**Flow for reviewer-tier slices.**

1. The child runs `verify_slice` up to the deterministic checks and the scope
   gate. It stops at `REVIEW_REQUIRED` without recording a review.
2. The driver builds the bundle and spawns a dedicated headless reviewer session:
   `--model opus`, `Read`/`Grep`/`Glob` only, instructions from
   `.agents/auto/reviewer.md`. The exact spawn flags are UNVERIFIED and are
   pinned in A5.
3. The driver records the JSON verdict through `record-subagent-review`, adds it
   to the ledger, and continues. VALID findings lead to `prepare-rework` in the
   next child action.

Rules:

1. Review only after the deterministic checks and the scope gate PASS.
2. One review per attempt. A rework round reviews only the delta diff plus the
   previous findings ("verify fixes" mode).
3. At most 2 review rounds per slice. After that it is a tier 2 item.
4. If the bundle fingerprint is unchanged, reuse the stored verdict and do not
   spawn again.
5. Counters and verdicts live in receipts under `.agent-state/v4-auto/` and in
   the ledger, never in chat memory.

**Context bundle.** `build-review-bundle.mjs` prepares one file
deterministically:

- slice id, risk, AC ids and text, expected scope and relevant invariants;
- the exact baseline..checkpoint diff;
- check results (command, exit code, tail of output on failure only);
- pointers to the feature map, recipe and tests (read on demand);
- prior findings (rework rounds only);
- a fingerprint.

If the diff is over a size threshold, the slice is not reviewed. It is reported
as a planning defect ("slice too large").

**Output.** JSON: verdict, findings (`VALID` / `FALSE_POSITIVE` /
`SPEC_AMBIGUITY` / `NEEDS_HUMAN_DECISION`, each with a severity and evidence),
and AC coverage.

**Disputes.**

- **HIGH finding:** the Lead must fix it, unless a test proves it is a false
  positive. The driver re-reviews that test in the next round. If it is still
  unresolved after 2 rounds, it becomes tier 2.
- **MEDIUM finding:** the Lead may reject it with evidence. The rejection is
  recorded as tier 1.
- The Lead never lowers a severity the reviewer assigned.
- Any `SPEC_AMBIGUITY` or `NEEDS_HUMAN_DECISION` finding is tier 2.

## 9. Decision tiers

An agent may decide alone only when the decision meets all of these conditions:

- it is reversible on `auto`;
- it is backed by deterministic evidence;
- it does not change product intent (AC, scope, BMAD);
- the kernel already permits it.

| Tier | Handling | Cases |
|---|---|---|
| 0 Auto-fix | Fix, log only | Failing test, lint or type error (reproduce → regression → smallest fix); `VALID` in-scope finding; flaky check (one rerun, then treated as real); AGY technical failure (correction attempt on the same Task); `INTEGRATION_BUSY` (retry with backoff for up to 15 minutes) |
| 1 Decide and flag | Continue; listed in report §B | MEDIUM finding rejected as `FALSE_POSITIVE` with evidence; additive migration (new table or column) with rollback, inside the expected scope; `main` moved during the run (re-baselined) |
| 2 Park Story | Stop this Story, keep its branch, continue the queue; report §A | Any `SPEC_AMBIGUITY` or BMAD conflict; any file outside the expected scope, including test or helper files, or an undeclared hot path; auth, security or public-contract change the Plan did not foresee; destructive migration; new dependency, network access, credential or `.env`; budget exhausted (rework, 2 review rounds, ~3 identical repeats, Story minutes); unresolved HIGH dispute; reviewer `NEEDS_HUMAN_DECISION`; diff too large to review; Story-local environment failure (test DB, AGY trust or sign-in prompt); merge conflict or failed checks when integrating into `auto`; `INTEGRATION_BUSY` beyond 15 minutes; Plan digest mismatch |
| 3 Stop run | Stop all work; report §C | Preflight failure (pointer not `IDLE`, `test:v4` or `O` tests red on `auto`, registry lock held, authorization or manifest mismatch); guard hook blocked a forbidden action; tripwire violation; review ledger mismatch; `O` integrity or leak failure; authorization expired mid-run; environment failure on 2 consecutive Stories |

`STOP HUMAN_GATE` at `complete_story`, and `REVIEW_REQUIRED` on a reviewer-tier
slice, are not tier events: the driver handles them (§5, §8).

## 10. Report

Written at the end of the run to
`.agent-state/auto-runs/<run-id>/report.md` (for the owner) and `report.json`
(for the next run), in the auto worktree. Both are gitignored.

```markdown
# Auto run <date> — N Stories: x auto-done, y parked, z skipped
## A. Needs your decision (tier 2)   id · Story/slice · type · evidence (commits, diff, check logs)
                                      · options and consequences · recommendation · what it blocks
## B. Decisions the agents made (tier 1)   to spot-check before promote
## C. Run stopped (tier 3, if any)
## D. Stats   per Story: slices, rework rounds, review calls, minutes; owner-proxy actions; main moves seen
```

The owner answers in `.agents/auto/decisions/<run-id>.json`, committed on
`auto` by the owner. Its hash is passed to the next run as `--decisions-sha256`.
The next run resumes parked Stories from those answers through the normal
`autopilot-status` path. Answers are owner evidence and are never inferred from
chat.

## 11. Open items

1. **Backend recipe prerequisite.** Story 2.2 is blocked by
   `AUTOPILOT_POLICY_DENIED` / `VERIFICATION_NOT_APPROVABLE`, because canonical
   verification is `INCOMPLETE` without a backend recipe. The proxy hits the
   same refusal. A backend recipe must land on `main` first.
2. Promote implementation: a promote mode of `integrate-story.mjs` (K1), or a
   separate `promote-auto.mjs`.
3. Sync cadence from `main` to `auto`: automatically in preflight, or only on
   owner command.
4. Final schemas for the queue, authorization and decisions files, and the diff
   size threshold for review bundles.
5. **UNVERIFIED CLI behaviour, pinned in A2/A5:**
   - `claude -p` support for `--setting-sources` and its merge rules;
   - the headless reviewer spawn flags;
   - whether the guard can parse PowerShell and Git Bash commands reliably, or
     whether shell use must be narrowed to listed commands only.
6. **UNVERIFIED kernel details, checked in phase K:**
   - whether `recordSliceReview` accepts more than one review per attempt;
   - whether reconcile and finalize write outside `_bmad-output/`.

## 12. Build phases

| Phase | Content | Gate |
|---|---|---|
| A0 | Backend recipe on `main` (open item 1); owner closes open items 2–4 | Owner decision |
| K | Kernel capabilities K1–K7 on `main` | Tests per K: default behaviour unchanged on `main`; main-lane Story with a forged authorization file stays inert (K6); `record-review` refuses `subagent` (K2); `owner-proxy` provenance and history anchor (K3); `AUTO_DONE` releases resources and blocks claim (K5); default integration into `main` refuses `.agents/auto/**` and proxy approvals (K1) |
| A1 | `auto` worktree; overlay list and manifest; integrity and leak checks; sync with overlay and block restore; promote (prefix) | Tests: leak test; sync after promote keeps `O`; concurrent `main` edit to `AGENTS.md` survives sync; non-`O` conflict stops; `main` unchanged on failure |
| A2 | `claude-settings.json`, settings-source handling, `auto-guard.mjs`, hash checks | Tests: every deny and guard case blocks (Bash, PowerShell, Edit, Write); project-settings allow is overridden by deny; child owner-ops blocked; allowed Story and AGY delivery commands pass |
| A3 | Queue, authorization and decisions schemas, plus validator | Tests: digest, manifest, expiry and hash mismatch; dependency or overlap refusal; `.agents/**` diff refused at integration into `auto` |
| A4 | Driver: preflight, Story loop, owner proxy, tripwire, ledger, tiering, report writer | Tests: tier routing; park-and-continue; tier 3 stop; auto-ref move by non-driver; benign `main` move re-baselined; hook or config change; ledger mismatch; mid-run expiry revokes autopilot; refuse on `main` |
| A5 | Reviewer spawn, bundle builder, review policy counters | Tests: call matrix incl. MEDIUM Lead-authored; round cap; fingerprint reuse; only the driver records `subagent` |
| A6 | Pilot: one LOW/MEDIUM Story overnight, then a small batch, then a HIGH Story | Owner reviews the report and promotes manually |

Phase K passes the full `npm run test:v4` suite on `main`. A1–A5 pass it on
`auto`, together with the `O` tests. The lane may drive a Story only after K
and A1–A5 pass on the exact `auto` commit.

## 13. Risks

- **Same OS account.** Safety rests on anchors children cannot write
  (`refs/heads/auto` under the tripwire, the driver's memory). A guard parsing
  gap is the main residual risk (open item 5). The tripwire and ledger limit
  its damage to detection after one action.
- **AGY is outside the guard.** It is contained by the scope gate, hash checks,
  the tripwire, the ledger and the integration refusal, not prevented.
- **Owner proxy is self-approval under a grant.** Review quality on `auto`
  depends on the reviewer and on the promote review. `owner-proxy` provenance
  keeps that visible on `main`.
- **Large promote diffs.** Promote a prefix of `auto` when the batch is large.
- **Control-plane growth.** `ARCHITECTURE.md` §7 warns that the control plane is
  already larger than the product. K1–K7 must stay small and inert, and `O`
  must add no kernel logic.

## 14. Third review (2026-11-08): unresolved HIGH gaps

Recorded when the design was deferred and not fixed in revision 3. Address them
before any phase K work:

1. **The §8 reviewer flow does not match the kernel.**
   - `REVIEW_REQUIRED` is never persisted (`v4-action-kernel.mjs` `verifySliceCore`
     returns `pending` only to its caller).
   - `autopilot-status` does not infer verification substates.
   - `record-review` trusts the caller's `preview`/`pending`.

   Fix: the driver runs `prepare` and `verify` itself for reviewer-tier slices,
   keeps `pending` in memory, and maps the verdict to the kernel review schema.
2. **The review ledger covers only subagent reviews.** Owner operations are
   unfenced and do not identify the caller, so AGY could record a `human`
   review or approval that promote would carry to `main`.

   Fix:
   - the kernel refuses `human` evidence on verified lane Stories;
   - the driver ledgers every owner-proxy operation;
   - integration requires matching `owner-proxy` evidence.

The same review also raised MEDIUM items: `main` moves during a run feed into the
next sync; K2/K3 miss `check-story-finalization.mjs`, `check-artifact-contract.mjs`
and `complete-story.mjs` output; the integration refusal belongs in K1; the
ledger is lost on a crash; and the `main` history check raises false alarms.
