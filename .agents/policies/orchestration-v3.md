# Agent Architecture V3

## Scope and authority

Phase 2B adds local Lead lease enforcement and deterministic runtime reconciliation
to the Phase 2A Orca integration.
Tracked implementation execution is enabled only through an Orca-owned Run and
Task, with Antigravity as the fixed worker in an Orca-managed isolated Git worktree. Automatic
model switching, quota detection, live failover testing and automatic integration
remain disabled. Missing infrastructure never implies direct Lead coding.
Authorized agent-infrastructure maintenance may be performed by the Lead.

Human -> replaceable Lead (Codex account A, Codex account B, Claude) -> durable
control plane (BMAD, canonical policies, `.agent-state`) -> Orca -> fixed
Antigravity -> isolated Git worktree -> Lead review -> human integration gate.

Subject to explicit human direction, resolve source conflicts in this order:
1. approved BMAD canonical artifacts;
2. canonical project / agent architecture policies;
3. current Story acceptance criteria;
4. recorded architecture decisions;
5. active worker contract;
6. Lead execution plan;
7. conversation / transcript (never authoritative over canonical artifacts).

An approved Story belongs to BMAD authority; conflicts between approved artifacts
require BMAD/human resolution, not choosing a convenient interpretation. Git is
the source of truth for code. Evidence establishes implementation facts, not
permission to change requirements. Root `AGENTS.md` retains the risk and Done Gate
rules. This policy supersedes V2 execution/ownership rules and generic skill
instructions, including BMAD personas, legacy Build and Superpowers. Optional
workflows cannot bypass bootstrap, ownership, fixed worker, or human approval.

## Core rules

- R1: Product requirements live in approved BMAD artifacts.
- R2: Execution state lives outside model conversation context.
- R3: Codex and Claude are replaceable Lead engines; Lead is a role.
- R4: Antigravity is the fixed implementation worker for Orca dispatch.
- R5: Workers operate in isolated Orca-managed Git worktrees.
- R6: Lead does not implement product code by default when a healthy worker exists.
- R7: Worker contracts specify execution; they are not product truth.
- R8: Checkpoint runtime state at meaningful lifecycle events only.
- R9: Handoff never requires transcripts.
- R10: Takeover reconciles durable state against Git and, once enabled, Orca.
- R11: Only one mutating Lead may own an active run.
- R12: Worker DONE, Lead ACCEPTED and Human APPROVED are distinct.
- R13: Corrections reuse the task, worktree and worker session when possible.
- R14: Infrastructure failure must not silently change execution architecture.
- R15: Final integration remains human-gated.

## Canonical and runtime files

Version-control this policy, [worker contract](../templates/worker-contract.md),
[handoff template](../templates/lead-handoff.md), and
[run](../schemas/run-state.schema.json) / [worker](../schemas/worker-state.schema.json)
schemas. `.agent-state/` is ignored local runtime state, not a Git authority.

Resolve the canonical checkout from `git worktree list` and Git common directory.
Use only its `.agent-state/`, including when a Lead starts in a linked worktree;
never create an independent active pointer or lease in a worker checkout.
Moving machines requires an explicit state transfer plus reconciliation; Git
alone will not carry ignored state. No state transfer mechanism is provided here.

```text
.agent-state/
  active-run.json
  mutation.lock                 # transient exclusive local mutation lock
  runs/<RUN-ID>/
    run.json
    plan.md                     # Story task references + delta only
    decisions.md                # facts, choice, authority/reference, date
    events.jsonl
    lead/state.md
    lead/current-session.json
    lead/handoff.md             # optional optimization, never truth
    workers/<TASK-ID>/contract.md
    workers/<TASK-ID>/state.json
    workers/<TASK-ID>/report-attempt-<N>.json # semantic worker evidence (v1)
    workers/<TASK-ID>/capture-attempt-<N>.log # optional raw capture, not resultPath
    workers/<TASK-ID>/review.md
    verification/status.json
    verification/summary.md
  archive/<RUN-ID>/
```

Create run/task files only when needed; do not manufacture runs or worker IDs.
Archive only terminal runs after the pointer is safely cleared; preserve evidence
and worktrees until the human authorizes their disposal. Never archive active work.
IDs are filesystem-safe tokens; resolve all paths within the canonical project
or an explicitly verified Orca worktree. Reject traversal and foreign repository IDs.

The pointer is ONLY `{schemaVersion: 1, activeRunId: null, storyId: null,
status: "IDLE", updatedAt: null}` initially. Active pointers name an existing run;
storyId/status mirror it. `run.json` is authoritative for execution state; pointer
and snapshots are projections. A missing pointer is NORMAL only if no run/lock or
other evidence of active work exists; otherwise use NEEDS_RECONSTRUCTION.

