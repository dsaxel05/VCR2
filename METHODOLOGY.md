# VCR2 methodology

Rubric **4.0.0**. Everything below is implemented in `src/` and bundled into `index.html`. Where a number is a judgement rather than a derivation, this document says so.

---

## 1. Evidence model

VCR2 separates three kinds of input:

- **Primitives** — raw figures (ARR today, churned ARR, cash, S&M spend, headcount…). Anything derivable from primitives is never asked for.
- **Claims** — the headline figures exactly as the company presents them (“What the company states”). Never scored; only compared.
- **Files** — the customer revenue ledger and monthly financials, parsed locally.

Every primitive carries an **evidence tag**, weighted as follows:

| Source | Weight |
|---|---|
| Founder said so | 0.25 |
| Unverified (default) | 0.35 |
| Deck or memo | 0.45 |
| Financial model | 0.60 |
| System export | 0.85 |
| Computed from the customer ledger | 0.90 |
| Bank or billing record | 0.95 |
| Audited or reviewed | 1.00 |

A metric’s evidence is the mean weight of the inputs it is computed from. The **evidence strength** of a run is the metric-weight-averaged evidence of every scored metric.

## 2. Customer revenue ledger

**Input.** Revenue by customer by month, either wide (`customer, 2025-01, 2025-02, …`) or long (`customer, month, amount`). Month headers are parsed from ISO, `Jan 2025`, `Jan-25`, `01/2025`, day-first or month-first dates, quarters and Excel serials. Values may be MRR, ARR (divided by 12) or monthly billed revenue. Missing months inside the range are zero.

**MRR bridge.** For each customer and each month *t*, comparing MRR at *t−1* (*p*) and *t* (*v*):

| Condition | Movement |
|---|---|
| p = 0, v > 0, first ever revenue | new |
| p = 0, v > 0, had revenue before | reactivation |
| p > 0, v = 0 | churn (p) |
| p > 0, v > p | expansion (v − p) |
| p > 0, 0 < v < p | contraction (p − v) |

By construction `MRR(t) − MRR(t−1) = new + reactivation + expansion − contraction − churn` for every month (tested).

**Retention.** With *e* the last month and *b = e − 12* (or the earliest month if shorter), and *B* the customers billing at *b*:

- Cohort NRR = Σ<sub>i∈B</sub> MRR<sub>i</sub>(e) ÷ Σ<sub>i∈B</sub> MRR<sub>i</sub>(b)
- Cohort GRR = Σ<sub>i∈B</sub> min(MRR<sub>i</sub>(e), MRR<sub>i</sub>(b)) ÷ Σ<sub>i∈B</sub> MRR<sub>i</sub>(b)
- Logo retention = share of *B* still billing at *e*
- Waterfall NRR = (MRR(b) + expansion − contraction − churn over the window) ÷ MRR(b). This counts expansion of customers acquired during the window; the gap to cohort NRR is reported.

When a ledger with at least six months of look-back is present, cohort NRR, GRR and logo retention replace the waterfall approximations in scoring.

**Cohorts.** Customers are grouped by first revenue month (quarterly when the ledger is longer than 18 months). Cell (cohort, age *a*) = revenue at age *a* ÷ revenue at start, over members old enough; partially-aged cells are marked. Customers already live in the first ledger month have no known start and are excluded. Cohort-quality trend compares the older and newer halves of cohorts at month 6 (or 3), with a linear fit across cohorts.

**Concentration.** Top-1/5/10 share of current MRR and the Herfindahl–Hirschman index (Σ share², shares in %).

## 3. Forensic tests

| Test | Method | Flag |
|---|---|---|
| Final-month spike | Last month’s net new MRR vs the median of the six before it; new+reactivated MRR vs the six-month average | ≥ 3× (strong at ≥ 5×) |
| Quarter-end concentration | Share of new, reactivated and expansion MRR in Mar/Jun/Sep/Dec, last 12 months | > 50% note, > 65% flag |
| One-month customers | Customers billed for exactly one month that is not one of the last two | ≥ 3, or > 5% of new MRR |
| Duplicate customers | Names lower-cased, legal suffixes removed; exact matches and edit distance ≤ 2 (skipped above 1,500 customers) | any pair billed in the same months |
| One-off charges as MRR | A month ≥ 3× the prior month, followed by a return to within 30% | ≥ 3 customers |
| Reactivations | Reactivated ÷ (new + reactivated) MRR, last 12 months | > 10% note, > 25% flag |
| Negative entries | Customer-months below zero (treated as zero) | any |
| Growth smoothness | Coefficient of variation of month-on-month growth, last 12 months | mean > 2% and CV < 0.12 (note only, never scored) |
| Benford first digit | Leading digit of each distinct customer revenue level; mean absolute deviation vs log₁₀(1 + 1/d); chi-square on 8 d.f. | MAD > 0.015 (Nigrini nonconformity); not run below 300 values, below 1.3 orders of magnitude of spread, or when three price points hold ≥ 30% of values |

