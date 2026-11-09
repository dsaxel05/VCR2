"""Document templates. Each returns an abstract document plus its gold:

  doc  = {'title', 'role', 'type', 'blocks': [...], 'sheets': [...] (spreadsheet types), 'slides': [...] (decks)}
  gold = {field_id: (value, tier, loc)}, must_not = [field ids]

Blocks: ('h', text) ('p', text) ('kv', label, value) ('table', rows, opts) ('tile', label, value) ('note', text) ('foot', text).
Values in gold use VCR2 units: dollars, percentages 0 to 100, months, days, x. Money in a non-USD document keeps the
document's number and is expected at tier Low (Suggestions, "currency is EUR"). The traps listed in the test plan are
built in: forecast and plan columns, prior-year columns, targets, competitor and market figures, net new versus new-logo
ARR, gross versus net burn, margin with and without customer success, restricted cash, footnotes that change a
definition, rounding, percent as a fraction, months versus days, hidden sheets, header and footer numbers."""
import random

FR = {'ARR': 'ARR (revenu récurrent annuel)', 'Customers': 'Clients', 'Net revenue retention': 'Rétention nette du revenu', 'Gross margin': 'Marge brute',
      'Cash': 'Trésorerie', 'Net burn': 'Consommation nette de trésorerie', 'Gross burn': 'Consommation brute', 'Headcount': 'Effectif',
      'YoY growth': 'Croissance annuelle', 'Runway': 'Durée de vie de la trésorerie', 'Deferred revenue': 'Produits constatés d’avance'}


def sym(c): return {'USD': '$', 'EUR': '€', 'GBP': '£'}[c['ccy']]


def money(v, c, style, fr=False):
    s = sym(c)
    if c['ccy'] == 'EUR' or fr:
        if style == 'short': return (f'{v / 1e6:.1f}'.replace('.', ',') + ' M' + s) if v >= 1e6 else (f'{v / 1e3:.0f} k' + s)
        return f'{v:,.0f}'.replace(',', ' ') + ' ' + s
    if style == 'short': return f'{s}{v / 1e6:.1f}M' if v >= 1e6 else f'{s}{v / 1e3:.0f}k'
    if style == 'words': return f'{c["ccy"]} {v / 1e6:.2f} million'
    if style == 'k': return f'{s}{v / 1e3:,.0f}k'
    return f'{s}{v:,.0f}'


def rounded_short(v):   # the value a reader sees in "$15.6M": what gold expects from a short form
    return round(v / 1e6, 1) * 1e6 if v >= 1e6 else round(v / 1e3) * 1e3


def pct(v, style='pct', fr=False):
    if style == 'frac': return f'{v / 100:.2f}'
    if style == 'pts': return f'{v:g} pts'
    return (f'{v:g}'.replace('.', ',') + ' %') if fr else f'{v:g}%'


def mt(c, field, v, tier):   # money tier: a non-USD document only ever suggests
    return 'Low' if c['ccy'] != 'USD' else tier


