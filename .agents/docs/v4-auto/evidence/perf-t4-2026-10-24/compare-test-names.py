import pathlib,re,json,collections,sys,hashlib
sys.stdout.reconfigure(encoding='utf8')
r=pathlib.Path.cwd(); out=pathlib.Path(__file__).resolve().parent
label=sys.argv[1]
raw=(out/(label+'.log')).read_bytes().decode('utf8')
# Reporter occurrences terminate at the duration suffix; embedded LF/CRLF belongs to the name.
pattern=r'^[✔﹣✖] ([\s\S]*?) \(([\d.]+)ms\)([^\r\n]*)\r?$'
occ=[]
for m in re.finditer(pattern,raw,re.M):
 name=m.group(1)
 # Node writes Windows reporter line endings as LF. Do not trim, normalize or deduplicate names.
 occ.append({'name':name,'duration_ms':float(m.group(2)),'annotation':m.group(3),'marker':m.group(0)[0]})
golden=json.loads((r/'.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/golden-test-names.json').read_bytes())
actual=[o['name'] for o in occ]
expected_counts={'tests':800,'pass':799,'fail':0,'cancelled':0,'skipped':1,'todo':0}
golden=golden+['V4 test inventory matches the committed top-level test name list']
expected_counts={'tests':801,'pass':800,'fail':0,'cancelled':0,'skipped':1,'todo':0}
a=collections.Counter(actual); g=collections.Counter(golden)
counts={k:int(v) for k,v in re.findall(r'^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$',raw,re.M)}
result={'label':label,'occurrences':len(actual),'goldenOccurrences':len(golden),'distinctNames':len(a),'multilineNames':sum('\n' in n for n in actual),'exactMultisetEqual':a==g,'missing':list((g-a).elements()),'extra':list((a-g).elements()),'reporterCounts':counts,'goldenSha256':hashlib.sha256((r/'.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/golden-test-names.json').read_bytes()).hexdigest()}
(out/(label+'-names.json')).write_text(json.dumps(actual,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(out/(label+'-name-check.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
assert a==g
assert counts==expected_counts
if True:
 reference=(r/'.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/default.log').read_bytes().decode('utf8')
 expected_skip=[{'name':m.group(1),'annotation':m.group(3)} for m in re.finditer(pattern,reference,re.M) if m.group(0).startswith('﹣ ')]
 actual_skip=[{'name':o['name'],'annotation':o['annotation']} for o in occ if o['marker']=='﹣']
 result['existingSkipUnchanged']=actual_skip==expected_skip and len(actual_skip)==1
 result['existingSkip']=actual_skip
 (out/(label+'-name-check.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 assert result['existingSkipUnchanged'], (actual_skip,expected_skip)
