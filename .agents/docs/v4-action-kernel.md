# V4 Lite action kernel

The action kernel is mechanical plumbing for an explicitly authorized
`implement_slice` operation. It does not choose product scope, infer semantic
ownership from a commit subject, evaluate whether evidence proves an AC, or
grant a Story/lifecycle approval.

## Interface

`prepareAction(root, input)` is read-only. The input must name the Story,
current slice, `implement_slice`, expected HEAD, exact implementation paths,
the metadata Plan template, selected command evidence, semantic coverage, and
the policy/recipe inputs whose bytes are being used. The returned preview binds
the working-tree bytes and modes, Plan/Story digests, policy/recipe digests,
context/evidence digests, pointer digest, metadata paths, and transaction ID.

`checkpointImplementation(root, { ...input, operation: "checkpoint", preview })`
rechecks that preview after acquiring the Git-common transaction lock. It
stages only the declared implementation paths and creates the implementation
checkpoint first. Schema v2 then writes a new implementation receipt from the
actual checkpoint identity and commits exactly `Plan + receipt`; schema v1
commits exactly the Plan. The Plan successor is always
`verify_slice:<same-slice>`.

`inspectActionTransaction(root, transactionId)` reads the common-directory
journal and lock. A partial transaction is `RECOVERY_REQUIRED`; files, index,
lock, and journal remain available for inspection. Explicit recovery may
continue metadata persistence only when a human-authorized recovery input and
the journal's checkpoint identity are supplied. It never replays implementation
or deletes a lock as a shortcut.

## Boundaries and recovery

The lock identity includes repository, worktree, action, slice, and
transaction. Its scope is only this kernel transaction; it is not a universal
coordination lock for arbitrary Git tools. The journal is written before any
product/index mutation and records phases and checkpoint identity. Staged sets,
commit scopes, file bytes, modes, hooks, and final cleanliness are checked
against the preview. A hook that adds or changes scope produces
`RECOVERY_REQUIRED` after preserving the partial state.

The runner calls the kernel only when an explicit operation and structured
input are supplied. The existing readiness helper remains read-only. No
verification, review, finalization, completion, or approval runs in the same
invocation.
