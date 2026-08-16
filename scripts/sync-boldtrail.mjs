// Fetch the full BoldTrail record for every linked contact.
//
// WHY THIS IS A SCRIPT AND NOT THE SCHEDULED SYNC
// The daily sync deliberately rations this: their per-contact endpoint costs
// one request EACH, so it enriches a small batch per run and takes weeks to
// cover everyone. That is the right default for an unattended job. It is the
// wrong tool when you want all 978 filled in now — hence a CLI run with no
// serverless timeout, watchable, resumable, and stoppable with Ctrl-C.
//
// It writes `external_raw` (their whole payload, verbatim) and
// `external_detail_at`. It does NOT map fields into columns — that is done
// afterwards by backfill-contact-details.mjs, which reads external_raw and
// needs no API calls at all. Splitting it that way means the expensive part
// happens once, and re-mapping later (new column, fixed mapping) is free.
//
// Usage:
//   node --env-file=.env.local scripts/sync-boldtrail.mjs --enrich
//   node --env-file=.env.local scripts/sync-boldtrail.mjs --enrich --limit=100
//   node --env-file=.env.local scripts/sync-boldtrail.mjs --enrich --all
//     --all      re-fetch contacts that already have detail (default: only missing)
//     --interval=1000   milliseconds between requests (default: env, or 2000)

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};

if (!flag("enrich")) {
  console.error("Nothing to do. Pass --enrich (see the header of this file).");
  process.exit(1);
}

const TOKEN = process.env.BOLDTRAIL_API_TOKEN;
const BASE = (process.env.BOLDTRAIL_API_BASE || "https://api.kvcore.com").replace(/\/+$/, "");
const INTERVAL = Number(value("interval", process.env.BOLDTRAIL_MIN_INTERVAL_MS || 2000));
const LIMIT = Number(value("limit", "0")) || Infinity;
const REFRESH_ALL = flag("all");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN) {
  console.error("FAIL: BOLDTRAIL_API_TOKEN is not set.");
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error("FAIL: Supabase env vars are not set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Pick the work ────────────────────────────────────────────────────────────

async function selectTargets() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("contacts")
      .select("id, external_id, external_detail_at")
      .not("external_id", "is", null)
      .order("external_detail_at", { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (!REFRESH_ALL) query = query.is("external_detail_at", null);

    const { data, error } = await query;
    if (error) throw new Error(`Reading contacts failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows.slice(0, LIMIT === Infinity ? undefined : LIMIT);
}

// ── Fetch one ────────────────────────────────────────────────────────────────

let consecutive401 = 0;

async function fetchDetail(externalId) {
  const res = await fetch(`${BASE}/v2/public/contact/${encodeURIComponent(externalId)}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 401) {
    consecutive401++;
    // Same rule the runtime client uses: an isolated 401 is a scope denial, but
    // a wall of them means the account is unhappy and the only correct response
    // is to stop rather than keep asking.
    if (consecutive401 >= 3) {
      throw new Error(
        "Three consecutive 401s — the token is rejected or the account is locked out. Stopping."
      );
    }
    return null;
  }
  consecutive401 = 0;

  if (res.status === 404) return { gone: true };
  if (!res.ok) return null;

  const payload = await res.json().catch(() => null);
  const record = payload?.data ?? payload;
  return record && typeof record === "object" && !Array.isArray(record) ? { record } : null;
}

// ── Run ──────────────────────────────────────────────────────────────────────

const targets = await selectTargets();
const estimateMin = Math.ceil((targets.length * INTERVAL) / 60000);

console.log(`Contacts to enrich : ${targets.length}`);
console.log(`Pacing             : one request every ${INTERVAL}ms`);
console.log(`Estimated time     : ~${estimateMin} minute(s)`);
console.log(`Mode               : ${REFRESH_ALL ? "re-fetch everything" : "only those missing detail"}`);
console.log("");

if (targets.length === 0) {
  console.log("Nothing to do — every linked contact already has its full record.");
  process.exit(0);
}

let done = 0;
let failed = 0;
let gone = 0;
const startedAt = Date.now();

for (const target of targets) {
  let result;
  try {
    result = await fetchDetail(target.external_id);
  } catch (error) {
    console.error(`\nSTOPPED: ${error.message}`);
    console.error(`Progress kept: ${done} enriched. Re-run later to continue where this left off.`);
    process.exit(1);
  }

  if (result?.gone) {
    gone++;
    await supabase.from("contacts").update({ sync_status: "remote_deleted" }).eq("id", target.id);
  } else if (result?.record) {
    const { error } = await supabase
      .from("contacts")
      .update({
        external_raw: result.record,
        external_detail_at: new Date().toISOString(),
      })
      .eq("id", target.id);
    if (error) failed++;
    else done++;
  } else {
    failed++;
  }

  const n = done + failed + gone;
  if (n % 25 === 0 || n === targets.length) {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const remaining = Math.ceil(((targets.length - n) * INTERVAL) / 60000);
    console.log(
      `  ${n}/${targets.length} — ${done} saved, ${failed} failed, ${gone} gone · ${elapsed}s elapsed, ~${remaining}m left`
    );
  }

  await sleep(INTERVAL);
}

console.log(`\nDone. ${done} enriched, ${failed} failed, ${gone} no longer in BoldTrail.`);
console.log("Next: node --env-file=.env.local scripts/backfill-contact-details.mjs");
process.exit(0);
