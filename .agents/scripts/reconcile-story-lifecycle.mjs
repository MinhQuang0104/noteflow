import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { validate, frontmatter } from './check-story-plan.mjs'

const CODES = { READY:0, APPLIED:0, NO_CHANGE:0, PRECONDITION_FAILED:2, CONFLICT:3, HUMAN_REQUIRED:4, INVALID:5, ERROR:6 }
const STATES = ['backlog','ready-for-dev','in-progress','review','done']
const EDGES = new Set(['backlog:ready-for-dev','backlog:in-progress','ready-for-dev:in-progress','in-progress:review','review:done'])
const REL_SPRINT = '_bmad-output/implementation-artifacts/sprint-status.yaml'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function git(root, ...args) {
  const p=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000})
  if (p.error || p.status === null) throw new Error('GIT_UNAVAILABLE')
  return p
}
function parseArgs(argv) {
  const [verb,id,...tail]=argv
  if (!['check','apply'].includes(verb) || !/^\d+\.\d+$/.test(id??'') || tail.length%2) throw new Error('USAGE')
  const o={verb,id}
  for(let i=0;i<tail.length;i+=2) {
    const key=tail[i], value=tail[i+1]
    if (!['--from','--to','--expected-head','--expected-plan-sha256','--expected-sprint-sha256','--next-action'].includes(key) || !value || o[key]) throw new Error('USAGE')
    o[key]=value
  }
  if (!o['--from'] || !o['--to'] || !/^[0-9a-f]{40,64}$/.test(o['--expected-head']??'')) throw new Error('USAGE')
  if (verb==='apply' && (!/^[0-9a-f]{64}$/.test(o['--expected-plan-sha256']??'') || !/^[0-9a-f]{64}$/.test(o['--expected-sprint-sha256']??'') || !o['--next-action'])) throw new Error('USAGE')
  return o
}
function fail(out,status,reason) { out.status=status; out.applicable=false; out.valid=false; out.reasons.push(reason); return out }
function entry(text,key) {
  const matches=[...text.matchAll(/^  ([^\s:#]+):\s*([^\s#]+)\s*$/gm)].filter(m=>m[1]===key)
  return matches.length===1 ? matches[0][2] : null
}
function replaceEntry(text,key,from,to) {
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const re=new RegExp(`^(  ${escaped}: )${from}(\\s*)$`,'gm')
  let n=0; const next=text.replace(re,(_,prefix,space)=>{n++;return prefix+to+space})
  if(n!==1) throw new Error('SPRINT_REPLACE_FAILED')
  return next
}
function replaceScalar(text,key,from,to) {
  const re=new RegExp(`^(${key}: )${from}(\\r?\\n)`,'gm')
  let n=0; const next=text.replace(re,(_,prefix,nl)=>{n++;return prefix+to+nl})
  if(n!==1) throw new Error('PLAN_REPLACE_FAILED')
  return next
}
function nextAction(raw,plan,to) {
  if (!raw) return null
  const m=/^([a-z_]+):([A-Za-z0-9_-]+)$/.exec(raw)
  if (!m) return null
  const [_,kind,target]=m
  if (!new Set(['plan_slice','implement_slice','verify_slice','review_slice','resolve_blocker','reconcile_lifecycle','request_gate','finalize_story']).has(kind)) return null
  const storyKinds=new Set(['reconcile_lifecycle','request_gate','finalize_story'])
  if (storyKinds.has(kind) ? target!=='story' : !plan.slices?.some(s=>s.id===target)) return null
  if (to==='done' ? kind!=='finalize_story' : kind==='finalize_story') return null
  if (['backlog','ready-for-dev'].includes(to) && ['implement_slice','verify_slice','review_slice'].includes(kind)) return null
  return {kind,target}
}
function changePlan(text,from,to,action,removeBlocker) {
  let next=replaceScalar(text,'lifecycle_snapshot',from,to)
  next=next.replace(/^consistency_note:.*\r?\n/m,'')
  if(removeBlocker) {
    const re=/^blockers:\r?\n  - id: lifecycle-backlog-conflict\r?\n(?:    [^\r\n]*\r?\n)*/m
    if (!re.test(next)) throw new Error('BLOCKER_REPLACE_FAILED')
    next=next.replace(re,'blockers: []\n')
  }
  if(action) {
    const re=/^next_action:\r?\n(?:  [^\r\n]*\r?\n)*/m
    if(!re.test(next)) throw new Error('NEXT_ACTION_REPLACE_FAILED')
    next=next.replace(re,`next_action:\n  kind: ${action.kind}\n  target: ${action.target}\n`)
  }
  return next
}
function pointer(root) {
  try { const p=JSON.parse(readFileSync(path.join(root,'.agent-state/active-run.json'),'utf8'))
    return p.schemaVersion===1 && p.status==='IDLE' && p.activeRunId===null && p.storyId===null
  } catch { return false }
}
function stateClass(sprint,plan,from,to) {
  if(sprint===from && plan===from) return 'CLEAN_BASE'
  if(sprint===to && plan===from) return 'PARTIAL_SPRINT_ONLY'
  if(sprint===from && plan===to) return 'PARTIAL_PLAN_ONLY'
  if(sprint===to && plan===to) return 'BOTH_TARGETS_UNCOMMITTED'
  return 'CONFLICTING_EDIT'
}
function inspect(root,o) {
  const relPlan=`_bmad-output/implementation-artifacts/story-${o.id.replace('.','-')}-plan.md`
  const out={storyId:o.id,from:o['--from'],to:o['--to'],valid:false,applicable:false,status:'INVALID',currentSprintState:null,currentPlanSnapshot:null,parentEpicState:null,expectedHead:o['--expected-head'],planSha256:null,sprintSha256:null,plannedChanges:[],successorNextAction:null,recoveryClassification:null,reasons:[]}
  const from=out.from,to=out.to
  if(!STATES.includes(from)||!STATES.includes(to)) return {out:fail(out,'INVALID','UNKNOWN_STATE')}
  if(from!==to&&!EDGES.has(`${from}:${to}`)) return {out:fail(out,from==='done'?'INVALID':'HUMAN_REQUIRED','UNSUPPORTED_TRANSITION')}
  if(git(root,'rev-parse','HEAD').stdout.trim()!==out.expectedHead) return {out:fail(out,'CONFLICT','EXPECTED_HEAD_MISMATCH')}
  if(!pointer(root)) return {out:fail(out,'PRECONDITION_FAILED','V3_POINTER_NOT_IDLE')}
  if(!existsSync(path.join(root,relPlan))) return {out:fail(out,'INVALID','PLAN_MISSING')}
  const planBytes=readFileSync(path.join(root,relPlan)), sprintBytes=readFileSync(path.join(root,REL_SPRINT))
  out.planSha256=sha(planBytes); out.sprintSha256=sha(sprintBytes)
  if(o.verb==='apply' && (out.planSha256!==o['--expected-plan-sha256']||out.sprintSha256!==o['--expected-sprint-sha256'])) return {out:fail(out,'CONFLICT','FILE_HASH_MISMATCH')}
  let plan
  try { plan=frontmatter(planBytes.toString('utf8')) } catch {return {out:fail(out,'INVALID','INVALID_FRONTMATTER')}}
  out.currentPlanSnapshot=plan.lifecycle_snapshot??null
  out.currentSprintState=entry(sprintBytes.toString('utf8'),plan.sprint_key)
  out.parentEpicState=entry(sprintBytes.toString('utf8'),`epic-${o.id.split('.')[0]}`)
  out.recoveryClassification=stateClass(out.currentSprintState,out.currentPlanSnapshot,from,to)
  if(out.recoveryClassification!=='CLEAN_BASE') return {out:fail(out,'CONFLICT',out.recoveryClassification)}
  if(out.currentSprintState!==from) return {out:fail(out,'PRECONDITION_FAILED','FROM_MISMATCH')}
  const checked=validate(root,o.id)
  if(!checked.valid) return {out:fail(out,checked.status==='STALE'?'PRECONDITION_FAILED':'INVALID',checked.reasons.join(','))}
  if(out.currentPlanSnapshot!==from) return {out:fail(out,'CONFLICT','SNAPSHOT_MISMATCH')}
  if(git(root,'diff','--cached','--name-only').stdout.trim()) return {out:fail(out,'PRECONDITION_FAILED','DIRTY_INDEX')}
  const dirty=git(root,'diff','--name-only').stdout.trim().split(/\r?\n/).filter(Boolean)
  if(dirty.some(p=>p!==relPlan&&p!==REL_SPRINT)) return {out:fail(out,'PRECONDITION_FAILED','UNRELATED_TRACKED_CHANGE')}
  if(dirty.length) return {out:fail(out,'CONFLICT','LIFECYCLE_TARGET_DIRTY')}
  if(from===to) {out.valid=true;out.status='NO_CHANGE';out.applicable=false;return {out}}
  if(plan.next_action?.kind!=='reconcile_lifecycle') return {out:fail(out,'PRECONDITION_FAILED','RECONCILIATION_ACTION_REQUIRED')}
  if(to==='in-progress' && plan.execution_status!=='in-progress') return {out:fail(out,'PRECONDITION_FAILED','EXECUTION_STATUS_MISMATCH')}
  if(to==='review' && plan.execution_status!=='review') return {out:fail(out,'PRECONDITION_FAILED','EXECUTION_STATUS_MISMATCH')}
  if(to==='done' && plan.execution_status!=='complete') return {out:fail(out,'PRECONDITION_FAILED','EXECUTION_STATUS_MISMATCH')}
  if(to==='ready-for-dev' && !['ready-for-dev','in-progress'].includes(plan.execution_status)) return {out:fail(out,'PRECONDITION_FAILED','EXECUTION_STATUS_MISMATCH')}
  if(to==='in-progress' && out.parentEpicState!=='backlog'&&out.parentEpicState!=='in-progress') return {out:fail(out,'HUMAN_REQUIRED','PARENT_EPIC_STATE')}
  const blockers=plan.blockers??[], questions=plan.unresolved_questions??[]
  if(!Array.isArray(blockers)||!Array.isArray(questions)) return {out:fail(out,'INVALID','INVALID_BLOCKERS')}
  const lifecycleBlocker=blockers.length===1&&blockers[0]?.id==='lifecycle-backlog-conflict'
  if((blockers.length&&!lifecycleBlocker)||questions.length) return {out:fail(out,'PRECONDITION_FAILED','PRODUCT_BLOCKER_OR_QUESTION')}
  const evidence=plan.slices?.some(s=>s.checkpoint_commit&&s.review?.reviewed_commit)
  if(to==='in-progress'&&!evidence) return {out:fail(out,'PRECONDITION_FAILED','CHECKPOINT_REVIEW_REQUIRED')}
  if(to==='review' && (!plan.slices?.every(s=>s.status==='complete'&&s.verification?.gate_status==='PASS'&&(!s.review?.required||s.review.verdict==='APPROVE')))) return {out:fail(out,'PRECONDITION_FAILED','REVIEW_GATES_INCOMPLETE')}
  if(to==='done') {
    const approval=plan.human_approval
    if(!(approval?.approved_by&&/^\d{4}-\d{2}-\d{2}/.test(approval?.approved_at??'')&&/^[0-9a-f]{40,64}$/.test(approval?.approved_commit??'')&&git(root,'merge-base','--is-ancestor',approval.approved_commit,'HEAD').status===0)) return {out:fail(out,'HUMAN_REQUIRED','HUMAN_APPROVAL_REQUIRED')}
  }
  const action=nextAction(o['--next-action'],plan,to)
  if(o['--next-action']&&!action) return {out:fail(out,'INVALID','INVALID_SUCCESSOR_ACTION')}
  if(o.verb==='apply'&&!action) return {out:fail(out,'INVALID','NEXT_ACTION_REQUIRED')}
  out.successorNextAction=action
  const changes=[{file:REL_SPRINT,field:`development_status.${plan.sprint_key}`,from,to}]
  if(to==='in-progress'&&out.parentEpicState==='backlog') changes.push({file:REL_SPRINT,field:`development_status.epic-${o.id.split('.')[0]}`,from:'backlog',to:'in-progress'})
  changes.push({file:relPlan,field:'state.lifecycle_snapshot',from,to})
  if(plan.consistency_note!==undefined) changes.push({file:relPlan,field:'state.consistency_note',from:plan.consistency_note,to:null})
  if(lifecycleBlocker) changes.push({file:relPlan,field:'constraints.blockers',removeIds:['lifecycle-backlog-conflict']})
  if(action) changes.push({file:relPlan,field:'next_action',from:plan.next_action,to:action})
  out.plannedChanges=changes
  let sprintNext=replaceEntry(sprintBytes.toString('utf8'),plan.sprint_key,from,to)
  if(to==='in-progress'&&out.parentEpicState==='backlog') sprintNext=replaceEntry(sprintNext,`epic-${o.id.split('.')[0]}`,'backlog','in-progress')
  const planNext=changePlan(planBytes.toString('utf8'),from,to,action,lifecycleBlocker)
  out.valid=true;out.applicable=true;out.status='READY'
  return {out,relPlan,planBytes,sprintBytes,planNext,sprintNext}
}
function apply(root,o,checked) {
  const {out,relPlan,planBytes,sprintBytes,planNext,sprintNext}=checked
  if(out.status!=='READY') return out
  const again=inspect(root,o)
  if(again.out.status!=='READY'||again.out.planSha256!==out.planSha256||again.out.sprintSha256!==out.sprintSha256) return fail(out,'CONFLICT','FINAL_GUARD_CHANGED')
  const sprintFile=path.join(root,REL_SPRINT), planFile=path.join(root,relPlan)
  const sprintTemp=`${sprintFile}.${randomUUID()}.tmp`,planTemp=`${planFile}.${randomUUID()}.tmp`
  const cleanup=()=>{for(const p of [sprintTemp,planTemp]) if(existsSync(p)) unlinkSync(p)}
  // Fault injection is confined to disposable test repositories.
  const fault=path.basename(root).startsWith('lifecycle-') ? process.env.LIFECYCLE_TEST_FAULT : null
  try {
    writeFileSync(sprintTemp,sprintNext,{flag:'wx'});writeFileSync(planTemp,planNext,{flag:'wx'})
    const final=inspect(root,o)
    if(final.out.status!=='READY'||final.out.planSha256!==out.planSha256||final.out.sprintSha256!==out.sprintSha256) {cleanup();return fail(out,'CONFLICT','FINAL_GUARD_CHANGED')}
    if(fault==='before-write') throw new Error('TEST_BEFORE_WRITE')
    renameSync(sprintTemp,sprintFile)
    if(fault==='after-first-write') throw new Error('TEST_AFTER_FIRST_WRITE')
    if(fault==='concurrent-edit') {writeFileSync(sprintFile,`${sprintNext}# concurrent\n`);throw new Error('TEST_CONCURRENT_EDIT')}
    if(sha(readFileSync(sprintFile))!==sha(sprintNext)) throw new Error('FIRST_WRITE_CONFLICT')
    renameSync(planTemp,planFile)
    if(sha(readFileSync(planFile))!==sha(planNext)) throw new Error('SECOND_WRITE_CONFLICT')
    const reread=validate(root,o.id)
    if(!reread.valid||reread.actualLifecycle!==o['--to']||reread.lifecycleSnapshot!==o['--to']) throw new Error('POST_WRITE_VALIDATION_FAILED')
    if(sha(readFileSync(sprintFile))!==sha(sprintNext)||sha(readFileSync(planFile))!==sha(planNext)) throw new Error('POST_WRITE_CONFLICT')
    if(git(root,'diff','--cached','--name-only').stdout.trim()) throw new Error('DIRTY_INDEX_AFTER_WRITE')
    const add=git(root,'add','--',REL_SPRINT,relPlan)
    if(add.status!==0) throw new Error('STAGE_FAILED')
    const staged=git(root,'diff','--cached','--name-only').stdout.trim().split(/\r?\n/).filter(Boolean).sort()
    if(JSON.stringify(staged)!==JSON.stringify([REL_SPRINT,relPlan].sort())) throw new Error('STAGED_SCOPE_MISMATCH')
    const commit=git(root,'commit','-m',`Reconcile Story ${o.id} lifecycle ${o['--from']} to ${o['--to']}`,'--only','--',REL_SPRINT,relPlan)
    if(commit.status!==0) throw new Error('COMMIT_FAILED')
    out.status='APPLIED';out.lifecycleCommit=git(root,'rev-parse','HEAD').stdout.trim();return out
  } catch(error) {
    cleanup()
    const sprintNow=sha(readFileSync(sprintFile)),planNow=sha(readFileSync(planFile))
    if(sprintNow===sha(sprintNext)&&planNow===sha(planBytes)) {
      writeFileSync(sprintFile,sprintBytes)
      out.recoveryClassification='CLEAN_BASE'
    } else out.recoveryClassification=stateClass(entry(readFileSync(sprintFile,'utf8'),frontmatter(planBytes.toString()).sprint_key),frontmatter(readFileSync(planFile,'utf8')).lifecycle_snapshot,o['--from'],o['--to'])
    return fail(out,error.message==='COMMIT_FAILED'?'ERROR':'CONFLICT',error.message)
  }
}
try {
  const o=parseArgs(process.argv.slice(2))
  const rootResult=git(process.cwd(),'rev-parse','--show-toplevel')
  if(rootResult.status!==0) throw new Error('GIT_ROOT_UNAVAILABLE')
  const root=path.resolve(rootResult.stdout.trim())
  const checked=inspect(root,o)
  const result=o.verb==='apply'?apply(root,o,checked):checked.out
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode=CODES[result.status]
} catch(error) {
  process.stdout.write(`${JSON.stringify({valid:false,applicable:false,status:error.message==='USAGE'?'INVALID':'ERROR',reasons:[error.message]})}\n`)
  process.exitCode=CODES[error.message==='USAGE'?'INVALID':'ERROR']
}
