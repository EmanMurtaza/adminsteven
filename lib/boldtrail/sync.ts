import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BoldTrailContactDetail,
  BoldTrailListContact,
  externalId,
} from "./types";
import {
  BoldTrailClient,
  BoldTrailForbiddenError,
  BoldTrailLockedOutError,
  clientFromEnv,
  tokenFingerprint,
} from "./client";
import { fromDetailContact, fromListContact, type MappedContact } from "./mapping";
import { DEFAULT_STAGE, type ExternalNote } from "../contacts";
import { lastFollowUpAt } from "./activity";
import { localFingerprint, remoteFingerprint } from "./hash";
import {
  getLockedUntil,
  millisUntilAllowed,
  setLastPullAt,
  setTokenFingerprint,
  tripLockout,
} from "./state";

// Pulling contacts from BoldTrail, as rarely and as cheaply as possible.
//
// THE WHOLE DESIGN IN ONE PARAGRAPH
// Their list endpoint returns 500 contacts per request and includes
// `updated_at`; their per-contact endpoint returns 83 fields but costs one
// request each. So a run reads the entire list in two requests, compares each
// row against what we already stored, and for the overwhelming majority
// concludes "unchanged" — writing nothing and fetching nothing. Only contacts
// whose `updated_at` moved, plus a small batch that has never been enriched,
// cost anything at all. Steady state is two requests a day.

const PROVIDER = "boldtrail";

/** Cron runs no more than twice a day; the button is usable but not spammable. */
export const CRON_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const MANUAL_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Contacts enriched per run. Small on purpose — see the plan's risk section. */
const DEFAULT_DETAIL_BATCH = 25;

export type SyncStatus = "ok" | "partial" | "failed" | "skipped";

export interface SyncResult {
  status: SyncStatus;
  /** Why a run did nothing, in language fit for the UI. */
  reason?: string;
  listed: number;
  created: number;
  adopted: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  /** Remote contacts sharing an email with another remote contact. */
  skipped: number;
  detailFetched: number;
  remoteDeleted: number;
  requests: number;
  error?: string;
  runId?: string;
}

export interface SyncOptions {
  mode?: "cron" | "manual";
  /** Compute and report everything, write nothing. */
  dryRun?: boolean;
  /** Wall-clock budget for the run. */
  budgetMs?: number;
  detailBatch?: number;
}

function emptyResult(status: SyncStatus, reason?: string): SyncResult {
  return {
    status,
    reason,
    listed: 0,
    created: 0,
    adopted: 0,
    updated: 0,
    unchanged: 0,
    conflicts: 0,
    skipped: 0,
    detailFetched: 0,
    remoteDeleted: 0,
    requests: 0,
  };
}

/**
 * The contact columns a detail fetch fills in.
 *
 * Listed in one place because the offline backfill writes exactly the same set
 * from stored payloads — if the two drifted, re-running the backfill would
 * quietly clear whatever the live sync had populated.
 */
export function detailColumns(mapped: MappedContact): Record<string, unknown> {
  return {
    first_name: mapped.first_name,
    last_name: mapped.last_name,
    phone: mapped.phone,
    rating: mapped.rating ?? null,
    email_opt_in: mapped.email_opt_in ?? null,
    assigned_agent: mapped.assigned_agent ?? null,
    first_seen_at: mapped.first_seen_at ?? null,
    last_closing_date: mapped.last_closing_date ?? null,
    homeowner_status: mapped.homeowner_status ?? null,
    address: mapped.address ?? null,
    city: mapped.city ?? null,
    state: mapped.state ?? null,
    zip_code: mapped.zip_code ?? null,
    company: mapped.company ?? null,
    job_title: mapped.job_title ?? null,
    birthday: mapped.birthday ?? null,
    second_email: mapped.second_email ?? null,
    spouse_name: mapped.spouse_name ?? null,
    spouse_email: mapped.spouse_email ?? null,
    spouse_phone: mapped.spouse_phone ?? null,
    avg_price: mapped.avg_price ?? null,
    avg_beds: mapped.avg_beds ?? null,
    avg_baths: mapped.avg_baths ?? null,
    capture_method: mapped.capture_method ?? null,
    referrer: mapped.referrer ?? null,
    last_visit_at: mapped.last_visit_at ?? null,
  };
}

