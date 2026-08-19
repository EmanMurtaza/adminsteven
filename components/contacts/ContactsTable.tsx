"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Trash2, ChevronDown, Mail, Phone, CalendarClock, Check } from "lucide-react";
import {
  Contact,
  LEAD_TYPES,
  contactName,
  leadTypeLabel,
  secondaryRoles,
} from "@/lib/contacts";
import { formatDate } from "@/lib/format";
import RoleBadges from "./RoleBadges";
import StageSelect from "./StageSelect";
import ColumnFilters, { type ColumnFilterValues } from "./ColumnFilters";
import RawDetails from "./RawDetails";
import ExternalNotes from "./ExternalNotes";

interface Props {
  contacts: Contact[];
  onUpdate?: (id: string, patch: Partial<Contact>) => Promise<{ error?: string }>;
  onDelete?: (id: string) => Promise<{ error?: string }>;
  /** Per-column filter values, from the URL. Omit to hide the filter row. */
  columnFilters?: ColumnFilterValues;
}

// Warm for a lead being worked, cool for one parked, grey once it is finished.


/** Header cell. Bottom border lives here since the table is border-separate. */
const th = "px-3 py-2.5 font-semibold whitespace-nowrap border-b border-gold/25";

/** Body cell, with the hairline that used to come from divide-y. */
const td = "px-3 py-2.5 border-b border-gold/12";


/** "Austin, TX 78701" from whichever parts exist, or nothing at all. */
function locationOf(c: Contact): string | null {
  const line = [c.city, c.state].filter(Boolean).join(", ");
  const full = [line, c.zip_code].filter(Boolean).join(" ");
  return full || c.address || null;
}

/**
 * BoldTrail derives these from what the contact actually browsed, which makes
 * them the closest thing to a stated brief — worth showing above the
 * housekeeping fields.
 */
function lookingFor(c: Contact): string | null {
  const parts: string[] = [];
  if (c.avg_price) parts.push(`~$${Math.round(c.avg_price).toLocaleString("en-US")}`);
  if (c.avg_beds) parts.push(`${c.avg_beds} bd`);
  if (c.avg_baths) parts.push(`${c.avg_baths} ba`);
  return parts.length ? parts.join(" · ") : null;
}

