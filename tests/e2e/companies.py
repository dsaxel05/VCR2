"""Invented companies for the end-to-end tests (tests/e2e/run.py). Every figure is made up and generated from a seed:
the same file gives the same CSV text every time. Nothing here is real, personal or investment advice.

Each company is a dict:
  id, title, label, stage, model, asof, view ('desktop'|'phone'), vals / bools / sel (the evidence form),
  ledger (csv text) + ledger_unit, series (csv text), extra (a named extra scenario), expect (the plausibility judgement).
expect keys: score=(lo, hi) | None (a score is shown), withheld=True|False, checks_any=[ids], checks_none=[ids], text_any=[strings in the report],
             ledger_customers=n, ledger_arr=(lo, hi), warn_any=[strings in the ledger/series import messages], why=<one sentence: what a sane tool does>.
"""
import random

MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def months(start_year, start_month, n):
    out, y, m = [], start_year, start_month
    for _ in range(n):
        out.append((y, m)); m += 1
        if m == 13: y, m = y + 1, 1
    return out


def sim(seed, n_start, new_per_month, n_months, lo, hi, churn, expand):
    """Customers x months MRR. churn and expand are monthly rates."""
    rnd = random.Random(seed)
    cust = []
    def add(start):
        cust.append({'name': 'Customer %03d' % (len(cust) + 1), 'start': start, 'base': rnd.uniform(lo, hi), 'end': None})
    for _ in range(n_start): add(0)
    for m in range(1, n_months):
        k = int(new_per_month) + (1 if rnd.random() < new_per_month - int(new_per_month) else 0)
        for _ in range(k): add(m)
    for c in cust:
        for m in range(c['start'] + 1, n_months):
            if rnd.random() < churn: c['end'] = m; break
    rows = []
    for c in cust:
        vals = []
        for m in range(n_months):
            if m < c['start'] or (c['end'] is not None and m >= c['end']): vals.append(0.0)
            else: vals.append(round(c['base'] * (1 + expand) ** (m - c['start']), 2))
        rows.append((c['name'], vals))
    return rows


def eu(v, cents=True):
    s = ('{:,.2f}' if cents else '{:,.0f}').format(v)
    return s.replace(',', '§').replace('.', ',').replace('§', '.')


def wide_iso(rows, ms):
    hdr = 'customer,' + ','.join('%d-%02d' % ym for ym in ms)
    return '\n'.join([hdr] + ['%s,%s' % (n, ','.join(('%g' % v) if v else '' for v in vals)) for n, vals in rows])


def wide_eu_fr(rows, ms):
    """Semicolon CSV, French abbreviated months, 1.234,56 numbers, header word 'Client'."""
    hdr = 'Client;' + ';'.join('%s %d' % (MONTH_FR[m - 1], y) for y, m in ms)
    return '\n'.join([hdr] + ['%s;%s' % (n, ';'.join(eu(v) if v else '' for v in vals)) for n, vals in rows])


def wide_dayfirst(rows, ms):
    """Date headers written day first: 31/01/2025 ... (last day of the month)."""
    dim = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}
    hdr = 'Customer;' + ';'.join('%02d/%02d/%d' % (dim[m], m, y) for y, m in ms)
    return '\n'.join([hdr] + ['%s;%s' % (n, ';'.join(eu(v) if v else '' for v in vals)) for n, vals in rows])


