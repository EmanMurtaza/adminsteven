// Personal CRM — the lead list that replaces BoldTrail.
//
// Contacts arrive three ways: a CSV import (the one-time escape route out of
// BoldTrail, and any spreadsheet after that), the website buyer/seller forms,
// or typed in by hand. Whichever way, they land in `contacts` and are worked
// through the same pipeline.

// BoldTrail's own status vocabulary, for the same reason LEAD_TYPES below uses
// theirs: the original list (new/contacted/qualified/active/closed/lost) was
// invented before there was anything to match it against, and every contact
// pulled from BoldTrail landed on "new" because their `status` had nowhere to
// go. All 978 of them sat there, which is not a pipeline, it is a pile.
//
// Order is the order BoldTrail lists them in, and it is load-bearing: their
// `status` is a numeric code that indexes into exactly this sequence. Inserting
// a stage in the middle would silently re-label hundreds of contacts, so a new
// stage goes on the end or the mapping in boldtrail/mapping.ts changes with it.
export const STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "sphere", label: "Sphere" },
  { value: "active_lead", label: "Active Lead" },
  { value: "client", label: "Client" },
  { value: "contract", label: "Contract" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

/** The stage a contact starts in, here and in BoldTrail alike. */
export const DEFAULT_STAGE: Stage = "new_lead";

/**
 * One colour per stage, defined once so the table, the pipeline board and the
 * alumni summary cannot drift apart.
 *
 * The scale carries the pipeline's shape rather than just being eight different
 * colours: cool grey-blue for a lead nobody has touched, warming through gold as
 * it is worked, into forest green once it starts going well, and finally flat
 * grey when it is over. That means a column of badges can be read at a glance
 * without matching each one against a legend — which is the whole job of colour
 * in a table this dense.
 *
 * Every text/background pair here clears 4.5:1. The earlier set used three near
 * identical navy tints for Prospect, Sphere and Renter, so half the vocabulary
 * was indistinguishable at a glance.
 *
 * Full class strings, not interpolated fragments — Tailwind scans source text,
 * so a class built at runtime is a class that never ships.
 */
export const STAGE_TONES: Record<Stage, string> = {
  new_lead: "bg-navy/[0.07] text-navy ring-navy/20",
  prospect: "bg-gold/15 text-gold-dark ring-gold/40",
  sphere: "bg-burgundy/10 text-burgundy ring-burgundy/25",
  active_lead: "bg-gold/30 text-gold-dark ring-gold/60",
  client: "bg-forest/12 text-forest ring-forest/30",
  contract: "bg-forest/20 text-forest ring-forest/45",
  closed: "bg-forest/30 text-forest ring-forest/60",
  archived: "bg-cream-200 text-ink-soft ring-ink-mute/30",
};

/** The same scale as a solid dot, for the pipeline board's column headers. */
export const STAGE_DOTS: Record<Stage, string> = {
  new_lead: "bg-navy/30",
  prospect: "bg-gold/60",
  sphere: "bg-burgundy/60",
  active_lead: "bg-gold",
  client: "bg-forest/50",
  contract: "bg-forest/75",
  closed: "bg-forest",
  archived: "bg-ink-mute/40",
};

/** Stages that mean "no longer being worked", so nothing should chase them. */
export const CLOSED_STAGES: Stage[] = ["closed", "archived"];

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

/** One entry from BoldTrail's per-contact note log. */
export interface ExternalNote {
  action_id?: number;
  date?: string;
  title?: string | null;
  details?: string | null;
}

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
  // supabase/setup.sql section 2a for why these six.
  rating: number | null;
  /** False means do not email. The campaigns feature must respect this. */
  email_opt_in: boolean | null;
  assigned_agent: string | null;
  /** BoldTrail's "registered date" — older than our own created_at on imports. */
  first_seen_at: string | null;
  last_closing_date: string | null;
  homeowner_status: string | null;

  // Where they are, who they are, and what they are looking for. See
  // supabase/setup.sql section 2a.
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

  /**
   * BoldTrail's activity log, kept separate from `notes` (which is Steven's own
   * editable field). Theirs is append-only and mixes real substance with
   * machine-written entries like "Contact updated by ...".
   */
  external_notes: ExternalNote[];

  // BoldTrail link state. Optional because a contact typed in by hand or
  // imported from a CSV has none of it, and because most queries never select
  // these columns — see supabase/setup.sql section 2c for what each one is for.
  external_id?: string | null;
  external_source?: string | null;
  external_synced_at?: string | null;
  external_detail_at?: string | null;
  sync_status?: string | null;

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

/**
 * Every role a contact holds, primary first.
 *
 * `lead_type` is a single value so the pipeline board, filters and badges have
 * something to group by, but in this account it is the minority of the answer:
 * two thirds of contacts hold more than one role, and 649 of them are buyer,
 * seller AND renter at once. Showing only `lead_type` labels all 649 of those
 * "Buyer" and silently drops the rest, which is the same detail loss that
 * `deal_types` was added to prevent — so anything that displays a type should
 * display this instead.
 *
 * `deal_types` is empty for contacts that predate it, and for the 93 with no
 * deal type in BoldTrail at all, so `lead_type` is the fallback rather than an
 * assumption that the array is populated.
 */
export function allRoles(c: Pick<Contact, "lead_type" | "deal_types">): string[] {
  const roles = c.deal_types ?? [];
  if (roles.length === 0) return [c.lead_type];
  // Primary first, then the others in BoldTrail's precedence order. `lead_type`
  // is normally roles[0], but a contact whose primary was changed by hand is
  // exactly the case where the order would otherwise be wrong.
  return [c.lead_type, ...roles.filter((t) => t !== c.lead_type)];
}

/** The roles beyond the primary — what a single-value Type column cannot show. */
export function secondaryRoles(c: Pick<Contact, "lead_type" | "deal_types">): string[] {
  return (c.deal_types ?? []).filter((t) => t !== c.lead_type);
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Columns a free-text search looks at, in the order a person would expect. */
const SEARCH_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "second_email",
  "phone",
  "city",
  "state",
  "zip_code",
  "company",
  "source",
  "notes",
];

/**
 * A PostgREST `or()` group matching one search term against every searchable
 * column. Exported for the pages to chain — see `searchTerms` below for why
 * they are applied one call at a time.
 */
function termFilter(term: string): string {
  // PostgREST splits or() on commas and parentheses, so a search containing
  // either would otherwise break out of the filter and become bogus conditions.
  const safe = term.replace(/[,()\\]/g, " ").trim();
  if (!safe) return "";

  const like = `%${safe}%`;
  const parts = SEARCH_COLUMNS.map((c) => `${c}.ilike.${like}`);

  // A phone typed the way people write it — "704-406" or "(817) 235" — has to
  // reach a column stored as bare digits, so the punctuation is dropped and the
  // digits searched separately.
  const digits = safe.replace(/\D/g, "");
  if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);

  // Tags are a text[], so ilike cannot reach them; containment is an exact
  // element match, which is right for a tag — you know its name or you do not.
  if (/^[\w-]+$/.test(safe)) parts.push(`tags.cs.{"${safe.toLowerCase()}"}`);

  return parts.join(",");
}

