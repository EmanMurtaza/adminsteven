"use client";

import Link from "next/link";
import { Listing } from "@/lib/types";
import { Pencil, Trash2, Eye } from "lucide-react";

interface ListingsTableProps {
  listings: Listing[];
  onDelete?: (id: string) => void;
}

const statusStyles: Record<string, string> = {
  published: "bg-gold/15 text-gold-dark border border-gold/40",
  draft: "bg-cream-200 text-ink-soft border border-ink-mute/30",
  archived: "bg-navy/10 text-navy-500 border border-navy/20",
};

export default function ListingsTable({ listings, onDelete }: ListingsTableProps) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-20 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-2xl text-navy mb-2">No listings yet</p>
        <p className="text-sm text-ink-mute mb-5">
          Add your first property to get started.
        </p>
        <Link
          href="/listings/new"
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          <span>+ Create a Listing</span>
          <span className="text-gold">›</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gold/25 bg-white shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
      <table className="min-w-full divide-y divide-gold/15 text-sm">
        <thead className="bg-cream-100 text-ink-soft uppercase text-[10px] tracking-[0.18em]">
          <tr>
            <th className="px-5 py-4 text-left font-semibold">Title</th>
            <th className="px-5 py-4 text-left font-semibold">Category</th>
            <th className="px-5 py-4 text-left font-semibold">Price</th>
            <th className="px-5 py-4 text-left font-semibold">Status</th>
            <th className="px-5 py-4 text-left font-semibold">Created</th>
            <th className="px-5 py-4 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold/10">
          {listings.map((listing) => (
            <tr key={listing.id} className="hover:bg-cream-100/50 transition-colors">
              <td className="px-5 py-4 font-medium text-navy">{listing.title}</td>
              <td className="px-5 py-4 text-ink-soft">{listing.category ?? "—"}</td>
              <td className="px-5 py-4 text-ink-soft font-medium">
                {listing.price != null ? `$${listing.price.toLocaleString()}` : "—"}
              </td>
              <td className="px-5 py-4">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyles[listing.status]}`}
                >
                  {listing.status}
                </span>
              </td>
              <td className="px-5 py-4 text-ink-mute text-xs">
                {new Date(listing.created_at).toLocaleDateString()}
              </td>
              <td className="px-5 py-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="p-1.5 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors"
                  >
                    <Eye size={16} />
                  </Link>
                  <Link
                    href={`/listings/${listing.id}/edit`}
                    className="p-1.5 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                  >
                    <Pencil size={16} />
                  </Link>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(listing.id)}
                      className="p-1.5 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
