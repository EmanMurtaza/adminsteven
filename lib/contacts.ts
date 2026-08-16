// Personal CRM — the lead list that replaces BoldTrail.
//
// Contacts arrive three ways: a CSV import (the one-time escape route out of
// BoldTrail, and any spreadsheet after that), the website buyer/seller forms,
// or typed in by hand. Whichever way, they land in `contacts` and are worked
// through the same pipeline.

export const STAGES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "lost", label: "Lost" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

// BoldTrail's own vocabulary, deliberately. Importing into an invented list
// meant "vendor" and "agent" became "unknown" and every multi-role contact
// became "both" — a translation step that only ever lost detail.
//
// Order is meaningful: it is the precedence used to pick the single `lead_type`
// when a contact holds several roles (see pickLeadType in boldtrail/mapping).
export const LEAD_TYPES = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "renter", label: "Renter" },
  { value: "vendor", label: "Vendor" },
  { value: "agent", label: "Agent" },
  { value: "unknown", label: "Unknown" },
] as const;

export type LeadType = (typeof LEAD_TYPES)[number]["value"];

/** Precedence for reducing several roles to the one shown in a single column. */
export const LEAD_TYPE_PRECEDENCE: LeadType[] = [
  "buyer",
  "seller",
  "renter",
  "vendor",
  "agent",
];

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  lead_type: LeadType;
  /**
   * Every role this contact holds. BoldTrail's deal_type is multi-valued, and
   * "buyer,seller,renter" is one of the commonest values — `lead_type` is just
   * the first of these by precedence, kept single so filters and the pipeline
   * board still work.
   */
  deal_types: string[];
  stage: Stage;
  source: string | null;
  tags: string[];
  next_follow_up: string | null;
  last_contacted_at: string | null;
  notes: string | null;

  // Promoted out of a BoldTrail export because Steven needs to act on them —
  // everything else from that file stays in `raw`. See
  // supabase/add_contact_enrichment.sql for why these six.
  rating: number | null;
  /** False means do not email. The campaigns feature must respect this. */
  email_opt_in: boolean | null;
  assigned_agent: string | null;
  /** BoldTrail's "registered date" — older than our own created_at on imports. */
  first_seen_at: string | null;
  last_closing_date: string | null;
  homeowner_status: string | null;

  // Where they are, who they are, and what they are looking for. See
  // supabase/add_contact_details.sql.
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  company: string | null;
  job_title: string | null;
  birthday: string | null;
  second_email: string | null;
  spouse_name: string | null;
  spouse_email: string | null;
  spouse_phone: string | null;
  /** Derived by BoldTrail from what they actually browsed — a buying brief. */
  avg_price: number | null;
  avg_beds: number | null;
  avg_baths: number | null;
  capture_method: string | null;
  referrer: string | null;
  last_visit_at: string | null;

  submission_id: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ContactDraft = Partial<
  Pick<
    Contact,
    | "first_name" | "last_name" | "email" | "phone"
    | "lead_type" | "deal_types" | "stage" | "source" | "tags" | "notes" | "next_follow_up"
    | "rating" | "email_opt_in" | "assigned_agent"
    | "first_seen_at" | "last_closing_date" | "homeowner_status"
  >
> & { raw?: Record<string, unknown> };

export function contactName(c: Pick<Contact, "first_name" | "last_name" | "email">): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || c.email || "No name";
}

