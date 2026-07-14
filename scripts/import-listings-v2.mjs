// Section-aware import of the Google Sheet land deals into MongoDB `listings`.
//
// Unlike the first pass (import-listings-from-sheet.mjs), this understands that
// the sheet is several stacked sections, each with a DIFFERENT column layout,
// separated by ALL-CAPS agent-header rows. Sections are detected dynamically
// (their row ranges are NOT hardcoded), the correct per-section column map is
// applied, and every field lands in the right Listing field or a structured
// `meta.*` key. The full raw row is kept in `meta.sheet_row` as a lossless
// backup, and a stable slug (address + parcel-id hash) makes re-runs idempotent.
//
// Decisions (were left open in the handoff):
//   - Parcel ID -> `meta.parcel_id` (NOT `mls_number`): these are off-market
//     wholesale deals with no MLS listing, so `mls_number` stays null.
//
// Usage:
//   node --env-file=.env.local scripts/import-listings-v2.mjs            # dry-run (prints, no DB)
//   node --env-file=.env.local scripts/import-listings-v2.mjs --write    # deletes old batch + inserts
//
// Dry-run also writes the full parsed docs to scripts/_import-preview.json.

import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1rBa6fewvlZgYeNHBJpY6g5JISUwd3vfaugxOKfqjeWU/export?format=csv&gid=0";

const WRITE = process.argv.includes("--write");

// --- minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines/escaped quotes) ---
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

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(str) {
  return clean(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- section detection --------------------------------------------------------
// An agent header is an ALL-CAPS name repeated across the first few cells,
// e.g. ["ALEX", "ALEX 469-895-4001", "ALEX", "ALEX", "ALEX"].
function agentHeader(cells) {
  const c0 = clean(cells[0]);
  if (!c0) return null;
  const isUpper = /[A-Z]/.test(c0) && !/[a-z]/.test(c0);
  if (!isUpper) return null;
  const firstWord = c0.split(" ")[0];
  const repeated = [1, 2, 3, 4].some((i) => clean(cells[i]).toUpperCase().startsWith(firstWord));
  if (!repeated) return null;
  // The longest of the first cells usually carries the phone number.
  const withPhone = cells.slice(0, 5).map(clean).find((c) => /\d/.test(c)) || c0;
  const phone = (withPhone.match(/\d[\d\s()-]{6,}\d/) || [null])[0];
  const name = titleCase(c0);
  return { name, contact: phone ? phone.trim() : null };
}

// The column-label row under a section header ("Owners", "Address", "Parcel ID"...).
function isColumnHeader(cells) {
  const joined = cells.map(clean).join(" | ").toLowerCase();
  const hits = ["parcel id", "legal description", "owners", "zoning"].filter((h) => joined.includes(h));
  return hits.length >= 2;
}

// --- per-section column maps (0-indexed) --------------------------------------
const SECTION_MAPS = {
  cedric: {
    holding: 0, owner: 2, address: 3, parcel: 4, legal: 5,
    type: 7, zoning: 8, mailing: 12, terms: 13, subdivision: 14,
    title_company: 15, survey: 17,
  },
  alex: {
    owner: 0, address: 1, parcel: 2, legal: 3, type: 5, zoning: 6,
    price: 8, mailing: 10, terms: 11, title_company: 13,
    flood_zone: 18, utilities: 19, survey: 20, lot_size: 22,
  },
};

function mapForAgent(name) {
  const n = name.toLowerCase();
  if (n.startsWith("cedric")) return SECTION_MAPS.cedric;
  if (n.startsWith("alex")) return SECTION_MAPS.alex;
  return null; // Mason Ryan / Steven Wilson have no populated columns
}

// --- field parsers ------------------------------------------------------------
const MULTI_WORD_CITIES = new Set([
  "fort worth", "haltom city", "red oak", "cedar hill", "honey grove",
  "royse city", "wills point", "bluff dale", "blue ridge", "san antonio",
  "grand prairie", "flower mound", "round rock", "glenn heights", "the colony",
]);

function parseAddress(raw) {
  let s = clean(raw);
  const stateRe = /,?\s*\b(?:TX|Texas)\b\.?\s*(\d{4,5}(?:-\d{4})?)?\s*$/i;
  const m = s.match(stateRe);
  let zip = null;
  if (m) { zip = m[1] || null; s = s.slice(0, m.index).trim(); }
  s = s.replace(/,\s*$/, "").trim();

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
  return { street: (street || s) || null, city: city ? titleCase(city) : null, zip };
}

function parsePrice(raw) {
  const c = clean(raw);
  if (!c || /not\s*available/i.test(c)) return null;
  const m = c.match(/\$?\s*([\d,.]+)\s*([kKmM]?)/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (m[2].toLowerCase() === "k") n *= 1000;
  else if (m[2].toLowerCase() === "m") n *= 1_000_000;
  return Math.round(n);
}

// Acreage appears in both orders in the data: "5.332 ACRES" / "1.245 AC"
// (number first) and "ACRES 1.2" / "ACRES: 6.020" (number after). Handle both,
// and never let a thousands-comma bleed into the match (e.g. "LOT 14, ACRES 1.2"
// must not read "14" as the acreage).
function parseAcres(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*ac(?:res?|\b)/i); // "5.332 ACRES", "1.245 AC"
  if (m) return Number(m[1]);
  m = text.match(/acres?\s*:?\s*(\.?\d+(?:\.\d+)?)/i);     // "ACRES 5.332", "ACRES: 6.020", "ACRES .1492"
  if (m) return Number(m[1]);
  return null;
}

// Pull acreage / sqft out of a free-text lot-size or legal-description string.
function parseLotSize(raw) {
  const c = clean(raw);
  if (!c) return { acres: null, sqft: null };
  const sqftM = c.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s?ft|sqft|sf)\b/i);
  const acres = parseAcres(c);
  const sqft = sqftM ? Math.round(Number(sqftM[1].replace(/,/g, ""))) : null;
  return {
    acres: Number.isFinite(acres) ? acres : null,
    sqft: Number.isFinite(sqft) ? sqft : null,
  };
}

