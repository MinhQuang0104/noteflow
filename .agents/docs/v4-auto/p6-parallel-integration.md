# V4 Auto P6 — implementation plan: parallel Stories and integration

Design: `.agents/docs/v4-auto-design.md` §6, §7. Requires P5. Status:
**READY AFTER P5** (T1–T4); T5 waits for the owner DB decision (§0).

## 0. Phase rules and owner prerequisite

Follow `README.md` common rules.

**Owner decision before G5 (not implementer work):** test databases are shared.
`backend/phpunit.xml` forces `DB_DATABASE=noteflow_test` (`force="true"`), and
`tests/e2e/helpers/` use a fixed DB. Changing that is product work and goes
through a normal BMAD Story, not this lane. Options for the owner: per-worktree
DB name from an env var, or schema prefix. Until it lands, T5's resource lock
serializes Stories that need these databases.

## 1. Facts established from the code (do not re-derive)

- **Rebase is unsafe for approved Stories.** `human_approval` binds
  `approved_commit` / `approved_review_head` and checkpoint SHAs; rebasing the
  Story branch rewrites them and makes the approval stale. Completion checks
  already support "HEAD moved past the completion commit (an integration
  merge)" (`v4-artifact-contract.md`, completion paragraph). Integration must
  therefore **merge**, never rebase. This corrects design §7 ("rebases onto
  main"); update that sentence in T6.
- `start_story` and `complete_story` write the Story's own entry in
  `_bmad-output/implementation-artifacts/sprint-status.yaml` on the Story
  branch. Different Stories touch different lines, so a Git merge usually
  succeeds; a conflict must stop for the owner, never be auto-resolved. This
  replaces design §6's "lifecycle written only at integration" (record in T6).
- `slices[].scope.paths` exists from P1; registry `declaredScope` from P5.

## 2. Target behaviour

- Claim refuses overlapping scope and hot paths (hard, D6), and overlapping
  declared resources (shared DBs).
- After `complete_story` (owner-approved, `done`), an integration command
  merges the Story into `main` through a queue: test the merge result in a
  scratch worktree, then fast-forward `main` to that tested merge commit.

## 3. Tasks

### T1 — Hot-path configuration

New: `.agents/config/hot-paths.json` (schema `hot-paths-v1`), loader in
`.agents/scripts/story-scope.mjs` (+tests).

- Content: the groups and paths of design §6 table, each entry
  `{path, group, overridable}`; control-plane entries `overridable: false`.
- Loader validates entries with `normalizeAllowed` and rejects duplicates.

### T2 — Overlap check

`story-scope.mjs` + tests; wired into `story-registry.mjs claim` (P5).

- `overlaps(a, b)`: true when an entry of one equals or is a directory prefix of
  an entry of the other (both directions).
- Claim: refuse when the new Story's declared scope overlaps any active
  Story's scope (`CONFLICT` `SCOPE_OVERLAP` with Story IDs and paths), or both
  touch the same hot path (`HOT_PATH_CONFLICT`). `--allow-overlap "<reason>"`
  (owner) records `overlapOverride` and is rejected for non-overridable entries.
- Claim refuses a Plan without `scope.paths` on every pending slice
  (`SCOPE_UNDECLARED`), since unknown scope cannot be checked.
- Before each AGY dispatch: `story-scope.mjs check-slice <story> <slice>`
  re-checks the slice scope against active Stories (called from
  `references/agy-executor.md`).

### T3 — Integration command

New: `.agents/scripts/integrate-story.mjs` (+tests in temp repos with two
worktrees).

```text
integrate <story-id> --generation <n> --canonical <path-to-main-checkout>
```

1. Preconditions: registry record held at `generation`; Plan
   `lifecycle_snapshot: done` and `check-story-completion.mjs` READY; canonical
   checkout is on `main` and clean (else `BLOCKED` `CANONICAL_NOT_CLEAN`).
2. Acquire `<common>/noteflow-v4-runs/integration.lock` (`wx`; held → `CONFLICT`
   `INTEGRATION_BUSY`; the queue is first-come retry, no daemon).
3. Create a scratch worktree at `main`, `git merge --no-ff <story-branch>`
   with message `merge(story-<id>): integrate`. Any conflict → abort the merge,
   remove the scratch worktree, `BLOCKED` `MERGE_CONFLICT` with paths.
4. Run the integration checks from `.agents/config/integration-checks.json`
   (owner-maintained list; initially `npm run test:v4` and
   `check-story-completion.mjs check <id>` on the merge). Any failure →
   `BLOCKED` with logs, nothing changes on `main`.
5. In the canonical checkout: verify `main` is still the base used in step 3,
   then `git merge --ff-only <scratch-merge-commit>`. If `main` moved → `STALE`
   `MAIN_MOVED` (rerun from step 3).
6. `release --merged` in the registry; remove the scratch worktree; release the
   lock. Never push.
- Tests: clean merge; conflict; failing check; main moved; lock busy; approval
  still valid after merge (completion check READY at the new main).

### T4 — Status additions

`story-registry.mjs status`: per Story show `INTEGRATING`, `MERGE_CONFLICT`,
`READY_TO_INTEGRATE` (done + completion READY), plus the hot paths it holds.

### T5 — Resource locks (shared databases)

- Plan optional `resources: [...]` (e.g. `backend-test-db`, `e2e-db`),
  validated against a list in `hot-paths.json` `resources`; claim refuses a
  resource held by another active Story (`RESOURCE_CONFLICT`).
- Until the owner DB decision lands, `references/agy-executor.md` and the
  contract builder add `backend-test-db` automatically when a slice's checks
  run backend tests, and `e2e-db` for E2E, so such Stories serialize.

### T6 — Docs

- `v4-auto-design.md` §6/§7: replace "rebase" with the tested-merge flow and
  record that lifecycle entries are written on the Story branch and merged.
- `references/autopilot.md`: integration steps after `complete_story`.

## 4. Owner gate G5

Owner runs two independent Stories (no shared scope/hot paths/resources) in
parallel, both integrated by the command. Exit evidence: both merged with valid
approvals, registry empty afterwards.

## 5. Done

T1–T6 committed, full `test:v4` + Python green, README status updated. Do not
start P7 before G5.
