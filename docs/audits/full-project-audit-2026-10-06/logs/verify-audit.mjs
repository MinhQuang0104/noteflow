import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root=process.cwd(),outRel='docs/audits/full-project-audit-2026-10-06',out=path.join(root,outRel)
const parse=p=>JSON.parse(fs.readFileSync(path.join(out,p),'utf8').replace(/^\uFEFF/,''))
const git=args=>{const p=spawnSync('git',['--no-optional-locks',...args],{cwd:root,encoding:'utf8'});assert.equal(p.status,0,JSON.stringify({args,stderr:p.stderr}));return p.stdout.trim()}
const expectedHead='03dbd098e36245f51a4b8e875e89c1c0bb21acc6'
const head=git(['rev-parse','HEAD']),branch=git(['branch','--show-current'])
assert.equal(head,expectedHead);assert.equal(branch,'audit/full-project-2026-10-06')
const before=parse('logs/source-before.json'),changed=[]
for(const f of before){
 const bytes=fs.readFileSync(path.join(root,f.path)),hash=crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
 if(hash!==f.hash||bytes.length!==f.bytes)changed.push(f.path)
}
assert.deepEqual(changed,[],'STOP: tracked source bytes changed')
const status=git(['status','--porcelain=v1','--untracked-files=all']).split(/\r?\n/).filter(Boolean)
for(const line of status){const p=line.slice(3).replace(/^"|"$/g,'');assert.ok(p.startsWith(outRel+'/'),'STOP: outside output status:'+line)}
assert.equal(git(['diff','98def53','HEAD','--','.agents','backend','frontend','tests','contracts','scripts','deploy','compose.local.yaml','AGENTS.md','CLAUDE.md','_bmad','_bmad-output','package.json','skills-lock.json']),'')
assert.equal(git(['diff','--check','main']),'')
const canonical='D:/Workspace/Tu_Hoc/New_Project_My_Note'
const pointer=JSON.parse(fs.readFileSync(path.join(canonical,'.agent-state/active-run.json'),'utf8').replace(/^\uFEFF/,''))
assert.equal(pointer.schemaVersion,1);assert.equal(pointer.status,'IDLE');assert.equal(pointer.activeRunId,null);assert.equal(pointer.storyId,null)
const ws=['A-traceability.md','B-architecture.md','C-backend.md','D-contract.md','E-frontend.md','F-testing.md','G-infra.md','H-control-plane.md','I-repo-hygiene.md']
for(const f of [...ws,'00-preflight.md','01-baseline-checks.md','03-cross-verification.md','findings.json','prior-findings-status.md','remediation-backlog.md','AUDIT-REPORT.md'])assert.ok(fs.statSync(path.join(out,f)).size>0,f)
const findings=parse('findings.json'),required=['id','workstream','title','severity','classification','verification','evidence','failure_scenario','affected_paths','related_prior_finding','proposed_fix','proposed_lane','risk_of_fix']
const refs=[],external=[],commands=[]
for(const f of findings){
 assert.deepEqual(Object.keys(f).sort(),[...required].sort(),f.id)
 assert.ok(['VALID','FALSE_POSITIVE','SPEC_AMBIGUITY','NEEDS_HUMAN_DECISION'].includes(f.classification))
 assert.ok(['CONFIRMED','PLAUSIBLE'].includes(f.verification))
 if(['HIGH','CRITICAL'].includes(f.severity))assert.equal(f.verification,'CONFIRMED',f.id)
 if(f.classification==='VALID')assert.ok(f.evidence.some(e=>e.kind==='F'))
 for(const p of f.affected_paths){if(!p.includes('*'))assert.ok(fs.existsSync(path.join(root,p)),f.id+':affected:'+p)}
 for(const e of f.evidence){
  if(/^https?:/.test(e.ref)){external.push(e.ref);continue}
  if(/^[0-9a-f]{7,40}$/.test(e.ref)){git(['cat-file','-e',e.ref]);continue}
  const m=e.ref.match(/^(.+?):(\d+)(?:[–-]\d+)?$/)
  const ref=m?.[1]??e.ref
  const absolute=path.join(root,ref)
  if(fs.existsSync(absolute)){
   if(m){const total=fs.readFileSync(absolute,'utf8').split(/\r?\n/).length;assert.ok(Number(m[2])<=total,f.id+':line:'+e.ref)}
   refs.push(e.ref)
  }else if(ref.startsWith('docs/')||ref.startsWith('frontend/')||ref.startsWith('backend/')||ref.startsWith('.agents/')||ref.startsWith('tests/'))throw new Error('missing evidence:'+f.id+':'+e.ref)
  else commands.push({finding:f.id,kind:e.kind,ref:e.ref,note:e.note})
 }
}
const prior=fs.readFileSync(path.join(out,'prior-findings-status.md'),'utf8')
const priorRows=[...prior.matchAll(/^\| (09-30-[HML]\d+|10-06-F-\d+|Acceptance-F\d+) \| (OPEN|PARTIAL|RESOLVED) \|/gm)]
assert.equal(priorRows.length,35);assert.equal(new Set(priorRows.map(m=>m[1])).size,35)
const result={verified_at_utc:new Date().toISOString(),head,branch,code:'98def5358983072216a28754e87b1cd5f884d258',source_paths:before.length,source_byte_changes:changed,
canonical_pointer:{schemaVersion:pointer.schemaVersion,status:pointer.status,activeRunId:pointer.activeRunId,storyId:pointer.storyId},
outside_audit_status_paths:[],workstreams:ws.length,findings:findings.length,high_critical:findings.filter(f=>['HIGH','CRITICAL'].includes(f.severity)).length,
evidence_refs_existing:refs.length,external_sources:[...new Set(external)],nonfile_evidence:commands,prior_findings:priorRows.length,
prior_statuses:priorRows.reduce((a,m)=>(a[m[2]]=(a[m[2]]??0)+1,a),{}),git_diff_check_exit:0,post_commit_verification:'required in final handoff; no commit claimed by this precommit record'}
fs.writeFileSync(path.join(out,'logs/precommit-verification.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
