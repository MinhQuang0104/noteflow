import fs from 'node:fs'
const out='docs/audits/full-project-audit-2026-10-06'
const read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')
const e=JSON.parse(read(out+'/E-findings.json'))
const expiry=e.find(f=>f.id==='E-05')
expiry.verification='CONFIRMED'
expiry.evidence.push({kind:'F',ref:out+'/logs/phase3-frontend-probes-final.meta.json',note:'Independent Lead actual-source auth/reset probe + App/AppShell/ChallengesView rendering trace, exit0. Source function reaches guest while form refs persist and rendering conditions remain reachable; no real Vue/browser rendered.'})
expiry.failure_scenario='Đang /challenges mode=create với draft riêng tư; /account401 rồi /session401/null chuyển auth guest/account reset. Component không navigation/remount mới, local form refs còn nguyên và RouterView/create pane vẫn thỏa điều kiện render. Lead source-extracted probe và independent rendering trace confirm missing gate; không claim server auth bypass/cross-owner DB leak.'
fs.writeFileSync(out+'/E-findings.json',JSON.stringify(e,null,2)+'\n')
let report=read(out+'/E-frontend.md')
report=report.replace('PLAUSIBLE — static trace, chưa xác minh chéo/runtime |','CONFIRMED — Lead independent source trace + auth/reset probe; browser NOT_RUN |')
report=report.replace('Severity HIGH; VALID; PLAUSIBLE — static trace, cần independent Vue/App reproduction.','Severity HIGH; VALID; CONFIRMED — Lead independent auth/reset source probe + App/AppShell/view trace; Vue/browser rendering NOT_RUN.')
report=report.replace('View không registerPrivateStateReset/watch auth để khóa form.','View không registerPrivateStateReset/watch auth để khóa form. [F] Lead probe node logs/crossverify-frontend.mjs exit0, metadata phase3-frontend-probes-final.meta.json; auth guest và form retained, browser_rendered=false.')
report=report.replace(/\x60\x60\x60json\s*\[[\s\S]*?\]\s*\x60\x60\x60/, '\x60\x60\x60json\n'+JSON.stringify(e,null,2)+'\n\x60\x60\x60')
fs.writeFileSync(out+'/E-frontend.md',report)
let baseline=read(out+'/logs/finalize-baseline.mjs').replaceAll('prove-contract-drift.mjs:16,27','prove-contract-drift.mjs:15,25').replaceAll('prove-contract-drift.mjs:16 and27','prove-contract-drift.mjs:15 and25')
fs.writeFileSync(out+'/logs/finalize-baseline.mjs',baseline)
const i=read(out+'/I-repo-hygiene.md').replaceAll('backend/routes/api.php:18','backend/routes/api.php:21')
fs.writeFileSync(out+'/I-repo-hygiene.md',i)
console.log(JSON.stringify({updated:['E-findings.json','E-frontend.md','I-repo-hygiene.md','logs/finalize-baseline.mjs'],E05:'CONFIRMED',scope:'audit only'}))
