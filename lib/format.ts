// Deterministic formatting for anything rendered on both the server and the
// client.
//
// `toLocaleDateString()` / `toLocaleString()` with no arguments read the
// ambient locale and time zone. On Vercel that is UTC with an en-US ICU
// default; in the browser it is whatever the user has set. The two disagree,
// React hydrates the server HTML, finds different text, and warns:
//   "A tree hydrated but some attributes of the server rendered HTML didn't
//    match the client properties."
//
// Pinning both the locale and the time zone makes server and client produce
// identical strings. America/Chicago is deliberate rather than UTC: this is a
// Dallas–Fort Worth business, so a listing added at 8pm on the 2nd should read
// as the 2nd, not tick over to the 3rd — and it stays correct no matter which
// region the deployment runs in.

const LOCALE = "en-US";
const TIME_ZONE = "America/Chicago";

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Aug 2, 2026" — safe to render during SSR. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

const dateLongFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** "August 2, 2026" — the long form used on detail pages. */
export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateLongFmt.format(d);
}

/** "Aug 2, 2026, 8:30 PM" — safe to render during SSR. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

/** "1,250,000" — grouping separators differ by locale, so pin it too. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(LOCALE);
}

/** "$1,250,000", or a dash when there is no price to show. */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString(LOCALE)}`;
}

/**
 * Percent change from `previous` to `current`, for a stat card's delta badge.
 * Null when there is no baseline to compare against (0 in both periods reads
 * as "nothing changed", not "infinite growth").
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}
