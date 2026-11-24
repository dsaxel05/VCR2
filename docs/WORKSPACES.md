# Deal flow (workspaces)

Deal flow is the part of VCR2 for an investment team's whole flow of companies, from the first deck to the investment
committee and the LP data room. It opens from the main page (menu, **Deal flow**) at `flow.html`. It is built for any
investor: VC funds, angels, syndicates and accelerators. Nothing in it is specific to one fund: every rule, folder, column,
stage and template is set per workspace.

## How it works

1. **Intake.** Decks arrive from the website form (embed it on your site), from your workspace's forwarding address, or from
   your own folders and your company spreadsheet (**Add companies**).
2. **Reading.** Each document is read in your browser with VCR2's rules (Smart fill): PDF, PowerPoint, Word, e-mails with
   their attachments, spreadsheets, and image-only decks through OCR (tesseract.js, self-hosted, in your browser). Every
   value keeps its file, page or slide and a short quote.
3. **Duplicates.** The same file, the same web domain, the same founder e-mail or the same name: merged, never a second entry.
4. **Thesis check.** In thesis / Borderline / Out of thesis, with every reason and its source. Missing information gives
   "Borderline (needs info)" and the questions to ask, never a fail. Change the thesis and every company is re-checked.
5. **Analysis and scorecard.** In thesis and Borderline companies get the full VCR2 analysis (derived metrics, consistency
   checks, red flags, ranked questions) and your scorecard. Pillars the engine can score from evidence are scored by it with
   their sources; the others are scored by a person in one click (an AI suggestion, with your own key, is never applied
   until a person confirms it).
6. **Sorting.** In your Google Drive: one folder per company inside the In / Borderline / Out folder you chose, the deck and
   a VCR2 report (a Google Doc) inside. In your master Google Sheet: one row per company, mapped onto your columns.
7. **Review.** Dashboard, weekly triage, statuses, reviewer, notes, next action and follow-up owner, flags (waiting past your
   target, next action overdue, no contact), the optional weekly digest, the IC vote and the deal memo.
8. **LP data room.** The due diligence process document and the anonymized pipeline, LP-facing, with a blocking
   anonymization check.

Nothing is analysed on a server. Decks and their text stay in your browser and your Drive.

## What you can drop

| Kind | Formats |
|---|---|
| Decks | PDF, PowerPoint (.pptx), Word (.docx), images and image-only PDFs (OCR), a .zip of decks |
| E-mails | .eml (with the deck attached), or forwarded to your workspace address |
| Your company spreadsheet | .xlsx or .csv (a Google Sheet: File, Download, .xlsx). Columns recognised: company, website, founder, email, deck (file name or link), stage, sector, status, date received, source, referral, lead partner, next action, owner |
| More evidence for a company | founder e-mails, call transcripts, notes: pasted, or .txt, .docx, .pdf, .eml (company panel, **Add evidence**) |

Old formats (.ppt, .doc), password-protected files and links (DocSend, Notion) cannot be read: download or export first.

## The website form

Settings, Intake, **Create this workspace's form and forwarding address**, then copy the embed code into your website (most
site builders have an "Embed HTML" block). Founders give the company, their name and e-mail, the stage and the amount, and
attach the deck (or a link). The form sends it only to the VCR2 intake service, which holds it until your team reads it
(14 days at most).

## The forwarding address

