// Audit-only isolated source probes. No Story action or persistence runs.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import vm from 'node:vm'
import { approvalRecordForSnapshot, explicitApprovalInput } from '../../../../.agents/scripts/check-story-completion.mjs'

const root = process.cwd()
const code = readFileSync('.agents/scripts/v4-action-kernel.mjs', 'utf8')
function sourceBetween(start, end) {
  const left = code.indexOf(start)
  const right = code.indexOf(end, left)
  if (left < 0 || right < 0) throw new Error('SOURCE_BOUNDARY_NOT_FOUND')
  return code.slice(left, right)
}
const riskSource = sourceBetween('function riskLevel(', 'function validateReviewQuestions(')
const riskLevel = vm.runInNewContext(`${riskSource}; riskLevel`, { RISK_LEVELS: new Set(['LOW', 'MEDIUM', 'HIGH']) })
const pass = { status: 'PASS', complete: true, escalationReasons: [], checks: [{ id: 'fixture-summary', status: 'PASS' }] }
function escalation(input) {
  const args = ['.agents/scripts/check-escalation.mjs']
  const result = spawnSync(process.execPath, args, { cwd: root, input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 10_000 })
  if (result.error) throw result.error
  return { command: ['node', ...args], stdin: input, exit_code: result.status, stdout: result.stdout.trim(), parsed: JSON.parse(result.stdout) }
}
const escalationCases = [
  { label: 'missing evidence', input: {} },
  { label: 'missing checks', input: { risk: 'LOW', verification: { status: 'PASS', complete: true, escalationReasons: [] }, judgmentFlags: [] } },
  { label: 'empty PASS checks', input: { risk: 'LOW', verification: { ...pass, checks: [] }, judgmentFlags: [] } },
  { label: 'conflicting PASS', input: { risk: 'LOW', verification: { ...pass, checks: [{ status: 'SKIPPED' }] }, judgmentFlags: [] } },
  { label: 'unknown flag', input: { risk: 'LOW', verification: pass, judgmentFlags: ['UNRECOGNIZED'] } },
  { label: 'raw INCOMPLETE preserved', input: { risk: 'LOW', verification: { status: 'INCOMPLETE', complete: false, escalationReasons: ['NO_APPLICABLE_RECIPE'], checks: [] }, judgmentFlags: [] } },
  { label: 'MEDIUM PASS', input: { risk: 'MEDIUM', verification: pass, judgmentFlags: [] } },
  { label: 'HIGH PASS', input: { risk: 'HIGH', verification: pass, judgmentFlags: [] } },
  { label: 'LOW PASS control', input: { risk: 'LOW', verification: pass, judgmentFlags: [] } }
].map(item => ({ label: item.label, ...escalation(item.input) }))
const verifySource = sourceBetween('function verifySliceCore(', 'function validateReviewAnswers(')
const cases = [
  { label: 'unchanged Plan HIGH', plan_risk: 'HIGH', request_risk: undefined },
  { label: 'Plan HIGH downgraded by caller', plan_risk: 'HIGH', request_risk: 'LOW' },
  { label: 'Plan MEDIUM downgraded by caller', plan_risk: 'MEDIUM', request_risk: 'LOW' },
].map(item => {
  const plan = { risk: { level: item.plan_risk } }
  const request = { action: 'verify_slice', story_id: '9.9', slice_id: 'A', expected_head: 'a'.repeat(40), ...(item.request_risk ? { risk: item.request_risk } : {}) }
  const selectedRisk = riskLevel(plan, request)
  const gate = escalation({ risk: selectedRisk, verification: pass, judgmentFlags: [] })
  let persistenceCalled = false
  const context = {
    path, request, root,
    assertVerificationRequestShape: () => {},
    verificationDescriptorFromPreview: () => ({ risk: selectedRisk, original_plan: plan, changed_paths: ['frontend/src/views/TodayView.vue'] }),
    runVerificationBundle: () => ({ verification: pass, escalation: gate.parsed }),
    persistVerification: (_root, _preview, _bundle, _request, target) => { persistenceCalled = true; return { status: 'STUBBED_PERSISTENCE_BRANCH_SELECTED', target_status: target } },
    inspectChangeEvidence: () => ({}), produceChangeEvidence: () => ({}), makePending: () => ({ scope: 'isolated' }),
    stale: reason => ({ status: 'STALE', reason }), invalid: reason => ({ status: 'INVALID', reason }), blocked: reason => ({ status: 'BLOCKED', reason }),
    verificationError: error => ({ status: 'ERROR', reason: error.message })
  }
  const output = vm.runInNewContext(`${verifySource}; verifySliceCore(root, request)`, context)
  return { ...item, selected_risk: selectedRisk, actual_escalation: gate, isolated_production_branch_result: output, stubbed_persistence_called: persistenceCalled,
    limitation: 'Production risk selector and verifySliceCore branch; descriptor/check/persistence dependencies stubbed. No durable action, product check, pointer read, receipt, or Plan mutation.' }
})
const runnerSource = readFileSync('.agents/scripts/v4-story-runner.mjs', 'utf8')
const codesLiteral = /const CODES = (\{[\s\S]*?\n\})/.exec(runnerSource)?.[1]
if (!codesLiteral) throw new Error('RUNNER_CODES_NOT_FOUND')
const codes = vm.runInNewContext(`(${codesLiteral})`)
const statusExitMapping = ['READY', 'DONE', 'APPROVAL_DURABLE_PENDING_COMPLETION', 'NOOP', 'APPLIED', 'REVIEW_REQUIRED', 'UNAUTHORIZED_ACTION'].map(status => ({ status, selected_exit_code: codes[status] ?? codes.ERROR }))
const snapshot = { story_id: '9.9', story_normative_digest: 'sha256:' + 'a'.repeat(64), finalization_receipt_digest: 'sha256:' + 'b'.repeat(64),
  done_gate_summary_digest: 'sha256:' + 'c'.repeat(64), scope_paths_digest: 'sha256:' + 'd'.repeat(64), implementation_commit_set_digest: 'sha256:' + 'e'.repeat(64), final_scoped_tree_digest: 'sha256:' + 'f'.repeat(64) }
