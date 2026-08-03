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

export const LEAD_TYPES = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "investor", label: "Investor" },
  { value: "both", label: "Buyer & Seller" },
  { value: "unknown", label: "Unknown" },
] as const;

export type LeadType = (typeof LEAD_TYPES)[number]["value"];

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  lead_type: LeadType;
  stage: Stage;
  source: string | null;
  tags: string[];
  next_follow_up: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  submission_id: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ContactDraft = Partial<
  Pick<
    Contact,
    | "first_name" | "last_name" | "email" | "phone"
    | "lead_type" | "stage" | "source" | "tags" | "notes" | "next_follow_up"
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
export const IMPORT_FIELDS: ImportField[] = [
  { key: "full_name", label: "Full name (split)", aliases: ["name", "full name", "fullname", "contact name", "contact"] },
  { key: "first_name", label: "First name", aliases: ["first name", "firstname", "first", "given name", "fname"] },
  { key: "last_name", label: "Last name", aliases: ["last name", "lastname", "last", "surname", "family name", "lname"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address", "primary email", "email 1"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "mobile phone", "cell", "cell phone", "primary phone", "phone 1", "telephone"] },
  { key: "lead_type", label: "Buyer / seller", aliases: ["type", "lead type", "contact type", "category", "buyer or seller"] },
  { key: "stage", label: "Stage", aliases: ["stage", "status", "lead status", "pipeline", "pipeline stage"] },
  { key: "source", label: "Source", aliases: ["source", "lead source", "origin", "referral source"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels", "groups", "hashtags"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment", "description"] },
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

    const partial = IMPORT_FIELDS.find(
      (f) => !taken.has(f.key) && f.aliases.some((a) => h.includes(a))
    );
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

function splitName(full: string): { first: string; last: string } {
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

function normalizeLeadType(value: string): LeadType {
  const v = value.trim().toLowerCase();
  if (!v) return "unknown";
  if (v.includes("both")) return "both";
  if (v.includes("invest")) return "investor";
  const buyer = v.includes("buy");
  const seller = v.includes("sell") || v.includes("list");
  if (buyer && seller) return "both";
  if (buyer) return "buyer";
  if (seller) return "seller";
  return "unknown";
}

function normalizeStage(value: string): Stage {
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
    stage: normalizeStage(get("stage")),
    source: get("source") || defaults.source || "csv",
    tags: tagsRaw ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : [],
    notes: get("notes") || null,
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