/**
 * The `or()` groups for a search box, one per word.
 *
 * Chained `.or()` calls are ANDed by PostgREST, so applying one group per term
 * means "every word matches SOMETHING" rather than "one field contains the
 * whole string". That is the difference between "Rafael Diaz" finding Rafael
 * Diaz and finding nothing at all — first and last name are separate columns,
 * so no single field has ever contained both words. It also makes word order
 * irrelevant, so "diaz rafael" works too.
 *
 * Capped at four terms: each one is another OR group over eleven columns, and
 * past four words this is no longer a search box, it is a sentence.
 */
export function searchTerms(search: string): string[] {
  return search
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map(termFilter)
    .filter(Boolean);
}

// ─── Hashtags ────────────────────────────────────────────────────────────────

/** One hashtag as a picker sees it. */
export interface TagOption {
  /** Canonical, lower-case. This is what `contacts.tags` stores. */
  name: string;
  /** Display form, preserving the casing it first arrived with. */
  label: string;
  /** How many contacts carry it. Absent when the count was not asked for. */
  count?: number;
  /** Import batch markers — real, but provenance rather than vocabulary. */
  hidden?: boolean;
}

/**
 * The canonical form of a tag.
 *
 * Lower-cased because Postgres array containment is exact: a contact stored
 * with "Client" is invisible to every filter looking for "client", so casing is
 * a correctness problem rather than a tidiness one. A leading "#" is stripped
 * because that is how people type a hashtag, and the spaces go because a tag
 * with one in it cannot be typed into a comma-separated URL param.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

// ─── Alumni ──────────────────────────────────────────────────────────────────

/**
 * PostgREST `or()` terms that match an alumni email address.
 *
 * 237 contacts in this account are on `alumni.com`, which the first pattern
 * covers. The second exists because university alumni addresses are normally a
 * subdomain — `someone@alumni.utexas.edu`, `someone@mail.alumni.ox.ac.uk` — and
 * a segment defined by one hard-coded domain would quietly miss every one of
 * them the day a real university address arrives.
 *
 * Deliberately NOT a bare `%alumni%`: that matches `alumni@gmail.com` and
 * `paul.alumni@…`, which are ordinary personal addresses that happen to contain
 * the word. The `@` and the `.` are what make this a domain test rather than a
 * substring search.
 */
