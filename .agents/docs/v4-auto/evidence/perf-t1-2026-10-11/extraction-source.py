import pathlib,re,json,hashlib,subprocess
r=pathlib.Path.cwd(); d=r/'.agents/scripts'; evidence=r/'.agents/docs/v4-auto/evidence/perf-t1-2026-10-11'
configs={
 'v4-verification-flow':('v4-verification-fixture',None),
 'finalize-story':('finalize-story-fixture',['digest','write','git','fixture','candidate','preserved']),
 'v4-action-kernel':('v4-kernel-fixture',None),
 'v4-slice-transaction':('v4-transaction-fixture',None),
 'v4-no-review-finalization.e2e':('v4-no-review-finalization-fixture',None),
 'check-story-completion':('check-story-completion-fixture',None),
}
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=[]; originals={}; bodies={}; shared={}
for name,(module,selected) in configs.items():
 p=d/(name+'.test.mjs'); s=subprocess.check_output(['git','show','7501c70:.agents/scripts/'+name+'.test.mjs']).decode('utf8').replace('\n','\r\n'); originals[name]=s
 funcs=[]
 for m in re.finditer(r'(?:^//[^\n]*\r?\n)*^(?:async )?function (\w+)\([^\n]*\) \{\r?\n',s,re.M):
  end=re.search(r'^}\r?\n',s[m.end():],re.M)
  assert end,m.group(1)
  if selected is None or m.group(1) in selected:
   funcs.append((m.group(1),m.start(),m.end()+end.end()))
 bodies[name]={fn:s[a:b] for fn,a,b in funcs}
 if name!='check-story-completion':
  for fn in ['git','write']:
   b=bodies[name][fn].replace('\r\n','\n')
   if fn in shared: assert b==shared[fn],(name,fn)
   else: shared[fn]=b
# digest function/arrow forms have the same expression and encoding.
shared['digest']="function digest(value) {\n  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')\n}\n"
sharedImports="import assert from 'node:assert/strict'\nimport { createHash } from 'node:crypto'\nimport { mkdirSync, writeFileSync } from 'node:fs'\nimport path from 'node:path'\nimport { spawnSync } from 'node:child_process'\n\n"
(d/'v4-test-helpers.mjs').write_bytes((sharedImports+'\n'.join('export '+shared[fn] for fn in ['git','write','digest'])).encode('utf8'))
for name,(module,selected) in configs.items():
 s=originals[name]; nl='\r\n' if '\r\n' in s else '\n'
 funcs=bodies[name]; sharedNames=['git','write','digest'] if name!='check-story-completion' else []
 moved={k:v for k,v in funcs.items() if k not in sharedNames}
 # Keep the executor setup/after hook in the original finalize test module.
 imports=''.join(m.group(0) for m in re.finditer(r'^import [\s\S]*? from [^\n]+\r?\n',s,re.M) if not m.group(0).startswith('import test'))
 # Constants (including multiline builder values) remain byte-identical.
 constants=[]
 for m in re.finditer(r'^const (\w+) = ',s,re.M):
  ident=m.group(1)
  if name=='finalize-story' and ident in ['executorFixture','recovery']: continue
  end=re.search(r'\r?\n(?=\r?\n|(?:const |function |async function |test\(|for \())',s[m.end():])
  assert end,ident
  block=s[m.start():m.end()+end.end()]
  if ident=='digest' and sharedNames: continue
  constants.append((ident,block))
 helper=imports+nl
 if sharedNames: helper+="import { git, write, digest } from './v4-test-helpers.mjs'"+nl+nl
 # Remove conflicting imports only if identifiers also defined locally? Existing imports don't declare shared.
 helper+=''.join('export '+b for ident,b in constants)+nl
 def exported_function(b): return re.sub(r'^(?=(?:async )?function )','export ',b,flags=re.M)
 helper+=nl.join(exported_function(b) for b in moved.values())
 # imports originally include crypto etc unused; remove unused bindings deterministically below.
 exports=[ident for ident,b in constants]+list(moved)
 remaining=s
 removed=[]
 for fn,b in funcs.items():
  remaining=remaining.replace(b+nl,'',1); removed.append({'kind':'function','name':fn,'sha256':sha(b.encode()),'bytes':len(b.encode())})
 for ident,b in constants:
  # All constant declarations relocated to the same-directory helper.
  remaining=remaining.replace(b,'',1); removed.append({'kind':'constant','name':ident,'sha256':sha(b.encode()),'bytes':len(b.encode())})
 if sharedNames:
  arrow=re.search(r"^const digest = value => [^\n]+\r?\n",remaining,re.M)
  if arrow: remaining=remaining[:arrow.start()]+remaining[arrow.end():]
  remaining="import { git, write, digest } from './v4-test-helpers.mjs'"+nl+remaining
 remaining="import { "+', '.join(exports)+" } from './"+module+".mjs'"+nl+remaining
 # Prune unused named/default imports without touching body or namespace imports.
 def prune_imports(text):
  pattern=r'^import ([\s\S]*?) from ([^\n]+)\r?\n'
  def prune(m):
   spec=m.group(1); rest=text[:m.start()]+text[m.end():]
   if spec.startswith('*'): return m.group(0)
   if spec.startswith('{'):
    parts=[x.strip() for x in spec[1:spec.rfind('}')].split(',') if x.strip()]
    parts=[x for x in parts if re.search(r'\b'+re.escape(x.split(' as ')[-1])+r'\b',rest)]
    return ('import { '+', '.join(parts)+' } from '+m.group(2).rstrip('\r')+nl) if parts else ''
   if ',' not in spec and not re.search(r'\b'+re.escape(spec)+r'\b',rest): return ''
   return m.group(0)
  return re.sub(pattern,prune,text,flags=re.M)
 # helper imports shared names conflict with old functions? removed from funcs, yes.
 helper=prune_imports(helper); remaining=prune_imports(remaining)
 (d/(module+'.mjs')).write_bytes(helper.encode())
 (d/(name+'.test.mjs')).write_bytes(remaining.encode())
 # Verify every moved declaration is exactly original except export keyword.
 for fn,b in moved.items(): assert exported_function(b) in helper,(name,fn)
 for ident,b in constants: assert 'export '+b in helper,(name,ident)
 # Compare the complete residual body after stripping imports + selected declarations.
 def residual(text,old=False):
  text=re.sub(r'^import [\s\S]*? from [^\n]+\r?\n','',text,flags=re.M)
  if old:
   for b in funcs.values(): text=text.replace(b+nl,'',1)
   for ident,b in constants: text=text.replace(b,'',1)
   if sharedNames: text=re.sub(r'^const digest = value => [^\n]+\r?\n','',text,flags=re.M)
  return text
 assert residual(s,True)==residual(remaining),name
 manifest.append({'test':name+'.test.mjs','helper':module+'.mjs','originalSha256':sha(s.encode()),'refactoredSha256':sha(remaining.encode()),'movedDeclarations':removed,'unchangedResidualBody':True,'movedDeclarationBytesIdenticalExceptExport':True})
(evidence/'extraction-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
print(json.dumps([{'test':m['test'],'declarations':len(m['movedDeclarations'])} for m in manifest],indent=2))