# `implement_slice` action

One bounded action may change only the current slice's implementation files, tests, and contracts, then persist `verify_slice:<same-slice>`. It never verifies, advances lifecycle, implements another slice, or grants review/Human Gate.

## Read-only gate and projection

```text
node .agents/scripts/check-slice-implementation.mjs check <story-id> <slice-id> [--exclude-unrelated <exact-path>]... [--resume-path <exact-path>]... [--checkpoint-candidate <exact-commit>]
```

Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`; use the returned mode (`FRESH`, `RESUME_WORKTREE`, `CHECKPOINT_UNRECORDED`, `PLAN_UPDATE_PENDING`, or `COMPLETE`) exactly. Preserve HEAD; inspect current Story/AC, direct consumers/tests, and named anchors; use RED → GREEN → refactor, fresh checks, and exact-diff inspection.

Compile provenance-bound context and continue only on `READY`:

```text
node .agents/scripts/compile-v4-context.mjs check <story-id> --action implement_slice --slice <slice-id> --expected-head <head>
```

Use projected tasks/AC/risk/dependencies exactly. `UNKNOWN` scope/consumers/checks is not an empty allowlist. HIGH risk needs applicable negative/security/concurrency/contract/recovery evidence; never lower risk or turn canonical `INCOMPLETE` into `PASS`.

For the CLI Runner, persist the exact context payload as JSON and name the
operation explicitly:

```text
node .agents/scripts/v4-story-runner.mjs run <story-id> \
  --expected-head <head> --operation prepare --input <payload.json>
node .agents/scripts/v4-story-runner.mjs run <story-id> \
  --expected-head <head> --operation checkpoint --input <payload.json>
```

The payload file is one JSON object and is bound to the current Plan before
dispatch. Do not substitute chat text or an inline JavaScript harness.

## Two-commit durability

Stage exact paths only; never `git add .`/`-A`. The checkpoint excludes Plan, receipts, lifecycle files, and unrelated noise. A separate metadata commit records baseline/checkpoint, changed-path digest, fresh check/red-green evidence (or a reason), the receipt contract, and `verify_slice`; schema-v2 contains exactly the current Plan and new receipt, while schema-v1 keeps its Plan-only contract.

After the Git-common lock, recheck HEAD, Plan/Story/policy/recipe digests, exact scope, and command evidence; staged-set hook changes fail. A partial transaction preserves files/index/lock/journal and returns `RECOVERY_REQUIRED`; recovery names an explicit checkpoint/input and never replays from chat. Completed work is `NOOP`, never a third commit.

Load implementation techniques only for the recipe and recovery only for an observed recovery condition; both are subordinate references.
