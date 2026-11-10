# Smart fill: method and rules

Smart fill is an optional, offline, deterministic document reader. It opens the documents a user drops (spreadsheets, decks, PDFs, Word files, term sheets, cap tables, bank letters, e-mails, JSON, HTML), finds the values the evidence form asks for, and proposes them on a review screen. It uses rules, dictionaries, grammars and scoring only. For users: [DOCUMENTS.md](DOCUMENTS.md). Measured results: [smartfill/RESULTS.md](smartfill/RESULTS.md).

## The rules (S1 to S14)

**S1 No AI.** No model, API key, network call, remote script, font or OCR. Only JavaScript rules, dictionaries, grammars and scoring. It works from `file://` and from the live site. The optional AI extraction (`runExtraction` and the provider settings) is unchanged, and Smart fill never calls it. The browser tests assert zero network requests while reading.

**S2 Optional in three ways.** Nothing runs until the user clicks **Read my documents**. Ignoring Smart fill changes nothing. A Studio master switch (Site > Smart fill, on by default) hides it completely.

**S3 Nothing reaches the form without the review screen.** A value the user typed is replaced only if the user ticks **overwrite** on that row. Fields derived from the ledger or the monthly financials are never replaced. **Undo last Smart fill** restores the form. **Forget documents** drops the document text from memory and stops the background thread that holds it.

**S4 Privacy.** Files never leave the browser. Raw document text is never stored in drafts, `localStorage`, the library or the exported configuration. Only provenance is kept with a value: file name, location and a snippet of 160 characters or fewer (`S.prov`). The Studio publishes dictionary changes, never anybody's documents. Labels a visitor teaches stay in their own browser.

**S5 A wrong fill is worse than an empty field.** Three tiers: High (ticked), Medium (shown, unticked), Low (listed under Suggestions, never ticked). Thresholds 0.82, 0.62 and 0.45, editable in the Studio.