def deck(c, rnd):
    T, C, fr = c['T'], c['C'], c['french']
    lab = (lambda k: FR.get(k, k)) if fr else (lambda k: k)
    gold, must = {}, ['arr_now', 'customers_now', 'cash_on_hand']
    s_arr = rounded_short(C['stated_arr'])
    foot = rnd.random() < 0.45
    slides = [
        [('h', f'{c["name"]}'), ('p', 'Le système d’exploitation de votre activité' if fr else 'The operating system for your workflow'), ('p', 'Confidentiel' if fr else 'Confidential. Investor presentation.')],
        [('h', 'Traction'), ('tile', lab('ARR') + ('¹' if foot else ''), money(C['stated_arr'], c, 'short', fr)), ('tile', lab('Net revenue retention'), pct(C['stated_nrr'], fr=fr)),
         ('tile', lab('Customers'), f'{C["stated_customers"]:,}'.replace(',', ' ' if fr else ',')), ('tile', lab('YoY growth'), pct(C['stated_growth'], fr=fr))]
        + ([('foot', '¹ Inclut les contrats signés non encore en production.' if fr else '¹ Includes contracts signed but not yet live.')] if foot else []),
        [('h', 'Marché' if fr else 'Market'), ('p', (f'Marché adressable : {money(C["stated_tam"], c, "short", fr)}' if fr else f'Total addressable market: {money(C["stated_tam"], c, "short")}')),
         ('p', f'{c["competitor"]}, our closest competitor, reports {money(C["stated_arr"] * 3, c, "short")} ARR and 400 customers.' if not fr else f'{c["competitor"]}, notre principal concurrent, annonce {money(C["stated_arr"] * 3, c, "short", fr)} d’ARR.'),
         ('p', 'The market for workflow software grew 18% last year.' if not fr else 'Le marché a progressé de 18 % l’an dernier.')],
        [('h', 'Plan'), ('p', (f'Objectif : {money(C["stated_arr"] * 2.5, c, "short", fr)} d’ARR fin 2027.' if fr else f'Target: {money(C["stated_arr"] * 2.5, c, "short")} ARR by end of 2027.')),
         ('p', (f'Nous levons {money(T["round_size"], c, "short", fr)}.' if fr else f'We are raising {money(T["round_size"], c, "short")} to reach the next milestone.'))],
    ]
    if c['model'] in ('marketplace', 'fintech'):
        slides[1].append(('tile', 'Take rate', pct(c['M'].get('take_rate', 1.2), fr=fr))); gold['stated_take_rate'] = (c['M'].get('take_rate', 1.2), 'High', 'slide 2')
    gold.update({'stated_arr': (s_arr, mt(c, 'stated_arr', 0, 'Medium' if foot else 'High'), 'slide 2'), 'stated_nrr': (C['stated_nrr'], 'High', 'slide 2'),
                 'stated_customers': (C['stated_customers'], 'High', 'slide 2'), 'stated_growth': (C['stated_growth'], 'High', 'slide 2'),
                 'stated_tam': (rounded_short(C['stated_tam']), mt(c, 'stated_tam', 0, 'High'), 'slide 3'),
                 'round_size': (rounded_short(T['round_size']), mt(c, 'round_size', 0, 'Medium'), 'slide 4'), 'primary_competitor': (c['competitor'], 'Medium', 'slide 3')})
    return {'title': f'{c["name"]} pitch deck', 'role': 'deck', 'type': 'deck', 'slides': slides}, gold, must


