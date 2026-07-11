import { Redis } from "@upstash/redis";

// Upstash Redis over its REST API — chosen for Vercel serverless fit (no TCP
// connection pooling to manage across cold starts). See project-mongodb-listings
// for the intended cache-aside + snapshot-before-write design.
//
// The whole cache layer is OPTIONAL: if the two env vars are absent, `redis` is
// null and every cache call in lib/listings.ts no-ops, so reads fall straight
// through to Mongo and the app still works. This keeps builds/deploys green
// before Upstash is provisioned.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export const cacheEnabled = redis !== null;
