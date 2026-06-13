"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BlogPost, BlogPostInsert } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { ImageIcon, X } from "lucide-react";

const RichTextEditor = dynamic(() => import("./RichTextEditor"), { ssr: false });

interface BlogFormProps {
  initialData?: Partial<BlogPost>;
  onSubmit: (data: BlogPostInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass =
  "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function BlogForm({ initialData, onSubmit }: BlogFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BlogPostInsert>({
    title: initialData?.title ?? "",
    slug: initialData?.slug ?? "",
    author: initialData?.author ?? "",
    excerpt: initialData?.excerpt ?? "",
    content: initialData?.content ?? "",
    cover_image: initialData?.cover_image ?? null,
    tags: initialData?.tags ?? [],
    status: initialData?.status ?? "draft",
  });

  const [tagsRaw, setTagsRaw] = useState(
    (initialData?.tags ?? []).join(", ")
  );

  const set = (field: keyof BlogPostInsert, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleTitleChange(title: string) {
    set("title", title);
    if (!initialData?.slug) {
      set("slug", slugify(title));
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(path, file);
    if (!uploadError && data) {
      const { data: urlData } = supabase.storage
        .from("blog-images")
        .getPublicUrl(data.path);
      set("cover_image", urlData.publicUrl);
    } else if (uploadError) {
      setError("Cover upload failed: " + uploadError.message);
    }
    setCoverUploading(false);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload: BlogPostInsert = {
      ...form,
      tags: tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const result = await onSubmit(payload);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/blog");
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 max-w-3xl bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
    >
      {error && (
        <div className="bg-burgundy/5 border border-burgundy/30 text-burgundy text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Cover image */}
      <div>
        <label className={labelClass}>Cover Image</label>
        {form.cover_image ? (
          <div className="relative rounded-lg overflow-hidden border border-gold/25 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.cover_image}
              alt="Cover"
              className="w-full h-48 object-cover"
            />
            <div className="absolute inset-0 bg-navy/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="px-3 py-1.5 bg-white text-navy text-xs rounded-md font-medium hover:bg-cream transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => set("cover_image", null)}
                className="p-1.5 bg-burgundy/90 text-white rounded-md hover:bg-burgundy transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className="w-full h-36 border-2 border-dashed border-gold/35 rounded-lg text-ink-mute hover:border-gold hover:text-navy transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50"
          >
            <ImageIcon size={24} className="text-gold/60" />
            <span className="text-sm">
              {coverUploading ? "Uploading…" : "Upload cover image"}
            </span>
            <span className="text-xs text-ink-mute/70">
              Click to browse or drag & drop
            </span>
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverUpload}
          className="hidden"
        />
      </div>

      {/* Title */}
      <div>
        <label className={labelClass}>Title *</label>
        <input
          required
          type="text"
          value={form.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className={inputClass}
          placeholder="e.g. DFW Luxury Market Trends 2025"
        />
      </div>

      {/* Slug */}
      <div>
        <label className={labelClass}>Slug (URL)</label>
        <div className="flex items-center border border-gold/30 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-gold bg-cream-100">
          <span className="px-3 text-xs text-ink-mute border-r border-gold/20 py-2.5 bg-cream-200 shrink-0">
            /blog/
          </span>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => set("slug", slugify(e.target.value))}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-navy focus:outline-none"
            placeholder="dfw-luxury-market-trends-2025"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {/* Author */}
        <div>
          <label className={labelClass}>Author</label>
          <input
            type="text"
            value={form.author ?? ""}
            onChange={(e) => set("author", e.target.value)}
            className={inputClass}
            placeholder="Steven Moning"
          />
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as BlogPostInsert["status"])}
            className={inputClass}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Excerpt */}
      <div>
        <label className={labelClass}>Excerpt / Summary</label>
        <textarea
          rows={2}
          value={form.excerpt ?? ""}
          onChange={(e) => set("excerpt", e.target.value)}
          className={inputClass}
          placeholder="A short description shown in listing cards and SEO…"
        />
      </div>

      {/* Tags */}
      <div>
        <label className={labelClass}>Tags</label>
        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          className={inputClass}
          placeholder="luxury, DFW, market-update (comma separated)"
        />
      </div>

      {/* Rich text body */}
      <div>
        <label className={labelClass}>Content *</label>
        <RichTextEditor
          content={form.content}
          onChange={(html) => set("content", html)}
        />
      </div>

      {/* Actions */}
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