// A parcel id is mostly digits (sometimes a letter prefix); reject free text
// like "8,156 sq ft Each 2 Lots" that lands in the parcel column on sparse rows.
function looksLikeParcel(raw) {
  const c = clean(raw);
  return /^[A-Za-z]?\d[\dA-Za-z-]*$/.test(c) && !/sq\s?ft|acre/i.test(c);
}

function looksLikeAddress(raw) {
  const c = clean(raw);
  if (!c) return false;
  // has a leading street number OR a road/street type word, plus a place name
  return /\d/.test(c) || /\b(?:street|st|road|rd|ave|avenue|drive|dr|lane|ln|court|ct|circle|blvd|way|trail|terrace)\b/i.test(c);
}

function nonEmptyCount(cells) {
  return cells.filter((c) => clean(c) !== "").length;
}

// --- build a listing doc from a data row --------------------------------------
function buildDoc(cells, map, agent, rowIndex, now) {
  const g = (key) => (map[key] != null ? orNull(cells[map[key]]) : null);

  const addressRaw = g("address");
  if (!addressRaw || !looksLikeAddress(addressRaw)) return null;

  const { street, city, zip } = parseAddress(addressRaw);

  // Price only exists in the alex section.
  const price = map.price != null ? parsePrice(cells[map.price]) : null;

  // Lot size: prefer the dedicated column; else scan the row; else the legal desc.
  const legal = g("legal");
  let lotRaw = g("lot_size");
  if (!lotRaw) {
    const scan = cells.map(clean).find((c) => /\bsq\.?\s?ft\b|\bsqft\b|\bacres?\b/i.test(c));
    lotRaw = scan || null;
  }
  let { acres, sqft } = parseLotSize(lotRaw || "");
  if (acres == null && legal) acres = parseLotSize(legal).acres; // e.g. "... ACRES 5.332"

  const parcelRaw = g("parcel");
  const parcel = parcelRaw && looksLikeParcel(parcelRaw) ? parcelRaw : null;

  const owner = g("owner");
  const zoning = g("zoning");
  const type = g("type");
  const subdivision = g("subdivision");
  const titleCompany = g("title_company");
  const mailing = g("mailing");
  const terms = g("terms");
  const floodZone = g("flood_zone");
  const utilities = g("utilities");
  const survey = g("survey");
  const holding = g("holding");

  // Title + description in plain English.
  const title = city ? `${street}, ${city}` : street;
  const descBits = [];
  descBits.push(`Vacant ${zoning ? zoning.toLowerCase() + " " : ""}land parcel${city ? ` in ${city}, TX` : ""}.`);
  if (acres) descBits.push(`Approximately ${acres} acre${acres === 1 ? "" : "s"}.`);
  else if (sqft) descBits.push(`Approximately ${sqft.toLocaleString()} sq ft.`);
  if (subdivision && !/^n\/?a$/i.test(subdivision)) descBits.push(`Subdivision: ${subdivision}.`);
  const description = descBits.join(" ");

  // Stable slug: address + short hash keyed on parcel (fallback address).
  const hash = createHash("sha1").update(parcel || addressRaw).digest("hex").slice(0, 6);
  const slug = `${slugify(title || addressRaw)}-${hash}`;

  const meta = {
    source: "google_sheet_import",
    imported_at: now.toISOString(),
    sheet_row_index: rowIndex,
    agent: agent.name,
    agent_contact: agent.contact,
    owner,
    parcel_id: parcel,
    parcel_raw: parcelRaw && !parcel ? parcelRaw : null, // preserve rejected values
    legal_description: legal,
    zoning,
    land_type: type,
    subdivision: subdivision && !/^n\/?a$/i.test(subdivision) ? subdivision : null,
    closing_title_company: titleCompany,
    owner_mailing_address: mailing,
    terms,
    flood_zone: floodZone,
    utilities,
    survey_status: survey,
    holding_entity: holding,
    lot_size_raw: lotRaw,
    sheet_row: cells.map((c) => clean(c)),
  };
  // Drop null/empty meta keys (but always keep source/imported_at/sheet_row).
  for (const k of Object.keys(meta)) {
    if (meta[k] == null && !["source", "imported_at"].includes(k)) delete meta[k];
  }

  return {
    title,
    slug,
    description,
    property_type: "land",
    status: "draft",
    is_featured: false,
    is_off_market: true, // private wholesale/acquisition deals, never MLS-listed
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
    square_footage: null,
    lot_size_sqft: sqft,
    lot_size_acres: acres,
    year_built: null,
    garage_spaces: 0,
    stories: 1,
    pool: false,
    images: [],
    virtual_tour_url: null,
    video_url: null,
    mls_number: null,
    listing_date: null,
    days_on_market: null,
    meta,
    created_at: now,
    updated_at: now,
  };
}

