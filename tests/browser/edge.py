import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import _paths
import asyncio, json, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(_paths.FILE_URL); await pg.wait_for_timeout(300)
        # 1 empty
        await pg.evaluate("S = blankState(); S.name='Empty Co'; goVerify()"); await pg.wait_for_timeout(100)
        await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        print('empty:', await pg.evaluate("JSON.stringify({score:S.result.sc.overall, q:S.result.questions.length, pat:S.result.patterns.length, sim:!!S.result.proj.sim, deal:!!S.result.deal})"))
        for t in ['overview','revenue','forensics','runway','deal','bench','scoring','questions','metrics','ledger']:
            await pg.evaluate(f"goTab('{t}')")
        await pg.evaluate("goTab('runway')"); await pg.screenshot(path=_paths.SHOTS + 'e_empty_runway.png')
        # 2 marketplace + fintech + preseed
        for model, stage, vals in [('marketplace','seed',{'arr_now':'900000','arr_12mo':'300000','gmv_now':'9000000','gmv_12mo':'2500000','repeat_gmv_pct':'22','incentives_pct':'14','contrib_margin':'-5','stated_take_rate':'12','cash_on_hand':'2000000','net_burn':'180000'}),
                                   ('fintech','a',{'arr_now':'5000000','arr_12mo':'2000000','volume_now':'500000000','volume_12mo':'200000000','loss_rate':'3.5','stated_take_rate':'1.2','cash_on_hand':'9000000','net_burn':'600000'}),
                                   ('ai_app','preseed',{'arr_now':'120000','arr_12mo':'20000','cash_on_hand':'900000','net_burn':'60000','inference_pct':'48','gross_margin':'41','gm_12mo':'45'})]:
            await pg.evaluate(f"S = blankState(); S.name='{model} co'; S.model='{model}'; S.stage='{stage}'; S.vals = {json.dumps(vals)}; S.sel = {{licence_model:'Sponsor or partner bank'}}; S.bools = {{regulatory_findings:true, model_single_vendor:true}}; buildNav(); S.section=5; renderSection(5); showPage('section')")
            await pg.screenshot(path=_paths.SHOTS + f'e_{model}_section.png', full_page=True)
            await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
            print(model, await pg.evaluate("JSON.stringify({score:S.result.sc.overall, take:S.result.D.take_rate, pats:S.result.patterns.map(p=>p.sev+':'+p.id), checks:S.result.checks.filter(c=>c.sev!=='ok').map(c=>c.id), sim:S.result.proj.sim && S.result.proj.sim.milestone})"))
        # 3 short ledger
        await pg.evaluate("S = blankState(); S.name='Short'; loadLedgerText('customer,2026-01,2026-02,2026-03,2026-04\\nA,100,100,120,120\\nB,50,50,0,0\\nC,0,70,70,90\\nD,0,0,30,30', 'x.csv')")
        await pg.evaluate("runAnalysis()"); await pg.wait_for_timeout(1500)
        print('short ledger:', await pg.evaluate("JSON.stringify({w:S.result.LED.window, nrr:S.result.D.nrr, fx:S.result.forensics.map(f=>f.id+':'+f.status)})"))
        await pg.evaluate("goTab('revenue')"); await pg.screenshot(path=_paths.SHOTS + 'e_short_revenue.png', full_page=True)
        # 4 deal without cheque
        await pg.evaluate("S = blankState(); S.name='Deal'; S.vals={round_size:'5000000', round_pre_money:'20000000', arr_now:'1000000'}; runAnalysis()"); await pg.wait_for_timeout(1500)
        print('deal no cheque:', await pg.evaluate("JSON.stringify({P:S.result.deal.P, own:S.result.deal.ownEntry, notes:S.result.deal.notes})"))
        await pg.evaluate("goTab('deal')"); await pg.screenshot(path=_paths.SHOTS + 'e_deal_nocheck.png', full_page=True)
        # 5 big ledger perf
        t0 = time.time()
        await pg.evaluate("""() => { const rnd = mulberry32(5); const months = Array.from({length:36}, (_, k) => monthAdd('2023-09', k));
          const rows = ['customer,' + months.join(',')];
          for (let i = 0; i < 2500; i++) { const s = Math.floor(rnd() * 30); let v = 200 + Math.floor(rnd() * 5000); const r = ['Cust ' + i];
            for (let t = 0; t < 36; t++) { if (t < s) r.push(0); else { if (rnd() < 0.015) v = 0; else if (rnd() < 0.05) v = Math.round(v * 1.2); r.push(v); } } rows.push(r.join(',')); }
          S = blankState(); S.name = 'Big'; S.stage = 'b'; document.getElementById('ledger-unit').value = 'mrr'; loadLedgerText(rows.join('\\n'), 'big.csv'); }""")
        t1 = time.time()
        await pg.evaluate("applyLedgerToForm(); S.vals.cash_on_hand='30000000'; S.vals.net_burn='1500000'")
        t2 = time.time()
        await pg.evaluate("S.result = assessAll(); renderResult(S.result); showPage('result')")
        t3 = time.time()
        print(f'big ledger: parse+analytics {t1-t0:.2f}s, assess+render {t3-t2:.2f}s', await pg.evaluate("JSON.stringify({c:S.ledger.customers.length, arr:S.result.LED.arrNow, fx:S.result.forensics.map(f=>f.id+':'+f.status)})"))
        await pg.evaluate("goTab('revenue')"); await pg.screenshot(path=_paths.SHOTS + 'e_big_revenue.png', full_page=True)
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
