import {
  DEFAULT_STAGE,
  extractLeadTypes,
  splitName,
  type LeadType,
  type Stage,
} from "../contacts";
import {
  BoldTrailContactDetail,
  BoldTrailListContact,
  bool,
  externalId,
  num,
  positive,
  str,
  strList,
  timestamp,
} from "./types";

// BoldTrail's shapes → ours.
//
// Two shapes, because the two endpoints differ in more than size: the cheap
// list gives one combined `name`, while the per-contact detail splits it into
// `first_name` / `last_name`. Preferring the split fields when they exist means
// a contact enriched later gets a better name than the one guessed at import.

export interface MappedContact {
  external_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  lead_type: LeadType;
  /** Every role, not just the primary one. */
  deal_types: LeadType[];
  /** Their lead status, translated. Seeds the stage on insert and nothing after. */
  stage: Stage;
  source: string | null;
  external_updated_at: string | null;
  /** Only present from the detail endpoint. */
  rating?: number | null;
  email_opt_in?: boolean | null;
  assigned_agent?: string | null;
  first_seen_at?: string | null;
  last_closing_date?: string | null;
  homeowner_status?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  company?: string | null;
  job_title?: string | null;
  birthday?: string | null;
  second_email?: string | null;
  spouse_name?: string | null;
  spouse_email?: string | null;
  spouse_phone?: string | null;
  avg_price?: number | null;
  avg_beds?: number | null;
  avg_baths?: number | null;
  capture_method?: string | null;
  referrer?: string | null;
  last_visit_at?: string | null;
}

/**
 * Every detail field that lands in its own column, as source → target.
 *
 * Declarative because two things consume it: the live sync, and the offline
 * backfill that re-derives columns from the stored payload without touching the
 * API. Adding a column should mean editing one list, not two mappers that can
 * quietly disagree.
 */
export const DETAIL_FIELD_MAP = {
  primary_address: "address",
  primary_city: "city",
  primary_state: "state",
  primary_zip: "zip_code",
  company: "company",
  title: "job_title",
  second_email: "second_email",
  spouse_email: "spouse_email",
  spouse_phone: "spouse_phone",
  capture_method: "capture_method",
  referrer: "referrer",
} as const;

/**
 * BoldTrail's numeric `status` translated into our stage vocabulary.
 *
 * THE CODES ARE NOT POSITIONAL. The first version of this read
 * `STAGES[code]`, assuming the number was an index into the order BoldTrail
 * displays its statuses in. It is not, and four of the five codes in this
 * account were consequently mislabelled — most visibly the 638 Spheres, which
 * every screen reported as Active Leads.
 *
 * The mapping below was established by matching our per-code counts against the
 * totals BoldTrail's own UI reports, which is the only evidence available: the
 * API returns the number and never a label.
 *
 *   code 0 → 109 contacts → New Lead
 *   code 1 →  13 contacts → Client
 *   code 3 → 638 contacts → Sphere
 *   code 4 →  27 contacts → Active Lead
 *   code 7 → 191 contacts → Prospect
 *
 * Codes 2, 5 and 6 hold no contacts in this account, so there is nothing to
 * match them against. They are Contract, Closed and Archived in some order, and
 * they stay out of this table rather than being guessed at a second time —
 * `unmappedStatuses` below is how one would announce itself if it ever arrived.
 *
 * (BoldTrail reports 4 Archived contacts and none of them reach us: their list
 * endpoint appears to exclude archived records, which is why we hold 978 of
 * their 982.)
 */
const STATUS_TO_STAGE: Record<number, Stage> = {
  0: "new_lead",
  1: "client",
  3: "sphere",
  4: "active_lead",
  7: "prospect",
};

/**
 * Codes seen in a payload that this file has no translation for.
 *
 * A module-level tally rather than a throw: one unrecognised status is not a
 * reason to fail a sync, but silently filing it under the default is exactly
 * how the mapping stayed wrong for so long. `runPull` reads this into
 * `sync_runs.detail` so a new status code shows up in the run record instead of
 * quietly becoming a New Lead.
 */
const unmapped = new Map<number, number>();

export function takeUnmappedStatuses(): Record<string, number> {
  const out = Object.fromEntries([...unmapped].map(([code, n]) => [String(code), n]));
  unmapped.clear();
  return out;
}

