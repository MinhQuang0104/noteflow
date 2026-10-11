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
  → owner complete_story (done)
  → integrate: lock → scratch merge → full checks → fast-forward main → release
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

**P2.1 complete.** The owner decisions in [the P2.1 completion record](v4-auto/p2-1-policy-completion.md) §1 are binding; the completed policy table there records the resolved review cases and finalization behavior.

**D-P2.1-b complete end to end in [P2.2](v4-auto/p2-2-no-review-finalization.md).** A `verified` slice is final-ready without review only when its verification receipt records `NO_REVIEW` at `LOW` and the Plan adds no review requirement; the schema-v2 review state, finalization and completion accept it, and a regression test drives it from implement to `done` through the real kernel and Runner.

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

**Implemented:** `.agents/scripts/story-registry.mjs` provides claim, explicit
owner takeover, heartbeat, status, release and `policy-drift`. Registry records
use a version-keyed reader table; unknown schemas are refused without deleting
the record. Claims pin `controlPlaneCommit`, and policy drift from canonical
`main` is informational until integration. Declared scope is stored in P5;
overlap validation and integration remain P6.

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
2. **Fencing (D-P5-a).** Lead writes under autopilot (`checkpoint`, `verify`,
   `record-review`, `prepare-rework` / `apply-rework`, `finalize_story`) compare
   `generation` before acting and after acquiring the transaction lock; a
   superseded Lead is refused. Owner operations and recovery are never fenced.
   Read-only prepare and status are not fenced; autopilot status still reports
   missing claims or superseded generations as STOP reasons.
3. **No automatic takeover.** Heartbeat is display-only (`STALE?` in status).
   Only the owner runs `claim <story> --takeover --lead-vendor <v> --session <id>`, which
   increments `generation` and records who replaced whom.
4. **Release.** Deleted after merge; `release --abort` keeps the worktree and
   moves the record to `aborted/`; a record whose worktree is gone shows
   `ORPHANED` and is cleaned only by the owner (`release --orphaned`).
5. **Old pointer.** `active-run.json` keeps governing V3 and the migration lane
   in its own checkout; V4 Auto Stories use the registry.

CLI: `.agents/scripts/story-registry.mjs claim|status|heartbeat|release|policy-drift`
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
| Story lifecycle (merged at integration) | `_bmad-output/implementation-artifacts/sprint-status.yaml` |

- **Convention:** contract changes go in a Story's first slice and integrate
  early, so later work can run in parallel against the merged contract.
- **Lifecycle:** `start_story` and `complete_story` write the Story's own entry
  in `sprint-status.yaml` on its branch. Integration merges those entries;
  any conflict stops for the owner and is never auto-resolved.
- **Test resources:** optional Plan `resources` use the configured names
  `backend-test-db` and `e2e-db`. Claim also infers these resources from backend
  and E2E checks, and refuses another active holder with `RESOURCE_CONFLICT`.
  AGY dispatch and its contract builder repeat the check; an overlap override
  cannot bypass resource locks. They remain held until registry release.
  Per-worktree test databases are the owner's decision, delivered separately
  by deferred BMAD Story 1-7 (P6 §0). Resource locks serialize shared database
  checks until it lands and remain available for resources still shared later.

## 7. Integration and architecture changes (Phase P6)

- **Merge queue:** after manual `complete_story` has made the Story `done`
  with completion READY, the generation-holding Lead uses
  `integrate-story.mjs integrate <id> --generation <n> --canonical <path>`.
  The canonical checkout must be clean and on `main`. Under the Git-common
  `integration.lock`, a scratch worktree starts at main and merges the Story
  with `--no-ff`, message `merge(story-<id>): integrate`. The owner-maintained
  `integration-checks.json` initially runs full `npm run test:v4` and completion
  on that merge. On success, re-check generation, Story head and main base,
  fast-forward main to the tested merge, release the claim and remove scratch
  and lock. Never push. First-come retry queue, no daemon: held lock means
  `INTEGRATION_BUSY`; a moved main means `STALE` `MAIN_MOVED` and a fresh retry.
  Conflicts abort the scratch merge and return `MERGE_CONFLICT` with paths for
  the owner; failed checks keep logs and leave main unchanged.
