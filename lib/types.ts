export type ListingStatus = "draft" | "published" | "archived";

export type BlogStatus = "draft" | "published" | "archived";

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
  created_at: string;
  updated_at: string;
}

export type BlogPostInsert = Omit<BlogPost, "id" | "created_at" | "updated_at">;
export type BlogPostUpdate = Partial<BlogPostInsert>;

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