async function main() {
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  const now = new Date();

  const docs = [];
  const skipped = [];
  let currentAgent = null;
  let currentMap = null;

  rows.forEach((cells, rowIndex) => {
    if (nonEmptyCount(cells) === 0) return;

    const header = agentHeader(cells);
    if (header) { currentAgent = header; currentMap = mapForAgent(header.name); return; }
    if (isColumnHeader(cells)) return;
    if (!currentAgent || !currentMap) return; // rows before any known section

    const doc = buildDoc(cells, currentMap, currentAgent, rowIndex, now);
    if (doc) docs.push(doc);
    else skipped.push({ rowIndex, agent: currentAgent.name, cells: cells.map(clean).filter(Boolean) });
  });

  // --- report -----------------------------------------------------------------
  const byAgent = {};
  for (const d of docs) byAgent[d.meta.agent] = (byAgent[d.meta.agent] || 0) + 1;
  console.log(`Parsed ${docs.length} listing(s):`);
  for (const [a, n] of Object.entries(byAgent)) console.log(`  ${a}: ${n}`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} non-listing row(s):`);
    for (const s of skipped) console.log(`  [${s.rowIndex}] ${s.agent}: ${s.cells.join(" | ").slice(0, 90)}`);
  }

  console.log("\n--- parsed listings (key fields) ---");
  for (const d of docs) {
    console.log(
      `[${String(d.meta.sheet_row_index).padStart(2)}] ${d.address ?? "?"} | ${d.city ?? "?"} ${d.zip_code ?? ""}` +
      ` | $${d.price ?? "-"} | ${d.lot_size_acres ? d.lot_size_acres + "ac" : d.lot_size_sqft ? d.lot_size_sqft + "sf" : "-"}` +
      ` | parcel ${d.meta.parcel_id ?? "-"} | ${d.meta.agent}`
    );
  }

  if (!WRITE) {
    const previewPath = new URL("./_import-preview.json", import.meta.url);
    writeFileSync(previewPath, JSON.stringify(docs, null, 2));
    console.log(`\nDRY RUN — nothing written to MongoDB.`);
    console.log(`Full parsed docs saved to scripts/_import-preview.json for review.`);
    console.log(`Re-run with --write to delete the old import batch and insert these.`);
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  if (uri.includes("<db_password>") || uri.includes("xxxxx"))
    throw new Error("MONGODB_URI still has placeholder values — fix .env.local first");

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const listings = client.db("stevenmoning").collection("listings");
    const del = await listings.deleteMany({ "meta.source": "google_sheet_import" });
    console.log(`\nDeleted ${del.deletedCount} previously-imported doc(s).`);
    const ins = await listings.insertMany(docs);
    console.log(`Inserted ${ins.insertedCount} draft listing(s).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
