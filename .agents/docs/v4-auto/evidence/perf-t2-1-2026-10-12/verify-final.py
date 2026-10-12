import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
canonical = pathlib.Path('D:/Workspace/Tu_Hoc/New_Project_My_Note')
parent = '19dffe291a77f4bbeb8c97bf2ef7a140fec30f48'
expected = sys.argv[1]
def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def read(name):
    return json.loads((out / name).read_bytes())

assert git('rev-parse', 'HEAD') == expected
assert git('rev-parse', 'HEAD^') == parent
assert git('rev-list', '--count', parent + '..HEAD') == '1'
assert git('branch', '--show-current') == 'perf/v4-test-suite'
assert git('status', '--porcelain') == ''
pointer_path = canonical / '.agent-state/active-run.json'
pointer = json.loads(pointer_path.read_bytes())
assert pointer == read('preflight.json')['canonicalPointer']
assert sha(pointer_path) == read('preflight.json')['pointerSha256']
golden = root / '.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/golden-test-names.json'
assert sha(golden) == 'c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393'
full_labels = ['full-cached-precommit', 'full-uncached-precommit', 'exact-final-full']
full_runs = [read(label + '.json') for label in full_labels]
names = [read(label + '-name-check.json') for label in full_labels]
counts = {'tests': 800, 'pass': 799, 'fail': 0, 'cancelled': 0, 'skipped': 1, 'todo': 0}
for check in names:
    assert check['exactMultisetEqual'] and check['occurrences'] == 800 and check['multilineNames'] == 7
    assert check['reporterCounts'] == counts
assert [run['cache_mode'] for run in full_runs] == ['cached', 'uncached', 'cached']
assert full_runs[2]['head'] == expected
python = read('exact-final-python.json')
assert python['head'] == expected
assert '46 passed, 46 subtests passed' in (out / 'exact-final-python.log').read_text(encoding='utf8')
for run in [*full_runs, python]:
    assert run['exit_code'] == 0 and run['source_unchanged_during_run']
    assert run['source_sha256_before'] == run['source_sha256_after']
    assert run['source_sha256_after'] == full_runs[0]['source_sha256_after']
    for relative, digest in run['source_sha256_after'].items():
        assert sha(root / relative) == digest, relative
sequence = ['unproven-green', 'full-cached-precommit', 'full-uncached-precommit', 'precommit-python',
            'probe-final-contract', 'seed-benchmark-final', 'focused-cached-final', 'focused-uncached-final',
            'exact-final-full', 'exact-final-python']
runs = [read(label + '.json') for label in sequence]
assert all(run['exit_code'] == 0 for run in runs)
assert all(a['ended_at'] <= b['started_at'] for a, b in zip(runs, runs[1:]))
assert all(run['source_unchanged_during_run'] for run in runs)
for label in ['focused-cached-final', 'focused-uncached-final']:
    check = read(label + '-name-check.json')
    assert check['exactMultisetEqual'] and check['occurrences'] == 41
    assert check['reporterCounts'] == {'tests': 41, 'pass': 41, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert read('diff-self-check.json')['testFilesByteIdentical'] == 48
policy_paths = [pathlib.Path('AGENTS.md'), pathlib.Path('.agents/routing/task-router.md')]
policy_paths += [p.relative_to(root) for p in (root / '.agents/skills/v4-story-runner').rglob('*') if p.is_file()]
policy_drift = [p.as_posix() for p in policy_paths if sha(root / p) != sha(canonical / p)]
result = dict(status='PASS', verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              exactFinalCommit=expected, parentCommit=parent, sourceBaseline=git('rev-parse', '87469b7'),
              oneT2_1Commit=True, cleanGitState=True, canonicalPointer=pointer,
              canonicalPointerSha256=sha(pointer_path), goldenSha256=sha(golden),
              policyDrift=policy_drift, runsSequential=True, fullSuiteCounts=counts,
              fullSuiteRuns=[dict(label=run['label'], mode=run['cache_mode'], head=run['head'], wallSeconds=run['wall_seconds']) for run in full_runs],
              exactPython=dict(tests=46, subtests=46, exitCode=0, wallSeconds=python['wall_seconds']),
              focusedRuns=[dict(label=read(label + '.json')['label'], wallSeconds=read(label + '.json')['wall_seconds'], tests=41, passCount=41) for label in ['focused-cached-final', 'focused-uncached-final']],
              seedBenchmark=read('seed-timing.json'), sourceHashesUnchanged=True,
              artifactsSha256={p.name: sha(p) for p in sorted(out.iterdir()) if p.is_file() and p.suffix in ('.json', '.log') and p.name != 'exact-final-check.json'},
              scope='T2.1 only; remaining T2/T3/T4 not started; no rebase/subagent/push/merge/live Story/canonical runtime writes')
(out / 'exact-final-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps({k: v for k, v in result.items() if k not in ('artifactsSha256', 'seedBenchmark')}, indent=2))
