// Publish the sheet-imported land listings so the public site can show them.
// Flips status draft -> published for every meta.source === "google_sheet_import"
// doc, then bumps the Redis cache version so public reads refresh immediately.
//
// Private fields (owner, parcel, mailing) stay in Mongo but are stripped at the
// public API boundary (app/api/listings/route.ts), so publishing is safe.
//
// Usage:
//   node --env-file=.env.local scripts/publish-imported-listings.mjs           # dry-run
//   node --env-file=.env.local scripts/publish-imported-listings.mjs --write   # apply

import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const WRITE = process.argv.includes("--write");
const FILTER = { "meta.source": "google_sheet_import" };

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const client = new MongoClient(uri);
await client.connect();
try {
  const col = client.db("stevenmoning").collection("listings");
  const total = await col.countDocuments(FILTER);
  const draft = await col.countDocuments({ ...FILTER, status: "draft" });
  console.log(`Imported listings: ${total} total, ${draft} currently draft.`);

  if (!WRITE) {
    console.log("DRY RUN — pass --write to publish them.");
  } else {
    const res = await col.updateMany(
      { ...FILTER, status: { $ne: "published" } },
      { $set: { status: "published", updated_at: new Date() } }
    );
    console.log(`Published ${res.modifiedCount} listing(s).`);

    // Bust the listings cache so the public API serves the newly-published set.
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
