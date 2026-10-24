import { digest, planRel, sprintRel, git, fixture, run, withFixture, edit, recommit, apply } from './reconcile-story-lifecycle-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { lifecyclePaths } from './v4-lifecycle-transaction.mjs'

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
  edit(f,planRel,'status: checkpointed','status: reviewed');recommit(f)
  const r=run(f,'check','in-progress','review',['--next-action','request_gate:story']);assert.equal(r.code,0,JSON.stringify(r.json))
}))

test('review to done requires human approval',()=>withFixture({sprint:'review',blocker:false,execution:'complete'},f=>{
  edit(f,planRel,'status: checkpointed','status: reviewed');recommit(f)
  let r=run(f,'check','review','done',['--next-action','finalize_story:story']);assert.equal(r.code,4,JSON.stringify(r.json))
  edit(f,planRel,'next_action:\n','human_approval:\n  approved_by: Person\n  approved_at: 2026-09-24\n  approved_commit: '+f.checkpoint+'\nnext_action:\n');recommit(f)
  r=run(f,'check','review','done',['--next-action','finalize_story:story']);assert.equal(r.code,4,JSON.stringify(r.json))
  assert.ok(r.json.reasons.includes('COMPLETE_STORY_REQUIRES_EXPLICIT_APPROVAL'))
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

test('concurrent lifecycle caller is blocked by the shared lock',()=>withFixture({},f=>{
  const locations=lifecyclePaths(f.root,f.storyId)
  mkdirSync(locations.directory,{recursive:true})
  writeFileSync(locations.lockPath,JSON.stringify({transaction_id:'other',story_id:f.storyId})+'\n')
  const r=apply(f)
  assert.equal(r.code,3,JSON.stringify(r.json))
  assert.ok(r.json.reasons.includes('LIFECYCLE_SCOPE_LOCKED'),JSON.stringify(r.json))
  assert.equal(readFileSync(locations.lockPath,'utf8'),JSON.stringify({transaction_id:'other',story_id:f.storyId})+'\n')
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
