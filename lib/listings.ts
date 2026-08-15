import { Collection, Filter, ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import { redis } from "./redis";
import {
  Listing,
  ListingInsert,
  ListingUpdate,
  ListingStatus,
  PropertyType,
  SalesChannel,
  DEFAULT_SALES_CHANNEL,
  channelIsOffMarket,
} from "./types";

type ListingDoc = Omit<Listing, "id" | "created_at" | "updated_at"> & {
  _id: ObjectId;
  created_at: Date;
  updated_at: Date;
};

async function collection(): Promise<Collection<ListingDoc>> {
  const db = await getDb();
  return db.collection<ListingDoc>("listings");
}

// ── Redis cache layer ─────────────────────────────────────────────────────────
// Cache-aside for the listings read path (behind the public GET /api/listings)
// with version-based invalidation: every cached list key embeds a version
// counter, and any write INCRs that counter so all previously-cached lists
// become unreachable at once (no key scanning needed). All cache ops are
// best-effort — a Redis failure must never break a Mongo read or block a write.
const CACHE_TTL = 300; // seconds
const VER_KEY = "listings:ver";
const SNAP_KEY = "listings:snapshots";
const SNAP_KEEP = 20; // rolling pre-write snapshots kept as an M0 backup substitute

type ListResult = { data: Listing[]; count: number };

function queryKey(q: ListingQuery): string {
  return JSON.stringify({
    status: q.status ?? null,
    propertyType: q.propertyType ?? null,
    featured: q.featured ?? false,
    // Every filter must appear here — two queries that differ only by a field
    // missing from this key would share a cache entry and serve each other's
    // results.
    isOffMarket: q.isOffMarket ?? null,
    salesChannel: q.salesChannel ?? null,
    search: q.search ?? null,
    limit: q.limit ?? null,
    offset: q.offset ?? null,
  });
}

// Escape user input before using it inside a RegExp — avoids invalid patterns
// and regex-injection from the search box.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function cacheVersion(): Promise<string> {
  if (!redis) return "0";
  try {
    return (await redis.get<string | number>(VER_KEY))?.toString() ?? "0";
  } catch {
    return "0";
  }
}

// Stash a snapshot of the full collection BEFORE a mutation, so a bad
// write/delete can be recovered (M0 has no point-in-time restore).
async function snapshotBeforeWrite(col: Collection<ListingDoc>): Promise<void> {
  if (!redis) return;
  try {
    const all = await col.find({}).sort({ created_at: -1 }).toArray();
    await redis.lpush(SNAP_KEY, { at: new Date().toISOString(), listings: all.map(toListing) });
    await redis.ltrim(SNAP_KEY, 0, SNAP_KEEP - 1);
  } catch {
    /* snapshotting is a nice-to-have; never let it block the actual write */
  }
}

// Bump the version AFTER a write so every previously-cached list is invalidated
// and subsequent reads repopulate from Mongo.
async function invalidate(): Promise<void> {
  if (!redis) return;
  try {
    await redis.incr(VER_KEY);
  } catch {
    /* best-effort; a stale key still expires via TTL */
  }
}

function toListing(doc: ListingDoc): Listing {
  const { _id, created_at, updated_at, ...rest } = doc;
  return {
    ...rest,
    id: _id.toString(),
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  };
}

/**
 * `sales_channel` and `is_off_market` are two views of one fact, and the public
 * website still reads the boolean — so whichever one a caller supplies, this
 * fills in the other. Writes come from the admin form (channel), older import
 * scripts and API clients (boolean), or neither.
 *
 * The channel wins when both are present: it is the finer-grained field, and
 * the only one that can express wholesale.
 */
function deriveChannelFields<T extends { sales_channel?: SalesChannel; is_off_market?: boolean }>(
  data: T
): T & { sales_channel?: SalesChannel; is_off_market?: boolean } {
  if (data.sales_channel) {
    return { ...data, is_off_market: channelIsOffMarket(data.sales_channel) };
  }
  if (data.is_off_market !== undefined) {
    // A bare `true` cannot say whether it meant off-market or wholesale, so it
    // takes the plain reading; the admin form can refine it afterwards.
    return {
      ...data,
      sales_channel: data.is_off_market ? "off_market" : "on_market",
    };
  }
  return data;
}

// Fields the `properties` Postgres table used to default for us — replicated
// here since Mongo has no column defaults.
function withDefaults(data: ListingInsert) {
  return {
    slug: null,
    description: null,
    is_featured: false,
    sales_channel: DEFAULT_SALES_CHANNEL,
    is_off_market: false,
    address: null,
    city: null,
    state: "TX",
    zip_code: null,
    neighborhood: null,
    county: null,
    price: null,
    price_per_sqft: null,
    hoa_fee: null,
    tax_annual: null,
    bedrooms: null,
    bathrooms: null,
    half_bathrooms: null,
    square_footage: null,
    lot_size_sqft: null,
    lot_size_acres: null,
    year_built: null,
    garage_spaces: 0,
    stories: 1,
    pool: false,
    images: [] as string[],
    virtual_tour_url: null,
    video_url: null,
    mls_number: null,
    listing_date: null,
    days_on_market: null,
    meta: {} as Record<string, unknown>,
    // Derived last so the channel/boolean pair is consistent whichever one the
    // caller sent, rather than half-overwritten by the raw payload.
    ...deriveChannelFields(data),
  };
}

export interface ListingQuery {
  propertyType?: string | null;
  featured?: boolean;
  status?: ListingStatus;
  /** Sub-category: on-market / off-market / wholesale. A separate axis from type. */
  salesChannel?: SalesChannel | null;
  /** Coarser legacy form of `salesChannel`, kept for existing callers. */
  isOffMarket?: boolean | null;
  /** Case-insensitive text match across title, address, city, neighborhood, MLS #, and slug. */
  search?: string | null;
  limit?: number;
  offset?: number;
}

