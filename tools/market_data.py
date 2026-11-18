#!/usr/bin/env python3
"""Refresh VCR2's market data file (data/market.json) from official sources, and check every figure before it is used.

    python tools/market_data.py --out data/market.json [--report report.md]

Official figures (no key needed), refreshed weekly by .github/workflows/market-data.yml:
  US 10-year yield            US Treasury daily par yield curve (CSV)
  Euro area 10-year yield     ECB yield curve, AAA, 10-year spot (SDMX)
  US dollars per euro         ECB reference rate (SDMX)
  Company counts, US          US Census, Statistics of US Businesses (yearly file)
  Company counts, EU27        Eurostat, enterprises by size class (sbs_sc_ovw)
VC figures (the public-software exit multiple, round valuations) come from data/market-manual.json, updated each quarter
by hand from the reports, with their source, link and date.

Checks (the owner's rules): a figure that cannot be fetched, is not a positive number, or moved by more than 25% from the
previous file is not published; the previous value is kept and the run asks for review.
Exit code: 0 the file changed and every figure passed (publish), 3 nothing changed, 2 a figure needs review (open a pull
request), 1 a hard error (nothing is written).
"""
import argparse, csv, io, json, pathlib, sys, urllib.request, datetime

UA = {'User-Agent': 'VCR2 market data job (+https://vcr2.app)'}
MAX_MOVE = 0.25
TODAY = datetime.date.today().isoformat()


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def ecb_last(series):
    """Last observation of an ECB SDMX series: (date, value)."""
    text = get(f'https://data-api.ecb.europa.eu/service/data/{series}?lastNObservations=1&format=csvdata')
    rows = list(csv.DictReader(io.StringIO(text)))
    r = rows[-1]
    return r['TIME_PERIOD'], float(r['OBS_VALUE'])


def treasury_10y():
    year = datetime.date.today().year
    text = get(f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all'
               f'?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv')
    rows = list(csv.DictReader(io.StringIO(text)))
    r = rows[0]                     # newest first
    m, d, y = r['Date'].split('/')
    return f'{y}-{m}-{d}', float(r['10 Yr'])


def eurostat_count(nace, size):
    url = ('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sbs_sc_ovw?format=JSON'
           f'&geo=EU27_2020&nace_r2={nace}&indic_sbs=ENT_NR&size_emp={size}')
    d = json.loads(get(url))
    idx = d['dimension']['time']['category']['index']
    inv = {i: k for k, i in idx.items()}
    best = max(((inv[int(k)], v) for k, v in d['value'].items()), key=lambda kv: kv[0])
    return best[0], float(best[1])


def susb_counts():
    """US firms by size and software publishers, from the newest yearly SUSB file that exists."""
    year = datetime.date.today().year
    for y in range(year - 1, year - 7, -1):
        try:
            text = get(f'https://www2.census.gov/programs-surveys/susb/datasets/{y}/us_state_naics_detailedsizes_{y}.txt', timeout=120)
        except Exception:
            continue
        rows = [r for r in csv.DictReader(io.StringIO(text)) if r.get('STATE') == '00']
        tot = {r['ENTRSIZE']: int(r['FIRM']) for r in rows if r['NAICS'] == '--'}
        label = {r['ENTRSIZE']: r['ENTRSIZEDSCR'] for r in rows if r['NAICS'] == '--'}
        mid_codes = [c for c, l in label.items() if any(l.endswith(s) for s in (': 100-149', ': 150-199', ': 200-299', ': 300-399', ': 400-499'))]
        under500 = [c for c, l in label.items() if l.endswith(': <500')]
        total = [c for c, l in label.items() if l.endswith(': Total')]
        sw = [int(r['FIRM']) for r in rows if r['NAICS'] == '5112' and r['ENTRSIZEDSCR'].endswith(': Total')]
        if len(mid_codes) != 5 or not under500 or not total or not sw:
            raise ValueError(f'SUSB {y}: unexpected layout')
        return str(y), sum(tot[c] for c in mid_codes), tot[total[0]] - tot[under500[0]], sw[0]
    raise ValueError('no SUSB file found')


