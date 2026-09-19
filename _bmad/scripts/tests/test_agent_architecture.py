"""Regression checks for the repository-level Story execution control plane."""

from __future__ import annotations

import re
import json
import subprocess
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

    def test_active_story_path_uses_v3_without_mandatory_reviewer(self):
        self.assertFalse((REPO / ".agents/skills/antigravity-review").exists())

        active_policy = "\n".join(
            read(path)
            for path in (
                "AGENTS.md",
                ".agents/skills/story-development/SKILL.md",
                ".agents/skills/story-development/references/complexity-rubric.md",
            )
        )
        self.assertIn("orchestration-v3.md", active_policy)
        self.assertNotIn("Codex implements directly", active_policy)
        self.assertNotIn("Codex performs the implementation", active_policy)
        self.assertNotRegex(active_policy, r"(?i)mandatory (external )?reviewer")
        self.assertIn("No external model review is required", active_policy)

    def test_both_leads_share_canonical_bootstrap(self):
        for path in ("AGENTS.md", "CLAUDE.md"):
            self.assertIn(".agents/policies/orchestration-v3.md", read(path))
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertIn("Do NOT read `events.jsonl` during ordinary resume", policy)
        self.assertIn("Antigravity", policy)
        self.assertIn("NEEDS_RECONSTRUCTION", policy)
        self.assertIn("HUMAN_GATE", policy)

    def test_v3_schema_contracts_and_pointer_shape(self):
        run = json.loads(read(".agents/schemas/run-state.schema.json"))
        worker = json.loads(read(".agents/schemas/worker-state.schema.json"))
        for schema in (run, worker):
            self.assertEqual(schema["$schema"], "http://json-schema.org/draft-07/schema#")
            self.assertFalse(schema["additionalProperties"])
            self.assertEqual(set(schema["required"]), set(schema["properties"]))
        self.assertEqual(run["properties"]["leadEngine"]["enum"], ["codex", "claude"])
        self.assertEqual(run["properties"]["workerEnginePolicy"]["const"], "Antigravity")
        self.assertTrue(run["properties"]["humanGateRequired"]["const"])
        self.assertEqual(worker["properties"]["engine"]["const"], "Antigravity")
        self.assertNotIn("APPROVED", worker["properties"]["reviewStatus"]["enum"])
        self.assertEqual(set(run["definitions"]["activeRun"]["required"]),
                         {"schemaVersion", "activeRunId", "storyId", "status", "updatedAt"})

    def test_v3_policy_links_resolve_and_runtime_is_ignored(self):
        for path in ("AGENTS.md", "CLAUDE.md", ".agents/policies/orchestration-v3.md"):
            for target in re.findall(r"\]\(([^)]+)\)", read(path)):
                self.assertTrue((REPO / path).parent.joinpath(target).is_file(), target)
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", ".agent-state/active-run.json",
             ".agent-state/runs/probe/run.json"], cwd=REPO, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), 2)

    def test_v3_normal_transitions_cannot_bypass_human_gate(self):
        policy = read(".agents/policies/orchestration-v3.md")
        edges = re.findall(r"^\| ([A-Z_]+) \| ([A-Z_]+) \|", policy, re.MULTILINE)
        self.assertEqual([source for source, target in edges if target == "COMPLETE"],
                         ["HUMAN_GATE"])
        self.assertIn(("WORKER_RUNNING", "LEAD_REVIEW"), edges)
        self.assertIn(("LEAD_REVIEW", "VERIFICATION"), edges)
        self.assertNotIn(("WORKER_RUNNING", "COMPLETE"), edges)
        self.assertIn("Age alone never expires the lease", policy)
        self.assertIn("Stale generations", policy)

    def test_phase_2b_requires_one_lease_for_every_mutating_action(self):
        policy = read(".agents/policies/orchestration-v3.md")
        run = json.loads(read(".agents/schemas/run-state.schema.json"))
        lease_object = run["properties"]["leadLease"]["anyOf"][1]
        self.assertEqual(
            set(lease_object["required"]),
            {"owner", "generation", "acquiredAt", "heartbeatAt"},
        )
        self.assertFalse(lease_object["additionalProperties"])
        self.assertIn("exclusive-create", policy)
        self.assertIn("one active Run -> at most one mutating Lead", policy)
        for action in (
            "creating Tasks",
            "dispatching workers",
            "sending compatibility worker instructions",
            "retrying, releasing or cancelling workers",
            "mutating Task status",
            "changing state-machine phase",
            "declaring verification passed",
            "performing integration actions",
        ):
            self.assertIn(action, policy)

    def test_phase_2b_takeover_increments_generation_and_fences_old_owner(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(policy, r"(?is)takeover.{0,500}generation \+ 1")
        self.assertRegex(policy, r"(?is)previous-generation.{0,160}(?:invalid|fenced)")
        self.assertIn("LEAD_TAKEOVER", policy)

    def test_phase_2b_healthy_conflicting_lead_cannot_be_stolen(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?is)healthy lease owned by another session.{0,240}NEEDS_HUMAN",
        )
        self.assertIn("LEAD_CONFLICT_DETECTED", policy)

    def test_phase_2b_resume_does_not_redispatch_existing_task(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)Duplicate-dispatch gate.{0,900}equivalent active or completed Task",
        )
        self.assertRegex(
            policy,
            r"(?s)equivalent active or completed Task.{0,400}do not dispatch",
        )

    def test_phase_2b_completed_task_enters_review_not_complete(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)TASK_COMPLETED_BUT_NO_VERIFIABLE_GIT_EVIDENCE.{0,300}LEAD_REVIEW",
        )
        edges = re.findall(r"^\| ([A-Z_]+) \| ([A-Z_]+) \|", policy, re.MULTILINE)
        self.assertIn(("WORKER_RUNNING", "LEAD_REVIEW"), edges)
        self.assertNotIn(("WORKER_RUNNING", "COMPLETE"), edges)

    def test_phase_2b_compat_terminal_does_not_require_dispatch(self):
        for path in (
            ".agents/schemas/run-state.schema.json",
            ".agents/schemas/worker-state.schema.json",
        ):
            schema = json.loads(read(path))
            compat_rules = [
                rule for rule in schema["allOf"]
                if rule.get("if", {}).get("properties", {}).get("orca", {})
                .get("properties", {}).get("executionMode", {}).get("const") == "compat-terminal"
            ]
            dispatch_rules = [
                rule["then"]["properties"]["orca"]["properties"]["dispatchId"]
                for rule in compat_rules
                if "dispatchId" in rule["then"]["properties"]["orca"]["properties"]
            ]
            self.assertTrue(dispatch_rules, path)
            self.assertTrue(all(rule == {"type": "null"} for rule in dispatch_rules), path)

    def test_phase_2b_missing_worktree_blocks_unsafe_continuation(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)WORKTREE_MISSING.{0,300}(?:BLOCKED|NEEDS_RECONSTRUCTION).{0,180}do not redispatch",
        )

    def test_phase_2b_duplicate_workers_require_human_resolution(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)DUPLICATE_WORKERS.{0,300}NEEDS_HUMAN",
        )
        self.assertIn("DUPLICATE_WORKER_DETECTED", policy)

    def test_phase_2b_recorded_behind_runtime_advances_by_evidence(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)RECORDED_BEHIND_RUNTIME.{0,500}STATE_RECONCILED.{0,200}do not redispatch",
        )

    def test_phase_2b_recorded_ahead_runtime_fails_safe(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertRegex(
            policy,
            r"(?s)RECORDED_AHEAD_OF_RUNTIME.{0,600}NEEDS_RECONSTRUCTION",
        )
        self.assertIn("RECONCILIATION_BLOCKED", policy)

    def test_phase_2b_event_log_stays_cold_path(self):
        policy = read(".agents/policies/orchestration-v3.md")
        self.assertIn("Do NOT read `events.jsonl` during ordinary resume", policy)
        self.assertIn("Normal bootstrap never scans history", policy)
        self.assertIn("Do not log every heartbeat", policy)

    def test_phase_2b_codex_and_claude_share_lease_and_reconciliation(self):
        policy = read(".agents/policies/orchestration-v3.md")
        claude = read("CLAUDE.md")
        self.assertIn("Codex and Claude follow exactly this protocol", policy)
        self.assertRegex(policy, r"Codex -> Claude / Claude -> Codex")
        self.assertIn("same replaceable Lead role as Codex", claude)

    def test_phase_2a_uses_project_local_orca_orchestration(self):
        policy = read(".agents/policies/orchestration-v3.md")
        router = read(".agents/skills/story-development/SKILL.md")
        self.assertIn("orca skills get orchestration --full", policy)
        self.assertIn("Orca supervised orchestration", policy)
        self.assertIn("compat-terminal", policy)
        self.assertIn("orca terminal send", policy)
        self.assertIn("orca terminal read --screen", policy)
        self.assertIn("orca orchestration task-update", policy)
        self.assertIn("durable explicit repo/worktree identifiers", policy)
        self.assertIn("explicit parent", policy)
        self.assertNotIn("--worktree new-child", policy)
        self.assertIn("never depend on UI focus", policy)
        self.assertRegex(policy, r"(?is)raw\s+terminal control.{0,120}diagnostic/recovery-only")
        self.assertRegex(policy, r"(?s)project-local\s+`orca-cli` and `orchestration`")
        self.assertNotIn("Phase 1 enables no Orca dispatch", router)
        self.assertTrue((REPO / ".agents/skills/orca-cli/SKILL.md").is_file())
        self.assertTrue((REPO / ".agents/skills/orchestration/SKILL.md").is_file())
        self.assertEqual(read(".claude/skills/orca-cli/SKILL.md"),
                         read(".agents/skills/orca-cli/SKILL.md"))
        self.assertEqual(read(".claude/skills/orchestration/SKILL.md"),
                         read(".agents/skills/orchestration/SKILL.md"))
        skill_lock = json.loads(read("skills-lock.json"))["skills"]
        self.assertEqual(skill_lock["orca-cli"]["source"], "stablyai/orca")
        self.assertEqual(skill_lock["orchestration"]["source"], "stablyai/orca")

    def test_phase_2a_schemas_store_real_orca_identifiers(self):
        expected = {
            "executionMode", "runtimeId", "runId", "taskId", "dispatchId", "workerHandle",
            "terminalHandle", "requestId", "worktreeId",
        }
        for path in (".agents/schemas/run-state.schema.json",
                     ".agents/schemas/worker-state.schema.json"):
            schema = json.loads(read(path))
            orca = schema["properties"]["orca"]
            self.assertEqual(set(orca["required"]), expected)
            self.assertEqual(set(orca["properties"]), expected)
            self.assertEqual(orca["properties"]["executionMode"]["enum"],
                             ["supervised", "compat-terminal", None])
        worker = json.loads(read(".agents/schemas/worker-state.schema.json"))
        self.assertEqual(worker["properties"]["engine"]["const"], "Antigravity")

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
