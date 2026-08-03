// Client testimonials, read by the public site (stevenmoning.vercel.app) and
// edited here. Published rows are readable with the anon key via RLS, exactly
// like `blogs`; drafts are not.

export type TestimonialStatus = "draft" | "published";

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string | null;
  initials: string | null;
  rating: number;
  /** The site renders the featured one as the dark card. */
  featured: boolean;
  sort_order: number;
  status: TestimonialStatus;
  created_at: string;
  updated_at: string;
}

export interface TestimonialInsert {
  quote: string;
  name: string;
  role?: string | null;
  initials?: string | null;
  rating: number;
  featured: boolean;
  sort_order: number;
  status: TestimonialStatus;
}

/** "James & Rachel" -> "JR". Used when initials are left blank. */
export function deriveInitials(name: string): string {
  const words = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