- **Approval preservation:** merge, never rebase. Rebase would rewrite the
  approved commit and checkpoint SHAs, making approval stale. Completion must
  remain READY at the tested merge commit; lifecycle entries arrive through
  the Story branch's merge, with no extra lifecycle rewrite at integration.
- **Pinned control plane (D7):** a Story runs on its `controlPlaneCommit`. A
  newer canonical policy is reported as information, not as a stop.
  `AGENTS.md` "Checkout safety" must be amended accordingly in P5. The Story
  adopts the new policy through the tested merge at integration, so the merge
  gate runs with the latest `main` while preserving approved Story SHAs.
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
| P6 | Scope-overlap + hot-path checks; tested merge queue; shared test DB resource locks | Two independent Stories run in parallel and merge cleanly |
| P7 | Retire V3 as a standalone lane; keep its AGY transport as the adapter | Router/`AGENTS.md` shrink measured by `measure-v4-instruction-context` |

### P7 completion report (2026-10-11)

Explicit Story requests now use V4, with or without owner-authorized autopilot. The V3.2 transport recipe is a lazy V4 reference, copied unchanged apart from its trailing section separator; the historical policy points to it. `story-development` is deprecated with a V4 pointer and its historical body retained. Historical V3 state remains readable, and a non-`IDLE` pointer stops for the owner. Plan validation, freshness, exact scope, two-commit durability, recovery, review escalation, exact-scope Human Gate, autopilot limits and disabled automatic V3 fallback are preserved.

Commits: T2 `56bf73e` (transport), T3 `1d14528` (routing), T4 documentation (this commit). All are attributed only to Codex (GPT-6). Start-of-phase rebase onto `main` was a no-op. Canonical pointer reads were `IDLE`; no canonical checkout writes, product edits, live runtime, merge, push or delegated review occurred.

| Gate | Node total | Passed | Existing skip | Failed | Python tests / subtests passed |
|---|---:|---:|---:|---:|---:|
| Baseline `81fa46f` | 797 | 796 | 1 | 0 | 46 / 46 |
| T2 final | 798 | 797 | 1 | 0 | 46 / 46 |
| T3 | 799 | 798 | 1 | 0 | 46 / 46 |
| T4 final | 799 | 798 | 1 | 0 | 46 / 46 |

Each task ran the full `npm run test:v4` and `D:/Tools/Python314/python.exe -m pytest -q _bmad/scripts/tests/test_agent_architecture.py`. New policy tests were first observed failing against the old policy, then green after the bounded changes. T2's first full green run was followed by an EOF-blank diff-check failure before commit; removing only the section separator blank and rerunning the full suite gave the T2 final gate above.

#### Comparable instruction measurement

Before: `81fa46f2ffea60ab5a511b3dbdb4ab8a30a6a6fe`. After: `1d145283ec9b403bc6fc15ae0c99d26c829798cd`. Both calls used the existing read-only `measureInstructionPair` API from `.agents/scripts/measure-v4-instruction-context.mjs`, `evidenceRoot: null`, the unchanged `normal-action-instruction-source-v1` basis and `v4-lite-normal-action` profile, with status `MEASURED` and action coverage `COMPLETE`. These are raw Git blob bytes, not working-tree CRLF sizes. T4 changes only phase documentation, so its selected instruction blobs are identical to the after revision.

| Entry file / measured profile | Before bytes | After bytes | Delta |
|---|---:|---:|---:|
| `AGENTS.md` | 4451 | 4326 | -125 |
| `CLAUDE.md` | 229 | 218 | -11 |
| `.agents/routing/task-router.md` | 1870 | 1826 | -44 |
| `.agents/skills/v4-story-runner/SKILL.md` | 5655 | 5544 | -111 |
| Four entry files combined | 12205 | 11914 | -291 |
| `implement_slice` required instruction bytes | 59271 | 58948 | -323 |
| `verify_slice` required instruction bytes | 59594 | 59271 | -323 |
| Projection bytes (both actions) | 0 | 0 | 0 |

