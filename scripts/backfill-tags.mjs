// Normalise the hashtags already on contacts, then seed the tag vocabulary.
//
// Two jobs, in this order, because the second depends on the first:
//
//   1. Lower-case every value in `contacts.tags`. Postgres array containment is
//      exact, so a contact stored as "Client" is invisible to a filter looking
//      for "client" — the seven mixed-case tags in this account are already
//      unfilterable, which is a bug rather than a tidy-up. Duplicates created
//      within a row by the fold ("Client" + "client") are merged.
//
//   2. Insert one row per distinct tag into `contact_tags`, keeping the casing
//      it first arrived with as the display label, and marking `import<digits>`
//      batch markers hidden — they are provenance, not vocabulary, and would
//      crowd out the useful tags in a picker.
//
// Costs no BoldTrail requests: everything it reads is already in the database.
// Safe to re-run — the fold is idempotent and the seed upserts.
//
// Requires supabase/setup.sql to have been applied (it creates contact_tags).
//
// Usage:
//   node --env-file=.env.local scripts/backfill-tags.mjs [--dry]

import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Batch markers written by the CSV importer, e.g. import20251007-1985a. */
const IS_BATCH_MARKER = /^import\d/i;

const rows = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, tags, external_id")
    .range(from, from + 499);
  if (error) {
    console.error(`FAIL reading contacts: ${error.message}`);
    process.exit(1);
  }
  rows.push(...(data ?? []));
  if (!data || data.length < 500) break;
}

// ── 1. Fold to lower case ────────────────────────────────────────────────────

const updates = [];
/** canonical name -> the casing it was first seen with */
const labels = new Map();
/** canonical name -> whether it ever arrived on a BoldTrail contact */
const fromBoldTrail = new Map();

for (const row of rows) {
  const original = row.tags ?? [];
  const folded = [];
  for (const raw of original) {
    const tag = String(raw).trim();
    if (!tag) continue;
    const name = tag.toLowerCase();
    if (!labels.has(name)) labels.set(name, tag);
    if (row.external_id) fromBoldTrail.set(name, true);
    if (!folded.includes(name)) folded.push(name);
  }
  const changed =
    folded.length !== original.length || folded.some((t, i) => t !== original[i]);
  if (changed) updates.push({ id: row.id, tags: folded });
}

const distinct = [...labels.keys()].sort();
const hidden = distinct.filter((t) => IS_BATCH_MARKER.test(t));

console.log(`Scanned ${rows.length} contacts.`);
console.log(`  rows whose tags change case : ${updates.length}`);
console.log(`  distinct tags               : ${distinct.length}`);
console.log(`  of those, batch markers     : ${hidden.length}`);

const recased = distinct.filter((t) => labels.get(t) !== t);
if (recased.length) {
  console.log(`\n  folded to lower case:`);
  for (const t of recased) console.log(`    ${labels.get(t)}  ->  ${t}`);
}

if (DRY) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

let written = 0;
for (let i = 0; i < updates.length; i += 100) {
  const chunk = updates.slice(i, i + 100);
  const { error } = await supabase.from("contacts").upsert(chunk, { onConflict: "id" });
  if (error) {
    console.error(`FAIL writing contacts at ${i}: ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
}
console.log(`\nRe-cased ${written} contact rows.`);

// ── 2. Seed the vocabulary ───────────────────────────────────────────────────

const vocabulary = distinct.map((name) => ({
  name,
  label: labels.get(name) ?? name,
  source: IS_BATCH_MARKER.test(name)
    ? "import"
    : fromBoldTrail.get(name)
      ? "boldtrail"
      : "manual",
  is_hidden: IS_BATCH_MARKER.test(name),
}));

const { error: seedError } = await supabase
  .from("contact_tags")
  // onConflict name, ignoreDuplicates: a tag someone has already renamed or
  // un-hidden by hand should not be reset by re-running this.
  .upsert(vocabulary, { onConflict: "name", ignoreDuplicates: true });

if (seedError) {
  console.error(`FAIL seeding contact_tags: ${seedError.message}`);
  if (/does not exist/i.test(seedError.message)) {
    console.error("Apply supabase/setup.sql in the Supabase SQL editor first.");
  }
  process.exit(1);
}

console.log(`Seeded ${vocabulary.length} tags into contact_tags.`);