def model_doc(c, rnd):
    T, fr = c['T'], c['french']
    thousands = rnd.random() < 0.4
    sc = (lambda v: round(v / 1e3)) if thousands else (lambda v: round(v))
    yr, prior = c['asof'][:4], str(int(c['asof'][:4]) - 1)
    neg = lambda v: f'({sc(v):,})'
    head = ['Metric', f'FY{prior} (actual)', f'LTM {c["asof"]} (actual)', f'FY{int(yr) + 1} (forecast)', f'FY{int(yr) + 1} plan']
    up = lambda v: sc(v * rnd.uniform(1.4, 1.9))
    bridge = [head,
              ['Opening ARR', '', sc(T['arr_12mo']), up(T['arr_now']), ''],
              ['New-logo ARR', '', sc(T['new_arr_l12']), up(T['new_arr_l12']), ''],
              ['Expansion ARR', '', sc(T['expansion_arr_l12']), up(T['expansion_arr_l12']), ''],
              ['Churned ARR', '', neg(T['churned_arr_l12']), neg(T['churned_arr_l12'] * 1.1), ''],
              ['Contraction ARR', '', neg(T['contraction_arr_l12']), neg(T['contraction_arr_l12']), ''],
              ['Closing ARR', sc(T['arr_12mo']), sc(T['arr_now']), up(T['arr_now'] * 1.8), up(T['arr_now'] * 1.9)],
              ['Net new ARR', '', sc(T['arr_now'] - T['arr_12mo']), '', '']]
    gm_cs = round(T['gross_margin'] + rnd.uniform(3, 6), 1)
    pl = [head,
          ['Gross margin (incl. customer success)', '', f'{T["gross_margin"]}%', '78%', '80%'],
          ['Gross margin excl. customer success', '', f'{gm_cs}%', '', ''],
          ['Hosting and infrastructure', '', sc(T['cogs_hosting']), '', ''],
          ['Support and delivery', '', sc(T['cogs_support']), '', ''],
          ['Sales and marketing', '', sc(T['sm_spend_l12']), up(T['sm_spend_l12']), ''],
          ['Net burn (monthly average)', '', sc(T['net_burn']), sc(T['net_burn'] * 1.3), ''],
          ['Gross burn (monthly average)', '', sc(T['gross_burn']), '', ''],
          ['Deferred revenue (balance)', '', sc(T['deferred_revenue']), '', ''],
          ['Cash and equivalents (closing)', '', sc(T['cash_on_hand']), sc(T['cash_on_hand'] * 0.6), '']]
    stale = [['Metric', 'Value'], ['Closing ARR', sc(T['arr_now'] * 0.7)], ['Cash', sc(T['cash_on_hand'] * 1.4)]]
    scale_row = [['($ in thousands)' if thousands else 'All figures in USD']] if c['ccy'] == 'USD' else [[f'All figures in {c["ccy"]}' + (' thousands' if thousands else '')]]
    sheets = [{'name': 'ARR bridge', 'rows': scale_row + bridge}, {'name': 'P&L', 'rows': scale_row + pl}, {'name': 'old_v3', 'rows': stale, 'hidden': True}]
    v = lambda x: (round(x / 1e3) * 1e3) if thousands else x
    gold = {k: (v(T[k]), mt(c, k, 0, 'High'), s) for k, s in [('arr_now', 'ARR bridge!C8'), ('arr_12mo', 'ARR bridge!C3'), ('new_arr_l12', 'ARR bridge!C4'),
            ('expansion_arr_l12', 'ARR bridge!C5'), ('churned_arr_l12', 'ARR bridge!C6'), ('contraction_arr_l12', 'ARR bridge!C7'), ('cogs_hosting', 'P&L!C5'),
            ('cogs_support', 'P&L!C6'), ('sm_spend_l12', 'P&L!C7'), ('net_burn', 'P&L!C8'), ('gross_burn', 'P&L!C9'), ('deferred_revenue', 'P&L!C10'), ('cash_on_hand', 'P&L!C11')]}
    gold['gross_margin'] = (T['gross_margin'], 'High', 'P&L!C3')
    return {'title': f'{c["name"]} financial model', 'role': 'model', 'type': 'model', 'sheets': sheets}, gold, []


def update(c, rnd):
    T, C, fr = c['T'], c['C'], c['french']
    runway = round(T['cash_on_hand'] / T['net_burn'], 1)
    if fr:
        blocks = [('h', f'{c["name"]} : point investisseurs, {c["asof"][:7]}'), ('p', 'Bonjour à tous,'),
                  ('kv', 'Trésorerie au 30/' + c['asof'][5:7], money(T['cash_on_hand'], c, 'full', True)),
                  ('kv', 'Consommation nette de trésorerie', money(T['net_burn'], c, 'full', True) + ' / mois'),
                  ('kv', 'Consommation brute', money(T['gross_burn'], c, 'full', True) + ' / mois'),
                  ('p', f'Cela nous laisse environ {runway:g} mois de trésorerie.'.replace('.', ',', 1)),
                  ('kv', 'Effectif', f'{T["headcount_now"]} personnes'), ('p', f'Objectif pour le T4 : {money(C["stated_arr"] * 1.3, c, "short", True)} d’ARR.')]
    else:
        blocks = [('h', f'{c["name"]} investor update, {c["asof"][:7]}'), ('p', 'Hi all, here is our monthly update.'),
                  ('kv', f'Cash as of {c["asof"]}', money(T['cash_on_hand'], c, 'full')),
                  ('kv', 'Net burn', money(T['net_burn'], c, 'k') + ' per month'), ('kv', 'Gross burn', money(T['gross_burn'], c, 'k') + ' per month'),
                  ('p', f'That gives us about {runway:g} months of runway at the current pace.'),
                  ('kv', 'Team', f'{T["headcount_now"]} people'), ('p', f'NRR came in at {C["stated_nrr"]}% for the trailing twelve months.'),
                  ('p', f'Our goal for Q4 is {money(C["stated_arr"] * 1.3, c, "short")} in ARR. Last year we were at {money(T["arr_12mo"], c, "short")}.')]
    k = (lambda v: round(v / 1e3) * 1e3)
    gold = {'cash_on_hand': (T['cash_on_hand'], mt(c, 'x', 0, 'Medium'), 'line 3'), 'net_burn': ((T['net_burn'] if fr else k(T['net_burn'])), mt(c, 'x', 0, 'Medium'), 'line 4'),
            'gross_burn': ((T['gross_burn'] if fr else k(T['gross_burn'])), mt(c, 'x', 0, 'Medium'), 'line 5'), 'stated_runway': (runway, 'Medium', 'line 6'),
            'headcount_now': (T['headcount_now'], 'Medium', 'line 7')}
    if not fr: gold['stated_nrr'] = (C['stated_nrr'], 'High', 'line 8')
    return {'title': f'{c["name"]} investor update', 'role': 'deck', 'type': 'update', 'blocks': blocks}, gold, ['arr_now', 'arr_12mo']


