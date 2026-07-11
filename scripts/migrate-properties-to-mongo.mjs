// One-off migration: copies every row from Supabase's `properties` table into
// MongoDB's `listings` collection. Run once, after MONGODB_URI has the real
// password filled in.
//
// Usage: node --env-file=.env.local scripts/migrate-properties-to-mongo.mjs
//        add --force to re-run against a collection that already has documents

import { createClient } from "@supabase/supabase-js";
import { MongoClient } from "mongodb";

const force = process.argv.includes("--force");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mongoUri = process.env.MONGODB_URI;

if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env vars");
if (!mongoUri) throw new Error("Missing MONGODB_URI");
if (mongoUri.includes("<db_password>")) {
  throw new Error("Replace <db_password> in .env.local with the real Atlas password first");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const mongo = new MongoClient(mongoUri);

try {
  const { data: rows, error } = await supabase.from("properties").select("*");
  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  await mongo.connect();
  const listings = mongo.db("stevenmoning").collection("listings");

  const existing = await listings.countDocuments();
  if (existing > 0 && !force) {
    throw new Error(
      `listings collection already has ${existing} document(s) — rerun with --force to insert anyway`
    );
  }

  const docs = (rows ?? []).map(({ id, created_at, updated_at, ...rest }) => ({
    ...rest,
    created_at: created_at ? new Date(created_at) : new Date(),
    updated_at: updated_at ? new Date(updated_at) : new Date(),
  }));

  if (docs.length === 0) {
    console.log("No rows found in Supabase `properties` — nothing to migrate.");
  } else {
    const result = await listings.insertMany(docs);
    console.log(`Migrated ${result.insertedCount} listing(s) into MongoDB.`);
  }
} finally {
  await mongo.close();
}
