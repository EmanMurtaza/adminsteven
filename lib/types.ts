export type ListingStatus = "draft" | "published" | "archived";

export type BlogStatus = "draft" | "published" | "archived";

// Property types allowed by the `properties` table check constraint
export type PropertyType = "luxury" | "land" | "off_market";

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "luxury", label: "Luxury" },
  { value: "land", label: "Land" },
  { value: "off_market", label: "Off-Market" },
];

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

// ── Blog posts ────────────────────────────────────────────────────────────────
// Mirrors public.blog_posts in Supabase — schema kept in sync with the main site.

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

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  cat: BlogCategory;
  image: string | null;
  author: string | null;
  content: string | null;
  published_at: string | null;
  created_at: string;
}

export type BlogPostInsert = Omit<BlogPost, "id" | "created_at">;
export type BlogPostUpdate = Partial<BlogPostInsert>;
