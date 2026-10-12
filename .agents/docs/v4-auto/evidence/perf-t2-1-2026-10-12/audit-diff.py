import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
baseline = '19dffe291a77f4bbeb8c97bf2ef7a140fec30f48'
def original(relative):
    return subprocess.check_output(['git', 'show', baseline + ':' + relative])

tests = sorted((root / '.agents/scripts').glob('*.test.mjs'))
baseline_run = json.loads((out / 'baseline.json').read_bytes())
assert baseline_run['source_unchanged_during_run']
assert all(hashlib.sha256(p.read_bytes()).hexdigest() == baseline_run['source_sha256_before'][p.relative_to(root).as_posix()] for p in tests)
fixture = '.agents/scripts/v4-verification-fixture.mjs'
old = original(fixture).replace(b'\r\n', b'\n')
new = (root / fixture).read_bytes().replace(b'\r\n', b'\n')
start = b'export function fixture(risk, options = {}) {'
boundary = b'  const preparedImplementation = prepareAction(root, implementationRequest)'
suffix = b'export function withSliceRisk'
old_seed = old.split(start)[1].split(boundary)[0]
new_seed = new.split(b'function buildVerificationSeed(risk, options) {')[1].split(b'  return { root, cleanup, risk, storyDigest, initialHead, implementationRequest, changedPaths }')[0]
assert old_seed == new_seed, 'seed builder changed beyond extraction'
assert old.split(boundary)[1].split(suffix)[0] == new.split(boundary)[1].split(suffix)[0], 'prepare/checkpoint/consumer construction changed'
assert old.split(suffix)[1] == new.split(suffix)[1], 'remaining helpers changed'
assert old.split(b'export function storySource')[1].split(start)[0] == new.split(b'export function storySource')[1].split(b'function buildVerificationSeed')[0], 'pure helper changed'
changed = subprocess.check_output(['git', 'diff', baseline, '--name-only', '--', '.agents/scripts', 'package.json'], text=True).splitlines()
assert sorted(changed) in [[fixture], sorted([fixture, '.agents/scripts/v4-test-seed-cache.mjs'])], changed
helper = root / '.agents/scripts/v4-test-seed-cache.mjs'
assert helper.exists()
result = dict(status='PASS', parentCommit=baseline, testFilesByteIdentical=len(tests),
              consumerByteIdentical=True, actionChainAndAssertionsByteIdentical=True,
              oldSeedBodyPreserved=True, remainingFixtureHelpersPreserved=True,
              trackedScriptDiff=changed, newHelper=helper.relative_to(root).as_posix(),
              sha256={p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in [root / fixture, helper]})
(out / 'diff-self-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
with (out / 'implementation.patch').open('wb') as stream:
    subprocess.run(['git', 'diff', baseline, '--', fixture], stdout=stream, check=True)
print(json.dumps(result, indent=2))
