import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import crypto from 'node:crypto'
const out='docs/audits/full-project-audit-2026-10-06'
const changed=[]
function walk(dir){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name)
  if(e.isDirectory()){if(!['.npm-cache','.composer-cache','pytest-cache'].includes(e.name))walk(p);continue}
  if(e.name==='AUDIT-PLAN.md'||! /\.(md|json|mjs|ps1|log)$/.test(e.name))continue
  const original=fs.readFileSync(p),text=original.toString('utf8')
  const eol=text.includes('\r\n')?'\r\n':'\n'
  let normalized=text.replace(/[ \t]+(?=\r?$)/gm,'').replace(/(?:\r?\n)+$/,'')+eol
  if(normalized===text)continue
  let backup=null
  if(e.name.endsWith('.log')){
   backup=p+'.raw.gz'
   fs.writeFileSync(backup,gzipSync(original))
  }
  fs.writeFileSync(p,normalized)
  changed.push({path:p.replaceAll('\\','/'),raw_backup:backup?.replaceAll('\\','/')??null,raw_sha256:backup?crypto.createHash('sha256').update(original).digest('hex'):null})
 }
}
walk(out)
const record={kind:'F',initial_packaging_command:'git diff --cached --check',initial_exit_code:2,
root_cause:'trailing presentation whitespace in npm/Composer stdout; extra terminal blank lines in generated audit documents',
changes:'only audit artifact formatting; .log full text retained after trailing-margin/terminal-blank normalization; exact original bytes kept in .log.raw.gz',
plan_modified:false,source_modified:false,changed,recheck:'pending staged diff check; actual outcome reported by final handoff'}
fs.writeFileSync(path.join(out,'logs/packaging-whitespace.json'),JSON.stringify(record,null,2)+'\n')
console.log(JSON.stringify({normalized_files:changed.length,raw_log_backups:changed.filter(x=>x.raw_backup).length,source_modified:false,plan_modified:false}))
