// Import the SECOND tab of the Google Sheet (gid=1495066280) into MongoDB `listings`.
//
// The first importer (import-listings-v2.mjs) only ever read gid=0 — the stacked
// wholesale sections. The workbook has two more tabs; gid=1825204750 is header-only
// (empty), and gid=1495066280 is a flat MLS-style table that was never imported:
//
//   0 ADDRESS | 1 MLS# | 2 AGENT | 3 Phone | 4 BROKERAGE | 5 STATUS | 6 PRICE | 7 DESCRIPTION
//
// Differences from tab 1 that matter:
//   - These carry real prices and MLS numbers (tab 1's section 1 had neither).
//   - They are public MLS listings, not private wholesale deals: no owner names,
//     no parcel IDs, no legal descriptions. Agent/phone/brokerage go in `meta`,
//     which the public API strips (app/api/listings/route.ts).
//   - Every row is a land parcel (STATUS is "Land"/"Unimproved Land"), so
//     property_type stays "land" and bedrooms/bathrooms/square_footage stay null.
//
// Status follows the house rule: priced -> published, price-less -> draft.
//
// meta.source is "google_sheet_import_mls" (NOT "google_sheet_import") so that
// re-running import-listings-v2.mjs --write, which deletes its own batch by
// source, can never wipe these rows.
//
// Usage:
//   node --env-file=.env.local scripts/import-listings-mls-tab.mjs           # dry-run
//   node --env-file=.env.local scripts/import-listings-mls-tab.mjs --write   # insert missing

import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1rBa6fewvlZgYeNHBJpY6g5JISUwd3vfaugxOKfqjeWU/export?format=csv&gid=1495066280";
const SOURCE = "google_sheet_import_mls";
const WRITE = process.argv.includes("--write");

