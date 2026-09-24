# V4 Lite verification context

Use deterministic tools, then risk-based escalation, then targeted reasoning. Planned checks and prose are not evidence.

## Verification

- `node .agents/scripts/check-slice-verification.mjs check <story-id> <slice-id>` is a read-only checkpoint scope and freshness helper. It resolves baseline/checkpoint identity, derives exact changed paths, detects relevant drift, and classifies persisted focused evidence and prior review freshness. It never runs checks, reviews, escalation, or progression.
- Helper status `RERUN_REQUIRED` is not a verification failure; it means scope/freshness is established but required checks lack reusable structured evidence.
- Explicit: `node .agents/scripts/check-verification.mjs check <feature> --changed <path>`
- Auto: `node .agents/scripts/check-verification.mjs check auto --changed <path>`
- Repeat `--changed` for multiple explicit paths: `--changed <path-a> --changed <path-b>`. No Git change discovery.
- Exit codes: `PASS` 0; `FAIL` 1; `INCOMPLETE` 2; `ERROR` 3. Never claim skipped checks ran.
- Auto routes mapped scope to its deterministic recipe. No applicable recipe returns applicability `NOT_APPLICABLE`, status `INCOMPLETE`, no checks. Mixed mapped/unmapped scope remains `INCOMPLETE` with unmatched paths preserved. Invalid input returns `ERROR`.
- Canonical verification still comes only from `check-verification.mjs`; preserve its output exactly. `NOT_APPLICABLE`/`INCOMPLETE` remains non-`PASS`, and progression eligibility is a separate persisted decision that cannot reinterpret canonical status.

## Escalation

`.agents/scripts/check-escalation.mjs` is authoritative. Clean, complete LOW `PASS` without judgment flags yields `NO_REVIEW`. MEDIUM, HIGH, `FAIL`, `INCOMPLETE`, `ERROR`, or supported judgment flags require `REVIEW_REQUIRED`. Do not reinterpret its decision.

## Change evidence and review

Run `node .agents/scripts/prepare-change-evidence.mjs --comparison <working-tree-vs-HEAD|explicit-pair> --path <path>`. Repeat explicit `--path`; `explicit-pair` requires `--base <ref> --head <ref>`. No scope discovery. Budgets: paths <=4; hunks/path <=6; diff lines <=240 per review unit. One oversized text path may use producer-generated bounded evidence units; the caller does not choose line ranges. Complete mechanically validated coverage is required. `SPLIT_REQUIRED` remains for path/hunk grouping conditions. Outcomes: `OK` 0; `NO_CHANGE` 1; `SPLIT_REQUIRED` 2; `UNSUPPORTED` 3; `INVALID_INPUT` 4; `ERROR` 5.

Review only when escalated, using the same Lead in v1. Pass unchanged deterministic verification output and the producer's structured Change Evidence. Review this actual delta without manual Git patch reconstruction or whole-state review. Attribute blocking findings to supplied hunks or directly affected behavior. See `.agents/review/targeted-reviewer-contract.md`.

Root `AGENTS.md` governs the Done Gate. Load V3 policy only for an affected V3 gate or lifecycle boundary.
