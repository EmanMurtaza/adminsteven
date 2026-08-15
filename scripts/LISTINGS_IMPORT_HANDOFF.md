# Listings Import — Handoff / Re-parse Task

## Goal
Re-parse the Google Sheet of land deals into the MongoDB `listings` collection **more
accurately** than the first pass. The first import (`scripts/import-listings-from-sheet.mjs`)
worked but was crude: it scanned each row for *any* cell matching a TX-address regex and
dumped every other column into an unordered `meta.sheet_data` array. That lost the column
semantics (owner vs mailing address vs parcel ID vs price vs lot size). We want a
column-aware parse instead.

## Current state (already done — do NOT redo)
- MongoDB Atlas free (M0) cluster is live and connected. DB = `stevenmoning`, collection = `listings`.
- `lib/mongodb.ts` (cached client) and `lib/listings.ts` (CRUD data layer) exist and are used by
  the admin API routes (`app/api/listings/route.ts`, `[id]/route.ts`) and dashboard pages.
- The `listings` collection has indexes: `slug_unique` (partial, string slugs only),
  `status_1`, `property_type_status`, `created_at_desc`.
- 44 draft listings were imported from the sheet on the first pass. **Before re-importing,
  delete the existing `source: "google_sheet_import"` docs** so we don't duplicate:
  `db.listings.deleteMany({ "meta.source": "google_sheet_import" })`.

## Connection quirk (IMPORTANT)
`mongodb+srv://` SRV DNS lookups are **blocked on this network** — Node throws
`querySrv ECONNREFUSED` even though the OS resolver works. `.env.local` already uses the
**standard non-SRV** connection string (explicit shard hosts). Keep using it; don't switch back
to `mongodb+srv://`. All scripts run with `node --env-file=.env.local scripts/<name>.mjs`.

## The Listing schema (target shape — see `lib/types.ts`)
Key fields: `title`, `slug` (unique), `description`, `property_type` (`"luxury" | "land" | "dorms"`),
`sales_channel` (`"on_market" | "off_market" | "wholesale"` — the sub-type; `is_off_market` is the
legacy boolean view of it and is kept in sync automatically),
`status` (`"draft" | "published" | "archived"`), `is_featured`, `address`, `city`, `state` (default "TX"),
`zip_code`, `neighborhood`, `county`, `price` (number), `bedrooms`, `bathrooms`, `square_footage`,
`lot_size_sqft`, `lot_size_acres`, `year_built`, `images` (string[]), `mls_number`, `meta` (jsonb),
`created_at`, `updated_at`. For these deals: `property_type: "land"`, `status: "draft"`, no images.

## THE SHEET — structure & the actual parsing challenge
Public CSV export (no auth needed):
`https://docs.google.com/spreadsheets/d/1rBa6fewvlZgYeNHBJpY6g5JISUwd3vfaugxOKfqjeWU/export?format=csv&gid=0`

The sheet is **several stacked sections, each with a DIFFERENT column layout**, separated by
ALL-CAPS agent/contact header rows (the same name repeated across the first few cells, sometimes
with a phone number):
- `CEDRIC LANCASTER` — section 1
- `ALEX  469-895-4001` — section 2
- `MASON RYAN` — section 3 (appears empty in current data)
- `STEVEN WILSON  945-328-2133` — section 4 (appears empty)

**Section 1 column layout** (0-indexed), rows under the "Title Company / Owners / Address / Parcel ID …" header:
- 0: Holding entity / seller (e.g. "Lexar Estate LLC", "Propmovers") — mislabeled "Title Company"
- 2: Owner name(s)
- 3: **Property address** (e.g. `518 W Fm 1753 Bonham, TX 75418`)
- 4: Parcel ID
- 5: Legal description
- 7: Type (`lot` / `Acerage`)
- 8: Zoning (`Residential` / `Commercial`)
- 12: Owner **mailing** address (different from property address; often blank)
- 13: Terms (`All Cash`)
- 14: Subdivision
- 15: Closing title company
- 17: a yes/no (survey?)
- **No price column populated in section 1** — that's why section-1 rows legitimately have `price: null`.

**Section 2 column layout** (rows 45–56, everything shifted ~2 cols left — no holding-entity column):
- 0: Owner name
- 1: **Property address**
- 2: Parcel ID
- 3: Legal description
- 5: Type
- 6: Zoning
- 8: **Price** (shorthand like `195k`, `45k`, or `Not Available`)
- 10: Owner mailing address
- 11: Terms
- 13: Closing title company
- 18: Flood zone (e.g. `500 year flood`, `Out of Special Flood Hazard Area`)
- 19: Utilities (`yes`, or a list like `"City Sewer, City Water, …"`)
- 20: Survey status (`Received` / `Not Available`)
- 22: Lot size (e.g. `6,377 Sqft (127 x 50)`, `1.12 Acres`)

There are also sparse trailing rows (57–60) with only an address in one cell and no other data.

## What "better parsing" should do
1. **Detect section boundaries** by recognizing the ALL-CAPS agent-header rows, and tag each
   listing with its source agent in `meta.agent` (Cedric Lancaster / Alex / etc.).
2. **Apply the correct per-section column map** instead of a blind address scan, so each field
   lands in the right place.
3. **Map columns to real Listing fields**: owner → `meta.owner`; property address → split into
   `address` / `city` / `state` / `zip_code`; parcel ID → `meta.parcel_id` (or `mls_number`);
   legal description → `meta.legal_description`; price shorthand (`195k`) → `price` (195000);
   lot size string → parse into `lot_size_acres` or `lot_size_sqft` where possible, keep raw in
   `meta.lot_size_raw`; flood zone, utilities, survey, subdivision, closing title company,
   mailing address, terms → structured keys under `meta`.
4. **Fix city extraction** — the #1 weakness last time. Many addresses put city right after the
   street with no comma (`"518 W Fm 1753 Bonham"` → city = Bonham). Use the trailing token before
   the state/zip, and cross-reference the legal description / subdivision when ambiguous.
5. Keep **`status: "draft"`**, `property_type: "land"`, and stamp `meta.source: "google_sheet_import"`
   + `meta.imported_at` so a re-run can be cleanly deleted/re-imported. Also keep the full raw row
   in `meta.sheet_row` as a lossless backup.
6. Generate a **stable unique slug** (e.g. slugify(address) + short hash of parcel ID) so re-imports
   are idempotent and the `slug_unique` index doesn't collide.

## Constraints / gotchas
- These are private wholesale/acquisition deals (owner names, parcel IDs) — keep everything
  **draft**, never auto-publish.
- Some rows are genuinely price-less; don't fabricate prices.
- Percent-encoded password already handled in the URI; don't touch the connection string.
- Run a dry-run first (print parsed docs, no insert) so a human can eyeball the column mapping
  before writing 44+ docs.