def wide_quarterly(rows, ms):
    qs = [ms[i:i + 3] for i in range(0, len(ms) - len(ms) % 3, 3)]
    hdr = 'Customer,' + ','.join('Q%d %d' % ((q[0][1] - 1) // 3 + 1, q[0][0]) for q in qs)
    out = [hdr]
    for n, vals in rows:
        parts = []
        for qi in range(len(qs)):
            s = sum(vals[qi * 3:qi * 3 + 3]); parts.append(('%g' % round(s, 2)) if s else '')
        out.append('%s,%s' % (n, ','.join(parts)))
    return '\n'.join(out)


def invoices_annual(rows, ms):
    """One annual invoice per customer per year of life: customer,invoice date,amount (the whole year's fee)."""
    out = ['customer,invoice date,amount']
    for n, vals in rows:
        first = next((i for i, v in enumerate(vals) if v), None)
        if first is None: continue
        i = first
        while i < len(vals) and vals[i]:
            y, m = ms[i]
            out.append('%s,%d-%02d-01,%g' % (n, y, m, round(vals[i] * 12, 2)))
            i += 12
    return '\n'.join(out)


def series_csv(ms, revenue, cash, burn, headcount, cashflow=None):
    cols = ['month', 'revenue', 'cash']
    if cashflow is None: cols.append('burn')
    else: cols.append('net cash flow')
    cols.append('headcount')
    out = [','.join(cols)]
    for i, (y, m) in enumerate(ms):
        out.append(','.join(['%d-%02d' % (y, m), '%g' % revenue[i], '%g' % cash[i], '%g' % (burn[i] if cashflow is None else cashflow[i]), '%d' % headcount[i]]))
    return '\n'.join(out)


def last_cash_burn(csv):
    row = csv.strip().split(chr(10))[-1].split(',')
    return int(float(row[2])), int(float(row[3]))


def mrr_totals(rows, n):
    return [round(sum(v[i] for _, v in rows), 2) for i in range(n)]


def tseries(rows, ms, cash0, burn0, hc0, raise_at=None, raise_amount=0, cashflow=False):
    n = len(ms); rev = mrr_totals(rows, n)
    cash, burn, hc, cf = [], [], [], []
    c = cash0
    for i in range(n):
        b = burn0 * (1 + 0.012 * i)
        flow = -b + (raise_amount if raise_at == i else 0)
        c = c + flow
        cash.append(round(c)); burn.append(round(b)); cf.append(round(flow)); hc.append(int(hc0 + i * 0.6))
    return series_csv(ms, rev, cash, burn, hc, cf if cashflow else None)


# ------------------------------------------------------------------------------------------------------------ the companies
MS18 = months(2025, 3, 18)          # Mar 2025 .. Aug 2026
MS12 = months(2025, 9, 12)          # Sep 2025 .. Aug 2026
MSQ = months(2025, 1, 12)           # Jan 2025 .. Dec 2025 (four whole quarters)
ASOF = '2026-08'


def arr_of(rows, k=-1):
    return round(sum(v[k] for _, v in rows) * 12)


def build():
    C = []
    # For companies with a ledger the form is filled by "Apply ledger figures to the form"; only the other fields are typed.

    r = sim(11, 3, 0.8, 18, 180, 900, 0.015, 0.01)
    ts = tseries(r, MS18, 900000, 30000, 4); cash, burn = last_cash_burn(ts)
    C.append(dict(id='t01-preseed-saas-clean', title='Pre-seed SaaS, tiny and clean ("Tinybyte")', stage='preseed', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=82, cash_on_hand=cash, net_burn=burn, total_raised=750000, headcount_now=5, headcount_12mo=3, founders_count=2,
                  founder_max_equity=55, founder_domain_years=6),
        bools=dict(technical_founder=True, prior_exit=False),
        ledger=wide_iso(r, MS18), ledger_unit='mrr', series=ts,
        expect=dict(score=None, withheld=False, checks_none=['ledger_arr_now'], why='A tiny but consistent pre-seed company: a score is produced and no contradiction is invented between the form and its own ledger.')))

    r = sim(12, 22, 3.0, 18, 700, 2600, 0.008, 0.012)
    ts = tseries(r, MS18, 3300000, 80000, 9); cash, burn = last_cash_burn(ts)
    C.append(dict(id='t02-seed-saas-strong', title='Seed SaaS, strong and consistent ("Cleanbooks")', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=79, cash_on_hand=cash, net_burn=burn, total_raised=3000000, headcount_now=14, headcount_12mo=8, founders_count=2,
                  founder_max_equity=48, founder_domain_years=9, sm_spend_l12=420000),
        bools=dict(technical_founder=True, prior_exit=True, ip_assignments=True, captable_documented=True, taxes_current=True),
        ledger=wide_iso(r, MS18), ledger_unit='mrr', series=ts,
        expect=dict(score=(55, 100), withheld=False, why='Growth is fast, churn low, burn modest and governance basics are ticked: a high score and no material contradiction.')))

    r = sim(13, 40, 3.5, 18, 1500, 6000, 0.03, 0.0)
    arr = arr_of(r)
    ts = tseries(r, MS18, 8000000, 400000, 30); cash, burn = last_cash_burn(ts)
    C.append(dict(id='t03-seriesA-deck-contradicts-ledger', title='Series A, deck contradicts the ledger ("Mirage Metrics")', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=round(arr * 1.35), gross_margin=76, cash_on_hand=cash, net_burn=burn, total_raised=9000000, headcount_now=44, headcount_12mo=28,
                  stated_arr=round(arr * 1.35), stated_nrr=132, stated_grr=96, stated_growth=120, stated_customers=140, stated_runway=22),
        bools=dict(technical_founder=True),
        ledger=wide_iso(r, MS18), ledger_unit='mrr', series=ts,
        expect=dict(score=None, checks_any=['stated_nrr', 'stated_arr', 'ledger_arr_now'], why='The deck claims ARR 35% above the ledger and NRR 132% against a ledger that cannot support it: a material contradiction, a lower score or a withheld one.')))

    C.append(dict(id='t04-seriesB-marketplace-missing', title='Series B marketplace, many fields missing ("Bazaarly")', stage='b', model='marketplace', asof=ASOF, view='desktop',
        vals=dict(arr_now=14500000, arr_12mo=9800000, gmv_now=118000000, gmv_12mo=73000000, repeat_gmv_pct=64, contrib_margin=11, cash_on_hand=21000000, net_burn=1500000,
                  headcount_now=130, top_supplier_pct=9),
        expect=dict(score=None, withheld=False, text_any=['confidence'], why='Half the form is blank: a score is still produced, with low coverage or confidence shown, and no crash or NaN.')))

    C.append(dict(id='t05-seed-hardware-lowmargin', title='Seed hardware company, scored as SaaS, low margin ("Voltwheel")', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=900000, arr_12mo=350000, gross_margin=24, services_pct=55, cogs_hosting=420000, cogs_support=160000, cash_on_hand=1300000, net_burn=210000,
                  customers_now=30, customers_12mo=11, headcount_now=22, headcount_12mo=9, top1_pct=33, top5_pct=71),
        bools=dict(technical_founder=True),
        expect=dict(score=(0, 70), withheld=False, why='A 24% gross margin with 55% services revenue and a 33% customer is not a strong SaaS: the score must not be Strong.')))

    C.append(dict(id='t06-seriesA-fintech-regulatory', title='Series A fintech with regulatory findings ("Lendly")', stage='a', model='fintech', asof=ASOF, view='desktop',
        vals=dict(arr_now=3900000, arr_12mo=2100000, gross_margin=58, cash_on_hand=6100000, net_burn=350000, customers_now=7200, customers_12mo=3100, headcount_now=51, headcount_12mo=30,
                  loss_rate=9.5, volume_now=210000000, volume_12mo=95000000, stated_take_rate=2.1, top1_pct=4),
        sel=dict(licence_model='Sponsor or partner bank'), bools=dict(regulatory_findings=True, ip_assignments=True, taxes_current=True),
        expect=dict(score=None, text_any=['regulat'], why='Regulatory findings and a 9.5% loss rate must show up as a risk or a question.')))

    C.append(dict(id='t07-seed-biotech-prerevenue', title='Seed biotech, no revenue ("Genovia")', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=0, arr_12mo=0, cash_on_hand=18000000, net_burn=1100000, total_raised=24000000, headcount_now=35, headcount_12mo=22, founders_count=3, founder_domain_years=15,
                  founder_max_equity=30, patents=14),
        bools=dict(technical_founder=True, prior_exit=True, regulated_market=True),
        expect=dict(score=(0, 80), why='No revenue: ratios that divide by ARR must be shown as not available, never as zero, a sentinel number or NaN; runway about 16 months is computed.')))

    r = sim(14, 400, 90, 18, 8, 22, 0.075, 0.0)
    C.append(dict(id='t08-seed-consumer-churn', title='Seed consumer subscription app, heavy churn ("Habitual")', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=71, cash_on_hand=1800000, net_burn=160000, headcount_now=12, headcount_12mo=7, sm_spend_l12=1100000),
        ledger=wide_iso(r, MS18), ledger_unit='mrr',
        expect=dict(score=(0, 75), why='Monthly churn near 7.5% on tiny contracts: retention must be flagged and the score cannot be Strong.')))

    C.append(dict(id='t09-preseed-zero-everything', title='Pre-seed with zero revenue and nothing else ("Blankslate")', stage='preseed', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=0, arr_12mo=0, cash_on_hand=0, net_burn=0, customers_now=0, headcount_now=1),
        expect=dict(score=None, withheld=True, text_any=['not enough scored inputs'], why='Everything zero: no division by zero, no NaN or Infinity, and no score: the report says there is not enough to score.')))

    C.append(dict(id='t10-seriesA-shrinking', title='Series A, revenue shrinking 31% ("Fadeout")', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=1800000, arr_12mo=2600000, new_arr_l12=250000, churned_arr_l12=900000, contraction_arr_l12=150000, gross_margin=69, cash_on_hand=2100000, net_burn=300000,
                  customers_now=48, customers_12mo=71, logos_lost_l12=34, new_customers_l12=11, headcount_now=36, headcount_12mo=40),
        expect=dict(score=(0, 60), why='Negative growth, net revenue retention far below 100% and a 7-month runway: a weak score and a runway warning.')))

    C.append(dict(id='t11-growth-huge-numbers', title='Growth stage with absurdly large numbers ("Gigantor")', stage='b', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=5e12, arr_12mo=3e12, gross_margin=80, cash_on_hand=9e13, net_burn=2e11, customers_now=3000000, customers_12mo=2000000, headcount_now=900000, headcount_12mo=500000),
        expect=dict(score=None, text_any=['largest value'], why='Values beyond what the radar accepts are limited and the report says so, instead of overflowing or printing Infinity.')))

    C.append(dict(id='t12-seed-safes-and-notes', title='Seed round with a SAFE stack and convertible notes ("Stackwell")', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(arr_now=1200000, arr_12mo=520000, gross_margin=77, cash_on_hand=900000, net_burn=110000, customers_now=40, customers_12mo=15,
                  round_size=4000000, round_pre_money=16000000, our_check=1000000, pool_target_post=12, new_liq_pref=1, prior_investor_pct=18,
                  safe_list=chr(10).join(['250000, 8000000, 0', '500000, 12000000, 20', '150000, , 15']),
                  notes_principal=300000, notes_rate=6, notes_months=14, notes_cap=10000000, notes_discount=20, fund_size=80000000, future_rounds=2, dilution_per_round=18),
        sel=dict(anti_dilution='Broad-based weighted average', board_after='Balanced, with an independent director'),
        bools=dict(new_participating=False, pro_rata_rights=True, information_rights=True, board_seat=True),
        expect=dict(score=None, withheld=False, cap_table=True, why='The cap table must close: new investors, SAFEs, notes, pool and founders sum to 100% and our ownership is between 0 and 100%.')))

    r = sim(15, 18, 1.5, 12, 900, 3400, 0.01, 0.01)
    truth = dict(customers=len([1 for _, v in r if any(v)]), arr=round(sum(v[-1] for _, v in r) * 12, 2))
    C.append(dict(id='t13-import-european-numbers-french-months', title='Ledger with 1.234,56 numbers, semicolons and French months', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=74),
        ledger=wide_eu_fr(r, MS12), ledger_unit='mrr', ledger_truth=truth,
        expect=dict(score=None, ledger_customers=truth['customers'], ledger_arr_exact=truth['arr'],
                    why='1.234,56 is one thousand two hundred thirty-four and fifty-six: customer count and ARR must equal the generated truth, with no value read as 1.23.')))

    r = sim(16, 12, 1.2, 12, 600, 2500, 0.012, 0.008)
    truth = dict(arr=round(sum(v[-1] for _, v in r) * 12, 2))
    C.append(dict(id='t14-import-dayfirst-dates', title='Ledger with day-first date headers (31/01/2025)', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=75),
        ledger=wide_dayfirst(r, MS12), ledger_unit='mrr', ledger_truth=truth,
        expect=dict(score=None, ledger_months=12, ledger_first='2025-09', ledger_last='2026-08', ledger_arr_exact=truth['arr'],
                    why='31/01/2025 and 28/02/2025 are January and February: twelve months from 2025-09 to 2026-08 in the right order.')))

    r = sim(17, 15, 1.0, 12, 900, 3000, 0.01, 0.006)
    truth = dict(arr=round(sum(v[-1] for _, v in r) * 12, 2), first='2025-01', last='2025-12')
    C.append(dict(id='t15-import-quarterly-columns', title='Ledger with quarterly columns (Q1 2025 ... Q4 2025)', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=78),
        ledger=wide_quarterly(r, MSQ), ledger_unit='rev', ledger_truth=truth,
        expect=dict(score=None, ledger_months=12, ledger_first='2025-01', ledger_last='2025-12', warn_any=['quarter'],
                    why='Quarterly columns are spread over three months and the tool says so; twelve months from January to December.')))

    r = sim(18, 14, 1.2, 18, 1000, 5000, 0.0, 0.0)
    truth = dict(arr=round(sum(v[-1] for _, v in r) * 12, 2))
    C.append(dict(id='t16-import-annual-invoices', title='List of annual invoices instead of monthly revenue', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=77),
        ledger=invoices_annual(r, MS18), ledger_unit='rev', ledger_truth=truth,
        expect=dict(score=None, ledger_arr=(0.5, 1.15), warn_any=['once a year', 'invoice'],
                    why='Annual invoices cover twelve months: the monthly figure is the invoice divided by 12 and the tool says it read a list of invoices.')))

    r = sim(19, 20, 2.0, 18, 800, 3000, 0.012, 0.008)
    C.append(dict(id='t17-import-cashflow-with-fundraise', title='Monthly financials with a net cash flow column that includes a fundraise', stage='a', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=75, headcount_now=33),
        ledger=wide_iso(r, MS18), ledger_unit='mrr', series=tseries(r, MS18, 4000000, 260000, 20, raise_at=9, raise_amount=6000000, cashflow=True),
        expect=dict(score=None, burn=(150000, 400000), why='The 6M fundraise must not be read as a month of negative burn: burn stays near 260-330k and runway is not infinite.')))

    r = sim(20, 14, 1.2, 12, 700, 2800, 0.01, 0.01)
    C.append(dict(id='t18-french-language-input', title='French-language input: company name, notes, headers ("Société Lumière")', stage='seed', model='saas', asof=ASOF, view='desktop',
        name='Société Lumière — énergie & données',
        vals=dict(gross_margin=74, cash_on_hand=1500000, net_burn=90000,
                  primary_competitor='Électricité de France (offre « Pro »)', why_now="La réglementation européenne sur les données énergétiques entre en vigueur en 2027."),
        ledger=wide_eu_fr(r, MS12), ledger_unit='mrr',
        expect=dict(score=None, text_any=['Société Lumière'], why='Accents, quotes and « » survive in the report, the memo and the export; nothing is escaped twice (no &amp; or &eacute; shown).')))

    r = sim(21, 10, 1.0, 12, 500, 1800, 0.012, 0.006)
    C.append(dict(id='t19-phone-width-full-run', title='A full run at phone width (390 px)', stage='seed', model='saas', asof=ASOF, view='phone',
        vals=dict(gross_margin=78, cash_on_hand=1100000, net_burn=70000, headcount_now=9),
        ledger=wide_iso(r, MS12), ledger_unit='mrr',
        expect=dict(score=None, no_sideways_scroll=True, why='Every page of the run fits a phone: no sideways scrolling, buttons reachable.')))

    r = sim(22, 20, 2.0, 18, 700, 2600, 0.01, 0.01)
    C.append(dict(id='t20-memo-export-import', title='Printed memo, export and import round trip', stage='seed', model='saas', asof=ASOF, view='desktop',
        vals=dict(gross_margin=77, cash_on_hand=2000000, net_burn=100000, headcount_now=13),
        ledger=wide_iso(r, MS18), ledger_unit='mrr', extra='export_import',
        expect=dict(score=None, why='The memo holds the company, the 16-digit run ID and the score; exporting, starting over and importing gives the same run ID.')))
    return C


if __name__ == '__main__':
    for c in build():
        print(c['id'], len(c.get('ledger') or ''), len(c.get('series') or ''))
