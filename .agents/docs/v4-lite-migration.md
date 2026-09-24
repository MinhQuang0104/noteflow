# V4 Lite Migration

## Status

**COMPLETE.** Final architecture acceptance: **Step 51 — PASS**. The tracked working tree after the Step 52 checkpoint was clean. V3.1 remains available as fallback for ordinary and non-V4 work. This record is historical and operational reference, not mandatory runtime context.

## Objectives

Reduce token and context overhead while preserving output quality. Keep V3.1 fallback during migration, move deterministic work out of LLM reasoning, and review only when risk or evidence requires it.

## Final Control Flow

```text
AGENTS.md → task router → bounded context
  → Feature Map / recipe where applicable → deterministic verification
  → escalation
    ├─ NO_REVIEW
    └─ REVIEW_REQUIRED → Change Evidence → targeted same-Lead review
```

V3 is not eagerly loaded on the healthy V4 path. Orca, AGY, and subagents are not required.

## Core Components

| Component | Role |
|---|---|
| `AGENTS.md` | Authorizes the V4 migration lane and preserves V3 fallback. |
| `.agents/routing/task-router.md` | Selects bounded context by task. |
| `.agents/context/*.md` | Provides lazy, concern-specific guidance. |
| `.agents/features/challenge-list.json` | Navigation metadata and mapped anchors for the pilot. |
| `.agents/scripts/check-feature-map.mjs` | Validates mapped anchors deterministically. |
| `.agents/verification/challenge-list.json` | Reuses Feature Map scope for pilot checks. |
| `.agents/scripts/check-verification.mjs` | Routes and records deterministic verification. |
| `.agents/scripts/check-escalation.mjs` | Decides whether review is required. |
| `.agents/scripts/prepare-change-evidence.mjs` | Produces bounded structured delta evidence. |
| `.agents/review/targeted-reviewer-contract.md` | Bounds same-Lead review and judgments. |

## Verification Contract

Explicit: `node .agents/scripts/check-verification.mjs check <feature> --changed <path>`. Auto: `node .agents/scripts/check-verification.mjs check auto --changed <path>`. Repeat `--changed` for multiple caller-supplied paths. Exit codes: `PASS` 0, `FAIL` 1, `INCOMPLETE` 2, `ERROR` 3. No applicable recipe yields canonical `NOT_APPLICABLE` with `INCOMPLETE` and no claimed checks. Mixed mapped and unmapped scope retains all paths and remains `INCOMPLETE`.

## Escalation Contract

Clean, complete LOW `PASS` without judgment flags → `NO_REVIEW`. MEDIUM or HIGH → `REVIEW_REQUIRED`. `FAIL`, `INCOMPLETE`, or `ERROR` → `REVIEW_REQUIRED`. Supported judgment flags can also require review.

## Change Evidence Contract

Modes: `working-tree-vs-HEAD` and `explicit-pair`, with explicit paths. Hard budgets: paths ≤ 4, hunks/path ≤ 6, total diff lines ≤ 240. Outcomes and exit codes: `OK` 0, `NO_CHANGE` 1, `SPLIT_REQUIRED` 2, `UNSUPPORTED` 3, `INVALID_INPUT` 4, `ERROR` 5. Actual-delta review uses structured Change Evidence; manual Git patch reconstruction is unnecessary.

## Targeted Review

V4 Lite v1 uses the same Lead. Review the supplied actual delta, not the whole current state. Forward deterministic verification unchanged. Attribute blocking findings to supplied hunks and directly affected behavior. Judgments are exactly `APPROVE`, `CHANGES_REQUIRED`, and `NEED_MORE_EVIDENCE`. `SPLIT_REQUIRED` is a pre-review outcome.

## Acceptance Evidence

The modular routing fresh-session, Feature Map validator, deterministic verification, LOW cheap-path, Change Evidence, MEDIUM unmapped end-to-end, MEDIUM mapped synthetic, and negative-path benchmarks each passed. Final architecture audit Step 51: **PASS**, with no findings.

## Commits

| Commit | Subject |
|---|---|
| `64bbade` | feat(agent): establish V4 Lite context-routing foundation |
| `cf84c413b5b85840736a88fac5d52655d808cb4c` | feat(agent): add deterministic feature-map validation |
| `d4071578218c24c8cc852943b1ea6122f9ab59f3` | feat(agent): add deterministic verification routing |
| `ab065f1` | feat(agent): add risk-based review escalation gate |
| `675f1d46f0375a77469c2f3e3c51fc4b910c070d` | feat(agent): add bounded targeted review contract |
| `ca98e54412d754c220f01385525fb3c4c3a5576e` | feat(agent): add deterministic change evidence producer |
| `098c45811f8f7cb19dab63db8adbba3e347482d5` | feat(agent): add deterministic verification auto-routing |
| `8d5464e183dce76c4f9a292ed6a4b4b6370aa0f0` | docs(agent): align V4 Lite verification contract |

## Deliberate Boundaries

Feature Map v1 covers only the challenge-list pilot; the recipe registry contains one feature and has no multi-recipe orchestration. Review uses the same Lead rather than a dedicated reviewer subagent. V3.1 fallback remains present. The historical mapped benchmark fixture was unavailable, so a controlled synthetic mapped benchmark was used.

## Final Result

V4 Lite core architecture: **ACCEPTED**. Migration implementation: **COMPLETE**. V3.1 removal: **NOT PART OF THIS MIGRATION**.
