"""Held-out templates (P6): other wording and other layouts, written after the engine was frozen for tuning.
Never used for tuning; run at most three times (tests/smartfill/run.mjs --set heldout). Same gold conventions as docs.py."""
import random
from gen.docs import money, pct, rounded_short, mt, FR


def deck(c, rnd):
    T, C = c['T'], c['C']
    gold, must = {}, ['arr_now', 'customers_now']
    slides = [
        [('h', c['name']), ('p', 'Series financing overview')],
        [('h', 'Where we are today'),
         ('p', f'We closed the last quarter at {money(C["stated_arr"], c, "short")} in annual recurring revenue, up {C["stated_growth"]}% on the prior year.'),
         ('p', f'{C["stated_customers"]} organisations now pay for the platform, and net dollar retention stands at {C["stated_nrr"]}%.'),
         ('p', f'Gross dollar retention: {C["stated_grr"]}%.')],
        [('h', 'Opportunity'), ('p', f'We size the serviceable market at {money(C["stated_tam"], c, "short")}.'),
         ('p', f'The category leader, {c["competitor"]}, claims more than {money(C["stated_arr"] * 4, c, "short")} in revenue.')],
        [('h', 'The round'), ('p', f'This round: {money(T["round_size"], c, "short")} of new capital.'), ('p', f'By 2028 we plan to cross {money(C["stated_arr"] * 3, c, "short")} ARR.')],
    ]
    gold.update({'stated_arr': (rounded_short(C['stated_arr']), mt(c, 'x', 0, 'High'), 'slide 2'), 'stated_growth': (C['stated_growth'], 'High', 'slide 2'),
                 'stated_customers': (C['stated_customers'], 'High', 'slide 2'), 'stated_nrr': (C['stated_nrr'], 'High', 'slide 2'), 'stated_grr': (C['stated_grr'], 'High', 'slide 2'),
                 'stated_tam': (rounded_short(C['stated_tam']), mt(c, 'x', 0, 'High'), 'slide 3'), 'round_size': (rounded_short(T['round_size']), mt(c, 'x', 0, 'Medium'), 'slide 4')})
    return {'title': f'{c["name"]} financing overview', 'role': 'deck', 'type': 'deck', 'slides': slides}, gold, must


def model_doc(c, rnd):
    """Years down the rows, metrics across (a layout the dev set never used)."""
    T = c['T']; yr = int(c['asof'][:4])
    head = ['Period', 'ARR', 'Gross margin', 'Net burn (avg / month)', 'Cash at period end', 'Deferred revenue']
    rows = [head]
    for k, y in enumerate([yr - 2, yr - 1, yr]):
        f = [0.35, T['arr_12mo'] / T['arr_now'], 1][k]
        rows.append([f'FY{y} actual', round(T['arr_now'] * f), f'{T["gross_margin"] - (2 - k):.1f}%', round(T['net_burn'] * (0.8 + 0.1 * k)), round(T['cash_on_hand'] * (1.6 - 0.3 * k)), round(T['deferred_revenue'] * (0.5 + 0.25 * k))])
    rows.append([f'FY{yr + 1} budget', round(T['arr_now'] * 1.9), '80%', round(T['net_burn'] * 1.4), round(T['cash_on_hand'] * 0.4), ''])
    bridge = [['Movement (last twelve months)', 'USD'], ['Starting ARR', T['arr_12mo']], ['Gross new ARR from new logos', T['new_arr_l12']], ['Upsell and cross-sell', T['expansion_arr_l12']],
              ['Lost to churn', -T['churned_arr_l12']], ['Downgrades', -T['contraction_arr_l12']], ['Ending ARR', T['arr_now']]]
    sheets = [{'name': 'Annual summary', 'rows': rows}, {'name': 'ARR movement', 'rows': bridge}]
    gold = {k: (T[k], mt(c, 'x', 0, 'High'), s) for k, s in [('arr_now', 'Annual summary'), ('cash_on_hand', 'Annual summary'), ('deferred_revenue', 'Annual summary'), ('arr_12mo', 'ARR movement'),
            ('new_arr_l12', 'ARR movement'), ('expansion_arr_l12', 'ARR movement'), ('churned_arr_l12', 'ARR movement'), ('contraction_arr_l12', 'ARR movement')]}
    gold['net_burn'] = (round(T['net_burn'] * 1.0), mt(c, 'x', 0, 'High'), 'Annual summary')
    gold['gross_margin'] = (round(T['gross_margin'], 1), 'High', 'Annual summary')
    return {'title': f'{c["name"]} annual summary', 'role': 'model', 'type': 'model', 'sheets': sheets}, gold, []