SRC = {
    'treasury': ('US Treasury daily par yield curve, 10-year', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve'),
    'ecb_yc': ('ECB euro area yield curve (AAA), 10-year spot', 'https://data.ecb.europa.eu/data/datasets/YC/YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y'),
    'ecb_fx': ('European Central Bank reference rate', 'https://data.ecb.europa.eu/data/datasets/EXR/EXR.D.USD.EUR.SP00.A'),
    'susb_mid': ('US Census, Statistics of US Businesses (firms with 100 to 499 employees)', 'https://www.census.gov/programs-surveys/susb.html'),
    'susb_large': ('US Census, Statistics of US Businesses (firms with 500 or more employees)', 'https://www.census.gov/programs-surveys/susb.html'),
    'susb_sw': ('US Census, Statistics of US Businesses (NAICS 5112, software publishers)', 'https://www.census.gov/programs-surveys/susb.html'),
    'es_mid': ('Eurostat, enterprises by size class (50 to 249 employees), EU27', 'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table'),
    'es_large': ('Eurostat, enterprises by size class (250 or more employees), EU27', 'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table'),
    'es_sw': ('Eurostat, enterprises in software publishing (NACE J58.2), EU27', 'https://ec.europa.eu/eurostat/databrowser/view/sbs_sc_ovw/default/table'),
}


def fetch_official():
    """{(item, market): (date, value, source key)}; a failed fetch is recorded as an exception message."""
    out = {}
    def tryset(keys, fn):
        try:
            res = fn()
            for k, v in zip(keys, res):
                out[k] = v
        except Exception as e:
            for k in keys:
                out[k] = f'fetch failed: {type(e).__name__}: {str(e)[:120]}'
    tryset([('risk_free_10y', 'us')], lambda: [(*treasury_10y(), 'treasury')])
    tryset([('risk_free_10y', 'eu')], lambda: [(*ecb_last('YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y'), 'ecb_yc')])
    tryset([('fx_usd', 'eu')], lambda: [(*ecb_last('EXR/D.USD.EUR.SP00.A'), 'ecb_fx')])
    def susb():
        y, mid, large, sw = susb_counts()
        return [(y, float(mid), 'susb_mid'), (y, float(large), 'susb_large'), (y, float(sw), 'susb_sw')]
    tryset([('firms_mid', 'us'), ('firms_large', 'us'), ('firms_software', 'us')], susb)
    tryset([('firms_mid', 'eu')], lambda: [(*eurostat_count('B-S_X_O_S94', '50-249'), 'es_mid')])
    tryset([('firms_large', 'eu')], lambda: [(*eurostat_count('B-S_X_O_S94', 'GE250'), 'es_large')])
    tryset([('firms_software', 'eu')], lambda: [(*eurostat_count('J582', 'TOTAL'), 'es_sw')])
    return out


def build(prev, manual, fetched):
    """The new file and the review notes. A figure that failed or moved too much keeps its previous value."""
    items = json.loads(json.dumps(manual.get('items', {})))        # VC figures, curated by hand
    notes = []
    for (item, mkt), res in sorted(fetched.items()):
        old = ((prev.get('items', {}).get(item) or {}).get(mkt)) or None
        keep = lambda why: (notes.append(f'{item} / {mkt}: {why}; the previous value is kept.'), items.setdefault(item, {}).__setitem__(mkt, old) if old else None)
        if isinstance(res, str):
            keep(res); continue
        date, value, sk = res
        if not (isinstance(value, float) and value > 0 and value < 1e13):
            keep(f'not a positive number ({value!r})'); continue
        if old and isinstance(old.get('value'), (int, float)) and old['value'] > 0:
            move = abs(value - old['value']) / old['value']
            if move > MAX_MOVE:
                keep(f'moved {move:.0%} (from {old["value"]} to {value}), more than {MAX_MOVE:.0%}'); continue
        src, url = SRC[sk]
        items.setdefault(item, {})[mkt] = {'value': round(value, 4), 'date': date, 'src': src, 'kind': 'official', 'url': url}
    return {'updated': TODAY, 'version': TODAY, 'items': items}, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data/market.json')
    ap.add_argument('--manual', default='data/market-manual.json')
    ap.add_argument('--report', default=None)
    a = ap.parse_args()
    out, man = pathlib.Path(a.out), pathlib.Path(a.manual)
    prev = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
    if not man.exists():
        print('missing', man); return 1
    manual = json.loads(man.read_text(encoding='utf-8'))
    new, notes = build(prev, manual, fetch_official())
    same = {k: v for k, v in new.items() if k not in ('updated', 'version')} == {k: v for k, v in prev.items() if k not in ('updated', 'version')}
    report = ['# Market data check', '', f'Run on {TODAY}.', '']
    report += ['Needs review:', ''] + [f'- {n}' for n in notes] if notes else ['Every figure passed the checks.']
    if a.report:
        pathlib.Path(a.report).write_text('\n'.join(report) + '\n', encoding='utf-8')
    print('\n'.join(report))
    if same and not notes:
        print('nothing changed'); return 3
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(new, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    return 2 if notes else 0


if __name__ == '__main__':
    sys.exit(main())