export function stageFromStatus(value: unknown): Stage {
  const code = num(value);
  if (code === null || !Number.isInteger(code)) return DEFAULT_STAGE;
  const stage = STATUS_TO_STAGE[code];
  if (stage) return stage;
  unmapped.set(code, (unmapped.get(code) ?? 0) + 1);
  return DEFAULT_STAGE;
}
/**
 * Their four phone fields, in the order a person would actually be reached.
 * Mobile first — this is a CRM for calling people back.
 */
function pickPhone(record: BoldTrailListContact): string | null {
  return (
    str(record.cell_phone_1) ??
    str(record.cell_phone_2) ??
    str(record.home_phone) ??
    str(record.work_phone)
  );
}

/**
 * `deal_type` is multi-valued — "buyer,seller,renter" is one of the commonest
 * values in this account — so every role is kept, and `lead_type` is just the
 * first by precedence.
 *
 * The importer's own extractor does the work, because a CSV import and a sync
 * of the same person must classify them identically.
 */
function pickRoles(record: BoldTrailListContact): { lead_type: LeadType; deal_types: LeadType[] } {
  const parts = strList(record.deal_type);
  const roles = extractLeadTypes(parts.join(" "));
  return { lead_type: roles[0] ?? "unknown", deal_types: roles };
}

/** The cheap list row — enough to create a usable contact on its own. */
export function fromListContact(record: BoldTrailListContact): MappedContact | null {
  const id = externalId(record);
  if (!id) return null;

  const { first, last } = splitName(str(record.name) ?? "");
  const email = str(record.email)?.toLowerCase() ?? null;

  return {
    external_id: id,
    first_name: first || null,
    last_name: last || null,
    email,
    phone: pickPhone(record),
    ...pickRoles(record),
    // Present on the cheap list as well as the detail record, so a contact is
    // filed under the right status the moment it arrives — no detail fetch, no
    // 978 rows parked in "New Lead" waiting for one.
    stage: stageFromStatus(record.status),
    source: str(record.source) ?? "boldtrail",
    external_updated_at: timestamp(record.updated_at),
  };
}

/**
 * The 83-field record. Everything the list gave, plus the fields worth having
 * their own column — the same six the CSV importer promotes, so a contact looks
 * identical whether it arrived by file or by API.
 */
export function fromDetailContact(record: BoldTrailContactDetail): MappedContact | null {
  const base = fromListContact(record);
  if (!base) return null;

  const first = str(record.first_name);
  const last = str(record.last_name);

  const rating = num(record.rating);

  const flat: Record<string, string | null> = {};
  for (const [source, target] of Object.entries(DETAIL_FIELD_MAP)) {
    flat[target] = str(record[source]);
  }

  // They store the spouse as two fields; one display name is what a CRM row
  // actually needs.
  const spouse = [str(record.spouse_first_name), str(record.spouse_last_name)]
    .filter(Boolean)
    .join(" ");

  return {
    ...base,
    ...flat,
    // The detail endpoint knows the real split; the list only had a guess.
    first_name: first ?? base.first_name,
    last_name: last ?? base.last_name,
    email: str(record.email)?.toLowerCase() ?? base.email,
    // Their scale is unconfirmed, so anything outside 0-5 is dropped rather
    // than clamped — a wrong-looking number is better absent than invented.
    rating: rating !== null && rating >= 0 && rating <= 5 ? Math.round(rating) : null,
    email_opt_in: bool(record.email_optin),
    assigned_agent: str(record.assigned_agent_external_id),
    first_seen_at: timestamp(record.registered) ?? timestamp(record.created_at),
    last_closing_date: timestamp(record.last_closing_date)?.slice(0, 10) ?? null,
    homeowner_status: str(record.homeowner),
    spouse_name: spouse || null,
    // What they browse, which is the closest thing to a buying brief we get.
    // `positive`, not `num`: unknown arrives as 0 in their data.
    avg_price: positive(record.avg_price),
    avg_beds: positive(record.avg_beds),
    avg_baths: positive(record.avg_baths),
    // A date column, so the time half is dropped rather than silently coerced.
    birthday: timestamp(record.birthday)?.slice(0, 10) ?? null,
    last_visit_at: timestamp(record.last_visit),
  };
}
