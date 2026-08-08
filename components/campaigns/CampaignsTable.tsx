"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Campaign, statusLabel, isLiveNow } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

interface Props {
  campaigns: Campaign[];
  onDelete?: (id: string) => Promise<{ error?: string }>;
  onSetStatus?: (id: string, status: Campaign["status"]) => Promise<{ error?: string }>;
}

const statusStyles: Record<string, string> = {
  draft: "bg-cream-200 text-ink-soft border border-ink-mute/30",
  published: "bg-gold/15 text-gold-dark border border-gold/40",
  archived: "bg-cream-200 text-ink-mute border border-ink-mute/20",
};

function windowLabel(c: Campaign): string {
  if (!c.starts_at && !c.ends_at) return "Always";
  if (c.starts_at && c.ends_at) return `${formatDate(c.starts_at)} – ${formatDate(c.ends_at)}`;
  if (c.starts_at) return `From ${formatDate(c.starts_at)}`;
  return `Until ${formatDate(c.ends_at)}`;
}

export default function CampaignsTable({ campaigns, onDelete, onSetStatus }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  async function handleDelete(c: Campaign) {
    if (!onDelete) return;
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    setPending(c.id);
    await onDelete(c.id);
    setPending(null);
  }

  async function handleToggle(c: Campaign) {
    if (!onSetStatus) return;
    setPending(c.id);
    await onSetStatus(c.id, c.status === "published" ? "draft" : "published");
    setPending(null);
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">No campaigns yet</p>
        <p className="text-sm text-ink-mute mb-5">
          Create a popup and publish it to show it on the website.
        </p>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          <span>+ New Campaign</span>
          <span className="text-gold">›</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gold/25 rounded-xl overflow-hidden shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 border-b border-gold/25">
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink-mute">
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium w-[110px]">Status</th>
              <th className="px-4 py-3 font-medium w-[200px]">Window</th>
              <th className="px-4 py-3 font-medium w-[80px]">Priority</th>
              <th className="px-4 py-3 font-medium text-right w-[110px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/15">
            {campaigns.map((c) => {
              const live = isLiveNow(c);
              return (
                <tr key={c.id} className="align-middle transition-colors hover:bg-cream-100/60">
                  <td className="px-4 py-3">
                    <p className="text-navy font-medium">{c.title}</p>
                    <p className="text-[11px] text-ink-mute truncate max-w-xs">{c.headline}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${statusStyles[c.status]}`}
                      >
                        {statusLabel(c.status)}
                      </span>
                      {live && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{windowLabel(c)}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft tabular-nums">{c.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggle(c)}
                        disabled={pending === c.id}
                        title={c.status === "published" ? "Unpublish" : "Publish"}
                        aria-label={c.status === "published" ? "Unpublish" : "Publish"}
                        className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors disabled:opacity-40"
                      >
                        {c.status === "published" ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <Link
                        href={`/campaigns/${c.id}/edit`}
                        title="Edit"
                        aria-label="Edit"
                        className="p-2 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={pending === c.id}
                        title="Delete"
                        aria-label="Delete"
                        className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
