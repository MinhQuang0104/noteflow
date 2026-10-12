import hashlib, json, pathlib, subprocess

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
archive = out.relative_to(root).as_posix() + '/'
own = archive + 'staged-diff-check.json'
allowed = {'.agents/scripts/finalize-story-fixture.mjs', '.agents/docs/v4-auto/perf-t2-2-report.md',
           '.agents/docs/v4-auto/perf-v4-test-suite.md', '.agents/docs/v4-auto/README.md'}
names = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z']).decode().split('\0')
names = [name for name in names if name and name != own]
assert allowed.issubset(names)
assert all(name in allowed or name.startswith(archive) for name in names), names
for name in names:
    staged = subprocess.check_output(['git', 'show', ':' + name])
    working = (root / name).read_bytes()
    if name.startswith(archive) and pathlib.Path(name).suffix in ('.json', '.log', '.patch'):
        assert staged == working, name
    else:
        assert staged.replace(b'\r\n', b'\n') == working.replace(b'\r\n', b'\n'), name
patch = subprocess.check_output(['git', 'diff', '--cached', '--', *sorted(allowed)])
result = dict(status='PASS', stagedFilesChecked=len(names), scopeOnlyT2_2=True, archiveBytesPreserved=True,
              sourceAndReportDiffSha256=hashlib.sha256(patch).hexdigest(),
              stagedSourceAndReports=sorted(allowed),
              evidenceSha256={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names if name.startswith(archive)})
(out/'staged-diff-check.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k!='evidenceSha256'},indent=2))