`run.json` follows the run schema. Pin Story source to a Git commit as well as an
optional human-readable ref; uncommitted requirements require resolution before
dispatch. `phase` retains the last normal phase in exceptional states; otherwise
it equals status. `revision` increases per checkpoint, `lastEventSequence` tracks
the last committed event. `nextAction` is a concrete action, not reasoning.
Schemas validate individual snapshots (JSON Schema draft-07); every writer
must additionally check cross-file IDs, lease generation equality, monotonic
revisions, phase/status agreement, allowed transitions and current Git evidence.
Schema validity alone does not authorize a mutation or prove a lifecycle gate.
For an explicitly authorized non-product infrastructure smoke run, the `story`
identity names the canonical agent policy under test and must not update BMAD
Story or sprint state.

`lead/state.md` is at most 40 lines: run/revision, phase, task, execution mode,
worker status, Lead generation, lease owner/state, completed steps, important
decisions, blocker, waiting-for, exact next action, and minimal artifact paths.
`current-session.json` contains only schemaVersion,
sessionId (opaque, no credentials), engine, generation, startedAt. It mirrors
ownership; it cannot grant it. `handoff.md` uses the canonical template.
Keep plans, decisions and summaries bounded; link older facts rather than copying.

Verification status contains schemaVersion, runId, revision, taskIds, checked Git
commit/diff identity, verdict (NOT_RUN/PASS/FAIL), check names/exit codes, checkedAt,
and summaryPath. Summary holds compact AC-to-evidence entries, scope, and unresolved
findings. `review.md` records PENDING/ACCEPTED/CHANGES_REQUESTED, inspected revision,
scope/diff, AC and architecture evidence. Any code change invalidates prior review,
verification and human approval for that diff.

## Orca context loading (A2)

Always read this canonical policy and the compact, version-matched Orca guide at
Lead session entry, before Orca observation or mutation: resolve the executable
through the project-local discovery skills, then `orca skills get orchestration`.
Here `orca` means that selected executable throughout; never switch binaries on
failure. Verify runtime identity with `orca status --json`. Healthy actions require no full guide.
The compact guide is mandatory; if unsupported, use the full-guide fallback below
to obtain its safety guidance. Lazy loading never skips canonical V3 rules.

Classify the current action using the gates below before acting. Load only its
required capabilities, plus any conditional reference required by the live guide
or receipt. Already loaded, applicable guidance in the current context need not
be read again for every action. Unknown outcome requires read-only reconciliation
before any replay; loading a reference never grants mutation authority.
V3 retains authority, state-machine gates, isolation, ownership/generation,
duplicate-dispatch prevention, independent review/verification and Human Gate.
Orca examples using other agents, shared/current workspaces or folder workspaces
do not override fixed Antigravity and isolated Git worktrees in NoteFlow.

## Orca capability discovery

Use `orca skills get orchestration --references` to discover available names and
`orca skills get orchestration --reference <discovered-reference>` to read one.
Resolve categories from current discovery and the compact guide's action gates;
the names below are observed mappings, not version pins or text/hash contracts.
Rediscover when the installed interface differs; never guess renamed commands or
silently omit a required category. Keep runtime-specific procedures in Orca.

| Capability | Observed reference | Required semantics |
|---|---|---|
| placement | `references/placement-and-remote.md` | New worktree or exact workspace selection and isolation binding |
| reuse | `references/coordinator-loop.md` | Same-terminal reuse and settlement ownership |
| recovery | `references/recovery-and-cleanup.md` | Failed/stopped/unknown attempts, request inspection, retry and uncertain cleanup |
| legacy | `references/legacy-contract-migration.md` | Compatibility labels/receipts, adopted Run and takeover authority |
| topology | `references/low-level-topology.md` | Operator-created terminals and limits of unsupervised lifecycle ownership |
| terminal | `orca-cli` | Load the compact `orca skills get orca-cli` guide for terminal/worktree commands; follow its own action references |

There is no separate restart or V3 lease reference in the observed Orca guide.
Use recovery for runtime facts and the canonical ownership/reconciliation sections
for V3 lease decisions. `legacy` does not authorize legacy takeover commands for
an ordinary current Run. NoteFlow compat-terminal is not itself a legacy label:
use topology plus terminal guidance and V3's existing compatibility procedure;
add legacy only for an actual label, adopted Run or compatibility receipt.

## Orca action reference gates

All rows require canonical V3 plus compact Orca guidance. Additional capabilities
must be loaded before the action. Apply every matching row (union of requirements);
recovery/uncertainty overrides healthy classification. Past recovery alone does not trigger a load.

