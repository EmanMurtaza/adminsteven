"use client";

import { useState } from "react";
import { Trash2, ChevronDown, Mail, Phone, MailOpen } from "lucide-react";
import { Inquiry, parseInquiryMessage, inquirySummary, sourceLabel } from "@/lib/inquiries";
import { formatDateTime } from "@/lib/format";

interface InquiriesTableProps {
  inquiries: Inquiry[];
  onToggleRead?: (id: string, isRead: boolean) => Promise<{ error?: string }>;
  onDelete?: (id: string) => Promise<{ error?: string }>;
}

const sourceStyles: Record<string, string> = {
  buyer: "bg-gold/15 text-gold-dark border border-gold/40",
  seller: "bg-navy/10 text-navy border border-navy/25",
};

function SourceBadge({ source }: { source: string | null }) {
  const style = (source && sourceStyles[source]) ?? "bg-cream-200 text-ink-soft border border-ink-mute/30";
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${style}`}>
      {sourceLabel(source)}
    </span>
  );
}

export default function InquiriesTable({ inquiries, onToggleRead, onDelete }: InquiriesTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handleDelete(inquiry: Inquiry) {
    if (!onDelete) return;
    const who = inquiry.name || inquiry.email || "this enquiry";
    if (!window.confirm(`Delete the enquiry from ${who}? This cannot be undone.`)) return;
    setPending(inquiry.id);
    await onDelete(inquiry.id);
    setPending(null);
  }

  async function handleToggleRead(inquiry: Inquiry) {
    if (!onToggleRead) return;
    setPending(inquiry.id);
    await onToggleRead(inquiry.id, !inquiry.is_read);
    setPending(null);
  }

  // Opening an enquiry marks it read, the way an inbox does.
  async function handleExpand(inquiry: Inquiry) {
    const opening = expanded !== inquiry.id;
    setExpanded(opening ? inquiry.id : null);
    if (opening && !inquiry.is_read && onToggleRead) {
      await onToggleRead(inquiry.id, true);
    }
  }

  if (inquiries.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">Nothing here yet</p>
        <p className="text-sm text-ink-mute">
          Buyer and seller enquiries from the website will land here.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {inquiries.map((inquiry) => (
          <div
            key={inquiry.id}
            className={`bg-white border rounded-xl p-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)] ${
              inquiry.is_read ? "border-gold/25" : "border-gold border-l-4"
            }`}
          >
            <div className="flex justify-between items-start gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base text-navy leading-tight truncate">
                  {inquiry.name || "No name given"}
                </p>
                <p className="text-xs text-ink-mute mt-0.5">
                  {formatDateTime(inquiry.created_at)}
                </p>
              </div>
              <SourceBadge source={inquiry.source} />
            </div>

            <ContactLinks inquiry={inquiry} />

            <Detail inquiry={inquiry} />

            <div className="flex items-center justify-end gap-1 pt-3 mt-3 border-t border-gold/15">
              <ReadButton inquiry={inquiry} pending={pending} onClick={handleToggleRead} />
              <DeleteButton inquiry={inquiry} pending={pending} onClick={handleDelete} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white border border-gold/25 rounded-xl overflow-x-auto shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 border-b border-gold/25">
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink-mute">
              <th className="px-5 py-3 font-medium w-[90px]">Type</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Enquiry</th>
              <th className="px-5 py-3 font-medium w-[190px]">Received</th>
              <th className="px-5 py-3 font-medium text-right w-[110px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/15">
            {inquiries.map((inquiry) => (
              <tr
                key={inquiry.id}
                className={`align-top transition-colors hover:bg-cream-100/60 ${
                  inquiry.is_read ? "" : "bg-gold/[0.04]"
                }`}
              >
                <td className="px-5 py-4">
                  <SourceBadge source={inquiry.source} />
                </td>
                <td className="px-5 py-4">
                  <span className={inquiry.is_read ? "text-navy" : "text-navy font-semibold"}>
                    {inquiry.name || "No name given"}
                  </span>
                  {!inquiry.is_read && (
                    <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-gold align-middle"
                          aria-label="Unread" />
                  )}
                </td>
                <td className="px-5 py-4">
                  <EmailCell email={inquiry.email} />
                </td>
                <td className="px-5 py-4">
                  <PhoneCell phone={inquiry.phone} />
                </td>
                <td className="px-5 py-4 max-w-xs">
                  <button
                    onClick={() => handleExpand(inquiry)}
                    aria-expanded={expanded === inquiry.id}
                    className="text-left w-full group"
                  >
                    <span className="text-ink-soft line-clamp-2 group-hover:text-navy transition-colors">
                      {inquirySummary(inquiry)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-gold-dark mt-1">
                      {expanded === inquiry.id ? "Hide" : "View full enquiry"}
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${expanded === inquiry.id ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>
                  {expanded === inquiry.id && <Detail inquiry={inquiry} />}
                </td>
                <td className="px-5 py-4 text-ink-mute text-xs whitespace-nowrap">
                  {formatDateTime(inquiry.created_at)}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ReadButton inquiry={inquiry} pending={pending} onClick={handleToggleRead} />
                    <DeleteButton inquiry={inquiry} pending={pending} onClick={handleDelete} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ContactLinks({ inquiry, compact }: { inquiry: Inquiry; compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${compact ? "" : "mb-2"}`}>
      {inquiry.email && (
        <a
          href={`mailto:${inquiry.email}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors break-all"
        >
          <Mail size={13} className="shrink-0" />
          {inquiry.email}
        </a>
      )}
      {inquiry.phone && (
        <a
          href={`tel:${inquiry.phone}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors"
        >
          <Phone size={13} className="shrink-0" />
          {inquiry.phone}
        </a>
      )}
      {!inquiry.email && !inquiry.phone && (
        <span className="text-xs text-ink-mute">No contact details</span>
      )}
    </div>
  );
}

