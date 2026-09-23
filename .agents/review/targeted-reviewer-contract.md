# Targeted Reviewer Contract v1

## Entry and scope

Invoke only after `.agents/scripts/check-escalation.mjs` returns `REVIEW_REQUIRED`. The same Lead model judges supplied questions against the supplied delta; no subagent is assigned.

The reviewer must not discover its own diff or scope; search the repository or Git history; rerun checks; read unrelated Story/V3 documents; or modify code.

## Input

```js
{
  escalation: { decision: "REVIEW_REQUIRED", risk: "MEDIUM", reasons: ["..."] },
  verification: { /* exact, unmodified Verification Router JSON */ },
  judgmentFlags: ["..."], // exact caller flags
  changeEvidence: {
    provenance: {
      producer: "upstream-harness",
      comparison: "working-tree-vs-HEAD | commit-pair | explicit-pair",
      base: "explicit identifier",
      head: "explicit identifier"
    },
    paths: [{
      path: "repo-relative/path",
      hunks: [{
        oldStart: 0, oldLines: 0, newStart: 0, newLines: 0,
        diffText: "deterministic unified hunk text"
      }]
    }]
  },
  evidenceRefs: [{ path: "repo-relative/path", symbol: "optional", purpose: "why needed" }],
  reviewQuestions: ["specific judgment question"]
}
```

Escalation and verification are exact tool outputs. The caller supplies provenance and hunks; the reviewer is independent of comparison method. `changeEvidence.paths` must be nonempty and exactly match `verification.changedPaths`. Duplicate, inconsistent, empty, or ambiguous paths/hunks invalidate input and require clarification before review. Never infer the delta from current files. `evidenceRefs` is the file allowlist, including changed files. Open nothing outside it; request exact missing pointers.

## Reason routing

Focus only on the reason's affected boundary: `MEDIUM_COVERAGE_JUDGMENT` covers changed behavior, direct consumers, mapped tests, and unhappy paths; `HIGH_RISK_REVIEW` covers affected invariants; `JUDGMENT_*` covers flagged contracts or security boundaries; `VERIFICATION_*` covers specific missing or conflicting evidence.

## Attribution and baseline

1. Begin each blocking finding at a supplied hunk; identify the behavior or contract it affects.
2. Trace that behavior using only allowlisted current source, direct consumers, and mapped tests.
3. `CHANGES_REQUIRED` is permitted only for a concrete defect introduced or exposed by the hunk, or a coverage/evidence gap needed to judge its changed behavior or contract.
4. Every blocking finding cites the changed path and hunk, a supporting evidence pointer, and a required correction.
5. If causal attribution cannot be established within the allowlist, return `NEED_MORE_EVIDENCE` with exact pointers. Never infer change content from whole current files.
6. Do not broaden review to unrelated baseline issues. V1 has no non-blocking notes field: omit unrelated pre-existing issues; they cannot cause `CHANGES_REQUIRED`. If their relationship to a hunk is materially uncertain, request exact evidence.

## Hard budgets and oversize input

Maximum 4 changed paths; 6 hunks per path; 240 total diff lines, including context; 3 initial additional L2 files beyond changed paths; 1 additional evidence round of at most 2 files; 3 findings; 250 words in reviewer output.

Before review, input exceeding any path or diff budget is `SPLIT_REQUIRED`. This is a pre-review input condition, not a reviewer judgment. The caller splits by explicit affected boundary. Never truncate, choose an arbitrary subset, or expand a budget. Insufficient evidence within budget yields `NEED_MORE_EVIDENCE`.

## Output

Exactly one reviewer judgment: `APPROVE`, `CHANGES_REQUIRED`, or `NEED_MORE_EVIDENCE`. No scores, confidence percentages, essays, or notes. `symbol` may be omitted when none applies. Every finding requires concrete delta and supporting evidence.

```js
{ judgment: "APPROVE", satisfiedQuestions: ["question answered for supplied delta"],
  findings: [], requestedEvidence: [] }

{ judgment: "CHANGES_REQUIRED", satisfiedQuestions: [],
  findings: [{ path: "...", hunk: { oldStart: 0, newStart: 0 },
    symbol: "...", issue: "concrete delta-related issue",
    evidence: "exact supporting pointer", requiredCorrection: "specific correction" }],
  requestedEvidence: [] }

{ judgment: "NEED_MORE_EVIDENCE", satisfiedQuestions: [], findings: [],
  requestedEvidence: [{ path: "exact/path", symbol: "optional",
    neededFor: "specific unresolved causal question" }] }
```

`APPROVE` answers only supplied questions for the supplied delta; it does not establish Story completion, Done Gate satisfaction, or broader readiness.

## Medium pilot

For risk `MEDIUM`, reason `MEDIUM_COVERAGE_JUDGMENT`, and changed path `frontend/src/api/challenges.ts`, require bounded structured hunks for that path. Allowlist that file plus `frontend/src/views/ChallengesView.vue`, `frontend/src/api/__tests__/challenges.spec.ts`, and `frontend/src/views/__tests__/challenges.spec.ts`. Ask: Does changed `getChallenges` behavior remain coherent for its direct view consumer, including affected unhappy paths, and do mapped tests meaningfully cover that behavior?

Do not classify a baseline missing initial-load failure test as `CHANGES_REQUIRED` unless a supplied hunk affects failure/retry behavior or makes that test necessary to judge changed behavior. Otherwise omit the unrelated gap, or return `NEED_MORE_EVIDENCE` if attribution is materially uncertain.
