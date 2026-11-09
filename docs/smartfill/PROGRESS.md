# Smart fill progress (resume at the first unchecked item)
- [x] P0 Recon: PLAN.md written; STOP A answered 2026-11-08 (see Decisions in PLAN.md); pip libs installed.
- [x] P1 Test rig: generator (tests/smartfill/generate.py, seeded), gold (corpus/<set>/gold.json), runner (tests/smartfill/run.mjs), baseline 72 of 1,139 gold fields (6.3%). STOP B reported 2026-11-08. Corpus gaps to close in P2: json and rtf have 4 files (5 needed); pptx, ods, odt, eml, rtf, md, txt, html, csv, json have one producer (2 needed).
- [ ] P2 Readers (E0, E1) + unit tests + adversarial files.
- [ ] P3 Engine v1 (E2 to E6), up to 6 tuning rounds.
- [ ] P4 Resolution, cross-checks, roles, apply and undo (E7 to E9).
- [ ] P5 Screen, guide, coverage map, Studio controls.
- [ ] P6 Held-out, fuzz, adversarial, performance, browser e2e, accessibility, Quillstone. STOP C.
- [ ] P7 Docs, CHANGELOG, version, build, commit (no push).
Still welcome (not blocking): the 24-file Quillstone room with 21-VCR2-input-sheet.md.
