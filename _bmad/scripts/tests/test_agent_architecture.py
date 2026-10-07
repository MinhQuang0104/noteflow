"""Regression checks for the repository-level Story execution control plane."""

from __future__ import annotations

import re
import json
import subprocess
import unittest
from copy import deepcopy
from pathlib import Path

from jsonschema import Draft7Validator, ValidationError


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
        # V4 Lite: CLAUDE.md is a thin entry point that defers to AGENTS.md and
        # the router; AGENTS.md alone names the V3 policy path.
        claude = read("CLAUDE.md")
        self.assertIn("`AGENTS.md`", claude)
        self.assertIn("`task-router.md`", claude)
        self.assertTrue((REPO / ".agents/routing/task-router.md").is_file())
        self.assertIn(".agents/policies/orchestration-v3.md", read("AGENTS.md"))
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
        self.assertIn("Codex and Claude follow exactly this protocol", policy)
        self.assertRegex(policy, r"Codex -> Claude / Claude -> Codex")
        self.assertIn("Codex and Claude are replaceable Leads", read("AGENTS.md"))

    def test_phase_2a_uses_project_local_orca_orchestration(self):
        policy = read(".agents/policies/orchestration-v3.md")
        router = read(".agents/skills/story-development/SKILL.md")
        self.assertIn("orca skills get orchestration", policy)
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
        self.assertIn("every AC evidenced", policy)
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


