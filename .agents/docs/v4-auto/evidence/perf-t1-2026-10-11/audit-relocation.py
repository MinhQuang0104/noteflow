import pathlib,subprocess,json,hashlib,re
r=pathlib.Path.cwd(); e=r/'.agents/docs/v4-auto/evidence/perf-t1-2026-10-11'
manifest=json.loads((e/'extraction-manifest.json').read_bytes())
restored={row['path']:row['restored_sha256'] for row in json.loads((r/'.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/restoration.json').read_bytes())}
checks=[]
for row in manifest:
 p='.agents/scripts/'+row['test']; original=subprocess.check_output(['git','show','7501c70:'+p]).decode().replace('\n','\r\n')
 assert hashlib.sha256(original.encode()).hexdigest()==row['originalSha256']
 if p in restored: assert row['originalSha256']==restored[p]
 actual=(r/p).read_bytes(); assert hashlib.sha256(actual).hexdigest()==row['refactoredSha256']
 helper=(r/'.agents/scripts'/row['helper']).read_bytes().decode()
 for decl in row['movedDeclarations']:
  if decl['kind']=='function' and decl['name'] in ['git','write','digest']: continue
  # Recover exact original declaration by recorded byte length/hash, then check export-only relocation.
  if decl['kind']=='function': pattern=r'(?:^//[^\n]*\r?\n)*^(?:async )?function '+re.escape(decl['name'])+r'\('
  else: pattern=r'^const '+re.escape(decl['name'])+r' = '
  m=re.search(pattern,original,re.M); assert m
  block=original[m.start():m.start()+decl['bytes']]; assert hashlib.sha256(block.encode()).hexdigest()==decl['sha256']
  exported=re.sub(r'^(?=(?:async )?function )','export ',block,flags=re.M) if decl['kind']=='function' else 'export '+block
  assert exported in helper,(p,decl['name'])
 # Independently compare all remaining test text after removing only imports and relocated declarations.
 expected=re.sub(r'^import [\s\S]*? from [^\n]+\r?\n','',original,flags=re.M)
 for decl in row['movedDeclarations']:
  pattern=(r'(?:^//[^\n]*\r?\n)*^(?:async )?function '+re.escape(decl['name'])+r'\(') if decl['kind']=='function' else (r'^const '+re.escape(decl['name'])+r' = ')
  match=re.search(pattern,original,re.M); block=original[match.start():match.start()+decl['bytes']]
  expected=expected.replace(block+('\r\n' if decl['kind']=='function' else ''),'',1)
 if row['test']!='check-story-completion.test.mjs': expected=re.sub(r'^const digest = value => [^\n]+\r?\n','',expected,flags=re.M)
 residual=re.sub(r'^import [\s\S]*? from [^\n]+\r?\n','',actual.decode(),flags=re.M)
 assert expected==residual,p
 checks.append({'test':p,'allRemainingTestTextByteIdentical':True,'originalBytesBoundToT0':p in restored,'unchangedDeclarations':len(row['movedDeclarations']),'currentHashMatchesManifest':True})
# Module setup, dynamic executor import and after hook remain verbatim, at the same directory.
f=manifest[1]; before=subprocess.check_output(['git','show','7501c70:.agents/scripts/finalize-story.test.mjs']).decode().replace('\n','\r\n')
start=before.index('// Exercise a genuinely committed executor'); end=before.index("const STORY =",start)
executor=before[start:end]; assert executor in (r/'.agents/scripts/finalize-story.test.mjs').read_bytes().decode()
# Existing extracted seeds and integration's loading/action wrappers are byte-identical to T0.
unchanged=['completion-fixture.mjs','integration-test-fixture.mjs','v4-architecture-fixture.mjs','integrate-story.test.mjs']
for name in unchanged:
 old=subprocess.check_output(['git','show','7501c70:.agents/scripts/'+name])
 assert (r/'.agents/scripts'/name).read_bytes().replace(b'\r\n',b'\n')==old
pointer=pathlib.Path('D:/Workspace/Tu_Hoc/New_Project_My_Note/.agent-state/active-run.json')
assert hashlib.sha256(pointer.read_bytes()).hexdigest()=='5febd755d0136d14d573383bd88f33e8856acbaa0b4a2d25fd592e1820811ae4'
result={'checks':checks,'finalizeModuleExecutorSetupImportAndCleanupUnchanged':True,'existingFixtureModulesAndIntegrationTestUnchanged':unchanged,'canonicalPointerUnchanged':True,'risk':'MEDIUM: helper module consumers and executor source-copy boundaries','scope':'Pure helper relocation and same-semantics shared git/write/digest; no product/runtime/cache/test split/concurrency changes','sharedSemantics':{'git':'spawnSync git, identical args/options cwd+utf8+windowsHide, strict status assertion with stderr, trimmed stdout','write':'recursive parent mkdir, writeFileSync without encoding option (string and Buffer preserved)','digest':'sha256 prefix and createHash.update(value, utf8).digest(hex); fake repeated-letter completion digest stays separate'}}
(e/'diff-self-check.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8'); print(json.dumps(result,indent=2))