| Action | Current condition | Additional capabilities | Guard before proceeding |
|---|---|---|---|
| healthy | Existing Run/Task identities clear; lease valid; generation matches; isolated worker/worktree bound; runtime observation matches durable state; no unknown effect, takeover or restart requiring recovery; no specialized action | none | Observe first, validate ownership before mutation; continue exact nextAction |
| new-worker | Create worker/worktree or select exact isolated placement | placement | Bind exact Run/Task/worktree; enforce duplicate-dispatch gate; no shared mutable workspace |
| continue | Continue same active Task/attempt with healthy matching observations | none | Do not start a new Dispatch; use other gates if action requires reuse, messaging or recovery |
| correction | Correction after Lead review on same logical Task | reuse | Preserve same Task and worktree, reuse session when possible, attempt +1, pin previous report/evidence identity; apply retry gate if failed/stopped |
| retry | Explicit retry of proven failed/stopped attempt | recovery, placement | Reconcile first; reuse Task and verified worktree, explicit placement, increment attempt under V3; never substitute new scope |
| compat-terminal | V3-authorized compatibility execution after observed supervised provider failure | topology, terminal | Reconcile failed/unknown dispatch via recovery gate first; preserve coordinator Run/Task and exact isolated worktree; add placement for creation/selection |
| runtime-restart | Orca runtime restarted or restored session facts need recovery | recovery | Reconcile runtime identity and observations against durable state/Git before mutation; no automatic redispatch |
| takeover | Replacement Lead acquiring ownership | recovery, legacy | Read-only reconciliation before lease acquisition; fence/release old owner and increment generation under canonical protocol |
| reconcile | ownership/generation mismatch, runtime IDs mismatch, stale/missing projection, settlement ambiguity, worker/worktree ambiguity, pending reconciliation, or corrupt/missing observation required for next action | recovery | Preserve evidence; classify discrepancy; mutate only proven correction under valid lease; otherwise escalate |
| unknown-outcome | Unknown dispatch result, side effect or Task outcome | recovery | Inspect request/Task/Dispatch and reconcile before any replay; never blind replay; absence is not proof of no effect |
| legacy-contract | Actual legacy label, adopted Run or compatibility/recovery receipt | legacy | Read exact attested guidance; no inferred authority or automatic mode switch |

For same-terminal correction, reuse semantics do not authorize retry of an unknown
attempt. If the live guide cannot safely express V3 same-task correction, use the
fallback; do not invent a new Task to route around the constraint. A follow-up
message/inbox replay or another specialized action loads the additional reference
named by the compact guide, even if no row above names that runtime capability.

## Orca context fallback

Fallback means load `orca skills get orchestration --full` from the same selected
executable, including the compact safety guidance and relevant bundled procedures.
Record the reason and actual loads in the existing A0 measurement record. A full
guide supplies context, not permission to bypass any V3 gate.

| Condition | Required context/result | Evidence/action |
|---|---|---|
| compact-unsupported | full guide | Record reason: compact retrieval unsupported or incomplete |
| reference-unsupported | full guide | Record reason: reference discovery/loading mechanism unsupported |
| reference-missing | full guide | Record reason: required category missing, reference not found or content insufficient |
| interface-drift | full guide | Record reason: installed interface differs and current discovery cannot safely resolve it |
| unmapped-action | full guide | Record reason: action cannot be safely classified using canonical/live guide gates |
| full-insufficient | BLOCKED / NEEDS_HUMAN | If full retrieval fails or guidance remains insufficient, no mutation; report exact error/gap, use help only for read-only discovery |

Do not fail open on an empty/error/truncated reference response. If full guidance
still cannot resolve runtime semantics, stop rather than guess. Runtime restart,
takeover and unknown outcomes still require reconciliation after fallback.

## Shared Lead bootstrap

Codex and Claude follow exactly this protocol before planning or implementation:
1. Read canonical `.agent-state/active-run.json` (read-only, no lease needed).
2. With no active run and no contradictory evidence, enter NORMAL MODE. Initialize
   the idle pointer under the mutation protocol only when a write is needed.
3. With an active run, enter RESUME MODE: read its `run.json` and concise
   `lead/state.md` in that order.
4. Read current worker/task state, contract, and decisions only as needed for the
   recorded phase and `nextAction`.
5. Perform read-only Orca Run/Task/Dispatch/worker queries. Do NOT read `events.jsonl` during ordinary resume or depend on a previous transcript.
6. Inspect Git branch, HEAD, diff and the recorded worker worktree when the current
   phase requires code evidence.
7. Compare durable state with observed Orca and Git reality using the reconciliation
   classes below; Orca facts never override BMAD product truth.
8. Classify every discrepancy before correcting it.
9. Reconcile only discrepancies whose outcome is proved by runtime/Git evidence.
10. Escalate ambiguous or unsafe discrepancies without replaying mutations.
11. Only after read-only reconciliation may a replacement Lead acquire mutating
    ownership under the lease acquisition table.
12. Continue the reconciled exact `nextAction`; never duplicate a worker because
    the Lead session, account, provider, terminal focus or UI worktree changed.

Normal resume does not read full BMAD documents or the entire event log. Use pinned
Story sections and a bounded event tail only when a specific recovery fact requires it.

## Ownership and local mutation protocol