Settings, Intake shows your workspace's private address (`ws-…@<the site's mail domain>`). Forward a founder's e-mail with its
deck to it, or set an automatic forward in your mailbox. It is read when anyone in your team opens Deal flow and clicks
**Check the inbox**: the founder's e-mail (not the forwarder's) and the attached deck are read, filed and logged, then the
e-mail is deleted from the intake service.

## Scorecards

Templates: **Profitability & Durability** (Team & Execution 25%, 10-Year Profitability & Unit Economics 25%, M&A Durability
& Exit Moat 20%, Market Size & Timing 15%, Product Differentiation 15%), **VCR2 evidence dimensions** and **Early-stage
basics**. Edit pillars, weights (they must total 100%), the scorer of each pillar (a reviewer, the engine from chosen
metrics, or a VCR2 dimension), the threshold and the tiers (`Tier 1 >= 4`). Saving re-scores everyone; **Calibration** shows
the distribution per pillar and in total, and what moved.

The engine's profitability pillar uses gross margin, burn multiple, CAC payback, LTV:CAC, NRR, GRR, Rule of 40 and runway,
from the evidence first (exports, financial models, bank records). A deck alone gives the company's claims: the pillar is then
labelled "from the deck's claims (unverified)". A failed consistency check on those figures caps the pillar at 2.5.

## The master sheet

Settings, Google Drive and sheet, **Choose your sheet**. For each column: **VCR2 writes** (fills it and keeps it updated),
**VCR2 reads only** (formula columns always), or **Ignore**. A cell your team changed is never overwritten: its value comes
back into VCR2. Dropdown columns keep your own list of values. An existing row is matched on name, web domain, founder or deck
link, so a company never gets a second row. Text that a spreadsheet would read as a formula is written as text.

## Deal memos

From a company's panel: **Create the deal memo**, a Google Doc from your own Google Doc template (copied, placeholders
replaced) or from VCR2's (editable in Settings, Deal memo). It holds the pillar scores with their sources, the derived
metrics, the consistency checks, the risks, the ranked questions and your team's notes. Its link goes to the master sheet.
It can run automatically above the threshold (off by default). The deal memo is the IC memo: the committee vote links to it.

## Due diligence process and the investment committee

The process stages are the pipeline statuses (one list). Each has a goal, a checklist, an owner role, a target time and the
evidence VCR2 provides. Preset: Sourcing → Thesis screen → First call → Deep diligence → IC memo → IC vote → Term sheet →
Close → Post-investment monitoring (plus Passed). Import your existing process notes (text, .docx, PDF): headings become
stages, bullets checklist items, and committee rules (quorum, majority, two thirds, unanimity, veto, recusal, tie) are
recognised; you confirm what to apply.

The committee: members and roles, quorum, voting rule (simple majority, two-thirds supermajority, unanimous, or majority
with a managing-partner veto), conflicts (recused, or disclosed and recorded), ties (declined, chair decides, vote again),
and "yes, with conditions" (counts as yes with the conditions recorded, or as no). Each vote is stored with the company: who,
how, when, the conditions, the result and the reason, the linked memo; the status moves on; the decision and its date go
to the master sheet.

## LP data room

- **Due diligence process** (LP-facing): flowchart, stages, committee and rules, and how evidence-first scoring fits in.
- **Anonymized pipeline** (LP-facing): code names by sector (your prefixes), sector and sub-sector, stage, round size and
  valuation as ranges, region only, a non-identifying description, the thesis fit, the pipeline stage, and the tier if you
  choose. Filters by sector, stage, tier and date.
- **Anonymization check (blocking)**: names (company, product, founder, other companies), web addresses, e-mails, handles,
  logos, exact amounts, counts and percentages, founding years, named customers, investors or employers, cities and countries,
  and a niche plus a city. Each flag has a safer wording; nothing exports until every flag is fixed or accepted by a named
  reviewer, and acceptances are logged. A final guard refuses any export containing an internal value (company or founder
  names, e-mails, notes, reviewers, next actions, deck quotes).
- **Exports**: Google Doc, Google Sheet and PDF in your Drive (refreshed in one click, same links), or HTML, CSV and print to
  PDF without Google. Each carries "LP-FACING" and its "data as of" date.

## What is stored where

| Where | What |
|---|---|
| Your browser | Everything while you work; without an account, the workspace itself (IndexedDB) |
| Your Google Drive and Sheet | Decks, VCR2 reports, memos, LP documents, the master sheet |
| VCR2 accounts (team mode) | Workspace settings and, per company, the structured record: facts with short quotes (160 characters at most), scores, statuses, notes, votes. Never the decks or their text. Row-level security: members of the workspace only |
| VCR2 intake service | Form submissions and forwarded e-mails until your team reads them (14 days at most), the digest list your team last prepared |

## Owner setup (once per site)

`site.json`, `workspaces`: `enabled` (the menu link and the home-page card), `teams` (team workspaces, after the database
step below), `intake` (the intake service address), `mailDomain`, `google.clientId`, `google.apiKey`, `google.appId`. Then
`python build.py` and publish. The detailed click-by-click steps are in the v6.0.0 release report; in short:

1. **Google Cloud** (project used for sign-in): enable the Google Drive, Google Sheets, Google Docs and Google Picker APIs; on
   the OAuth consent screen add the scope `.../auth/drive.file`; on the web client add the JavaScript origin
   `https://vcr2.app` and the redirect URI `https://vcr2.app/oauth.html`; create an API key restricted to the Picker API and
   to `https://vcr2.app/*`. Put the client id, the API key and the project number in `site.json`.
2. **Cloudflare**: create the KV namespace `vcr2-intake`, deploy `worker/` (Workers, Create, paste `worker/intake.mjs`, bind
   the KV namespace as `INTAKE`, add the variables of `worker/wrangler.toml`, add the cron), attach the custom domain
   `intake.vcr2.app`; Email Routing on `vcr2.app`: catch-all address, action "Send to a Worker", `vcr2-intake`.
3. **E-mails** (digest and founder acknowledgement, optional): a free Resend account, the domain verified with its DNS
   records on Cloudflare, the API key as the Worker secret `RESEND_API_KEY`.
4. **Team workspaces**: run `supabase/migrations/20261123120000_workspaces.sql` in the SQL editor of both Supabase projects,
   then set `teams: true`.
