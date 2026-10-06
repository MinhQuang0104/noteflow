import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Lead's independent read-only probe. Do not import or invoke the action kernel.
const root = process.cwd()
const source = fs.readFileSync(path.join(root, '.agents/scripts/v4-action-kernel.mjs'), 'utf8')
const riskSource = source.match(/function riskLevel\(plan, request\) \{[\s\S]*?\n\}/)?.[0]
assert.ok(riskSource)
const riskLevel = new Function('RISK_LEVELS', `${riskSource}; return riskLevel`)(new Set(['LOW', 'MEDIUM', 'HIGH']))
const verification = { status: 'PASS', complete: true, escalationReasons: [], checks: [{ status: 'PASS' }] }
const observations = []
for (const requested of [undefined, 'LOW']) {
  const risk = riskLevel({ risk: { level: 'HIGH' } }, { risk: requested })
  const child = spawnSync(process.execPath, ['.agents/scripts/check-escalation.mjs'], {
    cwd: root, encoding: 'utf8', input: JSON.stringify({ risk, verification, judgmentFlags: [] }),
  })
  assert.equal(child.error, undefined)
  const escalation = JSON.parse(child.stdout)
  assert.equal(risk, requested === undefined ? 'HIGH' : 'LOW')
  assert.equal(child.status, requested === undefined ? 1 : 0)
  assert.equal(escalation.decision, requested === undefined ? 'REVIEW_REQUIRED' : 'NO_REVIEW')
  observations.push({ planned_risk: 'HIGH', request_risk: requested ?? null, effective_risk: risk,
    escalation_exit: child.status, decision: escalation.decision })
}
assert.ok(source.includes("bundle.escalation.decision === 'REVIEW_REQUIRED' || descriptorPreview.risk !== 'LOW'"))
assert.ok(source.includes("persistVerification(root, descriptorPreview, bundle, request, 'verified')"))
console.log(JSON.stringify({ finding: 'H-04', observations, branch_verified_by_source_trace: true,
  kernel_invoked: false, action_invoked: false, runtime_writes: false, scope: 'actual pure risk function and read-only escalation CLI; verification persistence branch statically traced' }, null, 2))
