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

The owner applies these entries before G3. This reference does not edit either
vendor's settings.

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

Codex command-prefix allowlist: the same prefixes (`orca orchestration`,
`orca terminal`, `node .agents/scripts/`, `node --test`, and the read-only
`git status|diff|log|show|rev-parse|ls-files|merge-base|worktree list`).

Git stays read-only: the kernel scripts make every commit, and `AGENTS.md`
forbids reset, clean and stash, so `git add|commit|push|reset|clean|stash|
checkout|rebase|branch -D` keep prompting. Add a Story's own declared
verification commands (for example its `npm`/`php artisan test` lines) per
Story rather than broad `npm *` or `php *` entries.
