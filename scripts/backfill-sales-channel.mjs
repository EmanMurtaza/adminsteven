// Backfill `sales_channel` — the sub-type under each property type.
//
// Supersedes scripts/backfill-off-market.mjs, which could only say off-market
// yes/no. That boolean could not tell a private wholesale deal apart from an
// ordinary quiet listing, and both were being lumped together.
//
// Classification comes from the SOURCE data only — nothing inferred:
//   wholesale  — meta.source "google_sheet_import": tab 1 of the sheet, the
//                private acquisition/assignment deals carrying owner names,
//                parcel IDs and legal descriptions. Never MLS-listed.
//                scripts/LISTINGS_IMPORT_HANDOFF.md calls these out explicitly.
//   off_market — meta.off_market true: tab 2 rows whose MLS# cell literally
//                read "OFF MARKET".
//   on_market  — everything else. These carry a real MLS number.
//
// Two tab-2 rows have a BLANK MLS# cell (not "OFF MARKET"). A blank cell is
// missing data, not evidence of being off-market, so they stay on-market —
// which is also what is_off_market already says for them. They are listed at
// the end of the dry run so they can be corrected by hand if that is wrong.
//
// `is_off_market` is rewritten from the channel to keep the public website's
// field consistent (off_market and wholesale are both "not on the MLS"). By
// design this reproduces the existing 50/28 split exactly — no listing changes
// its public visibility, it only gains a finer label.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-sales-channel.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-sales-channel.mjs --write   # apply

import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const WRITE = process.argv.includes("--write");

const WHOLESALE = { "meta.source": "google_sheet_import" };
const OFF_MARKET = { "meta.off_market": true };
// Neither of the above — the MLS-listed rows.
const ON_MARKET = { $nor: [WHOLESALE, OFF_MARKET] };

const RULES = [
  ["wholesale", WHOLESALE],
  ["off_market", OFF_MARKET],
  ["on_market", ON_MARKET],
];

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const client = new MongoClient(uri);
await client.connect();
try {
  const col = client.db("stevenmoning").collection("listings");

  const total = await col.countDocuments({});
  console.log(`${total} listing(s) in the collection.\n`);

  // The two rules must not both match a doc, or the later updateMany would
  // silently win. Assert it rather than assume it.
  const overlap = await col.countDocuments({ $and: [WHOLESALE, OFF_MARKET] });
  if (overlap > 0) throw new Error(`${overlap} doc(s) match both wholesale and off_market rules — resolve before writing.`);

  console.log("Planned classification:");
  let planned = 0;
  for (const [channel, filter] of RULES) {
    const n = await col.countDocuments(filter);
    const pub = await col.countDocuments({ ...filter, status: "published" });
    planned += n;
    console.log(`  ${channel.padEnd(11)} ${String(n).padStart(3)}  (${pub} published)`);
  }
  if (planned !== total) throw new Error(`Rules cover ${planned} of ${total} docs — every listing must be classified.`);

  console.log("\nProperty type stays untouched:");
  for (const d of await col.aggregate([{ $group: { _id: "$property_type", n: { $sum: 1 } } }]).toArray())
    console.log(`  ${d._id}: ${d.n}`);

  // "off_market" was removed from the property-type list; it is a sub-type now.
  const strayType = await col.countDocuments({ property_type: "off_market" });
  if (strayType > 0) {
    console.log(`\n${strayType} listing(s) still have property_type "off_market" — these will be`);
    console.log(`moved to property_type "land" with sales_channel "off_market".`);
  }

  const blankMls = await col
    .find({ ...ON_MARKET, $or: [{ mls_number: null }, { mls_number: "" }, { mls_number: { $exists: false } }] },
          { projection: { title: 1 } })
    .toArray();
  if (blankMls.length) {
    console.log(`\nOn-market but with no MLS number (blank source cell — review by hand):`);
    for (const d of blankMls) console.log(`  - ${d.title}`);
  }

  if (!WRITE) {
    console.log("\nDRY RUN — pass --write to apply.");
  } else {
    for (const [channel, filter] of RULES) {
      const res = await col.updateMany(filter, {
        $set: {
          sales_channel: channel,
          is_off_market: channel !== "on_market",
          updated_at: new Date(),
        },
      });
      console.log(`\nSet sales_channel="${channel}" on ${res.modifiedCount} doc(s).`);
    }

    if (strayType > 0) {
      const res = await col.updateMany(
        { property_type: "off_market" },
        { $set: { property_type: "land", updated_at: new Date() } }
      );
      console.log(`Moved ${res.modifiedCount} doc(s) off the retired "off_market" property type.`);
    }

    // The admin filters on this field now, so give it an index.
    await col.createIndex({ sales_channel: 1, status: 1 }, { name: "sales_channel_status" });
    console.log("Index ready: sales_channel_status");

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        const ver = await new Redis({ url, token }).incr("listings:ver");
        console.log(`Bumped Redis cache version to ${ver}.`);
      } catch (e) {
        console.log("Cache bump skipped:", e.message.split("\n")[0]);
      }
    }
  }
} finally {
  await client.close();
}
