# BoldTrail sync — session notes

Work done 17–19 August 2026, on branch `feat/listings-mongo-redis`.

The admin panel's CRM was originally built to *replace* BoldTrail. This session
connected the two instead, so BoldTrail's 978 contacts live in the panel and
stay current — without their API becoming a liability.

---

## What the BoldTrail API actually does

None of this is publicly documented. It was established by probing the live
account with `scripts/probe-boldtrail.mjs`. Third-party write-ups were wrong on
several points, so trust this table over them.

| | |
|---|---|
| Base + prefix | `https://api.kvcore.com` + `/v2/public` |
| Path shapes | `/contacts` plural for the list, **`/contact/{id}` singular** for one record |
| Volume | 978 contacts, 500/page, so the whole account is **2 requests** |
| List response | 17 fields, **includes `updated_at`** |
| Detail response | **83 fields**, but **1 request per contact** |
| Tags | `/contact/{id}/tags` returns `{"tags":[{"name":"x","locked":0}]}` |
| Notes | `/contact/{id}/action/note` returns `{"notes":[{action_id,date,title,details}]}` |
| Pagination | `limit` + `page` honoured. **`offset`/`skip` accepted then silently ignored** |
| Incremental filter | **None works.** Six spellings of "updated since" all accepted and ignored |
| Writes | `POST /contact` → 201, `PUT /contact/{id}` → 200. `DELETE` → 401, not in scope |
| Absent | `deals`, `transactions`, `activities`, `tasks` → 404. **No pipeline object exists** |

### Three traps worth remembering

1. **`401` is overloaded.** It means bad token, out-of-scope endpoint, *and*
   rate lockout, with nothing to distinguish them. `429` was never once
   observed. An isolated 401 is treated as a scope denial; a run of them trips a
   circuit breaker. Treating 401 as fatal would silently stop the nightly job
   forever.
2. **Pagination has no stable sort.** A full enumeration drops a different
   handful of contacts each time and repeats others — `listed` came back as 978,
   973 and 971 across identical fetches. Hence dedup by external id, and
   "missing from the list" is confirmed with a direct fetch before anything is
   flagged as deleted.
3. **The response envelope varies.** Tags and notes use `{tags:[...]}` and
   `{notes:[...]}`, not the `{data:[...]}` the rest of the API uses. Parsing them
   like the others returns empty and looks like "there is no data" — which is
   exactly how tags and notes went unimported for most of this session.

---

## Design: pull rarely, never ask twice

The list is cheap and carries `updated_at`; detail costs a request each. So:

- **Steady state is ~2 requests/day.** Two list pages, compare a content hash
  against what is stored, conclude nothing changed, write nothing, fetch nothing.
- Changed contacts cost +1 request each.
- Detail is rationed (`BOLDTRAIL_DETAIL_BATCH`, default 25/run) so no single run
  is ever long or risky.

Guard rails, because the account was locked out once during discovery: a minimum
interval (12h cron, 5min manual), a per-run request ceiling, a wall-clock budget,
and a lockout circuit breaker that makes **zero** requests while it holds.
`sync_runs.requests_made` is the alarm — a run that changed nothing but spent
hundreds of requests means the skip logic has a hole.

Pacing is deliberately dull: **one request every 2 seconds**. The real limit was
never measured, because the only way to find it is to trigger it against live
client data. Instead every request records its own latency and status into
`sync_runs.detail`, so the picture builds passively at zero cost.

---

## Bugs found and fixed

Several of these only surfaced by running against real data.

- **Change detection was inert.** Postgres returns `timestamptz` as `+00:00`
  while the mapper produced `.000Z`; compared as strings they never match, so
  *every* contact read as changed on *every* run — the exact opposite of the
  design's purpose. Now rests on the content hash alone.
- **Fields were being nulled.** `writeChunked` squares each batch against one
  column list and fills missing keys with `null` (PostgREST rejects mismatched
  keys). The update patch was built partially, so "no update for this field" was
  written as "set this field to null". A NOT NULL constraint on `lead_type` is
  the only reason this surfaced as a failed run rather than as silently erased
  names and email addresses. Nothing was lost — chunked upserts are
  all-or-nothing.
- **Duplicate inserts.** Unstable pagination returned the same contact on two
  pages, violating `contacts_email_unique` and failing whole 500-row batches.
- **Case-sensitive email match** in the CSV importer, against a `lower(email)`
  unique index. Pre-existing; would fail entire chunks.
- **`last_visit`/`last_call` are UNIX epoch seconds**, not date strings.
  `new Date("1781905773")` is an Invalid Date, so they mapped to null.
- **`avg_price`/`avg_beds`/`avg_baths` are `0`, not null**, when unknown — 205
  contacts were about to display "looking for ~$0 · 0 bd".
- **`deal_type` uses `vendor` and is multi-valued.** The original
  buyer/seller/investor/both list collapsed vendor and agent into "unknown".

