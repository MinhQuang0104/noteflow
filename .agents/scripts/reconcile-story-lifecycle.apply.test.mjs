import { planRel, sprintRel, git, fixture, run, withFixture, edit, recommit, apply } from './reconcile-story-lifecycle-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { frontmatter } from './check-story-plan.mjs'

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
  edit(f,planRel,'status: checkpointed','status: reviewed');recommit(f)
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
  assert.ok(r.json.lifecycle_transaction?.journal_path,JSON.stringify(r.json))
  assert.ok(existsSync(r.json.lifecycle_transaction.journal_path))
  assert.ok(existsSync(r.json.lifecycle_transaction.lock_path))
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
