# V4 Story autopilot

Load this reference when preparing an owner-requested autopilot authorization
or when the Plan carries one.

1. Run `node .agents/scripts/v4-story-runner.mjs autopilot-status <story-id> --expected-head <sha> --lead-generation <n>` using the generation returned by this session's claim or owner-approved takeover.
2. If the result is `STOP`, report its reason and the exact owner decision needed, then end the turn.
3. For `CONTINUE`, load only the one action contract named by the durable Plan.
4. Run that action to its next durable state, then repeat from `autopilot-status`.

Each action re-reads the Plan, Git state, and receipts before acting. Chat
memory is never evidence, including after a context compaction or vendor change.

## Claim and generation

Before the owner records `authorize_autopilot`, claim the Story from its owning
worktree. The canonical V3 pointer must be `IDLE`, the Story checkout must be
READY, and its Plan must validate:

```text
node .agents/scripts/story-registry.mjs claim <story-id> --worktree <absolute-path> --lead-vendor codex|claude --session <session-id>
```

The result records the Lead and returns `record.generation`. Keep that value
for this session; an existing claim returns `STORY_ALREADY_CLAIMED` with its
holder. The owner then uses the Runner's `--authorize-autopilot <owner-json>`
operation with the current `--expected-head` and approved budgets. Authorization
is an owner operation and does not require a generation.

Pass `--lead-generation <n>` to Runner calls for `checkpoint`, `verify`,
`record-review`, `prepare-rework` / `apply-rework`, and `finalize_story` under
autopilot. Direct kernel requests carry the same value as `lead_generation`.
These Lead writes check the claim before acting and again immediately after
acquiring their transaction lock. Missing claim or generation stops with
`REGISTRY_CLAIM_REQUIRED`; a superseded generation stops with
`GENERATION_FENCED`. Report and stop; never adopt a new generation without the
owner's takeover decision.

Owner operations are never fenced: `--approve-exact-scope`, `complete_story`,
`record-owner-review`, `--authorize-autopilot` / `--revoke-autopilot`, and owner
or maintenance recovery. Read-only `prepare` and `autopilot-status` are not
fenced; status still reports claim or generation failures as STOP reasons.
`complete_story`, owner review and Human Gate remain manual (D-P5-a).

## Heartbeat, release and takeover

On each state change, update the registry with this session's generation:

```text
node .agents/scripts/story-registry.mjs heartbeat <story-id> --generation <n> --state <STATE>
node .agents/scripts/story-registry.mjs status --json
```

States are `IMPLEMENTING`, `WAITING_WORKER`, `REVIEWING`, `WAITING_HUMAN`,
`BLOCKED` and `INTEGRATING`. The dashboard derives `STALE?`, `ORPHANED` and
`WAITING_OWNER`; heartbeat age never grants authority or triggers takeover.

After merge, release the record with
`node .agents/scripts/story-registry.mjs release <story-id> --generation <n> --merged`.
For an explicit abort, `--abort` archives the record in `aborted/` and keeps the
worktree. Only the owner uses `--orphaned`, and only after the worktree is gone.
P5 provides these registry operations; integration remains the separate P6 lane.

Only the owner may replace a Lead:

```text
node .agents/scripts/story-registry.mjs claim <story-id> --takeover --lead-vendor codex|claude --session <replacement-session-id>
```

Takeover increments the generation and records the previous vendor, session
and generation. It preserves the Story's worktree and pinned policy. The new
session uses the returned generation, reloads the Plan and current Git state,
and resumes from `autopilot-status`; the previous session's writes are refused.

## Pinned policy

A claimed V4 Auto Story uses the policy at its registry `controlPlaneCommit`.
Run `node .agents/scripts/story-registry.mjs policy-drift <story-id>` to compare
`AGENTS.md`, the router, Runner skill and V3 policy with canonical `main`.
`NONE` means unchanged; report `INFO_DRIFT` and its paths as information, then
continue under the pinned policy until integration adopts the latest `main`.
Policy drift does not stop the Story or authorize a policy change in its scope.

## The verify step

One `verify_slice` step covers verification, review and `record-review`, and
the P2 policy rework path through its next durable state. If the step is
interrupted before that state, rerun it from the start; checks and pending
evidence are regenerated. `HUMAN_REVIEW_REQUIRED` and `HUMAN_REQUIRED` are
in-step outcomes: report them and stop rather than treating them as status
reasons.

After compaction, the context threshold, a crash, or a vendor switch, the
owner opens a fresh session and explicitly performs the takeover above. The
fresh session resumes from `autopilot-status` with its new generation.

Claude reaches the runner by its file path. Both vendors need the allowlists
below: Orca orchestration and terminal commands, the repository scripts, the
slice checks, and read-only git.

## Vendor allowlists

The repository's `.claude/settings.json` carries the Claude Code entries (owner
decision, 2026-10-08), so every Story worktree has them; a test keeps that file
equal to the block below. The owner applies the Codex entries once in Codex's
user configuration.

Claude Code `.claude/settings.json` (`permissions.allow`):

```json
{
  "permissions": {
    "allow": [
      "Bash(orca orchestration *)",
      "Bash(orca terminal *)",
      "Bash(node .agents/scripts/*)",
      "Bash(node --test *)",
      "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)",
      "Bash(git show *)", "Bash(git rev-parse *)", "Bash(git ls-files *)",
      "Bash(git merge-base *)", "Bash(git worktree list *)"
    ]
  }
}
```

Codex (checked on codex-cli 0.161.0): append to the user-level rules file
`~/.codex/rules/default.rules`, once for every worktree. Rules match whole
leading argv tokens, so scripts are listed one by one instead of a wildcard:

```python
prefix_rule(pattern=["orca", "orchestration"], decision="allow")
prefix_rule(pattern=["orca", "terminal"], decision="allow")
prefix_rule(pattern=["node", "--test"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/v4-story-runner.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-story-plan.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/compile-v4-context.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-slice-implementation.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-slice-verification.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/build-worker-contract.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-worker-scope.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-story-finalization.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/check-story-completion.mjs"], decision="allow")
prefix_rule(pattern=["node", ".agents/scripts/start-story.mjs"], decision="allow")
prefix_rule(pattern=["git", "status"], decision="allow")
prefix_rule(pattern=["git", "diff"], decision="allow")
prefix_rule(pattern=["git", "log"], decision="allow")
prefix_rule(pattern=["git", "show"], decision="allow")
prefix_rule(pattern=["git", "rev-parse"], decision="allow")
prefix_rule(pattern=["git", "ls-files"], decision="allow")
prefix_rule(pattern=["git", "merge-base"], decision="allow")
prefix_rule(pattern=["git", "worktree", "list"], decision="allow")
```

A command written with backslashes (`.agents\scripts\...`) or through `node -e`
does not match and still prompts.

Git stays read-only: the kernel scripts make every commit, and `AGENTS.md`
forbids reset, clean and stash, so `git add|commit|push|reset|clean|stash|
checkout|rebase|branch -D` keep prompting. Add a Story's own declared
verification commands (for example its `npm`/`php artisan test` lines) per
Story rather than broad `npm *` or `php *` entries.
