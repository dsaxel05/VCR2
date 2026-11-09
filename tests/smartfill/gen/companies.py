"""Fictional companies for the Smart fill corpus. Every name and number is invented (seeded), never a real company.

A company is a dict of TRUE values keyed by VCR2 field id (dollars in units, percentages 0 to 100, months, days), plus
the flattering CLAIMS a deck would make (stated_*), the deal terms, the cap table and a few facts used by the templates."""
import random

MODELS = ['saas', 'ai_app', 'marketplace', 'fintech']
STAGES = ['preseed', 'seed', 'a', 'b']
STAGE_NAME = {'preseed': 'Pre-seed', 'seed': 'Seed', 'a': 'Series A', 'b': 'Series B+'}
SYL = ['nor', 'vel', 'qua', 'tri', 'lum', 'cas', 'mer', 'zen', 'ori', 'pax', 'sol', 'ven', 'dor', 'kal', 'bri', 'tam', 'rho', 'fen']
SUFFIX = ['Labs', 'Systems', 'Health', 'Pay', 'Works', 'AI', 'Cloud', 'Logistics', 'Analytics', 'Bio', 'Grid', 'Ledger']
COMPETITORS = ['Arcwell', 'Brightpath', 'Cobaltic', 'Driftline', 'Emberly', 'Fathomio', 'Glintway', 'Harborly']
FIRST = ['Ada', 'Bram', 'Cleo', 'Dev', 'Elif', 'Femi', 'Greta', 'Hugo', 'Ines', 'Jun', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya']
LAST = ['Varga', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Haddad', 'Novak', 'Reyes', 'Brandt', 'Costa', 'Iyer', 'Keller']


def company(i, rnd):
    model = MODELS[i % 4]
    stage = STAGES[(i // 4) % 4] if i < 16 else ['seed', 'a', 'b', 'a', 'b', 'seed', 'a', 'b'][i - 16]
    name = (rnd.choice(SYL) + rnd.choice(SYL)).capitalize() + ' ' + rnd.choice(SUFFIX)
    ccy = {5: 'EUR', 11: 'GBP', 17: 'EUR', 22: 'GBP'}.get(i, 'USD')
    french = i in (1, 5, 9, 13, 17, 21)
    base_arr = {'preseed': 300e3, 'seed': 1.4e6, 'a': 6.5e6, 'b': 21e6}[stage]
    arr_now = round(base_arr * rnd.uniform(0.6, 1.6), -3)
    growth = rnd.uniform(0.6, 2.4) if stage in ('preseed', 'seed') else rnd.uniform(0.35, 1.3)
    arr_12 = round(arr_now / (1 + growth), -3)
    churn = round(arr_12 * rnd.uniform(0.04, 0.12), -3)
    contr = round(arr_12 * rnd.uniform(0.01, 0.05), -3)
    exp = round(arr_12 * rnd.uniform(0.08, 0.30), -3)
    new = arr_now - arr_12 - exp + churn + contr
    gm = round(rnd.uniform(58, 82), 1) if model != 'marketplace' else round(rnd.uniform(40, 70), 1)
    burn = round(arr_now * rnd.uniform(0.08, 0.25) / 12 + rnd.uniform(60e3, 250e3), -3)
    opex = round(burn + arr_now / 12 * rnd.uniform(0.7, 1.0), -3)
    cash = round(burn * rnd.uniform(9, 30), -3)
    cust = int(max(8, arr_now / rnd.uniform(15e3, 90e3)))
    cust12 = int(cust / (1 + growth * rnd.uniform(0.5, 0.9)))
    lost = int(cust12 * rnd.uniform(0.04, 0.15))
    top1 = round(rnd.uniform(3, 14), 1); top5 = round(top1 + rnd.uniform(8, 18), 1); top10 = round(top5 + rnd.uniform(6, 14), 1)
    hc = int(max(4, arr_now / rnd.uniform(90e3, 220e3))); eng = int(hc * rnd.uniform(0.35, 0.55)); sales = int(hc * rnd.uniform(0.12, 0.25))
    raised = round(arr_now * rnd.uniform(1.5, 4.0) + 1e6, -5)
    pre = round(arr_now * rnd.uniform(10, 25), -5)
    rsize = round(pre * rnd.uniform(0.18, 0.30), -5)
    T = {
        'arr_now': arr_now, 'arr_12mo': arr_12, 'new_arr_l12': new, 'expansion_arr_l12': exp, 'churned_arr_l12': churn, 'contraction_arr_l12': contr,
        'gross_margin': gm, 'cogs_hosting': round(arr_now * (100 - gm) / 100 * 0.6, -3), 'cogs_support': round(arr_now * (100 - gm) / 100 * 0.4, -3),
        'deferred_revenue': round(arr_now * rnd.uniform(0.1, 0.4), -3), 'ar_over_90': 0,
        'cash_on_hand': cash, 'net_burn': burn, 'gross_burn': opex, 'total_raised': raised,
        'customers_now': cust, 'customers_12mo': cust12, 'logos_lost_l12': lost, 'top1_pct': top1, 'top5_pct': top5, 'top10_pct': top10,
        'sm_spend_l12': round(arr_now * rnd.uniform(0.3, 0.8), -3), 'win_rate': round(rnd.uniform(14, 38), 1), 'sales_cycle': int(rnd.uniform(25, 140)),
        'pipeline_coverage': round(rnd.uniform(1.8, 4.5), 1), 'quota_attainment': round(rnd.uniform(55, 105), 1),
        'headcount_now': hc, 'headcount_eng': eng, 'headcount_sales': sales, 'avg_loaded_comp': round(rnd.uniform(95e3, 185e3), -3),
        'nps': int(rnd.uniform(12, 64)), 'pmf_very_disappointed': round(rnd.uniform(22, 55), 1), 'pmf_respondents': int(rnd.uniform(40, 400)),
        'win_rate_vs_primary': round(rnd.uniform(30, 70), 1), 'target_accounts': int(rnd.uniform(2e3, 60e3)), 'reachable_pct': round(rnd.uniform(15, 60), 1),
        'uptime_90d': round(rnd.uniform(99.5, 99.99), 2), 'p1_incidents': int(rnd.uniform(0, 6)),
        'round_size': rsize, 'round_pre_money': pre, 'pool_target_post': rnd.choice([10, 12, 15]), 'new_liq_pref': 1.0,
        'founders_count': rnd.choice([1, 2, 2, 3]),
    }
    buckets = [round(arr_now / 12 * rnd.uniform(0.3, 0.9), -2), round(arr_now / 12 * rnd.uniform(0.05, 0.2), -2), round(arr_now / 12 * rnd.uniform(0.01, 0.08), -2), round(arr_now / 12 * rnd.uniform(0.005, 0.05), -2)]
    T['ar_over_90'] = buckets[2] + buckets[3]
    restricted = round(cash * rnd.uniform(0.03, 0.1), -3)
    bools = {'soc2': rnd.choice(['Type II', 'Type I', 'In progress', 'None']), 'litigation': rnd.random() < 0.2, 'ip_assignments': rnd.random() < 0.85,
             'dpas_signed': rnd.random() < 0.7, 'oss_reviewed': rnd.random() < 0.6, 'insurance_dno': rnd.random() < 0.75, 'valuation_409a': rnd.random() < 0.8,
             'taxes_current': rnd.random() < 0.9, 'new_participating': rnd.random() < 0.25, 'anti_dilution': rnd.choice(['Broad-based weighted average', 'Full ratchet', 'None']),
             'board_after': rnd.choice(['Founders control the board', 'Balanced, with an independent director', 'Investors control the board']),
             'pro_rata_rights': rnd.random() < 0.8, 'information_rights': rnd.random() < 0.9, 'cumulative_dividends': rnd.random() < 0.15,
             'redemption_rights': rnd.random() < 0.15, 'pay_to_play': rnd.random() < 0.1, 'pricing_move': rnd.choice(['Raised prices', 'Held prices', 'Discounted to win', 'Never tested']),
             'moat_type': rnd.choice(['Network effects', 'Proprietary data', 'High switching costs', 'Brand'])}
    if bools['new_participating']: T['new_part_cap'] = rnd.choice([2.0, 3.0])
    founders = [f'{rnd.choice(FIRST)} {rnd.choice(LAST)}' for _ in range(T['founders_count'])]
    # cap table (shares): founders, prior investors, pool (granted + unallocated), SAFEs and notes in dollars
    fshares = sorted([int(rnd.uniform(1.5e6, 4e6)) for _ in founders], reverse=True)
    inv = int(sum(fshares) * rnd.uniform(0.25, 0.6)); granted = int(sum(fshares) * rnd.uniform(0.05, 0.12)); unalloc = int(sum(fshares) * rnd.uniform(0.03, 0.10))
    total = sum(fshares) + inv + granted + unalloc
    T['founder_max_equity'] = round(fshares[0] / total * 100, 1); T['prior_investor_pct'] = round(inv / total * 100, 1); T['option_pool'] = round(unalloc / total * 100, 1)
    safes = [] if stage in ('a', 'b') and rnd.random() < 0.5 else [(round(rnd.uniform(1e5, 1.5e6), -4), round(pre * rnd.uniform(0.5, 0.9), -5), rnd.choice([0, 15, 20]))]
    if safes: T['safes_outstanding'] = sum(s[0] for s in safes); T['safe_cap'] = safes[0][1]; T['safe_discount'] = safes[0][2]
    note = None if rnd.random() < 0.6 else (round(rnd.uniform(2e5, 1e6), -4), rnd.choice([5, 6, 8]), round(pre * 0.8, -5), 20)
    if note: T['notes_principal'], T['notes_rate'], T['notes_cap'], T['notes_discount'] = note
    flat = 1.0 + rnd.uniform(0.05, 0.25)   # the deck rounds up
    C = {'stated_arr': round(arr_now * flat, -5), 'stated_nrr': round(rnd.uniform(108, 135)), 'stated_growth': round(growth * 100 * flat),
         'stated_customers': int(cust * flat), 'stated_tam': rnd.choice([2e9, 4.5e9, 8e9, 12e9, 30e9]), 'stated_runway': round(cash / burn * flat),
         'stated_grr': round(rnd.uniform(86, 96)), 'stated_burn_multiple': round(rnd.uniform(0.6, 1.4), 1)}
    model_f = {}
    if model == 'marketplace': model_f = {'gmv_now': round(arr_now * rnd.uniform(6, 12), -3), 'take_rate': round(rnd.uniform(8, 18), 1), 'contrib_margin': round(rnd.uniform(15, 45), 1)}
    if model == 'fintech': model_f = {'volume_now': round(arr_now * rnd.uniform(40, 120), -3), 'loss_rate': round(rnd.uniform(0.1, 1.5), 2)}
    if model == 'ai_app': model_f = {'inference_pct': round(rnd.uniform(12, 40), 1), 'top_model_share': round(rnd.uniform(40, 95), 1)}
    if model == 'saas': model_f = {'seat_util': round(rnd.uniform(55, 90), 1)}
    return {'i': i, 'name': name, 'model': model, 'stage': stage, 'ccy': ccy, 'french': french, 'T': T, 'C': C, 'B': bools, 'M': model_f,
            'founders': list(zip(founders, fshares)), 'investors': inv, 'granted': granted, 'unalloc': unalloc, 'safes': safes, 'note': note,
            'buckets': buckets, 'restricted': restricted, 'competitor': rnd.choice(COMPETITORS), 'asof': f'2026-{rnd.choice(["06", "09"])}-30',
            'growth': growth, 'months': 24 if stage in ('a', 'b') else 14}


def companies(seed):
    rnd = random.Random(seed)
    return [company(i, rnd) for i in range(24)]