/** The local columns a pull may touch, plus the bookkeeping it maintains. */
interface ExistingContact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  lead_type: string;
  deal_types: string[] | null;
  external_id: string | null;
  external_updated_at: string | null;
  remote_hash: string | null;
  local_hash: string | null;
  sync_status: string;
}

const EXISTING_COLUMNS =
  "id, email, first_name, last_name, phone, lead_type, deal_types, external_id, external_updated_at, remote_hash, local_hash, sync_status";

/**
 * Every contact, paged. PostgREST caps a response at 1000 rows and truncating
 * here would be invisible and catastrophic — unseen contacts would look absent
 * and be re-inserted, colliding with contacts_email_unique.
 */
async function loadExisting(supabase: SupabaseClient): Promise<ExistingContact[]> {
  const rows: ExistingContact[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select(EXISTING_COLUMNS)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading contacts failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as ExistingContact[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** PostgREST rejects a batch whose objects do not all share a key set. */
function square<T extends Record<string, unknown>>(rows: T[], columns: readonly string[]) {
  return rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))
  );
}

async function writeChunked(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  columns: readonly string[],
  onConflict?: string
): Promise<void> {
  if (rows.length === 0) return;
  const squared = square(rows, columns);
  for (let i = 0; i < squared.length; i += 500) {
    const chunk = squared.slice(i, i + 500);
    const { error } = onConflict
      ? await supabase.from("contacts").upsert(chunk, { onConflict })
      : await supabase.from("contacts").insert(chunk);
    if (error) throw new Error(`Writing contacts failed: ${error.message}`);
  }
}