Lease fields: owner (opaque unique session ID), generation, acquiredAt, heartbeatAt.
First ownership is generation 1; every takeover increments generation, even for
the same engine/account. Lease generation equals run.leadGeneration. Null lease
means released ownership; it does not reset generation. No account tokens in state.

The invariant is: one active Run -> at most one mutating Lead. A local
exclusive-create lock at `mutation.lock` surrounds every mutating transaction,
including active-run creation, ownership acquisition, task creation, dispatch,
cancellation, state transitions and integration actions.
This is a short filesystem critical section, not a distributed locking service.
All writers use the SAME canonical lock and reread run revision/lease inside it.
Verify owner and generation immediately before a side effect and hold the lock
through its durable result (or durable unknown-outcome marker). Stale generations
are fenced: abort instead of writing. A previous-generation mutation is invalid,
even if its session later resumes. Read-only inspection remains available.

A valid current owner/generation lease is required before creating Tasks,
dispatching workers, sending compatibility worker instructions, retrying, releasing or cancelling workers, mutating Task status, changing state-machine phase,
declaring verification passed, or performing integration actions. Inspecting
durable files, Orca, terminals, worktrees, Git, or BMAD artifacts is read-only and
does not require a lease.

Lease acquisition is deterministic:

| Observed ownership | Required result |
|---|---|
| No active lease | Acquire under `mutation.lock`; first ownership uses generation 1, otherwise `generation + 1`; append LEAD_LEASE_ACQUIRED |
| Healthy lease owned by this session and generation | Continue; refresh heartbeat only at a meaningful checkpoint or immediately before mutation |
| Healthy lease owned by another session | Do not steal; remain read-only, classify NEEDS_HUMAN and append LEAD_CONFLICT_DETECTED only if a valid owner records it |
| Explicitly released old lease | Reconcile first, acquire with `generation + 1`, record LEAD_TAKEOVER and LEAD_LEASE_ACQUIRED |
| Old owner proved terminated/fenced or human directs fencing | Reconcile first, preserve fencing evidence, acquire with `generation + 1`, record LEAD_TAKEOVER and LEAD_LEASE_ACQUIRED |
| Old owner liveness or fencing is ambiguous | Do not mutate; report NEEDS_HUMAN without stealing the lease |

Takeover always sets `leadEngine`, `leadGeneration`, lease owner and lease generation
in the same checkpoint. Generations are monotonically increasing and never reused.
The takeover event references release/fencing evidence and the reconciliation
result; timestamps support evidence but never prove unavailability alone.

Heartbeat is renewed on a meaningful checkpoint or before a mutating operation,
not on chat turns; no heartbeat event spam. Age alone never expires the lease.
Graceful takeover requires explicit release; emergency takeover requires evidence
the prior owner cannot mutate (terminated/fenced), or human-directed fencing.
An unreachable session with uncertain liveness -> NEEDS_HUMAN, read-only.
Never steal a lock just because its timestamp is old. A crashed lock requires the
same fencing and reconciliation before removal. Two contenders cannot both win
exclusive creation. If ownership is uncertain, stop in NEEDS_HUMAN; do not dispatch.

Checkpoint protocol under that lock: validate schemas and allowed transition,
assign revision/event sequence, write related projections via same-directory
temporary files and atomic replacement, then replace authoritative run.json,
append the event once (deduplicate by run/sequence), and update pointer last.
Multiple files are not an atomic transaction: interruption, mismatched revisions,
partial JSON or ambiguous external side effects require reconciliation before
further mutation. Never replay dispatch blindly. Recover projections from run.json
and verified Git/Orca evidence; use a bounded event tail if necessary. Preserve
corrupt files as recovery evidence rather than silently resetting them to IDLE.

## Runtime reconciliation

Reconciliation compares three independent layers in order. Durable V3 state owns
workflow phase, the planned/current logical Task relationship, Lead generation and
lease, recorded decisions, and `nextAction`. Orca owns observed Run, Task, Dispatch,
worker/terminal and Orca worktree runtime facts. Git owns actual repository,
branch, HEAD, worktree changes, commits and diffs. BMAD remains the product truth;
neither Orca nor Git may rewrite requirements or architecture decisions.

Perform observation read-only and record one of these deterministic classes before
any takeover or other mutation:

