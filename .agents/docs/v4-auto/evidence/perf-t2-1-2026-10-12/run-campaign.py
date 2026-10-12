import pathlib
import subprocess
import sys

directory = pathlib.Path(__file__).resolve().parent
python = sys.executable
stages = [
    ('probe-final', 'cached', [str(directory / 'cache-probe.mjs')]),
    ('seed-benchmark', 'cached', [str(directory / 'seed-benchmark.mjs')]),
    ('focused-cached', 'cached', ['.agents/scripts/v4-verification-flow.test.mjs']),
    ('focused-uncached', 'uncached', ['.agents/scripts/v4-verification-flow.test.mjs']),
    ('full-cached-precommit', 'cached', []),
    ('full-uncached-precommit', 'uncached', []),
    ('precommit-python', 'cached', []),
]
for label, mode, args in stages:
    subprocess.run([python, str(directory / 'run-verification.py'), label, mode, *args], check=True)
    if label.startswith(('focused', 'full')):
        subprocess.run([python, str(directory / 'compare-test-names.py'), label], check=True)
print('PRECOMMIT CAMPAIGN COMPLETE', flush=True)
