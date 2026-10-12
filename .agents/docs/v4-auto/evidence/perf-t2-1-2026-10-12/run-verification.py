import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf8')
root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
label, mode = sys.argv[1:3]
assert mode in ('cached', 'uncached')
env = os.environ.copy()
env.pop('V4_TEST_NO_CACHE', None)
if mode == 'uncached':
    env['V4_TEST_NO_CACHE'] = '1'
if 'full' in label or label == 'baseline':
    cmd = ['npm.cmd', 'run', 'test:v4', '--', '--test-reporter=spec']
elif 'python' in label:
    cmd = ['D:/Tools/Python314/python.exe', '-m', 'pytest', '-q', '_bmad/scripts/tests/test_agent_architecture.py']
elif 'benchmark' in label:
    cmd = ['node', *sys.argv[3:]]
else:
    cmd = ['node', '--test', '--test-reporter=spec', *sys.argv[3:]]
paths = sorted((root / '.agents/scripts').glob('*.mjs')) + [root / 'package.json', root / '_bmad/scripts/tests/test_agent_architecture.py']
paths += [root / arg for arg in cmd if arg.endswith('.mjs') and (root / arg).is_file() and root / arg not in paths]
hashes = lambda: {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
meta = dict(label=label, command=cmd, cwd=str(root), cache_mode=mode,
            head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            started_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            source_sha256_before=hashes())
print(json.dumps({'started': label, 'mode': mode, 'head': meta['head']}), flush=True)
start = time.perf_counter()
with (out / (label + '.log')).open('wb') as log:
    run = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, env=env)
if 'benchmark' in label:
    for line in (out / (label + '.log')).read_text(encoding='utf8').splitlines():
        if line.startswith('{'):
            timing = json.loads(line)
            if 'variant' in timing:
                (out / 'seed-timing.json').write_text(json.dumps(timing, indent=2) + '\n', encoding='utf8')
meta.update(exit_code=run.returncode, wall_seconds=time.perf_counter() - start,
            ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), source_sha256_after=hashes())
meta['source_unchanged_during_run'] = meta['source_sha256_before'] == meta['source_sha256_after']
(out / (label + '.json')).write_text(json.dumps(meta, indent=2) + '\n', encoding='utf8')
print(json.dumps({k: v for k, v in meta.items() if not k.startswith('source_sha256')}), flush=True)
print((out / (label + '.log')).read_text(encoding='utf8', errors='replace')[-1500:])
sys.exit(run.returncode)