| Reconciliation class | Required action |
|---|---|
| RECORDED_MATCHES_RUNTIME | Make no correction; continue the recorded `nextAction` after lease validation/acquisition |
| RECORDED_BEHIND_RUNTIME | Validate Orca completion plus worker report/worktree/Git evidence; advance only to the proved phase, normally LEAD_REVIEW; append STATE_RECONCILED; do not redispatch |
| RECORDED_AHEAD_OF_RUNTIME | If state says dispatched but no matching Task/Dispatch/worker evidence exists, do not recreate work; distinguish never-dispatched, lost runtime, and corrupt state only from evidence; otherwise enter NEEDS_RECONSTRUCTION and append RECONCILIATION_BLOCKED |
| TERMINAL_EXISTS_WITHOUT_SUPERVISED_DISPATCH | For recorded `compat-terminal`, a valid Task, explicit worker worktree and healthy Antigravity terminal is legitimate; null Dispatch is not corruption |
| SUPERVISED_DISPATCH_FAILED_BUT_COMPAT_TASK_EXISTS | Respect the recorded `compat-terminal` mode and Phase 2A fallback evidence; do not create a supervised worker or switch modes automatically |
| WORKTREE_MISSING | If runtime says a worker exists but its recorded worktree is missing, enter BLOCKED or NEEDS_RECONSTRUCTION; do not redispatch automatically |
| GIT_DIRTY_AFTER_WORKER_COMPLETION | Preserve the diff and transition only to LEAD_REVIEW; never infer verification or completion |
| TASK_COMPLETED_BUT_NO_VERIFIABLE_GIT_EVIDENCE | Transition to LEAD_REVIEW with evidence missing as the blocker; Task status alone never proves acceptance or COMPLETE |
| DUPLICATE_WORKERS | Freeze mutation and enter NEEDS_HUMAN; do not select, cancel, merge or prefer a worker automatically; append DUPLICATE_WORKER_DETECTED |

Safe correction requires a valid current lease. A replacement Lead completes the
read-only comparison first, then acquires/takes over the lease, rereads all compared
revision/identity facts inside `mutation.lock`, and commits the correction plus one
STATE_RECONCILED event. If any fact changed, release the lock without mutation and
restart observation. An owner conflict observed by a non-owner is reported without
writing; only a valid owner may checkpoint an exceptional state.

Execution mode is durable and never inferred from terminal focus. `supervised`
expects a Task, Dispatch, worker identity and worktree. `compat-terminal` expects
an Orca Run and Task, explicit isolated worktree, fixed Antigravity identity,
coordinator-owned lifecycle, and independent Git evidence; a terminal handle is
required while running but may be stale or unavailable after completion. Missing
Dispatch is valid in `compat-terminal`. Resume never converts modes automatically;
an explicit policy condition, current lease, and recorded decision are required.

### Duplicate-dispatch gate

Before creating or dispatching any worker, the lease owner rereads `run.json`, the
current worker state/contract, and relevant Orca Run/Task status inside the lock.
Match durable Task ID, Orca Task ID, bounded contract/scope, attempt, worker
worktree, and any request/Dispatch identity. If an equivalent active or completed Task
exists, do not dispatch; reconcile or enter review. If outcome is unknown, persist
the unknown-outcome marker and use Orca request/status inspection. A new Lead,
provider change, missing transcript, replaced terminal, or different UI focus is
never evidence for a new Task. Multiple unexpected workers for one logical Task
trigger DUPLICATE_WORKERS and NEEDS_HUMAN.

## State machine and gates

Only these normal edges are allowed; conditions are mandatory:

| From | To | Condition |
|---|---|---|
| IDLE | PREFLIGHT | New run, pinned Story, ownership acquired |
| PREFLIGHT | PLANNING | Readiness and policy checks pass |
| PLANNING | TASK_READY | Bounded contract and verification plan recorded |
| TASK_READY | WORKER_RUNNING | Supervised Dispatch or compatibility terminal ready; Run/Task/mode/worktree IDs durable |
| WORKER_RUNNING | LEAD_REVIEW | Worker DONE, report and worktree available |
| LEAD_REVIEW | VERIFICATION | Actual diff reviewed, Lead ACCEPTED |
| LEAD_REVIEW | TASK_READY | Corrections required; same task, attempt +1 |
| VERIFICATION | TASK_READY | Verification fails; correction contract recorded |
| VERIFICATION | PLANNING | Verified task accepted; distinct planned scope remains |
| VERIFICATION | HUMAN_GATE | All ACs evidenced; root Done Gate evidence checks 1-7 pass |
| HUMAN_GATE | COMPLETE | Human APPROVED exact diff/integration scope; authorized action and BMAD lifecycle recorded |
| HUMAN_GATE | PLANNING | Human requests scope revision; previous approval invalidated |

There is no WORKER_RUNNING -> COMPLETE edge. COMPLETE/CANCELLED are terminal;
start a new run for later work. Clear pointer to IDLE only after terminal state
and its evidence are durable. Human approval is not a worker/Lead assertion and
must identify approver, date, exact diff/commit and permitted integration action.
`humanGateRequired` remains true, including after completion.

From any nonterminal state: BLOCKED for a dependency/readiness issue;
LEAD_UNAVAILABLE for loss of Lead; NEEDS_HUMAN for unresolved authority/ownership;
NEEDS_RECONSTRUCTION for missing/corrupt/conflicting state; CANCELLED only after
explicit cancellation and workers confirmed stopped or fenced. An observer without
ownership reports the condition without writing it. WORKER_FAILED is reachable
from TASK_READY/WORKER_RUNNING/LEAD_REVIEW on confirmed worker/runtime failure.

