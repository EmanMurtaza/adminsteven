// Backfill `is_off_market` — the sales channel, which property_type could not express.
//
// property_type is a physical type (land / luxury / off_market), so bucketing a
// parcel as "off_market" would stop it counting as land. A listing can be both.
// This flag separates the two axes.
//
// Off-market, per the SOURCE data (nothing inferred):
//   - tab 1 (meta.source "google_sheet_import"): private wholesale/acquisition
//     deals — owner names, parcel IDs, legal descriptions, never MLS-listed.
//     scripts/LISTINGS_IMPORT_HANDOFF.md calls these out explicitly.
//   - tab 2 rows whose MLS# cell literally reads "OFF MARKET" (meta.off_market).
// Everything else carries a real MLS number and is therefore on-market.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-off-market.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-off-market.mjs --write   # apply

import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const WRITE = process.argv.includes("--write");

const OFF_MARKET = {
  $or: [
    { "meta.source": "google_sheet_import" }, // tab 1: wholesale deals
    { "meta.off_market": true },              // tab 2: MLS# cell says "OFF MARKET"
  ],
};

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const client = new MongoClient(uri);
await client.connect();
try {
  const col = client.db("stevenmoning").collection("listings");

  const total = await col.countDocuments({});
  const off = await col.countDocuments(OFF_MARKET);
  const on = total - off;

  console.log(`${total} listing(s): ${off} off-market, ${on} on-market (MLS-listed).`);

  const pub = (f) => col.countDocuments({ ...f, status: "published" });
  console.log(
    `Published: ${await pub(OFF_MARKET)} off-market, ` +
    `${(await pub({})) - (await pub(OFF_MARKET))} on-market.\n`
  );

  const sample = await col
    .find({ ...OFF_MARKET, status: "published" }, { projection: { title: 1, mls_number: 1 } })
    .limit(6)
    .toArray();
  console.log("Sample published off-market:");
  for (const d of sample) console.log(`  - ${d.title} (mls ${d.mls_number ?? "none"})`);

  if (!WRITE) {
    console.log("\nDRY RUN — pass --write to set is_off_market.");
  } else {
    const a = await col.updateMany(OFF_MARKET, {
      $set: { is_off_market: true, updated_at: new Date() },
    });
    const b = await col.updateMany(
      { $nor: [OFF_MARKET] },
      { $set: { is_off_market: false, updated_at: new Date() } }
    );
    console.log(`\nSet is_off_market=true on ${a.modifiedCount}, false on ${b.modifiedCount}.`);

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
