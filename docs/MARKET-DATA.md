# Market data

VCR2 adjusts a few results to the startup's market (United States or Europe) with figures from official sources and trusted
VC sources. Every figure shows its source, its link and its date, and the report records the market and the data date.

## Three tiers, best first

| Tier | What you have | What VCR2 uses |
|---|---|---|
| 1 | Internet and your own AI key | Everything in tier 2, plus Market intel (live web research, every claim with its source) |
| 2 | Internet, no key | The weekly data file published with the site (`data/market.json`), read from vcr2.app itself. Nothing about the company is sent: the page only downloads a public file. |
| 3 | No internet | The snapshot built into the page, with its date |

## The market selector

On the set-up page, "Startup to analyse: market" offers United States or Europe. For Europe:

- amounts are in euros in the form and the report;
- thresholds set in US dollars (ARR per employee, bottom-up market size, the next-stage ARR bar of the simulation) are
  converted at the ECB reference rate;
- the risk-free rate is the euro area 10-year yield (ECB) and company counts come from Eurostat;
- the stage ARR ranges on the set-up page and the wrong-stage check are in euros;
- the diligence checklist uses European items and wording (company register, VAT, GDPR, option valuation and tax treatment,
  foreign investment screening, the AI Act for AI applications, DORA for fintech) instead of the US-only ones;
- the European public-software index (Multiples.vc) is shown for reference only: it is not on the list of trusted VC sources,
  so the built-in exit multiple is used and the report says so.

The report also lists, for the chosen market, the **rules to check** (Benchmarks tab) and the **exit routes** (under the
returns), each with its official source. They are information, not legal or tax advice.

## The figures

| Figure | United States | Europe | Use |
|---|---|---|---|
| Exit multiple (public software, EV ÷ next-12-month revenue) | Clouded Judgement weekly index (VC source) | Multiples.vc European B2B SaaS Index: shown only, not a trusted source yet | Feeds the exit multiple when the investor leaves it blank (US) |
| US dollars per euro | n/a | ECB reference rate (official) | Converts the dollar thresholds |
| Risk-free rate, 10-year | US Treasury par yield curve (official) | ECB euro area yield curve, AAA (official) | Shown under the returns next to the target return |
| Companies by size, all industries | US Census, Statistics of US Businesses (official) | Eurostat, enterprises by size class (official) | Shown next to the bottom-up market inputs |
| Software publishers | US Census, NAICS 5112 | Eurostat, NACE J58.2 | Shown next to the bottom-up market inputs |
| Median pre-seed and seed pre-money | none verified yet (full reports only) | PitchBook European VC Valuations Report (VC source) | Shown only |
| Median Series A pre-money | none verified yet (Carta and PitchBook-NVCA give it in their full reports only) | none verified yet (PitchBook, full report only) | Shown only, once a figure is added from the report |

Precedence for the exit multiple: the investor's own figure, then the owner's Studio default, then the market figure (when
it may feed), then the built-in 8x.

## Rules

- A figure feeds a result only when it comes from an official source or a trusted VC source. Anything else falls back to
  the built-in value, and the report says so.
- In the Owner Studio, section **Market data**, each figure that can feed a result can be switched to **shown only**.
- A figure from a source that is not yet on the trusted list carries `"feeds": false` in `data/market-manual.json`: it is
  shown with its source, never used. Remove that line once the owner accepts the source.
- The market and every market figure that fed a result enter the run ID: the same inputs with the same data give the same
  result and the same run ID.

## How the data is refreshed

- **Official figures, weekly.** `.github/workflows/market-data.yml` runs every Monday (and on demand from the Actions tab).
  It runs `tools/market_data.py`, which fetches the figures and checks each one. When every figure passes, the new
  `data/market.json` is committed to `main`: a visible commit that can be reverted. When a figure is missing, is not a
  positive number or moved by more than 25% from the previous file, `main` is left alone: the previous value is kept and a
  pull request explains what failed, for the owner to approve or close.
- **VC figures, each quarter.** `data/market-manual.json` holds the figures taken from VC reports (source, link, date).
  They are updated by hand when a new report is out, then published with the rest of the site; the weekly job copies them
  into `data/market.json`.
- **The snapshot in the page** (tier 3) is refreshed when the site is published.

The publish script never overwrites `data/market.json` (like `radar-config.json`): on GitHub it belongs to the weekly job.
The first publish creates it once, from the file in the dev folder, so the site has a data file before the job's first run.
