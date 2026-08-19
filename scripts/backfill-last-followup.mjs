// Fill `contacts.last_contacted_at` from BoldTrail data already stored.
//
// Costs no API calls: everything it reads is in `external_raw` and
// `external_notes` from previous syncs. Safe to re-run — it never clears a date
// that is already set, because a call logged in the panel is a fact BoldTrail
// does not have.
//
// The rule for what counts as a follow-up lives in lib/boldtrail/activity.ts
// and is mirrored here; that file explains why the campaign log is ignored.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-last-followup.mjs [--dry]

import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AUTOMATED_TITLE =
  /^(campaign (added|removed)|text not sent|text_not_sent|contact (updated|automatically unsubscribed)|lead (assigned|routed)|email (sent|opened|bounced)|sms unsubscribed|subscribed|unsubscribed|tcpa|added to|imported)/i;

function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw || raw.startsWith("0000-00-00")) return null;
  if (/^\d{9,13}$/.test(raw)) {
    const n = Number(raw);
    const d = new Date(raw.length <= 10 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isManualNote(note) {
  const title = (note?.title ?? "").trim();
  if (!title) return Boolean((note?.details ?? "").trim());
  return !AUTOMATED_TITLE.test(title);
}

function lastFollowUpAt(raw, notes) {
  const out = [];
  const call = toIso(raw?.last_call);
  if (call) out.push(call);
  for (const n of notes ?? []) {
    if (!n?.date || !isManualNote(n)) continue;
    const when = toIso(n.date);
    if (when) out.push(when);
  }
  return out.length ? out.sort()[out.length - 1] : null;
}

const rows = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, external_raw, external_notes, last_contacted_at")
    .not("external_id", "is", null)
    .range(from, from + 499);
  if (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
  rows.push(...(data ?? []));
  if (!data || data.length < 500) break;
}

const updates = [];
let fromCall = 0;
let fromNote = 0;
for (const row of rows) {
  const derived = lastFollowUpAt(row.external_raw, row.external_notes);
  if (!derived) continue;
  if (row.last_contacted_at) continue; // never overwrite what is already there
  if (toIso(row.external_raw?.last_call) === derived) fromCall++;
  else fromNote++;
  updates.push({ id: row.id, last_contacted_at: derived });
}

console.log(`Scanned ${rows.length} BoldTrail contacts.`);
console.log(`  a real follow-up exists for : ${updates.length}`);
console.log(`    from last_call            : ${fromCall}`);
console.log(`    from a hand-written note  : ${fromNote}`);
console.log(`  no genuine follow-up ever   : ${rows.length - updates.length}`);

if (DRY) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

let written = 0;
for (let i = 0; i < updates.length; i += 100) {
  const chunk = updates.slice(i, i + 100);
  const { error } = await supabase.from("contacts").upsert(chunk, { onConflict: "id" });
  if (error) {
    console.error(`FAIL writing chunk at ${i}: ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
}
console.log(`\nWrote ${written} dates.`);
