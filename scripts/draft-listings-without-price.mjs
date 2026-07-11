// Pull any published listing that has no price back to draft, so the public
// site only ever shows priced properties. "No price" means price is null or the
// field is absent (the importer stores null for "not available" / unparseable).
//
// Mirrors publish-imported-listings.mjs: flips status, then bumps the Redis
// cache version so public reads refresh immediately.
//
// Usage:
//   node --env-file=.env.local scripts/draft-listings-without-price.mjs           # dry-run
//   node --env-file=.env.local scripts/draft-listings-without-price.mjs --write   # apply

import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const WRITE = process.argv.includes("--write");
const NO_PRICE = { $or: [{ price: null }, { price: { $exists: false } }] };
const FILTER = { status: "published", ...NO_PRICE };

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const client = new MongoClient(uri);
await client.connect();
try {
  const col = client.db("stevenmoning").collection("listings");
  const affected = await col.countDocuments(FILTER);
  const publishedTotal = await col.countDocuments({ status: "published" });
  console.log(
    `Published listings: ${publishedTotal} total, ${affected} with no price (to be drafted).`
  );

  if (affected > 0) {
    const sample = await col
      .find(FILTER, { projection: { title: 1, address: 1, city: 1 } })
      .limit(10)
      .toArray();
    for (const d of sample) {
      console.log(`  - ${d.title || d.address || d._id} (${d.city || "—"})`);
    }
    if (affected > sample.length) console.log(`  … and ${affected - sample.length} more.`);
  }

  if (!WRITE) {
    console.log("DRY RUN — pass --write to move them to draft.");
  } else {
    const res = await col.updateMany(FILTER, {
      $set: { status: "draft", updated_at: new Date() },
    });
    console.log(`Moved ${res.modifiedCount} listing(s) to draft.`);

    // Bust the listings cache so the public API stops serving the drafted set.
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
