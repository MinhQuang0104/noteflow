# V4 Auto P5 — implementation plan: Story registry, claim, fencing

Design: `.agents/docs/v4-auto-design.md` §5 and §7 (pinned control plane).
Requires P3 and owner gate G3. Status: **READY AFTER G3**.

## 0. Phase rules

Follow `README.md` common rules. Registry state is runtime data in the Git
common directory, never committed.

## 1. Facts established from the code (do not re-derive)

- The V3 pointer is read from the **canonical** checkout
  (`pointer()` in `.agents/scripts/v4-lifecycle-transaction.mjs:56`), so it is
  already global; V4 only requires it `IDLE`. It holds one V3 run, not several
  V4 Stories. Keep using it unchanged as the V3 exclusion check.
- `storyCheckoutState` (same file, ~line 73) already binds a Story to the
  worktree whose branch contains `story-<epic>-<story>` (`WRONG_CHECKOUT`).
  The registry adds Lead identity, generation, state and pinned policy; it does
  not replace this check.
- Existing Git-common runtime directories and the atomic-create pattern:
  `noteflow-v4-transactions/` (`v4-slice-transaction.mjs:62–82`, lock created
  with `{ flag: 'wx' }` at ~line 337) and `noteflow-v4-lifecycle/`. Reuse the
  same `identity()`/common-dir resolution and `wx` creation.

## 1a. Findings from G3 (2026-10-09)

- **F-G3-1 (code, task T0).** `recordAutopilot` holds one repository-wide lock
  `<git-common-dir>/v4-autopilot-authority.lock`, and `autopilotStatus` →
  `recoveryPending` treats that file as recovery for **every** Story. While
  the owner authorized Story 99.3, Story 99.2's Lead got `STOP`
  `RECOVERY_REQUIRED` with no real recovery state.
- **F-G3-2 (vendor configuration, owner).** Codex on Windows wraps each command
  in `powershell.exe -Command "..."`; the `prefix_rule` allowlist did not stop
  the approval prompts (owner approved every few seconds). This needs a Codex
  profile or sandbox setting before parallel runs, not a code change here.
- **F-G3-3 (vendor configuration, owner).** Claude Code's auto-mode permission
  classifier blocked the `finalize_story` Runner call ("Merge Without Review")
  although `Bash(node .agents/scripts/*)` allows it; the owner ran it directly.

### T0 — Per-Story autopilot authority lock

Files: `v4-story-runner.mjs`, `v4-story-runner.test.mjs`.

- Name the lock per Story (`v4-autopilot-authority-<story-id>.lock`) and keep
  the recovery record's `lock_path` accurate.
- `recoveryPending(root, storyId)` checks only that Story's lock. Any lock
  still left under the old repository-wide name stops every Story with
  `RECOVERY_REQUIRED`, so nothing written before this change is lost.
- Test: while Story X's authorization lock exists, `autopilot-status` for
  Story Y returns `CONTINUE`, and Story X's status returns `RECOVERY_REQUIRED`.

## 2. Target behaviour

Registry root: `<git-common-dir>/noteflow-v4-runs/` with `stories/<story-id>.json`
(schema `story-run-v1`, fields per design §5) and `aborted/`. Claims are atomic;
every durable Lead write is fenced by `generation`; takeover is owner-only; the
Story runs on a pinned control-plane commit.

## 3. Tasks

### T1 — Registry library and CLI

New: `.agents/scripts/story-registry.mjs`, `story-registry.test.mjs`.

Commands (Runner exit table; one JSON object on stdout):

```text
claim <story-id> --worktree <path> --lead-vendor codex|claude --session <id>
      [--orca-run <id>] [--lead-terminal <h>] [--agy-terminal <h>]
claim <story-id> --takeover --lead-vendor <v> --session <id>     # owner only
heartbeat <story-id> --generation <n> --state <STATE>
status [--json]
release <story-id> --generation <n> --merged | --abort | --orphaned
```

- `claim`: requires pointer `IDLE`, `storyCheckoutState` READY for that
  worktree, a valid Plan; writes the record with `wx`; existing record →
  `CONFLICT` `STORY_ALREADY_CLAIMED` (with the holder). Records
  `controlPlaneCommit` = the worktree HEAD commit at claim, and `declaredScope` (P6 fills validation; in P5
  store the union of `slices[].scope.paths`, or `[]` when undeclared).
