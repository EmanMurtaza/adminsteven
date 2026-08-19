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

**There is now one file: `supabase/setup.sql`.** Paste it into the Supabase SQL
editor and run it. It is idempotent, so it can be re-run any time, and it is the
only thing that ever needs running. The live database is already up to date with
it; the file matters for rebuilding from scratch and for reading what a column is
actually for.

The fourteen separate migration files it replaces have been deleted. They had to
be applied in the right order by hand, and by the eighth of them "which of these
has actually run on production" was no longer answerable from the repository —
which is how `/api/campaigns` came to return **500** in production for weeks with
the fix sitting unapplied in the repo the whole time. That fix (the `image_url`
→ `media_url` rename, from commit `a7e11c1`) is now section 7 of `setup.sql`.

**Both are applied as of 19 August 2026** — the stage change and the campaigns
rename — and verified against production: `/api/campaigns` returns **200**, and
the pipeline reads 111 New Lead · 14 Prospect · 641 Active Lead · 27 Client ·
191 Archived across 984 contacts.

Only two other files remain in `supabase/`: `schema.sql`, which documents the
tables shared with the main website and is not runnable, and
`CAMPAIGNS_SETUP.md`. The old `blog_posts` → `blogs` migration was deleted rather
than folded in — it ended in `DROP TABLE`, it has already run, and a destructive
one-shot has no place in a file whose whole promise is that re-running it is
safe. It is in git history if it is ever wanted.

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

## Lead status — the codes are NOT positional

The first version of this read BoldTrail's numeric `status` as an index into the
order their statuses are displayed in — `STAGES[code]`. That was wrong, and it
mislabelled four of the five codes in this account. Most visibly, the **638
Spheres were showing as Active Leads**.

Their API returns the number and never a label, so the mapping was established
by matching our per-code counts against the totals BoldTrail's own UI reports:

| code | contacts | label | had been |
|---|---|---|---|
| `0` | 109 | New Lead | New Lead ✓ |
| `1` | 13 | **Client** | Prospect |
| `3` | 638 | **Sphere** | Active Lead |
| `4` | 27 | **Active Lead** | Client |
| `7` | 191 | **Prospect** | Archived |

Codes `2`, `5` and `6` hold no contacts here, so there is nothing to match them
against. They are Contract, Closed and Archived in some order and are left
**unmapped** rather than guessed at a second time — `takeUnmappedStatuses` in
`lib/boldtrail/mapping.ts` records any that appear into `sync_runs.detail`, so a
new code announces itself instead of quietly becoming a New Lead.

BoldTrail reports 4 Archived contacts and none of them reach us: their list
endpoint appears to exclude archived records, which is why we hold 978 of their
982.

The correction ran over the 978 already imported, guarded so that any stage
moved by hand survives — 869 rows changed, 0 hand-moved rows touched. Resulting
distribution: Sphere 638 · Prospect 192 · New Lead 111 · Active Lead 30 ·
Client 13. (The four small excesses over BoldTrail's own counts are the six
contacts that never came from BoldTrail.)

`STAGES` order in `lib/contacts.ts` is unchanged — the display order was always
right; only the code→stage translation was wrong. Do not re-derive one from the
other.

BoldTrail decides where a contact *starts* and nothing more. `stage` is in
`INSERT_COLUMNS` but deliberately not in `UPDATE_COLUMNS`, so a later pull never
moves a card Steven has moved, and it is never pushed back either.

---

## Hashtags

Tags now have a table of their own, `contact_tags`. Before it, `contacts.tags`
recorded which tags a contact *has* but nothing recorded that a tag *exists* —
untag the last contact carrying "cashbuyer" and the tag was gone, along with any
chance of picking it from a list. Every tag input was therefore free text, which
is how one idea ended up stored as `Client`, `client` and `Seller`.

- **Canonical form is lower case.** Postgres array containment is exact, so a
  contact stored as `Client` was invisible to every filter looking for `client`.
  Nine tags were folded across 76 contact rows by
  `scripts/backfill-tags.mjs`; both write paths lower-case from now on.
- **44 tags**, six of them `import<digits>` batch markers flagged `is_hidden` —
  real tags on real contacts, but provenance rather than vocabulary, so they
  stay out of pickers unless searched for by name.
