# `start_story` action

Use this action only for an explicit human request to start a named schema-v2
Story by V4 Lite. Planning approval, readiness, and this migration work are
different authorities. A planning approval alone never authorizes `apply`.

## Preconditions

Read the canonical `.agent-state/active-run.json` pointer first. Continue only
when it is clearly `IDLE` and no observed state contradicts it. Resolve the
Story ID from the canonical Story/Plan, never from branch names or chat history.

Run the read-only gate:

```text
node .agents/scripts/start-story.mjs check <story-id> --expected-head <sha>
  [--exclude-unrelated <exact-untracked-path>]...
```

Require `READY`. The gate must confirm committed schema-v2 Story/Plan/sprint
artifacts, matching planning and readiness digests, completed dependency sprint
keys, fresh pending slices with no execution/completion evidence, no blockers or
questions, complete Git inventory, expected HEAD, canonical IDLE, and exact
clean scope. Only explicitly named unrelated untracked noise may be excluded;
tracked changes, lifecycle paths, the Epic, and `.agent-state` cannot be
excluded.

The caller must record the actual human planning decision and every Story
dependency in the Plan. The helper validates bindings but cannot infer omitted
dependencies or invent approval.

## Apply and stop boundary

Pass the exact read-only fingerprint and expected HEAD to:

```text
node .agents/scripts/start-story.mjs apply <story-id> --expected-head <sha>
  --fingerprint <sha256:digest>
  [--exclude-unrelated <exact-untracked-path>]...
```

The transaction takes an exclusive `v4-start-story.lock` in the Git common
directory, rechecks freshness, writes only the Story/Plan/sprint lifecycle
projection, verifies the exact staged set, and commits it. Success returns
`STARTED`, leaves every slice pending, and persists
`next_action: implement_slice:<current>`. It must stop there; it does not
implement the successor, create evidence, alter V3 runtime state, or grant
completion approval.

If a write, stage, hook, or commit fails, preserve files, index, HEAD, journal,
and lock. Report `RECOVERY_REQUIRED`; never delete the lock, reset, clean,
stash, or retry automatically.