export const ALUMNI_EMAIL_FILTER = [
  "email.ilike.%@alumni.%",
  "email.ilike.%.alumni.%",
].join(",");

/** Whether one contact belongs to the alumni segment. Mirrors the filter above. */
export function isAlumni(c: Pick<Contact, "email">): boolean {
  const email = c.email?.toLowerCase() ?? "";
  const domain = email.split("@")[1];
  if (!domain) return false;
  return domain === "alumni" || domain.startsWith("alumni.") || domain.includes(".alumni.");
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
  if (!v) return DEFAULT_STAGE;
  const direct = STAGES.find((s) => s.value === v || s.label.toLowerCase() === v);
  if (direct) return direct.value;

  // A spreadsheet may spell a stage with a space or a hyphen where the stored
  // value has an underscore — "active lead" and "New-Lead" both belong.
  const slug = v.replace(/[\s-]+/g, "_");
  const bySlug = STAGES.find((s) => s.value === slug);
  if (bySlug) return bySlug.value;

  // Vocabulary from other systems, and from this app before it adopted
  // BoldTrail's. Ordered most specific first: "under contract" contains
  // "contract" but also nothing else that would mis-fire, whereas a bare
  // "closed won" must not be read as "contract".
  if (v.includes("archiv") || v.includes("dead") || v.includes("lost")) return "archived";
  if (v.includes("won") || v.includes("closed") || v.includes("settled")) return "closed";
  if (v.includes("contract") || v.includes("pending") || v.includes("escrow")) return "contract";
  if (v.includes("client") || v.includes("customer")) return "client";
  if (v.includes("sphere") || v.includes("past") || v.includes("referral")) return "sphere";
  // "qualified", "active", "working" and "hot" were all separate stages in the
  // old list; they are all the same thing here — a lead being actively worked.
  if (v.includes("active") || v.includes("qualif") || v.includes("working") || v.includes("hot")) {
    return "active_lead";
  }
  if (v.includes("prospect") || v.includes("contact") || v.includes("attempt")) return "prospect";
  return DEFAULT_STAGE;
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

// ─── Per-column filters ──────────────────────────────────────────────────────

/**
 * The per-column filter values, read from the URL.
 *
 * Shared by /contacts and /contacts/alumni so the two cannot drift — they
 * render the same table, and a filter that behaved differently depending on
 * which page you were on would be worse than no filter at all.
 */
export interface ColumnFilters {
  name?: string;
  contact?: string;
  /** Several at once, ORed within the column. */
  type?: string[];
  stage?: string[];
  location?: string;
  source?: string;
  /** Several at once, ORed — a contact tagged either way belongs in the result. */
  tag?: string[];
  visited?: string;
  followed?: string;
  due?: string;
}

/** Anything with the Supabase filter methods these need. */
interface Filterable {
  or(filter: string): Filterable;
  eq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
  not(column: string, op: string, value: null): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
  ilike(column: string, pattern: string): Filterable;
  contains(column: string, value: readonly string[]): Filterable;
  overlaps(column: string, value: readonly string[]): Filterable;
  in(column: string, value: readonly string[]): Filterable;
}

/**
 * Read a possibly-multi-valued param, keeping only values that are actually in
 * the allowed set.
 *
 * Validating against the vocabulary is not politeness — an unrecognised stage
 * would otherwise reach the CHECK-constrained column and return nothing at all,
 * which reads as "no results" rather than "that filter is nonsense".
 */
export function multiParam(
  raw: string | undefined,
  allowed: readonly { value: string }[]
): string[] | undefined {
  if (!raw) return undefined;
  const permitted = new Set(allowed.map((a) => a.value));
  const picked = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => permitted.has(v));
  return picked.length ? picked : undefined;
}