Every test is a reason to look, never evidence on its own, and the app shows each test’s limits next to its result.

## 4. Consistency checks

Stated figures are compared with computed ones. Tolerances are in percentage points (pts) or relative percent; beyond the second number the finding is **material**.

| Check | Minor beyond | Material beyond |
|---|---|---|
| Deck ARR vs financial ARR | 2% | 6% |
| ARR waterfall closes | 3% | 10% |
| NRR, GRR | 3 pts | 8 pts |
| Growth | 5 pts | 15 pts |
| Rule of 40 | 6 pts | 15 pts |
| Runway | 12% | 30% |
| Burn multiple, ACV | 18% | 45% |
| Magic number | 20% | 50% |
| CAC, CAC payback | 25% | 60% |
| LTV:CAC | 30% | 70% |
| Take rate | 8% | 25% |
| Customer count | 3% (min 1) | 10% |
| Gross margin vs hosting + support cost | 5 pts | 12 pts |
| Stated TAM vs bottom-up (accounts × ACV) | — | > 10× |
| Concentration ordering (top1 ≤ top5 ≤ top10 ≤ 100%) | — | any violation |
| Form vs customer ledger (ARR, flows, counts, concentration) | 2–10% or 1–2 pts | 6–25% or 3–6 pts |
| Form vs monthly financials (cash, burn) | 5% / 15% | 15% / 35% |
| Burn vs headcount cost, deferred revenue > ARR, aged receivables, services share, cash > equity raised | structural flags | aged receivables > 18% of ARR |

**Optimism test.** Each discrepancy is marked as flattering the company or not (e.g. a stated NRR above the computed one flatters; a stated CAC below the computed one flatters). With *n* discrepancies of which *k* flatter, *p* = P(X ≥ k) for X ~ Binomial(n, ½). Significant when *n* ≥ 4 and *p* < 0.05.

## 5. Scoring

Each metric is mapped onto four stage-specific anchors `[poor, acceptable, good, excellent]` → `[0, 45, 72, 100]` with linear interpolation (reversed for lower-is-better metrics). Metrics are weighted inside six dimensions — revenue quality, capital efficiency, go-to-market, team, market & moat, governance & technical risk — and dimensions are combined at stage weights (e.g. Series A: revenue 26%, capital 20%, go-to-market 18%, team 14%, market 12%, governance 10%). A dimension below 50% coverage carries proportionally less than its full weight. Booleans adjust a dimension by at most ±15. Business-model metrics (AI inference share, GMV growth, loss rate…) are scored only for their model.

**Withheld metrics.** Retention below 20 customers a year ago, unit economics below 10 new customers, growth off less than $100k of opening ARR, magic number below $1M ARR, ARR per employee below 5 people, quota attainment below 3 reps.

**Gates.** Incomplete IP assignments, possible contractor IP rights, a broken chain of title, an undocumented cap table, or three or more material contradictions. A gate withholds the headline score; the analysis still runs.

**Confidence band.** Half-width = clamp(3 + 20 × (1 − coverage) + 3 × material contradictions + 12 × (1 − evidence strength), 3, 32). Confidence is HIGH at ≥ 75% coverage, no material contradictions and evidence ≥ 0.70; MEDIUM at ≥ 45%, ≤ 1 contradiction and evidence ≥ 0.45; otherwise LOW.

**Sensitivity.** Each numeric input is moved ±15% and the score recomputed (tornado). “What would need to be true” lifts the weakest scored metrics to the *good* bar one at a time, largest gain first, until the score reaches 70.

**Reproducibility.** The run hash covers the rubric version (including any calibration signature), stage, model, every input, every evidence tag, and the ledger and financials fingerprints.

## 6. Projections

**Starting point.** Monthly revenue from the financials, else the ledger, else ARR ÷ 12. Expenses = net burn + revenue. Growth *g* = 6-month CMGR (else 3-month, else YoY converted to monthly). Expense growth from the financials, else headcount growth, else flat. Volatility = standard deviation of month-on-month growth over the last 12 months, else half the growth rate. All are shown and editable.

**Default alive.** Constant *g* and expense growth, no new money: alive if revenue overtakes expenses before cash goes below zero. When dead, the extra capital needed to reach breakeven at that pace is reported.

