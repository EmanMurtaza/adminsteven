"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Mail, Phone } from "lucide-react";
import { Contact, STAGES, Stage, contactName, leadTypeLabel } from "@/lib/contacts";

interface Props {
  contacts: Contact[];
  onMove: (id: string, stage: Stage) => Promise<{ error?: string }>;
}

const typeStyles: Record<string, string> = {
  buyer: "bg-gold/15 text-gold-dark border-gold/40",
  seller: "bg-navy/10 text-navy border-navy/25",
  investor: "bg-navy/10 text-navy border-navy/25",
  both: "bg-gold/15 text-gold-dark border-gold/40",
  unknown: "bg-cream-200 text-ink-mute border-ink-mute/25",
};

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function groupByStage(contacts: Contact[]): Record<Stage, Contact[]> {
  const grouped = Object.fromEntries(STAGES.map((s) => [s.value, [] as Contact[]])) as Record<
    Stage,
    Contact[]
  >;
  for (const c of contacts) {
    (grouped[c.stage] ?? grouped.new).push(c);
  }
  return grouped;
}

export default function PipelineBoard({ contacts, onMove }: Props) {
  // Seeded once from the server-fetched list, then mutated optimistically as
  // cards are dragged — reloading the page (or switching the filter, which
  // remounts this component via its `key`) is what re-syncs with the server.
  const [columns, setColumns] = useState<Record<Stage, Contact[]>>(() => groupByStage(contacts));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const today = todayISO();

  function handleDrop(stage: Stage) {
    setOverStage(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;

    let fromStage: Stage | undefined;
    let moved: Contact | undefined;
    for (const s of STAGES) {
      const found = columns[s.value].find((c) => c.id === id);
      if (found) {
        fromStage = s.value;
        moved = found;
        break;
      }
    }
    if (!moved || !fromStage || fromStage === stage) return;
    const originStage = fromStage;
    const originContact = moved;

    setColumns((prev) => {
      const next: Record<Stage, Contact[]> = { ...prev };
      next[originStage] = next[originStage].filter((c) => c.id !== id);
      next[stage] = [{ ...originContact, stage }, ...next[stage]];
      return next;
    });

    onMove(id, stage).then((result) => {
      if (!result.error) return;
      // Revert on failure — the write didn't stick, so the board shouldn't
      // pretend otherwise.
      setColumns((prev) => {
        const next: Record<Stage, Contact[]> = { ...prev };
        next[stage] = next[stage].filter((c) => c.id !== id);
        next[originStage] = [originContact, ...next[originStage]];
        return next;
      });
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
      {STAGES.map((stage) => {
        const cards = columns[stage.value];
        const isOver = overStage === stage.value;
        return (
          <div
            key={stage.value}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage.value);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage.value ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage.value);
            }}
            className={`shrink-0 w-72 bg-cream-100 border rounded-xl flex flex-col max-h-[calc(100vh-220px)] transition-colors ${
              isOver ? "border-gold ring-2 ring-gold/30" : "border-gold/25"
            }`}
          >
            <div className="px-4 py-3 border-b border-gold/20 flex items-center justify-between shrink-0">
              <h3 className="font-serif text-navy text-base">{stage.label}</h3>
              <span className="text-xs font-medium text-ink-mute bg-white border border-gold/25 rounded-full px-2 py-0.5">
                {cards.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {cards.length === 0 && (
                <p className="text-xs text-ink-mute text-center py-6">No leads here</p>
              )}
              {cards.map((c) => {
                const due = c.next_follow_up && c.next_follow_up <= today;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(c.id);
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                    className={`bg-white border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-[0_2px_10px_-6px_rgba(14,27,48,0.15)] transition-opacity ${
                      draggingId === c.id ? "opacity-40" : "opacity-100"
                    } ${due ? "border-gold" : "border-gold/20"}`}
                  >
                    <Link
                      href={`/contacts?q=${encodeURIComponent(c.email ?? c.phone ?? "")}`}
                      className="font-medium text-navy text-sm hover:text-gold-dark transition-colors block truncate"
                      title={contactName(c)}
                    >
                      {contactName(c)}
                    </Link>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          typeStyles[c.lead_type] ?? typeStyles.unknown
                        }`}
                      >
                        {leadTypeLabel(c.lead_type)}
                      </span>
                      {c.source && (
                        <span className="text-[10px] text-ink-mute truncate">{c.source}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-2">
                      {c.email && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft truncate">
                          <Mail size={10} className="shrink-0" />
                          {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
                          <Phone size={10} className="shrink-0" />
                          {c.phone}
                        </span>
                      )}
                    </div>
                    {c.next_follow_up && (
                      <div
                        className={`inline-flex items-center gap-1 mt-2 text-[11px] ${
                          due ? "text-gold-dark font-medium" : "text-ink-mute"
                        }`}
                      >
                        <CalendarClock size={11} />
                        {c.next_follow_up}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
