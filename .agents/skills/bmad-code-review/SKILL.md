---
name: bmad-code-review
description: 'Optional explicit code-review workflow with independent reviewers and finding triage. Use only when the user explicitly asks to run bmad-code-review or review code; it is not a default Story gate.'
---

Run the following command exactly once without changing the current working directory. Replace `{project-root}` with the absolute path to the project root and `{skill-root}` with the absolute path to this skill's directory:

```bash
uv run --no-cache "{project-root}/_bmad/scripts/render_skill.py" --project-root "{project-root}" --skill "{skill-root}"
```

- On success, read and follow the one absolute `workflow.md` instruction printed to stdout.
- If `{project-root}/_bmad/scripts/render_skill.py` is not found, this BMad installation is not set up yet: read the installed `bmad` skill's SKILL.md (a sibling of this skill's directory) and follow its setup flow, then run the command above once more.
- On any other failure (including `uv` being unavailable), report the command output and HALT. Do not run any workflow source directly.
