# V4 Auto P1 — implementation plan: AGY executor for `implement_slice`

Parent design: `.agents/docs/v4-auto-design.md` §2 (read §1–§2 and §8 only).
Status: **READY FOR IMPLEMENTATION** (2026-10-07).

## 0. Phase rules

Follow `README.md` common rules (worktree, lane, baseline, no live runtime,
no weakening, one commit per task). Known baseline before P1: `test:v4`
554 pass / 0 fail / 1 skip; Python 46 passed. T8 is the owner gate G1, not
implementer work.

## 1. Facts established from the code (do not re-derive)

- `implement_slice` checkpoint requires the dirty worktree to equal exactly
  `owned_paths`, with an empty index (`buildPreview` in
  `.agents/scripts/v4-action-kernel.mjs:328`: `DIRTY_INDEX`,
  `DIRTY_SCOPE_MISMATCH`, `IMPLEMENTATION_SCOPE_NOT_DIRTY`). AGY editing the
  working tree without committing fits this model directly.
- Consequence: the delivered `.orca-contract/contract.md` is untracked and would
  be a dirty path. **The Lead must delete it after the scope gate and before
  `prepare`.** The scope gate's contract-SHA check runs while it still exists.
- `slices[].scope.paths` is already read by `compile-v4-context.mjs`
  (`knownScope`, ~line 272) but is not validated by `check-story-plan.mjs` and
  no current Plan declares it.
- The receipt reader (`check-artifact-contract.mjs:124 readReceiptRecord`)
  checks identity fields and `commands`; it ignores extra keys. The digest is
  over the whole receipt, so an added key is covered by `receipt_refs` digest.
- Implementation receipts are built in `buildMetadata` (`v4-action-kernel.mjs:525`)
  from `preview`; the preview fingerprint covers every preview field.
- Risk is Story-level (`plan.risk.level`); P1 does not change that.
- `check-worker-scope.mjs` exports `inspectScope(worktree, base, allowed, {forbidCommits, contractSha256})`
  and `isAllowed`; reuse them, do not duplicate logic.
- Lazy references per action are declared in `compile-v4-context.mjs` `ACTIONS`
  (`lazy: [...]`, line ~14–66); the instruction-context tests and
  `.agents/scripts/fixtures/v4-architecture/instruction-basis.json` bind those
  digests and will need a deliberate, reviewed update (T5).

## 2. Target behaviour

```text
Plan slice declares  executor: agy  + scope.paths: [...]   (fixed at start_story)
Lead:
  1 check-slice-implementation → FRESH (clean tree)
  2 compile-v4-context → READY; file_scope and checks must be KNOWN
  3 build-worker-contract.mjs → contract file + sha256 + allow list
  4 deliver via V3.2 recipe (owner/Lead, not tested in CI) → worker_done
  5 check-worker-scope.mjs --forbid-commits --contract-sha256 → PASS
  6 delete .orca-contract/contract.md
  7 rerun the slice's verification commands itself (fresh evidence)
  8 check-slice-implementation --resume-path <each changed path> → RESUME_WORKTREE
  9 Runner prepare (with worker evidence) → checkpoint → verify_slice successor
```

Worker claims are never evidence; steps 5, 7 and the kernel's own re-check are.

## 3. Tasks

### T1 — Plan schema: `executor` and `scope.paths` validation

Files: `.agents/scripts/check-story-plan.mjs`, `check-story-plan.test.mjs`,
`.agents/docs/v4-artifact-contract.md` (Plan section).

- `slices[].executor`: optional, `lead` | `agy`; absent means `lead`. Any other
  value → `INVALID` reason `SLICE_EXECUTOR_INVALID`.
- When `executor: agy`:
  - `scope.paths` must be a non-empty array → else `AGY_SCOPE_REQUIRED`.
  - Each entry must satisfy `normalizeAllowed` from `check-worker-scope.mjs`
    and equal its normalized form → else `AGY_SCOPE_INVALID`.
  - No entry may be or contain an authority path: `AGENTS.md`, `CLAUDE.md`,
    `.agents/`, `.agent-state/`, `.orca-contract/`,
    `_bmad-output/implementation-artifacts/` → `AGY_SCOPE_AUTHORITY_PATH`.
    A directory entry like `src/` that is a prefix of none of them is fine; an
    entry that is a prefix of one (e.g. `./` or `_bmad-output/`) is rejected.
  - `verification_obligations` must be a non-empty array → `AGY_CHECKS_REQUIRED`.
- `scope.paths` on a `lead` slice is accepted and not otherwise validated (keeps
  existing Plans valid).
- Tests: valid agy slice READY; each reason code; existing Plan fixtures
  unchanged status.

### T2 — Contract builder