**Monte Carlo.** 4,000 paths over 36 months (editable). Each month *t*: growth = g × (1 − decay)ᵗ + σ·z with z ~ N(0, 1), floored at −35%; expenses grow at their rate plus noise; cash falls by expenses − revenue. Reported: probability of reaching the next-stage ARR bar (pre-seed → $250k, seed → $2M, Series A → $10M, Series B → 2× current, editable) before cash-out, and with six months of runway left; probability of cash-out first; breakeven probability; runway percentiles; and the capital needed to reach the bar with six months of buffer at the 50th and 80th percentiles across *all* paths (paths that never reach the bar count as needing more than any amount). The random stream is seeded from the run hash (mulberry32), so results are reproducible.

## 7. Deal maths

Conventions: the headline pre-money includes the SAFE conversion and any option-pool top-up; SAFEs convert as post-money SAFEs at min(cap, pre × (1 − discount)); all preferred series are pari passu; debt is senior.

- Post-money P = pre + round
- SAFE stake (post) = SAFE amount ÷ conversion valuation × pre ÷ P
- Pool top-up *t* solves (X − t)·p + t = target, with X the existing holders’ block and *p* the existing pool share
- Effective pre-money = pre − (top-up + SAFE stake) × P
- Ownership at exit = cheque ÷ P × (1 − dilution)<sup>future rounds</sup>
- Exit to return the fund = fund size ÷ ownership at exit; ARR required = that exit ÷ your exit multiple, compared with the bottom-up TAM (> 30% is flagged as implausible)

**Waterfall.** Debt is paid first. Preferred classes take their preference pro rata to preference amounts if the remainder does not cover them; otherwise non-participating classes convert one at a time — largest gain first — whenever converting beats the preference, and participating classes take their preference plus their share of the residual.

## 8. Patterns

Compound rules over several metrics — never a single metric. Risk examples: bought growth (paid share > 50% and CAC payback > 24 months), leaky bucket (GRR < 80% with new ARR > 40% of opening ARR), NRR inflated by new customers (waterfall − cohort NRR > 5 pts), services business (> 20% services and GM < 62%), fragile concentration (top-5 > 45% or top-1 > 15% with < 50% annual contracts), window dressing (final-month spike, amplified 12+ months after the last round), runway cliff (< 12 months), hiring ahead of revenue, discounted wins, enterprise cycle at SMB price, AI inference-margin trap, SAFE-plus-pool overhang, default dead, low simulated odds, cohort decay, fund-returner implausibility, key-person risk, subsidised marketplace liquidity, fintech losses with fast volume growth, partner-bank findings, shelfware expansion, stage mismatch. Strength examples: efficient compounding growth, capital-light growth, default alive, funded to the next stage, improving cohorts, fully reconciled books.

## 9. Library and calibration

The library stores saved runs and imported comparables in the browser. CSV headers are matched by synonym; ratios quoted as multiples (1.15) become percentages. AI import asks the chosen model for one row per company with a quote for every value, then shows every row for review before saving.

**Percentiles** compare each metric with same-stage deals (falling back to all stages) once five comparables exist, flipped for lower-is-better metrics.

**Calibration** (opt-in) replaces a metric’s stage anchors with your library’s 15th / 45th / 72nd / 92nd percentiles (8th / 45th / 72nd / 95th for lower-is-better) once eight companies at that stage report it, so a score near 72 means “better than about 72% of the deals you have seen”. The rubric version gains a calibration signature, so calibrated runs stay reproducible.

## 10. Deal: notes, terms and returns

**Convertible notes** accrue simple interest (principal × (1 + rate × years outstanding)) and convert on the pre-money at the lower of the cap and the discounted round price. Their slice of the pre-money block is accrued ÷ (conversion valuation + accrued), which, like SAFE conversion and any pool top-up, lowers the effective pre-money.

**Capped participation.** A participating class takes its preference and a pro-rata share of the residual until its total reaches the cap; the excess is redistributed to the other participants and common. Every non-participating class, and every capped participating class, takes the better of staying preferred or converting; each candidate conversion is evaluated exactly, one class at a time, until no class gains by switching.

**Term-sheet review** compares each entered term with the market-standard version in the NVCA model documents and the YC Series A template — 1x non-participating preference, broad-based weighted-average anti-dilution, non-cumulative dividends, no redemption at early stage, pro-rata and information rights for major investors — and marks it market, watch or off-market with the reason.

**Exit scenarios.** Three cases: downside, base and upside. Unless entered, the base and upside ARR at exit grow today's ARR at today's growth rate (capped at 300%), with growth decaying 30% a year in the base case and 15% in the upside ("if it works") case, floored at 5% and 10%; the downside is a sale at 1× today's ARR. Base and upside use ownership after future dilution, as converted, at the exit multiple you underwrite; the downside runs through the entry waterfall over half the horizon. Default probabilities by stage (pre-seed 65/25/10, seed 60/28/12, Series A 45/40/15, Series B+ 30/50/20) lean on the downside, as venture outcomes do; all are editable assumptions, not market statistics.

