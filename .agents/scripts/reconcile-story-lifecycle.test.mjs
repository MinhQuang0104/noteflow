import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { frontmatter } from './check-story-plan.mjs'

const script = path.resolve('.agents/scripts/reconcile-story-lifecycle.mjs')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const planRel = '_bmad-output/implementation-artifacts/story-9-1-plan.md'
const sprintRel = '_bmad-output/implementation-artifacts/sprint-status.yaml'
function git(root, ...args) {
  const p = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  return p.stdout.trim()
}
function fixture({ storyId = '9.1', sprint = 'backlog', snapshot = sprint, execution = 'in-progress', parent = 'in-progress', blocker = true } = {}) {
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
  writeFileSync(path.join(root, fixturePlanRel), plan)
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return {root, storyId, planRel:fixturePlanRel, sprintRel, head:git(root, 'rev-parse', 'HEAD'), plan, checkpoint}
}
function run(f, verb, from, to, extra = [], env = {}) {
  const args = [script, verb, f.storyId, '--from', from, '--to', to, '--expected-head', f.head, ...extra]
  const p = spawnSync(process.execPath, args, {cwd:f.root, encoding:'utf8',env:{...process.env,...env}})
  return {code:p.status, json:JSON.parse(p.stdout), stderr:p.stderr}
}
function withFixture(options, body) { const f=fixture(options); try { body(f) } finally { rmSync(f.root,{recursive:true,force:true}) } }
function edit(f, rel, from, to) {
  const file=path.join(f.root,rel), old=readFileSync(file,'utf8')
  assert.ok(old.includes(from)); writeFileSync(file,old.replace(from,to))
}
function recommit(f) { git(f.root,'add','.');git(f.root,'commit','-qm','setup');f.head=git(f.root,'rev-parse','HEAD') }
function apply(f,from='backlog',to='in-progress',extra=[],env={},nextAction='verify_slice:A') {
  return run(f,'apply',from,to,['--expected-plan-sha256',digest(readFileSync(path.join(f.root,f.planRel))),'--expected-sprint-sha256',digest(readFileSync(path.join(f.root,f.sprintRel))),'--next-action',nextAction,...extra],env)
}