- **One picker everywhere** (`TagPicker`): the contact page, the add-contact
  form on three screens, and the Hashtags column filter. Search, usage counts,
  and "Create «foo»" for something genuinely new.
- **Filtering is `overlaps`, not `contains`** — picking `investor` and `crexi`
  means either, the same rule Type and Stage already follow.
- Every path that can invent a tag calls `registerTags`, so a tag used once is
  immediately offered everywhere else. A sync registers BoldTrail's tags the
  same way, which is what makes an imported contact arrive with its hashtags
  already known.

---

## Multiple types per contact — now shown, not just stored

`deal_types` has held every role since the sync was built, but almost nothing
*displayed* it: the Type column, the pipeline card and the analytics chart all
read the single `lead_type`. In this account that hides most of the answer.

| Roles held | Contacts |
|---|---|
| three (all `buyer+seller+renter`) | 649 |
| one | 238 |
| none | 93 |
| two | 4 |

**Two thirds of the list is multi-role**, and 649 contacts were rendering as
plain "Buyer". Per role in any capacity: buyer 876, seller 658, renter 649,
vendor 5, agent 4.

Fixed in the four places a type is shown, off two new helpers in
`lib/contacts.ts` — `allRoles` (primary first) and `secondaryRoles`:

- **Contacts table** — the `lead_type` select stays editable and the extra roles
  sit under it as read-only chips. They are BoldTrail's; the select changes
  which one leads. The old "Also" row in the expand panel is gone, now duplicated.
- **Pipeline card** — every role as a badge instead of just the primary.
- **CSV import preview** — shows what will actually be stored, so a
  "Buyer & Seller" column is visible as both before the import is committed.
- **Analytics "Lead type"** — was counting `lead_type` with `eq`, so it reported
  **8** sellers in an account with **658**, and disagreed with the contacts list,
  whose Type filter has always matched on `deal_types`. Now `contains`, like the
  filter.

That last one also changed the chart: **a pie became bars.** Roles overlap and
sum to 2,192 across 984 contacts, so slices claiming to be parts of a whole were
misrepresenting the data whatever numbers fed them. Each bar is read against the
contact total instead, with a line saying the buckets overlap.

`lead_type` still exists and is still single — the pipeline board, badges and
sort order need one value to group by. It is the first role by precedence
(buyer > seller > renter > vendor > agent), not the only one.

## What BoldTrail will not give us

Of the columns their web UI shows, seven have no source in the API on this token.
Established by probing, not assumed:

| Column | Why not |
|---|---|
| Calls | `/contact/{id}/action/call` → **401**, outside the token's scope |
| Emails | `/contact/{id}/action/email` → **404** |
| Texts | `/contact/{id}/action/text` → **404** |
| Latest Comm | no such field in the 83; `last_call` exists but is set on only 32 |
| Pond, Interest, Next Action | absent from the payload, and no endpoint serves them |

Those counters are aggregates computed inside their UI. Everything else on that
list — first/last name, phone, status, type, last visit, hashtags, rating,
location, created, source, owned by — is read and stored.

Two caveats on what "read" means here: **Location** is filled for only 19 of 978
contacts and **Last Visit** for 16, because those fields are empty in BoldTrail
itself. And **Owned By** is a single agent UUID across all 978 — their API never
returns a display name for it.

---

## Outstanding

1. **A test contact needs deleting by hand:** id `145355642`
   (`boldtrail-probe+…@stevenmoning.invalid`), created by the write probe.
   `DELETE` is not in the token's scope, so it cannot be removed via the API.
2. **Rotate the Atlas credential.** A credential string sat in the committed
   `.env.local.example` from `0fe8c8e` onwards, in a public repo. It has been
   replaced with a placeholder, but removing it now does not unpublish it — it
   remains in git history.
3. **Tags/notes write-back is disabled.** `PUT` on both returned **422** — the
   right endpoint with the wrong body shape. Working it out needs live calls.
4. **Pipeline cannot round-trip.** BoldTrail has no deals or opportunities
   object at all. Their lead status seeds `stage` on the way in, but nothing
   goes back: `stage`, `next_follow_up`, `last_contacted_at` and `notes` are all
   panel-only from that point on. The UI states this, rendered from
   `FIELD_SYNC_POLICY` so the legend cannot drift from the actual behaviour.
