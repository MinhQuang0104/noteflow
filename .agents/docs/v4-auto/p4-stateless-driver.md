# V4 Auto P4 (optional) — implementation plan: stateless event driver

Design: `.agents/docs/v4-auto-design.md` §4. Optional; only when the owner asks,
any time after G3. Status: **OPTIONAL**.

## 0. Phase rules and rationale

Follow `README.md` common rules. Token cost is about the same as the P3
in-session `check --wait` loop (both resend context on each event); P4 exists
only for robustness: a crashed or compacted session no longer stalls the Story.

## 1. Target behaviour

A Node driver per Story waits on Orca events and, per event, resumes the Story's
Lead session with a fixed short prompt; the Lead runs one autopilot step and
exits. The driver holds no Story state; everything comes from
`autopilot-status` and the registry.

## 2. Tasks

### T1 — Driver

New: `.agents/scripts/v4-auto-driver.mjs` (+tests with stub binaries).

```text
run <story-id> --lead codex|claude --session <id> --generation <n>
    [--orca <path>] [--lead-bin <path>] [--max-events <n>]
```

- Loop: `autopilot-status`; on `STOP` print the reason and exit 3. On `CONTINUE`
  with a worker step pending, call
  `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms <slice budget>`;
  on an event (or immediately for non-worker steps) invoke the Lead:
  `claude -p --resume <session> "<prompt>"` or `codex exec resume <session> "<prompt>"`,
  where `<prompt>` is the constant
  "Continue V4 Auto Story <id>: run autopilot-status and execute exactly one step."
- External commands are injectable (`--orca`, `--lead-bin`) so tests use stub
  executables; never invoke real Orca/AGY/Claude/Codex in tests.
- Timeouts/empty waits follow the V3.2 liveness rule (3 empty waits or 15
  minutes → stop with `WORKER_SILENT`, owner decides).
- Never retries a Lead invocation that exited non-zero; stops with its exit code.
- Logs one JSON line per iteration to
  `.agent-state/v4-auto/<story-id>/driver.log` (gitignored).

### T2 — Docs

`references/autopilot.md`: optional driver section (start, stop, logs).

## 3. Owner smoke (not implementer work)

One Story run under the driver with each vendor; compare stalls/crash
recovery against P3. Keep P3 as default unless the driver is clearly better.

## 4. Done

T1–T2 committed, full `test:v4` + Python green, README status updated.
