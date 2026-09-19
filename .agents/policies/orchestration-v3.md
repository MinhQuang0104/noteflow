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
    workers/<TASK-ID>/result.md
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
At each Lead session, use the resolved `orca` executable throughout. Verify it with
`orca status --json`, then load `orca skills get orchestration --full` before ANY
Orca orchestration mutation. Follow that version-matched guide rather than frozen
command assumptions in this policy.

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
with `orca terminal send`, and capture rendered completion evidence with
`orca terminal read --screen`. Then independently inspect the worker Git status,
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
