import { BLOG_CATEGORIES, type BlogCategory, type BlogRecordInsert } from "./types";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 200;
const MAX_EXCERPT = 500;
const MAX_AUTHOR = 100;
const MAX_CONTENT = 100_000;
const MAX_IMAGE = 2000;
const MAX_SLUG = 120;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG);
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface ValidatedBlog extends BlogRecordInsert {
  cat: BlogCategory;
}

export type ValidationResult =
  | { ok: true; data: ValidatedBlog }
  | { ok: false; error: string };

export function validateBlogInput(raw: Partial<BlogRecordInsert>): ValidationResult {
  const title = (raw.title ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > MAX_TITLE) return { ok: false, error: `Title must be ${MAX_TITLE} chars or fewer.` };

  const slug = (raw.slug ?? "").trim();
  if (!slug) return { ok: false, error: "Slug is required." };
  if (slug.length > MAX_SLUG) return { ok: false, error: `Slug must be ${MAX_SLUG} chars or fewer.` };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Slug must be lowercase kebab-case (a-z, 0-9, hyphens)." };
  }

  const cat = raw.cat as BlogCategory | undefined;
  if (!cat || !(BLOG_CATEGORIES as readonly string[]).includes(cat)) {
    return { ok: false, error: "Category must be one of the allowed values." };
  }

  const excerpt = (raw.excerpt ?? "").trim();
  if (excerpt.length > MAX_EXCERPT) return { ok: false, error: `Excerpt must be ${MAX_EXCERPT} chars or fewer.` };

  const author = (raw.author ?? "").trim();
  if (author.length > MAX_AUTHOR) return { ok: false, error: `Author must be ${MAX_AUTHOR} chars or fewer.` };

  const image = (raw.image ?? "").trim();
  if (image) {
    if (image.length > MAX_IMAGE) return { ok: false, error: "Image URL too long." };
    if (!isHttpUrl(image)) return { ok: false, error: "Image must be a valid http(s) URL." };
  }

  const content = raw.content ?? "";
  if (content.length > MAX_CONTENT) {
    return { ok: false, error: `Content exceeds ${MAX_CONTENT} chars.` };
  }

  return {
    ok: true,
    data: {
      slug,
      title,
      excerpt: excerpt || null,
      cat,
      image: image || null,
      author: author || null,
      content: content || null,
      published_at: raw.published_at ?? null,
    },
  };
}