The extra profile reduction comes from `.agents/context/control-plane.md` (745 to 713 bytes, -32). No action document grew or changed. No token tooling was run, as the owner requested bytes only.

Basis digest: `sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998`. Input digest: `sha256:137d0f801f46439e11c54c78daed5d103f7d2ede7059d5a85a3e2d8502a46454`. No stored instruction-digest fixture needs regeneration. The existing compiler computes source/lazy instruction digests (`compile-v4-context.mjs`), and the measurement API computes Git-blob source bindings. Historical alternatives in the unchanged basis remain comparison inputs. Existing fixture/receipt files were untouched; the full suites verify the default behavior and digest contracts.

#### Assertion replacements and retained checks

All locations below are final file lines. Every replaced assertion has a new-rule check; no assertion was deleted or skipped.

| Python assertion (`_bmad/scripts/tests/test_agent_architecture.py`) | Old check -> final check | Policy sentence followed |
|---|---|---|
| 245, T2 | `orca terminal send` in V3 policy -> same string in `references/agy-transport.md` | P7 target: "The AGY transport ... lives in `references/agy-transport.md`, referenced by `agy-executor.md`." |
| 45, T3 | Approved/ready-for-dev historical skill description -> deprecated description pointing to `v4-story-runner` | P7 T3: "mark deprecated with a one-line pointer to the V4 runner; do not delete it in this phase." |
| 47, T3 | Legacy build directs approved Stories to `story-development` -> `v4-story-runner` | P7 target: "Story work routes only through V4 (with or without autopilot)." |
| 50, T3 | BMAD help recommends `story-development` -> `v4-story-runner` | Same Story-only-V4 sentence; owner approved Story-routing help lines. |
| 64, T3 | Active policy contains `orchestration-v3.md` -> "An explicit Story request uses the V4 Runner" | AGENTS: "An explicit Story request uses the V4 Runner and exactly one action." |
| 68, T3 | Historical no-external-review sentence in active aggregate -> same sentence in retained historical skill | P7 target: "V3 runtime concepts ... remain readable for any historical run but are no longer a selectable lane." |
| 77, T3 | AGENTS names V3 policy -> exact historical non-IDLE owner-stop sentence | AGENTS: "A historical V3 run with a non-`IDLE` pointer stops for the owner." |
| 65, T3 input retarget | Same negative `Codex implements directly` assertion, now on AGENTS/router/V4 Runner | Runner: "Routing/invariant context only; it never executes a Story action." |
| 66, T3 input retarget | Same negative `Codex performs the implementation` assertion, now on AGENTS/router/V4 Runner | Same Runner routing-only sentence. |
| 67, T3 input retarget | Same no-mandatory-external-reviewer assertion, now on AGENTS/router/V4 Runner | Existing review contract is preserved: "MEDIUM/HIGH review remains mandatory"; no blanket external-model mandate is introduced. |

The three negative checks keep their original predicates; only their aggregate inputs switch from the historical skill/rubric to the active V4 router/Runner. Historical schema, leases, generations, recovery, reconciliation, scope and Human Gate checks remain.

#### Added Node assertions

All added assertions are in `.agents/scripts/v4-context-invariants.architecture.test.mjs`; existing Node assertions are unchanged. The T2 loop runs fourteen distinct checks (17 added assertions total); T3 adds fourteen (31 total). Each loop member is listed separately.

