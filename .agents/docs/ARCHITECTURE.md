# Agent architecture — current-state map

**Purpose.** One place to understand the agent control plane as it runs today,
for comparing it with outside ideas, auditing it, or planning an upgrade,
without re-reading the repository. It is a map: each section points to the
authoritative file instead of restating it.

**Not runtime context.** No router, skill or action loads this file, and no
Story action should. Root `AGENTS.md`, `.agents/routing/task-router.md` and
the Runner contracts stay authoritative; if this file disagrees with them, they
win and this file is stale.

**Last verified:** 2026-11-07 against `main` at `fb11be3` (`npm run test:v4`
inventory: 805 test names).

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

## 3. Components

### Entry and routing

| File | Role |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | Always-loaded authority: roles, lanes, risk, Done Gate, checkout safety |
| `.agents/routing/task-router.md` | Picks the lane and the one module/action to load |
| `.agents/context/{control-plane,context-routing,verification-context}.md` | L1 modules for migration-lane work |
| `.agents/skills/v4-story-runner/SKILL.md` | Story entry: bootstrap, CLI contract, exit codes, shared invariants |
| `.agents/skills/v4-story-runner/actions/*.md` | One contract per action (`start`, `reconcile-lifecycle`, `implement`, `verify`, `finalize`, `complete`) |
| `.agents/skills/v4-story-runner/references/*.md` | Lazy: `autopilot`, `agy-executor`, `agy-transport`, `recovery`, `implementation-techniques` |

### Execution kernel (`.agents/scripts/`)

| Script | Role |
|---|---|
| `v4-story-runner.mjs` | CLI over the kernel: named operations, plan binding, `autopilot-status`, owner operations |
| `v4-action-kernel.mjs`, `v4-slice-transaction.mjs`, `v4-lifecycle-transaction.mjs` | Prepare/checkpoint with Git-common transaction locks, two-commit durability |
| `v4-metadata-recovery.mjs`, `finalization-recovery.mjs` | Explicit recovery paths (`RECOVERY_REQUIRED` is not replay permission) |
| `check-story-plan.mjs`, `v4-separated-plan.mjs` | Plan validation and freshness |
| `start-story.mjs`, `finalize-story.mjs`, `complete-story.mjs`, `reconcile-story-lifecycle.mjs` | Lifecycle actions |
| `compile-v4-context.mjs` | Per-action compiled projection (the main token saving) |

### Gates and policy

| Script / file | Decides |
|---|---|
| `check-slice-implementation.mjs`, `check-slice-verification.mjs` | Readiness and verification of a slice |
| `check-verification.mjs` + `.agents/verification/*.json` + `registry.json` | Recipe routing; `PASS` / `FAIL` / `INCOMPLETE` / `ERROR` |
| `check-feature-map.mjs` + `.agents/features/*.json` | Feature map anchors (self-invalidating on file change) |
| `check-escalation.mjs` | `NO_REVIEW` vs `REVIEW_REQUIRED` |
| `prepare-change-evidence.mjs` | Bounded diff evidence for review (≤4 paths, ≤240 lines) |
| `v4-review-policy.mjs` | Risk-tiered outcome (`PROGRESS`, `APPROVE_ALLOWED`, `REWORK`, `HUMAN_*`, `BLOCKED`) |
| `.agents/review/targeted-reviewer-contract.md` | How the Lead reviews (same Lead, supplied delta only) |
| `check-story-finalization.mjs`, `check-story-completion.mjs` | Finalization and Done Gate checks |

### Worker (AGY) path

| File | Role |
|---|---|
| `build-worker-contract.mjs` + `.agents/templates/worker-contract.md` | Contract from the compiled projection; scope = slice `scope.paths` |
| `references/agy-executor.md`, `references/agy-transport.md` | Orca terminal delivery, liveness, block routing, ≤3 corrections |
| `check-worker-scope.mjs --forbid-commits` | Mechanical scope gate after `worker_done` |
| `.agents/schemas/worker-*.schema.json` | Worker report/state shapes |

### Parallel Stories and integration

| File | Role |
|---|---|
| `story-registry.mjs` | claim / takeover / heartbeat / status / release / policy-drift |
| `story-scope.mjs` + `.agents/config/hot-paths.json` | Scope overlap and hot-path refusal, test-resource locks |
| `integrate-story.mjs` + `.agents/config/integration-checks.json` | Merge queue (full `test:v4` + completion check on the merge) |

### Measurement and advisory data

| File | Status |
|---|---|
| `benchmark-v4*.mjs`, `measure-v4-instruction-context.mjs`, `run-v4-architecture-corpus.mjs` | Instruction-byte and corpus measurement |
| `v4-experience.mjs`, `v4-evolution.mjs`, `v4-observations.mjs` | Built and tested, **dormant** (see §7) |

## 4. State and sources of truth

| Store | Location | Authority |
|---|---|---|
| Story, AC, product intent | `_bmad-output/` (BMAD) | Product truth |
| Plan (slices, scope, risk, executor, next action, autopilot) | Story Plan artifact | Work queue and durable decisions |
| Code and checkpoints | Git (implementation + metadata commits per checkpoint) | Implementation truth |
| Receipts | Plan/metadata receipts (implementation, verification, review, approval) | Evidence; immutable |
| Lifecycle | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Story status; written on the Story branch, merged at integration |
| Registry | `<git-common-dir>/noteflow-v4-runs/stories/<id>.json` (+ `aborted/`, locks, `integration/` logs) | Coordination only; contradiction → `RECONCILIATION_REQUIRED` |
| Transaction locks | `<git-common-dir>/noteflow-v4-transactions/` | Mutual exclusion |
| V3 pointer | `.agent-state/active-run.json` (canonical checkout) | Must be `IDLE` for Story work and migration lane |
| Worker runtime | `.agent-state/v4-auto/workers/…`, Orca task/dispatch | Ephemeral, gitignored |
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
- **Always manual:** `complete_story`, owner review, Human Gate, takeover,
  merge-conflict resolution, push.
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

## 7. Current state and known gaps

- **Delivered:** P1–P3, P2.1, P2.2, P5–P7, owner gates G1/G3/G5, perf campaign;
  Story 1-7 (per-worktree test runtime) done. Product: Epic 1 done, 2.1 and 2.3
  done, 2.2 ready-for-dev.
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
  - Control plane (~28.6k lines of scripts) is larger than the product it
    serves; new layers must justify their maintenance cost.
- **Historical:** `.agents/policies/orchestration-v3.md` and
  `v3-telemetry.md` remain for reading old runs only.

## 8. Where to read deeper

| Question | Read |
|---|---|
| Why V4 Auto looks like this | `.agents/docs/v4-auto-design.md` |
| How a phase was built and gated | `.agents/docs/v4-auto/README.md`, `p*.md`, `g*-runbook.md` |
| Kernel interface | `.agents/docs/v4-action-kernel.md` |
| Plan / receipt schema | `.agents/docs/v4-artifact-contract.md` |
| Benchmark, experience, evolution, observation | `.agents/docs/v4-*-contract.md` |
| V4 Lite origin and acceptance | `.agents/docs/v4-lite-migration.md`, `docs/agent-architecture/` |
| Test-suite performance | `.agents/docs/v4-auto/perf-*.md` |
| External ideas evaluated against this architecture | `docs/agent-research/README.md` (not authority) |
