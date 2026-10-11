import subprocess, pathlib, json, time, datetime, sys, hashlib
sys.stdout.reconfigure(encoding='utf8')
root=pathlib.Path.cwd()
out=root/'.agents/docs/v4-auto/evidence/perf-t1-2026-10-11'
out.mkdir(parents=True,exist_ok=True)
label=sys.argv[1]
cmd=['npm.cmd','run','test:v4','--','--test-reporter=spec'] if 'full' in label or label=='baseline' else ([r'D:/Tools/Python314/python.exe','-m','pytest','-q','_bmad/scripts/tests/test_agent_architecture.py'] if 'python' in label else ['node','--test','--test-reporter=spec']+sys.argv[2:])
meta={'label':label,'command':cmd,'cwd':str(root),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
source_paths=sorted((root/'.agents/scripts').glob('*.mjs'))+[root/'package.json',root/'_bmad/scripts/tests/test_agent_architecture.py']
source_hashes=lambda: {str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
meta['source_sha256_before']=source_hashes()
start=time.perf_counter()
with (out/(label+'.log')).open('wb') as log:
 p=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
meta.update(exit_code=p.returncode,wall_seconds=time.perf_counter()-start,ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
meta['source_sha256_after']=source_hashes()
meta['source_unchanged_during_run']=meta['source_sha256_before']==meta['source_sha256_after']
(out/(label+'.json')).write_text(json.dumps(meta,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in meta.items() if not k.startswith('source_sha256')}),flush=True)
print((out/(label+'.log')).read_text(encoding='utf8',errors='replace')[-1500:])
sys.exit(p.returncode)