export type ListingStatus = "draft" | "published" | "archived";

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  status: ListingStatus;
  images: string[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ListingInsert = Omit<Listing, "id" | "created_at" | "updated_at">;
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