class LazyPolicyLoadingTests(unittest.TestCase):
    """Check the documented decision tables, not Orca-owned reference spellings.

    These are policy contract checks, not a simulator of agent/runtime behavior.
    Dropping a gate, weakening its prerequisite, or orphaning a capability must fail.
    """

    def setUp(self):
        self.policy = read(".agents/policies/orchestration-v3.md")
        self.router = read(".agents/skills/story-development/SKILL.md")

    def section(self, heading):
        marker = "## " + heading + "\n"
        self.assertTrue(marker in self.policy, f"Missing policy section: {heading}")
        return self.policy.split(marker, 1)[1].split("\n## ", 1)[0]

    def table(self, heading):
        rows = [tuple(cell.strip() for cell in line.strip("|").split("|"))
                for line in self.section(heading).splitlines() if line.startswith("| ")]
        self.assertTrue(rows, heading)
        rows = rows[1:]  # Header; separator has no space after its first pipe.
        self.assertEqual(len(rows), len({row[0] for row in rows}))
        return {row[0]: row[1:] for row in rows}

    def test_healthy_requires_compact_and_no_specialized_context(self):
        gates = self.table("Orca action reference gates")
        self.assertEqual(gates["healthy"][1], "none")
        for condition in ("Run", "Task", "lease", "generation", "worktree",
                          "runtime", "unknown", "takeover", "restart"):
            self.assertIn(condition, gates["healthy"][0])
        entry = self.section("Orca context loading (A2)")
        self.assertRegex(entry, r"(?s)Always read.*compact.*`orca skills get orchestration`")
        self.assertIn("Healthy actions require no full guide", entry)
        for text in (self.policy, self.router):
            self.assertNotRegex(text, r"(?is)(?:full guide|--full).{0,60}before (?:ANY|every)")

    def test_specialized_actions_require_capabilities_before_action(self):
        gates = self.table("Orca action reference gates")
        expected = {
            "new-worker": {"placement"},
            "continue": set(),
            "correction": {"reuse"},
            "retry": {"recovery", "placement"},
            "compat-terminal": {"topology", "terminal"},
            "runtime-restart": {"recovery"},
            "takeover": {"recovery", "legacy"},
            "reconcile": {"recovery"},
            "unknown-outcome": {"recovery"},
            "legacy-contract": {"legacy"},
        }
        capabilities = self.table("Orca capability discovery")
        for action, required in expected.items():
            with self.subTest(action=action):
                actual = set(gates[action][1].split(", ")) - {"none"}
                self.assertEqual(actual, required)
                self.assertTrue(actual <= capabilities.keys())
                self.assertTrue(gates[action][0])
                self.assertTrue(gates[action][2])
        self.assertIn("before the action", self.section("Orca action reference gates"))
        for category, (reference, purpose) in capabilities.items():
            self.assertTrue(purpose, category)
            self.assertRegex(reference, r"`(?:references/[a-z-]+\.md|orca-cli)`")

    def test_correction_preserves_attempt_and_report_identity(self):
        correction = self.table("Orca action reference gates")["correction"]
        for invariant in ("same Task", "worktree", "attempt +1", "previous report"):
            self.assertIn(invariant, correction[2])
        retry = self.table("Orca action reference gates")["retry"]
        self.assertIn("proven failed/stopped", retry[0])

    def test_recovery_is_current_condition_not_history(self):
        section = self.section("Orca action reference gates")
        self.assertIn("Past recovery alone does not trigger a load", section)
        reconcile = self.table("Orca action reference gates")["reconcile"][0]
        for trigger in ("ownership", "generation", "runtime IDs", "projection",
                        "settlement", "worker/worktree", "pending reconciliation",
                        "corrupt/missing observation"):
            self.assertIn(trigger, reconcile)
        unknown = self.table("Orca action reference gates")["unknown-outcome"][2]
        self.assertRegex(unknown, r"reconcile.*before.*replay")
        self.assertIn("never blind replay", unknown)

    def test_takeover_and_compat_context_does_not_grant_authority(self):
        gates = self.table("Orca action reference gates")
        for invariant in ("Read-only reconciliation before lease acquisition",
                          "fence/release old owner", "increment generation"):
            self.assertIn(invariant, gates["takeover"][2])
        for invariant in ("Reconcile failed/unknown dispatch", "coordinator Run/Task",
                          "exact isolated worktree", "placement"):
            self.assertIn(invariant, gates["compat-terminal"][2])
        discovery = self.section("Orca capability discovery")
        self.assertIn("compat-terminal is not itself a legacy label", discovery)
        self.assertIn("does not authorize legacy takeover commands", discovery)
        entry = self.section("Orca context loading (A2)")
        self.assertIn("never grants mutation authority", entry)
        self.assertIn("do not override fixed Antigravity and isolated Git worktrees", entry)

    def test_fallback_is_closed_for_each_discovery_failure(self):
        fallback = self.table("Orca context fallback")
        for condition in ("compact-unsupported", "reference-unsupported",
                          "reference-missing", "interface-drift", "unmapped-action"):
            with self.subTest(condition=condition):
                self.assertEqual(fallback[condition][0], "full guide")
                self.assertIn("reason", fallback[condition][1])
        section = self.section("Orca context fallback")
        self.assertIn("orca skills get orchestration --full", section)
        self.assertIn("BLOCKED", fallback["full-insufficient"][0])
        self.assertIn("no mutation", fallback["full-insufficient"][1])

    def test_router_uses_canonical_gates_and_live_discovery(self):
        for phrase in ("compact guide", "classify the current action", "named references",
                       "Orca action reference gates", "full guide", "unavailable",
                       "Never guess runtime commands from memory"):
            self.assertIn(phrase, self.router)
        discovery = self.section("Orca capability discovery")
        for phrase in ("--references", "--reference", "current discovery",
                       "not version pins"):
            self.assertIn(phrase, discovery)

    def test_safety_floor_remains_in_canonical_core(self):
        for heading, invariants in {
            "Scope and authority": ("BMAD authority", "source of truth for code"),
            "Core rules": ("isolated Orca-managed Git worktrees", "one mutating Lead",
                           "Worker DONE, Lead ACCEPTED and Human APPROVED"),
            "Ownership and local mutation protocol": ("monotonically increasing",
                "Stale generations", "Age alone never expires the lease"),
            "Shared Lead bootstrap": ("read-only", "without replaying mutations"),
            "State machine and gates": ("Human APPROVED exact diff/integration scope",
                "Actual diff reviewed, Lead ACCEPTED", "All ACs evidenced"),
        }.items():
            section = self.section(heading)
            for invariant in invariants:
                self.assertIn(invariant, section)

    def test_measurement_categories_extend_existing_contract(self):
        telemetry = read(".agents/policies/v3-telemetry.md")
        for field in ("compactGuideLoads", "namedReferenceLoads", "fullGuideFallbackCount",
                      "fallbackReason", "policyReferenceBytesLoaded", "recoveryReferenceLoads",
                      "healthyActionsWithoutFullGuide"):
            self.assertIn(field, telemetry)