- `--takeover`: increments `generation`, records `{previous: {vendor, session,
  generation}, at}`; never automatic. Documented as owner-only.
- Writes after creation use write-to-temp + rename in the same directory, and
  compare-and-swap on `generation` (re-read, compare, write, re-read verify);
  mismatch → `STALE` `GENERATION_FENCED`.
- `heartbeat` updates `state`/`heartbeatAt` only; states as design §5.
- `status`: every record with derived flags `STALE?` (heartbeat older than the
  slice time budget), `ORPHANED` (worktree path missing), `WAITING_OWNER`
  (state `WAITING_HUMAN` or last autopilot-status STOP needing owner).
- `release --merged|--abort|--orphaned`: delete, move to `aborted/`, or (owner)
  remove an orphan. Abort never touches the worktree.
- Tests: concurrent claim race (two processes, one wins), takeover fences the
  old generation, orphan detection, malformed record → `INVALID` without
  deleting it, Windows paths.

### T2 — Fencing in the Runner and kernel

Files: `v4-story-runner.mjs`, `v4-action-kernel.mjs`, `v4-slice-transaction.mjs`
(+tests).

- When the Plan carries an autopilot authorization (P3), Runner operations
  require `--lead-generation <n>` and a registry record for the Story whose
  `generation` matches and whose `worktree` equals the current top level →
  else `BLOCKED` `REGISTRY_CLAIM_REQUIRED` / `STALE` `GENERATION_FENCED`.
- Transactions re-check the generation after acquiring their lock (same place
  P1 re-runs the scope gate).
- Without autopilot, the registry is not consulted (existing tests unchanged).
- `autopilot-status` reports `REGISTRY_CLAIM_REQUIRED` / `GENERATION_FENCED`
  as STOP reasons.

#### D-P5-a — Owner decision: Lead fencing boundary

Approved by the owner: generation fencing protects against a superseded Lead
and applies only to Lead writes under autopilot. This decision qualifies the
general Runner-operation requirement above.

- Runner pre-check and post-lock re-check fence `checkpoint`, `verify`,
  `record-review`, `prepare-rework` / `apply-rework`, and `finalize_story`.
- T2 also includes `v4-lifecycle-transaction.mjs` and `finalize-story.mjs`
  (+ their tests). An optional `assertFence` callback runs immediately after
  acquiring the lifecycle lock; absent that callback, existing behavior and
  evidence stay unchanged.
- Owner operations are never fenced: `--approve-exact-scope`, `complete_story`,
  `record-owner-review`, `--authorize-autopilot` / `--revoke-autopilot`, and
  owner or maintenance recovery operations. `complete-story.mjs` is unchanged.
- Read-only `prepare` and `autopilot-status` are not fenced; status still
  reports `REGISTRY_CLAIM_REQUIRED` / `GENERATION_FENCED` as STOP reasons.

### T3 — Pinned control plane

Files: `AGENTS.md` (Checkout safety paragraph), `references/autopilot.md`,
a helper in `story-registry.mjs` (+tests).

- `policy-drift <story-id>`: compares `AGENTS.md`, router, runner skill and
  `.agents/policies/orchestration-v3.md` at the Story's `controlPlaneCommit`
  with canonical `main`; returns `NONE` or `INFO_DRIFT` with paths. Never a stop.
- `AGENTS.md` Checkout safety: one sentence — a claimed V4 Auto Story compares
  against its pinned `controlPlaneCommit`; drift from canonical main is reported
  as information until integration. The existing rule stays for every other case.
- Keep Python-asserted strings; stop and report if one conflicts.

### T4 — Schema compatibility guard

- `story-registry.mjs` refuses records with an unknown `schemaVersion`
  (`INVALID` `REGISTRY_SCHEMA_UNSUPPORTED`) and keeps a reader table keyed by
  version, so a future v2 must add a reader or migration (design §7).
- Add an architecture test asserting every `schemaVersion` constant written by
  registry, receipts and Plan helpers has a reader.

### T5 — Docs

`references/autopilot.md`: claim before `authorize_autopilot`, pass
`--lead-generation`, heartbeat on state changes, release after merge, takeover
procedure. `v4-auto-design.md` §5: mark implemented.

## 4. Done

T1–T5 committed, full `test:v4` + Python green, README status updated. Do not
start P6.
