# Smart fill results

<!-- readers -->
## Readers (P2), 2026-11-09

Every corpus document read by `sfReadFile` under Node (HTML is read by the browser's DOMParser and is checked in `tests/browser/smartfill_readers_test.py`, 55/55).

| Format | Documents | Read | Producers |
|---|---|---|---|
| csv | 13 | 13 | python-csv |
| docx | 7 | 7 | python-docx, hand-built |
| eml | 6 | 6 | python-email, hand-built |
| json | 7 | 7 | python-json, python-json-b |
| md | 15 | 15 | template, template-b |
| ods | 9 | 9 | hand-built, odfpy |
| odt | 6 | 6 | hand-built, odfpy |
| pdf | 23 | 23 | reportlab, chromium |
| pptx | 6 | 6 | python-pptx, hand-built |
| rtf | 6 | 6 | hand-built |
| tsv | 6 | 6 | python-csv |
| txt | 7 | 7 | template, template-b |
| xlsm | 6 | 6 | hand-built |
| xlsx | 15 | 15 | openpyxl, hand-built |

Time per document: median 1 ms, 95th percentile 6 ms, slowest 21 ms. Hostile files: 32, every one with its expected outcome (tests/smartfill-readers.test.mjs and the browser suite).
<!-- /readers -->

<!-- engine-dev -->
## Engine, set dev (seed 7), 2026-11-10, commit 7250506

140 documents (8 HTML read in Chromium). Codes: R1 unknown label or not found, R2 wrong period or value, R3 decoy filled, R4 unit or scale, R5 reader failure, R6 structure or extra field, R7 right value at too low a tier.

| Measure | Measured | Target (dev) |
|---|---|---|
| High-tier precision | 588/588 (100.0%) | 98% or better |
| Medium-tier precision | 405/405 (100.0%) | 90% or better |
| Recall (High and Medium, plus Low where the gold is Low) | 1058/1072 (98.7%) | 92% clean, 75% messy |
| Decoys filled (must_not_fill) | 0 of 1077 proposals | 0.5% or less |
| Wrong values per 100 High fields | 0.0 | 1 or less |
| Ledgers recognised | 6/6 | all |
| Same proposals in reverse order | yes | yes |
| Time per document (read and extract) | median 4 ms, 95th percentile 11 ms | 400 ms, 1.5 s |
| Requests to any other site (HTML in Chromium) | 0 | 0 |

Failures by code: {"R1":1}

### Tier reliability

| Predicted tier | Proposals | Correct | Observed precision |
|---|---|---|---|
| High | 588 | 588 | 100.0% |
| Medium | 405 | 405 | 100.0% |
| Low | 84 | 65 | 77.4% |

### By format

| Format | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| csv | 67 | 67 (100.0%) | 0 |
| docx | 65 | 65 (100.0%) | 0 |
| eml | 40 | 40 (100.0%) | 0 |
| htm | 16 | 16 (100.0%) | 0 |
| html | 50 | 50 (100.0%) | 0 |
| json | 35 | 35 (100.0%) | 0 |
| md | 102 | 102 (100.0%) | 0 |
| ods | 106 | 106 (100.0%) | 0 |
| odt | 52 | 52 (100.0%) | 0 |
| pdf | 182 | 181 (99.5%) | 0 |
| pptx | 44 | 44 (100.0%) | 0 |
| rtf | 57 | 57 (100.0%) | 0 |
| tsv | 24 | 24 (100.0%) | 0 |
| txt | 57 | 57 (100.0%) | 0 |
| xlsm | 23 | 23 (100.0%) | 0 |
| xlsx | 152 | 139 (91.4%) | 0 |

### By document type

| Type | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| audited | 3 | 3 (100.0%) | 0 |
| bank | 6 | 6 (100.0%) | 0 |
| captable | 74 | 74 (100.0%) | 0 |
| crm | 20 | 20 (100.0%) | 0 |
| deck | 180 | 179 (99.4%) | 0 |
| headcount | 20 | 20 (100.0%) | 0 |
| json | 35 | 35 (100.0%) | 0 |
| market | 63 | 63 (100.0%) | 0 |
| model | 336 | 323 (96.1%) | 0 |
| receivables | 8 | 8 (100.0%) | 0 |
| security | 90 | 90 (100.0%) | 0 |
| termsheet | 145 | 145 (100.0%) | 0 |
| update | 92 | 92 (100.0%) | 0 |

### By field family (form section)

| Section | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| capital | 134 | 131 (97.8%) | 0 |
| claims | 160 | 159 (99.4%) | 0 |
| deal | 199 | 199 (100.0%) | 0 |
| govern | 105 | 105 (100.0%) | 0 |
| gtm | 58 | 57 (98.3%) | 0 |
| market | 87 | 87 (100.0%) | 0 |
| revenue | 269 | 260 (96.7%) | 0 |
| team | 60 | 60 (100.0%) | 0 |

### By mutation (fuzz set: shuffle and decoys, European numbers, unseen synonyms)

| Mutation | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| base | 1072 | 1058 (98.7%) | 0 |

### By trap

| Trap (documents that carry it) | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| ageing buckets | 8 | 8 (100.0%) | 0 |
| competitor or market figure | 180 | 179 (99.4%) | 0 |
| footnote that changes a definition | 180 | 179 (99.4%) | 0 |
| forecast or plan columns | 336 | 323 (96.1%) | 0 |
| granted versus unallocated pool | 74 | 74 (100.0%) | 0 |
| gross versus net burn | 428 | 415 (97.0%) | 0 |
| hidden stale sheet | 336 | 323 (96.1%) | 0 |
| including clauses | 145 | 145 (100.0%) | 0 |
| industry benchmark | 63 | 63 (100.0%) | 0 |
| margin with and without customer success | 336 | 323 (96.1%) | 0 |
| negation | 90 | 90 (100.0%) | 0 |
| negatives in parentheses | 336 | 323 (96.1%) | 0 |
| net new versus new-logo ARR | 336 | 323 (96.1%) | 0 |
| older period | 3 | 3 (100.0%) | 0 |
| opening balance | 6 | 6 (100.0%) | 0 |
| prior-year column | 336 | 323 (96.1%) | 0 |
| prior-year figure in a sentence | 92 | 92 (100.0%) | 0 |
| restricted cash | 6 | 6 (100.0%) | 0 |
| rounding ($15.6M) | 180 | 179 (99.4%) | 0 |
| target or goal | 272 | 271 (99.6%) | 0 |
| thousands scale row | 336 | 323 (96.1%) | 0 |

### By layout (where the value was found)

| Layout | Proposals | Wrong at High or Medium |
|---|---|---|
| clause | 148 | 0 |
| computed | 57 | 0 |
| kv | 317 | 0 |
| sentence | 70 | 0 |
| table | 422 | 0 |
| tile | 63 | 0 |

### The 20 worst failures

| Code | File | Field | Detail |
|---|---|---|---|
| R1 | c01-merpax-health/deck-final-v7.pdf | stated_arr | not proposed (gold 500000, Medium, at slide 2) |
<!-- /engine-dev -->

<!-- baseline-dev -->
## Baseline (before Smart fill), 2026-11-09, commit c6974c2, set dev (seed 7)

Without AI, today's app fills form fields only from the customer ledger.

| Document type | Documents | Gold fields | Filled by today's app (no AI) | Accepted by today's drop zone |
|---|---|---|---|---|
| model | 24 | 336 | 0 (0.0%) | 12 |
| deck | 24 | 180 | 0 (0.0%) | 8 |
| termsheet | 12 | 145 | 0 (0.0%) | 3 |
| update | 16 | 92 | 0 (0.0%) | 4 |
| security | 9 | 90 | 0 (0.0%) | 1 |
| captable | 12 | 74 | 0 (0.0%) | 10 |
| ledger | 6 | 72 | 72 (100.0%) | 6 |
| market | 7 | 63 | 0 (0.0%) | 3 |
| json | 7 | 35 | 0 (0.0%) | 0 |
| crm | 5 | 20 | 0 (0.0%) | 5 |
| headcount | 5 | 20 | 0 (0.0%) | 4 |
| receivables | 4 | 8 | 0 (0.0%) | 3 |
| bank | 6 | 6 | 0 (0.0%) | 2 |
| audited | 3 | 3 | 0 (0.0%) | 1 |
| **All** | **140** | **1144** | **72 (6.3%)** | **62** |
<!-- /baseline-dev -->

<!-- engine-fuzz -->
## Engine, set fuzz (seed 7), 2026-11-10, commit 48fd8f7

394 documents (24 HTML read in Chromium). Codes: R1 unknown label or not found, R2 wrong period or value, R3 decoy filled, R4 unit or scale, R5 reader failure, R6 structure or extra field, R7 right value at too low a tier.

| Measure | Measured | Target (dev) |
|---|---|---|
| High-tier precision | 1252/1252 (100.0%) | 98% or better |
| Medium-tier precision | 1283/1283 (100.0%) | 90% or better |
| Recall (High and Medium, plus Low where the gold is Low) | 2681/3146 (85.2%) | 92% clean, 75% messy |
| Decoys filled (must_not_fill) | 0 of 2726 proposals | 0.5% or less |
| Wrong values per 100 High fields | 0.0 | 1 or less |
| Ledgers recognised | 6/6 | all |
| Same proposals in reverse order | yes | yes |
| Time per document (read and extract) | median 6 ms, 95th percentile 15 ms | 400 ms, 1.5 s |
| Requests to any other site (HTML in Chromium) | 0 | 0 |

Failures by code: {"R1":438}

### Tier reliability

| Predicted tier | Proposals | Correct | Observed precision |
|---|---|---|---|
| High | 1252 | 1252 | 100.0% |
| Medium | 1283 | 1283 | 100.0% |
| Low | 191 | 146 | 76.4% |

### By format

| Format | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| csv | 205 | 143 (69.8%) | 0 |
| docx | 167 | 157 (94.0%) | 0 |
| eml | 111 | 96 (86.5%) | 0 |
| htm | 48 | 48 (100.0%) | 0 |
| html | 156 | 153 (98.1%) | 0 |
| json | 35 | 35 (100.0%) | 0 |
| md | 274 | 261 (95.3%) | 0 |
| ods | 306 | 228 (74.5%) | 0 |
| odt | 185 | 169 (91.4%) | 0 |
| pdf | 554 | 457 (82.5%) | 0 |
| pptx | 132 | 131 (99.2%) | 0 |
| rtf | 173 | 164 (94.8%) | 0 |
| tsv | 81 | 81 (100.0%) | 0 |
| txt | 197 | 186 (94.4%) | 0 |
| xlsm | 69 | 69 (100.0%) | 0 |
| xlsx | 453 | 303 (66.9%) | 0 |

### By document type

| Type | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| audited | 9 | 9 (100.0%) | 0 |
| bank | 18 | 18 (100.0%) | 0 |
| captable | 222 | 212 (95.5%) | 0 |
| crm | 60 | 40 (66.7%) | 0 |
| deck | 540 | 539 (99.8%) | 0 |
| headcount | 60 | 60 (100.0%) | 0 |
| json | 35 | 35 (100.0%) | 0 |
| market | 189 | 168 (88.9%) | 0 |
| model | 1008 | 669 (66.4%) | 0 |
| receivables | 24 | 24 (100.0%) | 0 |
| security | 270 | 261 (96.7%) | 0 |
| termsheet | 435 | 406 (93.3%) | 0 |
| update | 276 | 240 (87.0%) | 0 |

### By field family (form section)

| Section | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| capital | 402 | 285 (70.9%) | 0 |
| claims | 480 | 479 (99.8%) | 0 |
| deal | 597 | 561 (94.0%) | 0 |
| govern | 315 | 306 (97.1%) | 0 |
| gtm | 146 | 100 (68.5%) | 0 |
| market | 261 | 240 (92.0%) | 0 |
| revenue | 765 | 530 (69.3%) | 0 |
| team | 180 | 180 (100.0%) | 0 |

### By mutation (fuzz set: shuffle and decoys, European numbers, unseen synonyms)

| Mutation | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| base | 35 | 35 (100.0%) | 0 |
| locale | 1037 | 1010 (97.4%) | 0 |
| shuffle | 1037 | 1023 (98.6%) | 0 |
| unseen | 1037 | 613 (59.1%) | 0 |

### By trap

| Trap (documents that carry it) | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| ageing buckets | 24 | 24 (100.0%) | 0 |
| competitor or market figure | 540 | 539 (99.8%) | 0 |
| footnote that changes a definition | 540 | 539 (99.8%) | 0 |
| forecast or plan columns | 1008 | 669 (66.4%) | 0 |
| granted versus unallocated pool | 222 | 212 (95.5%) | 0 |
| gross versus net burn | 1284 | 909 (70.8%) | 0 |
| hidden stale sheet | 1008 | 669 (66.4%) | 0 |
| including clauses | 435 | 406 (93.3%) | 0 |
| industry benchmark | 189 | 168 (88.9%) | 0 |
| margin with and without customer success | 1008 | 669 (66.4%) | 0 |
| negation | 270 | 261 (96.7%) | 0 |
| negatives in parentheses | 1008 | 669 (66.4%) | 0 |
| net new versus new-logo ARR | 1008 | 669 (66.4%) | 0 |
| older period | 9 | 9 (100.0%) | 0 |
| opening balance | 18 | 18 (100.0%) | 0 |
| prior-year column | 1008 | 669 (66.4%) | 0 |
| prior-year figure in a sentence | 276 | 240 (87.0%) | 0 |
| restricted cash | 18 | 18 (100.0%) | 0 |
| rounding ($15.6M) | 540 | 539 (99.8%) | 0 |
| target or goal | 816 | 779 (95.5%) | 0 |
| thousands scale row | 1008 | 669 (66.4%) | 0 |

### By layout (where the value was found)

| Layout | Proposals | Wrong at High or Medium |
|---|---|---|
| clause | 444 | 0 |
| computed | 171 | 0 |
| kv | 806 | 0 |
| sentence | 205 | 0 |
| table | 915 | 0 |
| tile | 185 | 0 |

### The 20 worst failures

| Code | File | Field | Detail |
|---|---|---|---|
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | arr_now | not proposed (gold 375000, High, at ARR bridge!C8) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | arr_12mo | not proposed (gold 217000, High, at ARR bridge!C3) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | new_arr_l12 | not proposed (gold 161000, High, at ARR bridge!C4) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | expansion_arr_l12 | not proposed (gold 20000, High, at ARR bridge!C5) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | churned_arr_l12 | not proposed (gold 18000, High, at ARR bridge!C6) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | contraction_arr_l12 | not proposed (gold 5000, High, at ARR bridge!C7) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | cogs_hosting | not proposed (gold 67000, High, at P&L!C5) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | sm_spend_l12 | not proposed (gold 135000, High, at P&L!C7) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | net_burn | not proposed (gold 145000, High, at P&L!C8) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | gross_burn | not proposed (gold 168000, High, at P&L!C9) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | deferred_revenue | not proposed (gold 54000, High, at P&L!C10) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | cash_on_hand | not proposed (gold 1581000, High, at P&L!C11) |
| R1 | c00-sollum-cloud/p-and-l-arr-bridge-unseen.csv | gross_margin | not proposed (gold 70.2, High, at P&L!C3) |
| R1 | c00-sollum-cloud/Monthly_Update-unseen.txt | cash_on_hand | not proposed (gold 1581000, Medium, at line 3) |
| R1 | c00-sollum-cloud/Monthly_Update-unseen.txt | net_burn | not proposed (gold 145000, Medium, at line 4) |
| R1 | c00-sollum-cloud/Monthly_Update-unseen.txt | gross_burn | not proposed (gold 168000, Medium, at line 5) |
| R1 | c00-sollum-cloud/Capitalization-locale.csv | safes_outstanding | not proposed (gold 1010000, High, at SAFEs!B2) |
| R1 | c00-sollum-cloud/Capitalization-locale.csv | safe_cap | not proposed (gold 7700000, High, at SAFEs!C2) |
| R1 | c00-sollum-cloud/Capitalization-locale.csv | safe_discount | not proposed (gold 15, High, at SAFEs!D2) |
| R1 | c00-sollum-cloud/Compliance_Overview-unseen.odt | p1_incidents | not proposed (gold 1, High, at Severity-1) |
<!-- /engine-fuzz -->

<!-- engine-heldout -->
## Engine, set heldout (seed 1009), 2026-11-10, commit 48fd8f7

140 documents (8 HTML read in Chromium). Codes: R1 unknown label or not found, R2 wrong period or value, R3 decoy filled, R4 unit or scale, R5 reader failure, R6 structure or extra field, R7 right value at too low a tier.

| Measure | Measured | Target (dev) |
|---|---|---|
| High-tier precision | 355/355 (100.0%) | 98% or better |
| Medium-tier precision | 284/284 (100.0%) | 90% or better |
| Recall (High and Medium, plus Low where the gold is Low) | 645/802 (80.4%) | 92% clean, 75% messy |
| Decoys filled (must_not_fill) | 0 of 654 proposals | 0.5% or less |
| Wrong values per 100 High fields | 0.0 | 1 or less |
| Ledgers recognised | 6/6 | all |
| Same proposals in reverse order | yes | yes |
| Time per document (read and extract) | median 6 ms, 95th percentile 17 ms | 400 ms, 1.5 s |
| Requests to any other site (HTML in Chromium) | 0 | 0 |

Failures by code: {"R1":154}

### Tier reliability

| Predicted tier | Proposals | Correct | Observed precision |
|---|---|---|---|
| High | 355 | 355 | 100.0% |
| Medium | 284 | 284 | 100.0% |
| Low | 15 | 6 | 40.0% |

### By format

| Format | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| csv | 63 | 61 (96.8%) | 0 |
| docx | 35 | 24 (68.6%) | 0 |
| eml | 33 | 23 (69.7%) | 0 |
| htm | 14 | 8 (57.1%) | 0 |
| html | 34 | 22 (64.7%) | 0 |
| json | 21 | 21 (100.0%) | 0 |
| md | 74 | 44 (59.5%) | 0 |
| ods | 76 | 75 (98.7%) | 0 |
| odt | 28 | 20 (71.4%) | 0 |
| pdf | 130 | 105 (80.8%) | 0 |
| pptx | 42 | 24 (57.1%) | 0 |
| rtf | 37 | 27 (73.0%) | 0 |
| tsv | 25 | 21 (84.0%) | 0 |
| txt | 44 | 27 (61.4%) | 0 |
| xlsm | 27 | 25 (92.6%) | 0 |
| xlsx | 119 | 118 (99.2%) | 0 |

### By document type

| Type | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| audited | 3 | 3 (100.0%) | 0 |
| bank | 6 | 0 (0.0%) | 0 |
| captable | 99 | 99 (100.0%) | 0 |
| crm | 15 | 10 (66.7%) | 0 |
| deck | 168 | 96 (57.1%) | 0 |
| headcount | 10 | 5 (50.0%) | 0 |
| json | 21 | 21 (100.0%) | 0 |
| market | 21 | 7 (33.3%) | 0 |
| model | 240 | 240 (100.0%) | 0 |
| receivables | 8 | 8 (100.0%) | 0 |
| security | 27 | 27 (100.0%) | 0 |
| termsheet | 88 | 65 (73.9%) | 0 |
| update | 96 | 64 (66.7%) | 0 |

### By field family (form section)

| Section | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| capital | 117 | 79 (67.5%) | 0 |
| claims | 176 | 128 (72.7%) | 0 |
| deal | 160 | 113 (70.6%) | 0 |
| govern | 42 | 42 (100.0%) | 0 |
| gtm | 22 | 17 (77.3%) | 0 |
| market | 21 | 7 (33.3%) | 0 |
| revenue | 214 | 214 (100.0%) | 0 |
| team | 50 | 45 (90.0%) | 0 |

### By mutation (fuzz set: shuffle and decoys, European numbers, unseen synonyms)

| Mutation | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| base | 802 | 645 (80.4%) | 0 |

### By trap

| Trap (documents that carry it) | Gold fields | Found | Wrong at High or Medium |
|---|---|---|---|
| ageing buckets | 8 | 8 (100.0%) | 0 |
| competitor or market figure | 168 | 96 (57.1%) | 0 |
| footnote that changes a definition | 168 | 96 (57.1%) | 0 |
| forecast or plan columns | 240 | 240 (100.0%) | 0 |
| granted versus unallocated pool | 99 | 99 (100.0%) | 0 |
| gross versus net burn | 336 | 304 (90.5%) | 0 |
| hidden stale sheet | 240 | 240 (100.0%) | 0 |
| including clauses | 88 | 65 (73.9%) | 0 |
| industry benchmark | 21 | 7 (33.3%) | 0 |
| margin with and without customer success | 240 | 240 (100.0%) | 0 |
| negation | 27 | 27 (100.0%) | 0 |
| negatives in parentheses | 240 | 240 (100.0%) | 0 |
| net new versus new-logo ARR | 240 | 240 (100.0%) | 0 |
| older period | 3 | 3 (100.0%) | 0 |
| opening balance | 6 | 0 (0.0%) | 0 |
| prior-year column | 240 | 240 (100.0%) | 0 |
| prior-year figure in a sentence | 96 | 64 (66.7%) | 0 |
| restricted cash | 6 | 0 (0.0%) | 0 |
| rounding ($15.6M) | 168 | 96 (57.1%) | 0 |
| target or goal | 264 | 160 (60.6%) | 0 |
| thousands scale row | 240 | 240 (100.0%) | 0 |

### By layout (where the value was found)

| Layout | Proposals | Wrong at High or Medium |
|---|---|---|
| clause | 28 | 0 |
| computed | 52 | 0 |
| kv | 64 | 0 |
| sentence | 171 | 0 |
| table | 339 | 0 |

### The 20 worst failures

| Code | File | Field | Detail |
|---|---|---|---|
| R1 | c00-casnor-logistics/deck-final-v7.pptx | stated_customers | not proposed (gold 19, High, at slide 2) |
| R1 | c00-casnor-logistics/deck-final-v7.pptx | stated_tam | not proposed (gold 30000000000, High, at slide 3) |
| R1 | c00-casnor-logistics/deck-final-v7.pptx | round_size | not proposed (gold 1800000, Medium, at slide 4) |
| R1 | c00-casnor-logistics/investor-update.eml | cash_on_hand | not proposed (gold 1102000, Medium, at p) |
| R1 | c00-casnor-logistics/investor-update.eml | gross_burn | not proposed (gold 145000, Medium, at p) |
| R1 | c00-casnor-logistics/bank-statement.pdf | cash_on_hand | not proposed (gold 1102000, High, at table) |
| R1 | c01-brifen-analytics/Investor_Presentation.pdf | stated_customers | not proposed (gold 9, High, at slide 2) |
| R1 | c01-brifen-analytics/Investor_Presentation.pdf | stated_tam | not proposed (gold 30000000000, High, at slide 3) |
| R1 | c01-brifen-analytics/Investor_Presentation.pdf | round_size | not proposed (gold 900000, Medium, at slide 4) |
| R1 | c01-brifen-analytics/Monthly_Update.md | cash_on_hand | not proposed (gold 5117000, Medium, at p) |
| R1 | c01-brifen-analytics/Monthly_Update.md | gross_burn | not proposed (gold 188000, Medium, at p) |
| R1 | c01-brifen-analytics/Series_Term_Sheet.docx | round_size | not proposed (gold 900000, High, at p) |
| R1 | c02-dorlum-works/deck-final-v7.pdf | stated_customers | not proposed (gold 9, High, at slide 2) |
| R1 | c02-dorlum-works/deck-final-v7.pdf | stated_tam | not proposed (gold 12000000000, High, at slide 3) |
| R1 | c02-dorlum-works/deck-final-v7.pdf | round_size | not proposed (gold 1700000, Medium, at slide 4) |
| R1 | c02-dorlum-works/Monthly_Update.txt | cash_on_hand | not proposed (gold 4245000, Medium, at p) |
| R1 | c02-dorlum-works/Monthly_Update.txt | gross_burn | not proposed (gold 266000, Medium, at p) |
| R1 | c02-dorlum-works/CRM_Opportunities.csv | pipeline_coverage | not proposed (gold 4, High, at KPIs) |
| R1 | c02-dorlum-works/market-notes.md | primary_competitor | not proposed (gold "Fathomio", High, at p) |
| R1 | c02-dorlum-works/market-notes.md | target_accounts | not proposed (gold 27028, High, at p) |
<!-- /engine-heldout -->

<!-- adversarial -->
## Hostile and odd files, 2026-11-10

26 files, 0 crashed, 0 took more than 2 s. "Filled" counts proposals at High or Medium.

| File | Bytes | Outcome | Filled | ms |
|---|---|---|---|---|
| adv-bom-utf8.csv | 32 | read | 1 | 17 |
| adv-dates-1904-no-cache.xlsx | 3,264 | read | 14 | 25 |
| adv-deck.pages | 44 | refused: apple | 0 | 0 |
| adv-déck résumé (long name in the corpus).md | 619 | read | 7 | 6 |
| adv-eighty-slides.pptx | 107,291 | read | 7 | 62 |
| adv-empty.txt | 0 | refused: empty | 0 | 0 |
| adv-encrypted.pdf | 2,426 | refused: encrypted | 0 | 2 |
| adv-google-doc-link.url | 67 | refused: link | 0 | 0 |
| adv-injection.md | 91 | read | 0 | 2 |
| adv-object-streams.pdf | 715 | read | 1 | 5 |
| adv-old-workbook.xls | 512 | refused: legacy_office | 0 | 0 |
| adv-one-byte.csv | 1 | read | 0 | 0 |
| adv-password.docx | 528 | refused: encrypted | 0 | 0 |
| adv-photo.png | 72 | refused: image | 0 | 0 |
| adv-really-a-pdf.docx | 1,920 | read | 6 | 6 |
| adv-really-a-workbook.csv | 3,255 | read | 14 | 8 |
| adv-scanned.pdf | 742 | refused: scanned_pdf | 0 | 2 |
| adv-term-summary.rtf | 447 | read | 6 | 3 |
| adv-tracked-changes.docx | 1,193 | read | 6 | 4 |
| adv-truncated.zip | 18,069 | refused: truncated | 0 | 1 |
| adv-type3-font.pdf | 907 | refused: undecodable_font | 0 | 1 |
| adv-update-base64.eml | 931 | read | 6 | 4 |
| adv-update-qp-multipart.eml | 1,570 | read | 6 | 5 |
| adv-utf16be.txt | 60 | read | 1 | 2 |
| adv-utf16le.txt | 70 | read | 1 | 1 |
| adv-windows-1252.txt | 46 | read | 1 | 4 |
<!-- /adversarial -->
