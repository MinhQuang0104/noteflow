# Agent Architecture V3

## Scope and authority

Phase 2A connects the durable control plane to the installed Orca runtime.
Tracked implementation execution is enabled only through an Orca-owned Run and
Task, with Antigravity as the fixed worker in an Orca-managed isolated Git worktree. Automatic
model switching, failover testing, lease enforcement, runtime reconciliation and
integration remain disabled. Missing infrastructure never implies direct Lead coding.
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
  mutation.lock                 # transient exclusive local lock, future writer
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
Schemas validate individual snapshots (JSON Schema draft-07); the future writer
must additionally check cross-file IDs, lease generation equality, monotonic
revisions, phase/status agreement, allowed transitions and current Git evidence.
Schema validity alone does not authorize a mutation or prove a lifecycle gate.
For an explicitly authorized non-product infrastructure smoke run, the `story`
identity names the canonical agent policy under test and must not update BMAD
Story or sprint state.

`lead/state.md` is at most 40 lines: run/revision, phase, task, worker status,
completed steps, important decisions, blocker, waiting-for, exact next action,
minimal artifact paths. `current-session.json` contains only schemaVersion,
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
1. Inspect canonical `.agent-state/active-run.json` (read-only, no lease needed).
2. With no active run and no contradictory evidence, enter NORMAL MODE. Initialize
   the idle pointer if absent under the mutation protocol when a write is needed.
3. With an active run, enter RESUME MODE. Read `run.json`, then `lead/state.md`;
   read `decisions.md` and current worker state/contract only when needed.
4. Do NOT read `events.jsonl` during ordinary resume. Do not load transcripts or
   full BMAD documents. Use pinned Story sections relevant to the next action.
5. Check identities, revision, source commit and relevant Git/worktree reality.
   Query actual Orca Run/Task/Dispatch and worktree status before
   dispatch/cancel/retry. Unknown status is not permission to create another task.
6. Reconcile under the ownership protocol before mutations. Continue `nextAction`;
   never duplicate a worker because the Lead session changed. Preserve human gate.

## Ownership and local mutation protocol

Lease fields: owner (opaque unique session ID), generation, acquiredAt, heartbeatAt.
First ownership is generation 1; every takeover increments generation, even for
the same engine/account. Lease generation equals run.leadGeneration. Null lease
means released ownership; it does not reset generation. No account tokens in state.

Phase 2B must implement a local exclusive-create lock at `mutation.lock` around
every mutating transaction, including active-run creation, ownership acquisition,
task creation, dispatch, cancellation, state transitions and integration actions.
This is a short filesystem critical section, not a distributed locking service.
All writers use the SAME canonical lock and reread run revision/lease inside it.
Verify owner and generation immediately before a side effect and hold the lock
through its durable result (or durable unknown-outcome marker). Stale generations
are fenced: abort instead of writing. Read-only inspection remains available.

Heartbeat is renewed on a meaningful checkpoint or before a mutating operation,
not on chat turns; no heartbeat event spam. Age alone never expires the lease.
Graceful takeover requires explicit release; emergency takeover requires evidence
the prior owner cannot mutate (terminated/fenced), or human-directed fencing.
An unreachable session with uncertain liveness -> NEEDS_HUMAN, read-only.
Never steal a lock just because its timestamp is old. A crashed lock requires the
same fencing and reconciliation before removal. Two contenders cannot both win
exclusive creation. Do not claim these policies enforce locking until Phase 2B
implements and tests them. During Phase 2A, runtime mutation requires an idle V3
pointer, one explicitly identified mutating Lead, generation 1, and serialized
checkpoints. If ownership is uncertain, stop in NEEDS_HUMAN; do not dispatch.

Checkpoint protocol under that lock: validate schemas and allowed transition,
assign revision/event sequence, write related projections via same-directory
temporary files and atomic replacement, then replace authoritative run.json,
append the event once (deduplicate by run/sequence), and update pointer last.
Multiple files are not an atomic transaction: interruption, mismatched revisions,
partial JSON or ambiguous external side effects require reconciliation before
further mutation. Never replay dispatch blindly. Recover projections from run.json
and verified Git/Orca evidence; use a bounded event tail if necessary. Preserve
corrupt files as recovery evidence rather than silently resetting them to IDLE.

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
LEAD_HANDOFF, STATE_RECONCILED, RUN_COMPLETED, RUN_CANCELLED. Exceptional condition
changes may use STATE_RECONCILED with a concise reason. No per-message checkpoints.

Graceful handoff: checkpoint, update lead snapshot and handoff template, persist
all current task/runtime identifiers, release lease under lock, then stop mutating.
New owner reconciles and acquires the next generation. Emergency handoff uses
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