def captable(c, rnd):
    rows = [['Holder', 'Class', 'Shares']]
    for n, s in c['founders']: rows.append([n, 'Common (founder)', s])
    rows += [['Seed investors (aggregate)', 'Preferred', c['investors']], ['Option pool: granted', 'Options', c['granted']], ['Option pool: unallocated', 'Options', c['unalloc']]]
    total = sum(s for _, s in c['founders']) + c['investors'] + c['granted'] + c['unalloc']
    rows.append(['Total fully diluted', '', total])
    sheets = [{'name': 'Cap table', 'rows': rows}]
    gold = {'founders_count': (len(c['founders']), 'Medium', 'Cap table'), 'founder_max_equity': (c['T']['founder_max_equity'], 'Medium', 'Cap table'),
            'prior_investor_pct': (c['T']['prior_investor_pct'], 'Medium', 'Cap table'), 'option_pool': (c['T']['option_pool'], 'Medium', 'Cap table')}
    if c['safes']:
        sheets.append({'name': 'SAFEs', 'rows': [['Investor', 'Principal', 'Valuation cap', 'Discount']] + [[f'Angel syndicate {i + 1}', p, cap, f'{d}%'] for i, (p, cap, d) in enumerate(c['safes'])]})
        gold.update({'safes_outstanding': (c['T']['safes_outstanding'], mt(c, 'x', 0, 'High'), 'SAFEs!B2'), 'safe_cap': (c['T']['safe_cap'], mt(c, 'x', 0, 'High'), 'SAFEs!C2'),
                     'safe_discount': (c['T']['safe_discount'], 'High', 'SAFEs!D2')})
    if c['note']:
        p, r, cap, d = c['note']
        sheets.append({'name': 'Notes', 'rows': [['Lender', 'Principal', 'Interest rate', 'Valuation cap', 'Discount', 'Issue date'], ['Bridge investors', p, f'{r}%', cap, f'{d}%', '2025-11-15']]})
        gold.update({'notes_principal': (p, mt(c, 'x', 0, 'High'), 'Notes!B2'), 'notes_rate': (r, 'High', 'Notes!C2'), 'notes_cap': (cap, mt(c, 'x', 0, 'High'), 'Notes!D2'), 'notes_discount': (d, 'High', 'Notes!E2')})
    return {'title': f'{c["name"]} capitalization table', 'role': 'model', 'type': 'captable', 'sheets': sheets}, gold, []


