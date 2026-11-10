"""Fuzz variants of a base document (P6, test plan 7.4): every base document gets three mutants.
  shuffle: rows of every table and the order of label-value lines shuffled, plus decoy rows and distractor paragraphs
  locale:  numbers rewritten in the European style (1.234.567,8 and 12,5 %), a header saying so
  unseen:  labels renamed with synonyms that are NOT in the dictionary (measures generalisation)
The gold values do not change; decoys add must_not_value entries."""
import copy, random, re

UNSEEN = [(r'\bClosing ARR\b', 'Year-end subscription run-rate'), (r'\bOpening ARR\b', 'Run-rate at the start of the period'), (r'\bNew-logo ARR\b', 'Bookings from first-time buyers'),
          (r'\bExpansion ARR\b', 'Growth within existing accounts'), (r'\bChurned ARR\b', 'Revenue lost to cancellations'), (r'\bContraction ARR\b', 'Revenue lost to downsizing'),
          (r'\bCash and equivalents \(closing\)', 'Liquidity at period end'), (r'\bNet burn\b', 'Monthly cash consumption'), (r'\bGross burn\b', 'Total monthly outflow'),
          (r'\bGross margin \(incl\. customer success\)', 'Margin after cost of service'), (r'\bDeferred revenue \(balance\)', 'Billings not yet earned'),
          (r'\bSales and marketing\b', 'Go-to-market spend'), (r'\bHosting and infrastructure\b', 'Cloud bill'), (r'\bSupport and delivery\b', 'Service delivery cost'),
          (r'\bWin rate\b', 'Share of deals won'), (r'\bMedian sales cycle\b', 'Typical time to signature'), (r'\bPipeline coverage\b', 'Pipeline as a multiple of target'),
          (r'\bQuota attainment\b', 'Reps hitting plan'), (r'\bNet Promoter Score\b', 'Recommendation score'), (r'\bTarget accounts\b', 'Companies matching the buyer profile'),
          (r'\bUptime \(trailing 90 days\)', 'Service availability, last quarter'), (r'\bSeverity-1 incidents \(last 12 months\)', 'Critical outages this year'),
          (r'\bAmount of financing\b', 'Capital to be raised'), (r'\bPre-money valuation\b', 'Valuation before the money'), (r'\bTeam\b', 'Staff'), (r'\bCash as of\b', 'Money in the bank on')]
DECOY_ROWS = [['Target ARR (next year plan)', '{big}'], ['Competitor ARR (public estimate)', '{big}'], ['Industry benchmark gross margin', '75%'], ['Budget net burn', '{small}']]


def _blocks(doc):
    if 'slides' in doc: return [b for s in doc['slides'] for b in s]
    return doc.get('blocks', [])


def mutate(doc, gold, must, kind, rnd):
    d, g, m = copy.deepcopy(doc), copy.deepcopy(gold), list(must)
    extra_not = []
    if kind == 'shuffle':
        for sh in d.get('sheets', []):
            if len(sh['rows']) > 3:
                head, body = sh['rows'][:2], sh['rows'][2:]
                rnd.shuffle(body)
                big = 10 ** (len(str(int(max([float(str(c).replace(',', '')) for r in body for c in r[1:] if re.fullmatch(r'-?[\d,]+(\.\d+)?', str(c))] or [1e6])))))
                for dr in rnd.sample(DECOY_ROWS, 2):
                    row = [dr[0]] + [dr[1].format(big=f'{big * 3:,}', small=f'{big // 7:,}')] + [''] * (len(head[-1]) - 2)
                    body.insert(rnd.randrange(len(body) + 1), row); extra_not.append(float(row[1].replace(',', '').rstrip('%')))
                sh['rows'] = head + body
        bl = d.get('blocks')
        if bl:
            kv = [i for i, b in enumerate(bl) if b[0] == 'kv']
            vals = [bl[i] for i in kv]; rnd.shuffle(vals)
            for i, b in zip(kv, vals): bl[i] = b
            bl.insert(min(len(bl), 2), ('p', 'For comparison, the category leader reports 3,200 customers and $95.0M in revenue; the industry median gross margin is 74%.'))
            extra_not += [3200, 95e6, 74]
        if 'slides' in d:
            d['slides'][-1].append(('p', 'Peers trade at 12x revenue; our plan is $60.0M ARR in 2029.')); extra_not += [60e6]
    elif kind == 'locale':
        def eu(t):
            t = str(t)
            t = re.sub(r'(?<![\d.])(\d{1,3}(?:,\d{3})+)(\.\d+)?(?![\d])', lambda mm: mm.group(1).replace(',', '.') + (mm.group(2) or '').replace('.', ','), t)
            t = re.sub(r'(?<![\d,])(\d+)\.(\d{1,2})(?=\s?(%|x|M|k|m|mois|months|\b))', r'\1,\2', t)
            return re.sub(r'(\d)%', r'\1 %', t)
        for sh in d.get('sheets', []):
            sh['rows'] = [[eu(c) if isinstance(c, str) else (eu(f'{c:,}') if isinstance(c, int) and abs(c) >= 1000 else c) for c in r] for r in sh['rows']]
            sh['rows'].insert(0, ['Format: European (1.234,5)'])
        def blk(b):
            return tuple(eu(x) if isinstance(x, str) and i > 0 and b[0] in ('kv', 'tile', 'p') else (([[eu(str(c)) for c in r] for r in x]) if b[0] == 'table' and i == 1 else x) for i, x in enumerate(b))
        if 'blocks' in d: d['blocks'] = [blk(b) for b in d['blocks']]
        if 'slides' in d: d['slides'] = [[blk(b) for b in s] for s in d['slides']]
    elif kind == 'unseen':
        def ren(t):
            for a, b in UNSEEN: t = re.sub(a, b, t)
            return t
        for sh in d.get('sheets', []): sh['rows'] = [[ren(c) if isinstance(c, str) else c for c in r] for r in sh['rows']]
        if 'blocks' in d: d['blocks'] = [tuple(ren(x) if isinstance(x, str) else x for x in b) for b in d['blocks']]
        if 'slides' in d: d['slides'] = [[tuple(ren(x) if isinstance(x, str) else x for x in b) for b in s] for s in d['slides']]
    return d, g, m, extra_not
