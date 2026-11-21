# Agent architecture — current-state map

**Purpose.** One place to understand the agent control plane as it runs today,
for comparing it with outside ideas, auditing it, or planning an upgrade,
without re-reading the repository. It is a map: each section points to the
authoritative file instead of restating it.

**Not runtime context.** No router, skill or action loads this file, and no
Story action should. Root `AGENTS.md`, `.agents/routing/task-router.md` and
the Runner contracts stay authoritative; if this file disagrees with them, they
win and this file is stale.

**Last verified:** 2026-11-21 against `main` at `6139549` (`npm run test:v4`
inventory: 842 test names).

**Maintenance rule.** Any V4 Lite migration-lane change that adds, removes or
re-scopes a component, gate, state store or decision updates this file in the
same change, including the "Last verified" line.

---

## 1. One-page overview

| Name | Meaning here |
|---|---|
| V3 / V3.1 / V3.2 | Earlier Orca + worker orchestration with leases and generations. **Retired as a lane in P7**; its AGY transport survives as a V4 reference. Historical runs stay readable. |
| V4 Lite | Token-lean Story execution: router → bounded context → one action → deterministic checks → risk-based review. |
| V4 Auto | V4 plus AGY executor, risk-tiered review policy, owner-granted autopilot, Story registry and merge queue (phases P1–P7, merged 2026-10-11). |

Roles:

| Role | Who | Owns |
|---|---|---|
| Owner | the human | Product intent (BMAD), autopilot authorization, Human Gate, `complete_story`, takeover, conflicts |
| Lead | Codex or Claude, mixable per Story, switchable mid-Story | Routing, context compile, scope gate, checkpoints, verification, review, integration command |
| Worker | Antigravity (AGY, Gemini 3.8 Flash) via Orca terminal | Implementing one `executor: agy` slice inside its contract; never commits, never accepts |
| Orca | desktop orchestrator | Worktrees, terminals, task/dispatch messaging to AGY |
| Overnight driver | `v4-overnight.mjs` plus one headless `claude -p` child per action | Replaces the owner typing "continue" between autopilot steps; heartbeat, night tripwire, morning report; never runs owner operations, never integrates, never pushes |

Principles that shape everything else:

1. **State lives in artifacts, not chat.** Plan, Git, receipts, sprint status
   and the registry are evidence; session memory and summaries never are.
2. **Deterministic gates before model judgment.** Scripts decide scope,
   escalation, verification and policy; the model reviews only what they flag.
3. **One writer per Story.** One Lead generation writes; AGY works in an
   isolated worktree under a mechanical scope gate.
4. **Human attention is the scarce resource.** The owner approves once per
   Story at the Human Gate, plus exceptions.
5. **Lazy context.** Always-loaded files stay small; everything else is a
   reference loaded only by the action that needs it.

## 2. Story flow

```text
owner opens Story worktree (story-<epic>-<story>) in Orca
  → story-registry claim (generation n, pinned controlPlaneCommit)
  → [optional] owner authorize_autopilot (budgets, bound to Plan digest + HEAD)
  → start_story            lifecycle commit, Plan becomes the work queue
  → per slice:
      implement_slice      executor lead | agy
                           agy: contract → Orca dispatch → worker_done
                                → check-worker-scope → Lead checkpoint
      verify_slice         deterministic checks → escalation → review policy
                           LOW clean → NO_REVIEW → verified
                           MEDIUM + independent Lead → APPROVE_ALLOWED
                           VALID findings → rework (≤3) → else HUMAN_REQUIRED
                           HIGH / ambiguity / failed checks → stop for owner
  → finalize_story         stops at review / Human Gate
  → owner approve_exact_scope + complete_story (manual, never autopilot)
  → integrate-story        lock → scratch --no-ff merge → integration checks
                           → fast-forward main → release claim (never pushes)
```

Without autopilot, each invocation runs one action and persists at most one
successor without executing it. With autopilot, the Lead loops on
`autopilot-status` while it returns `CONTINUE`.

If owner-approved Plan maintenance adds scope paths after the claim, the claim's
`declaredScope` stays frozen (AGY dispatch reports `SCOPE_UNDECLARED`) until the
owner runs the additive `story-registry refresh-scope`; takeover does not
refresh it.

