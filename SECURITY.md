# Security Policy

## How VCR2 handles data

- VCR2 is a static, client-side application. There is no VCR2 backend.
- Customer ledgers, monthly financials, derivations, consistency checks, forensic tests, the simulation and the score all run locally in the browser.
- The optional AI features (figure extraction, AI library import, memo narrative) send only the text involved to the model provider you select, using your own API key.
- API keys, drafts and the library are stored in your browser's `localStorage`. Clear site data to remove them.
- All user-supplied and model-supplied text is escaped before it is rendered.
- Excel files are read in the browser by VCR2's own reader; nothing is uploaded.

## Owner Studio

- The published configuration (`radar-config.json`) can only be changed by committing to the repository. The Studio does this through the GitHub API with a fine-grained token that the owner creates, limited to this repository and to “Contents: Read and write”.
- The Studio unlocks only after GitHub confirms that the token belongs to the repository owner and has write access. The token is kept in session storage (or local storage if “Keep me signed in” is ticked) and is sent only to `api.github.com`.
- Every entry in the configuration is validated on load: names must be plain identifiers, text is escaped, unknown keys are dropped, and a malformed file falls back to the built-in engine.
- Formulas are parsed and evaluated by a small interpreter with no access to anything but the assessment's numbers and text. Nothing is passed to `eval` or `Function`.
- Publishing never overwrites a newer version silently: the Studio sends the file's current revision and stops if it changed.

## Recommendations for users

- Use a restricted, low-spend API key created just for this tool.
- Do not paste confidential or regulated material into a provider you have not cleared for it.
- Leave the AI provider on "Deterministic only" when you only need the analysis — nothing leaves the browser.
- Export the library as a JSON backup; browser storage can be cleared.
- Owner: give the Studio token an expiry, limit it to this one repository, and don't tick “Keep me signed in” on a shared computer. Revoke it at github.com/settings/personal-access-tokens if it is ever exposed.

## Reporting a vulnerability

Please open a private report via **Security → Report a vulnerability** on this repository. Do not open a public issue for security problems.