New files: `.agents/scripts/build-worker-contract.mjs`, `build-worker-contract.test.mjs`.

CLI:

```text
node .agents/scripts/build-worker-contract.mjs build <story-id> <slice-id> \
  --expected-head <sha> --attempt <n> --run-id <id> --task-id <id> \
  --preamble-file <path> --out <worktree>/.orca-contract/contract.md \
  [--correction-of <prior-report-path> --finding <id>...]
```

- Calls `compileActionContext(root, storyId, 'implement_slice', sliceId, { expectedHead })`
  exported by `compile-v4-context.mjs` (check its option names; do not change
  its CLI output). Refuse unless `READY`, `file_scope.status === 'KNOWN'`,
  `checks.status === 'KNOWN'`, and the slice is `executor: agy` →
  statuses `BLOCKED` with reasons `CONTEXT_NOT_READY`, `SCOPE_UNKNOWN`,
  `CHECKS_UNKNOWN`, `NOT_AGY_SLICE`.
- Renders `.agents/templates/worker-contract.md` fields deterministically from
  the projection only: tasks, AC excerpts as projected, scope paths (one per
  line), `Dispatch base: <expected-head>; commits allowed: no`, verification
  commands, report locations, `Worker: Antigravity`. Placeholders it cannot fill
  from the projection or flags are an `INVALID` error, never left as `<...>`.
- Output bytes = preamble file bytes + `\n\n` + rendered contract; LF line
  endings; UTF-8 without BOM. Writes only `--out`; creates its parent directory.
- Stdout: one JSON `{schema:"worker-contract-v1", status, contract_path,
  contract_sha256, allow:[...], base, attempt}`; exit codes follow the Runner
  table (0 READY, 3 BLOCKED, 4 INVALID, 5 ERROR).
- Same inputs → identical bytes and sha256 (test it).
- Tests use a temp repo fixture with a minimal schema-v2 Story/Plan; reuse the
  existing fixture helpers (`v4-architecture-fixture.mjs` or the helpers used by
  `compile-v4-context.test.mjs`) rather than new fixture machinery.

### T3 — Kernel: worker evidence and in-kernel scope re-check

Files: `.agents/scripts/v4-action-kernel.mjs`, `v4-action-kernel.test.mjs`
(or a new `v4-agy-executor.test.mjs`).

- `prepare` request accepts optional `worker` object:

  ```json
  {
    "executor": "agy",
    "orca": { "run_id": "...", "task_id": "...", "dispatch_ids": ["ctx_..."] },
    "attempt": 1,
    "contract_sha256": "<64 hex>",
    "worker_report_sha256": "<64 hex>",
    "lead_vendor": "codex|claude"
  }
  ```

- If the slice is `executor: agy`: `worker` is required (`WORKER_EVIDENCE_REQUIRED`);
  shape errors → `WORKER_EVIDENCE_INVALID`. If the slice is `lead`: a `worker`
  key → `WORKER_EVIDENCE_FORBIDDEN`.
- For agy slices `buildPreview` additionally:
  - runs `inspectScope(root, request.expected_head, slice.scope.paths, { forbidCommits: true })`
    and requires `PASS` → else `AGY_SCOPE_GATE_<STATUS>` (blocked, not error),
    with the gate's violations in the result;
  - requires every `owned_paths` entry to be `isAllowed` by `slice.scope.paths`
    → `AGY_OWNED_PATH_OUT_OF_SCOPE`;
  - rejects deletions in the gate's `changed` list → `AGY_DELETE_UNSUPPORTED`
    (P1 does not support worker deletions);
  - stores `worker` plus a compact `scope_gate` result
    (`schema`, `status`, `base`, `allowed`, sorted changed paths) in the preview.
- `validateMetadataProjection`: the generated Plan must keep the current
  slice's `executor`, `scope` and `verification_obligations` identical to the
  original (`SLICE_EXECUTION_CONTRACT_CHANGED`), so a plan template can never
  widen scope or switch executor mid-slice.
- The checkpoint transaction re-runs the same gate after acquiring the lock (the
  existing post-lock revalidation point); a different result → `STALE`
  `AGY_SCOPE_GATE_CHANGED`.
