// One-off import: pulls rows from the public Google Sheet and creates draft
// listings in MongoDB. Only rows with a recognizable TX address are kept —
// this naturally skips the sheet's section-label and header rows too.
// Every column that doesn't map to a known Listing field is preserved in
// `meta.sheet_data` so nothing gets lost, plus `meta.sheet_row` as a raw
// backup of the original row.
//
// Usage: node --env-file=.env.local scripts/import-listings-from-sheet.mjs

import { MongoClient } from "mongodb";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1rBa6fewvlZgYeNHBJpY6g5JISUwd3vfaugxOKfqjeWU/export?format=csv&gid=0";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");
if (uri.includes("<db_password>") || uri.includes("xxxxx")) {
  throw new Error("MONGODB_URI in .env.local still has placeholder values — fix it first");
}

// --- minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines/escaped quotes) ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const TX_ADDRESS_RE = /,?\s*TX\.?\s*(\d{5}(-\d{4})?)?\s*$/i;

function findAddress(cells) {
  for (const raw of cells) {
    const c = raw.replace(/\s+/g, " ").trim();
    if (c && TX_ADDRESS_RE.test(c)) return c;
  }
  return null;
}

function parseAddress(raw) {
  const match = raw.match(TX_ADDRESS_RE);
  const zip = match?.[1] ?? null;
  const stripped = match ? raw.slice(0, match.index).trim().replace(/,\s*$/, "") : raw;
  const parts = stripped.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 1] : null;
  const street = parts.length >= 2 ? parts.slice(0, -1).join(", ") : stripped;
  return { street, city, zip };
}

const PRICE_RE = /^\$?\s*([\d,]+)\s*[kK]$/;

function findPrice(cells) {
  for (const raw of cells) {
    const m = raw.trim().match(PRICE_RE);
    if (m) {
      const n = Number(m[1].replace(/,/g, "")) * 1000;
      if (n > 0) return n;
    }
  }
  return null;
}

function findLotSize(cells) {
  for (const raw of cells) {
    const c = raw.trim();
    if (/acres?/i.test(c) || /sq\s?ft/i.test(c)) return c;
  }
  return null;
}

function extraFields(cells, usedIndexes) {
  const out = [];
  cells.forEach((raw, i) => {
    const c = raw.trim();
    if (!c || usedIndexes.has(i)) return;
    out.push(c);
  });
  return out;
}

async function main() {
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  const csv = await res.text();
  const rows = parseCsv(csv);

  const client = new MongoClient(uri);
  await client.connect();
  const listings = client.db("stevenmoning").collection("listings");

  const docs = [];
  const now = new Date();

  rows.forEach((cells, rowIndex) => {
    const addressCellIndex = cells.findIndex((raw) => {
      const c = raw.replace(/\s+/g, " ").trim();
      return c && TX_ADDRESS_RE.test(c);
    });
    if (addressCellIndex === -1) return; // no address → skip (header/section-label/blank rows)

    const addressRaw = cells[addressCellIndex].replace(/\s+/g, " ").trim();
    const { street, city, zip } = parseAddress(addressRaw);
    const price = findPrice(cells);
    const lotSize = findLotSize(cells);

    const title = street || addressRaw;
    const slug = `${slugify(title)}-${rowIndex}`;

    docs.push({
      title,
      slug,
      description: lotSize ? `Vacant land parcel. Lot size: ${lotSize}.` : "Vacant land parcel.",
      property_type: "land",
      status: "draft",
      is_featured: false,
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
      lot_size_sqft: null,
      lot_size_acres: null,
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
      meta: {
        source: "google_sheet_import",
        imported_at: now.toISOString(),
        sheet_row_index: rowIndex,
        sheet_data: extraFields(cells, new Set([addressCellIndex])),
      },
      created_at: now,
      updated_at: now,
    });
  });

  if (docs.length === 0) {
    console.log("No rows with a recognizable address were found — nothing imported.");
  } else {
    const result = await listings.insertMany(docs);
    console.log(`Imported ${result.insertedCount} listing(s) as draft.`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
