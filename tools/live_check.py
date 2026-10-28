"""Live site check: the address in site.json must serve exactly the files this repository holds.

Run by .github/workflows/live-check.yml every six hours (and by hand: python tools/live_check.py).
It catches what tests of the code cannot: a hijacked domain or DNS record, a page changed outside the repository, an
expired or wrong certificate, or a deploy that did not land. When it fails, GitHub emails the owner.

Checked byte for byte: the page, the published configuration, the logo and favicon files, the link-preview picture,
every self-hosted font and the home page demo video with its captions and poster. Right after a push the hosting needs a few minutes, so a difference while the latest commit is
younger than 30 minutes is reported as "deploy in progress", not as a failure. A first difference is checked again
twice before the run fails. Only GitHub's own servers and the site itself are contacted; nothing is sent.
"""
import hashlib, json, pathlib, subprocess, sys, time, urllib.request, urllib.error, ssl
ROOT = pathlib.Path(sys.argv[sys.argv.index('--root') + 1]).resolve() if '--root' in sys.argv else pathlib.Path(__file__).resolve().parents[1]

def files():
    out = ['index.html']
    if (ROOT / 'radar-config.json').exists(): out.append('radar-config.json')
    for d in ['assets/logo/svg', 'assets/logo/png', 'assets/fonts', 'assets/video']:
        out += sorted(str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / d).glob('*') if p.is_file() and p.suffix.lower() in ('.svg', '.png', '.ico', '.woff2', '.woff', '.ttf', '.mp4', '.vtt', '.jpg'))
    if (ROOT / 'assets' / 'social-preview.png').exists(): out.append('assets/social-preview.png')
    return out

def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': 'vcr2-live-check', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:   # the certificate is verified
        return r.status, r.geturl(), r.read()

def committed(f):
    """The file as git stores it (what the hosting serves); a Windows checkout may hold it with other line endings."""
    try:
        r = subprocess.run(['git', 'show', 'HEAD:' + f], cwd=str(ROOT), capture_output=True, check=True)
        return r.stdout
    except Exception:
        return (ROOT / f).read_bytes()

def compare(base):
    diffs = []
    for f in files():
        want = committed(f)
        try:
            status, final, got = fetch(base + f + '?live-check=' + str(int(time.time())))
        except urllib.error.HTTPError as e:
            diffs.append(f'{f}: HTTP {e.code}'); continue
        except Exception as e:
            diffs.append(f'{f}: {type(e).__name__}: {str(e)[:120]}'); continue
        if not final.startswith(base):
            diffs.append(f'{f}: redirected away to {final}'); continue
        if got != want:
            diffs.append(f'{f}: served {len(got)} bytes sha256 {hashlib.sha256(got).hexdigest()[:12]}, repository has {len(want)} bytes sha256 {hashlib.sha256(want).hexdigest()[:12]}')
    return diffs

def commit_age_minutes():
    try:
        t = int(subprocess.run(['git', 'log', '-1', '--format=%ct'], cwd=str(ROOT), capture_output=True, text=True, check=True).stdout.strip())
        return (time.time() - t) / 60
    except Exception:
        return 1e9

def main():
    site = json.loads((ROOT / 'site.json').read_text(encoding='utf-8')).get('url', '').rstrip('/') + '/'
    if '--url' in sys.argv: site = sys.argv[sys.argv.index('--url') + 1].rstrip('/') + '/'
    retries = 0 if '--once' in sys.argv else 2
    if not site.startswith('https://') and '--allow-http' not in sys.argv:
        print(f'::error::site.json must name an https:// address, not {site}'); return 1
    print(f'Checking {site} against this repository ({len(files())} files)')
    diffs = compare(site)
    for i in range(retries):
        if not diffs: break
        if commit_age_minutes() < 30:
            print('::warning::The latest commit is less than 30 minutes old: the deploy may still be running. Differences now:')
            for d in diffs: print('  ' + d)
            return 0
        print(f'Differences found; checking again in 90 s ({i + 1} of {retries})'); time.sleep(90)
        diffs = compare(site)
    if diffs:
        print('::error::The live site does not serve what the repository holds. If you did not just publish, treat this as a security incident: see SECURITY.md, "If the live site check fails".')
        for d in diffs: print('  ' + d)
        return 1
    print('OK: every file is served exactly as in the repository, over a valid certificate.')
    if site.startswith('https://') and '--no-http' not in sys.argv:
        try:
            status, final, _ = fetch('http://' + site[len('https://'):])
            if not final.startswith('https://'):
                print('::warning::http:// is served without a redirect to https://. Browsers already force https on .app domains, but turn on "Enforce HTTPS" in Settings > Pages anyway.')
        except Exception:
            pass
    return 0

if __name__ == '__main__':
    sys.exit(main())
