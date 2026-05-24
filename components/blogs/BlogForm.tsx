"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPost,
  type BlogPostInsert,
} from "@/lib/types";
import { slugify, validateBlogInput } from "@/lib/validation";

interface BlogFormProps {
  initialData?: Partial<BlogPost>;
  onSubmit: (data: BlogPostInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass =
  "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BlogForm({ initialData, onSubmit }: BlogFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialData?.slug));

  const [form, setForm] = useState<{
    title: string;
    slug: string;
    excerpt: string;
    cat: BlogCategory;
    image: string;
    author: string;
    content: string;
    publishedLocal: string;
    publish: boolean;
  }>({
    title: initialData?.title ?? "",
    slug: initialData?.slug ?? "",
    excerpt: initialData?.excerpt ?? "",
    cat: initialData?.cat ?? "Uncategorized",
    image: initialData?.image ?? "",
    author: initialData?.author ?? "Moning & Associates",
    content: initialData?.content ?? "",
    publishedLocal: toLocalInput(initialData?.published_at),
    publish: Boolean(initialData?.published_at),
  });

  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let publishedIso: string | null = null;
    if (form.publish) {
      publishedIso = form.publishedLocal
        ? new Date(form.publishedLocal).toISOString()
        : new Date().toISOString();
    }

    const payload: Partial<BlogPostInsert> = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt,
      cat: form.cat,
      image: form.image,
      author: form.author,
      content: form.content,
      published_at: publishedIso,
    };

    const validated = validateBlogInput(payload);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setLoading(true);
    const result = await onSubmit(validated.data);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/blogs");
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 sm:space-y-6 max-w-3xl bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
    >
      {error && (
        <div className="bg-burgundy/5 border border-burgundy/30 text-burgundy text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label className={labelClass}>Title *</label>
        <input
          required
          type="text"
          value={form.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className={inputClass}
          placeholder="e.g. Five Things Every Buyer Should Know"
          maxLength={200}
        />
      </div>

      <div>
        <label className={labelClass}>Slug * (lowercase, hyphens, used in URL)</label>
        <input
          required
          type="text"
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            set("slug", e.target.value);
          }}
          className={inputClass + " font-mono"}
          placeholder="five-things-every-buyer-should-know"
          maxLength={120}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
        <p className="text-xs text-ink-mute mt-1.5">
          URL will be <span className="font-mono">/#/blog/{form.slug || "your-slug"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div>
          <label className={labelClass}>Category *</label>
          <select
            value={form.cat}
            onChange={(e) => set("cat", e.target.value as BlogCategory)}
            className={inputClass}
          >
            {BLOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Author</label>
          <input
            type="text"
            value={form.author}
            onChange={(e) => set("author", e.target.value)}
            className={inputClass}
            placeholder="Moning & Associates"
            maxLength={100}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Cover image URL</label>
        <input
          type="url"
          value={form.image}
          onChange={(e) => set("image", e.target.value)}
          className={inputClass}
          placeholder="https://images.unsplash.com/..."
        />
        {form.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.image}
            alt="Preview"
            className="mt-3 h-32 w-auto rounded-md border border-gold/20 object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        )}
      </div>

      <div>
        <label className={labelClass}>Excerpt (1–2 sentence teaser)</label>
        <textarea
          rows={2}
          value={form.excerpt}
          onChange={(e) => set("excerpt", e.target.value)}
          className={inputClass}
          placeholder="Shown on the blog list and detail page intro."
          maxLength={500}
        />
      </div>

      <div>
        <label className={labelClass}>
          Content (mini-markdown: ## H2, ### H3, &gt; quote, - list, **bold**)
        </label>
        <textarea
          rows={16}
          value={form.content}
          onChange={(e) => set("content", e.target.value)}
          className={inputClass + " font-mono text-[13px]"}
          placeholder={`## Section heading\n\nA paragraph of body copy. Use **bold** for emphasis.\n\n- A list item\n- Another\n\n> A pull quote.`}
        />
        <p className="text-xs text-ink-mute mt-1.5">
          {form.content.length.toLocaleString()} chars
        </p>
      </div>

      <div className="border-t border-gold/15 pt-5 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.publish}
            onChange={(e) => set("publish", e.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          <span className="text-sm text-navy font-medium">Publish</span>
          <span className="text-xs text-ink-mute">
            (Unchecked = draft, hidden from the public site)
          </span>
        </label>

        {form.publish && (
          <div>
            <label className={labelClass}>Publish date</label>
            <input
              type="datetime-local"
              value={form.publishedLocal}
              onChange={(e) => set("publishedLocal", e.target.value)}
              className={inputClass + " max-w-xs"}
            />
            <p className="text-xs text-ink-mute mt-1.5">
              Leave blank to use the current time.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gold/15">
        <button
          type="submit"
          disabled={loading}
          className="bg-navy hover:bg-navy-500 text-cream px-6 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <span>{loading ? "Saving…" : "Save Post"}</span>
          {!loading && <span className="text-gold">›</span>}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-6 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
