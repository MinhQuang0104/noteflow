import collections, json, pathlib, re, sys
sys.stdout.reconfigure(encoding='utf8')
root = pathlib.Path.cwd(); out = pathlib.Path(__file__).resolve().parent
label = sys.argv[1]
raw = (out / (label + '.log')).read_bytes().decode('utf8')
pattern = r'^[✔﹣✖] ([\s\S]*?) \(([\d.]+)ms\)([^\r\n]*)\r?$'
occ = [(m.group(1), m.group(0)[0], m.group(3)) for m in re.finditer(pattern, raw, re.M)]
actual = collections.Counter(name for name, _, _ in occ)
inventory = json.loads((root / '.agents/scripts/v4-test-names.json').read_bytes())
expected = collections.Counter(inventory + ['V4 test inventory matches the committed top-level test name list'])
golden = collections.Counter(json.loads((root / '.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/golden-test-names.json').read_bytes()))
counts = {k: int(v) for k, v in re.findall(r'^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$', raw, re.M)}
result = {'label': label, 'occurrences': sum(actual.values()), 'inventoryPlusGuardEqual': actual == expected,
          'missing': list((expected - actual).elements()), 'extra': list((actual - expected).elements()),
          'goldenContained': not (golden - actual), 'reporterCounts': counts,
          'skipped': [{'name': n, 'annotation': a} for n, mark, a in occ if mark == '﹣']}
(out / (label + '-name-check.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(result, ensure_ascii=False, indent=2))
assert actual == expected and result['goldenContained']
assert counts == {'tests': 806, 'pass': 805, 'fail': 0, 'cancelled': 0, 'skipped': 1, 'todo': 0}
assert [s['name'] for s in result['skipped']] == ['rejects symlinked cwd or referenced paths']
