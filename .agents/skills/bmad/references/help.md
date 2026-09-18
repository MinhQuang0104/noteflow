# BMad knowledge

Installed skills are grouped by their manifest's `module` key. Each module's
knowledge is read from that manifest's `knowledge` value: free-form text
saying where the module's knowledge lives or what it is. Follow it for the
module the question concerns. This document is what the `method` and
`toolbox` manifests point at; another module points elsewhere, and nothing
below describes it.

## The method and toolbox modules

A cohesive collection of skills for software development, helping the user
turn an intent of any size into working software. Route the user to the
smallest path that safely fits the work; never march them through every skill.

### The skills and their places in the flow

Shaping and planning:

- `bmad-spec` — condenses any input into a short spec, and can break a spec
  into an ordered story list. The entry point for epic-sized (2-10 coding
  sessions) work and for existing material (notes, transcripts, PRDs from
  elsewhere).
- `bmad-product-brief` and `bmad-prfaq` — two alternative ways to shape a
  product concept; use one, never both.
- `bmad-prd` — turns a shaped concept into product requirements.
- `bmad-ux` — records user experience decisions; belongs after the PRD when a
  UI is a significant part of the work.
- `bmad-architecture` — records the how-to-build decisions that keep
  separately built parts consistent; comes before epics and stories.
- `bmad-create-epics-and-stories` — breaks the PRD and architecture into
  epics and stories.
- `bmad-sprint-planning` — checks the planning is complete enough to
  implement and generates the sprint status file; its status action
  summarizes sprint state at any time.
- `bmad-project-context` — sets up or refreshes the repo's agent
  instructions; useful any time, in any path.

Implementation and quality:

- Approved or ready-for-dev Stories use `story-development`, the project router
  for V3 Lead routing, deterministic evidence, and BMAD lifecycle handoff.
  Root `AGENTS.md` and `.agents/policies/orchestration-v3.md` govern all execution.
- `bmad-build` — legacy/general delivery workflow, used only when explicitly
  requested for freeform work that is not an approved Story.
- `bmad-code-review` — optional review used only when explicitly requested; it
  is not a default Story gate.
- `bmad-walkthrough` — guided human walkthrough of a change.
- `bmad-qa-generate-e2e-tests` — generates API and end-to-end tests for
  implemented code.
- `bmad-retrospective` — judges a completed epic as a whole against its spec.
- `bmad-correct-course` — assesses a significant midstream change and
  proposes where to resume.

Agent personas (optional):

- `bmad-agent-analyst`, `bmad-agent-architect`, `bmad-agent-dev`,
  `bmad-agent-pm`, `bmad-agent-ux-designer` — conversations with a single
  named perspective. No path above needs them; the flow skills already do
  this work. Offer one only when the user asks to talk to a specific role
  or wants one perspective's take without running a full skill.

Support skills (standalone):

- `bmad-brainstorming` — facilitated ideation across many creative
  techniques.
- `bmad-forge-idea` — stress-tests a half-formed idea in a questioning
  conversation until the user can act on it or drop it.
- `bmad-deep-recon` — research to support a decision: drafts a research
  prompt for the user's own tool, or runs the research itself.
- `bmad-advanced-elicitation` — pushes recent output to be reconsidered
  and improved through a chosen critique method.
- `bmad-review` — runs installed review lenses (adversarial critique, edge
  cases, verification gaps, structure, prose) over any artifact and reports
  triaged findings.
- `bmad-party-mode` — a lively group discussion between installed agents or
  custom personas.
- `bmad-customize` — authors customization overrides for installed BMad
  skills.

These belong to no path and no stage. Each stands on its own: suggest one
whenever it is useful — before, during, after, or entirely outside the flow
above — and never present them as required steps.

A project environment may have a subset of these skills supporting the user's
preferred workflow.

Cross-skill routing exists only when the `bmad` hub skill is installed.

### How to use BMad

Ask whether one implementation session can reasonably understand, implement,
review, and finish the change. Scope is only one signal: high risk, unclear
requirements, architectural reach, or coordination between people pushes work
up a tier even when it is small.

- **Trivial.** The edit is obvious and low-risk: follow V3 execution controls and use no
  BMad skill at all — unless the user asks for BMad, or the change
  would still benefit from explicit planning and review.
- **One session.** For an approved or ready Story, use `story-development`.
  For freeform work, follow V3 execution policy; `bmad-build` remains explicit-only
  and cannot bypass its worker or ownership constraints.
- **Epic-sized.** One coherent outcome that needs several sessions: run
  `bmad-spec` to pin down the what, tell it to create architecture and/or UX
  companion files if the situation calls for it, have it break the spec into
  stories, then use `story-development` for each approved Story. Finish with
  `bmad-retrospective` against the spec.
- **Project-sized.** 10-100 coding sessions: take the full planning route —
  `bmad-product-brief` or `bmad-prfaq`, then `bmad-prd`, then `bmad-ux` when
  the user experience matters, then `bmad-architecture`,
  `bmad-create-epics-and-stories`, and `bmad-sprint-planning`. Each epic then
  runs like epic-sized work above, but without running spec for every epic.

### Answering "what's next?"

Read the state before recommending: which planning artifacts exist, and what
the codebase, git history, and/or the user says is done. Caution: presence of
a story file with `status: done` or another planning/tracking artifact like
this does not prove completion. Then:

- Mid-path, recommend the next unfinished stage of the chosen path, not a
  restart.
- When you detect ongoing sprint tracking, but sprint state is unclear, use
  `bmad-sprint-planning`'s status action.
- After Story implementation, apply the repository Deterministic Done Gate and
  synchronize BMAD lifecycle state. Use `bmad-code-review` only when the user
  explicitly requests it. Offer `bmad-qa-generate-e2e-tests` when automated
  coverage is wanted and `bmad-walkthrough` when a human wants a walkthrough.
- When an epic completes, offer `bmad-retrospective`. When it — or anything
  midstream — exposes a significant planning change, route through
  `bmad-correct-course`, then resume at the earliest affected skill once the
  proposal is approved; do not replay unaffected work.

A run is complete when the intent is satisfied, its chosen checks pass, and
no chosen review leaves material unresolved findings — not when every skill
has been traversed.

### When this document is not enough

For a method or toolbox question this section and the installed skills
cannot answer,
fetch `https://docs.bmad-method.org/llms.txt` and follow the links relevant
to the question. It indexes the full documentation site and names the source
repository, which is the final authority on how anything actually behaves.

### Where things land

Durable specs and their story lists live under `{output_folder}/specs`;
planning documents and change proposals under `{planning_artifacts}`; Build's
working records, sprint status, reviews, and retrospectives under
`{implementation_artifacts}`; implementation in the project working tree;
generated QA tests under `{project-root}/tests`; and repository guidance at
`{project-root}/AGENTS.md`.
