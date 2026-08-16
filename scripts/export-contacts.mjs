// Export every contact's email addresses and phone numbers to a CSV.
//
// Opens directly in Excel. Written with a UTF-8 BOM and CRLF line endings
// because without the BOM Excel renders accented names as mojibake, and it is
// the kind of thing nobody notices until a client's name is wrong.
//
// The phone columns are split out rather than collapsed into one: `contacts.
// phone` holds whichever number the sync picked as primary, but BoldTrail keeps
// up to four, and "their contact numbers" means all of them.
//
// Usage:
//   node --env-file=.env.local scripts/export-contacts.mjs
//   node --env-file=.env.local scripts/export-contacts.mjs --out=some/path.csv
//   node --env-file=.env.local scripts/export-contacts.mjs --with-names
//   node --env-file=.env.local scripts/export-contacts.mjs --reachable-only
//
// The file contains real client contact details. It is written outside version
// control on purpose — see the .gitignore entry for *.csv.

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (n) => args.some((a) => a === `--${n}`);
const value = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;

const OUT = value("out", "contacts-export.csv");
const WITH_NAMES = flag("with-names");
const REACHABLE_ONLY = flag("reachable-only");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// RFC 4180: quote everything. A phone number is never arithmetic, and a comma
// inside a field would otherwise split the row.
function cell(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

const rows = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from("contacts")
    .select("first_name, last_name, email, second_email, phone, external_raw")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE - 1);
  if (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
  rows.push(...(data ?? []));
  if (!data || data.length < PAGE) break;
}

const headers = [
  ...(WITH_NAMES ? ["Name"] : []),
  "Email",
  "Second email",
  "Mobile",
  "Mobile 2",
  "Home phone",
  "Work phone",
];

const lines = [headers.map(cell).join(",")];
let exported = 0;
let skipped = 0;

for (const row of rows) {
  const raw = row.external_raw ?? {};
  // Fall back to the single stored phone for contacts that never came from
  // BoldTrail (website enquiries, hand-typed) and so have no raw payload.
  const mobile = raw.cell_phone_1 || row.phone || "";
  const numbers = [mobile, raw.cell_phone_2 || "", raw.home_phone || "", raw.work_phone || ""];
  const emails = [row.email || "", row.second_email || raw.second_email || ""];

  if (REACHABLE_ONLY && !emails.some(Boolean) && !numbers.some(Boolean)) {
    skipped++;
    continue;
  }

  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  lines.push([...(WITH_NAMES ? [name] : []), ...emails, ...numbers].map(cell).join(","));
  exported++;
}

writeFileSync(OUT, "﻿" + lines.join("\r\n") + "\r\n", "utf8");

console.log(`Contacts in database : ${rows.length}`);
if (REACHABLE_ONLY) console.log(`Skipped (no email or phone): ${skipped}`);
console.log(`Rows written         : ${exported}`);
console.log(`File                 : ${OUT}`);