export async function pullContacts(
  supabase: SupabaseClient,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const mode = options.mode ?? "manual";
  const dryRun = options.dryRun ?? false;
  const detailBatch =
    options.detailBatch ?? (Number(process.env.BOLDTRAIL_DETAIL_BATCH) || DEFAULT_DETAIL_BATCH);

  // ── Three checks before a single socket is opened ──────────────────────────

  const lockedUntil = await getLockedUntil(supabase);
  if (lockedUntil) {
    const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    return emptyResult(
      "skipped",
      `BoldTrail locked us out recently. Standing down for another ${mins} minute${mins === 1 ? "" : "s"} — retrying sooner tends to extend it.`
    );
  }

  const minInterval = mode === "cron" ? CRON_MIN_INTERVAL_MS : MANUAL_MIN_INTERVAL_MS;
  const wait = await millisUntilAllowed(supabase, minInterval);
  if (wait > 0 && !dryRun) {
    const mins = Math.ceil(wait / 60000);
    return emptyResult(
      "skipped",
      `Synced recently. Next run allowed in ${mins} minute${mins === 1 ? "" : "s"}.`
    );
  }

  const client = clientFromEnv({ budgetMs: options.budgetMs });
  if (!client) {
    return emptyResult(
      "skipped",
      process.env.BOLDTRAIL_API_TOKEN
        ? "Sync is switched off (BOLDTRAIL_SYNC_ENABLED=false)."
        : "No BoldTrail API token configured."
    );
  }

  // ── Record the run ────────────────────────────────────────────────────────

  let runId: string | undefined;
  if (!dryRun) {
    const { data } = await supabase
      .from("sync_runs")
      .insert({ provider: PROVIDER, direction: "pull", mode, status: "running" })
      .select("id")
      .maybeSingle();
    runId = (data as { id?: string } | null)?.id;

    const fingerprint = tokenFingerprint();
    if (fingerprint) await setTokenFingerprint(supabase, fingerprint);
  }

  const result: SyncResult = { ...emptyResult("ok"), runId };

  try {
    const outcome = await runPull(supabase, client, result, { dryRun, detailBatch });
    result.status = outcome;
  } catch (error) {
    if (error instanceof BoldTrailLockedOutError) {
      // The important branch. Back off hard, touch no contact data, and let the
      // next scheduled run try again — never treat this as a dead token.
      if (!dryRun) await tripLockout(supabase);
      result.status = "failed";
      result.error = error.message;
      result.reason =
        "BoldTrail stopped answering part-way through. Nothing was changed; the next run will pick up where this left off.";
    } else {
      result.status = "failed";
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  result.requests = client.requestsMade;

  if (!dryRun) {
    // Only a run that actually reached the API resets the clock. A failure that
    // never got a response must not block the next attempt for 12 hours.
    if (result.status === "ok" || result.status === "partial") {
      await setLastPullAt(supabase);
    }
    if (runId) {
      await supabase
        .from("sync_runs")
        .update({
          status: result.status,
          listed_count: result.listed,
          detail_count: result.detailFetched,
          created_count: result.created + result.adopted,
          updated_count: result.updated,
          unchanged_count: result.unchanged,
          conflict_count: result.conflicts,
          skipped_count: result.skipped,
          failed_count: result.status === "failed" ? 1 : 0,
          requests_made: result.requests,
          finished_at: new Date().toISOString(),
          error: result.error ?? null,
          detail: { telemetry: client.telemetry(), remoteDeleted: result.remoteDeleted },
        })
        .eq("id", runId);
    }
  }

  return result;
}

async function runPull(
  supabase: SupabaseClient,
  client: BoldTrailClient,
  result: SyncResult,
  { dryRun, detailBatch }: { dryRun: boolean; detailBatch: number }
): Promise<SyncStatus> {
  // ── 1. The cheap list: two requests for the whole account ─────────────────

  const remote: MappedContact[] = [];
  const remoteRaw = new Map<string, BoldTrailListContact>();
  let listComplete = true;

  for await (const page of client.listPages<BoldTrailListContact>("/contacts")) {
    for (const row of page) {
      const mapped = fromListContact(row);
      if (!mapped) continue;
      // Their pagination has no stable sort, so the same contact can appear on
      // two consecutive pages (and another be missed). Left unchecked that
      // produces two identical inserts and a unique-constraint violation that
      // fails the whole batch — which is exactly how this was found.
      if (remoteRaw.has(mapped.external_id)) continue;
      remote.push(mapped);
      remoteRaw.set(mapped.external_id, row);
    }
    if (client.outOfBudget) {
      // Stopped early, so "missing from the list" no longer means "deleted".
      listComplete = false;
      break;
    }
  }
  result.listed = remote.length;

  // ── 2. Match: external_id, then adopt by email, then insert ───────────────

  const existing = await loadExisting(supabase);
  const byExternal = new Map<string, ExistingContact>();
  const byEmail = new Map<string, ExistingContact>();
  for (const row of existing) {
    if (row.external_id) byExternal.set(row.external_id, row);
    if (row.email) byEmail.set(row.email.toLowerCase(), row);
  }

  // BoldTrail happily holds several contacts with the same email address — a
  // person who enquired twice, a shared household inbox. Our `contacts` table
  // does not: contacts_email_unique is a unique index on lower(email). So one
  // remote contact per email is chosen here, and the rest are skipped rather
  // than allowed to fail the whole 500-row batch.
  //
  // The most recently updated one wins, on the grounds that it is the record
  // someone actually worked on.
  const emailOwner = new Map<string, MappedContact>();
  for (const contact of remote) {
    if (!contact.email) continue;
    const held = emailOwner.get(contact.email);
    if (!held || (contact.external_updated_at ?? "") > (held.external_updated_at ?? "")) {
      emailOwner.set(contact.email, contact);
    }
  }

  const now = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  const needsDetail: string[] = [];

  for (const contact of remote) {
    // A duplicate email that did not win. Counted, never written.
    if (contact.email && emailOwner.get(contact.email)?.external_id !== contact.external_id) {
      result.skipped++;
      continue;
    }

    const raw = remoteRaw.get(contact.external_id) ?? {};
    const remoteHash = remoteFingerprint(raw as Record<string, unknown>);

    const byId = byExternal.get(contact.external_id);
    const byMail = contact.email ? byEmail.get(contact.email) : undefined;

    // Adoption by email is only ever allowed onto an UNCLAIMED row. Without
    // that guard two remote contacts sharing an email would take turns
    // rewriting the same local row's external_id, and every run would report
    // changes forever while the row flip-flopped between them.
    let match: ExistingContact | undefined;
    if (byId) {
      match = byId;
    } else if (byMail && !byMail.external_id) {
      match = byMail;
    } else if (byMail) {
      // That local row already belongs to a different BoldTrail contact.
      // Inserting would violate contacts_email_unique and fail the batch.
      result.skipped++;
      continue;
    }

    if (!match) {
      toInsert.push({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        lead_type: contact.lead_type,
        deal_types: contact.deal_types,
        // Seeded from their status, then ours. `stage` is in INSERT_COLUMNS but
        // deliberately NOT in UPDATE_COLUMNS below: BoldTrail decides where a
        // contact starts, and every move after that is Steven's and is never
        // overwritten by a later pull.
        stage: contact.stage,
        source: contact.source,
        external_source: PROVIDER,
        external_id: contact.external_id,
        external_updated_at: contact.external_updated_at,
        external_synced_at: now,
        remote_hash: remoteHash,
        local_hash: localFingerprint(contact as unknown as Record<string, unknown>),
        sync_status: "linked",
        external_raw: raw,
      });
      needsDetail.push(contact.external_id);
      result.created++;
      continue;
    }

    // The cheap exit, and the reason a daily run costs nothing: their payload
    // hashes to exactly what we stored last time, so there is provably nothing
    // to do for this contact — no write, no detail fetch.
    //
    // The test is the hash ALONE, deliberately. Comparing `external_updated_at`
    // as well looks like belt-and-braces but is actively wrong: Postgres
    // returns a timestamptz as "2026-07-20T06:24:29+00:00" while the mapper
    // produces "2026-07-20T06:24:29.000Z". Those never compare equal as
    // strings, so every contact would read as changed on every run — the exact
    // opposite of what this whole design is for. The hash covers the payload
    // including their timestamp, so nothing is lost by dropping it.
    const unchangedRemotely =
      match.external_id === contact.external_id && match.remote_hash === remoteHash;

    if (unchangedRemotely) {
      result.unchanged++;
      continue;
    }

    const adopting = !match.external_id;
    if (adopting) result.adopted++;
    else result.updated++;

    // Did Steven edit this since we last synced? Compared by content, never by
    // updated_at — the touch trigger fires on our own writes.
    const locallyEdited =
      match.local_hash !== null &&
      match.local_hash !== localFingerprint(match as unknown as Record<string, unknown>);

    // Seeded with the values already stored, NOT left partial.
    //
    // writeChunked squares every row off against one column list and fills any
    // key a row is missing with null, because PostgREST rejects a batch whose
    // objects have differing keys. So a patch that omits first_name does not
    // mean "leave it alone" — it means "set it to null". Starting from the
    // current values makes an omission genuinely a no-op, which is what every
    // branch below assumes.
    const patch: Record<string, unknown> = {
      id: match.id,
      first_name: match.first_name,
      last_name: match.last_name,
      email: match.email,
      phone: match.phone,
      lead_type: match.lead_type,
      deal_types: match.deal_types ?? [],
      external_source: PROVIDER,
      external_id: contact.external_id,
      external_updated_at: contact.external_updated_at,
      external_synced_at: now,
      remote_hash: remoteHash,
      external_raw: raw,
    };

    if (adopting || !locallyEdited) {
      // Gap-fill on adoption so a contact Steven has already worked is never
      // trampled; a straight update once the row is genuinely linked.
      patch.first_name = adopting ? match.first_name || contact.first_name : contact.first_name ?? match.first_name;
      patch.last_name = adopting ? match.last_name || contact.last_name : contact.last_name ?? match.last_name;
      patch.phone = adopting ? match.phone || contact.phone : contact.phone ?? match.phone;
      patch.email = match.email || contact.email;
      // Their classification seeds an unclassified contact and is otherwise
      // left alone, but the full role set is always worth refreshing.
      if (match.lead_type === "unknown") patch.lead_type = contact.lead_type;
      if (contact.deal_types.length) patch.deal_types = contact.deal_types;
      patch.sync_status = "linked";
    } else {
      // Both sides moved. Keep ours, keep theirs alongside, and flag it rather
      // than silently picking a winner.
      patch.sync_status = "conflict";
      patch.external_raw = { ...raw, _conflicts: { seen_at: now, remote: contact } };
      result.conflicts++;
    }

    patch.local_hash = localFingerprint({
      first_name: patch.first_name ?? match.first_name,
      last_name: patch.last_name ?? match.last_name,
      email: patch.email ?? match.email,
      phone: patch.phone ?? match.phone,
    });

    toUpdate.push(patch);
    needsDetail.push(contact.external_id);
  }

  // ── 3. Contacts that vanished from their side ─────────────────────────────
  // Flagged, never deleted. A short page or a filtered response must not be
  // able to destroy a client record.

  //
  // "Missing from the list" is NOT sufficient evidence on its own. Because
  // their pagination has no stable sort, a full enumeration reliably drops a
  // handful of contacts — a different handful each time. Trusting absence would
  // flag five live clients as deleted on every single run.
  //
  // So each candidate is confirmed with a direct fetch: 404 means genuinely
  // gone, anything else means the list simply missed it. That costs one request
  // per candidate, which is why it is capped — if a large number are suddenly
  // missing, something is wrong at their end and the right response is to flag
  // nothing at all rather than mass-mark real contacts.
  const MAX_DELETION_CHECKS = 25;

  if (listComplete) {
    const seen = new Set(remote.map((c) => c.external_id));
    const candidates = existing.filter(
      (row) => row.external_id && !seen.has(row.external_id) && row.sync_status !== "remote_deleted"
    );

    if (candidates.length > 0 && candidates.length <= MAX_DELETION_CHECKS) {
      const confirmed: string[] = [];
      for (const row of candidates) {
        if (client.outOfBudget) break;
        try {
          await client.get(`/contact/${encodeURIComponent(row.external_id!)}`);
          // Still there — the list just missed it. Leave it completely alone.
        } catch (error) {
          if (error instanceof BoldTrailLockedOutError) throw error;
          if (error instanceof BoldTrailForbiddenError && error.status === 404) {
            confirmed.push(row.id);
          }
        }
      }
      result.remoteDeleted = confirmed.length;
      if (!dryRun && confirmed.length) {
        await supabase
          .from("contacts")
          .update({ sync_status: "remote_deleted" })
          .in("id", confirmed);
      }
    }
  }

  if (dryRun) return "ok";

  // ── 4. Write ──────────────────────────────────────────────────────────────

  const INSERT_COLUMNS = [
    "first_name", "last_name", "email", "phone", "lead_type", "deal_types", "stage", "source",
    "external_source", "external_id", "external_updated_at", "external_synced_at",
    "remote_hash", "local_hash", "sync_status", "external_raw",
  ] as const;

  const UPDATE_COLUMNS = [
    "id", "first_name", "last_name", "email", "phone", "lead_type", "deal_types",
    "external_source", "external_id", "external_updated_at", "external_synced_at",
    "remote_hash", "local_hash", "sync_status", "external_raw",
  ] as const;

  await writeChunked(supabase, toInsert, INSERT_COLUMNS);
  await writeChunked(supabase, toUpdate, UPDATE_COLUMNS, "id");

  // ── 5. Enrichment, a small batch at a time ────────────────────────────────

  const enriched = await enrichDetails(supabase, client, needsDetail, detailBatch);
  result.detailFetched = enriched;

  return client.outOfBudget ? "partial" : "ok";
}

/**
 * Re-derive every column from the payloads already stored in `external_raw`.
 *
 * Costs nothing: no API calls at all. That is the whole reason enrichment
 * stores the raw payload rather than only the fields it understood at the time
 * — adding a column later, or fixing a mapping bug, becomes a local operation
 * over data we already hold instead of another 978 requests.
 */
export async function remapStoredDetails(
  supabase: SupabaseClient
): Promise<{ scanned: number; updated: number; error?: string }> {
  let scanned = 0;
  let updated = 0;
  const PAGE = 200;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, stage, external_raw, external_notes, last_contacted_at")
      .not("external_id", "is", null)
      .not("external_detail_at", "is", null)
      .range(from, from + PAGE - 1);

    if (error) return { scanned, updated, error: error.message };
    const rows = (data ?? []) as {
      id: string;
      stage: string;
      external_raw: Record<string, unknown>;
      external_notes: ExternalNote[] | null;
      last_contacted_at: string | null;
    }[];
    if (rows.length === 0) break;

    const patches: Record<string, unknown>[] = [];
    for (const row of rows) {
      scanned++;
      // Only the detail payload carries these fields; a list-shaped blob has
      // nothing to add and must not be allowed to null out real values.
      if (!row.external_raw || typeof row.external_raw !== "object") continue;
      if (!("primary_state" in row.external_raw) && !("first_name" in row.external_raw)) continue;

      const mapped = fromDetailContact(row.external_raw as BoldTrailContactDetail);
      if (!mapped) continue;
      // Roles are re-derived here as well as the detail fields. A normal pull
      // would skip these contacts entirely — their payload has not changed, so
      // there is nothing to fetch — which means a change to how deal_type is
      // interpreted would never reach the 978 contacts already imported. This
      // is the path that applies it, and it costs no API calls.
      patches.push({
        id: row.id,
        ...detailColumns(mapped),
        lead_type: mapped.lead_type,
        deal_types: mapped.deal_types,
        // The one field here that is not simply re-derived. A pull seeds `stage`
        // on insert and never touches it again, so the contacts imported before
        // their status was understood are all sitting on the default — this is
        // the only path that can correct them, and it must not undo a move
        // Steven has since made. A stage still on the default is one nobody has
        // touched; anything else is his and is left exactly where it is.
        stage: row.stage === DEFAULT_STAGE ? mapped.stage : row.stage,
        // When BoldTrail last saw a real follow-up. Null for most contacts, and
        // that is the point — see lib/boldtrail/activity for why the note log
        // cannot be read as contact history. Never clears a date already here:
        // a locally recorded call is a fact BoldTrail simply does not know.
        last_contacted_at:
          lastFollowUpAt(row.external_raw, row.external_notes) ?? row.last_contacted_at,
      });
    }

    if (patches.length) {
      const columns = [
        "id",
        ...Object.keys(detailColumns({} as MappedContact)),
        "lead_type",
        "deal_types",
        "stage",
        "last_contacted_at",
      ];
      const { error: writeError } = await supabase
        .from("contacts")
        .upsert(square(patches, columns), { onConflict: "id" });
      if (writeError) return { scanned, updated, error: writeError.message };
      updated += patches.length;
    }

    if (rows.length < PAGE) break;
  }

  return { scanned, updated };
}

/**
 * Fetch the 83-field record for a few contacts per run.
 *
 * Contacts that just changed come first, then whatever has been waiting
 * longest. At one request each this is the only expensive part of a sync, which
 * is exactly why it is rationed rather than run to completion.
 */
async function enrichDetails(
  supabase: SupabaseClient,
  client: BoldTrailClient,
  priority: string[],
  batchSize: number
): Promise<number> {
  if (batchSize <= 0) return 0;

  const queue = [...new Set(priority)].slice(0, batchSize);

  if (queue.length < batchSize) {
    // Top up with the stalest. `nulls first` puts never-enriched contacts at the
    // front; contacts_external_detail_idx serves this ordering.
    const { data } = await supabase
      .from("contacts")
      .select("external_id")
      .not("external_id", "is", null)
      .eq("sync_status", "linked")
      .order("external_detail_at", { ascending: true, nullsFirst: true })
      .limit(batchSize * 2);

    for (const row of (data ?? []) as { external_id: string }[]) {
      if (queue.length >= batchSize) break;
      if (!queue.includes(row.external_id)) queue.push(row.external_id);
    }
  }

  let fetched = 0;
  for (const id of queue) {
    if (client.outOfBudget) break;

    let payload: unknown;
    try {
      payload = await client.get<unknown>(`/contact/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof BoldTrailLockedOutError) throw error;
      // One contact failing is not a reason to abandon the run.
      continue;
    }

    const record = (payload as { data?: BoldTrailContactDetail })?.data ?? (payload as BoldTrailContactDetail);
    if (!record || typeof record !== "object") continue;

    const mapped = fromDetailContact(record);
    if (!mapped) continue;

    const { error } = await supabase
      .from("contacts")
      .update({
        ...detailColumns(mapped),
        external_detail_at: new Date().toISOString(),
        external_raw: record as Record<string, unknown>,
        local_hash: localFingerprint(mapped as unknown as Record<string, unknown>),
      })
      .eq("external_source", PROVIDER)
      .eq("external_id", externalId(record) ?? id);

    if (!error) fetched++;
  }

  return fetched;
}