Exceptional states retain phase and a reason in nextAction/lead snapshot. Once
resolved and reconciled, they may return ONLY to that phase with its entry guards
rechecked, or to NEEDS_HUMAN/NEEDS_RECONSTRUCTION/CANCELLED under the above guards.
WORKER_FAILED may additionally return to TASK_READY for a safe same-task retry,
or WORKER_RUNNING for confirmed safe continuation. Reconstruction never infers
ACCEPTED/APPROVED from missing data. Recovery cannot skip review or verification.

## Worker execution, review and correction

Engine is Antigravity, fixed by default. Orca owns worktree/runtime creation;
the Lead owns bounded contracts and review. Codex and Claude use the project-local
`orca-cli` and `orchestration` skills; no global skill installation is required.
Use the Orca context loading (A2), capability discovery, action reference gates
and fallback sections above before observation or mutation. Follow the selected
executable's current guidance rather than frozen command assumptions in this policy.

Preferred tracked dispatch uses Orca supervised orchestration when the installed
Orca and Antigravity versions support it reliably: create/bind one Orca Run, create
one Task from the bounded contract, and start fixed Antigravity in an isolated
Orca-managed worktree. Record the CLI request, runtime, Run, Task, Dispatch,
worker, optional terminal, execution mode, and full worktree IDs from receipts.
Never reconstruct IDs. Persist dispatch intent before the call; after an unknown
result use the guide's request/status inspection instead of replaying.

Use `compat-terminal` only after supervised Antigravity dispatch fails because of
an observed Orca/provider compatibility limitation. An Orca Run and Task must
already exist and remain coordinator-owned. Create or identify an isolated
Orca-managed child worktree with durable explicit repo/worktree identifiers and an
explicit parent; never depend on UI focus or whichever workspace is visually active.
Start or identify one healthy Antigravity terminal there, send the bounded contract
with `orca terminal send`, and observe the compact completion reference with
`orca terminal read --screen`. Store any raw capture separately from the structured
report; never redirect terminal output into `resultPath`. Apply the report ingestion
boundary below. Then independently inspect the worker Git status,
diff, scope, and acceptance evidence before the coordinator uses
`orca orchestration task-update`. Store `executionMode: "compat-terminal"`, the
terminal and worktree IDs, and a null Dispatch ID when no Dispatch succeeded.

This compatibility path is still Orca runtime execution, not a second orchestrator.
It never authorizes Lead-checkout implementation, Codex/Claude worker substitution,
shared-worktree execution, self-report-only completion, automatic merge, or bypass
of Lead review and human approval. Outside this bounded compatibility path, raw
terminal control and `dispatch --inject` remain diagnostic/recovery-only.
Orca runtime status describes execution facts and never overrides BMAD requirements,
the worker contract, Git evidence, Lead review, or the human integration gate.
Worker reports are inputs to the Lead, never writes to canonical Lead ownership.

DONE means implementation finished, local verification attempted, report available,
changes preserved in its worktree. Tests may have failed: DONE is not ACCEPTED,
Story complete, Human APPROVED or integrated. Lead must inspect result, actual Git
diff, changed-file scope, AC coverage, tests and architecture constraints, and
independently verify when needed. Self-report alone is insufficient.

Reuse Task ID, worktree, worker session where possible for defects; increment
attempt, update bounded contract, reset review and verification. New tasks require
logically distinct scope. Follow root retry/reassessment rules. Antigravity failure
-> WORKER_FAILED -> diagnosis -> safe resume, otherwise NEEDS_HUMAN. Only a human
may authorize a worker-engine exception; stop and record its scope/authority before
changing the fixed schema/policy. No silent Codex/Claude worker fallback.

### V3.1 structured worker evidence (A1)

New contracts use the single draft-07 [worker report schema](../schemas/worker-report.schema.json),
`schemaVersion: 1`, with `kind: completion | correction | blocked`. This version is
independent of run/worker-state versions. Reports are evidence, never state authority.
There is no new run-state enum or transition. `blocked` has `status: BLOCKED`, not
DONE; the current Lead decides the existing exceptional transition under its lease.
The worker reports preserved `worktreePath`, `scope`, blocker facts, last completed
step, verification state, required decision/dependency and worker activity; activity
is an assertion to reconcile with Orca, not proof the worker stopped.

Producer boundary (both supervised and compat-terminal):

1. Pin the exact attempt contract bytes; `contractIdentity` is `sha256:<hex>` of
   that dispatched contract (including its correction instructions). Record the
   digest outside those bytes in existing dispatch evidence, avoiding self-hashing.
