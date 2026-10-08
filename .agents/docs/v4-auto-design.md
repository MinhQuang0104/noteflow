# V4 Auto — design proposal

## Status

**PROPOSED (2026-10-07).** Design record only; nothing here is runtime policy
until a phase lands through the V4 Lite migration lane with the full
`npm run test:v4` suite passing on its exact commit. Root `AGENTS.md`, the
router, and V3 policy remain authoritative until then.

## Objective

Automate Story delivery while keeping the token economy of both earlier
architectures:

- **From V4:** Plan/Git/receipt authority, compiled per-action context, exact
  scope, two-commit durability, recovery, and the deterministic Done Gate.
- **From V3.2:** the proven Antigravity (AGY) compat-terminal delivery, the
  mechanical scope gate, block routing, and the bounded correction loop, which
  removed the hang/sign-in failures of supervised injection.
- **New:** a Lead drives a whole Story without per-slice/per-step human approval;
  the human approves once per Story at the Human Gate, plus exceptions.

This is an upgrade of V4, not a new architecture: the V4 kernel already models
`implement_slice → verify_slice → finalize_story`; V4 Auto adds a worker
executor, a risk-tiered review policy, a per-Story driver loop, and a registry
for parallel Stories. V3 contributes transport, not authority.

## Decisions (owner, 2026-10-07)

| # | Decision |
|---|---|
| D1 | Upgrade of V4 ("V4 Auto"), not V5. |
| D2 | AGY implements; Codex/Claude Lead reviews. AGY model stays Gemini 3.8 Flash. |
| D3 | One Lead session per Story, kept for context; Plan/Git remain authority. |
| D4 | Lead vendor may be mixed: Codex or Claude per Story, switchable mid-Story. |
| D5 | Parallel Stories are opened manually by the owner in Orca; no master Lead. |
| D6 | Scope overlap between active Stories is a hard refusal (explicit override only). |
| D7 | Architecture work runs in parallel in its own worktree; it never waits for Stories to finish. Merge compatibility rules apply instead (§7). |

## 1. Target flow (one Story)

```text
owner opens Story in Orca (Lead terminal + AGY terminal, story worktree)
  → claim (registry, §5) → start_story (existing)
  → per slice:
      implement_slice[executor=agy]  (§2)
        Lead compiles context → writes contract → delivers to AGY → waits
        worker_done → scope gate → Lead checkpoint commit (two-commit)
      verify_slice                   (existing deterministic checks)
      review by policy tier          (§3)
        APPROVE → next slice
        CHANGES_REQUIRED (VALID findings) → correction contract, ≤3 attempts
        ambiguity / HIGH / gate failure → stop, ask owner
  → finalize_story → Human Gate (owner, once per Story)
  → integrate: lock → rebase → full checks → merge → lifecycle write → release
```

Successor execution changes from "persist one successor and stop" to "persist
one successor, then the same Lead session may execute it", bounded by the
budgets in §4. Each action still re-reads Plan/Git/receipts; the session's
memory is context, never evidence.

## 2. AGY executor for `implement_slice` (Phase P1)

`implement_slice` gains `executor: lead | agy`; `lead` keeps today's behaviour.
With `agy`:

1. Existing read-only gates run unchanged: `check-slice-implementation.mjs`,
   `compile-v4-context.mjs` must return `READY`.
2. **The slice must declare `scope.paths`.** `UNKNOWN` file scope blocks the
   `agy` executor (the compiler already refuses to infer an allowlist). The
   paths become the contract's expected scope and the scope gate's `--allow`.
3. The Lead builds a contract from `.agents/templates/worker-contract.md`
   using only the compiled projection (tasks, ACs, risk, anchors, checks), and
   dry-runs every verification command at the base.
