# What you can drop into Smart fill

Smart fill reads the documents you already have (a deck, a financial model, a term sheet, a bank letter...) and proposes values for the evidence form. It runs **in your browser only**, with rules: no AI, no account, nothing sent anywhere. You review every value before it goes into the form.

Where: **Give it the source material** page, box **Drop everything here**. Drop files, a whole folder or a `.zip` of the data room, or paste text. Then click **Read my documents**.

## Formats

| | Formats |
|---|---|
| **Best** | The original exports: Excel (.xlsx, .xlsm), CSV and TSV, PDF made by the software that wrote it, Word (.docx), PowerPoint (.pptx), JSON from a billing or analytics tool. |
| **Good** | OpenDocument (.ods, .odt), Markdown and plain text, e-mails saved as .eml (with their attachments), web pages saved as .html, RTF, a .zip of the data room, pasted text. |

Smart fill recognises a file by its content, not its name, so a wrong extension is fine. In a workbook it reads every visible sheet and only the values saved in the cells: it never runs formulas, macros or scripts.

## What it cannot read, and the fix

| You have | Why it cannot be read | Fix |
|---|---|---|
| A scanned or photographed PDF, a picture or a screenshot (.png, .jpg, .heic, .tiff) | There is no text inside, only an image, and there is no OCR offline. | Export the original as a text PDF, .xlsx or .docx, or paste the text. |
| An old Office file (.xls, .doc, .ppt) | Old binary formats. | Open it and use Save As .xlsx, .docx or .pptx. |
| A password-protected or encrypted file | The content is locked. | Save a copy without the password and drop that copy. |
| A link to Google Docs, Notion, Drive, DocSend or any website | VCR2 never fetches anything from the web. | Download the document as PDF, .xlsx or .docx and drop it, or copy the text and paste it. |
| Apple Pages, Numbers or Keynote | Not readable without Apple's software. | Export to PDF or to the Office format. |
| A PDF whose fonts hide their letters | The letters cannot be decoded without guessing, and Smart fill never guesses. | Export the PDF again from the source application, or drop the original file. |

A file that cannot be read gets a plain message with the fix, and the other files are still read. Limits: 25 MB per file, 40 files at a time, 400 PDF pages, 8 seconds per file.

## Document types, and what each one fills

| Document | Typical names | Formats | What it fills |
|---|---|---|---|
| Customer revenue ledger | customer-ledger.csv, MRR_by_customer.xlsx | CSV, XLSX | ARR now and a year ago, the four ARR movements, customers, logos lost, top 1/5/10 shares. Load it in the **ledger box**: it rebuilds these from the rows. |
| Monthly financials | monthly-financials.csv | CSV, XLSX | Cash, net and gross burn, headcount. Load it in the **financials box**. |
| Pitch deck | pitch-deck.pdf, Investor_Presentation.pptx | PDF, PPTX, MD, TXT, HTML | The company's claims "as stated" (ARR, NRR, growth, customers, market size), round size, main competitor, why now. |
| Financial model, P&L or ARR bridge | financial-model.xlsx, p-and-l.csv | XLSX, CSV, PDF | ARR and its movements, gross margin, cost lines, sales and marketing spend, burn, deferred revenue, cash. |
| Investor update or CFO reply | investor-update.eml, cfo-reply.docx | EML, MD, TXT, DOCX, PDF | Cash, burn, runway as stated, headcount, retention as stated. |
| Cap table | cap-table.xlsx | XLSX, CSV | Prior investors' stake, largest founder stake, number of founders, option pool, SAFEs and notes (amounts, caps, discounts, rate), total raised. |
| Term sheet | term-sheet.docx | DOCX, PDF, MD, TXT | Round size, pre-money, option pool, liquidation preference, participation and its cap, anti-dilution, board, dividends, redemption, pay-to-play, pro rata, information rights. |
| Bank statement or bank letter | bank-statement.pdf | PDF, CSV | Cash on hand (restricted cash left out, and said so). |
| Receivables aging and deferred revenue | ar-aging.xlsx | XLSX, CSV, PDF | Receivables over 90 days, deferred revenue. |
| Sales pipeline export | pipeline-export.csv | CSV, XLSX | Pipeline coverage, win rate, sales cycle, quota attainment (only where the file states them). |
| Headcount by function | headcount.csv | CSV, XLSX | Headcount, engineering and sales headcount, loaded cost. |
| Security, legal and compliance summary | security-legal-summary.pdf | PDF, DOCX, MD | SOC 2, uptime, severity-1 incidents, IP assignments, litigation, data processing agreements, open-source review, insurance, 409A, taxes. |
| Survey, NPS, market or reference-call notes | customer-research.md | MD, DOCX, PDF, CSV | NPS, the "very disappointed" share and respondents, win rate against the main competitor, target accounts, reachable share, pricing move, moat. |
| Audited or reviewed financial statements | audited-financials.pdf | PDF, XLSX | Whether the financials are audited, and year-end figures as a cross-check. |
| Metrics export | metrics-export.json | JSON, CSV | Any field it labels (ARR, customers, gross margin...). |

The guide next to the drop zone shows the same list with the state of each type (not provided, read with the number of fields found, or could not read and why), a coverage bar per form section, and for each section with gaps the **best next document**: the type that would fill the most of its empty fields. **Documents to bring** prints this checklist; **Add missing documents to the request list** adds the missing types to the data-room request list.

## A deck is a claim, not evidence

A number read from a deck, memo or founder update fills the **"as stated"** field (ARR as stated, NRR as stated...), not the evidence field. Otherwise VCR2 would compare the company's claim with itself and report that it agrees. Tick **also use as evidence** on a row if you want it in both places. Numbers from a system export, a financial model, a bank record or audited statements fill the evidence fields directly.

## After reading

- **High** values are ticked, **Medium** values are shown unticked, **Low** values are listed as suggestions. Each row shows the file, the exact place (sheet and cell, page, slide or line), the quoted text and why it scored as it did.
- A value you typed is never replaced unless you tick **overwrite** on that row. Figures from the ledger or the monthly financials are never replaced.
- When two good sources disagree, nothing is filled and both are shown side by side as a **Conflict**: that disagreement is a diligence finding.
- **Undo last Smart fill** puts the form back. **Forget documents** drops the documents from memory; the values you accepted stay, with their source line.
- Only the file name, the place and a quote of 160 characters or fewer are kept with a value. The document text is never saved in a draft, the library or an export.
