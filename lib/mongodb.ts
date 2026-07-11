import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI env var");

// Cache the client across hot reloads (dev) and warm serverless invocations
// (prod) so we don't open a new connection on every request.
const globalForMongo = global as unknown as { _mongoClientPromise?: Promise<MongoClient> };

const clientPromise =
  globalForMongo._mongoClientPromise ?? new MongoClient(uri).connect();

if (!globalForMongo._mongoClientPromise) {
  globalForMongo._mongoClientPromise = clientPromise;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db("stevenmoning");
}