**S6 Claims versus evidence.** A number read from a deck, memo, pitch, founder update or any narrative document goes to the matching `stated_*` field. It goes to the evidence field (`arr_now`, `gross_margin`...) only if the user ticks **also use as evidence** (off by default, tagged "Deck or memo"). Numbers from a system export, financial model, bank record or audited statement fill the evidence fields. See [METHODOLOGY.md § 1](METHODOLOGY.md#1-evidence-model).

**S7 No invention.** Direct reads, plus a short list of unambiguous arithmetic, always labelled "Computed from N rows" with the formula: cap-table shares to percentages, headcount sums by function, receivables over 90 days from the aging buckets, unit conversions. No estimates or defaults. Computed values are Medium at most. A Studio switch turns the list off.

**S8 Documents are untrusted data.** Nothing is evaluated: no formulas (saved values only, and a note when a workbook has none), macros or scripts. Document text is shown only through `esc()`. HTML is parsed only with `DOMParser`, which never runs scripts. Limits: 25 MB per file, 40 files per run, zip expansion at most 150 MB and 100:1, 400 PDF pages, 8 seconds per file. A bad file gets a plain-English message and a fix, and the other files are still read.

**S9 Owner control.** Every synonym, veto term, plausibility range, tier threshold, document-type word, forecast word and number setting is editable in the Studio (Site > Smart fill), shown next to the built-in value and resettable. It is stored in `radar-config.json` under `settings.smartfill` and validated on load.

**S10 The field catalogue is read at run time** from `SECTIONS` plus custom inputs, renamed labels (a renamed label becomes a synonym), hidden fields (skipped) and business-model gating (fields of other models skipped). Nothing is hard-coded.

**S11 One self-contained `index.html`.** The sources are in `src/smartfill-*.js`, listed in `build.py`. No external library: the zip reader uses `DecompressionStream`, and XML, PDF and the Office formats have in-house readers.

**S12 Deterministic.** The same files give the same output in any drop order. No `Math.random` or `Date.now` in decisions, and ties are broken by stable keys. The background thread runs the same code and gives byte-identical proposals (tested on every fixture).

**S13 Explainable.** Every proposal shows the file, the exact location (Sheet!Cell, page, slide or line), the quoted snippet and the score breakdown. Every empty field answers "why not filled?": no candidate, below threshold, conflict, decoy rejected, wrong period, or wrong business model.

**S14 Design.** The app's look, light and dark, phone and desktop, WCAG 2.2 AA, fully keyboard operable. axe-core reports 0 violations on both Smart fill screens in both themes and both sizes.

## How it works

1. **Intake (E0).** Each file is sniffed by its bytes (zip containers by their parts, `%PDF`, RTF, e-mail headers, JSON, HTML). Text encodings: UTF-8 with or without BOM, UTF-16 LE/BE, Windows-1252. A folder or a `.zip` expands into a file list under the S8 limits.
2. **Readers (E1)** turn every format into one document model: blocks of type table, paragraph, key-value, heading, list, note or meta, each with its location. Workbooks keep every visible sheet, merged cells and number formats. Word keeps inserted text from tracked changes and drops deleted text. Slides are read in position order, including chart caches. PDFs go through an in-house text extractor (xref streams, FlateDecode, font encodings and ToUnicode maps) that rebuilds lines, columns and tables. A PDF it cannot decode is reported, never guessed.
3. **Classification (E2)** ranks the document type from the file name, sheet names, header words and keyword density. The type sets the role (export, model, deck, bank, audited), which sets the default evidence tag. The user can override it per file ("Read as").
4. **Numbers and labels (E3, E4).** A number grammar reads currencies, scales (k, M, bn, "in thousands"), negatives in brackets, percentages, ratios, multiples, durations, ranges and approximations ("about", "~", "up to"). Each document's decimal separator is decided once. A label dictionary of about 150 fields in English and French has veto terms ("ARR per employee" is not ARR), plausibility ranges, period meaning and sign rules.
5. **Candidates (E5)** come from tables (row label to value, transposed tables, two-level headers, KPI tiles), "label: value" lines, sentences ("grew from X to Y", "up 12% to $4M"), choice and yes/no patterns with negation, and the cap-table, term-sheet, bank and receivables rules. The period resolver takes the latest actual period, skips forecast, plan and budget columns, and maps the prior-year column to the "12 months ago" fields.
6. **Scoring (E6)** combines label strength, structural binding, period, plausibility, the document-type prior, context words (actual, audited vs. target, forecast, market, competitor) and footnote qualifiers, then maps the score to a tier.
7. **Resolution (E7, E8).** One number fills one field. Across files, the stronger source wins: bank, then audited, export, model, deck. Two confident sources that disagree fill nothing and show a Conflict. Cross-checks run before anything is written (top 1 ≤ top 5 ≤ top 10, the ARR bridge closes, net burn ≤ gross burn...). A failed check lowers the tier and says why.
8. **Apply (E9)** writes the accepted rows with their provenance and evidence tag, saves the draft and keeps one undo step.

## Where it runs

Reading and extraction run in a background thread (a Web Worker from a Blob URL, as the page's security policy allows), so a large file does not freeze the page. The thread is built at run time from the page's own code: `build.py` places two markers around the reader and the engine, and `src/smartfill-worker.js` starts the thread from that part of the page. The thread gets the field catalogue and the owner's settings as plain data. It returns only the file summary, the proposals and the unmatched numbers, never the document text. HTML needs the page's own parser, so it is read on the page. If the thread cannot start or fails, every file is read on the page, with the same results. Tests: `tests/smartfill-worker.test.mjs` (a real thread, every fixture compared with the page) and `tests/browser/smartfill_worker_test.py`.

## Tests

- `node tests/smartfill/run.mjs`: the seeded corpus (dev, fuzz, held-out), with precision per tier, recall, decoys and the 20 worst failures by reason code. Writes [smartfill/RESULTS.md](smartfill/RESULTS.md).
- `tests/smartfill-*.test.mjs`: readers, number grammar, label matcher, period resolver, cap-table maths, cross-checks, resolution, determinism, the Quillstone answer key, the background thread.
- `tests/browser/smartfill_*_test.py`: the readers in Chromium, the screens, end to end from `file://` (desktop, phone, dark, keyboard, zero network), and the background thread.
- `node tests/smartfill/adversarial.mjs`: hostile and odd files.

## Known limits

- No OCR: scanned PDFs and pictures are refused with the fix.
- Wording the dictionary has never seen is often missed. On a held-out set written with new phrasings, recall was 80.4% against 98.7% on the development set, with no wrong value at High or Medium. A miss leaves the field empty; the owner can add the company's wording in the Studio, and a user can teach it from the review screen.
- Amounts in another currency are suggested, never converted.
- A PDF font without a usable character map is reported, not guessed.
- A very long text with a different label on every line is slow: a 3.6 MB file of 60,000 "Note N: ..." lines takes about 17 s to analyse (measured in Node). It runs in the background thread, so the page stays usable, but the wait is long. Ordinary documents take a few milliseconds (median 4 ms on the development set).
