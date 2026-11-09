# Smart fill results

## Baseline (before Smart fill), 2026-11-09, commit 248b847, set dev (seed 7)

Measured by `node tests/smartfill/run.mjs --baseline`: the corpus is 138 documents (pptx 6, xlsx 17, eml 6, pdf 26, md 14, docx 9, xlsm 6, csv 14, txt 7, tsv 6, odt 6, ods 6, json 4, rtf 4, html 4, htm 3) and 32 adversarial files. Without AI, today's app fills form fields only from the customer ledger. The narrative drop zone accepts 64 of the 138 files but only keeps their text for the optional AI extraction.

| Document type | Documents | Gold fields | Filled by today's app (no AI) | Accepted by today's drop zone |
|---|---|---|---|---|
| model | 24 | 336 | 0 (0.0%) | 15 |
| deck | 24 | 180 | 0 (0.0%) | 6 |
| termsheet | 12 | 145 | 0 (0.0%) | 3 |
| security | 10 | 100 | 0 (0.0%) | 2 |
| update | 16 | 92 | 0 (0.0%) | 4 |
| captable | 12 | 74 | 0 (0.0%) | 10 |
| ledger | 6 | 72 | 72 (100.0%) | 6 |
| market | 7 | 63 | 0 (0.0%) | 3 |
| crm | 5 | 20 | 0 (0.0%) | 5 |
| headcount | 5 | 20 | 0 (0.0%) | 4 |
| json | 4 | 20 | 0 (0.0%) | 0 |
| receivables | 4 | 8 | 0 (0.0%) | 3 |
| bank | 6 | 6 | 0 (0.0%) | 2 |
| audited | 3 | 3 | 0 (0.0%) | 1 |
| **All** | **138** | **1139** | **72 (6.3%)** | **64** |
