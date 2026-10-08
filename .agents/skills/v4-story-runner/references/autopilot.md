# V4 Story autopilot

Load this reference only when the Plan carries an autopilot authorization.

1. Run `node .agents/scripts/v4-story-runner.mjs autopilot-status <story-id> --expected-head <sha>`.
2. If the result is `STOP`, report its reason and the exact owner decision needed, then end the turn.
3. For `CONTINUE`, load only the one action contract named by the durable Plan.
4. Run that action to its next durable state, then repeat from `autopilot-status`.

Each action re-reads the Plan, Git state, and receipts before acting. Chat
memory is never evidence, including after a context compaction or vendor change.

## The verify step

One `verify_slice` step covers verification, review and `record-review`, and
the P2 policy rework path through its next durable state. If the step is
interrupted before that state, rerun it from the start; checks and pending
evidence are regenerated. `HUMAN_REVIEW_REQUIRED` and `HUMAN_REQUIRED` are
in-step outcomes: report them and stop rather than treating them as status
reasons.

After compaction, the context threshold, a crash, or a vendor switch, the
owner opens a fresh session. The fresh session resumes from `autopilot-status`.

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