def termsheet(c, rnd):
    T, B = c['T'], c['B']
    pref = f'{T["new_liq_pref"]:g}x ' + (f'participating, capped at {T["new_part_cap"]:g}x the original purchase price' if B['new_participating'] else 'non-participating')
    board = {'Founders control the board': 'three directors: two designated by the holders of Common Stock and one designated by the Series investors',
             'Balanced, with an independent director': 'five directors: two designated by the holders of Common Stock, two designated by the Series investors and one independent director mutually agreed',
             'Investors control the board': 'five directors: two designated by the holders of Common Stock and three designated by the Series investors'}[B['board_after']]
    yn = lambda b, y, n: y if b else n
    blocks = [('h', 'Summary of Terms for Series Preferred Stock Financing'), ('p', f'Issuer: {c["name"]}, Inc. (the "Company")'),
              ('kv', 'Amount of financing', money(T['round_size'], c, 'full')),
              ('kv', 'Pre-money valuation', f'{money(T["round_pre_money"], c, "full")} on a fully diluted basis, including an unallocated option pool equal to {T["pool_target_post"]}% of the post-money fully diluted capitalization'),
              ('kv', 'Liquidation preference', pref), ('kv', 'Dividends', yn(B['cumulative_dividends'], '8% cumulative dividends, payable on liquidation', 'Non-cumulative dividends, only when and if declared by the Board')),
              ('kv', 'Anti-dilution', {'Broad-based weighted average': 'Broad-based weighted average', 'Full ratchet': 'Full ratchet', 'None': 'None'}[B['anti_dilution']]),
              ('kv', 'Board of directors', f'The Board shall consist of {board}.'),
              ('kv', 'Redemption', yn(B['redemption_rights'], 'Redeemable at the option of the holders after five years', 'None')),
              ('kv', 'Pay-to-play', yn(B['pay_to_play'], 'Applies to future financings', 'None')),
              ('kv', 'Pro rata rights', yn(B['pro_rata_rights'], 'Major Investors have the right to participate pro rata in future issuances', 'None')),
              ('kv', 'Information rights', yn(B['information_rights'], 'Annual audited and quarterly unaudited financial statements to Major Investors', 'None')),
              ('p', 'This term sheet is non-binding except for the confidentiality and exclusivity provisions.')]
    gold = {'round_size': (T['round_size'], mt(c, 'x', 0, 'High'), 'Amount of financing'), 'round_pre_money': (T['round_pre_money'], mt(c, 'x', 0, 'High'), 'Pre-money valuation'),
            'pool_target_post': (T['pool_target_post'], 'High', 'Pre-money valuation'), 'new_liq_pref': (T['new_liq_pref'], 'High', 'Liquidation preference'),
            'new_participating': (B['new_participating'], 'High', 'Liquidation preference'), 'cumulative_dividends': (B['cumulative_dividends'], 'High', 'Dividends'),
            'anti_dilution': (B['anti_dilution'], 'High', 'Anti-dilution'), 'board_after': (B['board_after'], 'Medium', 'Board of directors'),
            'redemption_rights': (B['redemption_rights'], 'High', 'Redemption'), 'pay_to_play': (B['pay_to_play'], 'High', 'Pay-to-play'),
            'pro_rata_rights': (B['pro_rata_rights'], 'High', 'Pro rata rights'), 'information_rights': (B['information_rights'], 'High', 'Information rights')}
    if B['new_participating']: gold['new_part_cap'] = (T['new_part_cap'], 'High', 'Liquidation preference')
    return {'title': f'{c["name"]} term sheet', 'role': 'model', 'type': 'termsheet', 'blocks': blocks}, gold, []


def bank(c, rnd):
    T = c['T']; total = T['cash_on_hand'] + c['restricted']; opening = round(total * rnd.uniform(1.03, 1.15), -2)
    avail = rnd.random() < 0.5
    rows = [['Date', 'Description', 'Amount', 'Balance'], [c['asof'][:8] + '01', 'Opening balance', '', f'{opening:,.2f}'],
            [c['asof'][:8] + '05', 'Payroll', f'({opening * 0.04:,.2f})', ''], [c['asof'][:8] + '18', 'Customer receipts', f'{opening * 0.02:,.2f}', ''],
            [c['asof'], 'Ending balance', '', f'{total:,.2f}']]
    blocks = [('h', 'Business checking: account statement'), ('kv', 'Statement period', f'{c["asof"][:8]}01 to {c["asof"]}'), ('kv', 'Account', 'Operating account ending 4417'),
              ('table', rows, {}), ('kv', 'Restricted cash (letter of credit collateral)', f'{c["restricted"]:,.2f}')]
    if avail: blocks.append(('kv', 'Available balance (excluding restricted cash)', f'{T["cash_on_hand"]:,.2f}'))
    return {'title': f'{c["name"]} bank statement', 'role': 'bank', 'type': 'bank', 'blocks': blocks}, {'cash_on_hand': (T['cash_on_hand'], mt(c, 'x', 0, 'High' if avail else 'Medium'), 'Ending balance')}, []


