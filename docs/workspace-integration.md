# Deal flow: integration format (JSON export and webhook)

Other tools (a CRM, a deal-flow automation, an agent) can use what VCR2 Deal flow produces in two ways:

- **JSON export**: Deal flow, Dashboard, **Export JSON** (every company) or **JSON** in a company's panel (one company).
- **Webhook**: Settings, Integrations, **Webhook address**. VCR2 calls it when a company is created, updated, changes status
  or gets an investment committee vote.

Both are **Internal** outputs: they carry contact details, reasons quoted from the deck and the pipeline fields. Never put
them in an LP data room. The LP-facing outputs are the ones in the LP data room (see docs/WORKSPACES.md).

## The webhook call

```
POST <your webhook address>
Content-Type: application/json
User-Agent: VCR2-webhook/1
X-VCR2-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with your workspace key>

{ "event": "company.created", "sent_at": "2026-11-23T10:15:02.112Z", "data": { …one company, as below… } }
```

Events: `company.created`, `company.updated` (a duplicate was merged into it, or it was re-read), `company.status`,
`company.ic_vote`.

The call goes through the VCR2 intake service, which signs it. Your workspace key is in Settings, Integrations (admins
only). To check a call, compute the HMAC-SHA256 of the raw request body with that key and compare it, in constant time, with
the hex after `sha256=`. Answer with any 2xx status. A call is not retried.

## One company (`schema: "vcr2.workspace.company/1"`)

| Field | Type | Meaning |
|---|---|---|
| `schema` | string | `vcr2.workspace.company/1` |
| `workspace` | `{ id, name }` | The workspace it belongs to |
| `id` | string | VCR2's id of the company (stable) |
| `company`, `website`, `email`, `linkedin` | string or null | Identity, as found in the material or typed by your team |
| `founders` | string[] | Founder names found |
| `sector`, `stage`, `geo` | string or null | Ids: sectors and countries from VCR2's lists (e.g. `fintech`, `hr`; `fr`, `us`), stages `preseed`, `seed`, `a`, `b` |
| `raise` | number or null | Round size stated, in the deck's currency |
| `source` | string | `website`, `email`, `linkedin`, `import` or `manual` |
| `received` | ISO date | When VCR2 got it |
| `thesis` | object or null | `result` (`in`, `border`, `out`), `label`, `reasons[]` (`rule`, `ok` true/false/null, `text`, `src` {`file`, `loc`, `quote`}), `questions[]` |
| `scorecard` | object or null | `name`, `total` (1 to 5), `tier`, `coverage` (% of the weights scored), `meets_threshold`, `pillars[]` |
| `scorecard.pillars[]` | object | `id`, `name`, `weight`, `score`, `from` (`engine`, `reviewer`, `ai` = AI suggestion confirmed by a person, or null), `by`, `at`, `basis` (`evidence` or `claims`), `sources[]` (metric, value, evidence level, where it came from) |
| `analysis` | object or null | VCR2 evidence score (`score`, 0 to 100), `hash` (run id: same inputs, same hash), `rubric`, `checks[]`, `questions[]` |
| `pipeline` | object | `status`, `reviewer`, `last_contact`, `next_action`, `next_action_due`, `follow_up_owner` |
| `links` | object | `folder`, `memo`, `report`, `deck` (Google Drive links) |
| `files` | object[] | `name`, `sha256`, `size`, `link` |
| `timing` | object | `inAt`, `autoMs` (automated reading and scoring), `scoredAt`, `toScoreMs`, `completeAt`, `toCompleteMs` |

The full export (`schema: "vcr2.workspace.export/1"`) wraps `companies[]` with `exported_at` and the workspace's
`scorecard` and `pipeline` settings.

## Stability

Fields are only added, never renamed or removed, within `/1`. A breaking change gets `/2`.
