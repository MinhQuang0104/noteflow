import json
import pathlib
import subprocess

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
files = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], text=True).splitlines()
allowed = {'.agents/scripts/v4-verification-fixture.mjs', '.agents/scripts/v4-test-seed-cache.mjs',
           '.agents/docs/v4-auto/README.md', '.agents/docs/v4-auto/perf-v4-test-suite.md',
           '.agents/docs/v4-auto/perf-t2-1-report.md'}
assert all(f in allowed or f.startswith('.agents/docs/v4-auto/evidence/perf-t2-1-2026-10-12/') for f in files)
assert all('/exact-final-' not in f for f in files)
checked = [f for f in files if not f.endswith(('.log', '.patch'))]
# Raw JSON is intentionally -text and retains Windows CRLF. Permit CR only at
# EOL while retaining the usual trailing-space, blank-EOF and indentation checks.
cmd = ['git', '-c', 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol',
       'diff', '--cached', '--check', '--', *checked]
check = subprocess.run(cmd, capture_output=True, text=True)
assert check.returncode == 0, (check.stdout + check.stderr)[:1000]
protected = [f for f in files if f.endswith('.test.mjs') or f.startswith(('backend/', 'frontend/', 'tests/', 'contracts/'))]
assert protected == []
for relative in allowed:
    raw = (root / relative).read_bytes()
    staged = subprocess.check_output(['git', 'show', ':' + relative])
    assert raw.replace(b'\r\n', b'\n') == staged.replace(b'\r\n', b'\n'), relative
for relative in files:
    if relative.endswith(('.json', '.log', '.patch')):
        assert (root / relative).read_bytes() == subprocess.check_output(['git', 'show', ':' + relative]), relative
result = dict(status='PASS', exactScope=True, stagedFiles=len(files), protectedChanges=protected,
              whitespacePassed=True, whitespaceCRLFOnlyException=True, rawEvidenceBytesPreserved=True,
              stagedFilesList=files)
(out / 'staged-diff-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps({k: v for k, v in result.items() if k != 'stagedFilesList'}, indent=2))