/** PostgREST reads commas and parens inside or() as syntax. */
function clean(value: string): string {
  return value.replace(/[,()]/g, " ").trim();
}

/**
 * Apply every per-column filter that is set.
 *
 * They AND together — that is what makes them columns rather than a second
 * search box: "sellers in Texas I have never followed up" is three filters, not
 * one query someone has to phrase perfectly.
 */
export function applyColumnFilters<Q extends Filterable>(
  query: Q,
  f: ColumnFilters,
  todayISO: string
): Q {
  let q = query as Filterable;

  if (f.name) {
    const like = `%${clean(f.name)}%`;
    q = q.or(`first_name.ilike.${like},last_name.ilike.${like}`);
  }

  if (f.contact) {
    const safe = clean(f.contact);
    const like = `%${safe}%`;
    const parts = [`email.ilike.${like}`, `second_email.ilike.${like}`, `phone.ilike.${like}`];
    // A number typed as "(817) 235" still has to reach a digits-only column.
    const digits = safe.replace(/\D/g, "");
    if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
    q = q.or(parts.join(","));
  }

  if (f.location) {
    const like = `%${clean(f.location)}%`;
    q = q.or(
      `city.ilike.${like},state.ilike.${like},zip_code.ilike.${like},address.ilike.${like}`
    );
  }

  // Contains rather than equals: BoldTrail's sources are free text ("Lead
  // Import", "Manual Add") and are only ever going to be typed as a fragment.
  if (f.source) q = q.ilike("source", `%${clean(f.source)}%`);

  // `overlaps` (&&), not `contains` (@>): picking Buyer and Seller means
  // "either", not "both". Someone who is only a buyer still belongs in that
  // result — containment would demand they were both and quietly return the
  // handful who are.
  //
  // It is deal_types rather than lead_type for the same reason the Type column
  // shows every role: someone buying and selling belongs under both.
  if (f.type?.length) q = q.overlaps("deal_types", f.type);
  if (f.stage?.length) q = q.in("stage", f.stage);
  // Same "any of, not all of" argument as type above: picking `investor` and
  // `crexi` means either. Containment would demand both and quietly return the
  // overlap while looking like it worked.
  if (f.tag?.length) q = q.overlaps("tags", f.tag);

  // "none" means the column is empty; a number means "within that many days".
  // A vocabulary rather than a date picker, because "who have I not touched in
  // 90 days" is the real question and picking two dates to ask it is a chore.
  for (const [column, value] of [
    ["last_visit_at", f.visited],
    ["last_contacted_at", f.followed],
  ] as const) {
    if (!value) continue;
    if (value === "none") {
      q = q.is(column, null);
      continue;
    }
    const days = Number(value);
    if (!Number.isFinite(days)) continue;
    q = q.gte(column, new Date(Date.now() - days * 86_400_000).toISOString());
  }

  if (f.due === "overdue") q = q.lte("next_follow_up", todayISO);
  else if (f.due === "set") q = q.not("next_follow_up", "is", null);
  else if (f.due === "none") q = q.is("next_follow_up", null);

  return q as Q;
}

