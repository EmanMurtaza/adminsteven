// Creates the `listings` collection (if it doesn't exist yet) and sets up
// the indexes the app's queries rely on. Safe to run more than once.
//
// Usage: node --env-file=.env.local scripts/init-mongo-listings.mjs

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");
if (uri.includes("<db_password>")) {
  throw new Error("Replace <db_password> in .env.local with the real Atlas password first");
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db("stevenmoning");

  const existing = await db.listCollections({ name: "listings" }).toArray();
  if (existing.length === 0) {
    await db.createCollection("listings");
    console.log('Created collection "listings"');
  } else {
    console.log('Collection "listings" already exists');
  }

  const listings = db.collection("listings");
  await listings.createIndexes([
    { key: { slug: 1 }, unique: true, partialFilterExpression: { slug: { $type: "string" } }, name: "slug_unique" },
    { key: { status: 1 }, name: "status_1" },
    { key: { property_type: 1, status: 1 }, name: "property_type_status" },
    { key: { created_at: -1 }, name: "created_at_desc" },
  ]);
  console.log("Indexes ready: slug_unique, status_1, property_type_status, created_at_desc");
} finally {
  await client.close();
}
