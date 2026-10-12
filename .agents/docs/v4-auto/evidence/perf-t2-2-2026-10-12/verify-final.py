import datetime, hashlib, json, pathlib, subprocess, sys

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
canonical = pathlib.Path('D:/Workspace/Tu_Hoc/New_Project_My_Note')
parent = '78fdda19dcad9c15f69fcdd62814ab9f89be7034'
expected = sys.argv[1]
git = lambda *args: subprocess.check_output(['git', *args], text=True).strip()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((out / name).read_bytes())
assert git('rev-parse', 'HEAD') == expected
assert git('rev-parse', 'HEAD^') == parent
assert git('rev-list', '--count', parent + '..HEAD') == '1'
assert git('branch', '--show-current') == 'perf/v4-test-suite'
assert git('status', '--porcelain') == ''
assert git('log', '-1', '--format=%s').startswith('perf(v4):')
pointer_path = canonical / '.agent-state/active-run.json'
pointer = json.loads(pointer_path.read_bytes())
assert pointer == read('preflight.json')['canonicalPointer']
assert sha(pointer_path) == read('preflight.json')['pointerSha256']
golden = root / '.agents/docs/v4-auto/evidence/perf-t0-2026-10-11/golden-test-names.json'
assert sha(golden) == 'c26f85e4f087ef6d82b769b29a63dfc288474ecdb14f8e89e6a73a35264c9393'
labels = ['full-cached-precommit', 'full-uncached-precommit', 'exact-final-full']
full = [read(label + '.json') for label in labels]
counts = dict(tests=800, **{'pass':799}, fail=0, cancelled=0, skipped=1, todo=0)
for label in ['baseline', *labels]:
    check = read(label + '-name-check.json')
    assert check['exactMultisetEqual'] and check['occurrences'] == 800 and check['multilineNames'] == 7
    assert check['reporterCounts'] == counts and check['existingSkipUnchanged']
assert [run['cache_mode'] for run in full] == ['cached', 'uncached', 'cached']
assert full[2]['head'] == expected
python = read('exact-final-python.json')
assert python['head'] == expected and python['exit_code'] == 0
assert '46 passed, 46 subtests passed' in (out / 'exact-final-python.log').read_text(encoding='utf8')
for run in [*full, python]:
    assert run['exit_code'] == 0 and run['source_unchanged_during_run']
    assert run['git_status_unchanged_during_run']
    assert run['source_sha256_after'] == full[0]['source_sha256_after']
    for relative, digest in run['source_sha256_after'].items():
        assert sha(root / relative) == digest, relative
sequence = ['seed-benchmark', 'focused-cached', 'focused-uncached', 'probe-final', *labels[:2], 'precommit-python', *labels[2:], 'exact-final-python']
runs = [read(label + '.json') for label in sequence]
assert all(run['exit_code'] == 0 and run['source_unchanged_during_run'] for run in runs)
assert all(a['ended_at'] <= b['started_at'] for a, b in zip(runs, runs[1:]))
probe_log = (out/'probe-final.log').read_text(encoding='utf8')
assert all(line in probe_log for line in ['ℹ tests 8', 'ℹ pass 8', 'ℹ fail 0'])
focused = []
for label in ['focused-cached', 'focused-uncached']:
    check = read(label + '-name-check.json')
    assert check['exactMultisetEqual'] and check['occurrences'] == 33
    assert check['reporterCounts'] == dict(tests=33, **{'pass':33}, fail=0, cancelled=0, skipped=0, todo=0)
    focused.append(dict(label=label, wallSeconds=read(label+'.json')['wall_seconds'], tests=33, passed=33))
assert read('diff-self-check.json')['testFilesByteIdentical'] == 48
policy_paths = [pathlib.Path('AGENTS.md'), pathlib.Path('.agents/routing/task-router.md')]
policy_paths += [p.relative_to(root) for p in (root / '.agents/skills/v4-story-runner').rglob('*') if p.is_file()]
drift = [p.as_posix() for p in policy_paths if sha(root/p) != sha(canonical/p)]
result = dict(status='PASS', verifiedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              exactFinalCommit=expected, parentCommit=parent, sourceBaseline=git('rev-parse','87469b7'),
              oneT2_2Commit=True, cleanGitState=True, canonicalPointer=pointer,
              canonicalPointerSha256=sha(pointer_path), goldenSha256=sha(golden), policyDrift=drift,
              runsSequential=True, fullSuiteCounts=counts,
              fullSuiteRuns=[dict(label=r['label'],mode=r['cache_mode'],head=r['head'],wallSeconds=r['wall_seconds']) for r in full],
              exactPython=dict(tests=46,subtests=46,exitCode=0,wallSeconds=python['wall_seconds']), focusedRuns=focused,
              seedBenchmark=read('seed-timing.json'), sourceHashesUnchanged=True,
              artifactsSha256={p.name:sha(p) for p in sorted(out.iterdir()) if p.is_file() and p.suffix in ('.json','.log') and p.name != 'exact-final-check.json'},
              scope='T2.2 only; remaining T2/T3/T4 not started; no rebase/subagent/push/merge/live Story/canonical runtime writes')
(out/'exact-final-check.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ('artifactsSha256','seedBenchmark')},indent=2))