2. The contract assigns a report location in the verified worker worktree and its
   canonical destination `workers/<TASK-ID>/report-attempt-<N>.json`, relative to
   the canonical run directory. Worker writes UTF-8 JSON there, finishes the file
   before notification, and preserves it. If the worker cannot write the canonical
   destination, Lead copies the artifact byte-for-byte from the assigned worktree
   location and verifies SHA-256 equality; no transcription from terminal history.
   Only the Lead updates existing `resultPath` under the usual mutation protocol.
   The contract maps a worker artifact directory to the canonical run directory:
   preserve referenced manifests/logs there with the same relative paths. Copy
   manifests when reviewing scope; retrieve logs/captures only when needed. Missing
   references are evidence gaps, not implicit PASS. Published reports are immutable;
   if resuming a blocked worker in the same attempt, assign a new contracted report
   filename and retain the earlier artifact/digest. Do not overwrite evidence.
3. Emit only a compact notification, for example
   `DONE report=workers/<TASK-ID>/report-attempt-<N>.json attempt=<N> sha256=<hex>`;
   blocked uses `BLOCKED` with the same reference fields. Supervised completion
   payloads carry this reference too. Notifications never grant acceptance.
4. Keep terminal capture at `capture-attempt-<N>.log` and check stdout at referenced
   log paths. Neither is the canonical report. Missing/incomplete report is missing
   evidence; preserve runtime/Git facts and investigate, never synthesize DONE.

All report artifact references are relative to the canonical run directory, except
`check:<id>` references to checks within the same report. `cwd` is resolved against
the recorded worktree unless an explicit verified absolute directory was contracted.
Resolve paths and symlinks before access: reject traversal, foreign repository paths
and targets outside the canonical run or explicitly verified worker worktree.

`scope` reuses V3 `baseCommit`, observed Git `head`, and the existing `diffIdentity`
used in review/verification. A clean commit may identify scope by commit; a dirty
scope must use existing exact-scope/patch evidence including untracked file content
and deletions, not HEAD alone. `changedFilesRef` points to that attempt's changed-file
manifest. No new fingerprint authority is introduced. For a blocked worker unable
to inspect Git, retain the last known scope and say it is unverified in
`verificationState`; Lead must reconcile it before any further gate.

Ingestion boundary (default Lead path):

1. Resolve only the contracted report path for the current run, Task and attempt.
   Verify notification digest against actual file bytes; do not trust a marker's
   path, attempt or old DONE text in a screen redraw as authority.
2. Validate the actual JSON against the report schema. Unsupported versions and
   malformed v1 are evidence errors. Schema validity alone is insufficient.
3. Bind validation to independent expectations: extend the schema with an `allOf`
   `properties` object containing `const` constraints for `runId`, `taskId`,
   `attempt`, `contractIdentity` from current state/dispatch evidence and `scope`
   from independently inspected Git/manifest evidence. For correction also bind
   the entire `previousReport` object to the baseline pinned by the correction
   contract. Never derive expected constants from the candidate report. Confirm
   the baseline path and SHA-256 against preserved bytes and its `diffIdentity`
   against the reviewed scope. Reject wrong attempt, reused report, mismatched scope
   or stale baseline; timestamp is not authority. This binding recipe is exercised
   by the architecture tests; it is a Lead protocol, not a new runtime service.
   Bind `kind` to completion or correction as required by the dispatched contract;
   a correction cannot submit a full completion to bypass delta rules. A blocked
   notification may select only the blocked schema branch, never a DONE branch.
4. Read the structured report as worker assertions. Check IDs must be unique;
   `acEvidence.checkIds` and `check:<id>` must resolve within this attempt. Inspect
   manifest and actual Git diff independently, assess all relevant ACs, architecture
   and unresolved issues. Check `checkedScope` against the scope actually tested;
   code changes invalidate prior verification. Only then perform independent Lead
   review and verification, preserving HIGH-risk adversarial review and Human Gate.
5. Only lazy-load referenced logs/raw capture for a specific failure, ambiguous
   completion, recovery or review question. Record actual loaded bytes separately
   from produced report bytes; do not load every artifact by default.

Check semantics: PASS means completed successfully with exitCode 0; FAIL means an
observed failure (exitCode may be null if interrupted); NOT_RUN means no execution
(null exitCode/logRef); UNKNOWN means execution/outcome cannot be established.
UNKNOWN may retain an observed exitCode without asserting success. Empty checks
or AC mappings cannot prove acceptance. DONE is not ACCEPTED even with all PASS.
Commands identify execution, not evidence that it occurred; Lead assesses logs and
independent checks where needed.

Correction reports are deltas: `previousReport` contains the exact baseline path,
SHA-256 and previous `diffIdentity`; `scope` is the current identity.
`changedSincePreviousRef` lists only changes since that baseline. Use stable finding IDs
from Lead review (assign once in `review.md` if needed), with `findings.resolved`
evidence references and `findings.remaining` reasons. `checks` contains only checks
executed/attempted in this attempt (the rerun list); `acEvidence` contains only new
or changed mappings, and `unresolvedIssues` only newly discovered issues. Retained
issues belong in `findings.remaining`. Old applicable evidence is referenced by
baseline artifact path, never copied into current checks or presented as fresh.
Lead decides applicability; do not recursively load all previous report bodies.
Before correction dispatch, pin the actual last reviewed report, even if its
attempt is not N-1 (e.g. an intervening failed attempt produced no valid report).

