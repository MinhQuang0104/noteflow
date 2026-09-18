"""Regression checks for the repository-level Story execution control plane."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]


def read(relative_path: str) -> str:
    return (REPO / relative_path).read_text(encoding="utf-8")


def frontmatter(relative_path: str) -> dict[str, str]:
    lines = read(relative_path).splitlines()
    if not lines or lines[0] != "---":
        raise AssertionError(f"{relative_path} has no YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as error:
        raise AssertionError(f"{relative_path} has unterminated YAML frontmatter") from error

    values: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip().strip('"\'')
    return values


class AgentArchitectureTests(unittest.TestCase):
    def test_story_development_is_the_only_automatic_approved_story_router(self):
        story = frontmatter(".agents/skills/story-development/SKILL.md")
        legacy_build = frontmatter(".agents/skills/bmad-build/SKILL.md")

        self.assertEqual(story.get("name"), "story-development")
        self.assertRegex(story.get("description", ""), r"(?i)approved|ready-for-dev")
        self.assertRegex(legacy_build.get("description", ""), r"(?i)only when.*explicit")
        self.assertRegex(legacy_build.get("description", ""), r"(?i)approved.*story-development")

        hub_help = read(".agents/skills/bmad/references/help.md")
        self.assertIn("Approved or ready-for-dev Stories use `story-development`", hub_help)
        self.assertNotRegex(hub_help, r"(?i)bmad-build(?:-auto)?.{0,80}(?:once )?per story")

    def test_active_story_path_has_no_antigravity_or_mandatory_reviewer(self):
        self.assertFalse((REPO / ".agents/skills/antigravity-review").exists())

        active_policy = "\n".join(
            read(path)
            for path in (
                "AGENTS.md",
                ".agents/skills/story-development/SKILL.md",
                ".agents/skills/story-development/references/complexity-rubric.md",
            )
        )
        self.assertNotRegex(active_policy, r"(?i)antigravity|\bAGY\b")
        self.assertNotRegex(active_policy, r"(?i)mandatory (external )?reviewer")
        self.assertIn("No external model review is required", active_policy)

    def test_policy_defines_story_as_plan_risk_escalation_and_done_gate(self):
        policy = read("AGENTS.md")
        router = read(".agents/skills/story-development/SKILL.md")
        combined = f"{policy}\n{router}"

        self.assertIn("delta plan", combined)
        self.assertIn("LOW", policy)
        self.assertIn("MEDIUM", policy)
        self.assertIn("HIGH", policy)
        self.assertIn("Deterministic Done Gate", policy)
        self.assertIn("AC-to-evidence", policy)
        self.assertIn("SPEC_AMBIGUITY", combined)
        self.assertRegex(combined, r"(?i)three.*same.*failure|same.*failure.*three")

    def test_review_prompts_do_not_force_findings(self):
        review_configs = (
            ".agents/skills/bmad-build/customize.toml",
            ".agents/skills/bmad-code-review/customize.toml",
        )
        forbidden = re.compile(r"(?i)finding floor|at least N issues|minimum finding|minimum number")

        for path in review_configs:
            content = read(path)
            self.assertNotRegex(content, forbidden, path)
            self.assertIn("No material findings.", content, path)

    def test_bmad_lifecycle_does_not_require_a_different_llm_review(self):
        lifecycle_files = (
            ".agents/skills/bmad-sprint-planning/sprint-status-template.yaml",
            ".agents/skills/bmad-sprint-planning/scripts/sprint_plan.py",
            "_bmad-output/implementation-artifacts/sprint-status.yaml",
        )
        for path in lifecycle_files:
            content = read(path)
            self.assertNotRegex(content, r"(?i)different LLM|runs code-review", path)


if __name__ == "__main__":
    unittest.main()
