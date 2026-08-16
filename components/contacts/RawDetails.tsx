"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Everything the import kept but does not model.
//
// `contacts.raw` has held the verbatim source row since the CRM was built —
// the stated reason being that a bad column mapping could be re-derived from it
// later. Nothing ever read it back, which made that a promise rather than a
// feature, and left a BoldTrail export's other ninety columns invisible.
//
// Collapsed by default: on a 100-column export this is a wall of text, and the
// fields worth acting on have already been promoted to real columns.

export default function RawDetails({ raw }: { raw: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  // Blank cells are noise here — the export pads every contact out to the full
  // column set, so most rows are mostly empty.
  const entries = Object.entries(raw ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gold/20 pt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-mute hover:text-navy transition-colors"
      >
        {open ? "Hide" : "Show"} original import ({entries.length} field
        {entries.length === 1 ? "" : "s"})
        <ChevronDown size={11} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <dl className="mt-2.5 grid sm:grid-cols-2 gap-x-5 gap-y-1 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 min-w-0">
              <dt className="text-ink-mute shrink-0 max-w-[45%] truncate" title={key}>
                {key}
              </dt>
              <dd className="text-navy break-words min-w-0">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
