// Seed `contact_listings` from the enquiries already on record.
//
// Every website enquiry about a specific property already carries the listing
// it was about (`contact_submissions.listing_id`), and the CRM contact created
// from that enquiry already points back at it (`contacts.submission_id`). So
// the "who is interested in this listing" relationship is derivable from data
// we have — it just was never written down anywhere queryable.
//
// Everything produced here gets role 'interested', which is all an enquiry
// proves. 'buyer' and 'seller' mean the deal happened and are only ever
// asserted by hand.
//
// Idempotent: rows are upserted on the composite primary key, so running it
// twice changes nothing.
//
// Usage: node --env-file=.env.local scripts/backfill-contact-listings.mjs
//        add --dry-run to see what it would write without writing it

import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Paged, because PostgREST caps a response at 1000 rows and a silent truncation
// here would look like a clean run that quietly skipped most of the data.
async function selectAll(table, columns, refine = (q) => q) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await refine(supabase.from(table).select(columns)).range(
      from,
      from + PAGE - 1
    );
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

try {
  let submissions, contacts;
  try {
    [submissions, contacts] = await Promise.all([
      selectAll("contact_submissions", "id, listing_id", (q) => q.not("listing_id", "is", null)),
      selectAll("contacts", "id, submission_id", (q) => q.not("submission_id", "is", null)),
    ]);
  } catch (error) {
    const message = String(error?.message ?? error);
    // The column this whole script reads from is added by a migration that has
    // to be pasted into the Supabase SQL editor by hand — there is no migration
    // runner here. Say which one rather than surfacing the raw PostgREST error.
    if (message.includes("listing_id does not exist")) {
      console.error("FAIL: contact_submissions has no listing_id column yet.");
      console.error("");
      console.error("Apply supabase/extend_contact_submissions_for_inquiries.sql in the");
      console.error("Supabase SQL editor first — it adds listing_id, which records which");
      console.error("property each enquiry was about. Without it there is nothing to");
      console.error("backfill from.");
      process.exit(1);
    }
    throw error;
  }

  const listingBySubmission = new Map(
    submissions.filter((s) => s.listing_id).map((s) => [s.id, s.listing_id])
  );

  const rows = [];
  const seen = new Set();
  let noListing = 0;

  for (const contact of contacts) {
    const listingId = listingBySubmission.get(contact.submission_id);
    if (!listingId) {
      // A general enquiry rather than one about a specific property.
      noListing++;
      continue;
    }
    const key = `${contact.id}|${listingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ contact_id: contact.id, listing_id: String(listingId), role: "interested" });
  }

  console.log(`Enquiries naming a listing: ${listingBySubmission.size}`);
  console.log(`Contacts from an enquiry:   ${contacts.length}`);
  console.log(`  of those, no listing:     ${noListing}`);
  console.log(`Links to write:             ${rows.length}`);

  if (rows.length === 0) {
    console.log("\nNothing to do.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nDry run — first 10 links that would be written:");
    for (const row of rows.slice(0, 10)) {
      console.log(`  contact ${row.contact_id} → listing ${row.listing_id} (${row.role})`);
    }
    if (rows.length > 10) console.log(`  …and ${rows.length - 10} more`);
    process.exit(0);
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("contact_listings")
      .upsert(chunk, { onConflict: "contact_id,listing_id,role", ignoreDuplicates: true });
    if (error) throw new Error(`contact_listings: ${error.message}`);
    written += chunk.length;
  }

  console.log(`\nOK: ${written} link(s) written.`);
  process.exit(0);
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