- `buildMetadata`: for agy slices add `worker: { ...worker, scope_gate }` to the
  implementation receipt. For lead slices the receipt is unchanged (assert an
  existing fixture's receipt digest is identical).
- Tests: happy path receipt contains `worker`; missing/forbidden/invalid worker;
  out-of-scope file; worker commit since base; deletion; tree changed between
  prepare and checkpoint; lead slice digest unchanged.

### T4 — Receipt validation of worker evidence

Files: `.agents/scripts/check-artifact-contract.mjs`, its tests,
`.agents/docs/v4-artifact-contract.md` (receipt paragraph).

- For an implementation receipt whose Plan slice is `executor: agy`: require
  `worker.executor === 'agy'`, `worker.scope_gate.status === 'PASS'`,
  `worker.scope_gate.base === receipt.baseline_commit`, and
  `worker.scope_gate.allowed` equal to the slice's `scope.paths`
  → `WORKER_EVIDENCE_MISSING` / `WORKER_EVIDENCE_MISMATCH`.
- Lead-slice receipts: unchanged rules; a `worker` key there →
  `WORKER_EVIDENCE_UNEXPECTED`.
- Document the optional `worker` object in one compact paragraph.

### T5 — Action contract and lazy reference

Files: `.agents/skills/v4-story-runner/actions/implement-slice.md`,
new `.agents/skills/v4-story-runner/references/agy-executor.md`,
`.agents/scripts/compile-v4-context.mjs` (`ACTIONS.implement_slice.lazy`),
instruction-context fixtures/tests that bind these digests.

- `implement-slice.md`: add at most two sentences: when the slice declares
  `executor: agy`, load `references/agy-executor.md`; otherwise behaviour is
  unchanged. Keep the action document within the existing context budget test.
- `references/agy-executor.md` (≤ ~60 lines): the §2 steps 1–9 with exact
  commands (T2 builder, V3.2 delivery by reference to
  `.agents/policies/orchestration-v3.md` "V3.2 Antigravity loop operations",
  scope gate, contract deletion, fresh rerun of checks, `--resume-path`,
  prepare/checkpoint with `worker`), the correction loop (reopen Orca task to
  `ready`, ≤3 attempts, only VALID findings, new contract via
  `--correction-of`), and stop conditions (scope gate not PASS, contract
  modified/missing, local permission/trust/sign-in prompt, ambiguity → owner).
- Register the reference as lazy for `implement_slice` with a trigger
  "Load only when the current slice declares executor: agy."
- Update the bound digests in instruction-basis fixtures through the project's
  existing regeneration path (find it in `measure-v4-instruction-context` /
  `v4-architecture-baseline` tests); if none exists, stop and report rather than
  hand-editing digests.

### T6 — Authority text

Files: `AGENTS.md` (Story and provider routing paragraph), `.agents/routing/task-router.md`.

- One sentence in `AGENTS.md`: a V4 Story slice whose validated Plan declares
  `executor: agy` may deliver that slice to Antigravity per
  `references/agy-executor.md`; this is not V3 fallback, and the Lead still owns
  scope gate, checkpoint, verification and review.
- One clause in the router's V4 Story line pointing to the same reference.
- Keep every string asserted by `_bmad/scripts/tests/test_agent_architecture.py`
  and the `v4-*.architecture.test.mjs` suites; run them after editing.
- Do not touch the V4 Lite migration lane paragraph (it still forbids Orca/AGY
  during migration work).

### T7 — End-to-end fixture test (no real AGY)

New file: `.agents/scripts/v4-agy-executor.e2e.test.mjs` (picked up by
`npm run test:v4` glob `*.test.mjs`).

In a temp Git repo with a schema-v2 Story and Plan (one LOW slice,
`executor: agy`, `scope.paths: ["src/"]`, one verification obligation):

1. Runner/kernel reports `implement_slice` current; builder emits a contract.
2. Simulate the worker: write the contract file, modify `src/a.js`, add
   `src/a.test.js`.
3. Scope gate with contract sha → PASS; delete the contract file.
4. `prepare` with `worker` → READY; `checkpoint` → two commits; Plan
   `next_action` is `verify_slice:<slice>`; receipt has `worker.scope_gate.status: PASS`;
   `check-story-plan` READY; T4 validator clean.
5. Negative runs from the same start: out-of-scope file → blocked; worker
   commit → blocked; contract file left in place → `DIRTY_SCOPE_MISMATCH`.

### T8 — Live smoke (owner-supervised, NOT part of the implementer's work)

After T1–T7 are committed and green, the owner and a Lead run one real LOW
slice through AGY in a disposable smoke worktree using
`references/agy-executor.md`. Exit evidence for P1: the receipt with real Orca
IDs and a PASS scope gate, and `verify_slice` reached. Findings feed P2.

## 4. Definition of done for the implementer

- T1–T7 committed on the arch branch, one commit per task, each passing
  `npm run test:v4`.
- Final commit: full `npm run test:v4` (0 fail) and the Python architecture test
  green; counts reported against the baseline.
- `executor: lead` behaviour and existing receipt digests unchanged (proven by
  tests, not asserted in prose).
- Report: commits, test counts, any deviation from this plan with reason, and
  open questions. Do not start T8 or P2.