def receivables(c, rnd):
    b = c['buckets']; T = c['T']
    rows = [['Bucket', 'Amount'], ['0-30 days', b[0]], ['31-90 days', b[1]], ['91-120 days', b[2]], ['120+ days', b[3]], ['Total receivables', sum(b)]]
    sheets = [{'name': 'AR aging', 'rows': rows}, {'name': 'Deferred revenue', 'rows': [['Item', 'Balance'], ['Deferred revenue, closing balance', T['deferred_revenue']]]}]
    return ({'title': f'{c["name"]} receivables aging', 'role': 'export', 'type': 'receivables', 'sheets': sheets},
            {'ar_over_90': (T['ar_over_90'], mt(c, 'x', 0, 'Medium'), 'AR aging'), 'deferred_revenue': (T['deferred_revenue'], mt(c, 'x', 0, 'High'), 'Deferred revenue!B2')}, [])


def crm(c, rnd):
    T = c['T']; days = rnd.random() < 0.6
    deals = [['Opportunity', 'Stage', 'Amount', 'Close date']] + [[f'Opportunity {i + 1}', rnd.choice(['Discovery', 'Proposal', 'Negotiation', 'Closed won', 'Closed lost']), round(rnd.uniform(8e3, 90e3), -2), c['asof']] for i in range(18)]
    summ = [['Summary', 'Value'], ['Win rate (last 12 months)', f'{T["win_rate"]}%'], ['Median sales cycle', f'{T["sales_cycle"]} days' if days else f'{T["sales_cycle"] / 30:.1f} months'],
            ['Pipeline coverage', f'{T["pipeline_coverage"]}x'], ['Quota attainment', f'{T["quota_attainment"]}%']]
    cyc = T['sales_cycle'] if days else round(round(T['sales_cycle'] / 30, 1) * 30)
    return ({'title': f'{c["name"]} CRM pipeline export', 'role': 'export', 'type': 'crm', 'sheets': [{'name': 'Summary', 'rows': summ}, {'name': 'Deals', 'rows': deals}]},
            {'win_rate': (T['win_rate'], 'High', 'Summary!B2'), 'sales_cycle': (cyc, 'High' if days else 'Medium', 'Summary!B3'), 'pipeline_coverage': (T['pipeline_coverage'], 'High', 'Summary!B4'),
             'quota_attainment': (T['quota_attainment'], 'High', 'Summary!B5')}, [])


