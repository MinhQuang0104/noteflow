import fs from 'node:fs'
import path from 'node:path'
const out='docs/audits/full-project-audit-2026-10-06'
const parse=p=>JSON.parse(fs.readFileSync(path.join(out,p),'utf8').replace(/^\uFEFF/,''))
const original=[...['A','B','C','D','E','F','H'].flatMap(w=>parse(w+'-findings.json')),...parse('own-findings.json')]
const required=['id','workstream','title','severity','classification','verification','evidence','failure_scenario','affected_paths','related_prior_finding','proposed_fix','proposed_lane','risk_of_fix']
const seen=new Set()
for(const f of original){
 if(seen.has(f.id))throw new Error('duplicate:'+f.id)
 seen.add(f.id)
 if(JSON.stringify(Object.keys(f).sort())!==JSON.stringify([...required].sort()))throw new Error('fields:'+f.id)
 if(f.classification==='VALID'&&!f.evidence.some(e=>e.kind==='F'))throw new Error('no fact:'+f.id)
 if(['HIGH','CRITICAL'].includes(f.severity)&&f.verification!=='CONFIRMED')throw new Error('unconfirmed high:'+f.id)
}
const final=structuredClone(original)
const a1=final.find(f=>f.id==='A-01'),a2=final.find(f=>f.id==='A-02')
a1.title='Story done chưa có đủ manual AT/native browser unload evidence theo AC'
a1.evidence.push(...a2.evidence)
a1.affected_paths=[...new Set([...a1.affected_paths,...a2.affected_paths])]
a1.failure_scenario=a1.failure_scenario+' Nhóm A-02: '+a2.failure_scenario
a1.proposed_fix='Thu manual screen-reader evidence Story1.6AC4 và native browser dirty/clean unload/logout Story1.5AC4 trên OS/browser/AT cụ thể, hoặc formal human disposition/amendment nghĩa vụ; giữ NOT_RUN/disclosures lịch sử, không giả PASS từ unit fallback.'
final.splice(final.findIndex(f=>f.id==='A-02'),1)
const rank={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3,INFO:4}
final.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.id.localeCompare(b.id))
fs.writeFileSync(path.join(out,'findings.json'),JSON.stringify(final,null,2)+'\n')
const sev={},classification={}
for(const f of final){sev[f.severity]=(sev[f.severity]??0)+1;classification[f.classification]=(classification[f.classification]??0)+1}
const stats={original:original.length,merged:final.length,severity:sev,classification,high_critical_confirmed:final.filter(f=>['HIGH','CRITICAL'].includes(f.severity)).map(f=>f.id),
human_decisions:final.filter(f=>f.classification==='NEEDS_HUMAN_DECISION').map(f=>({id:f.id,title:f.title})),dedupe:[{from:'A-02',to:'A-01',reason:'missing actual browser/AT evidence obligations; both independent Lead traces retained'}]}
fs.writeFileSync(path.join(out,'merge-summary.json'),JSON.stringify(stats,null,2)+'\n')
console.log(JSON.stringify(stats,null,2))
console.log(JSON.stringify(final.filter(f=>['HIGH','CRITICAL'].includes(f.severity)).map(f=>({id:f.id,ref:f.evidence.find(e=>e.kind==='F')?.ref})),null,2))