/** Today in the business time zone, as yyyy-mm-dd, for comparing due dates. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export default function ContactsTable({
  contacts,
  onUpdate,
  onDelete,
  columnFilters,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const today = todayISO();

  // Which edges still have content past them. Measured rather than assumed:
  // whether the table overflows depends on the window, the sidebar and how long
  // the longest email happens to be.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncShadows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    // A pixel of slack: fractional widths mean scrollLeft rarely lands exactly.
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    syncShadows();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The overflow changes when the window resizes or the row count does, not
    // only when someone scrolls.
    const observer = new ResizeObserver(syncShadows);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncShadows, contacts.length]);

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
    <>
    {/* ── Phones: cards, not a ten-column table ────────────────────────────
        The desktop table is 1428px wide. Sideways-scrolling that on a 375px
        screen is not a table, it is a hardship — and this codebase already
        answers the question the same way for listings, blog posts and
        inquiries. Every field still appears; it stacks instead of scrolling. */}
    <div className="sm:hidden space-y-3">
      {contacts.map((c) => {
        const due = c.next_follow_up && c.next_follow_up <= today;
        return (
          <div
            key={c.id}
            className={`bg-white border rounded-xl p-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)] ${
              due ? "border-gold border-l-4" : "border-gold/25"
            }`}
          >
            {/* The name gets the full width. Sharing a row with the stage
                control squeezed it into "Rafael / Diaz" on a 375px screen. */}
            <div className="min-w-0">
              <Link
                href={`/contacts/${c.id}`}
                className="font-serif text-lg text-navy leading-tight hover:text-gold-dark transition-colors break-words"
              >
                {contactName(c)}
              </Link>
              <Stars rating={c.rating} />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <div className="w-[150px] shrink-0">
                <StageSelect
                  value={c.stage}
                  disabled={pending === c.id}
                  onChange={(stage) => patch(c.id, { stage })}
                />
              </div>
              <RoleBadges contact={c} />
            </div>

            <div className="flex flex-col gap-1.5 mt-3">
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-ink-soft break-all">
                  <Mail size={13} className="shrink-0 text-ink-mute" />
                  {c.email}
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-sm text-ink-soft">
                  <Phone size={13} className="shrink-0 text-ink-mute" />
                  {c.phone}
                </a>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-gold/15 text-xs">
              <MobileFact label="Location" value={locationOf(c)} />
              <MobileFact label="Source" value={c.source} />
              <MobileFact
                label="Last visit"
                value={c.last_visit_at ? formatDate(c.last_visit_at) : null}
              />
              <MobileFact label="Created" value={formatDate(c.first_seen_at ?? c.created_at)} />
              <MobileFact
                label="Last followed up"
                value={c.last_contacted_at ? formatDate(c.last_contacted_at) : "Never"}
              />
            </dl>

            {c.tags?.length > 0 && (
              <div className="mt-3">
                <TagList tags={c.tags} />
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gold/15">
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] uppercase tracking-[0.12em] text-ink-mute mb-1">
                  Follow up
                </label>
                <input
                  type="date"
                  value={c.next_follow_up ?? ""}
                  onChange={(e) => patch(c.id, { next_follow_up: e.target.value || null })}
                  disabled={pending === c.id}
                  aria-label="Next follow-up date"
                  className={`w-full bg-white border rounded-md px-2 py-2 text-sm ${
                    due ? "border-gold text-ink" : "border-gold/30 text-ink-mute"
                  }`}
                />
              </div>
              <div className="flex items-center gap-1 self-end">
                <button
                  onClick={() =>
                    patch(c.id, {
                      last_contacted_at: new Date().toISOString(),
                      stage: c.stage === "new_lead" ? "prospect" : c.stage,
                    })
                  }
                  disabled={pending === c.id}
                  aria-label="Mark as contacted today"
                  className="p-2.5 rounded-md text-ink-soft hover:text-gold-dark hover:bg-gold/12 transition-colors disabled:opacity-40"
                >
                  <Check size={17} />
                </button>
                {onDelete && (
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={pending === c.id}
                    aria-label={`Delete ${contactName(c)}`}
                    className="p-2.5 rounded-md text-ink-soft hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* ── Desktop table ─────────────────────────────────────────────────── */}
    <div className="hidden sm:block relative bg-white border border-gold/25 rounded-xl shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
      {/* Ten columns do not fit a laptop beside a 256px sidebar, so the table
          scrolls. These shadows are what stop that reading as "the other
          columns are missing" — they appear only on the side that actually has
          more content, which is the difference between a hint and decoration. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-[180px] w-8 z-30 bg-gradient-to-r from-navy/12 to-transparent transition-opacity duration-200 ${
          atStart ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-[76px] w-8 z-30 bg-gradient-to-l from-navy/12 to-transparent transition-opacity duration-200 ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />
      <div ref={scrollerRef} onScroll={syncShadows} className="overflow-x-auto rounded-xl">
        {/* w-max, NOT w-full. In an auto-layout table `w-[140px]` is a
            suggestion, so when the columns overflow the browser honours the
            min-widths and crushes everything else — which is how Stage ended up
            a 40px box with its label clipped off. Sizing the table to its
            content means every column gets the width it asked for and the
            container scrolls instead. */}
        <table className="w-max min-w-full text-sm border-separate border-spacing-0">
          <thead className="bg-cream-100">
            <tr className="text-left text-[10px] uppercase tracking-[0.13em] text-ink-soft">
              {/* Name is pinned so it stays readable once the row scrolls —
                  a wide table whose left edge disappears is a table of
                  anonymous numbers. */}
              <th className="sticky left-0 z-20 bg-cream-100 px-3 py-2.5 font-semibold min-w-[180px] border-b border-gold/25 after:absolute after:inset-y-0 after:-right-px after:w-px after:bg-gold/25">
                Name
              </th>
              <th className={`${th} min-w-[195px]`}>Contact</th>
              <th className={`${th} min-w-[125px]`}>Type</th>
              <th className={`${th} min-w-[145px]`}>Stage</th>
              <th className={`${th} min-w-[115px]`}>Location</th>
              <th className={`${th} min-w-[115px]`}>Source</th>
              <th className={`${th} min-w-[125px]`}>Hashtags</th>
              <th className={`${th} min-w-[90px]`}>Last visit</th>
              {/* BoldTrail's record of a real call or a hand-written note —
                  never its campaign log. See lib/boldtrail/activity. */}
              <th className={`${th} min-w-[105px]`}>Last followed up</th>
              <th className={`${th} min-w-[130px]`}>Follow up</th>
              {/* Pinned like Name. These are the only buttons in the row, and a
                  delete you have to go looking for sideways is a delete nobody
                  finds. */}
              <th className="sticky right-0 z-20 bg-cream-100 px-3 py-2.5 font-semibold whitespace-nowrap text-right min-w-[76px] border-b border-gold/25 before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-gold/25">
                Actions
              </th>
            </tr>
            {columnFilters && <ColumnFilters values={columnFilters} />}
          </thead>
          <tbody>
            {contacts.map((c) => {
              const due = c.next_follow_up && c.next_follow_up <= today;
              const open = expanded === c.id;
              return (
                <Fragment key={c.id}>
                  <tr
                    key={c.id}
                    className={`group align-middle transition-colors hover:bg-cream-100/60 ${
                      due ? "bg-gold/[0.06]" : ""
                    }`}
                  >
                    {/* A transparent sticky cell lets the scrolled columns slide
                        underneath and show through, so this one has to paint an
                        OPAQUE background of its own — and still match the row's
                        due/hover tints, which are translucent.
                        
                        Hence bg-white for the opaque base plus a flat gradient
                        for the tint: a gradient is a background-image, so it
                        layers over the background-color instead of replacing it.
                        Hard-coding the composited hex would work until someone
                        changes the gold. */}
                    <td
                      className={`sticky left-0 z-10 px-3 py-2.5 border-b border-gold/12 bg-white bg-gradient-to-r transition-colors after:absolute after:inset-y-0 after:-right-px after:w-px after:bg-gold/15 group-hover:from-cream-100/60 group-hover:to-cream-100/60 ${
                        due ? "from-gold/[0.06] to-gold/[0.06]" : "from-transparent to-transparent"
                      }`}
                    >
                      <Link
                        href={`/contacts/${c.id}`}
                        className="block text-navy font-medium hover:text-gold-dark transition-colors"
                      >
                        {contactName(c)}
                      </Link>
                      {/* The row still expands in place — a quick look without
                          losing your position in a 25-row page — but the name
                          now goes to the contact's own page, where the record
                          can actually be edited. */}
                      <button
                        onClick={() => setExpanded(open ? null : c.id)}
                        aria-expanded={open}
                        className="flex items-center gap-1 text-[11px] text-gold-dark hover:text-navy transition-colors mt-0.5"
                      >
                        {open ? "Hide" : "Details"}
                        <ChevronDown size={11} className={open ? "rotate-180" : ""} />
                      </button>
                      {/* Rating rides with the name instead of holding a column
                          of its own: it is two characters wide and only set on
                          a minority of contacts, so a whole column of "—" was
                          paying full width for almost no information. */}
                      <Stars rating={c.rating} />
                    </td>

                    <td className={td}>
                      <div className="flex flex-col gap-1 max-w-[180px]">
                        {c.email && (
                          // truncate, not break-all: breaking mid-word split
                          // "…gmail.co / m" across two lines and made every row
                          // a different height.
                          <a
                            href={`mailto:${c.email}`}
                            title={c.email}
                            className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors min-w-0"
                          >
                            <Mail size={12} className="shrink-0 text-ink-mute" />
                            <span className="truncate">{c.email}</span>
                          </a>
                        )}
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-gold-dark transition-colors tabular-nums"
                          >
                            <Phone size={12} className="shrink-0 text-ink-mute" />
                            {c.phone}
                          </a>
                        )}
                        {!c.email && !c.phone && <span className="text-xs text-ink-mute">—</span>}
                      </div>
                    </td>

                    {/* Read-only here. Type comes from BoldTrail and changes
                        rarely; Stage is the thing worked every day, so that one
                        keeps its inline control and this moves to Details. */}
                    <td className={td}>
                      {/* Capped so three roles wrap to two lines instead of
                          stretching the column to 200px on every row. */}
                      <RoleBadges contact={c} className="max-w-[118px]" />
                    </td>

                    <td className={td}>
                      <StageSelect
                        value={c.stage}
                        disabled={pending === c.id}
                        onChange={(stage) => patch(c.id, { stage })}
                      />
                    </td>

                    <td className={`${td} text-xs text-ink-soft`}>
                      {locationOf(c) ?? <Dash />}
                    </td>

                    {/* Source over the date we first saw them. Two facts about
                        provenance belong together, and it saves a column. */}
                    <td className={td}>
                      <div className="text-xs text-ink-soft">{c.source || <Dash />}</div>
                      <div className="text-[11px] text-ink-mute mt-0.5 whitespace-nowrap">
                        {formatDate(c.first_seen_at ?? c.created_at)}
                      </div>
                    </td>

                    <td className={td}>
                      <TagList tags={c.tags} />
                    </td>

                    <td className={`${td} text-xs text-ink-soft whitespace-nowrap`}>
                      {c.last_visit_at ? formatDate(c.last_visit_at) : <Dash />}
                    </td>

                    <td className={`${td} text-xs whitespace-nowrap`}>
                      {c.last_contacted_at ? (
                        <span className="text-ink-soft">{formatDate(c.last_contacted_at)}</span>
                      ) : (
                        // Blank for 927 of 978, and honestly so: BoldTrail's
                        // note log is almost entirely campaign enrolments, and
                        // "a bulk email went out" is not a follow-up.
                        <span className="text-ink-mute" title="No call or note recorded in BoldTrail">
                          Never
                        </span>
                      )}
                    </td>

                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={c.next_follow_up ?? ""}
                          onChange={(e) => patch(c.id, { next_follow_up: e.target.value || null })}
                          disabled={pending === c.id}
                          aria-label="Next follow-up date"
                          className={`w-full bg-white border rounded-md px-2 py-1.5 text-xs transition focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent ${
                            due
                              ? "border-gold ring-1 ring-gold/40 bg-gold/5 text-ink"
                              : c.next_follow_up
                                ? "border-gold/30 text-ink"
                                : // An unset date is 25 rows of "mm/dd/yyyy"
                                  // shouting for attention it has not earned.
                                  "border-gold/20 text-ink-mute"
                          }`}
                        />
                        {due && <CalendarClock size={14} className="text-gold-dark shrink-0" aria-label="Due" />}
                      </div>
                    </td>

                    <td
                      className={`sticky right-0 z-10 px-3 py-2.5 text-right border-b border-gold/12 bg-white bg-gradient-to-r transition-colors before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-gold/15 group-hover:from-cream-100/60 group-hover:to-cream-100/60 ${
                        due ? "from-gold/[0.06] to-gold/[0.06]" : "from-transparent to-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() =>
                            patch(c.id, {
                              last_contacted_at: new Date().toISOString(),
                              // First contact promotes a brand-new lead once,
                              // and never moves it again.
                              stage: c.stage === "new_lead" ? "prospect" : c.stage,
                            })
                          }
                          disabled={pending === c.id}
                          title="Mark as contacted today"
                          aria-label="Mark as contacted today"
                          className="p-2 rounded-md text-ink-soft hover:text-gold-dark hover:bg-gold/12 transition-colors disabled:opacity-40"
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
                    <tr className="bg-cream-100/60">
                      <td colSpan={11} className="px-4 py-5 border-b border-gold/20">
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
                            {/* Which role leads. The others are BoldTrail's and
                                are not ours to edit, so only this one is a
                                control — it decides what the Type column shows
                                first and what the pipeline groups by. */}
                            <div className="flex gap-2 items-center pb-1">
                              <dt className="text-ink-mute shrink-0 w-28">Primary type</dt>
                              <dd>
                                <select
                                  value={c.lead_type}
                                  onChange={(e) =>
                                    patch(c.id, {
                                      lead_type: e.target.value as Contact["lead_type"],
                                    })
                                  }
                                  disabled={pending === c.id}
                                  aria-label="Primary lead type"
                                  className="bg-white border border-gold/30 text-navy rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
                                >
                                  {LEAD_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </dd>
                            </div>
                            {secondaryRoles(c).length > 0 && (
                              <Row
                                label="Also"
                                value={secondaryRoles(c).map(leadTypeLabel).join(", ")}
                              />
                            )}
                            {/* Where they are and what they want, first —
                                these are what you actually need when the phone
                                is ringing. */}
                            {locationOf(c) && <Row label="Location" value={locationOf(c)!} />}
                            {lookingFor(c) && <Row label="Looking for" value={lookingFor(c)!} />}
                            {c.company && (
                              <Row
                                label="Work"
                                value={[c.job_title, c.company].filter(Boolean).join(", ")}
                              />
                            )}
                            {c.spouse_name && <Row label="Spouse" value={c.spouse_name} />}
                            {c.second_email && <Row label="Other email" value={c.second_email} />}
                            {c.last_visit_at && (
                              <Row label="Last visited site" value={formatDate(c.last_visit_at)} />
                            )}
                            <Row label="Source" value={c.source ?? "—"} />
                            <Row label="Tags" value={c.tags?.length ? c.tags.join(", ") : "—"} />
                            <Row
                              label="Last contacted"
                              value={c.last_contacted_at ? formatDate(c.last_contacted_at) : "Never"}
                            />
                            <Row label="Added" value={formatDate(c.created_at)} />
                            {c.first_seen_at && (
                              <Row label="First seen" value={formatDate(c.first_seen_at)} />
                            )}
                            {c.rating != null && <Row label="Rating" value={`${c.rating} / 5`} />}
                            {c.assigned_agent && <Row label="Agent" value={c.assigned_agent} />}
                            {c.homeowner_status && (
                              <Row label="Homeowner" value={c.homeowner_status} />
                            )}
                            {c.last_closing_date && (
                              <Row label="Last closing" value={formatDate(c.last_closing_date)} />
                            )}
                            {/* Only worth saying when it is a no — an unknown
                                opt-in state is the normal case and reads as
                                noise on every single row. */}
                            {c.email_opt_in === false && (
                              <Row label="Email opt-in" value="Opted out — do not send" />
                            )}
                            {c.submission_id && (
                              <Row label="Origin" value="Website enquiry" />
                            )}
                          </dl>
                        </div>
                        <Link
                          href={`/contacts/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-gold-dark hover:text-navy transition-colors mt-4"
                        >
                          Open full record
                          <span aria-hidden>›</span>
                        </Link>
                        <ExternalNotes notes={c.external_notes} />
                        <RawDetails raw={c.raw} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

/**
 * BoldTrail's 0-5 star rating.
 *
 * Zero is drawn as nothing at all, not as five empty stars. In this account
 * most contacts sit at 0, and a column of empty outlines reads as "rated badly"
 * when it means "never rated" — the two are not the same and only one of them
 * is a reason to skip someone.
 */
/** One labelled fact in a mobile card. Empty ones still show, so the card and
 *  the table disclose the same thing — a card that hides blanks looks complete
 *  when it is not. */
function MobileFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</dt>
      <dd className="text-ink-soft mt-0.5 break-words">{value || "—"}</dd>
    </div>
  );
}

/** An empty cell, said once so "no data" looks the same everywhere. */
function Dash() {
  return <span className="text-ink-mute">—</span>;
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating || rating < 1) return null;
  return (
    <span
      className="mt-1 block text-xs text-gold-dark tracking-[0.08em] whitespace-nowrap"
      title={`${rating} out of 5`}
      aria-label={`Rated ${rating} out of 5`}
    >
      {"★".repeat(Math.min(5, rating))}
    </span>
  );
}

/**
 * Tags, capped at two with a count for the rest.
 *
 * Imports attach batch markers like `import20251007-1985a` alongside the tags
 * that mean something, and a row that wraps to four lines because of them costs
 * more than it tells you. The full set is in Details, and the title attribute
 * carries it on hover.
 */
function TagList({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span className="text-xs text-ink-mute">—</span>;
  const shown = tags.slice(0, 2);
  const rest = tags.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1" title={tags.join(", ")}>
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded px-1.5 py-[3px] text-[10px] font-medium leading-none bg-cream-200 text-ink-soft max-w-[62px] truncate"
        >
          {t}
        </span>
      ))}
      {rest > 0 && <span className="text-[10px] text-ink-mute">+{rest}</span>}
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
