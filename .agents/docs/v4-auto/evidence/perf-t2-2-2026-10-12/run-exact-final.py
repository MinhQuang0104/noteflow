import pathlib, subprocess, sys

out = pathlib.Path(__file__).resolve().parent
expected = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD^'], text=True).strip() == '78fdda19dcad9c15f69fcdd62814ab9f89be7034'
assert subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip() == ''
for args in [
    ['run-verification.py', 'exact-final-full', 'cached'],
    ['compare-test-names.py', 'exact-final-full'],
    ['run-verification.py', 'exact-final-python', 'cached'],
    ['verify-final.py', expected],
]:
    subprocess.run([sys.executable, str(out / args[0]), *args[1:]], check=True)
