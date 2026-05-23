"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Listing, ListingInsert } from "@/lib/types";

interface ListingFormProps {
  initialData?: Partial<Listing>;
  onSubmit: (data: ListingInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass =
  "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

export default function ListingForm({ initialData, onSubmit }: ListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ListingInsert>({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    price: initialData?.price ?? null,
    category: initialData?.category ?? "",
    status: initialData?.status ?? "draft",
    images: initialData?.images ?? [],
    meta: initialData?.meta ?? {},
  });

  const set = (field: keyof ListingInsert, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await onSubmit(form);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/listings");
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 sm:space-y-6 max-w-2xl bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
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
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
          placeholder="e.g. Luxury Estate in Highland Park"
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          rows={4}
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          className={inputClass}
          placeholder="A captivating overview of the property…"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div>
          <label className={labelClass}>Price</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.price ?? ""}
            onChange={(e) => set("price", e.target.value ? Number(e.target.value) : null)}
            className={inputClass}
            placeholder="0"
          />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <input
            type="text"
            value={form.category ?? ""}
            onChange={(e) => set("category", e.target.value)}
            className={inputClass}
            placeholder="Luxury / Land / Off-Market…"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <select
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          className={inputClass}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gold/15">
        <button
          type="submit"
          disabled={loading}
          className="bg-navy hover:bg-navy-500 text-cream px-6 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <span>{loading ? "Saving…" : "Save Listing"}</span>
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
