import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, json
from playwright.async_api import async_playwright
SRC=_paths.FILE_URL
UNIT = r"""
() => {
  const out = []; const eq = (name, got, exp, tol) => { const ok = tol != null ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp); out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ` got ${JSON.stringify(got)} expected ${JSON.stringify(exp)}`)); };
  eq('parseNum $', parseNum('$1,234.50'), 1234.5); eq('parseNum paren', parseNum('(1,234)'), -1234); eq('parseNum M', parseNum('1.2M'), 1.2e6);
  eq('parseNum %', parseNum('12%'), 12); eq('parseNum EU', parseNum('€ 4.300,00'), 4300); eq('parseNum comma dec', parseNum('4,2'), 4.2); eq('parseNum dash', parseNum('-'), null);
  eq('parseNum k', parseNum('850k'), 850000); eq('parseNum neg', parseNum('-12.5'), -12.5);
  ['2024-01','Jan 2024','Jan-24','01/2024','2024/1','January 2024','45292','31/01/2024','2024-01-31','jan. 2024','janvier 2024'].forEach(x => eq('parseMonth ' + x, parseMonth(x), '2024-01'));
  eq('parseMonth Q', parseMonth('2024 Q2'), '2024-06'); eq('monthAdd', monthAdd('2024-11', 3), '2025-02'); eq('monthDiff', monthDiff('2024-11', '2025-02'), 3);
  eq('binom 12/11', binomTail(12, 11), 13 / 4096, 1e-12); eq('binom 4/4', binomTail(4, 4), 1 / 16, 1e-12); eq('binom 10/5', binomTail(10, 5), 638 / 1024, 1e-12);
  eq('quantile', quantile([1,2,3,4,5], 0.25), 2); eq('pctRank', pctRank([1,2,3,4], 3), 62.5);
  /* hand-checked ledger */
  const csv = 'customer,' + Array.from({length:13}, (_, k) => monthAdd('2025-01', k)).join(',') + '\n'
    + 'A,' + Array(12).fill(100).concat([150]).join(',') + '\n'
    + 'B,' + [100,100,100,100,100,100,0,0,0,0,0,0,0].join(',') + '\n'
    + 'C,' + [0,0,0,50,50,50,50,50,50,50,50,50,100].join(',') + '\n';
  const L = parseLedger(csv, 'mrr').ledger, A = ledgerAnalytics(L);
  eq('ledger nrr cohort', A.nrrCohort, 75, 1e-9); eq('ledger grr cohort', A.grrCohort, 50, 1e-9); eq('ledger logo ret', A.logoRet, 50, 1e-9);
  eq('ledger nrr flow', A.nrrFlow, 100, 1e-9); eq('ledger arr now', A.arrNow, 250 * 12, 1e-9); eq('ledger customers', A.customersNow, 2);
  eq('ledger new flow', A.flows.nw, 50, 1e-9); eq('ledger churn flow', A.flows.churn, 100, 1e-9); eq('ledger exp flow', A.flows.exp, 100, 1e-9);
  /* long format + ARR units */
  const long = 'Customer Name,Invoice Month,ARR\nA,Jan 2025,1200\nA,Feb 2025,1200\nA,Mar 2025,2400\nB,Feb 2025,600\nB,Mar 2025,600\nC,Mar 2025,1200\n';
  const r2 = parseLedger(long); eq('long ok', r2.ok, true); eq('long unit arr', r2.ledger.unit, 'arr'); eq('long mrr A mar', r2.ledger.customers.find(c => c.name === 'A').mrr[2], 200);
  /* bridge identity on the demo ledger */
  const NL = ledgerFromSpec(northwindLedger()), NA = ledgerAnalytics(NL);
  let worst = 0; NA.bridge.forEach((b, k) => { worst = Math.max(worst, Math.abs((NA.mrr[k + 1] - NA.mrr[k]) - b.net)); });
  eq('bridge closes every month', worst, 0, 1e-6);
  /* liquidation */
  const cls = [{ id:'new', frac:0.2, pref:10, part:false }];
  eq('liq low exit pref', liquidate(20, 0, cls, 0.8).byId.new, 10, 1e-9); eq('liq low exit common', liquidate(20, 0, cls, 0.8).common, 10, 1e-9);
  eq('liq high exit converts', liquidate(100, 0, cls, 0.8).byId.new, 20, 1e-9); eq('liq under pref', liquidate(6, 0, cls, 0.8).byId.new, 6, 1e-9);
  eq('liq debt first', liquidate(8, 5, cls, 0.8).byId.new, 3, 1e-9);
  eq('liq participating', liquidate(100, 0, [{ id:'new', frac:0.2, pref:10, part:true }], 0.8).byId.new, 28, 1e-9);
  const two = [{ id:'a', frac:0.2, pref:10, part:false }, { id:'b', frac:0.3, pref:40, part:false }];
  const r = liquidate(100, 0, two, 0.5); eq('liq two classes sums', r.byId.a + r.byId.b + r.common, 100, 1e-9);
  /* default alive */
  const da = defaultAlive({ rev0:100, exp0:150, cash0:1000, g:10, eg:0 }); eq('default alive', da.alive, true); eq('default alive months', da.months, 5);
  const dd = defaultAlive({ rev0:100, exp0:300, cash0:500, g:2, eg:1 }); eq('default dead', dd.alive, false);
  /* simulation determinism */
  const P = { rev0:100000, exp0:180000, cash0:3000000, g:5, eg:1, sd:4, milestone:2000000, A:Object.assign({}, ASSUME_DEFAULTS) };
  const s1 = simulate(P, 'seed-x'), s2 = simulate(P, 'seed-x'), s3 = simulate(P, 'seed-y');
  eq('sim deterministic', s1.pMilestone, s2.pMilestone); eq('sim seed changes', s1.pMilestone !== s3.pMilestone || s1.runway.p50 !== s3.runway.p50, true);
  eq('sim probabilities in range', s1.pMilestone >= 0 && s1.pMilestone <= 1 && s1.pDeath >= 0 && s1.pDeath <= 1, true);
  /* benford on a Benford-distributed sample */
  const rnd = mulberry32(9); const bxs = Array.from({ length:3000 }, () => Math.pow(10, 1 + rnd() * 4));
  const bf = benfordTest(bxs); eq('benford applicable', bf.applicable, true); eq('benford conforms', bf.mad < 0.012, true);
  const flat = Array.from({ length:3000 }, () => 100 + Math.floor(rnd() * 900)); eq('benford uniform fails', benfordTest(flat).mad > 0.015, true);
  /* headless API */
  const H = Radar.assess({ name:'T', stage:'seed', model:'saas', vals:{ arr_now:'1000000', arr_12mo:'400000', cash_on_hand:'2000000', net_burn:'100000', stated_arr:'1300000' } });
  eq('headless growth', H.derived.growth_yoy, 150, 1e-9); eq('headless check', H.checks.find(c => c.id === 'stated_arr').sev, 'major');
  eq('headless restores state', S.name !== 'T', true);
  /* goodValue */
  eq('goodValue hi', goodValue({ dir:'hi' }, [1,2,3,4]), 3); eq('goodValue lo', bandScore(goodValue({ dir:'lo' }, [1,1.5,2.5,4]), [1,1.5,2.5,4], 'lo'), 72, 1e-9);
  return out;
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
        pg = await ctx.new_page()
        errs=[]; dialogs=[]
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
        async def on_dialog(d):
            dialogs.append(d.message); await d.accept()
        pg.on('dialog', on_dialog)
        await pg.goto(SRC); await pg.wait_for_timeout(300)
        res = await pg.evaluate(UNIT)
        fails = [r for r in res if r.startswith('FAIL')]
        print(f'UNIT: {len(res)-len(fails)}/{len(res)} pass'); print('\n'.join(fails))

        # XSS probe
        await pg.evaluate("""() => { loadDemo('halcyon'); S.name = '<img src=x onerror=window.__xss=1>'; S.ledger.customers[0].name = '<svg onload=window.__xss=2>'; S.ledger.id += 'x'; }""")
        await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        for t in ['overview','revenue','forensics','deal']:
            await pg.evaluate(f"goTab('{t}')"); await pg.wait_for_timeout(80)
        xss = await pg.evaluate("window.__xss || 0")
        print('XSS triggered:', xss)

        # intake flows
        await pg.evaluate("S = blankState(); S.name='Intake Test'; showPage('intake')")
        long_csv = "customer,month,mrr\\n" + "\\n".join(f"C{i},2025-{m:02d},{1000+i*37+m*10}" for i in range(30) for m in range(1,13))
        await pg.evaluate(f"loadLedgerText('{long_csv}', 'test.csv')")
        st = await pg.inner_text('#ledger-status')
        print('ledger status:', st[:160].replace('\n',' | '))
        await pg.evaluate("loadSeriesText('month,revenue,cash,net burn,headcount\\n2025-01,30000,900000,50000,8\\n2025-02,32000,850000,48000,8\\n2025-03,35000,800000,50000,9\\n2025-04,37000,752000,48000,9', 'fin.csv')")
        print('series status:', (await pg.inner_text('#series-status'))[:120].replace('\n',' | '))
        await pg.screenshot(path=_paths.SHOTS + 't_intake.png', full_page=True)
        n = await pg.evaluate("applyLedgerToForm()")
        print('applied fields:', n, await pg.evaluate("JSON.stringify({arr:S.vals.arr_now, c:S.vals.customers_now, prov:S.prov.arr_now && S.prov.arr_now.src, ev:evidenceOf('arr_now')})"))

        # mocked AI extraction
        await pg.evaluate("""() => {
          document.getElementById('api-provider').value = 'anthropic'; document.getElementById('api-key').value = 'sk-ant-test-123456789'; updateProviderUI();
          window.callModel = async (prov, key, sys, prompt) => {
            if (prompt.includes('one row per company')) return JSON.stringify([{company:'Acme', stage:'a', model:'saas', metrics:{arr:'3.1M', growth_yoy:140, nrr:112, gross_margin:76}, source:'Acme (Series A, $3.1M ARR, 140% YoY, 112% NRR, 76% GM)'},{company:'Beta', stage:null, metrics:{arr:900000, nrr:1.05}, source:'Beta 900k ARR'}]);
            if (prompt.includes('IC memo')) return 'Paragraph one.\\n\\nParagraph two.';
            return JSON.stringify({ stated_arr:{ value:5000000, line:'We closed the year at $5M ARR' }, stated_nrr:{ value:130, line:'NRR 130%' }, gross_margin:{ value:'78', line:'GM 78%' }, round_size:{ value:10000000, line:'Raising $10M' } });
          };
        }""")
        await pg.fill('#intake-deck', 'We closed the year at $5M ARR. NRR 130%. GM 78%. Raising $10M.')
        await pg.evaluate("runExtraction()"); await pg.wait_for_timeout(400)
        print('extracted:', await pg.evaluate("JSON.stringify({a:S.vals.stated_arr, n:S.vals.stated_nrr, gm:S.vals.gross_margin, r:S.vals.round_size, prov:S.prov.stated_arr})"))

        # memo with mocked model
        await pg.evaluate("loadDemo('halcyon')"); await pg.evaluate("document.getElementById('memo-toggle').checked = true")
        await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(2000)
        print('memo present:', await pg.evaluate("!!(S.result && S.result.memo)"), await pg.evaluate("document.querySelectorAll('.rtab').length"))

        # founder email
        await pg.evaluate("founderEmail()"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=_paths.SHOTS + 't_email.png')
        body = await pg.input_value('#em-body'); print('email chars:', len(body)); print(body[:700])
        await pg.evaluate("closeModal()")

        # library: save, synthetic, calibrate
        await pg.evaluate("saveRunToLibrary()")
        await pg.evaluate("loadDemo('northwind')"); await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("saveRunToLibrary()")
        await pg.evaluate("goLibrary()"); await pg.wait_for_timeout(200)
        await pg.click('text=Add synthetic sample'); await pg.wait_for_timeout(300)
        before = await pg.evaluate("rubricVersion()")
        await pg.evaluate("setCalibration(true); renderLibrary()")
        after = await pg.evaluate("rubricVersion()")
        print('rubric before/after calibration:', before, after, await pg.evaluate("calibrationStatus().used.length"))
        await pg.screenshot(path=_paths.SHOTS + 't_library.png', full_page=True)
        # AI library import (mocked)
        await pg.evaluate("libOpenAIPaste()"); await pg.fill('#ai-lib-text', 'Acme (Series A, $3.1M ARR, 140% YoY, 112% NRR, 76% GM). Beta 900k ARR, NRR 1.05')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=_paths.SHOTS + 't_ai_import.png')
        await pg.click('.modal-f .btn-primary'); await pg.wait_for_timeout(200)
        print('library size:', await pg.evaluate("libLoad().length"), await pg.evaluate("JSON.stringify(libLoad().filter(x=>x.source==='ai').map(x=>[x.company,x.stage,x.metrics]))"))
        # CSV import parse
        print('csv import:', await pg.evaluate("JSON.stringify(libParseCSV('Company,Stage,ARR,YoY Growth,NDR,Gross Margin,Burn Multiple\\nZed,Series A,$4.2M,120%,1.15,78%,1.4\\nYak,Seed,800k,210%,105%,65%,2.5').rows)"))
        # halcyon benchmarks with calibration
        await pg.evaluate("loadDemo('halcyon')"); await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("goTab('bench')"); await pg.wait_for_timeout(100)
        await pg.screenshot(path=_paths.SHOTS + 't_bench.png', full_page=True)
        print('halcyon calibrated score:', await pg.evaluate("S.result.sc.overall"), await pg.evaluate("S.result.sc.rubric"))
        await pg.evaluate("setCalibration(false)")

        # export / import json
        async with pg.expect_download() as dl:
            await pg.evaluate("exportAssessment()")
        d = await dl.value; path = await d.path(); txt = open(path).read()
        print('export bytes:', len(txt))
        await pg.evaluate("S = blankState()")
        await pg.evaluate(f"restorePayload(JSON.parse({json.dumps(txt)}).payload)")
        print('reimported:', await pg.evaluate("JSON.stringify({n:S.name, led:!!S.ledger, ser:!!S.series, cust:S.ledger && S.ledger.customers.length})"))

        # print memo
        await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.getElementById('print-root').innerHTML = memoHTML(S.result)")
        await pg.emulate_media(media='print')
        await pg.pdf(path=_paths.SHOTS + 't_memo.pdf', format='A4', print_background=True)
        await pg.screenshot(path=_paths.SHOTS + 't_memo_print.png', full_page=True)
        await pg.emulate_media(media='screen')

        # markdown download
        async with pg.expect_download() as dl2:
            await pg.evaluate("downloadReport()")
        d2 = await dl2.value; print('markdown bytes:', len(open(await d2.path()).read()))

        # mobile
        m = await b.new_page(viewport={'width':390,'height':844})
        m.on('pageerror', lambda e: errs.append('MOBILE PAGEERROR '+str(e)))
        await m.goto(SRC); await m.wait_for_timeout(300)
        await m.screenshot(path=_paths.SHOTS + 't_mobile_intro.png', full_page=True)
        await m.evaluate("loadDemo('northwind')"); await m.wait_for_timeout(200)
        await m.screenshot(path=_paths.SHOTS + 't_mobile_section.png')
        await m.evaluate("runAnalysis()"); await m.wait_for_timeout(1800)
        await m.screenshot(path=_paths.SHOTS + 't_mobile_report.png', full_page=True)
        sw = await m.evaluate("document.documentElement.scrollWidth")
        print('mobile scrollWidth:', sw)
        print('dialogs:', dialogs)
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