export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function leadTypeLabel(type: string): string {
  return LEAD_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── CSV import mapping ──────────────────────────────────────────────────────

export interface ImportField {
  key: string;
  label: string;
  /** Lower-cased header names seen in the wild that mean this field. */
  aliases: string[];
}

// `full_name` is not a column — it is split across first/last on import,
// because plenty of exports ship one "Name" column instead of two.
//
// `email_opt_in` sits above `email` deliberately: a header like "Email Opt In"
// contains the substring "email", so if `email` were offered first the partial
// match below would hand it the wrong column.
export const IMPORT_FIELDS: ImportField[] = [
  { key: "full_name", label: "Full name (split)", aliases: ["name", "full name", "fullname", "contact name", "contact"] },
  { key: "first_name", label: "First name", aliases: ["first name", "firstname", "first", "given name", "fname"] },
  { key: "last_name", label: "Last name", aliases: ["last name", "lastname", "last", "surname", "family name", "lname"] },
  { key: "email_opt_in", label: "Email opt-in", aliases: ["email opt in", "email opt-in", "opt in", "opt-in", "email optin", "subscribed", "email subscribed"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address", "primary email", "email 1"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "mobile phone", "cell", "cell phone", "primary phone", "phone 1", "telephone"] },
  { key: "lead_type", label: "Buyer / seller", aliases: ["type", "lead type", "contact type", "category", "buyer or seller", "deal type", "transaction type"] },
  { key: "stage", label: "Stage", aliases: ["stage", "status", "lead status", "pipeline", "pipeline stage"] },
  { key: "source", label: "Source", aliases: ["source", "lead source", "origin", "referral source", "capture method", "referrer"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels", "groups", "hashtags"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment", "description"] },
  { key: "rating", label: "Rating", aliases: ["rating", "star rating", "lead rating", "score"] },
  { key: "assigned_agent", label: "Assigned agent", aliases: ["assigned agent", "agent", "agent name", "assigned to", "owner", "assigned user"] },
  { key: "first_seen_at", label: "First seen", aliases: ["registered date", "date registered", "created date", "date created", "first seen"] },
  { key: "last_closing_date", label: "Last closing date", aliases: ["last closing date", "closing date", "close date"] },
  { key: "homeowner_status", label: "Homeowner status", aliases: ["homeowner", "homeowner status", "home owner", "owns home"] },
];

/** header index -> field key (or null to ignore that column). */
export type Mapping = Record<number, string | null>;

/**
 * Best-effort match of CSV headers to fields. Exact alias match first, then a
 * contains match, so "Primary Email Address" still finds `email`.
 */
export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();

  const claim = (index: number, key: string) => {
    mapping[index] = key;
    taken.add(key);
  };

  headers.forEach((header, index) => {
    const h = header.trim().toLowerCase();
    mapping[index] = null;
    if (!h) return;

    const exact = IMPORT_FIELDS.find((f) => !taken.has(f.key) && f.aliases.includes(h));
    if (exact) return claim(index, exact.key);

    // Longest matching alias wins, not the first field in the list. With a
    // 100-column export the short aliases match far too eagerly — "Last Closing
    // Date" contains both "last" and "last closing date", and only the second
    // one is right.
    const partial = IMPORT_FIELDS.filter((f) => !taken.has(f.key))
      .flatMap((f) => f.aliases.filter((a) => h.includes(a)).map((a) => ({ key: f.key, a })))
      .sort((x, y) => y.a.length - x.a.length)[0];
    if (partial) return claim(index, partial.key);
  });

  // A file with both "Name" and "First name" should use the specific ones.
  if (taken.has("first_name") || taken.has("last_name")) {
    for (const [i, key] of Object.entries(mapping)) {
      if (key === "full_name") mapping[Number(i)] = null;
    }
  }

  return mapping;
}

export function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim();

  // "Doe, Jane" — plenty of CRMs, BoldTrail included, export surname first.
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",", 2).map((s) => s.trim());
    if (first) return { first, last };
    return { first: last, last: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Every role a value mentions, in precedence order.
 *
 * The input is often several roles at once — BoldTrail's deal_type ships
 * "buyer,seller,renter" — and a spreadsheet column can say "Buyer & Seller".
 * Both are handled by looking for each role independently rather than trying to
 * match the whole string.
 */
export function extractLeadTypes(value: string): LeadType[] {
  const v = value.trim().toLowerCase();
  if (!v) return [];

  const found = new Set<LeadType>();
  if (/\bbuy/.test(v) || v.includes("purchas")) found.add("buyer");
  if (v.includes("sell") || v.includes("list")) found.add("seller");
  // "vendor" is the seller in plenty of markets; keep it distinct because
  // BoldTrail treats it as its own role rather than a synonym.
  if (v.includes("vendor")) found.add("vendor");
  if (v.includes("rent") || v.includes("tenant") || v.includes("lease")) found.add("renter");
  if (v.includes("agent") || v.includes("realtor") || v.includes("broker")) found.add("agent");
  // "Buyer & Seller" and the old "both" both mean the two sides.
  if (v.includes("both")) {
    found.add("buyer");
    found.add("seller");
  }
  // An investor has no counterpart in BoldTrail's list; on the buying side it
  // is a buyer, and the original word survives in `deal_types`.
  if (v.includes("invest")) found.add("buyer");

  return LEAD_TYPE_PRECEDENCE.filter((t) => found.has(t));
}

/** The single value shown in the Type column — the first role by precedence. */
export function normalizeLeadType(value: string): LeadType {
  return extractLeadTypes(value)[0] ?? "unknown";
}

export function normalizeStage(value: string): Stage {
  const v = value.trim().toLowerCase();
  if (!v) return "new";
  const direct = STAGES.find((s) => s.value === v || s.label.toLowerCase() === v);
  if (direct) return direct.value;
  // Common vocabulary from other systems.
  if (v.includes("won") || v.includes("closed")) return "closed";
  if (v.includes("lost") || v.includes("dead") || v.includes("unqualified")) return "lost";
  if (v.includes("qualif")) return "qualified";
  if (v.includes("active") || v.includes("working") || v.includes("hot")) return "active";
  if (v.includes("contact") || v.includes("attempt")) return "contacted";
  return "new";
}

/** 0-5, to match the CHECK constraint. Anything unparseable is left unset. */
function normalizeRating(value: string): number | null {
  const n = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, Math.round(n)));
}