4. Delivery follows the V3.2 recipe (orchestration-v3.md, "V3.2 Antigravity
   loop operations"): agy terminal → `tui-idle` → task-create → context-only
   dispatch → `.orca-contract/contract.md` → one-line send → `check --wait`.
   Liveness, permission and block-routing rules apply verbatim.
5. On `worker_done`: run `check-worker-scope.mjs --forbid-commits` with the
   contract SHA-256. AGY never commits; FAIL/INVALID/ERROR is never PASS.
6. The Lead creates the checkpoint and metadata commits through the existing
   Runner `prepare`/`checkpoint` operations; the implementation receipt records
   `executor: agy`, the Orca Task/Dispatch IDs, contract identity, worker
   report digest, and scope-gate result.

Corrections reuse the V3.2 bounded loop (task reopened to `ready`, same AGY
session, only VALID findings, ≤3 attempts) and produce a new checkpoint each.

## 3. Risk-tiered review (Phase P2)

**Implemented in P2 (advisory only).** The pure
[`decideReviewOutcome`](../scripts/v4-review-policy.mjs) policy is exposed as
`policy` on `verify` and `record-review` results; it does not change their
existing statuses, receipts, human stops, or authorize successor execution.
All P2 calls use `autopilot: false`; binding enforcement belongs to P3.
Independence is computed as `reviewer.type === 'lead'` with `executor: agy`,
not inferred from a caller's claim or vendor label.

| Tier | Gate after deterministic verification |
|---|---|
| LOW, complete canonical/focused PASS, no flags, no reviewer | `PROGRESS` (unchanged NO_REVIEW path). |
| MEDIUM, independent Lead, no open findings, complete PASS | `APPROVE_ALLOWED`. |
| MEDIUM, same Lead; HIGH, any Lead | `HUMAN_REVIEW_REQUIRED`. |
| HIGH, human reviewer, no open findings, complete PASS | `APPROVE_ALLOWED`. |
| Open `VALID` findings with complete PASS | `REWORK` at attempts 1–3; `HUMAN_REQUIRED` at attempt 4 or later. |
| Any `SPEC_AMBIGUITY` / `NEEDS_HUMAN_DECISION` | `HUMAN_REQUIRED`. |
| Failed/error/incomplete verification or focused coverage | `BLOCKED`; never approvable. |

Rules that do not change: Lead approval is never the Human Gate; Worker DONE is
never acceptance; `complete_story` still requires fresh exact-scope owner
approval.

P2 implements optional `slices[].risk: {level, flags}` bounded by the Story's
level and flags, immutable across checkpoint, verification, and rework.
Effective risk is the maximum of requested risk and the declared slice risk
(Story risk when absent); compiled context exposes the slice risk and source.
Absent slice risk preserves existing projection and receipt digests.

Structured reviewers carry `type`, `vendor`, and computed `independent`;
legacy strings remain readable and stored unchanged. Optional classified
findings reject `APPROVE` with open `VALID`, `SPEC_AMBIGUITY`, or
`NEEDS_HUMAN_DECISION` findings. Runner `record-owner-review` forces human
identity and requires the owner's explicit structured input; a Lead must
never call it on its own initiative. Ordinary `record-review` rejects a
human identity with `OWNER_REVIEW_OPERATION_REQUIRED`.

**P2 deviation and owner questions:** combinations omitted from the approved
table (including MEDIUM human reviews, flagged/reviewed LOW slices, and legacy
reviewer strings) conservatively return `HUMAN_REQUIRED` with
`POLICY_CASE_UNSPECIFIED`. **Settled by the owner on 2026-10-08:** see
[`v4-auto/p2-1-policy-completion.md`](v4-auto/p2-1-policy-completion.md) §1
(D-P2.1-a, D-P2.1-b), implemented in P2.1 before P3.
Also, `sliceReviewRequired` in `check-story-finalization.mjs` still uses Story
risk, so finalization requires review for a declared LOW slice in a
MEDIUM/HIGH Story even when verification used NO_REVIEW. That file is outside
P2's scope and remains unchanged. P3 is not started pending resolution.

## 4. Lead session and loop (Phases P3–P4)

- **One Lead session per Story** (D3). Context is kept for continuity; every
  action re-reads Plan, Git and receipts, and a summary/compaction is never
  evidence.
- **Session replacement:** on compaction, a context threshold, a crash, or a
  vendor switch, the owner starts a fresh session that resumes from the Plan
  (`claim --takeover`, §5). Replacement never repeats a durable action.
- **Waiting:** P3 uses in-session `orca orchestration check --wait`. P4 may
  replace it with a stateless driver that re-invokes the Lead per event
  (`claude -p --resume`, `codex exec resume`); token cost is similar, so P4 is
  justified only by robustness. P4 needs its own smoke test.
- **Budgets (stop and ask the owner when reached):** slices per session run,
  correction attempts per slice (3), wall-clock per slice, consecutive empty
  waits (V3.2 liveness rule).
- **Mixed vendors (D4):** both Leads load the same contract through
  `AGENTS.md` → router → `.agents/skills/v4-story-runner/` by file path (Claude
  does not auto-discover `.agents/skills/`). Each vendor needs its own
  allowlist for `orca orchestration *`, `node .agents/scripts/*`, and `git`; a
  per-vendor smoke test is part of P3. Receipts record `leadVendor`.

## 5. Story registry (Phase P5)

V4 code reads `active-run.json` from the canonical checkout (`pointer()` in
`v4-lifecycle-transaction.mjs`), so it is global, but it records a single V3 run
(`activeRunId`, `storyId`) and V4 only requires it to be `IDLE`; it cannot hold
several V4 Stories. Branch naming (`storyCheckoutState`, `WRONG_CHECKOUT`) already
ties a Story to one worktree, but records no Lead, generation or state. The
registry lives beside the existing V4 transaction locks in the Git common
directory, shared by every worktree:

```text
<git-common-dir>/noteflow-v4-runs/
  stories/<story-id>.json   # created with flag 'wx' = atomic claim
  aborted/                  # released-by-abort records, kept for audit
```

Record (schema `story-run-v1`):

```json
{
  "schemaVersion": 1,
  "storyId": "3.2",
  "generation": 1,
  "worktree": "<absolute path>",
  "branch": "story-3-2",
  "controlPlaneCommit": "<sha pinned at claim>",
  "lead": { "vendor": "codex|claude", "sessionId": "...", "claimedAt": "..." },
  "orca": { "runId": "...", "leadTerminal": "...", "agyTerminal": "..." },
  "state": "IMPLEMENTING|WAITING_WORKER|REVIEWING|WAITING_HUMAN|BLOCKED|INTEGRATING",
  "declaredScope": ["<repo-relative file or dir/>"],
  "overlapOverride": null,
  "heartbeatAt": "...",
  "planHead": "<sha>"
}
```

Rules:

1. **Coordination, not truth.** Plan and Git stay authoritative; a registry
   record that contradicts them yields `RECONCILIATION_REQUIRED` and stops.
2. **Fencing.** Every Lead write (checkpoint, review, integration) compares
   `generation`; a superseded Lead is refused.
3. **No automatic takeover.** Heartbeat is display-only (`STALE?` in status).
   Only the owner runs `claim <story> --takeover [--vendor <v>]`, which
   increments `generation` and records who replaced whom.
4. **Release.** Deleted after merge; `release --abort` keeps the worktree and
   moves the record to `aborted/`; a record whose worktree is gone shows
   `ORPHANED` and is cleaned only by the owner (`release --orphaned`).
5. **Old pointer.** `active-run.json` keeps governing V3 and the migration lane
   in its own checkout; V4 Auto Stories use the registry.

CLI sketch: `.agents/scripts/story-registry.mjs claim|status|heartbeat|release`
with the Runner exit-code table. `status` is the owner's dashboard: every
active Story, current slice, state, waiting-for-owner flags, stale/orphaned.

## 6. Scope overlap and hot paths (Phase P6)

- **Declared scope** = union of `slices[].scope.paths` in the Plan. A Plan
  without full slice scope cannot be claimed for V4 Auto.
- **Claim-time check (D6):** overlap with any active Story (path or directory
  prefix) is refused; `--allow-overlap "<reason>"` is owner-only and recorded.
  The check repeats before every AGY dispatch with the slice's scope.
- **Hot paths** live in a versioned file, `.agents/config/hot-paths.json`
  (changing it is an architecture change). A hot path may appear in at most one
  active Story's declared scope. Initial list, derived from the repository
  layout and the last 60 days of churn:

| Group | Paths |
|---|---|
| API contract (paired) | `contracts/openapi.yaml`, `frontend/src/api/schema.generated.ts` |
| Backend wiring | `backend/routes/api.php`, `backend/bootstrap/`, `backend/app/Providers/`, `backend/config/` |
| Database | `backend/database/migrations/`, `backend/database/seeders/` |
| Dependencies | `package.json`, `backend/composer.json`, `backend/composer.lock`, `frontend/package.json`, `frontend/package-lock.json` |
| Test infrastructure | `backend/phpunit.xml`, `backend/tests/Pest.php`, `backend/tests/TestCase.php`, `tests/e2e/playwright.config.ts`, `tests/e2e/helpers/` |
| Frontend shell | `frontend/src/main.ts`, `frontend/src/router/index.ts`, `frontend/src/App.vue`, `frontend/src/components/AppShell.vue` |
| Shared store | `frontend/src/stores/sync.ts` |
| Environment | `backend/.env.example`, `compose.local.yaml`, `deploy/` |
| Control plane (never in Story scope, no override) | `AGENTS.md`, `CLAUDE.md`, `.agents/` |
| Lifecycle (integration step only) | `_bmad-output/implementation-artifacts/sprint-status.yaml` |

- **Convention:** contract changes go in a Story's first slice and integrate
  early, so later work can run in parallel against the merged contract.
- **Test isolation:** Stories running backend/E2E checks concurrently need a
  per-worktree database or schema; until that exists, the claim refuses a
  second Story whose checks touch the shared dev DB.

## 7. Integration and architecture changes (Phase P6)

- **Merge queue:** after the Human Gate the Lead takes the Git-common lock,
  rebases onto `main`, runs the full product checks and `npm run test:v4`, merges,
  writes lifecycle (`sprint-status`), then releases. First finished, first
  merged; later Stories rebase onto the new `main`.
- **Pinned control plane (D7):** a Story runs on its `controlPlaneCommit`. A
  newer canonical policy is reported as information, not as a stop.
  `AGENTS.md` "Checkout safety" must be amended accordingly in P5. The Story
  adopts the new policy only when it rebases at integration, so the merge gate
  always runs under the latest `main`.
- **Compatibility:** registry, receipts and Plans carry `schemaVersion`. An
  architecture change that breaks a schema must ship a reader for the old
  version or a migration script, and must not merge while active records use
  the old version without that path. Non-breaking changes merge anytime.

## 8. Phases

Per-phase implementation plans: `.agents/docs/v4-auto/README.md`.

| Phase | Deliverable | Exit evidence |
|---|---|---|
| P1 | `agy` executor for `implement_slice`; contract built from compiled context; receipt fields | One LOW slice end to end, manual action-by-action; full `test:v4` |
| P2 | Risk-tiered Lead review; optional `slices[].risk` | MEDIUM slice approved by Lead with recorded independence; HIGH stops for owner |
| P3 | One Lead session drives a Story to the Human Gate; budgets; per-vendor allowlists | One Story completed with Codex Lead and one with Claude Lead |
| P4 | Optional stateless driver (`--resume` per event) | Separate smoke test; compare reliability with P3 |
| P5 | Registry + claim/takeover/fencing/status; pinned control plane; `AGENTS.md` changes | Two worktrees cannot claim the same Story; takeover fences the old Lead |
| P6 | Scope-overlap + hot-path checks; merge queue; DB isolation | Two independent Stories run in parallel and merge cleanly |
| P7 | Retire V3 as a standalone lane; keep its AGY transport as the adapter | Router/`AGENTS.md` shrink measured by `measure-v4-instruction-context` |

## 9. Open items

- Per-worktree database isolation approach (separate DB vs schema prefix).
- Exact budgets (slices per run, wall-clock per slice).
- Whether HIGH slices always need cross-vendor review or only on owner request.
- Supervised Orca `worker-start` remains broken (`agent_prompt_blocked`);
  re-test after Orca/AGY upgrades, compat-terminal stays the default.
- Orca always launches AGY with `--dangerously-skip-permissions`; guardrails are
  the worktree, contract scope, scope gate, and Lead diff review.