Overnight variant (`v4-overnight.mjs`, design in
`v4-overnight-runner-design.md`): the owner runs `prepare` in the evening
(validate Plan and recipe coverage → Orca worktree from `main` → claim →
`start_story` → print the `--authorize-autopilot` command for the owner to
run). `run` then loops `autopilot-status` per Story unattended, spawning one
restricted `claude -p` child per `CONTINUE` action, and checks the night
baseline after each child. Every human stop, the Human Gate, `complete_story`
and `integrate-story` stay with the owner in the morning.

## 3. Components

### Entry and routing

| File | Role |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | Always-loaded authority: roles, lanes, risk, Done Gate, checkout safety |
| `.agents/routing/task-router.md` | Picks the lane and the one module/action to load |
| `.agents/context/{control-plane,context-routing,verification-context}.md` | L1 modules for migration-lane work |
| `.agents/skills/v4-story-runner/SKILL.md` | Story entry: bootstrap, CLI contract, exit codes, shared invariants |
| `.agents/skills/v4-story-runner/actions/*.md` | One contract per action (`start`, `reconcile-lifecycle`, `implement`, `verify`, `finalize`, `complete`) |
| `.agents/skills/v4-story-runner/references/*.md` | Lazy: `autopilot`, `agy-executor`, `agy-transport`, `recovery`, `implementation-techniques`, `runner-payloads` (payload recipes for `implement_slice` / `verify_slice`, also named by the overnight child prompt; not authority) |

### Execution kernel (`.agents/scripts/`)

| Script | Role |
|---|---|
| `v4-story-runner.mjs` | CLI over the kernel: named operations, plan binding, `autopilot-status`, owner operations |
| `v4-action-kernel.mjs`, `v4-slice-transaction.mjs`, `v4-lifecycle-transaction.mjs` | Prepare/checkpoint with Git-common transaction locks, two-commit durability |
| `v4-check-executor.mjs` | Runs a slice's check specs against a captured worktree subject and validates the check evidence (used by the kernel) |
| `v4-metadata-recovery.mjs`, `finalization-recovery.mjs` | Explicit recovery paths (`RECOVERY_REQUIRED` is not replay permission) |
| `check-story-plan.mjs`, `v4-separated-plan.mjs` | Plan validation and freshness |
| `check-artifact-contract.mjs` | Plan/receipt contract per `v4-artifact-contract.md`: normative digest, receipt digests, receipt reads per attempt (worker binding taken from the slice, F-41-2), the Plan-obligation evidence ledger (`validateObligationEvidence`) and versioned rework-receipt reads (`readReworkReceipt`) |
| `v4-finalization-contract.mjs` | Shared review contract: review decisions, evidence-ref order and `scope_digest` freshness (one evidence set or consecutive split sets, F-41-1), canonical-verification applicability (incl. multi-recipe aggregates) |
| `finalization-contract.mjs` | Finalization receipt validation and completion-block rendering for finalize / completion checks |
| `start-story.mjs`, `finalize-story.mjs`, `complete-story.mjs`, `reconcile-story-lifecycle.mjs` | Lifecycle actions |
| `compile-v4-context.mjs` | Per-action compiled projection (the main token saving) |

### Gates and policy

| Script / file | Decides |
|---|---|
| `check-slice-implementation.mjs`, `check-slice-verification.mjs` | Readiness and verification of a slice |
| `check-verification.mjs` + `.agents/verification/*.json` + `registry.json` | Recipe routing; `PASS` / `FAIL` / `INCOMPLETE` / `ERROR` |
| `check-feature-map.mjs` + `.agents/features/*.json` | Feature map anchors (self-invalidating on file change) |
| `check-escalation.mjs` | `NO_REVIEW` vs `REVIEW_REQUIRED` |
| `prepare-change-evidence.mjs` | Bounded diff evidence for review (≤4 inline paths; an evidence set holds ≤16 paths, units ≤240 lines). A larger review carries 2–8 consecutive sets (≤128 paths, F-41-1) |
| `v4-review-policy.mjs` | Risk-tiered outcome (`PROGRESS`, `APPROVE_ALLOWED`, `REWORK`, `HUMAN_*`, `BLOCKED`) |
| `.agents/review/targeted-reviewer-contract.md` | How the Lead reviews (same Lead, supplied delta only) |
| `check-story-finalization.mjs`, `check-story-completion.mjs` | Finalization and Done Gate checks |

