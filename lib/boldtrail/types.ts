// Shapes of the BoldTrail contact payloads.
//
// Written from the field census in scripts/probe-boldtrail.mjs run against the
// real account — NOT from documentation, which is not public. A strict
// interface built on guessed field names is worse than none: every field maps
// silently to null and the sync looks like it works.
//
// Everything is optional and loosely typed on purpose. This is someone else's
// API, it can add or drop a field without telling us, and a runtime shape
// change must degrade to "that field is missing" rather than throw.

/**
 * What GET /v2/public/contacts returns — 16 fields, 500 per page.
 *
 * This is the cheap endpoint and the whole basis of the sync being affordable:
 * 978 contacts arrive in two requests, and `updated_at` is included, so we can
 * tell which handful changed without fetching anything else.
 */
export interface BoldTrailListContact {
  id?: number | string;
  /** One combined field here. The detail endpoint splits it in two. */
  name?: string | null;
  email?: string | null;
  cell_phone_1?: string | null;
  cell_phone_2?: string | null;
  home_phone?: string | null;
  work_phone?: string | null;
  /** Numeric code. Observed: 1, 3, 4, 7. Meaning not yet established. */
  status?: number | null;
  source?: string | null;
  /** An array, not a string — e.g. buyer/seller flags. */
  deal_type?: unknown;
  assigned_agent_id?: number | null;
  assigned_agent_external_id?: string | null;
  is_private?: number | null;
  external_vendor_id?: string | null;
  registered?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * What GET /v2/public/contact/{id} returns — 83 fields, one request each.
 *
 * Only the ones we actually map are named; the rest ride along in the index
 * signature and are stored verbatim in `contacts.external_raw`.
 */
export interface BoldTrailContactDetail extends BoldTrailListContact {
  first_name?: string | null;
  last_name?: string | null;
  rating?: number | string | null;
  email_optin?: unknown;
  second_email?: string | null;
  capture_method?: string | null;
  referrer?: string | null;
  last_closing_date?: string | null;
  homeowner?: unknown;
  company?: string | null;
  title?: string | null;
  birthday?: string | null;
  primary_address?: string | null;
  primary_city?: string | null;
  primary_state?: string | null;
  primary_zip?: string | null;
  avg_price?: number | string | null;
  avg_beds?: number | string | null;
  avg_baths?: number | string | null;
  /** Consent fields. Read-only to us, but they decide whether email is legal. */
  gave_consent?: unknown;
  tcpa_optin_date?: string | null;
  [key: string]: unknown;
}

// ── Narrowing helpers ────────────────────────────────────────────────────────
// Their JSON is inconsistent about types: numbers arrive as strings, booleans
// as 0/1/"Y", empty values as "" or null depending on the field. These turn any
// of that into something usable, or null — never a throw, never NaN.

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Tri-state. `null` means "they did not say", which is not the same as "no" —
 * it matters for email consent, where absence must never be read as permission.
 */
export function bool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "y", "yes", "on"].includes(v)) return true;
  if (["0", "false", "n", "no", "off"].includes(v)) return false;
  return null;
}

/** Their `deal_type` is an array; other list-ish fields may be a delimited string. */
export function strList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => str(v)).filter((v): v is string => Boolean(v));
  }
  const single = str(value);
  if (!single) return [];
  return single.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Their timestamps arrive as "2026-07-20 06:24:29" — a space, no zone. Treating
 * that as UTC is a decision, not a fact, but consistency matters more than
 * correctness here: the value is only ever compared against the previous value
 * of the same field to answer "did this change".
 */
export function timestamp(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;

  // Not one format but three, discovered by inspecting real payloads:
  //
  //   "2026-07-20 06:24:29"   most date fields
  //   1781905773              last_visit / last_call — UNIX epoch SECONDS
  //   "0000-00-00 00:00:00"   MySQL's zero date, meaning "never"
  //
  // The epoch case is the one that bites: `new Date("1781905773")` is an
  // Invalid Date, so these silently mapped to null until someone looked.
  if (/^\d{9,13}$/.test(raw)) {
    const n = Number(raw);
    const parsed = new Date(raw.length <= 10 ? n * 1000 : n);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (raw.startsWith("0000-00-00")) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * A number that is only meaningful when positive.
 *
 * Their avg_price / avg_beds / avg_baths are 0 rather than null when unknown,
 * which is not the same thing at all — storing the 0 would put "looking for
 * ~$0 · 0 bd" on hundreds of contacts.
 */
export function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

/** Their contact id, always as a string — we store it in a text column. */
export function externalId(record: BoldTrailListContact): string | null {
  return record.id === null || record.id === undefined ? null : String(record.id);
}