def update(c, rnd):
    T, C = c['T'], c['C']
    runway = round(T['cash_on_hand'] / T['net_burn'], 1)
    blocks = [('h', f'{c["name"]}: board letter'), ('p', 'Dear board,'),
              ('p', f'We ended the month with {money(T["cash_on_hand"], c, "full")} in the bank and burned {money(T["net_burn"], c, "k")} net (gross spend {money(T["gross_burn"], c, "k")}).'),
              ('p', f'At this pace we have roughly {runway:g} months of runway.'),
              ('p', f'We are now {T["headcount_now"]} employees after two hires in engineering.'),
              ('p', f'Trailing twelve month NDR was {C["stated_nrr"]}%.'),
              ('p', f'Our budget assumes {money(C["stated_arr"] * 1.4, c, "short")} of ARR next year.')]
    k = (lambda v: round(v / 1e3) * 1e3)
    gold = {'cash_on_hand': (T['cash_on_hand'], mt(c, 'x', 0, 'Medium'), 'p'), 'net_burn': (k(T['net_burn']), mt(c, 'x', 0, 'Medium'), 'p'), 'gross_burn': (k(T['gross_burn']), mt(c, 'x', 0, 'Medium'), 'p'),
            'stated_runway': (runway, 'Medium', 'p'), 'headcount_now': (T['headcount_now'], 'Medium', 'p'), 'stated_nrr': (C['stated_nrr'], 'High', 'p')}
    return {'title': f'{c["name"]} board letter', 'role': 'deck', 'type': 'update', 'blocks': blocks}, gold, ['arr_now']


def termsheet(c, rnd):
    T, B = c['T'], c['B']
    blocks = [('h', 'Indicative terms'), ('p', f'The Investors will invest {money(T["round_size"], c, "full")} at a pre-money valuation of {money(T["round_pre_money"], c, "full")}.'),
              ('p', f'The post-money option pool shall be {T["pool_target_post"]}% of the fully diluted capital.'),
              ('p', 'Liquidation: ' + ('participating preferred, 1x, with participation capped at ' + f'{T["new_part_cap"]:g}x' if B['new_participating'] else '1x non-participating preferred') + '.'),
              ('p', 'Anti-dilution: ' + {'Broad-based weighted average': 'broad-based weighted average', 'Full ratchet': 'full ratchet', 'None': 'none'}[B['anti_dilution']] + '.'),
              ('p', 'Pro rata: ' + ('Major Investors may participate pro rata in later rounds.' if B['pro_rata_rights'] else 'none.'))]
    gold = {'round_size': (T['round_size'], mt(c, 'x', 0, 'High'), 'p'), 'round_pre_money': (T['round_pre_money'], mt(c, 'x', 0, 'High'), 'p'), 'new_liq_pref': (1.0, 'High', 'p'), 'pool_target_post': (T['pool_target_post'], 'Medium', 'p'),
            'new_participating': (B['new_participating'], 'High', 'p'), 'anti_dilution': (B['anti_dilution'], 'High', 'p'), 'pro_rata_rights': (B['pro_rata_rights'], 'High', 'p')}
    if B['new_participating']: gold['new_part_cap'] = (T['new_part_cap'], 'High', 'p')
    return {'title': f'{c["name"]} indicative terms', 'role': 'model', 'type': 'termsheet', 'blocks': blocks}, gold, []


def bank(c, rnd):
    T = c['T']
    blocks = [('h', 'Bank confirmation'), ('p', f'We confirm that as of {c["asof"]} the Company held the following balance with us.'),
              ('table', [['Account', 'Currency', 'Balance'], ['Operating account', c['ccy'], f'{T["cash_on_hand"]:,.2f}']], {})]
    return {'title': f'{c["name"]} bank confirmation', 'role': 'bank', 'type': 'bank', 'blocks': blocks}, {'cash_on_hand': (T['cash_on_hand'], mt(c, 'x', 0, 'High'), 'table')}, []


