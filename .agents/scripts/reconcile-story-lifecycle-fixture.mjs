import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const script = path.resolve('.agents/scripts/reconcile-story-lifecycle.mjs')
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export const planRel = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
export const sprintRel = '_bmad-output/implementation-artifacts/sprint-status.yaml'
export function git(root, ...args) {
  const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  return p.stdout.trim()
}
export function fixture({ storyId = '9.1', sprint = 'backlog', snapshot = sprint, execution = 'in-progress', parent = 'in-progress', blocker = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'lifecycle-'))
  const fixturePlanRel = `_bmad-output/implementation-artifacts/story-${storyId.replace('.', '-')}-plan.md`
  const sprintKey = `${storyId.replace('.', '-')}-fixture`
  const epicId = storyId.split('.')[0]
  mkdirSync(path.join(root, '_bmad-output/implementation-artifacts'), { recursive: true })
  mkdirSync(path.join(root, '.agent-state'), { recursive: true })
  mkdirSync(path.join(root, 'docs/product'), { recursive: true })
  const section = `### Story ${storyId}: Fixture\n\nDone.\n\n`
  writeFileSync(path.join(root, 'docs/product/epics.md'), `# Epic\n\n${section}### Story ${epicId}.999: Next\n`)
  writeFileSync(path.join(root, '.agent-state/active-run.json'), JSON.stringify({schemaVersion:1, activeRunId:null, storyId:null, status:'IDLE'}))
  writeFileSync(path.join(root, sprintRel), `development_status:\n  epic-${epicId}: ${parent}\n  ${sprintKey}: ${sprint}\n`)
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  writeFileSync(path.join(root, 'seed.txt'), 'seed')
  git(root, 'add', 'seed.txt')
  git(root, 'commit', '-qm', 'seed')
  const checkpoint = git(root, 'rev-parse', 'HEAD')
  const plan = `---\nschema_version: 1\nstory_id: "${storyId}"\nsource:\n  path: docs/product/epics.md\n  anchor: "#story-${storyId.replace('.', '')}-fixture"\n  section_digest: "sha256:${digest(section)}"\nsprint_key: ${sprintKey}\nexecution_status: ${execution}\nlifecycle_snapshot: ${snapshot}\ncurrent_slice: A\nconsistency_note: lifecycle pending\nrisk:\n  level: LOW\nslices:\n  - id: A\n    status: in-progress\n    depends_on: []\n    checkpoint_commit: ${checkpoint}\n    verification:\n      gate_status: PASS\n    review:\n      required: true\n      verdict: APPROVE\n      reviewed_commit: ${checkpoint}\nblockers:${blocker ? '\n  - id: lifecycle-backlog-conflict\n    reason: Lifecycle pending.' : ' []'}\nunresolved_questions: []\ncheckpoints:\n  slice_a_commit: ${checkpoint}\nnext_action:\n  kind: reconcile_lifecycle\n  target: story\n${blocker?'  reference: lifecycle-backlog-conflict\n':''}---\n`
  const canonicalPlan = plan.replace('\n    status: in-progress\n', '\n    status: checkpointed\n')
  writeFileSync(path.join(root, fixturePlanRel), canonicalPlan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return {root, storyId, planRel:fixturePlanRel, sprintRel, head:git(root, 'rev-parse', 'HEAD'), plan:canonicalPlan, checkpoint}
}
export function run(f, verb, from, to, extra = [], env = {}) {
  const args = [script, verb, f.storyId, '--from', from, '--to', to, '--expected-head', f.head, ...extra]
  const p = spawnSync(process.execPath, args, {cwd:f.root, encoding:'utf8',env:{...process.env,...env}})
  return {code:p.status, json:JSON.parse(p.stdout), stderr:p.stderr}
}
export function withFixture(options, body) { const f=fixture(options); try { body(f) } finally { rmSync(f.root,{recursive:true,force:true}) } }
export function edit(f, rel, from, to) {
  const file=path.join(f.root,rel), old=readFileSync(file,'utf8')
  assert.ok(old.includes(from)); writeFileSync(file,old.replace(from,to))
}
export function recommit(f) { git(f.root,'add','.');git(f.root,'commit','-qm','setup');f.head=git(f.root,'rev-parse','HEAD') }
export function apply(f,from='backlog',to='in-progress',extra=[],env={},nextAction='verify_slice:A') {
  return run(f,'apply',from,to,['--expected-plan-sha256',digest(readFileSync(path.join(f.root,f.planRel))),'--expected-sprint-sha256',digest(readFileSync(path.join(f.root,f.sprintRel))),'--next-action',nextAction,...extra],env)
}
