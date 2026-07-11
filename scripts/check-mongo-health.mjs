// Health check: confirms MONGODB_URI actually connects.
// Usage: node --env-file=.env.local scripts/check-mongo-health.mjs

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("FAIL: MONGODB_URI is not set");
  process.exit(1);
}
if (uri.includes("<db_password>")) {
  console.error("FAIL: MONGODB_URI still has the <db_password> placeholder — replace it in .env.local");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
const started = Date.now();

try {
  await client.connect();
  const db = client.db("stevenmoning");
  await db.command({ ping: 1 });
  const listingsCount = await db.collection("listings").countDocuments();
  console.log(`OK: connected in ${Date.now() - started}ms — db "stevenmoning", ${listingsCount} listing(s) in collection`);
  process.exit(0);
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
} finally {
  await client.close();
}
