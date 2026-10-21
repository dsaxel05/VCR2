#!/usr/bin/env python3
"""Look for API keys and tokens anywhere they could be shipped or leaked.

    python tools/key_scan.py                      # tracked files, the built page and assets, the whole git history
    python tools/key_scan.py --package DIR        # also every file of a package folder (and the zip inside it)

Exit code 1 if anything key-like is found. Prints counts only, never the matched text. Tests build their fake keys by joining
pieces ('sk-' + 'A' * 40), so a clean scan is the expected result.
"""
import pathlib, re, subprocess, sys, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
RX = re.compile(rb'sk-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----')
BINARY = {'.woff', '.woff2', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.xlsx', '.xlsm', '.pdf'}


def git(*a):
    return subprocess.run(['git', *a], cwd=ROOT, capture_output=True).stdout


def scan_bytes(label, data, hits):
    n = len(RX.findall(data))
    if n: hits.append((label, n))


def main():
    hits, counts = [], {}
    files = [f for f in git('ls-files', '-z').split(b'\0') if f]
    for f in files:
        p = ROOT / f.decode('utf-8', 'replace')
        if p.suffix.lower() in BINARY or not p.is_file(): continue
        scan_bytes(str(p.relative_to(ROOT)), p.read_bytes(), hits)
    counts['tracked files'] = len(files)
    built = [ROOT / 'index.html'] + sorted((ROOT / 'assets').rglob('*'))
    for p in built:
        if p.is_file() and p.suffix.lower() not in BINARY: scan_bytes('build: ' + str(p.relative_to(ROOT)), p.read_bytes(), hits)
    counts['build files'] = len(built)
    hist = git('log', '--all', '-p', '--no-color')
    scan_bytes('git history', hist, hits)
    counts['commits'] = len(git('rev-list', '--all').split())
    if '--package' in sys.argv:
        d = pathlib.Path(sys.argv[sys.argv.index('--package') + 1]); n = 0
        for p in d.rglob('*'):
            if not p.is_file(): continue
            n += 1
            if p.suffix.lower() == '.zip':
                with zipfile.ZipFile(p) as z:
                    for name in z.namelist():
                        if pathlib.Path(name).suffix.lower() not in BINARY: scan_bytes(f'{p.name}!{name}', z.read(name), hits)
            elif p.suffix.lower() not in BINARY:
                scan_bytes('package: ' + str(p.relative_to(d)), p.read_bytes(), hits)
        counts['package files'] = n
    print('scanned: ' + ', '.join(f'{v} {k}' for k, v in counts.items()))
    for label, n in hits: print(f'FOUND  {label}: {n} key-like string(s)')
    print('key scan: ' + ('CLEAN' if not hits else 'KEY-LIKE STRINGS FOUND'))
    sys.exit(1 if hits else 0)


main()
