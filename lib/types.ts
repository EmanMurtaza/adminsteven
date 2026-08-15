export type ListingStatus = "draft" | "published" | "archived";

export type BlogStatus = "draft" | "published" | "archived";

// Shared by the listing and blog filter dropdowns — both use the same three.
export const CONTENT_STATUSES: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// What the property physically is. "off_market" used to sit in this list, which
// was a category error — it describes how a property sells, not what it is, so
// it lives on the SalesChannel axis below and every type can carry it.
export type PropertyType = "luxury" | "land" | "dorms";

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "luxury", label: "Luxury" },
  { value: "land", label: "Land" },
  { value: "dorms", label: "Dorms" },
];

// How a property is sold — the sub-type under each property type. Every type
// carries all three: Land + Wholesale, Luxury + Off-market, Dorms + On-market.
// `property_type` says what it is; this says how it sells.
//
// This supersedes the older `is_off_market` boolean, which could not tell a
// wholesale deal apart from an ordinary off-market one. That flag is still
// written and kept in sync (see `deriveChannelFields` in lib/listings.ts)
// because the public website reads it.
export type SalesChannel = "on_market" | "off_market" | "wholesale";

export const SALES_CHANNELS: { value: SalesChannel; label: string; hint: string }[] = [
  { value: "on_market", label: "On-market", hint: "Listed on the MLS" },
  { value: "off_market", label: "Off-market", hint: "Not on the MLS — quiet listing" },
  { value: "wholesale", label: "Wholesale", hint: "Private acquisition / assignment deal" },
];

export const DEFAULT_SALES_CHANNEL: SalesChannel = "on_market";

export function salesChannelLabel(channel: string | null | undefined): string {
  return SALES_CHANNELS.find((c) => c.value === channel)?.label ?? "On-market";
}

/** Both off-market and wholesale are "not on the MLS" for the public site. */
export function channelIsOffMarket(channel: SalesChannel): boolean {
  return channel !== "on_market";
}

// Matches the `blogs` table on Supabase (read by stevenmoning.vercel.app)
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  tags: string[];
  status: BlogStatus;
  published_at: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type BlogPostInsert = Omit<BlogPost, "id" | "created_at" | "updated_at" | "published_at" | "meta"> &
  Partial<Pick<BlogPost, "published_at" | "meta">>;
export type BlogPostUpdate = Partial<BlogPostInsert>;

// Matches the `properties` table on Supabase (read by stevenmoning.vercel.app)
export interface Listing {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  property_type: PropertyType;
  status: ListingStatus;
  is_featured: boolean;
  /** Sub-category under the property type — see SalesChannel. */
  sales_channel: SalesChannel;
  /**
   * Legacy two-way view of `sales_channel`, kept in sync because the public
   * website reads it. True for both off-market and wholesale.
   */
  is_off_market: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  neighborhood: string | null;
  county: string | null;
  price: number | null;
  price_per_sqft: number | null;
  hoa_fee: number | null;
  tax_annual: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  half_bathrooms: number | null;
  square_footage: number | null;
  lot_size_sqft: number | null;
  lot_size_acres: number | null;
  year_built: number | null;
  garage_spaces: number | null;
  stories: number | null;
  pool: boolean;
  images: string[];
  virtual_tour_url: string | null;
  video_url: string | null;
  mls_number: string | null;
  listing_date: string | null;
  days_on_market: number | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Fields managed by the admin form (the rest keep their DB defaults)
export interface ListingInsert {
  title: string;
  slug?: string | null;
  description?: string | null;
  property_type: PropertyType;
  status: ListingStatus;
  is_featured?: boolean;
  sales_channel?: SalesChannel;
  /** Accepted from older API callers; kept in sync with `sales_channel`. */
  is_off_market?: boolean;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  price?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_footage?: number | null;
  lot_size_acres?: number | null;
  year_built?: number | null;
  garage_spaces?: number | null;
  pool?: boolean;
  images?: string[];
  virtual_tour_url?: string | null;
  mls_number?: string | null;
}

export type ListingUpdate = Partial<ListingInsert>;

export const BLOG_CATEGORIES = [
  "Alumni",
  "Baby Boomers",
  "Dallas Cowboy's",
  "Health & Fitness",
  "Lands",
  "Local Events",
  "News",
  "Off Market",
  "Property",
  "Sports",
  "Uncategorized",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