def headcount(c, rnd):
    T = c['T']; other = T['headcount_now'] - T['headcount_eng'] - T['headcount_sales']; ga = max(1, other // 2); prod = other - ga
    rows = [['Function', 'Headcount', 'Open roles'], ['Engineering', T['headcount_eng'], 3], ['Sales', T['headcount_sales'], 2], ['Product and design', prod, 1], ['G&A', ga, 0]]
    return ({'title': f'{c["name"]} headcount by function', 'role': 'export', 'type': 'headcount', 'sheets': [{'name': 'Headcount', 'rows': rows + [['Average fully loaded cost per employee', T['avg_loaded_comp'], '']]}]},
            {'headcount_now': (T['headcount_now'], 'Medium', 'Headcount!B2:B5'), 'headcount_eng': (T['headcount_eng'], 'High', 'Headcount!B2'), 'headcount_sales': (T['headcount_sales'], 'High', 'Headcount!B3'),
             'avg_loaded_comp': (T['avg_loaded_comp'], mt(c, 'x', 0, 'High'), 'Headcount!B6')}, ['headcount_12mo'])


def security(c, rnd):
    B, T = c['B'], c['T']
    soc = {'Type II': 'Our SOC 2 Type II report was issued in March 2026 by an independent auditor.', 'Type I': 'SOC 2 Type I completed in January 2026; the Type II observation period is in progress.',
           'In progress': 'SOC 2: in progress. We have engaged an auditor and expect a Type I report next quarter.', 'None': 'We do not have a SOC 2 report and have not started one.'}[B['soc2']]
    blocks = [('h', 'Security, legal and compliance summary'), ('p', soc), ('kv', 'Uptime (trailing 90 days)', f'{T["uptime_90d"]}%'), ('kv', 'Severity-1 incidents (last 12 months)', str(T['p1_incidents'])),
              ('p', 'There is no pending or threatened litigation against the Company.' if not B['litigation'] else 'The Company is a defendant in one pending lawsuit brought by a former reseller.'),
              ('p', 'All current and former employees and contractors have signed IP assignment agreements.' if B['ip_assignments'] else 'Two former contractors have not signed IP assignment agreements.'),
              ('p', 'Data processing agreements are signed with all customers that require one.' if B['dpas_signed'] else 'Data processing agreements have not been signed with several enterprise customers.'),
              ('p', 'Open-source licences were reviewed by counsel in 2026.' if B['oss_reviewed'] else 'No open-source licence review has been done.'),
              ('p', 'D&O insurance is in place.' if B['insurance_dno'] else 'The Company has no D&O insurance.'),
              ('p', 'A 409A valuation was completed within the last 12 months.' if B['valuation_409a'] else 'The Company has not obtained a 409A valuation.'),
              ('p', 'All federal and state taxes are filed and paid.' if B['taxes_current'] else 'Some state tax filings are overdue.')]
    gold = {'soc2': (B['soc2'], 'High', 'para 2'), 'uptime_90d': (T['uptime_90d'], 'High', 'Uptime'), 'p1_incidents': (T['p1_incidents'], 'High', 'Severity-1'),
            'litigation': (B['litigation'], 'High', 'para'), 'ip_assignments': (B['ip_assignments'], 'High', 'para'), 'dpas_signed': (B['dpas_signed'], 'High', 'para'),
            'oss_reviewed': (B['oss_reviewed'], 'High', 'para'), 'insurance_dno': (B['insurance_dno'], 'High', 'para'), 'valuation_409a': (B['valuation_409a'], 'High', 'para'),
            'taxes_current': (B['taxes_current'], 'High', 'para')}
    return {'title': f'{c["name"]} security and legal summary', 'role': 'model', 'type': 'security', 'blocks': blocks}, gold, []


def market(c, rnd):
    T, B = c['T'], c['B']
    pm = {'Raised prices': 'We raised list prices by 8% in March.', 'Held prices': 'We have held prices flat since launch.', 'Discounted to win': 'We discounted heavily to win our last ten deals.', 'Never tested': 'We have not tested pricing yet.'}[B['pricing_move']]
    blocks = [('h', 'Customer research and market notes'), ('kv', 'Net Promoter Score', f'{T["nps"]} (n={T["pmf_respondents"] + 37})'),
              ('p', f'Sean Ellis survey: {T["pmf_very_disappointed"]}% of respondents would be very disappointed without the product (n={T["pmf_respondents"]}).'),
              ('kv', 'Target accounts', f'{T["target_accounts"]:,}'), ('kv', 'Reachable through current channels', f'{T["reachable_pct"]}%'),
              ('kv', 'Primary competitor', c['competitor']), ('kv', f'Win rate against {c["competitor"]}', f'{T["win_rate_vs_primary"]}%'),
              ('p', pm), ('p', f'Our main moat: {B["moat_type"].lower()}.'), ('p', 'Industry NPS benchmark for the category is 32.')]
    gold = {'nps': (T['nps'], 'High', 'NPS'), 'pmf_very_disappointed': (T['pmf_very_disappointed'], 'High', 'para'), 'pmf_respondents': (T['pmf_respondents'], 'Medium', 'para'),
            'target_accounts': (T['target_accounts'], 'High', 'Target accounts'), 'reachable_pct': (T['reachable_pct'], 'High', 'Reachable'), 'primary_competitor': (c['competitor'], 'High', 'Primary competitor'),
            'win_rate_vs_primary': (T['win_rate_vs_primary'], 'High', 'Win rate'), 'pricing_move': (B['pricing_move'], 'Medium', 'para'), 'moat_type': (B['moat_type'], 'Medium', 'para')}
    return {'title': f'{c["name"]} market notes', 'role': 'deck', 'type': 'market', 'blocks': blocks}, gold, []


def metrics_json(c, rnd):
    T = c['T']
    j = {'company': c['name'], 'as_of': c['asof'], 'currency': c['ccy'], 'metrics': {'arr': T['arr_now'], 'arr_12_months_ago': T['arr_12mo'], 'active_customers': T['customers_now'],
         'gross_margin': round(T['gross_margin'] / 100, 4), 'logos_churned_ltm': T['logos_lost_l12']}, 'targets': {'arr': T['arr_now'] * 2}}
    gold = {'arr_now': (T['arr_now'], mt(c, 'x', 0, 'High'), 'metrics.arr'), 'arr_12mo': (T['arr_12mo'], mt(c, 'x', 0, 'High'), 'metrics.arr_12_months_ago'),
            'customers_now': (T['customers_now'], 'High', 'metrics.active_customers'), 'gross_margin': (T['gross_margin'], 'High', 'metrics.gross_margin'),
            'logos_lost_l12': (T['logos_lost_l12'], 'High', 'metrics.logos_churned_ltm')}
    return {'title': f'{c["name"]} metrics export', 'role': 'export', 'type': 'json', 'json': j}, gold, []


def audited(c, rnd):
    T = c['T']
    blocks = [('h', f'{c["name"]}, Inc.: financial statements for the year ended December 31, {int(c["asof"][:4]) - 1}'),
              ('p', 'Independent auditor’s report. In our opinion, the financial statements present fairly, in all material respects, the financial position of the Company. We conducted our audit in accordance with auditing standards generally accepted in the United States.'),
              ('h', 'Balance sheet'), ('table', [['', f'Dec 31, {int(c["asof"][:4]) - 1}', f'Dec 31, {int(c["asof"][:4]) - 2}'], ['Cash and cash equivalents', f'{T["cash_on_hand"] * 1.2:,.0f}', f'{T["cash_on_hand"] * 1.5:,.0f}'],
               ['Deferred revenue', f'{T["deferred_revenue"] * 0.8:,.0f}', f'{T["deferred_revenue"] * 0.5:,.0f}']], {})]
    return {'title': f'{c["name"]} audited financial statements', 'role': 'audited', 'type': 'audited', 'blocks': blocks}, {'audited_financials': ('Audited', 'High', 'p.1')}, ['cash_on_hand']


def ledger(c, rnd):   # regression: gold is whatever the existing ledger parser computes (run.mjs fills it in)
    months = [f'{2025 + (m + 9) // 12}-{(m + 9) % 12 + 1:02d}' for m in range(c['months'])]
    n = min(60, max(10, c['T']['customers_now'] // 3))
    rows = [['customer'] + months]
    for k in range(n):
        start = rnd.randrange(0, c['months'] // 2); mrr = round(rnd.uniform(800, 9000), -1); end = c['months'] if rnd.random() > 0.15 else rnd.randrange(start + 2, c['months'])
        rows.append([f'Customer {k + 1:03d}'] + [(round(mrr * (1 + 0.02 * (m - start))) if start <= m < end else 0) for m in range(c['months'])])
    return {'title': f'{c["name"]} customer revenue ledger', 'role': 'export', 'type': 'ledger', 'sheets': [{'name': 'MRR by customer', 'rows': rows}]}, {'__ledger__': (True, 'High', 'ledger')}, []


TEMPLATES = {'deck': deck, 'model': model_doc, 'update': update, 'captable': captable, 'termsheet': termsheet, 'bank': bank, 'receivables': receivables, 'crm': crm,
             'headcount': headcount, 'security': security, 'market': market, 'json': metrics_json, 'audited': audited, 'ledger': ledger}
