"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import {
  Testimonial,
  TestimonialInsert,
  deriveInitials,
} from "@/lib/testimonials";

interface Props {
  initialData?: Partial<Testimonial>;
  onSubmit: (data: TestimonialInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass =
  "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

export default function TestimonialForm({ initialData, onSubmit }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<TestimonialInsert>({
    quote: initialData?.quote ?? "",
    name: initialData?.name ?? "",
    role: initialData?.role ?? "",
    initials: initialData?.initials ?? "",
    rating: initialData?.rating ?? 5,
    featured: initialData?.featured ?? false,
    sort_order: initialData?.sort_order ?? 0,
    status: initialData?.status ?? "published",
  });

  const set = <K extends keyof TestimonialInsert>(key: K, value: TestimonialInsert[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const previewInitials = form.initials?.trim() || deriveInitials(form.name || "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.quote.trim() || !form.name.trim()) {
      setError("A quote and a name are both required.");
      return;
    }
    setLoading(true);
    setError(null);

    const result = await onSubmit({
      ...form,
      quote: form.quote.trim(),
      name: form.name.trim(),
      role: form.role?.trim() || null,
      initials: form.initials?.trim() || null,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/testimonials");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-5">
        <div>
          <label htmlFor="quote" className={labelClass}>
            What they said
          </label>
          <textarea
            id="quote"
            rows={5}
            value={form.quote}
            onChange={(e) => set("quote", e.target.value)}
            placeholder="Their words, as they said them."
            className={`${inputClass} resize-y leading-relaxed`}
            required
          />
          <p className="text-[11px] text-ink-mute mt-1.5">
            Quotation marks are added by the design — no need to type them.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="name" className={labelClass}>
              Client name
            </label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="James &amp; Rachel"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="role" className={labelClass}>
              Who they are
            </label>
            <input
              id="role"
              value={form.role ?? ""}
              onChange={(e) => set("role", e.target.value)}
              placeholder="First-Time Buyers · Frisco, TX"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          <div>
            <label htmlFor="initials" className={labelClass}>
              Initials
            </label>
            <div className="flex items-center gap-3">
              <input
                id="initials"
                value={form.initials ?? ""}
                onChange={(e) => set("initials", e.target.value)}
                placeholder={previewInitials}
                maxLength={3}
                className={inputClass}
              />
              <span
                className="w-11 h-11 shrink-0 rounded-full grid place-items-center font-serif font-bold text-navy bg-gold"
                title="How the avatar will look"
              >
                {previewInitials}
              </span>
            </div>
            <p className="text-[11px] text-ink-mute mt-1.5">
              Leave blank to use {previewInitials}.
            </p>
          </div>

          <div>
            <label className={labelClass}>Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("rating", n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={form.rating === n}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={20}
                    className={n <= form.rating ? "text-gold fill-gold" : "text-ink-mute/40"}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="sort_order" className={labelClass}>
              Order on the site
            </label>
            <input
              id="sort_order"
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
              className={inputClass}
            />
            <p className="text-[11px] text-ink-mute mt-1.5">Lower numbers come first.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 pt-1">
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as TestimonialInsert["status"])}
              className={inputClass}
            >
              <option value="published">Published — visible on the site</option>
              <option value="draft">Draft — hidden</option>
            </select>
          </div>

          <label className="flex items-start gap-3 sm:pt-8 cursor-pointer">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set("featured", e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#C9A84C]"
            />
            <span>
              <span className="block text-sm text-navy font-medium">Highlight this one</span>
              <span className="block text-[11px] text-ink-mute mt-0.5">
                Shows as the dark card on the website.
              </span>
            </span>
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-navy hover:bg-navy-500 disabled:opacity-50 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          {loading ? "Saving…" : "Save testimonial"}
          {!loading && <span className="text-gold">›</span>}
        </button>
        <button
          type="button"
          onClick={() => router.push("/testimonials")}
          className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