---

## Data state

978 BoldTrail contacts (984 total, including 6 that pre-dated the sync), all
fully imported.

| | |
|---|---|
| Full 83-field record | 978 |
| Tags fetched | 978 — **924 have tags**, 37 distinct |
| Notes fetched | 978 — **2,865 entries** across 968 contacts |
| Rating / email opt-in | 978 each — **51 are opted out of email** |
| `state` / `city` | 19 · `avg_price` 11 · `company` 0 |

**The record is far sparser than the field list suggests.** Address, company,
birthday and spouse fields are empty for nearly every contact in BoldTrail
itself. That is their data, not a gap in the import.

`lead_type` holds a single value (first by precedence) and `deal_types` holds
every role. That distinction matters: only **8** contacts have "seller" as their
primary type, but **658** are sellers in some capacity — a single column was
hiding 650 of them.

Top tags: `investor` (391), `crexi` (371), `vikings` (256), `housejet` (100),
`mansfield-NC` (58), plus `import…` batch markers.

---

## Migrations

Applied: `add_contact_enrichment`, `create_contact_listings`,
`add_boldtrail_sync`, `add_contact_details`, `update_lead_types`,
`add_external_notes`, `extend_contact_submissions_for_inquiries`,
`create_campaign_media_bucket`.

**Not applied — `supabase/create_campaigns.sql`.** It renames `image_url` to
`media_url` and adds `media_type`. Until it runs, `/api/campaigns` returns
**500** in production (`column campaigns.media_url does not exist`). This came
from commit `a7e11c1`, not from the sync work. Note that
`create_campaign_media_bucket.sql` is a *different* file — it creates the storage
bucket, not the columns.

---

## Operating it

- **Scheduled:** `vercel.json` runs `/api/sync/boldtrail` daily at 07:00 UTC.
  `/api/sync` had to be added to `proxy.ts` — without it the cron call is 302'd
  to `/login`, which Vercel Cron records as a success while nothing runs.
- **Manual:** the `/sync` page. "Preview changes" is a dry run that writes
  nothing.
- **Bulk:** `scripts/sync-boldtrail.mjs --enrich` for full records and
  `--extras` for tags and notes. Both are resumable — re-run *without* `--all`
  to continue rather than restart.
- **Re-map after a mapping change:** `GET /api/sync/boldtrail?remap=1` with the
  `x-api-key` header. Re-derives every column from stored payloads at **zero API
  cost**. This is precisely why enrichment stores the raw payload separately.
- **Export:** `scripts/export-contacts.mjs` writes a CSV (`--with-names`
  optional). `*.csv` is gitignored — those files hold real client details.

Vercel production env vars: `BOLDTRAIL_API_TOKEN`, `BOLDTRAIL_API_BASE`,
`CRON_SECRET`, `BOLDTRAIL_MIN_INTERVAL_MS`, `BOLDTRAIL_DETAIL_BATCH`.

---

## Also built this session

- **Listing lifecycle.** A `sold` status, `markListingSold`, Active/Sold/Archived
  tabs, a `contact_listings` join table, and follow-up prompts when a listing
  sells. Sold listings are archived, never deleted — Atlas M0 has no
  point-in-time restore, and sold comps are the most valuable record an agent
  accumulates. A sold listing leaves the public site for free, because
  `GET /api/listings` already defaults to `status=published`.
- **Richer CSV import**, plus disclosure of unmapped columns and a read-back
  panel for `contacts.raw` — written since day one but never displayed until now.

---

## Outstanding

1. **Their `status` codes are unmapped**, so all 978 contacts sit in "New".
   Five values exist. Open these in BoldTrail and read the label shown:
   `0` → `139074352` · `1` → `144070736` · `3` → `138961831` ·
   `4` → `139258726` · `7` → `144048891`.
2. **Run `supabase/create_campaigns.sql`** — `/api/campaigns` is 500 in
   production until it does.
3. **A test contact needs deleting by hand:** id `145355642`
   (`boldtrail-probe+…@stevenmoning.invalid`), created by the write probe.
   `DELETE` is not in the token's scope, so it cannot be removed via the API.
4. **Rotate the Atlas credential.** A credential string sat in the committed
   `.env.local.example` from `0fe8c8e` onwards, in a public repo. It has been
   replaced with a placeholder, but removing it now does not unpublish it — it
   remains in git history.
5. **Tags/notes write-back is disabled.** `PUT` on both returned **422** — the
   right endpoint with the wrong body shape. Working it out needs live calls.
6. **Pipeline cannot round-trip.** BoldTrail has no deals or opportunities
   object at all, so `stage`, `next_follow_up`, `last_contacted_at` and `notes`
   are panel-only. The UI states this, rendered from `FIELD_SYNC_POLICY` so the
   legend cannot drift from the actual behaviour.
