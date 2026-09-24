# VCR2: VC Risk Radar

**Evidence-first diligence engine for early-stage investors. VCR2 recomputes every headline startup metric from its primitives and shows exactly where the stated figures disagree with the arithmetic.**

[![Live demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](https://dsaxel05.github.io/VCR2/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20JS-f7df1e?style=flat-square)](#tech-stack)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](#tech-stack)

### [Try the live demo →](https://dsaxel05.github.io/VCR2/)

<p align="center">
  <img src="docs/screenshot-verification.png" alt="VCR2 blocking a sample assessment after finding 6 material contradictions between stated and computed figures" width="900">
</p>

<table>
  <tr>
    <td><img src="docs/screenshot-intro.png" alt="VCR2 intro screen"></td>
    <td><img src="docs/screenshot-inputs.png" alt="Metrics computed live from raw inputs"></td>
  </tr>
</table>

> Click **"Load a worked example"** on the intro screen to watch VCR2 audit a fictional company (Northwind Data). It catches a deck that states 134% NRR when the underlying figures give 104.2%, and it refuses to score the data pack. No account and no API key needed.

---

## The problem

Founders send investors a deck, a model, and an update. The headline numbers in those documents (NRR, CAC payback, runway, Rule of 40) are frequently stated, not derived, and they often don't reconcile with the founder's own raw figures. A deck that says **134% NRR** while the ARR waterfall implies **118%** is the single most common diligence catch, and it's also the easiest to miss on a first read.

## What VCR2 does

VCR2 asks for the raw inputs only (ARR movements, spend, headcount, cash), computes every derivable metric itself, and then compares the results against what the company *states*.

| | |
|---|---|
| **21 derived metrics** | Computed from primitives. You never type in an NRR or a CAC. |
| **18 consistency checks** | Stated vs. computed, plus cross-checks such as implied gross margin vs. stated margin and implied burn vs. reported burn. |
| **4 stage rubrics** | Pre-seed, Seed, Series A and Series B+ each have their own thresholds and dimension weights. |
| **0 black boxes** | Every score is traceable to a formula, an input and a threshold. |

**Output is a question list, not a verdict**: a ranked set of what to verify in the data room, what to negotiate, and what to make a closing condition.

## Key design decisions

- **Refuses to score bad data.** If headline figures disagree with the arithmetic behind them, the assessment is blocked and only the findings are shown, because a score built on numbers that don't reconcile is worse than no score.
- **Deterministic and reproducible.** Every run carries a rubric version (`3.0.0`) and an input hash, so the same inputs produce the same score today and nine months later at the investment committee.
- **Stage-calibrated.** A seed company is not graded against Series B thresholds. Retention metrics are suppressed below the customer count where they carry signal.
- **Provenance on every field.** Values extracted from pasted documents keep the line of source text they came from, so any number can be traced back without reopening the data room.
- **Nothing derivable is asked.** Runway, burn multiple and payback are computed, never entered.
- **Human in the loop.** Extracted values are pre-filled but every one is reviewed and corrected by the user before scoring.

## How the metrics are computed

A selection of the formulas implemented in the engine:

| Metric | Formula |
|---|---|
| Net revenue retention (NRR) | (opening ARR + expansion − churn − contraction) ÷ opening ARR |
| Gross revenue retention (GRR) | (opening ARR − churn − contraction) ÷ opening ARR |
| Quick ratio | (new + expansion) ÷ (churned + contraction) |
| Burn multiple | annualised net burn ÷ net new ARR |
| Runway | cash ÷ net monthly burn |
| Rule of 40 | ARR growth % + FCF margin % |
| CAC | S&M spend ÷ new customers won |
| CAC payback | CAC ÷ monthly gross profit per customer |
| LTV:CAC | (annual gross profit per customer ÷ logo churn) ÷ CAC |
| Magic number | annualised quarterly net new ARR ÷ prior-quarter S&M |
| ARR per FTE | ARR ÷ headcount |
| SAFE overhang | unconverted SAFEs ÷ pre-money valuation |
| Bottom-up TAM | ICP account count × realised ACV |

Also computed: YoY growth, net new ARR, logo churn and retention, ACV, hype ratio (equity raised ÷ ARR), headcount efficiency, engineering turnover, implied gross margin, implied burn, receivables over 90 days, and market penetration.

## Assessment flow

1. **Setup:** company, stage, business model and data date.
2. **Intake (optional):** paste a deck, memo or financials and extract figures with an LLM, or skip and enter them by hand.
3. **Six input sections:** Revenue & retention, Capital & burn, Customers & go-to-market, Team, Market & competition, and Governance, cap table & technical risk. A seventh section captures **what the company states**.
4. **Verification:** review every value before anything is scored.
5. **Result:** if the data pack reconciles, a stage-calibrated score. If it doesn't, the score is withheld and VCR2 shows the findings and a ranked diligence question list instead.

## Privacy and security

- The derivations, the checks and the score all run **entirely in your browser**. Nothing is sent anywhere.
- The only network call is the optional **extraction** step, which sends the pasted text to the model provider *you* choose (Anthropic, OpenAI, Gemini, Groq or OpenRouter) using *your own* API key.
- The API key is stored in your browser's `localStorage` and is sent only to the chosen provider. There is no VCR2 server.
- Use a restricted, low-spend key, and don't paste confidential data-room material into a provider you haven't cleared for it.

## Run it locally

No build step and no dependencies.

```bash
git clone https://github.com/dsaxel05/VCR2.git
cd VCR2
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` in a browser.

## Tech stack

Vanilla HTML, CSS and JavaScript in a single file. No framework, no build tooling, no runtime dependencies. Fonts load from Google Fonts.

## Roadmap

- [ ] Export the assessment as a PDF or IC memo
- [ ] Split the single file into `styles.css` and modular JS
- [ ] Unit tests for the metric engine
- [ ] Additional business-model templates (marketplace, fintech)
- [ ] Side-by-side comparison of two assessments

## Disclaimer

VCR2 is a workflow tool for educational purposes. It does not provide investment advice, and its score is not a recommendation to buy or sell any security.

## Author

Built by **Axel De Sousa**, Finance and AI Analysis at Menlo College.
[GitHub](https://github.com/dsaxel05) · [LinkedIn](https://www.linkedin.com/in/axeldesousa)
## License

[MIT](LICENSE) © 2026 Axel De Sousa