// Separate email / phone cells for the desktop table.
function EmailCell({ email }: { email: string | null }) {
  if (!email) return <span className="text-xs text-ink-mute">—</span>;
  return (
    <a
      href={`mailto:${email}`}
      className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors break-all"
    >
      <Mail size={13} className="shrink-0" />
      {email}
    </a>
  );
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-xs text-ink-mute">—</span>;
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors whitespace-nowrap"
    >
      <Phone size={13} className="shrink-0" />
      {phone}
    </a>
  );
}

// The qualifying answers, unpacked back out of the message body.
function Detail({ inquiry }: { inquiry: Inquiry }) {
  const { answers, note, cameFrom } = parseInquiryMessage(inquiry.message);

  return (
    <div className="mt-3 pt-3 border-t border-gold/15 space-y-3">
      {answers.length > 0 && (
        <dl className="space-y-1.5">
          {answers.map((a) => (
            <div key={a.label} className="flex gap-2 text-xs">
              <dt className="text-ink-mute shrink-0">{a.label}:</dt>
              <dd className="text-navy font-medium">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {note && (
        <div className="bg-cream-100 border border-gold/20 rounded-lg px-3 py-2.5">
          <p className="text-xs text-ink-soft whitespace-pre-wrap leading-relaxed">{note}</p>
        </div>
      )}

      {cameFrom && (
        <p className="text-[11px] text-ink-mute">
          Came from <span className="text-gold-dark font-medium">{cameFrom}</span>
        </p>
      )}

      {answers.length === 0 && !note && (
        <p className="text-xs text-ink-mute">No message was included.</p>
      )}
    </div>
  );
}

function ReadButton({
  inquiry,
  pending,
  onClick,
}: {
  inquiry: Inquiry;
  pending: string | null;
  onClick: (i: Inquiry) => void;
}) {
  return (
    <button
      onClick={() => onClick(inquiry)}
      disabled={pending === inquiry.id}
      title={inquiry.is_read ? "Mark as unread" : "Mark as read"}
      aria-label={inquiry.is_read ? "Mark as unread" : "Mark as read"}
      className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors disabled:opacity-40"
    >
      {inquiry.is_read ? <MailOpen size={15} /> : <Mail size={15} />}
    </button>
  );
}

function DeleteButton({
  inquiry,
  pending,
  onClick,
}: {
  inquiry: Inquiry;
  pending: string | null;
  onClick: (i: Inquiry) => void;
}) {
  return (
    <button
      onClick={() => onClick(inquiry)}
      disabled={pending === inquiry.id}
      title="Delete"
      aria-label="Delete enquiry"
      className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
    >
      <Trash2 size={15} />
    </button>
  );
}