// --- minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (v) => (v ?? "").replace(/\s+/g, " ").trim();
const orNull = (v) => { const c = clean(v); return c === "" ? null : c; };
const titleCase = (s) => clean(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const MULTI_WORD_CITIES = new Set(["fort worth", "red oak", "cedar hill", "honey grove", "grand prairie", "glenn heights"]);

// Typos in the sheet that would otherwise render on the public site.
const CITY_FIX = { dallass: "Dallas" };

// Tab-2 addresses separate street from city with a comma OR a stray dash:
// "2506 Givendale Rd -Dallas, TX 65241", "1718 W Main St- Lancaster, Tx 75246",
// "3035 Simpson Stuart Rd Lancaster, Tx 75241"
function parseAddress(raw) {
  let s = clean(raw).replace(/\s*-\s*(?=[A-Za-z]+,?\s*(?:TX|Texas)\b)/i, ", ");
  const m = s.match(/,?\s*\b(?:TX|Texas)\b\.?\s*(\d{4,5}(?:-\d{4})?)?\s*$/i);
  let zip = null;
  if (m) { zip = m[1] || null; s = s.slice(0, m.index).trim(); }
  s = s.replace(/[,-]\s*$/, "").trim();

  let city = null, street = s;
  if (s.includes(",")) {
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    city = parts[parts.length - 1];
    street = parts.slice(0, -1).join(", ");
  } else {
    const tokens = s.split(" ").filter(Boolean);
    const lastTwo = tokens.slice(-2).join(" ").toLowerCase();
    if (tokens.length > 2 && MULTI_WORD_CITIES.has(lastTwo)) {
      city = tokens.slice(-2).join(" ");
      street = tokens.slice(0, -2).join(" ");
    } else if (tokens.length > 1) {
      city = tokens[tokens.length - 1];
      street = tokens.slice(0, -1).join(" ");
    }
  }
  if (city) city = CITY_FIX[city.toLowerCase()] ?? titleCase(city);
  return { street: street || s || null, city: city || null, zip };
}

// DFW zips are 75xxx/76xxx. Anything else is a sheet typo — keep the value, flag it.
const suspiciousZip = (zip) => zip != null && !/^7[56]\d{3}$/.test(zip);

// "$55,000.00" / "$90,000" -> 55000 / 90000. Never fabricate: unparseable -> null.
function parsePrice(raw) {
  const c = clean(raw);
  if (!c || /not\s*available/i.test(c)) return null;
  const m = c.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// DESCRIPTION column holds lot size in mixed forms, sometimes BOTH:
// "9,104 sqft", "0.613 Acres", "2.5Acres", "5,967 Square Feet Lot/ 0.136-acre",
// "6055 SQ FT 0.139 Acre". ".025 Lot" is ambiguous (lot number?) -> leave unparsed.
function parseLot(raw) {
  const c = clean(raw);
  if (!c) return { acres: null, sqft: null, raw: null };
  const a = c.match(/(\d*\.?\d+)\s*-?\s*acres?\b/i);
  const s = c.match(/([\d,]+)\s*(?:sq\s*\.?\s*ft\b|sqft\b|square\s*feet\b)/i);
  const acres = a ? Number(a[1]) : null;
  const sqft = s ? Number(s[1].replace(/,/g, "")) : null;
  return {
    acres: Number.isFinite(acres) && acres > 0 ? acres : null,
    sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : null,
    raw: c,
  };
}

// Normalized key for dedupe against rows already in Mongo (from either tab).
function addrKey(street, zip) {
  const st = (street || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b(road)\b/g, "rd").replace(/\b(street)\b/g, "st")
    .replace(/\b(drive)\b/g, "dr").replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(boulevard)\b/g, "blvd").replace(/\b(lane)\b/g, "ln")
    .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return `${st}|${zip || ""}`;
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const res = await fetch(SHEET_CSV_URL);
if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
const rows = parseCsv(await res.text());
const now = new Date();

const docs = [];
const skipped = [];

rows.forEach((cells, rowIndex) => {
  if (rowIndex === 0) return;                      // column header
  const addrRaw = clean(cells[0]);
  if (!addrRaw) return;                            // blank / spacer row
  if (/^address\b/i.test(addrRaw)) return;         // stray repeated header

  const { street, city, zip } = parseAddress(addrRaw);
  if (!street) { skipped.push({ rowIndex, addrRaw, why: "unparseable address" }); return; }

  const mlsRaw = clean(cells[1]);
  const offMarket = /off\s*market/i.test(mlsRaw);
  const mls = /^\d+$/.test(mlsRaw) ? mlsRaw : null;

  const price = parsePrice(cells[6]);
  const lot = parseLot(cells[7]);

  const title = city ? `${street}, ${city}` : street;
  const slug = `${slugify(title)}-${createHash("sha1").update(mlsRaw || addrRaw).digest("hex").slice(0, 6)}`;

  const meta = {
    source: SOURCE,
    imported_at: now.toISOString(),
    sheet_gid: "1495066280",
    sheet_row_index: rowIndex,
    agent: orNull(cells[2]),
    agent_phone: orNull(cells[3]),
    brokerage: orNull(cells[4]),
    mls_status: orNull(cells[5]),
    off_market: offMarket || undefined,
    lot_size_raw: lot.raw,
    sheet_row: cells.map(clean),
  };
  for (const k of Object.keys(meta)) if (meta[k] == null) delete meta[k];

  docs.push({
    title,
    slug,
    description: null,
    property_type: "land",                        // every row is a parcel
    status: price != null ? "published" : "draft", // house rule: no price -> draft
    is_featured: false,
    is_off_market: offMarket,                     // MLS# cell literally reads "OFF MARKET"
    address: street,
    city,
    state: "TX",
    zip_code: zip,
    neighborhood: null,
    county: null,
    price,
    price_per_sqft: null,
    hoa_fee: null,
    tax_annual: null,
    bedrooms: null,
    bathrooms: null,
    half_bathrooms: null,
    square_footage: null,                         // land: no interior sqft
    lot_size_sqft: lot.sqft,
    lot_size_acres: lot.acres,
    year_built: null,
    garage_spaces: 0,
    stories: 1,
    pool: false,
    images: [],
    virtual_tour_url: null,
    video_url: null,
    mls_number: mls,
    listing_date: null,
    days_on_market: null,
    meta,
    created_at: now,
    updated_at: now,
  });
});

const client = new MongoClient(uri);
await client.connect();
try {
  const col = client.db("stevenmoning").collection("listings");

  // Dedupe against everything already in the collection (tab 1 + any prior run).
  const existing = await col.find({}, { projection: { address: 1, zip_code: 1, slug: 1 } }).toArray();
  const existingKeys = new Set(existing.map((d) => addrKey(d.address, d.zip_code)));
  const existingSlugs = new Set(existing.map((d) => d.slug).filter(Boolean));

  const missing = [];
  const already = [];
  for (const d of docs) {
    if (existingKeys.has(addrKey(d.address, d.zip_code)) || existingSlugs.has(d.slug)) already.push(d);
    else missing.push(d);
  }

  console.log(`Tab 2 (gid=1495066280): parsed ${docs.length} listing(s).`);
  console.log(`Already in MongoDB: ${already.length}`);
  console.log(`MISSING (to insert): ${missing.length}\n`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} row(s):`);
    for (const s of skipped) console.log(`  [${s.rowIndex}] ${s.why}: ${s.addrRaw}`);
    console.log();
  }
  const odd = docs.filter((d) => suspiciousZip(d.zip_code));
  if (odd.length) {
    console.log(`Suspicious zip(s) — kept as-is from the sheet, worth fixing at source:`);
    for (const d of odd) console.log(`  ! ${d.title} -> zip ${d.zip_code}`);
    console.log();
  }

  for (const d of already) console.log(`  = already: ${d.title}`);
  for (const d of missing) {
    const lot = d.lot_size_acres ? `${d.lot_size_acres} ac` : d.lot_size_sqft ? `${d.lot_size_sqft} sf` : "-";
    console.log(
      `  + ${d.status.padEnd(9)} ${d.title} ${d.zip_code || ""} | $${d.price ?? "-"} | ${lot} | mls ${d.mls_number ?? "-"}`
    );
  }

  if (!WRITE) {
    console.log("\nDRY RUN — pass --write to insert the missing listings.");
  } else if (missing.length === 0) {
    console.log("\nNothing to insert.");
  } else {
    const r = await col.insertMany(missing);
    console.log(`\nInserted ${r.insertedCount} listing(s).`);
  }
} finally {
  await client.close();
}
