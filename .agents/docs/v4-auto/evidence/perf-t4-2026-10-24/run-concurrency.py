import datetime, json, pathlib, subprocess, sys, time
sys.stdout.reconfigure(encoding='utf8')
out = pathlib.Path(__file__).resolve().parent
def node_processes():
    command = "(Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Measure-Object).Count"
    return subprocess.run(['powershell', '-NoProfile', '-Command', command], capture_output=True, text=True).stdout.strip()
for label in sys.argv[1:]:
    concurrency = label.split('-')[0][1:]  # c11-a -> 11
    cmd = ['npm.cmd', 'run', 'test:v4', '--', f'--test-concurrency={concurrency}', '--test-reporter=spec']
    meta = dict(label=label, concurrency=int(concurrency), command=cmd,
                head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                git_status_before=subprocess.check_output(['git', 'status', '--porcelain'], text=True),
                node_processes_before=node_processes(), started_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    start = time.perf_counter()
    with (out / (label + '.log')).open('wb') as log:
        run = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
    meta.update(exit_code=run.returncode, wall_seconds=round(time.perf_counter() - start, 3),
                ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                git_status_after=subprocess.check_output(['git', 'status', '--porcelain'], text=True))
    meta['git_status_unchanged_during_run'] = meta['git_status_before'] == meta['git_status_after']
    (out / (label + '.json')).write_text(json.dumps(meta, indent=2) + '\n', encoding='utf8')
    check = subprocess.run([sys.executable, str(out / 'compare-test-names.py'), label], capture_output=True, text=True, encoding='utf8')
    print(json.dumps({'label': label, 'exit': run.returncode, 'wall': meta['wall_seconds'], 'names_ok': check.returncode == 0, 'node_before': meta['node_processes_before']}), flush=True)
