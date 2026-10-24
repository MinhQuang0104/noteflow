import datetime, json, pathlib, subprocess, sys, time
sys.stdout.reconfigure(encoding='utf8')
root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
label = sys.argv[1]
extra = sys.argv[2:]
cmd = ['npm.cmd', 'run', 'test:v4', '--', *extra, '--test-reporter=spec', '--test-reporter-destination=stdout',
       '--test-reporter=junit', f'--test-reporter-destination={out / (label + ".junit.xml")}']
meta = dict(label=label, command=cmd, head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            git_status_before=subprocess.check_output(['git', 'status', '--porcelain'], text=True),
            started_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
start = time.perf_counter()
with (out / (label + '.log')).open('wb') as log:
    run = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
meta.update(exit_code=run.returncode, wall_seconds=round(time.perf_counter() - start, 3),
            ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            git_status_after=subprocess.check_output(['git', 'status', '--porcelain'], text=True))
meta['git_status_unchanged_during_run'] = meta['git_status_before'] == meta['git_status_after']
(out / (label + '.json')).write_text(json.dumps(meta, indent=2) + '\n', encoding='utf8')
print(json.dumps({k: v for k, v in meta.items() if not k.startswith('git_status_')}))
sys.exit(run.returncode)
