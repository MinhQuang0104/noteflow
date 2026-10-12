import pathlib, subprocess, sys

out = pathlib.Path(__file__).resolve().parent
stages = [
    ('seed-benchmark', 'cached', [str(out / 'seed-benchmark.mjs')]),
    ('focused-cached', 'cached', ['.agents/scripts/finalize-story.test.mjs']),
    ('focused-uncached', 'uncached', ['.agents/scripts/finalize-story.test.mjs']),
    ('probe-final', 'cached', [str(out / 'cache-probe.mjs')]),
    ('full-cached-precommit', 'cached', []),
    ('full-uncached-precommit', 'uncached', []),
    ('precommit-python', 'cached', []),
]
if sys.argv[1:] == ['full-only']:
    stages = stages[4:]
else:
    assert not sys.argv[1:]
for label, mode, args in stages:
    subprocess.run([sys.executable, str(out / 'run-verification.py'), label, mode, *args], check=True)
    if label.startswith(('focused', 'full')):
        subprocess.run([sys.executable, str(out / 'compare-test-names.py'), label], check=True)
subprocess.run([sys.executable, str(out / 'audit-diff.py')], check=True)
print('PRECOMMIT CAMPAIGN COMPLETE', flush=True)
