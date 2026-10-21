
/* ═══════════════════════════════════════════════════════════════
   WHERE THE DEFAULT BARS COME FROM
   Every default range in RUBRIC.thresholds is a calibration: VCR2's own judgement of what is poor, acceptable,
   good and excellent for a venture-backed company at a stage. Where a public survey measures the same thing,
   its figure is listed here as a reference point with its source, edition date and population, and the report
   shows what score that reference value earns with the bars in force. Only figures read on the primary source
   during the 2026-10-04 verification are listed.
   The owner can add his own source or reason to any bar in the Studio (Healthy ranges → Change).
   ═══════════════════════════════════════════════════════════════ */
const SRC = {
  saascap_ret:  { src:'SaaS Capital, B2B SaaS retention benchmarks (Research Brief 32)', asOf:'2025-09', pop:'1,000+ private B2B SaaS companies, mixed funding, Q1 2025 survey on calendar 2024 (the by-ACV figures exclude companies under $1M ARR)', status:'VERIFIED',
                  url:'https://www.saas-capital.com/wp-content/uploads/2025/09/RB32WS1-2025-B2B-SaaS-Retention-Benchmarks.pdf' },
  highalpha:    { src:'High Alpha, 2025 SaaS Benchmarks Report', asOf:'2025-11', pop:'800+ respondents (founder-heavy), funding mix not disclosed, Q2 2025', status:'VERIFIED',
                  url:'https://2994607.fs1.hubspotusercontent-na1.net/hubfs/2994607/2025%20SaaS%20Benchmarks%20Report.pdf' },
  benchmarkit:  { src:'Benchmarkit, 2026 SaaS & AI-Native Metrics Benchmarks', asOf:'2026-06', pop:'342 B2B SaaS and AI-native companies, calendar 2025, funding mix not disclosed', status:'VERIFIED',
                  url:'https://www.benchmarkit.ai/_files/ugd/2a084b_f19d7f96a9e24aba9202e01224d0dbcc.pdf' },
  saascap_gr:   { src:'SaaS Capital, benchmarking private SaaS company growth rates (2025 PDF; the 2026 page is undated)', asOf:'2025-06', pop:'private B2B SaaS companies, mixed funding, calendar 2024; the 2026 page adds equity-backed 25%, overall 22%', status:'VERIFIED',
                  url:'https://www.saas-capital.com/wp-content/uploads/2025/06/RB33EM5-2025-B2B-Benchmarking-Private-SaaS-Company-Growth-Rates.pdf' },
  bessemer23:   { src:'Bessemer Venture Partners, State of the Cloud 2023', asOf:'2023-04', pop:'targets for a typical Series B or C enterprise software company (not medians)', status:'VERIFIED',
                  url:'https://www.bvp.com/atlas/state-of-the-cloud-2023' },
  iconiq_ai:    { src:'ICONIQ, 2026 State of AI: The Builder’s Economy', asOf:'2026-07', pop:'287 companies building AI products (AI-native included), Q2 2026 survey; an average, not a median', status:'VERIFIED',
                  url:'https://www.iconiq.com/growth/reports/state-of-ai-2026' },
  bessemer_ai:  { src:'Bessemer Venture Partners, State of AI 2025', asOf:'2025-08', pop:'20 AI startups from its portfolio and beyond (split not disclosed)', status:'VERIFIED',
                  url:'https://www.bvp.com/atlas/the-state-of-ai-2025' },
  sacks:        { src:'David Sacks, “The Burn Multiple” (Craft Ventures)', asOf:'2020-04', pop:'a venture-stage rule of thumb, not a statistic; the band table is an image and was not verified as text', status:'SECONDARY',
                  url:'https://sacks.substack.com/p/the-burn-multiple-51a7e43cb200' },
  cooley:       { src:'Cooley, Q2 2026 Venture Financing Report', asOf:'2026-08', pop:'166 financings of Cooley clients (law-firm sample)', status:'VERIFIED',
                  url:'https://www.cooley.com/news/insight/2026/2026-08-17-q2-2026-venture-financing-report' },
  carta_pool:   { src:'Carta data post on option pools after seed', asOf:'not verified', pop:'15,000+ startups over five years (page could not be read; figure from a search snippet)', status:'UNCONFIRMED',
                  url:'https://carta.com/data/linkedin-seed-option-pool-push-back-20-percent/' },
};
/* val = the number that scores through the bars (so the report can say what score it earns). */
const PROVENANCE = {
  nrr: { refs:[ { s:'saascap_ret', text:'median NRR 101%', val:101 }, { s:'highalpha', text:'median NRR 100% (<$1M ARR), 104% ($1–5M), 103% ($5–20M); top quartile 110–116%', val:104 },
                { s:'benchmarkit', text:'median NRR 102%, bottom quartile 92%, top quartile 108–110% (the report gives both)', val:102 }, { s:'bessemer23', text:'good / better / best: 100% / 110% / 120%+', val:110 } ] },
  grr: { refs:[ { s:'saascap_ret', text:'median GRR 91%', val:91 }, { s:'highalpha', text:'median GRR 92% (<$5M ARR), 88% ($5–20M)', val:92 }, { s:'benchmarkit', text:'median GRR 84%, quartiles 76% and 91%', val:84 } ] },
  growth_yoy: { refs:[ { s:'highalpha', text:'median growth 100% (<$1M ARR), 50% ($1–5M), 31% ($5–20M); top quartile 300% / 100% / 72%', val:50 },
                       { s:'saascap_gr', text:'overall median growth 25% (calendar 2024)', val:25 },
                       { s:'benchmarkit', text:'median growth 20%, top quartile 42%', val:20 } ],
               fit:'These bars are set for venture-scale outcomes: “acceptable” sits near the top quartile of the surveyed companies, not at their median.' },
  gross_margin: { refs:[ { s:'benchmarkit', text:'median software gross margin 80% (total-revenue gross margin 76%)', val:80 } ],
                  fit:'The “good” bar is just below the surveyed software median (the excellent bar is above it): early-stage companies, usage-priced products and services mixes run lower.' },
  gross_margin_ai: { refs:[ { s:'iconiq_ai', text:'average gross margin on AI products 45% in 2025 (53% projected for 2026, 59% for 2027)', val:45 },
                            { s:'bessemer_ai', text:'“Shooting Star” AI companies about 60%; “Supernova” companies about 25% on average, often negative', val:60 } ] },
  cac_payback: { refs:[ { s:'benchmarkit', text:'median CAC payback 16 months', val:16 }, { s:'highalpha', text:'median payback, gross-margin adjusted: 5 / 8 / 14 / 20 / 17 months for <$1M / $1–5M / $5–20M / $20–50M / >$50M ARR', val:14 },
                       { s:'bessemer23', text:'good / better / best: 12–18 / 6–12 / 0–6 months', val:12 } ] },
  burn_multiple: { refs:[ { s:'sacks', text:'under 1× amazing, 1–1.5× great, 1.5–2× good, 2–3× suspect, over 3× bad', val:2 } ] },
  runway: { refs:[ { s:'bessemer23', text:'good / better / best: 12 / 18 / 24+ months', val:18 } ] },
  liq_pref: { refs:[ { s:'cooley', text:'1× preference in 95.8% of deals; non-participating in 96.4%', val:1 } ] },
  option_pool: { refs:[ { s:'carta_pool', text:'median pool after a seed round 11.8%', val:11.8 } ] },
};
function provenanceOf(key) {
  const p = PROVENANCE[key];
  if (!p) return { status:'CALIBRATION', refs:[], fit:null };
  return { status:'CALIBRATION', refs:p.refs.map(r => Object.assign({}, SRC[r.s], { text:r.text, val:r.val })), fit:p.fit || null };
}
/* What a reference value scores with the bars in force at this stage (owner changes are respected). */
function refScore(key, val, stage) {
  const th = activeThresholds()[key]; if (!th || val == null) return null;
  if (th.dir === 'band') return Math.round(bandedIdeal(val, th.ideal, th.hard));
  const a = th[stageKey(stage)]; if (!Array.isArray(a)) return null;
  return Math.round(bandScore(val, a, th.dir));
}