- **VC Method** (Sahlman): post-money justified = success-case exit value × ownership kept to exit ÷ (1 + target return)^years. The target return (defaults 60/50/40/30% by stage) is high because it carries the risk of failure.
- **First Chicago**: Σ probability × case exit value (× ownership kept, for base and upside) ÷ (1 + rate)^years, at a lower rate (default 25%) because failure is now in the probabilities.
- Multiple = proceeds ÷ cheque; IRR = multiple^(1 / years) − 1; the probability-weighted multiple is Σ probability × multiple.

**Burn.** With gross burn entered, runway if revenue stopped = cash ÷ gross burn, and a consistency check tests gross burn − ARR ÷ 12 against the stated net burn (net above gross is impossible and material; a gap above 12% of gross spend is minor, since annual prepayments move cash receipts).

**Product-market fit and team.** The Sean Ellis survey share ("very disappointed") is scored in Market & moat with anchors 15 / 30 / 40 / 55% and withheld below 30 responses; NPS with anchors 0 / 20 / 40 / 60; how essential the product is as a categorical metric; years the founders have worked together in Team at pre-seed and seed. Unpaid taxes are a gate; commingled funds and a missing 409A adjust Governance.

## 11. Risk map and diligence checklist

Every gate, red and amber pattern, material contradiction, flagged forensic test and relevant yes/no input is assigned to one of six risk types — product, market & timing, execution & team, financial & reporting, legal & regulatory, deal & structure — and shown on the overview and in the memo.

The diligence checklist has about 60 items in ten categories, each applying from a stage onwards, compiled from common VC and startup-accountant practice. Items tied to an input or an uploaded file pre-fill their status (for example, a loaded customer ledger marks the revenue export as received; commingled funds mark the bank-account item as an issue). Statuses set by hand always win, are saved with the assessment and exported with it, and never affect the score.

## 12. Owner configuration

The owner can extend or narrow the engine from the Studio ([STUDIO.md](STUDIO.md)); the result is `radar-config.json`, loaded by every visitor at startup and validated entry by entry.

**Order of application.** Built-in defaults are captured once when the page loads, and every configuration is applied on top of those defaults, so previewing, publishing and discarding never leave residue. Hidden fields — directly or through their section — read as empty everywhere, so they cannot feed a derivation, a check or a score. Custom names can never shadow a built-in field or metric.

**Custom metrics** are evaluated after all built-in derivations, in dependency order, each exactly once; a metric that depends on itself (directly or through others) is “no data”. A scored custom metric uses the same interpolation as built-in metrics: four ascending anchors per stage scoring 0 / 45 / 72 / 100 (100 / 55 / 28 / 0 when lower is better), weighted inside its dimension. Custom checks compare a stated field with a formula using the owner's tolerances (percent or points), feed the binomial optimism test through their “flatters the company” direction, and count towards the blocking threshold when material.

**Overrides of built-in rules.** Every built-in number in this document that is a judgement rather than arithmetic can be replaced by the owner, and the replacement is used everywhere the built-in was: the healthy ranges and weights of every scored metric; the score of each answer to a choice question and its weight; the points of each yes/no answer (the ±15 cap per dimension still applies); dimension weights by stage; the exit, deal and simulation defaults used when a field is blank, the stage ARR ranges and the evidence-source weights (§ 10–11, § 5); the trigger values of every built-in pattern and of the term-sheet norms (§ 8); and the minor and material tolerances of each built-in consistency check (§ 3; the material tolerance is never below the minor one). The owner can also add deal-breakers — conditions that withhold the score like the built-in gates — and publish external benchmarks, which are shown against the company by quartile (for lower-is-better metrics, a lower value ranks higher) but never change the score. The figures quoted in this document are the built-in values; a report's rubric version tells you whether the owner has changed any that affect scores.

**Formula semantics.** Arithmetic on a missing value is missing; division by zero is missing; comparisons with a missing side are missing; `and`, `or` and `not` follow three-valued logic (`missing and false` is false, `missing or true` is true, otherwise missing); a question, request or pattern fires only when its condition is true. `has(x)` and `coalesce(…)` are the only ways to act on missing data deliberately.

**Reproducibility.** A signature of everything in the configuration that can change a score — hidden items, thresholds, weights, answer scores and yes/no points, sample-size and blocking settings, check tolerances, deal-breakers, evidence weights, custom metrics and checks — is appended to the rubric version (`4.0.0+cfg.3f9a2c`), and to the run hash through it. It is computed on a canonical form, so the order in which things were edited does not matter. Texts, renamed labels, pattern triggers, deal defaults and benchmarks do not change a score and do not change the signature.