const approval = approvalRecordForSnapshot(snapshot, '1'.repeat(40), '2026-10-06T00:00:00Z')
const assertions = {
  invalid_and_missing_cases_require_review: escalationCases.slice(0, 6).every(item => item.parsed.decision === 'REVIEW_REQUIRED' && item.exit_code !== 0),
  medium_and_high_require_review_when_preserved: escalationCases.slice(6, 8).every(item => item.parsed.decision === 'REVIEW_REQUIRED'),
  low_clean_control_no_review: escalationCases[8].parsed.decision === 'NO_REVIEW' && escalationCases[8].exit_code === 0,
  caller_high_to_low_reaches_no_review_branch: cases[1].selected_risk === 'LOW' && cases[1].actual_escalation.parsed.decision === 'NO_REVIEW' && cases[1].stubbed_persistence_called,
  caller_medium_to_low_reaches_no_review_branch: cases[2].stubbed_persistence_called,
  approval_label_is_human_from_pure_factory: approval.approver_type === 'human' && explicitApprovalInput({ action: 'approve_exact_scope', disclosures_acknowledged: true }),
}
console.log(JSON.stringify({ source_revision: '98def5358983072216a28754e87b1cd5f884d258', escalation_cases: escalationCases, risk_downgrade_cases: cases,
  runner_status_exit_mapping: statusExitMapping, pure_approval_record: approval, assertions,
  safety: 'Only stdin/stdout check-escalation subprocesses and pure/extracted functions; no Runner/action/persistence/clone/observation function invoked.' }, null, 2))
if (Object.values(assertions).some(value => !value)) process.exitCode = 1
