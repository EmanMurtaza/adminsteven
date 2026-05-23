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
