"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2, Star, Eye, EyeOff } from "lucide-react";
import { Testimonial, deriveInitials } from "@/lib/testimonials";
import { formatDate } from "@/lib/format";

interface Props {
  testimonials: Testimonial[];
  onDelete?: (id: string) => Promise<{ error?: string }>;
  onToggleStatus?: (id: string, status: "draft" | "published") => Promise<{ error?: string }>;
}

export default function TestimonialsTable({ testimonials, onDelete, onToggleStatus }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  async function handleDelete(t: Testimonial) {
    if (!onDelete) return;
    if (!window.confirm(`Delete the testimonial from ${t.name}? This cannot be undone.`)) return;
    setPending(t.id);
    await onDelete(t.id);
    setPending(null);
  }

  async function handleToggle(t: Testimonial) {
    if (!onToggleStatus) return;
    setPending(t.id);
    await onToggleStatus(t.id, t.status === "published" ? "draft" : "published");
    setPending(null);
  }

  if (testimonials.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">No testimonials yet</p>
        <p className="text-sm text-ink-mute mb-5">
          Add a client quote and it appears on the website straight away.
        </p>
        <Link
          href="/testimonials/new"
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          <span>+ New Testimonial</span>
          <span className="text-gold">›</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {testimonials.map((t) => {
        const draft = t.status === "draft";
        return (
          <article
            key={t.id}
            className={`bg-white border rounded-xl p-5 flex flex-col shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)] transition-opacity ${
              t.featured ? "border-gold" : "border-gold/25"
            } ${draft ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    className={i < t.rating ? "text-gold fill-gold" : "text-ink-mute/30"}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {t.featured && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-gold/15 text-gold-dark border border-gold/40">
                    Highlighted
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                    draft
                      ? "bg-cream-200 text-ink-soft border border-ink-mute/30"
                      : "bg-gold/15 text-gold-dark border border-gold/40"
                  }`}
                >
                  {t.status}
                </span>
              </div>
            </div>

            <blockquote className="text-sm text-ink-soft italic leading-relaxed flex-1 line-clamp-5">
              {t.quote}
            </blockquote>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gold/15">
              <span className="w-10 h-10 shrink-0 rounded-full grid place-items-center font-serif font-bold text-navy bg-gold text-sm">
                {t.initials?.trim() || deriveInitials(t.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy truncate">{t.name}</p>
                <p className="text-[11px] text-ink-mute truncate">{t.role ?? "—"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(t)}
                  disabled={pending === t.id}
                  title={draft ? "Publish" : "Hide from the site"}
                  aria-label={draft ? "Publish" : "Hide from the site"}
                  className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors disabled:opacity-40"
                >
                  {draft ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <Link
                  href={`/testimonials/${t.id}/edit`}
                  title="Edit"
                  aria-label="Edit"
                  className="p-2 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                >
                  <Pencil size={15} />
                </Link>
                <button
                  onClick={() => handleDelete(t)}
                  disabled={pending === t.id}
                  title="Delete"
                  aria-label="Delete"
                  className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-ink-mute mt-2.5">
              Position {t.sort_order} · added {formatDate(t.created_at)}
            </p>
          </article>
        );
      })}
    </div>
  );
}
