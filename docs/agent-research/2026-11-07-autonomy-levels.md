# Agent autonomy levels and maturity scales

- **Sources:**
  [Feng, McDonald, Zhang – Levels of Autonomy for AI Agents (arXiv 2506.12469)](https://arxiv.org/abs/2506.12469) ·
  [Zheng et al. – Separating Capability from Permission (arXiv 2607.23438)](https://arxiv.org/abs/2607.23438) ·
  [Harness Engineering: a source-code study of eleven coding agents (arXiv 2609.00006)](https://arxiv.org/abs/2609.00006) ·
  [Augment Code – Agentic Engineering Maturity Model](https://www.augmentcode.com/guides/agentic-engineering-maturity-model)
- **Read:** 2026-11-07
- **Status:** idea

## Summary

- There is no standard scale. Sources use L1–L5, L0–L5 or A1–A5 with different
  meanings, so a single score ("level 3.8") is not comparable across systems.
- **Feng et al.** define five levels by the user's role: operator, collaborator,
  consultant, approver, observer. Autonomy is a *design decision*, separate from
  model capability. L4 (approver) agents contact the user only for blockers,
  credentials or consequential sign-off.
- Their proposed measurement, **assisted evaluation**, raises human involvement
  step by step until the agent passes a threshold; the autonomy level is the
  minimum involvement needed.
- Open L4 questions: avoiding rubber-stamp approvals, agents exploiting a
  disengaged approver, and knowing reliably when to ask.
- **Zheng et al.** separate **capability** (ACL, what the agent can do) from
  **allowed autonomy** (AAL, what it may do). Allowed autonomy is chosen from
  impact, reversibility, accountability and mitigations. Git commits count as
  reversible; irreversible actions stay at lower levels. Autonomy can be raised
  or lowered without re-assessing capability.
- **Augment's maturity model** (vendor source) runs ad-hoc → standardized →
  orchestrated → systematic (memory, learning loop) → autonomous (risk-tiered
  approvals). It recommends measuring throughput and stability separately.
- **Harness study** recommendations relevant here: OS-level sandboxing and
  per-agent audit for automated contexts; safety rules as data with a hard
  floor beneath any "yolo" mode; stay single-agent until parallel work clearly
  wins; ship cheap caps (attempts, wall-clock) instead of complex stuck detection.

## Compared with our architecture

- With autopilot, the owner role is close to **L4 approver**; without it, L2–L3.
- **Already have:** autopilot as a granted, Plan-bound, budgeted, revocable
  permission, separate from Lead capability (the AAL idea); risk-tiered review;
  cheap caps (three correction attempts, budgets); single writer per Story.
- **Missing:** an explicit per-action autonomy table; a measure of owner
  involvement per Story; a pre-execution floor for the AGY worker (the scope
  gate checks only after the worker finishes); a defence against rubber-stamp
  Human Gate approvals.

## Takeaways

1. Add a per-action autonomy matrix to ARCHITECTURE.md (documentation only).
2. Add a hard command floor or OS isolation for the AGY worker (highest risk).
3. Give the Human Gate a decision bundle instead of a raw diff (see
   [kun-chen-workflow](2026-10-08-kun-chen-workflow.md)).
4. Later, derive per-Story owner-involvement metrics from existing receipts,
   registry and integration logs; no new store.
5. Later, with enough Stories, raise or lower specific permissions based on
   that evidence.
