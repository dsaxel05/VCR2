# Browser test suites

These Playwright (Python) suites were written while building v4.2–v4.3. They were made portable
for this kit and re-run on 2026-09-30 against the v4.3 build: **studio_test.py 73/73,
v43_test.py 49/49, v42_test.py 16/16, xl_test.py 13/13 passed**; `test_all.py` and `edge.py` are
smoke/exploration scripts that print results and "no console errors".

They are a regression net for the Studio (the owner-only editor) and the importers. Phase 1 of
they live in `tests/browser/` with one runner and CI; until then they can be run
as they are.

## Run

```bash
pip install playwright pillow
python -m playwright install chromium
python tests/browser/run_all.py              # every suite, one total, exit 1 on failure
python tests/browser/run_all.py studio_test  # one suite
```

`run_all.py` serves the repository on a free local port and points the suites at it
(`VCR2_BASE`). CI runs it on every pull request (`.github/workflows/browser.yml`). Set
`VCR2_SHOTS` to keep the screenshots the suites take.

## What they rely on

- `_paths.py` — base URL, screenshot folder and Excel fixtures (`xl/`).
- `fontroute.py` — blocks Google Fonts so tests run offline with fallback fonts. Delete it when
  VCR2 self-hosts its fonts.
- The GitHub API is **mocked** in `studio_test.py` (`gh_route`) with a fake token
  `'github_pat_' + 'A' * 60`. No real token is used or needed. Never put a real token in a test.
- They call the app's global functions (`loadNorthwind`, `assessAll`, `studioTab`, `ST`, …) and
  CSS selectors. When the redesign renames them, update the tests in the same PR and say why.