/**
 * Tri-state on purpose: null means "the export did not say", which is not the
 * same as "opted out". Only an explicit negative blocks a campaign send.
 */
function normalizeBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["yes", "y", "true", "1", "opted in", "opt in", "subscribed", "active"].includes(v)) return true;
  if (["no", "n", "false", "0", "opted out", "opt out", "unsubscribed", "inactive"].includes(v)) return false;
  return null;
}

/**
 * Exports date columns in whatever the account's locale produced, so anything
 * unrecognised is dropped rather than guessed — a wrong closing date is worse
 * than none. `dateOnly` returns YYYY-MM-DD for `date` columns.
 */
function normalizeDate(value: string, dateOnly = false): string | null {
  const v = value.trim();
  if (!v) return null;
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BuiltRow {
  contact: ContactDraft;
  /** Why this row cannot be imported, if it cannot. */
  problem: string | null;
}

/** Turn one CSV row into a contact draft using the chosen column mapping. */
export function buildContact(
  row: string[],
  headers: string[],
  mapping: Mapping,
  defaults: { source?: string } = {}
): BuiltRow {
  const get = (key: string): string => {
    const index = Object.entries(mapping).find(([, k]) => k === key)?.[0];
    return index === undefined ? "" : (row[Number(index)] ?? "").trim();
  };

  let first = get("first_name");
  let last = get("last_name");
  const full = get("full_name");
  if (!first && !last && full) ({ first, last } = splitName(full));

  const email = get("email").toLowerCase();
  const phone = get("phone");
  const tagsRaw = get("tags");

  // Keep the whole original row so a wrong mapping can be re-derived later.
  const raw: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (h) raw[h] = row[i] ?? "";
  });

  const contact: ContactDraft = {
    first_name: first || null,
    last_name: last || null,
    email: email || null,
    phone: phone || null,
    lead_type: normalizeLeadType(get("lead_type")),
    deal_types: extractLeadTypes(get("lead_type")),
    stage: normalizeStage(get("stage")),
    source: get("source") || defaults.source || "csv",
    tags: tagsRaw ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : [],
    notes: get("notes") || null,
    rating: normalizeRating(get("rating")),
    email_opt_in: normalizeBoolean(get("email_opt_in")),
    assigned_agent: get("assigned_agent") || null,
    first_seen_at: normalizeDate(get("first_seen_at")),
    last_closing_date: normalizeDate(get("last_closing_date"), true),
    homeowner_status: get("homeowner_status") || null,
    raw,
  };

  // A lead with no way to reach them is not a lead.
  let problem: string | null = null;
  if (!email && !phone) problem = "No email or phone";
  else if (email && !EMAIL_RE.test(email)) problem = `Invalid email: ${email}`;

  return { contact, problem };
}

export interface ImportPreview {
  total: number;
  importable: number;
  skipped: { row: number; reason: string }[];
  /** Duplicate emails inside the file itself — later rows win. */
  duplicatesInFile: number;
  sample: ContactDraft[];
}

export function previewImport(
  rows: string[][],
  headers: string[],
  mapping: Mapping,
  defaults: { source?: string } = {}
): { preview: ImportPreview; drafts: ContactDraft[] } {
  const drafts: ContactDraft[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seen = new Map<string, number>();
  let duplicatesInFile = 0;

  rows.forEach((row, i) => {
    const { contact, problem } = buildContact(row, headers, mapping, defaults);
    if (problem) {
      skipped.push({ row: i + 2, reason: problem }); // +2: 1-indexed, past header
      return;
    }
    if (contact.email) {
      const previous = seen.get(contact.email);
      if (previous !== undefined) {
        duplicatesInFile++;
        drafts[previous] = contact; // last one wins
        return;
      }
      seen.set(contact.email, drafts.length);
    }
    drafts.push(contact);
  });

  return {
    preview: {
      total: rows.length,
      importable: drafts.length,
      skipped,
      duplicatesInFile,
      sample: drafts.slice(0, 5),
    },
    drafts,
  };
}
