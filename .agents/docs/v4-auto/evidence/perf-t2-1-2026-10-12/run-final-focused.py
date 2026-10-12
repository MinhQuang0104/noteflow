import pathlib
import subprocess
import sys

directory = pathlib.Path(__file__).resolve().parent
for label, mode, args in [
    ('probe-final-contract', 'cached', [str(directory / 'cache-probe.mjs')]),
    ('seed-benchmark-final', 'cached', [str(directory / 'seed-benchmark.mjs')]),
    ('focused-cached-final', 'cached', ['.agents/scripts/v4-verification-flow.test.mjs']),
    ('focused-uncached-final', 'uncached', ['.agents/scripts/v4-verification-flow.test.mjs']),
]:
    subprocess.run([sys.executable, str(directory / 'run-verification.py'), label, mode, *args], check=True)
    if label.startswith('focused'):
        subprocess.run([sys.executable, str(directory / 'compare-test-names.py'), label], check=True)