class WorkerReportTests(unittest.TestCase):
    """Exercise draft-07 and the policy's per-dispatch const binding recipe."""

    def setUp(self):
        schema_path = REPO / ".agents/schemas/worker-report.schema.json"
        self.assertTrue(schema_path.is_file(), "structured report schema is required")
        self.schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft7Validator.check_schema(self.schema)
        self.scope = {"baseCommit": "a" * 40, "head": "b" * 40,
                      "diffIdentity": "scope-sha256:" + "c" * 64}
        self.previous = {"path": "workers/task/report-attempt-1.json",
                         "sha256": "d" * 64, "diffIdentity": "scope-sha256:" + "e" * 64}
        self.report = {
            "schemaVersion": 1, "kind": "completion", "status": "DONE",
            "runId": "run", "taskId": "task", "attempt": 1,
            "contractIdentity": "sha256:" + "f" * 64,
            "scope": self.scope, "changedFilesRef": "workers/task/files-1.txt",
            "checks": [{"id": "unit", "cwd": "backend", "command": "php artisan test",
                        "exitCode": 0, "result": "PASS", "checkedScope": self.scope["diffIdentity"],
                        "logRef": "workers/task/unit-1.log"}],
            "acEvidence": [{"acId": "AC1", "checkIds": ["unit"], "artifactRefs": []}],
            "unresolvedIssues": [],
        }

    def validate_bound(self, report, *, attempt=1, previous=None, kind=None):
        # Bind only independently obtained expectations, never values from report.
        schema = deepcopy(self.schema)
        expected = {"runId": "run", "taskId": "task", "attempt": attempt,
                    "contractIdentity": "sha256:" + "f" * 64, "scope": self.scope}
        expected["kind"] = kind or ("correction" if previous is not None else "completion")
        if previous is not None:
            expected["previousReport"] = previous
        schema.setdefault("allOf", []).append({
            "properties": {key: {"const": value} for key, value in expected.items()}})
        Draft7Validator(schema).validate(report)

    def correction(self):
        report = deepcopy(self.report)
        report.update(kind="correction", attempt=2, previousReport=self.previous,
                      changedSincePreviousRef="workers/task/delta-2.txt",
                      findings={"resolved": [{"id": "F1", "evidenceRefs": ["check:unit"]}],
                                "remaining": [{"id": "F2", "reason": "dependency unavailable"}]})
        del report["changedFilesRef"]
        return report

    def test_valid_completion(self):
        self.validate_bound(self.report)

    def test_missing_identity(self):
        for field in ("runId", "taskId", "attempt", "contractIdentity", "scope", "schemaVersion"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                report = deepcopy(self.report)
                del report[field]
                self.validate_bound(report)

    def test_wrong_run_task_attempt_contract_or_scope(self):
        for field, value in (("runId", "other"), ("taskId", "other"), ("attempt", 2),
                             ("contractIdentity", "sha256:" + "0" * 64),
                             ("scope", dict(self.scope, head="0" * 40))):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                self.validate_bound(dict(self.report, **{field: value}))

    def test_valid_correction_delta(self):
        self.validate_bound(self.correction(), attempt=2, previous=self.previous)

    def test_correction_requires_previous_reference(self):
        report = self.correction()
        del report["previousReport"]
        with self.assertRaises(ValidationError):
            self.validate_bound(report, attempt=2, previous=self.previous)

    def test_stale_correction_baseline(self):
        for field, value in (("path", "workers/task/report-attempt-0.json"),
                             ("sha256", "0" * 64), ("diffIdentity", "old-scope")):
            report = self.correction()
            report["previousReport"] = dict(self.previous, **{field: value})
            with self.subTest(field=field), self.assertRaises(ValidationError):
                self.validate_bound(report, attempt=2, previous=self.previous)

    def test_blocked_is_evidence_not_done(self):
        report = {key: deepcopy(self.report[key]) for key in
                  ("schemaVersion", "runId", "taskId", "attempt", "contractIdentity", "scope", "checks")}
        report.update(kind="blocked", status="BLOCKED", blocker={
            "category": "dependency", "fact": "database unavailable", "evidenceRefs": ["db.log"]},
            worktreePath="D:/verified-orca-worktree", lastCompletedStep="implementation",
            verificationState="database checks not run", requiredDecisionOrDependency="restore database",
            workerActivity="stopped")
        self.validate_bound(report, kind="blocked")
        report["status"] = "DONE"
        with self.assertRaises(ValidationError):
            self.validate_bound(report, kind="blocked")

    def test_correction_dispatch_cannot_submit_full_completion(self):
        report = dict(self.report, attempt=2)
        with self.assertRaises(ValidationError):
            self.validate_bound(report, attempt=2, previous=self.previous)

    def test_check_results_and_nullable_exit_codes(self):
        for result, code in (("PASS", 0), ("FAIL", 1), ("FAIL", None),
                             ("NOT_RUN", None), ("UNKNOWN", None)):
            report = deepcopy(self.report)
            report["checks"][0].update(result=result, exitCode=code)
            if result == "NOT_RUN":
                report["checks"][0]["logRef"] = None
            self.validate_bound(report)  # DONE may contain failed/unfinished checks.
        for result, code in (("GREEN", 0), ("PASS", None), ("PASS", 1), ("NOT_RUN", 0)):
            report = deepcopy(self.report)
            report["checks"][0].update(result=result, exitCode=code)
            with self.subTest(result=result, code=code), self.assertRaises(ValidationError):
                self.validate_bound(report)

    def test_transcript_not_required_or_allowed_as_payload(self):
        self.validate_bound(self.report)
        for field in ("terminalTranscript", "previousReportBody", "reasoning", "stdout"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                self.validate_bound(dict(self.report, **{field: "screen redraw\n" * 10000}))
        report = deepcopy(self.report)
        report["checks"][0]["command"] = "screen redraw\n" * 10000
        with self.assertRaises(ValidationError):
            self.validate_bound(report)

    def test_unknown_version_and_mixed_kind_rejected(self):
        for change in ({"schemaVersion": 2}, {"status": "ACCEPTED"},
                       {"previousReport": self.previous}, {"kind": "other"}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                self.validate_bound(dict(self.report, **change))

    def test_report_references_reject_traversal_and_absolute_paths(self):
        for path in ("../foreign.json", "/tmp/foreign.json", "C:/foreign.json",
                     "workers/../../foreign.json", "workers\\foreign.json"):
            with self.subTest(path=path), self.assertRaises(ValidationError):
                self.validate_bound(dict(self.report, changedFilesRef=path))

    def test_telemetry_contract_defines_measurement_not_state(self):
        telemetry = read(".agents/policies/v3-telemetry.md")
        for metric in ("uncachedInputTokens", "cachedInputTokens", "outputTokens",
                       "reasoningTokens", "leadTurns", "subagentTurns", "modelRequestCount",
                       "toolCalls", "workerReportBytesProduced", "workerReportBytesLoaded",
                       "policyReferenceLoads", "contextCompactions", "correctionCycles",
                       "leadActiveDuration", "leadSessionCount"):
            self.assertIn(metric, telemetry)
        for rule in ("TokenTracer", "null/unknown", "Never sum inclusive parent and child",
                     "Disk size is not a proxy", "not a semantic worker report payload"):
            self.assertIn(rule, telemetry)

    def test_legacy_and_ingestion_policy(self):
        policy = read(".agents/policies/orchestration-v3.md")
        for rule in ("LEGACY_UNSTRUCTURED", "Never downgrade malformed", "raw capture",
                     "const", "previousReport", "DONE is not ACCEPTED", "lazy-load",
                     "report-attempt-", "sha256", "stable finding IDs"):
            self.assertIn(rule, policy)
        with self.assertRaises(ValidationError):
            Draft7Validator(self.schema).validate("DONE\nlegacy terminal history")
        self.assertIn("worker-report.schema.json", read(".agents/templates/worker-contract.md"))
        self.assertIn("structured report", read(".agents/skills/story-development/SKILL.md"))


if __name__ == "__main__":
    unittest.main()