export async function listListings(query: ListingQuery = {}): Promise<ListResult> {
  const col = await collection();

  // Cache-aside read: key embeds the current version so a write invalidates all.
  let cacheKey: string | null = null;
  if (redis) {
    const ver = await cacheVersion();
    cacheKey = `listings:${ver}:${queryKey(query)}`;
    try {
      const cached = await redis.get<ListResult>(cacheKey);
      if (cached) return cached;
    } catch {
      /* fall through to Mongo on any cache read error */
    }
  }

  const filter: Filter<ListingDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.propertyType) filter.property_type = query.propertyType as PropertyType;
  if (query.featured) filter.is_featured = true;
  if (query.salesChannel) filter.sales_channel = query.salesChannel;
  // Explicit null check: `false` is a real choice (on-market only), not "unset".
  // Plain equality rather than an $or, because $or is already spoken for by the
  // search clause below and the second assignment would clobber the first.
  if (query.isOffMarket != null) filter.is_off_market = query.isOffMarket;

  const search = query.search?.trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { title: rx },
      { address: rx },
      { city: rx },
      { neighborhood: rx },
      { mls_number: rx },
      { slug: rx },
    ];
  }

  let cursor = col.find(filter).sort({ created_at: -1 });
  if (query.offset) cursor = cursor.skip(query.offset);
  if (query.limit) cursor = cursor.limit(query.limit);

  const [docs, count] = await Promise.all([cursor.toArray(), col.countDocuments(filter)]);
  const result: ListResult = { data: docs.map(toListing), count };

  if (redis && cacheKey) {
    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL });
    } catch {
      /* caching is best-effort */
    }
  }
  return result;
}

export async function countListings(filter: { status?: ListingStatus } = {}): Promise<number> {
  const col = await collection();
  const query: Filter<ListingDoc> = {};
  if (filter.status) query.status = filter.status;
  return col.countDocuments(query);
}

export async function getListingById(id: string): Promise<Listing | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? toListing(doc) : null;
}

export async function createListing(data: ListingInsert): Promise<Listing> {
  const col = await collection();
  await snapshotBeforeWrite(col);
  const now = new Date();
  const doc = { ...withDefaults(data), created_at: now, updated_at: now } as ListingDoc;
  const result = await col.insertOne(doc);
  await invalidate();
  return toListing({ ...doc, _id: result.insertedId });
}

export async function updateListing(id: string, data: ListingUpdate): Promise<Listing | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  await snapshotBeforeWrite(col);
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    // deriveChannelFields is a no-op unless the patch touches one of the two
    // channel fields, so editing an unrelated field cannot reclassify a listing.
    { $set: { ...deriveChannelFields(data), updated_at: new Date() } },
    { returnDocument: "after" }
  );
  if (result) await invalidate();
  return result ? toListing(result) : null;
}

export async function deleteListing(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  await snapshotBeforeWrite(col);
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount > 0) await invalidate();
  return result.deletedCount > 0;
}

// ── BI dashboard aggregates ─────────────────────────────────────────────────

export interface ListingAnalytics {
  totalCount: number;
  byStatus: { status: string; count: number }[];
  byPropertyType: { propertyType: string; count: number }[];
  /** The sub-category split — on-market / off-market / wholesale. */
  byChannel: { channel: string; count: number }[];
  offMarketCount: number;
  featuredCount: number;
  avgPrice: number | null;
  avgDaysOnMarket: number | null;
}

interface TotalsFacet {
  totalCount: number;
  offMarketCount: number;
  featuredCount: number;
  avgPrice: number | null;
  avgDaysOnMarket: number | null;
}

export async function getListingAnalytics(): Promise<ListingAnalytics> {
  const col = await collection();

  const [byStatus, byPropertyType, byChannel, totalsRows] = await Promise.all([
    col
      .aggregate<{ _id: string | null; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    col
      .aggregate<{ _id: string | null; count: number }>([
        { $group: { _id: "$property_type", count: { $sum: 1 } } },
      ])
      .toArray(),
    col
      .aggregate<{ _id: string | null; count: number }>([
        { $group: { _id: "$sales_channel", count: { $sum: 1 } } },
      ])
      .toArray(),
    col
      .aggregate<TotalsFacet>([
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            offMarketCount: { $sum: { $cond: ["$is_off_market", 1, 0] } },
            featuredCount: { $sum: { $cond: ["$is_featured", 1, 0] } },
            avgPrice: { $avg: "$price" },
            avgDaysOnMarket: { $avg: "$days_on_market" },
          },
        },
      ])
      .toArray(),
  ]);

  const totals = totalsRows[0];

  return {
    totalCount: totals?.totalCount ?? 0,
    byStatus: byStatus.map((d) => ({ status: d._id ?? "unknown", count: d.count })),
    byPropertyType: byPropertyType.map((d) => ({
      propertyType: d._id ?? "unknown",
      count: d.count,
    })),
    // Anything written before the channel existed reads as on-market, which is
    // what the missing `is_off_market` default meant anyway.
    byChannel: byChannel.map((d) => ({
      channel: d._id ?? DEFAULT_SALES_CHANNEL,
      count: d.count,
    })),
    offMarketCount: totals?.offMarketCount ?? 0,
    featuredCount: totals?.featuredCount ?? 0,
    avgPrice: totals?.avgPrice ?? null,
    avgDaysOnMarket: totals?.avgDaysOnMarket ?? null,
  };
}