### Worker (AGY) path

| File | Role |
|---|---|
| `build-worker-contract.mjs` + `.agents/templates/worker-contract.md` | Contract from the compiled projection; scope = slice `scope.paths` |
| `.agents/skills/v4-story-runner/references/agy-executor.md`, `agy-transport.md` | Orca terminal delivery, liveness, block routing, ≤3 corrections |
| `check-worker-scope.mjs --forbid-commits` | Mechanical scope gate after `worker_done` |
| `move-worker-contract.mjs` | K7 helper: after the scope gate passes, moves the delivered `.orca-contract/contract.md` to `.agent-state/v4-auto/workers/<task-id>/contract-attempt-<n>.md`; refuses to overwrite attempt evidence. Replaces the inline `node -e` move (`agy-executor.md` step 6) so overnight children need no `node -e` |
| `.agents/schemas/worker-*.schema.json` | Worker report/state shapes |

### Parallel Stories and integration

| File | Role |
|---|---|
| `story-registry.mjs` | claim / takeover / heartbeat / status / release / policy-drift / `refresh-scope` (owner only: additive re-derive of `declaredScope` and resources from the committed Plan, keeps the generation, appends `scopeRefreshes`) |
| `story-scope.mjs` + `.agents/config/hot-paths.json` | Scope overlap and hot-path refusal, test-resource locks (`scripts/local.ps1 test` no longer infers `backend-test-db`; raw backend runners and `e2e-db` still do) |
| `integrate-story.mjs` + `.agents/config/integration-checks.json` | Merge queue (full `test:v4` + completion check on the merge) |

### Overnight queue runner (`.agents/scripts/`)

| File | Role |
|---|---|
| `v4-overnight.mjs` | Driver. `prepare` (owner present): per queued Story refuse a missing Plan, uncovered recipe paths or an existing worktree, then Orca worktree → claim → `start-story` → `npm ci` where needed → print the authorize command. `run` (unattended): preflight, sequential per-Story loop on `autopilot-status`, one child per action, heartbeat, baseline check, `NO_PROGRESS` stop, deadline, report |
| `.agents/config/overnight-settings.json` | Child permission allowlist and deny list (owner operations, `refresh-scope`, destructive git, `node -e`, network installs, `.env` reads, Edit of `.agents/**`, `.claude/**`, `_bmad-output/**`). Used with `claude -p --restricted --permission-prompts none`; its hash is part of the night baseline |
| `move-worker-contract.mjs` | K7, the only kernel addition for the runner (see Worker path) |

### Measurement and advisory data

| File | Status |
|---|---|
| `benchmark-v4*.mjs`, `measure-v4-instruction-context.mjs`, `run-v4-architecture-corpus.mjs` | Instruction-byte and corpus measurement |
| `v4-experience.mjs`, `v4-evolution.mjs`, `v4-observations.mjs` | Built and tested, **dormant** (see §7) |
| `v4-test-inventory.mjs`, `.agents/scripts/v4-test-names.json` | `test:v4` name-inventory guard (committed list of top-level test names) |

Test fixtures (`*-fixture.mjs`, `v4-test-helpers.mjs`, `v4-test-seed-cache.mjs`)
are test support, not components. `v4-verification-fixture.mjs` is one of them
(it imports `node:assert`), but `references/runner-payloads.md` cites its
`verificationTemplate` as the model `plan_template` for a review record.

### Companion tool outside this repo: Agent Desk

