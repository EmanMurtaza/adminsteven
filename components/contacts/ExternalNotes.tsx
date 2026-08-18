"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ExternalNote } from "@/lib/contacts";
import { formatDateTime } from "@/lib/format";

// BoldTrail's note log, shown read-only alongside Steven's own notes.
//
// Their log is append-only and mixes two very different things: notes someone
// actually typed ("85% LTC, construction 100%...") and entries BoldTrail wrote
// itself ("Contact updated by ...", "Text (SMS) updated from On to Off"). The
// automatic ones are noise on a CRM card, so real notes are shown first and
// expanded, and the system chatter is tucked behind a toggle rather than
// discarded — it is still an audit trail.

/** Entries BoldTrail writes itself when a field changes. */
function isSystemEntry(note: ExternalNote): boolean {
  const title = (note.title ?? "").toLowerCase();
  return /updated by|created by|imported|assigned to|status changed/.test(title);
}

function NoteCard({ note }: { note: ExternalNote }) {
  return (
    <li className="border-l-2 border-gold/30 pl-3 py-1">
      <p className="text-[11px] text-ink-mute">
        {note.date ? formatDateTime(note.date.replace(" ", "T") + "Z") : "—"}
        {note.title && <span className="text-ink-soft"> · {note.title}</span>}
      </p>
      {note.details && (
        <p className="text-xs text-navy whitespace-pre-wrap leading-relaxed mt-0.5">
          {note.details}
        </p>
      )}
    </li>
  );
}

export default function ExternalNotes({ notes }: { notes: ExternalNote[] }) {
  const [showSystem, setShowSystem] = useState(false);

  if (!notes?.length) return null;

  const real = notes.filter((n) => !isSystemEntry(n));
  const system = notes.filter(isSystemEntry);

  return (
    <div className="mt-4 border-t border-gold/20 pt-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-mute mb-2">
        From BoldTrail ({notes.length})
      </p>

      {real.length > 0 ? (
        <ul className="space-y-2">
          {real.map((note, i) => (
            <NoteCard key={note.action_id ?? i} note={note} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-mute">Only automatic entries.</p>
      )}

      {system.length > 0 && (
        <>
          <button
            onClick={() => setShowSystem(!showSystem)}
            aria-expanded={showSystem}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ink-mute hover:text-navy transition-colors"
          >
            {showSystem ? "Hide" : "Show"} {system.length} automatic entr
            {system.length === 1 ? "y" : "ies"}
            <ChevronDown size={11} className={showSystem ? "rotate-180" : ""} />
          </button>
          {showSystem && (
            <ul className="space-y-2 mt-2 opacity-70">
              {system.map((note, i) => (
                <NoteCard key={note.action_id ?? `sys-${i}`} note={note} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
