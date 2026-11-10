# ANSWER KEY — Quillstone Health practice data room

> **Do not read this until you have run VCR2 and written down your own verdict.**
> FICTIONAL company and data. Numbers below were checked by script and by loading the two CSVs into vcr2.app (rubric 5.0.0, Series B+ / B2B SaaS).

## The shape of the exercise

The company is not a fraud. It is a decent business with a flattering presentation: every headline number is defensible under *some* definition, and most definitions are disclosed in a footnote. Your job is to find the gap between "technically stated" and "what an investor should underwrite".

## What VCR2 shows on its own (from the two CSVs only)

| VCR2 output | What you should see |
|---|---|
| Ledger | 288 customers × 24 months, ledger ARR **$15.60M**, cohort NRR **107.1%**, GRR **89.7%**, top-5 **23%** |
| Growth YoY | **83.1%** |
| Burn multiple | **1.53** |
| ARR waterfall | Reconciles ($15.60M both ways) |
| Forensic: final-month spike | **5.0x** the trailing median net new MRR (Sep '26: $183k vs $37k median; $101k from new/reactivated logos, 18 logos) |
| Forensic: one-month customers | **5** customers billed exactly one month, **$49k** of MRR in their only month |
| Forensic: possible duplicates | **5** name pairs (the three Brookmere entities, the two Sunridge rows, East Lake / Eastlake) |
| Forensic: one-off charges | **21** customers with a single month at 3x or more of their surrounding level |
| Forensic: Benford | Flags nonconformity. This one is a *synthetic-data artifact* (flat contract prices and rounded amounts); treat it as a low-priority signal, which is also what you would do with a real ledger like this |

## The planted problems

Difficulty: **obvious** = VCR2 or the documents hand it to you; **subtle** = you have to connect two documents or add things up yourself.

### 1. ARR is inflated by contracts that are not live and by one-time fees — *obvious*
- Stated: ARR **$15.6M**, **+91% YoY**.
- Recurring-only ARR is about **$14.0M**: the $15.6M includes **$0.84M** of ARR from nine contracts signed in the last week of September that have not gone live (nine logos, $70k MRR, each appearing in the ledger for exactly one month) and **$0.76M** of annualized one-time services billed in September ($63k across six customers: data migration, custom integrations, true-ups).
- Where it hides: deck appendix ("ARR includes executed contracts scheduled to go live within 90 days") and model footnote 1 ("usage true-ups and one-time services billed in the month").
- Growth: the +91% divides the inflated numerator by a *clean* year-ago base ($8.15M). On the ledger as sent it is +83%; on recurring-only numbers it is about **+72%**.
- Monthly growth: September face growth was +16.4% vs about +4.5% on recurring-only; the trailing six-month average is about 4.1% a month.
- Financials cross-check: September revenue in the financials ($1.23M) is **5.5% below** the ledger total ($1.30M) because the nine new logos are not billing yet. Every other month ties within 1.0%.

### 2. NRR and GRR are enterprise-only — *subtle*
- Stated: NRR **128%**, GRR **96%**.
- All-customer cohort (VCR2): NRR **107.1%**, GRR **89.7%**. Logo retention for the 12-month cohort is **89%**.
- The 128% is real for the nine accounts with ACV ≥ $150K at the start of the period (about 129% on recurring-only MRR). It is disclosed only in definition 3 of the model summary and in the deck appendix.
- Enter the 128% in "What the company states" and VCR2 will compare it with the computed 107.1%.

### 3. Hidden concentration — *subtle*
- Stated: largest customer **<7% of ARR** ("measured by billing entity, not by parent organization", model footnote 5).
- By row, the largest customer is 6.2%. But Brookmere appears three times: *Brookmere Health System* ($80k MRR), *Brookmere Health Systems* ($74k) and *Brookmere Health System, LLC* ($54k). Combined: **$208k MRR = $2.5M ARR = 16.0% of the ledger**.
- Top-5 customers: 23% by row, **28.5%** with Brookmere merged. Top-10: **38%** merged.
- The investor update gives it away: "Brookmere rolled Quillstone out to a second and third entity."
- VCR2 flags the duplicate names; the adding-up is yours.

### 4. Burn and runway — *obvious once compared*
- Deck: net burn **$0.61M/month** and **15+ months** of runway.
- That is June 2026 only, a month with a one-time **$0.34M R&D tax-credit refund** (model note under the quarterly table). Q2 averaged $0.83M; **Q3 averaged $0.96M/month**.
- Cash is $9.4M (correct), so real runway at Q3 burn is **about 10 months** — and the company's own investor update says "roughly 10 months".
- Strategic read: they are raising with about ten months of cash, which affects your leverage.

### 5. Unit economics flattered by definitions — *subtle*
| Metric | Stated | Fully loaded / recomputed |
|---|---|---|
| Gross margin | 82% | **71%** once customer success and implementation costs ($1.26M TTM) are included |
| CAC payback | 9 months | about **22 months**: all S&M including customer success ÷ recurring-only new + expansion ARR × 71% margin |
| Burn multiple | 1.4x (Q2 burn annualized ÷ face net new ARR) | **1.85x** (TTM net burn $10.8M ÷ recurring-only net new ARR $5.85M); VCR2 shows 1.53 on the ledger as sent |
| Customers | 262 | **246** with revenue in September (16 are "in implementation", model footnote 2) |

### 6. The forecast needs a different company — *optimism*
- FY2026E ending ARR **$19.8M** means **+$4.2M net new ARR in one quarter** versus about **$1.6M** in Q3 on recurring-only numbers.
- The plan assumes **24 net new enterprise logos per quarter** from Q1 2027, versus **8** enterprise-size accounts landed in the last four quarters, plus a sales cycle that shortens by a third and no rise in churn.

### 7. Smaller flags (not all are problems)
- **Quarter-end loading:** about 60% of new-logo MRR starts in quarter-end months. Common in enterprise sales, but worth asking about discounting. VCR2 does not flag it at this level.
- **Reactivations:** four customers went dark for 2–3 months and came back (Rosemont Medical Group, Riverbend Cardiology Associates, Ridgeway Imaging Inc, Prairie Medical Group PA).
- **One negative amount:** Redwood Valley Clinics, March 2026 (-$3,200), a credit memo inside an MRR file.
- **Pilots:** five one-month customers earlier in the history (Ironbridge, Larkin, Moss Creek, Kestrel, Dunmore), $49k of one-month MRR.

## What is genuinely good

- **Real growth.** Even stripped of the September inflation, recurring ARR grew about 72% to $14.0M, steady at roughly 4% a month.
- **Real land-and-expand in enterprise.** Enterprise accounts expand about 129% on recurring-only MRR; a handful of enterprise-size logos (Cedar Valley, Northgate, Larkspur and the Brookmere entities) landed in the last year.
- **The books reconcile.** Cash rolls forward exactly each month; revenue ties to the ledger within 1.0% in 23 of 24 months; the ARR waterfall closes. The one exception (September) is explained by the contract timing in item 1.
- **Acceptable retention.** About 90% GRR and 89% logo retention for a mid-market healthcare base.
- **Disclosure.** Almost every caveat appears somewhere in the footnotes. The company frames aggressively but does not hide anything, which is different from a founder who fabricates.
- **Cash is real:** $9.4M, and the one-time tax credit is disclosed.

## One reasonable verdict (yours may differ)

Take the meeting, but **do not underwrite $15.6M**. At $14.0M recurring ARR the $150M post-money is **10.7x**, not 9.6x, and the company has about ten months of cash. A defensible response: ask for the nine September contracts and go-live dates, a recurring-only ARR restatement, all-customer NRR/GRR, fully loaded CAC, a customer call with Brookmere (16% of ARR across three entities), and then negotiate price or tranche the round against go-live of the September logos.

## Score yourself

- Found the September spike and what it contains (items 1): you did the minimum.
- Also found enterprise-only NRR/GRR and the Brookmere concentration (2, 3): you did what a good associate does.
- Also caught the runway cherry-pick, gross margin / CAC definitions and the forecast gap (4, 5, 6): you did what a good partner does.