def security(c, rnd):
    B, T = c['B'], c['T']
    blocks = [('h', 'Trust and compliance'), ('kv', 'Availability over the past quarter', f'{T["uptime_90d"]}%'), ('kv', 'Sev-1 incidents this year', str(T['p1_incidents'])),
              ('p', 'No litigation is pending.' if not B['litigation'] else 'One lawsuit is pending against the Company.')]
    gold = {'uptime_90d': (T['uptime_90d'], 'High', 'kv'), 'p1_incidents': (T['p1_incidents'], 'High', 'kv'), 'litigation': (B['litigation'], 'High', 'p')}
    return {'title': f'{c["name"]} trust and compliance', 'role': 'model', 'type': 'security', 'blocks': blocks}, gold, []


def headcount(c, rnd):
    T = c['T']
    rows = [['Team', 'People'], ['R&D / engineering', T['headcount_eng']], ['Go-to-market (sales)', T['headcount_sales']], ['Other', T['headcount_now'] - T['headcount_eng'] - T['headcount_sales']]]
    return ({'title': f'{c["name"]} team', 'role': 'export', 'type': 'headcount', 'sheets': [{'name': 'Team', 'rows': rows}]},
            {'headcount_eng': (T['headcount_eng'], 'High', 'Team'), 'headcount_sales': (T['headcount_sales'], 'High', 'Team')}, [])


def crm(c, rnd):
    T = c['T']
    rows = [['KPI', 'Trailing 12 months'], ['Opportunity win rate', f'{T["win_rate"]}%'], ['Time to close (median, days)', T['sales_cycle']], ['Coverage of next-quarter target', f'{T["pipeline_coverage"]}x']]
    return ({'title': f'{c["name"]} sales KPIs', 'role': 'export', 'type': 'crm', 'sheets': [{'name': 'KPIs', 'rows': rows}]},
            {'win_rate': (T['win_rate'], 'High', 'KPIs'), 'sales_cycle': (T['sales_cycle'], 'High', 'KPIs'), 'pipeline_coverage': (T['pipeline_coverage'], 'High', 'KPIs')}, [])


def market(c, rnd):
    T = c['T']
    blocks = [('h', 'Voice of the customer'), ('p', f'Our latest NPS reading is {T["nps"]}.'), ('p', f'Main rival: {c["competitor"]}.'),
              ('p', f'{T["target_accounts"]:,} accounts fit our ideal customer profile.')]
    return ({'title': f'{c["name"]} customer voice', 'role': 'deck', 'type': 'market', 'blocks': blocks},
            {'nps': (T['nps'], 'High', 'p'), 'primary_competitor': (c['competitor'], 'High', 'p'), 'target_accounts': (T['target_accounts'], 'High', 'p')}, [])


def captable(c, rnd):
    from gen.docs import captable as base
    return base(c, rnd)


def metrics_json(c, rnd):
    T = c['T']
    j = {'data': [{'metric': 'annual_recurring_revenue', 'value': T['arr_now']}, {'metric': 'paying_customers', 'value': T['customers_now']}, {'metric': 'gross_margin_pct', 'value': T['gross_margin']}]}
    return ({'title': f'{c["name"]} metrics', 'role': 'export', 'type': 'json', 'json': j},
            {'arr_now': (T['arr_now'], mt(c, 'x', 0, 'High'), 'data'), 'customers_now': (T['customers_now'], 'High', 'data'), 'gross_margin': (T['gross_margin'], 'High', 'data')}, [])


def receivables(c, rnd):
    from gen.docs import receivables as base
    return base(c, rnd)


def audited(c, rnd):
    from gen.docs import audited as base
    return base(c, rnd)


def ledger(c, rnd):
    from gen.docs import ledger as base
    return base(c, rnd)


TEMPLATES = {'deck': deck, 'model': model_doc, 'update': update, 'captable': captable, 'termsheet': termsheet, 'bank': bank, 'receivables': receivables, 'crm': crm,
             'headcount': headcount, 'security': security, 'market': market, 'json': metrics_json, 'audited': audited, 'ledger': ledger}