| Line / assertion | Policy sentence followed |
|---|---|
| 13: transport reference exists | P7: AGY transport lives in `references/agy-transport.md`. |
| 15: executor links new reference | P7: transport is referenced by `agy-executor.md`. |
| 16: historical policy links new reference | P7 T2: "leave a pointer in `orchestration-v3.md`." |
| 18 via 32: isolated terminal creation | Transport: "In the isolated worktree, start `agy` with `orca terminal create --worktree <explicit selector>`." |
| 19 via 32: terminal readiness wait | Transport: "wait `orca terminal wait --for tui-idle`." |
| 20 via 32: context-only dispatch | Transport: "`--return-preamble` without `--inject`." |
| 21 via 32: no blind resend | Transport: "Never resend blindly." |
| 22 via 32: structured message loop | Transport: "Loop `orca orchestration check --wait --types worker_done,escalation,question`; process every message, reply, then acknowledge." |
| 23 via 32: permissions caveat | Transport: "Orca launches Antigravity with `--dangerously-skip-permissions`." |
| 24 via 32: worker questions use Orca ask | Transport: "The worker never uses local question UI (`ask_question`); only `orca orchestration ask`." |
| 25 via 32: bounded liveness threshold | Transport: "After three consecutive empty waits or 15 minutes without a heartbeat or message, read one bounded screen." |
| 26 via 32: screen cannot complete work | Transport: "Screen output is diagnosis, never completion." |
| 27 via 32: scope violations require human | Transport: "`HISTORY_REWRITTEN`, `CONTRACT_MODIFIED`, or an out-of-scope delete enter NEEDS_HUMAN with the worktree preserved." |
| 28 via 32: scope errors cannot pass | Transport: "`INVALID`/`ERROR` are never `PASS`." |
| 29 via 32: corrections limited to valid findings | Transport: "Correction contracts carry only VALID findings." |
| 30 via 32: bounded correction attempts | Transport: "At most three correction attempts per Task." |
| 31 via 32: final Human Gate preserved | Transport: "the loop never approves, merges, integrates or marks a Story done". |
| 39: explicit Story uses one V4 action | AGENTS: "An explicit Story request uses the V4 Runner and exactly one action." |
| 40: old selectable V3 lane absent | P7: historical V3 is "no longer a selectable lane". |
| 41: historical non-IDLE owner stop | AGENTS: "A historical V3 run with a non-`IDLE` pointer stops for the owner." |
| 42: automatic fallback disabled | AGENTS: "automatic V3 fallback stay disabled". |
| 43: exact-scope human approval retained | AGENTS: "`HUMAN_GATE` approval for exact scope." |
| 44: only V3 Human Gate qualifier removed | Owner: "only the `V3` qualifier goes." |
| 45: compare active entry policies | AGENTS: "compare `AGENTS.md`, `task-router.md`, and `v4-story-runner` with canonical main". |
| 46: pinned comparison retained | AGENTS: "compare against its pinned `controlPlaneCommit` instead". |
| 47: router selects V4 for explicit Story | Router: "explicit Story request uses V4 Runner plus one validated action." |
| 48: no opt-in-dependent V3 fallback | P7: "Story work routes only through V4 (with or without autopilot)." |
| 49: Runner requires explicit Story request | Runner: "Enter only for an explicit Story request". |
| 50: unsupported capability stops for owner | Runner: "Stop for the owner on unresolved authority ... exceeded V4 capability". |
| 51: old trigger qualifier/recommendation absent | Owner: "Unsupported work stops for the owner; no V3.1 recommendation remains." |
| 52: Claude entry routes explicit Story to V4 | CLAUDE: "Explicit Story requests use V4 Runner + one action". |

#### Decisions, deviations and open question

Owner-approved T1 scope additions were limited to CLAUDE, Runner description/entry/stop, control-plane authority qualifier, BMAD Story-routing help and build description. No other file outside the approved inventory was needed. The owner accepted read-only API measurement instead of the writing CLI and bytes instead of tokens. The transport's trailing separator blank was removed to satisfy `git diff --check`; its instructions otherwise match the original section. No further deviation or rule-8 condition remained.

Open question (explicitly deferred): should `bmad/references/help.md:97,101` trivial/freeform "V3 execution controls/policy" guidance be retired in a later phase? Those lines remain unchanged and are outside P7's approved Story-routing scope.

## 9. Open items

- Exact budgets (slices per run, wall-clock per slice).
- Whether HIGH slices always need cross-vendor review or only on owner request.
- Supervised Orca `worker-start` remains broken (`agent_prompt_blocked`);
  re-test after Orca/AGY upgrades, compat-terminal stays the default.
- Orca always launches AGY with `--dangerously-skip-permissions`; guardrails are
  the worktree, contract scope, scope gate, and Lead diff review.