Reports must not contain terminal transcripts, prompt/history copies, screen
redraws, full Story/architecture documents, full test stdout, previous report
bodies, reasoning transcripts, generic proof claims without evidence, or old DONE
markers. Use compact facts, bounded failure descriptions and artifact references.
Schema rejects extra fields and bounds text; semantic review still checks misuse
of allowed fields. Large logs stay external; no terminal transcript is required.

Legacy: only artifacts from contracts predating this protocol may be classified
`LEGACY_UNSTRUCTURED` in the current review record. Read bounded excerpts only when
needed and treat them as unverified evidence; never infer fresh checks/ACCEPTED.
Never downgrade malformed or unknown-version structured reports to legacy.
Do not rewrite historical result.md, correction reports, events, receipts or state.
For a new correction of legacy work, pin the legacy file digest plus independently
reviewed diffIdentity as the baseline and produce a v1 delta. No automatic migration.

A0 measurement follows the [telemetry contract](v3-telemetry.md). It is an external
measurement/reference contract, not a new control-plane authority or subsystem.

## Checkpoints, handoff and recovery

Events are append-only compact JSONL with schemaVersion, runId, sequence, revision,
timestamp, type, generation, taskId (nullable), from/to status and a short fact or
artifact reference. Never store chain-of-thought, verbose reasoning, full prompts,
terminal dumps, transcripts or BMAD copies. Normal bootstrap never scans history.
Use a bounded tail (initially at most 50 records), expanding only for a specific
recovery, conflict, sequence-reconstruction or debugging question.

Checkpoint types: RUN_CREATED, PREFLIGHT_PASSED, PREFLIGHT_BLOCKED, PLAN_CREATED,
TASK_CREATED, TASK_DISPATCHED, WORKER_STARTED, WORKER_COMPLETED, WORKER_FAILED,
REVIEW_STARTED, REVIEW_PASSED, REVIEW_FAILED, CORRECTION_DISPATCHED,
VERIFICATION_STARTED, VERIFICATION_PASSED, VERIFICATION_FAILED, HUMAN_GATE_REACHED,
LEAD_LEASE_ACQUIRED, LEAD_LEASE_RELEASED, LEAD_TAKEOVER,
LEAD_CONFLICT_DETECTED, LEAD_HANDOFF, STATE_RECONCILED,
RECONCILIATION_BLOCKED, DUPLICATE_WORKER_DETECTED, RUN_COMPLETED and RUN_CANCELLED.
Exceptional changes use the most specific type with one concise fact/evidence
reference. Do not log every heartbeat, read-only query, repeated snapshot or
terminal dump. No per-message checkpoints.

Graceful handoff: checkpoint current state, update the concise Lead snapshot and
handoff template, persist all current task/runtime identifiers and exact
`nextAction`, stop initiating new mutations, release the lease under lock with
LEAD_LEASE_RELEASED, and preserve healthy Orca workers. New owner reconciles and
acquires the next generation. Emergency handoff uses
run.json, lead snapshot, current worker, Git, Orca and events only if needed;
handoff.md is optional and cannot override those facts.

| Failure / switch | Required behavior |
|---|---|
| Codex quota exhaustion | Graceful handoff if possible; otherwise emergency protocol; worker may continue |
| Sudden Lead crash | Fence old owner, reconcile unknown effects and projections, increment generation |
| Codex A -> Codex B | Same protocol, unique session owner, no new task by default |
| Codex -> Claude / Claude -> Codex | Same role bootstrap, schema and generation; only tool syntax differs |
| Worker failure | Diagnose and resume same task safely; otherwise NEEDS_HUMAN |
| Orca unavailable | BLOCKED (or WORKER_FAILED if confirmed); retain IDs, reconcile on recovery, never direct-code fallback |
| Stale filesystem snapshot | Compare revision and Git/Orca facts; repair projections under lease; do not trust timestamp alone |
| Conflicting Leads | Losing/uncertain owner stays read-only; fence before takeover |
| Missing/corrupt state | NEEDS_RECONSTRUCTION; preserve evidence, rebuild verified facts only; human resolves uncertainty |

## V2 compatibility

Preserved: BMAD authority/lifecycle, Story routing and task-as-plan, bounded context,
risk-based review, deterministic evidence, no external reviewer requirement,
retry reassessment, checkout safety and human integration authority.
Replaced: Codex-only orchestration/direct implementation, conversation-held state,
and the blanket exclusion of Antigravity. Deprecated: V2 execution examples in
the historical guide. Generic persona/legacy workflows remain available only
within these constraints; generated legacy Build snapshots remain non-authoritative.
