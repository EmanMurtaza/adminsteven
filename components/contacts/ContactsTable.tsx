"use client";

import { useState } from "react";
import { Trash2, ChevronDown, Mail, Phone, CalendarClock, Check } from "lucide-react";
import {
  Contact,
  LEAD_TYPES,
  STAGES,
  contactName,
  leadTypeLabel,
  stageLabel,
} from "@/lib/contacts";
import { formatDate } from "@/lib/format";

interface Props {
  contacts: Contact[];
  onUpdate?: (id: string, patch: Partial<Contact>) => Promise<{ error?: string }>;
  onDelete?: (id: string) => Promise<{ error?: string }>;
}

const stageStyles: Record<string, string> = {
  new: "bg-gold/15 text-gold-dark border border-gold/40",
  contacted: "bg-navy/10 text-navy border border-navy/25",
  qualified: "bg-navy/10 text-navy border border-navy/25",
  active: "bg-gold/25 text-gold-dark border border-gold/60",
  closed: "bg-cream-200 text-ink-soft border border-ink-mute/30",
  lost: "bg-cream-200 text-ink-mute border border-ink-mute/20",
};

const typeStyles: Record<string, string> = {
  buyer: "bg-gold/15 text-gold-dark border border-gold/40",
  seller: "bg-navy/10 text-navy border border-navy/25",
  investor: "bg-navy/10 text-navy border border-navy/25",
  both: "bg-gold/15 text-gold-dark border border-gold/40",
  unknown: "bg-cream-200 text-ink-mute border border-ink-mute/25",
};

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";

/** Today in the business time zone, as yyyy-mm-dd, for comparing due dates. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export default function ContactsTable({ contacts, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const today = todayISO();

  async function patch(id: string, values: Partial<Contact>) {
    if (!onUpdate) return;
    setPending(id);
    await onUpdate(id, values);
    setPending(null);
  }

  async function handleDelete(contact: Contact) {
    if (!onDelete) return;
    if (!window.confirm(`Delete ${contactName(contact)}? This cannot be undone.`)) return;
    setPending(contact.id);
    await onDelete(contact.id);
    setPending(null);
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">No contacts here</p>
        <p className="text-sm text-ink-mute">
          Import a CSV, or wait for the next website enquiry.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gold/25 rounded-xl overflow-hidden shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 border-b border-gold/25">
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink-mute">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium w-[120px]">Type</th>
              <th className="px-4 py-3 font-medium w-[130px]">Stage</th>
              <th className="px-4 py-3 font-medium w-[150px]">Follow up</th>
              <th className="px-4 py-3 font-medium text-right w-[90px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/15">
            {contacts.map((c) => {
              const due = c.next_follow_up && c.next_follow_up <= today;
              const open = expanded === c.id;
              return (
                <>
                  <tr
                    key={c.id}
                    className={`align-middle transition-colors hover:bg-cream-100/60 ${
                      due ? "bg-gold/[0.06]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpanded(open ? null : c.id)}
                        aria-expanded={open}
                        className="text-left group"
                      >
                        <span className="text-navy font-medium group-hover:text-gold-dark transition-colors">
                          {contactName(c)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gold-dark mt-0.5">
                          {open ? "Hide" : "Details"}
                          <ChevronDown size={11} className={open ? "rotate-180" : ""} />
                        </span>
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark break-all">
                            <Mail size={12} className="shrink-0" />
                            {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark">
                            <Phone size={12} className="shrink-0" />
                            {c.phone}
                          </a>
                        )}
                        {!c.email && !c.phone && <span className="text-xs text-ink-mute">—</span>}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={c.lead_type}
                        onChange={(e) => patch(c.id, { lead_type: e.target.value as Contact["lead_type"] })}
                        disabled={pending === c.id}
                        aria-label="Lead type"
                        className={`${inputClass} ${typeStyles[c.lead_type] ?? ""}`}
                      >
                        {LEAD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={c.stage}
                        onChange={(e) => patch(c.id, { stage: e.target.value as Contact["stage"] })}
                        disabled={pending === c.id}
                        aria-label="Stage"
                        className={`${inputClass} ${stageStyles[c.stage] ?? ""}`}
                      >
                        {STAGES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={c.next_follow_up ?? ""}
                          onChange={(e) => patch(c.id, { next_follow_up: e.target.value || null })}
                          disabled={pending === c.id}
                          aria-label="Next follow-up date"
                          className={`${inputClass} ${due ? "border-gold ring-1 ring-gold/40" : ""}`}
                        />
                        {due && <CalendarClock size={14} className="text-gold-dark shrink-0" aria-label="Due" />}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() =>
                            patch(c.id, {
                              last_contacted_at: new Date().toISOString(),
                              stage: c.stage === "new" ? "contacted" : c.stage,
                            })
                          }
                          disabled={pending === c.id}
                          title="Mark as contacted today"
                          aria-label="Mark as contacted today"
                          className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors disabled:opacity-40"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={pending === c.id}
                          title="Delete"
                          aria-label="Delete contact"
                          className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {open && (
                    <tr key={`${c.id}-detail`} className="bg-cream-100/50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid md:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-[11px] uppercase tracking-[0.14em] text-ink-mute mb-1.5">
                              Notes
                            </label>
                            <NotesBox
                              value={c.notes ?? ""}
                              disabled={pending === c.id}
                              onSave={(notes) => patch(c.id, { notes: notes || null })}
                            />
                          </div>
                          <dl className="text-xs space-y-1.5">
                            <Row label="Source" value={c.source ?? "—"} />
                            <Row label="Tags" value={c.tags?.length ? c.tags.join(", ") : "—"} />
                            <Row
                              label="Last contacted"
                              value={c.last_contacted_at ? formatDate(c.last_contacted_at) : "Never"}
                            />
                            <Row label="Added" value={formatDate(c.created_at)} />
                            {c.submission_id && (
                              <Row label="Origin" value="Website enquiry" />
                            )}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-ink-mute shrink-0 w-28">{label}</dt>
      <dd className="text-navy">{value}</dd>
    </div>
  );
}

// Saves on blur rather than on every keystroke — one write per edit, and no
// round-trip while Steven is still typing.
function NotesBox({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      rows={4}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder="What was said, what they want, when to chase…"
      className="w-full bg-white border border-gold/30 text-navy rounded-md px-3 py-2 text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
    />
  );
}