/** Whether any column filter is actually set. */
export function hasColumnFilters(f: ColumnFilters): boolean {
  return Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
}

/** The column filters as URL params, for links that must carry them along. */
export function columnFilterParams(f: ColumnFilters): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(f)) {
    const joined = Array.isArray(value) ? value.join(",") : value;
    if (joined) out[key === "source" ? "source_q" : key] = joined;
  }
  return out;
}

// ─── Tag vocabulary ──────────────────────────────────────────────────────────

/** Just the Supabase methods `loadTagVocabulary` needs. */
interface TagSource {
  from(table: string): {
    select(columns: string): {
      order(column: string, opts: { ascending: boolean }): Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/**
 * Every saved hashtag, with how many contacts carry it.
 *
 * Reads `contact_tags` for the vocabulary and `contacts.tags` for the counts.
 * The two are separate on purpose: a tag exists whether or not anyone currently
 * has it, so the registry is the list and the contacts are only the tally.
 *
 * Returns an empty list rather than throwing when `contact_tags` is missing, so
 * a database that has not had setup.sql applied yet degrades to "no suggestions"
 * instead of a broken contacts page.
 */
export async function loadTagVocabulary(supabase: unknown): Promise<TagOption[]> {
  const db = supabase as TagSource;

  const [registry, usage] = await Promise.all([
    db.from("contact_tags").select("name, label, is_hidden").order("name", { ascending: true }),
    db.from("contacts").select("tags").order("id", { ascending: true }),
  ]);

  if (registry.error) return [];

  const counts = new Map<string, number>();
  for (const row of (usage.data ?? []) as { tags: string[] | null }[]) {
    for (const tag of row.tags ?? []) {
      const name = tag.toLowerCase();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return ((registry.data ?? []) as { name: string; label: string; is_hidden: boolean }[]).map(
    (t) => ({
      name: t.name,
      label: t.label || t.name,
      count: counts.get(t.name) ?? 0,
      hidden: t.is_hidden,
    })
  );
}

/** Just the Supabase surface `registerTags` needs. */
interface TagWritable {
  from(table: string): {
    upsert(
      rows: { name: string; label: string; source: string }[],
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Add tags to the saved vocabulary, leaving any that already exist alone.
 *
 * Called from every path that can invent a tag — the contact page, the add
 * form, the sync — so a tag becomes pickable everywhere the moment it is used
 * once. `ignoreDuplicates` matters: a tag someone has already relabelled or
 * hidden must not be silently reset by the next contact that happens to use it.
 *
 * Never throws. Failing to record a tag in the registry is not a reason to fail
 * the write that was actually asked for; the tag still lands on the contact and
 * scripts/backfill-tags.mjs will pick it up.
 */
export async function registerTags(
  supabase: unknown,
  tags: string[],
  source: "manual" | "boldtrail" | "import" = "manual"
): Promise<void> {
  const names = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  if (names.length === 0) return;
  try {
    await (supabase as TagWritable)
      .from("contact_tags")
      .upsert(
        names.map((name) => ({ name, label: name, source })),
        { onConflict: "name", ignoreDuplicates: true }
      );
  } catch {
    // contact_tags may not exist yet; the contact write still stands.
  }
}