test('backlog to in-progress preview is read only', () => withFixture({}, f => {
  const before=[readFileSync(path.join(f.root,planRel)),readFileSync(path.join(f.root,sprintRel))].map(digest)
  const r=run(f,'check','backlog','in-progress',['--next-action','verify_slice:A'])
  assert.equal(r.code,0,JSON.stringify(r.json)); assert.equal(r.json.status,'READY'); assert.equal(r.json.applicable,true)
  assert.deepEqual([readFileSync(path.join(f.root,planRel)),readFileSync(path.join(f.root,sprintRel))].map(digest),before)
}))
test('backlog to ready-for-dev allowed',()=>withFixture({execution:'ready-for-dev'},f=>{
  const r=run(f,'check','backlog','ready-for-dev',['--next-action','plan_slice:A']);assert.equal(r.code,0,JSON.stringify(r.json))
}))
test('ready-for-dev to in-progress allowed',()=>withFixture({sprint:'ready-for-dev'},f=>{
  assert.equal(run(f,'check','ready-for-dev','in-progress',['--next-action','verify_slice:A']).code,0)
}))
test('in-progress to review with complete gates',()=>withFixture({sprint:'in-progress',blocker:false,execution:'review'},f=>{
  edit(f,planRel,'status: in-progress','status: complete');recommit(f)
  const r=run(f,'check','in-progress','review',['--next-action','request_gate:story']);assert.equal(r.code,0,JSON.stringify(r.json))
}))
test('review to done requires human approval',()=>withFixture({sprint:'review',blocker:false,execution:'complete'},f=>{
  edit(f,planRel,'status: in-progress','status: complete');recommit(f)
  let r=run(f,'check','review','done',['--next-action','finalize_story:story']);assert.equal(r.code,4,JSON.stringify(r.json))
  edit(f,planRel,'next_action:\n','human_approval:\n  approved_by: Person\n  approved_at: 2026-09-24\n  approved_commit: '+f.checkpoint+'\nnext_action:\n');recommit(f)
  r=run(f,'check','review','done',['--next-action','finalize_story:story']);assert.equal(r.code,0,JSON.stringify(r.json))
}))
test('same state no change',()=>withFixture({},f=>{const r=run(f,'check','backlog','backlog');assert.equal(r.code,0);assert.equal(r.json.status,'NO_CHANGE')}))
test('same-state apply creates no lifecycle commit',()=>withFixture({},f=>{
  const before=f.head
  const r=apply(f,'backlog','backlog')
  assert.equal(r.code,0,JSON.stringify(r.json));assert.equal(r.json.status,'NO_CHANGE');assert.equal(git(f.root,'rev-parse','HEAD'),before)
}))
test('reverse transition needs human',()=>withFixture({sprint:'in-progress'},f=>assert.equal(run(f,'check','in-progress','backlog').code,4)))
test('done cannot advance',()=>withFixture({sprint:'done'},f=>assert.equal(run(f,'check','done','review').code,5)))
test('unknown state invalid',()=>withFixture({},f=>assert.equal(run(f,'check','nonsense','review').code,5)))
test('missing Story invalid',()=>withFixture({},f=>{rmSync(path.join(f.root,planRel));assert.equal(run(f,'check','backlog','in-progress').code,5)}))
test('stale source digest rejected',()=>withFixture({},f=>{edit(f,'docs/product/epics.md','Done.','Changed.');assert.equal(run(f,'check','backlog','in-progress').code,2)}))
test('active V3 pointer blocks preview',()=>withFixture({},f=>{
  writeFileSync(path.join(f.root,'.agent-state/active-run.json'),JSON.stringify({schemaVersion:1,activeRunId:'run',storyId:'9.1',status:'ACTIVE'}))
  assert.equal(run(f,'check','backlog','in-progress').code,2)
}))
test('missing checkpoint reference blocks preview',()=>withFixture({},f=>{
  edit(f,planRel,`checkpoint_commit: ${f.checkpoint}`,'checkpoint_commit: '+ '0'.repeat(40))
  edit(f,planRel,`slice_a_commit: ${f.checkpoint}`,'slice_a_commit: '+ '0'.repeat(40));recommit(f)
  assert.equal(run(f,'check','backlog','in-progress').code,2)
}))
test('sprint snapshot mismatch classified',()=>withFixture({},f=>{
  edit(f,sprintRel,'9-1-fixture: backlog','9-1-fixture: in-progress');const r=run(f,'check','backlog','in-progress');assert.equal(r.code,3);assert.equal(r.json.recoveryClassification,'PARTIAL_SPRINT_ONLY')
}))
test('expected from mismatch',()=>withFixture({},f=>assert.equal(run(f,'check','ready-for-dev','in-progress').code,3)))
test('expected HEAD mismatch',()=>withFixture({},f=>{f.head='0'.repeat(40);assert.equal(run(f,'check','backlog','in-progress').code,3)}))
test('plan hash mismatch',()=>withFixture({},f=>{
  const r=run(f,'apply','backlog','in-progress',['--expected-plan-sha256','0'.repeat(64),'--expected-sprint-sha256',digest(readFileSync(path.join(f.root,sprintRel))),'--next-action','verify_slice:A']);assert.equal(r.code,3)
}))
test('sprint hash mismatch',()=>withFixture({},f=>{
  const r=run(f,'apply','backlog','in-progress',['--expected-plan-sha256',digest(readFileSync(path.join(f.root,planRel))),'--expected-sprint-sha256','0'.repeat(64),'--next-action','verify_slice:A']);assert.equal(r.code,3)
}))
test('dirty index',()=>withFixture({},f=>{writeFileSync(path.join(f.root,'seed.txt'),'dirty');git(f.root,'add','seed.txt');assert.equal(run(f,'check','backlog','in-progress').code,2)}))
test('unrelated tracked worktree change',()=>withFixture({},f=>{writeFileSync(path.join(f.root,'seed.txt'),'dirty');assert.equal(run(f,'check','backlog','in-progress').code,2)}))
test('parent backlog planned for in-progress',()=>withFixture({parent:'backlog'},f=>{
  const r=run(f,'check','backlog','in-progress');assert.equal(r.code,0);assert.ok(r.json.plannedChanges.some(c=>c.field==='development_status.epic-9'))
}))
test('parent in-progress unchanged',()=>withFixture({},f=>{
  const r=run(f,'check','backlog','in-progress');assert.equal(r.code,0);assert.ok(!r.json.plannedChanges.some(c=>c.field==='development_status.epic-9'))
}))
test('parent done requires human',()=>withFixture({parent:'done'},f=>assert.equal(run(f,'check','backlog','in-progress').code,4)))
test('product blocker prevents in-progress',()=>withFixture({},f=>{
  edit(f,planRel,'id: lifecycle-backlog-conflict','id: product-blocker');edit(f,planRel,'reference: lifecycle-backlog-conflict','reference: product-blocker');recommit(f);assert.equal(run(f,'check','backlog','in-progress').code,2)
}))
test('invalid successor action',()=>withFixture({},f=>assert.equal(run(f,'check','backlog','in-progress',['--next-action','unknown:A']).code,5)))
test('apply commits exactly two files and preserves other semantic fields',()=>withFixture({parent:'backlog'},f=>{
  const before=readFileSync(path.join(f.root,planRel),'utf8')
  const r=apply(f);assert.equal(r.code,0,JSON.stringify(r.json));assert.equal(r.json.status,'APPLIED')
  assert.deepEqual(git(f.root,'show','--pretty=format:','--name-only','HEAD').split(/\r?\n/).filter(Boolean).sort(),[planRel,sprintRel].sort())
  assert.equal(git(f.root,'status','--porcelain'),'')
  const after=readFileSync(path.join(f.root,planRel),'utf8')
  const beforeFields=frontmatter(before),afterFields=frontmatter(after)
  for(const key of ['lifecycle_snapshot','consistency_note','blockers','next_action']) {delete beforeFields[key];delete afterFields[key]}
  assert.deepEqual(afterFields,beforeFields)
  assert.match(readFileSync(path.join(f.root,sprintRel),'utf8'),/epic-9: in-progress/)
}))
test('backlog to in-progress uses the exact canonical commit message',()=>withFixture({},f=>{
  const r=apply(f);assert.equal(r.code,0,JSON.stringify(r.json))
  assert.equal(git(f.root,'log','-1','--format=%s'),'chore(lifecycle): move story 9.1 backlog to in-progress')
}))
test('in-progress to review uses the exact canonical commit message',()=>withFixture({sprint:'in-progress',blocker:false,execution:'review'},f=>{
  edit(f,planRel,'status: in-progress','status: complete');recommit(f)
  const r=apply(f,'in-progress','review',[],{},'request_gate:story');assert.equal(r.code,0,JSON.stringify(r.json))
  assert.equal(git(f.root,'log','-1','--format=%s'),'chore(lifecycle): move story 9.1 in-progress to review')
}))
test('arbitrary validated Story ID formats deterministically',()=>withFixture({storyId:'12.34'},f=>{
  const r=apply(f);assert.equal(r.code,0,JSON.stringify(r.json))
  assert.equal(git(f.root,'log','-1','--format=%s'),'chore(lifecycle): move story 12.34 backlog to in-progress')
}))
test('failure before write changes nothing',()=>withFixture({},f=>{
  const old=readFileSync(path.join(f.root,sprintRel),'utf8');const r=apply(f,'backlog','in-progress',[],{LIFECYCLE_TEST_FAULT:'before-write'});assert.equal(r.code,3);assert.equal(readFileSync(path.join(f.root,sprintRel),'utf8'),old)
}))
test('first write failure rolls back unchanged target',()=>withFixture({},f=>{
  const old=readFileSync(path.join(f.root,sprintRel),'utf8');const r=apply(f,'backlog','in-progress',[],{LIFECYCLE_TEST_FAULT:'after-first-write'});assert.equal(r.code,3);assert.equal(readFileSync(path.join(f.root,sprintRel),'utf8'),old)
}))
test('concurrent edit prevents rollback overwrite',()=>withFixture({},f=>{
  const r=apply(f,'backlog','in-progress',[],{LIFECYCLE_TEST_FAULT:'concurrent-edit'});assert.equal(r.code,3);assert.match(readFileSync(path.join(f.root,sprintRel),'utf8'),/# concurrent/)
}))
test('both writes before commit failure remain recoverable',()=>withFixture({},f=>{
  mkdirSync(path.join(f.root,'.githooks'));writeFileSync(path.join(f.root,'.githooks/pre-commit'),'#!/bin/sh\nexit 1\n');git(f.root,'config','core.hooksPath','.githooks')
  const r=apply(f);assert.equal(r.code,6,JSON.stringify(r.json));assert.equal(r.json.recoveryClassification,'BOTH_TARGETS_UNCOMMITTED')
  assert.equal(run(f,'check','backlog','in-progress').json.recoveryClassification,'BOTH_TARGETS_UNCOMMITTED')
}))
test('partial Plan only is classified without mutation',()=>withFixture({},f=>{
  edit(f,planRel,'lifecycle_snapshot: backlog','lifecycle_snapshot: in-progress')
  const r=run(f,'check','backlog','in-progress');assert.equal(r.code,3);assert.equal(r.json.recoveryClassification,'PARTIAL_PLAN_ONLY')
}))
test('conflicting edit is classified without overwrite',()=>withFixture({},f=>{
  edit(f,sprintRel,'9-1-fixture: backlog','9-1-fixture: done')
  const r=run(f,'check','backlog','in-progress');assert.equal(r.code,3);assert.equal(r.json.recoveryClassification,'CONFLICTING_EDIT')
}))
test('untracked unrelated file is never staged or committed',()=>withFixture({},f=>{
  writeFileSync(path.join(f.root,'untracked.txt'),'unrelated')
  const r=apply(f);assert.equal(r.code,0,JSON.stringify(r.json))
  assert.equal(git(f.root,'ls-files','untracked.txt'),'')
  assert.equal(readFileSync(path.join(f.root,'untracked.txt'),'utf8'),'unrelated')
}))