**Agent Desk** is a separate repository, [`UI_Tool_Agent_Architecture`](https://github.com/MinhQuang0104/UI_Tool_Agent_Architecture)
(`agent-desk`, Node ≥ 20, Vue without a build step). It gives the owner a local
web UI on `http://127.0.0.1:4777` for Human Gate and owner-review work. The
control plane does not load, call or depend on it, and nothing in this repo
references it except this section. This entry was added on 2026-11-15 and
refreshed on 2026-11-21 from the tool's `main` at `606280a`; per-feature tasks
and result reports are in its `docs/tasks/`.

| Aspect | What it does |
|---|---|
| Attachment | Its `config.json` sets `projectPath` to this repo's main worktree and `baseBranch: main`; it lists every worktree from `git` |
| Diff review | Working, base-branch, unpushed and commit-range diffs (diff2html); the browser's `localStorage` keeps a per-file "viewed" mark |
| Inbox | Reads Story Plans and receipts under `_bmad-output/implementation-artifacts/` and `.agent-state/overnight/*/report.json` to list owner stops: owner review, Human Gate, BLOCKED, ready-to-complete, overnight stops |
| Owner-review detection | A slice counts as waiting for owner review when the slice needs an owner review, is `checkpointed` with baseline and checkpoint commits, and the Plan's `next_action` is `verify_slice` for it, **plus** one signal that verify finished: an overnight `report.json` stop `HUMAN_REVIEW_REQUIRED` (or `HUMAN_STOP` with that reason) for the same slice, or a review payload already in scratch. Without a signal it is only "awaiting verify". The kernel writes `verification` only together with `review`, so the Plan alone never shows this state |
| Owner commands (copy only) | For Human Gate (read-only `check-story-completion` preview, then `--approve-exact-scope`), ready-to-complete and `record-owner-review`, it prints Runner commands locked to the Story worktree's full HEAD SHA and rechecks HEAD before each copy. **It never runs them.** For `record-owner-review` it looks for a Lead-prepared payload in `<worktree>/.agent-state/v4-scratch/` and checks it statically (expected head, sorted scope paths against the slice diff, judgment, one answer per question, required fields, draft answers flagged); with no payload it offers a Lead prompt to copy instead |
| Deterministic hints | Recomputes risk, verification status, out-of-scope paths, unevidenced obligations and sensitive or untested areas from those artifacts |
| Line comments → findings | Exports comments as kernel-shaped findings JSON (`HIGH/MEDIUM/LOW`, `VALID/FALSE_POSITIVE/SPEC_AMBIGUITY/NEEDS_HUMAN_DECISION`) or Markdown for a Lead prompt; stores them in the tool's own `data/reviews/` |
| AGY analysis (on click only) | Launches a fresh AGY session through `orca agent launch`, **in the tool repo, not a project worktree**, using the tool's own skill `agent-desk-diff-analysis`. The server first builds a diff bundle (manifest and diff packs) in the tool's `data/analyses/<id>/bundle/`, so AGY needs few tool calls; it reads the project with `git -C` and warns if the project's `git status` changes during the run |
| Agent status | Shows working / waiting for you / turn done / background / offline per agent from Orca's hook state (`orca agent list`), with the rendered screen (`orca terminal read --screen`) as fallback; browser notifications on transitions. Read-only: it sends nothing to terminals |
| Architecture tab | Draws the Story flow from this file, mapped by heading text in its `maps/architecture.json`. It reads only the committed `main` (`git show` / `cat-file` / `log`), never the working tree, and reports commits under `.agents` since **Last verified** and changed scripts that §3 does not name. It opens only `.md` files under `.agents/docs/`, `.agents/skills/v4-story-runner/`, `.agents/review/`, `.agents/templates/`, `docs/agent-research/`, plus `AGENTS.md` and `CLAUDE.md` |
| Terminals | Streams `orca terminal read` over SSE and can send prompts to Orca terminals |

Boundaries:

- **Read-only on this repo.** Its only write path into the agent world is
  typing into an Orca terminal. Requests that send input need `Host` set to
  `127.0.0.1`/`localhost`, an `X-Agent-Desk: 1` header and a matching `Origin`.
- **Advisory, never evidence.** Its hints, AGY points and comments do not
  replace Plan, receipts, `check-*` gates or the Human Gate. A finding becomes
  real only after a Lead records it through the Runner.
- **Not pinned.** The tool parses Plan frontmatter, receipts, overnight
  reports and scratch payloads directly. A change to `v4-artifact-contract.md`,
  the overnight report shape or the `record-owner-review` payload can break its
  Inbox, hints or owner commands silently; no test here covers that.
- **Coupled to this file's shape.** The architecture tab matches the headings
  `## 2. Story flow`, `### Gates and policy`, `### Worker (AGY) path`,
  `### Parallel Stories and integration`, reads §3 from `## 3. Components` to
  `## 4. State`, skips the subsection whose title starts with "Companion tool",
  takes backticked paths from the first column of §3 tables (a bare name
  resolves against the directory in the subsection title), and parses the
  **Last verified** line. Renaming any of these needs the matching change in
  its `maps/architecture.json` or parser.

## 4. State and sources of truth

| Store | Location | Authority |
|---|---|---|
| Story, AC, product intent | `_bmad-output/` (BMAD) | Product truth |
| Plan (slices, scope, risk, executor, next action, autopilot) | Story Plan artifact | Work queue and durable decisions |
| Code and checkpoints | Git (implementation + metadata commits per checkpoint) | Implementation truth |
| Receipts | Plan/metadata receipts (implementation, verification, review, approval, and `<slice>-rework-attempt-<n>.json` with the CHANGES_REQUIRED findings, committed by `apply-rework`) | Evidence; immutable |
| Lifecycle | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Story status; written on the Story branch, merged at integration |
| Registry | `<git-common-dir>/noteflow-v4-runs/stories/<id>.json` (+ `aborted/`, locks, `integration/` logs); a record keeps `declaredScope`, resources and any owner `scopeRefreshes` | Coordination only; contradiction → `RECONCILIATION_REQUIRED` |
| Transaction locks | `<git-common-dir>/noteflow-v4-transactions/` | Mutual exclusion |
| V3 pointer | `.agent-state/active-run.json` (canonical checkout) | Must be `IDLE` for Story work and migration lane |
| Worker runtime | `.agent-state/v4-auto/workers/…` (incl. moved `contract-attempt-<n>.md`), Orca task/dispatch | Ephemeral, gitignored |
| Overnight runtime | Canonical checkout `.agent-state/overnight/`: owner's `queue.json`, prepared Stories in `state.json`, per run `<run-id>/report.md`, `report.json` (for tooling) and `child-*.json` | Gitignored. The report is a summary for the owner, not evidence; a child's `OVERNIGHT_RESULT` line is untrusted and only ever stops a Story |
| Lead payload scratch | Story worktree `.agent-state/v4-scratch/` (payload files; the overnight child prompt falls back to `rework-<e>-<s>-<slice>.json` here only for a rework applied before rework receipts existed) | Gitignored working files; never evidence until the Runner accepts them |
| Session memory | Claude/Codex chat, Claude auto memory | Never evidence |

## 5. Invariants and gates

- **Plan validation and freshness** before any action; `STALE` / `INVALID` stop.
- **Exact scope:** only declared paths are staged; AGY scope gate rejects
  anything else (`INVALID` / `ERROR` are never `PASS`).
- **Two-commit durability** with transaction locks; recovery preserves
  partial work.
- **Fencing:** Lead writes under autopilot check `generation` before acting and
  after taking the lock; owner operations are never fenced.
- **Risk tiers** (`AGENTS.md`): LOW / MEDIUM / HIGH decide evidence depth and
  review; slice risk can only be lower-or-equal to the Story's and is immutable.
- **Done Gate:** every AC evidenced, fresh deterministic checks, exact diff,
  no open HIGH/MEDIUM issue, synced lifecycle, Human Gate for exact scope.
- **Plan obligations are evidenced:** every `APPROVE` (Lead or owner review)
  and every LOW `NO_REVIEW` pass carries an `obligation_evidence` ledger, one
  entry per Plan verification obligation, citing a PASS check or an exit-0
  review command; otherwise `PLAN_OBLIGATION_UNEVIDENCED` and nothing is
  written. It stops an omitted obligation, not a falsified command result.
- **Rework is recorded:** `apply-rework` commits the CHANGES_REQUIRED findings
  in a rework receipt with the Plan; `CHANGES_REQUIRED` alone persists nothing.
- **Claim scope is frozen at claim.** Only the owner's additive
  `refresh-scope` widens it, after a committed Plan maintenance change.
- **Always manual:** `complete_story`, owner review, Human Gate, takeover,
  `refresh-scope`, merge-conflict resolution, push.
- **Overnight tripwire:** `run` records `refs/heads/main` and canonical status,
  human evidence in each prepared Story's Plan and receipts, registry
  generation and holder, and settings and hook hashes; any change after a child
  action stops the whole run. Children never get `--dangerously-skip-permissions`.
- **Always disabled:** automatic approval, automatic review-to-done,
  `review_slice`, generic continuation, automatic V3 fallback, automatic
  takeover.
- **Pinned policy:** a claimed Story runs on its `controlPlaneCommit`; drift
  from `main` is information until integration.
- **Merge, never rebase** at integration, so approval SHAs stay valid.

## 6. Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-09 | V4 Lite replaces eager V3 context with router + lazy modules; deterministic verification and escalation | `v4-lite-migration.md` |
| 2026-10-07 | D1 upgrade of V4 ("V4 Auto"), not V5 | `v4-auto-design.md` |
| 2026-10-07 | D2 AGY implements, Codex/Claude Lead reviews; AGY stays on Gemini 3.8 Flash | same |
| 2026-10-07 | D3 one Lead session per Story; Plan/Git stay authority | same |
| 2026-10-07 | D4 Lead vendor mixable and switchable | same |
| 2026-10-07 | D5 owner opens parallel Stories manually; no master Lead | same |
| 2026-10-07 | D6 scope overlap is a hard refusal (explicit override only) | same |
| 2026-10-07 | D7 architecture work runs in its own worktree in parallel | same |
| 2026-10-08 | D-P2.1-a/b review-table completion; LOW `NO_REVIEW` slices are final-ready | `v4-auto/p2-1-policy-completion.md`, `p2-2-no-review-finalization.md` |
| 2026-10-08 | Claude allowlist lives in `.claude/settings.json`; Codex rules in user config | `references/autopilot.md` |
| 2026-10-09 | D-P5-a Lead-only fencing; owner and recovery exempt | `v4-auto/p5-story-registry.md` |
| 2026-10-10 | Shared test DB serialized by resource locks; per-worktree DB via Story 1-7 | `v4-auto/p6-parallel-integration.md` |
| 2026-10-11 | P7 retires the V3 lane; AGY transport kept as reference | `v4-auto-design.md` §8 |
| 2026-10-24 | `test:v4` split + `--test-concurrency=8`; name-inventory guard; T2.3–T2.7 deferred | `v4-auto/README.md` status |
| 2026-10-25 | Do not add long-term agent memory; experience store stays dormant | owner discussion (not recorded elsewhere) |
| 2026-11-08 | Build the overnight queue runner MVP (every human stop kept); the fully automatic `auto` branch lane is deferred to stage 2, revisited only with MVP run data | `v4-overnight-runner-design.md` Status, `v4-auto-lane-stage2-deferred.md` |
| 2026-11-08 | M0-1 backend verification recipes are written on demand at Story planning time on `main`, before `start_story`; `prepare` refuses uncovered slice paths | `v4-overnight-runner-design.md` §7 |
| 2026-11-08 | M0-2 after a concurrency smoke, `scripts/local.ps1 test` no longer infers `backend-test-db`; `e2e-db` stays | same §7; `references/agy-executor.md` |
| 2026-11-08 | M0-3 `prepare` creates Story worktrees through Orca | same §7 |
| 2026-11-14 | Claims widen only through the owner-only, additive `refresh-scope`; the Lead never runs it | `references/autopilot.md` |
| 2026-11-21 | Approval needs evidence for every Plan verification obligation (kernel, not prompt), closing the M3 run 6 gap | `v4-overnight-runner-design.md` §10.5; `references/runner-payloads.md` |
| 2026-11-21 | A rework is a recorded decision: `apply-rework` commits a rework receipt with the findings | same §11.4; `references/agy-executor.md` |

## 7. Current state and known gaps

- **Delivered:** P1–P3, P2.1, P2.2, P5–P7, owner gates G1/G3/G5, perf campaign;
  Story 1-7 (per-worktree test runtime) done; overnight runner M0–M2b built and
  M3 pilot done (Story 4.1). Product (`sprint-status.yaml`): Stories 1-1…1-7,
  2.1–2.3, 4.1 and 4.2 done; the rest backlog.
- **Overnight M4 open:** Story 4.2 gave six runs (`v4-overnight-runner-design.md`
  §11). The owner has not decided whether that completes the roughly five M4
  runs or a LOW / AGY-heavy Story is still needed; the stage 2 decision waits
  on it. Of the candidate improvements in §10.5 and §11.4, the obligation
  ledger, rework receipts (both 2026-11-21) and the `reviewer.type` docs fix
  are built; the rest are not decided.
- **Optional, not built:** P4 stateless driver (re-invoke Lead per event).
- **Dormant:** experience / evolution stores have produced zero entries;
  observation hooks stopped recording after 2026-09-30.
- **Open items** (`v4-auto-design.md` §9): exact autopilot budgets; whether HIGH
  needs cross-vendor review; Orca `worker-start` still blocked
  (`agent_prompt_blocked`), so compat-terminal stays the default.
- **Known weak points:**
  - Orca launches AGY with `--dangerously-skip-permissions`; containment is the
    worktree, contract scope, scope gate and Lead review, not a sandbox.
  - Review is same-Lead (no clean-context reviewer subagent yet).
  - Human Gate means reading the diff; there is no decision bundle or
    Playwright screenshot evidence for frontend Stories.
  - Hot paths (`openapi.yaml`, `routes/api.php`, migrations) limit real
    parallelism; contract changes should land in a first slice and merge early.
  - Unattended review missed a defect twice (M3 run 6, M4 F-42B-3); owner or
    independent Lead review caught both. The kernel now refuses an approval
    with a Plan obligation unevidenced (2026-11-21), but it cannot detect a
    review that simply misses a defect.
  - Overnight: the slice time budget measures wall clock (idle nights count)
    and has no extend operation; the driver reports a crashed child as
    `NO_PROGRESS`; children share the owner's usage limit; owner work on
    `main` during a run stops it.
  - Control plane (~30.2k lines of `.agents/scripts/*.mjs`, tests included) is
    larger than the product it serves; new layers must justify their
    maintenance cost.
- **Historical:** `.agents/policies/orchestration-v3.md` and
  `v3-telemetry.md` remain for reading old runs only.

## 8. Where to read deeper

| Question | Read |
|---|---|
| Why V4 Auto looks like this | `.agents/docs/v4-auto-design.md` |
| Overnight queue runner MVP (built; M3 pilot in §10, M4 Story 4.2 data in §11) | `.agents/docs/v4-overnight-runner-design.md`; driver `.agents/scripts/v4-overnight.mjs`, child settings `.agents/config/overnight-settings.json` |
| How to build Runner payloads (Lead and overnight children) | `.agents/skills/v4-story-runner/references/runner-payloads.md` (not authority) |
| Deferred fully-automatic `auto` branch lane (stage 2) | `.agents/docs/v4-auto-lane-stage2-deferred.md` |
| How a phase was built and gated | `.agents/docs/v4-auto/README.md`, `p*.md`, `g*-runbook.md` |
| Kernel interface | `.agents/docs/v4-action-kernel.md` |
| Plan / receipt schema | `.agents/docs/v4-artifact-contract.md` |
| Benchmark, experience, evolution, observation | `.agents/docs/v4-*-contract.md` |
| V4 Lite origin and acceptance | `.agents/docs/v4-lite-migration.md`, `docs/agent-architecture/` |
| Test-suite performance | `.agents/docs/v4-auto/perf-*.md` |
| External ideas evaluated against this architecture | `docs/agent-research/README.md` (not authority) |
| Owner review UI (Agent Desk, separate repo) | [`UI_Tool_Agent_Architecture`](https://github.com/MinhQuang0104/UI_Tool_Agent_Architecture): `README.md`, `DESIGN-BRIEF.md`, `docs/tasks/` |
