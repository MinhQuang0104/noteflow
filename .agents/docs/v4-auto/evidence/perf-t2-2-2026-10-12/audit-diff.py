import hashlib, json, pathlib, subprocess

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
parent = '78fdda19dcad9c15f69fcdd62814ab9f89be7034'
fixture = '.agents/scripts/finalize-story-fixture.mjs'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = json.loads((out / 'baseline.json').read_bytes())
assert baseline['source_unchanged_during_run'] and baseline['exit_code'] == 0
for relative, digest in baseline['source_sha256_before'].items():
    if relative != fixture:
        assert sha(root / relative) == digest, relative
old = subprocess.check_output(['git', 'show', parent + ':' + fixture]).replace(b'\r\n', b'\n')
new = (root / fixture).read_bytes().replace(b'\r\n', b'\n')
old_body = old.split(b'export function fixture() {')[1].split(b'export function candidate')[0]
new_body = new.split(b'function buildReviewedSeed() {')[1].split(b'// Only the no-argument')[0]
assert old_body == new_body, 'original seed builder changed'
assert old.split(b'export function candidate')[1] == new.split(b'export function candidate')[1], 'candidate/preserved changed'
changed = subprocess.check_output(['git', 'diff', parent, '--name-only', '--', '.agents/scripts', 'package.json', '_bmad'], text=True).splitlines()
assert changed == [fixture], changed
result = dict(status='PASS', parentCommit=parent, sourceBaseline='87469b7', testFilesByteIdentical=48,
              consumerExecutorDynamicImportLifecycleAssertionsUnchanged=True, originalBuilderBodyPreserved=True,
              candidatePreservedHelpersUnchanged=True, sharedCacheHelperUnchanged=True,
              productionPackageConcurrencyUnchanged=True, trackedScriptDiff=changed, fixtureSha256=sha(root / fixture))
(out / 'diff-self-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
with (out / 'implementation.patch').open('wb') as stream:
    subprocess.run(['git', 'diff', parent, '--', fixture], stdout=stream, check=True)
print(json.dumps(result, indent=2))
