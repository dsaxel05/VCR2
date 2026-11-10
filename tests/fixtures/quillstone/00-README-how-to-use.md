# How to use this practice data room
> **FICTIONAL TRAINING DATA ROOM.** Quillstone Health, Inc. is an invented company created to practice investment diligence. Every name, number and person here is made up; any resemblance to a real company is a coincidence.

**Scenario.** Quillstone Health is raising a $30M Series B at $120M pre-money. Their materials arrive the way real ones do: a deck, a financial-model summary, a monthly investor update, a customer-by-month revenue ledger, and monthly financials. You are the investor deciding whether to take a meeting, ask for a term sheet, or pass.

**What's in the folder**
| File | What it is |
|---|---|
| `01-pitch-deck.md` | The company's pitch, as text |
| `02-financial-model-summary.md` | Historical results, definitions, forecast, round terms |
| `03-investor-update-2026-09.md` | The latest update sent to existing investors |
| `04-customer-ledger.csv` | Monthly MRR per customer, Oct 2024 – Sep 2026 (the format VCR2 reads) |
| `05-monthly-financials.csv` | Month, revenue, cash, burn, expenses, headcount |
| `ANSWER-KEY.md` | **Do not open until you have run VCR2.** Lists every planted problem and strength |

**How to run it in VCR2** (https://vcr2.app)
1. Click *Start an assessment*, choose stage **Series B+** and model **B2B SaaS**, enter a company name, continue.
2. On the source-material page, drop `04-customer-ledger.csv` in the *Customer revenue ledger* box (values are MRR) and `05-monthly-financials.csv` in *Monthly financials*. Click *Fill the form from the ledger*, then *Continue to the evidence form*.
3. The deck, model and update are plain text. Either paste them into the narrative boxes and use *Extract figures with AI* (your own key, optional), or type the headline claims yourself into the **What the company states** section. The headline claims are:

| Claim (as the company states it) | Value |
|---|---|
| ARR | $15,600,000 |
| Growth rate | 91% |
| Runway | 15 months |
| Customer count | 262 |
| Net revenue retention | 128% |
| Gross revenue retention | 96% |
| Gross margin | 82% |
| CAC payback | 9 months |
| Burn multiple | 1.4 |
| Largest customer | under 7% of ARR |

4. Open *Verification & report*. Note what is flagged, what is inconsistent, and what VCR2 cannot test from the files (anything in the footnotes, the forecast, the definitions).
5. Read the three text documents yourself, especially the appendix and footnotes.
6. Write down your own verdict (meeting / term sheet / pass, and at what price) *before* opening the answer key.

Everything is synthetic. Do not rely on any figure here for a real decision.
