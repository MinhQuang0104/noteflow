# `implement_slice` action

`implement_slice` is one bounded Story action. It may change only the current
slice's implementation files, tests, and contracts, then persist the explicit
`verify_slice:<same-slice>` successor. It never runs verification as the next
action in the same invocation, advances lifecycle, executes another slice, or
grants review or Human Gate authority.

## Read-only preflight

Run:

```text
node .agents/scripts/check-slice-implementation.mjs check <story-id> <slice-id>
  [--exclude-unrelated <exact-path>]...
  [--resume-path <exact-path>]...
  [--checkpoint-candidate <exact-commit>]
```

Stop on `STALE`, `BLOCKED`, `INVALID`, or `ERROR`. `READY` may describe
`FRESH`, `RESUME_WORKTREE`, `CHECKPOINT_UNRECORDED`, `PLAN_UPDATE_PENDING`, or
`COMPLETE`; use the returned mode exactly. Dirty paths are relevant unless an
exact deterministic unrelated path is explicitly supplied. The helper is
read-only and never chooses implementation targets semantically.

For `FRESH` or `RESUME_WORKTREE`, preserve the returned HEAD as the baseline,
load only the current Story/AC scope and direct consumers/tests, and inspect
named architecture/UX references. Load the TDD recipe lazily and use
RED → GREEN → refactor. Before any completion claim, load the verification
recipe, run fresh focused checks, inspect the exact diff, and rerun the helper
with every exact owned path.

## Action context projection

Compile the read-only, provenance-bound context before semantic implementation:

```text
node .agents/scripts/compile-v4-context.mjs check <story-id>
  --action implement_slice --slice <slice-id> --expected-head <head>
```

Continue only on `READY`. Use the selected tasks/AC and Story risk exactly as
projected. An `UNKNOWN` file scope, consumer set, or check set is not an empty
allowlist; obtain or inspect evidence explicitly before choosing implementation
paths. The projection does not authorize a broader scope or a successor.

HIGH-risk slices require targeted negative, security, concurrency, contract,
or recovery evidence where applicable. Never lower risk to avoid review and
never turn canonical `INCOMPLETE` into `PASS`.

## Two-commit durability

Stage exact implementation paths only; never use `git add .` or `git add -A`.
The implementation checkpoint commit excludes the Story Plan, receipts,
lifecycle files, and unrelated noise. It must have a non-empty exact path set.

The separate metadata commit records the real baseline/checkpoint, changed-path
digest, focused checks, red/green evidence or a non-applicability reason, and
`next_action.kind: verify_slice`. For schema-v2 the implementation receipt is
created after the checkpoint and the metadata commit contains exactly the Plan
and that new receipt. Schema-v1 keeps the exact Plan-only metadata contract.
No Story/sprint lifecycle field or receipt belonging to another slice may be
introduced by this transaction.

The apply path must recheck HEAD, Plan/Story/policy/recipe digests, exact file
scope, and command evidence after acquiring the Git-common lock. Hooks that
change the staged set are a failure. A partial transaction preserves files,
index, lock and journal and returns `RECOVERY_REQUIRED`; recovery requires an
explicit exact checkpoint/recovery input and never replays implementation from
chat history or commit messages. A completed transaction is idempotent and
returns `NOOP` with the same successor; it never creates a third commit.

## Lazy references

Load `references/implementation-techniques.md` only for the implementation
technique or review gate, and `references/recovery.md` only when a recovery or
partial transaction is observed. Those references add no authority.
