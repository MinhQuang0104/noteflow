# Current V4 integration acceptance summary

Date: 2026-09-29

## Decision

**READY_FOR_HUMAN_MERGE** for the exact integration scope recorded here.

This is a technical handoff state. It is not a merge, push, Human Gate
approval, adoption record, rollout decision, or Story completion decision.

## Identity and scope

| Identity | Value |
|---|---|
| Main base | `c7c8eb4ca634f21bdc4ddeb928affe4610863782` |
| Tested source | `0e4c6b939f2a186399b483718601e86b44a694b5` |
| Source handoff | `f9af34659d4059a0febeaa86698a841e58a00cf6` |
| Candidate implementation | `ad9c18d28503301cec96a113b21aa41b215c2723` |
| Documentation content commit | `88ce9d91383d8efbfdd0815fb59fb98ea9f19abe` (`docs(v4): close integration evidence provenance`) |

The candidate implementation consists of the migration commit
`9e4b831d78bfe32d693b89b9fff6b9618be876cb` and the mechanical Feature Map
anchor refresh `ad9c18d28503301cec96a113b21aa41b215c2723`. The documentation
commit(s) in this report add no implementation or lifecycle behavior.

The implementation diff is `79` files, `11364` insertions and `270`
deletions, with `git diff --check` passing. The final documentation/evidence
diff is restricted to this acceptance report directory. No product,
Story/Plan/sprint lifecycle, receipt, or V3 runtime file was changed by this
closure work.

## Three separate states

| Layer | Current statement | Authority/evidence |
|---|---|---|
| Original requirement | The Plan's six capabilities, invariants, exact-scope rules, Human Gate and U2 `>=30%` byte target remain unchanged. | Byte-preserved main Plan snapshot and Plan text |
| Implementation/evaluation | The candidate implementation and deterministic acceptance are verified for the original scope. | Batch D reviewer report plus integration candidate evidence |
| Human adoption | Not performed. No adoption record, merge, push, rollout, or Story execution exists. | Explicit scope restriction and empty adoption state |

The main Plan's `PLAN ONLY` status is a creation-time status from 2026-09-27;
it is not evidence that later authorized work did not occur. The original
bytes are preserved in `source-plan-2026-09-27-original-main.md` rather than
overwriting the untracked main file. The source handoff Plan's `UNDER_REVIEW`
header and later R07--R08 completion text are retained as historical timeline
layers, not silently normalized.

## F01--F03 current disposition

The Batch A `findings.json` remains the historical Batch A ledger. Its
`OPEN` statuses and `final_r08_verdict: NOT_ISSUED` are not edited. The current
disposition below is a new integration-state conclusion backed by the later
review and fresh candidate evidence.

| Finding | Historical state | Current evidence | Current disposition |
|---|---|---|---|
| F01 evidence trust boundary | Batch A `OPEN`, valid HIGH finding | Batch D says `VERIFIED_FIXED`; current candidate bundle is execution-bound, `evidence.status=VERIFIED`; self-compare is `COMPARABLE`; the legacy consumer chain remains fail-closed `INCOMPARABLE/INCONCLUSIVE`. | `VERIFIED_FIXED` for original scope |
| F02 original U2 acceptance | Batch A `OPEN`; historical Plan wording was ambiguous about completion | Original threshold remains unchanged. Current Git-blob measurement is `30.31%` for `implement_slice` and `30.26%` for `verify_slice`; both exceed 30%. | `VERIFIED_FIXED` for original scope |
| F03 common measurement basis | Batch A `OPEN`; old basis was not reproducible | Locked basis digest, action/profile/input identity and candidate source bindings are present; 10/10 candidate working-tree bindings match; old migration-note binding is separately marked `UNVERIFIED/SUPERSEDED` in the errata. | `VERIFIED_FIXED` for current evidence; historical binding superseded, not rewritten |

See `integration-evidence-errata.md` for the two exact checksum findings and
`integration-evidence-index.json` for all current raw references and hashes.

## Current candidate evidence

- Full control-plane command:
  `node --test @V4AcceptanceTests`.
  Result on candidate implementation HEAD: `419` tests, `418` pass, `0`
  fail, `1` Windows symlink skip, exit `0`. The skip remains a limitation;
  it is not relabelled as a pass.
- Frontend gates ran under Node `v24.21.0` and npm `11.6.4`:
  type-check exit `0`, focused five-recipe-file unit gate passed, and
  `contract:check` exit `0`.
- Feature Map checks after the main-state anchor refresh:
  `challenge-list`, `journal-frontend` and `today-view` all returned
  `VALID`.
- Candidate L/M/H evidence is `COMPLETE_VERIFIED`. L is canonical `PASS`;
  M preserves raw `INCOMPLETE` and `REVIEW_REQUIRED` for the unmapped path;
  H preserves `STALE`, `RECOVERY_REQUIRED`, `CHECKPOINTED` and replay `NOOP`.
- U2 uses the locked basis
  `sha256:6a6749f33ccc57ca4649e4b9e2afa5d7597c0d7db5fdf1a6823a92af4e069998`:
  `implement_slice` is `65359 → 45551` bytes (`30.31%`), and
  `verify_slice` is `65359 → 45580` bytes (`30.26%`).
- Action boundary, exact scope, recovery, Human Gate and advisory-only
  learning negative paths passed in the full suite.

The raw run and candidate bundle are indexed by the new JSON evidence index;
the full-suite log is retained under the ignored `.agent-state` evidence
root. The implementation source paths and architecture fingerprint did not
change during this documentation-only closure, so the existing candidate
evidence remains reusable and the four historical batches were not rerun.

## Historical status reconciliation

- Batch A `findings.json`: historical initial review, `OPEN` and
  `NOT_ISSUED`; preserved unchanged.
- Source Plan top line: `UNDER_REVIEW`; later R07--R08 section records the
  independent `PASS_ORIGINAL_SCOPE` review. The top line is not treated as a
  current negative verdict.
- Batch D `final-decision.md`: `PASS_ORIGINAL_SCOPE` for the original
  deterministic scope, explicitly not human adoption or merge authority.
- Current integration conclusion: `READY_FOR_HUMAN_MERGE`, subject to human
  review of the exact listed commits and this documentation/evidence scope.

## Remaining limitations

Provider token usage, paired baseline quality, real-Story quality and empirical
pilot results remain `INCONCLUSIVE` or outside scope. The deterministic corpus
is non-regression evidence, not a universal Story-quality claim. Human
adoption remains pending by design.

## Human integration and rollback

The human may review and integrate the exact implementation commits, followed
by the documentation/evidence commits in this directory. The untracked main
Plan and existing Story work remain outside this candidate and are not
overwritten.

If rollback is needed after integration, use forward revert commits for the
exact candidate commits, newest first. Do not reset, clean, stash, archive, or
delete the main worktree's pre-existing changes. The managed integration
worktree remains available for review and recovery.
