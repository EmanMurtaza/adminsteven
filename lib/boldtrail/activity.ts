import type { ExternalNote } from "../contacts";
import { timestamp } from "./types";

// When someone last actually followed this contact up, according to BoldTrail.
//
// WHY THIS IS NOT "THE MOST RECENT NOTE"
// BoldTrail's note log is 2,865 entries across 968 contacts, and 902 of those
// contacts have nothing in it but automated marketing:
//
//   "Campaign Added: Investors Buybox Campaign - Feb 21st, 2026"   390 contacts
//   "Campaign Added: Vikings - Community Outreach Blog"            255 contacts
//   "Text not sent" / "text_not_sent_policy_violation_title"        75 + 41
//
// Taking the newest note would therefore stamp almost the whole account with a
// recent "last followed up" date whose real meaning is "a bulk campaign went
// out to them". In a list whose entire job is answering "who have I not spoken
// to", that is worse than showing nothing: it would mark 902 people as recently
// contacted when nobody has spoken to them at all.
//
// So only genuine contact events count. There are two:
//
//   • `last_call` on the contact record — 32 contacts, an unambiguous
//     timestamp of a real call, stored as UNIX epoch seconds.
//   • Notes with no title. Every automated entry BoldTrail writes carries a
//     title; the untitled ones are what a person typed by hand, and they read
//     like "Called Jonathan<br/>No answer/ left a voicemail".
//
// Everything else stays in the activity log, where it is visible but is not
// pretending to be a follow-up.

/** Note titles BoldTrail generates itself. Matched case-insensitively. */
const AUTOMATED_TITLE =
  /^(campaign (added|removed)|text not sent|text_not_sent|contact (updated|automatically unsubscribed)|lead (assigned|routed)|email (sent|opened|bounced)|sms unsubscribed|subscribed|unsubscribed|tcpa|added to|imported)/i;

/**
 * True when a note looks like something a person did rather than something the
 * system logged.
 *
 * An untitled note is the strong signal — those are the hand-written call logs.
 * A titled note has to clear the automated list, which keeps genuinely useful
 * entries like "Sent Valuation Report" and "Seller Valuation For: …".
 */
export function isManualNote(note: ExternalNote): boolean {
  const title = (note.title ?? "").trim();
  if (!title) return Boolean(note.details?.trim());
  return !AUTOMATED_TITLE.test(title);
}

/**
 * The last genuine follow-up, as an ISO string, or null when there has never
 * been one. Null is the honest answer for most of this account.
 */
export function lastFollowUpAt(
  raw: Record<string, unknown> | null | undefined,
  notes: ExternalNote[] | null | undefined
): string | null {
  const candidates: string[] = [];

  // `last_call` is epoch seconds; `timestamp` already handles that shape.
  const call = timestamp(raw?.last_call);
  if (call) candidates.push(call);

  for (const note of notes ?? []) {
    if (!note?.date || !isManualNote(note)) continue;
    const when = timestamp(note.date);
    if (when) candidates.push(when);
  }

  if (candidates.length === 0) return null;
  // ISO strings sort lexicographically, so this is the latest.
  return candidates.sort()[candidates.length - 1];
}
