// Read-only probe of the BoldTrail (kvCORE) Public API V2.
//
// WHY THIS EXISTS
// BoldTrail's API reference is not public — you request it from Inside Real
// Estate support, and access is reportedly gated by plan tier. Everything we
// "know" about it comes from third-party integrator write-ups, which is a bad
// foundation for a sync that writes to Steven's client list. So before any sync
// code is written, this script asks the account itself what it can do and
// prints the answer.
//
// The output JSON is what lib/boldtrail/types.ts and the field mappings get
// written from. Do not guess field names; run this first.
//
// Usage:
//   node --env-file=.env.local scripts/probe-boldtrail.mjs
//   node --env-file=.env.local scripts/probe-boldtrail.mjs --ratelimit
//   node --env-file=.env.local scripts/probe-boldtrail.mjs --write-probe
//
// SAFETY
// GET/HEAD/OPTIONS only unless --write-probe is passed explicitly. The token is
// never printed (only its last 4 characters). Values of fields that look like
// personal data are never printed — only their type and null-rate.
//
// GO EASY. A full run is ~50 requests. Running it repeatedly in quick
// succession has been observed to put the account into a state where every
// endpoint returns 401 "Authentication Failed" — including ones that worked
// moments earlier, with a byte-identical token — and it does not clear within
// a few minutes. Run it once, read the output, and wait before re-running.

const TOKEN = process.env.BOLDTRAIL_API_TOKEN;
const BASE = (process.env.BOLDTRAIL_API_BASE || "https://api.kvcore.com").replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DO_RATELIMIT = args.has("--ratelimit");
const DO_WRITE = args.has("--write-probe");

if (!TOKEN) {
  console.error("FAIL: BOLDTRAIL_API_TOKEN is not set.");
  console.error("Generate one in BoldTrail: Lead Engine → Lead Dropbox → My API Tokens →");
  console.error("tick the scope you need (Contacts / User / All) → Generate.");
  process.exit(1);
}

// Requests are issued strictly one at a time with a floor on the gap between
// them. Their rate limits are undisclosed and a token maxes out at 3 active
// copies per account, so tripping a 429 storm costs far more than the wait.
const MIN_INTERVAL_MS = Number(process.env.BOLDTRAIL_MIN_INTERVAL_MS || 250);
let lastRequestAt = 0;

// This API returns 401 for at least three different things: a genuinely bad
// token, an endpoint outside the token's scope, and — observed in practice —
// an account that has been locked out after a burst of traffic. A scope denial
// is isolated and harmless; a lockout 401s everything. So once the run has
// proved the token works, a wall of consecutive 401s means stop, because every
// further request is both useless and likely to prolong the lockout.
const ABORT_AFTER_CONSECUTIVE_401 = 5;
let sawSuccess = false;
let consecutive401 = 0;

class LockedOutError extends Error {}

// Top-level await means a throw surfaces as an unhandled rejection with a stack
// trace, which buries the one line that matters.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    if (error instanceof LockedOutError) {
      console.error(`\nSTOPPED: ${error.message}`);
      console.error("");
      console.error("This API uses 401 for a bad token, for an out-of-scope endpoint, AND");
      console.error("for a rate/abuse lockout — the status alone cannot tell them apart.");
      console.error("What to do, in order:");
      console.error("  1. Wait an hour and re-run. Lockouts observed here outlast a short");
      console.error("     cooldown, so a couple of minutes is not a fair test.");
      console.error("  2. Check Lead Engine → Lead Dropbox → My API Tokens in BoldTrail and");
      console.error("     confirm the token is still listed. It may have been revoked.");
      console.error("  3. If it is gone, generate a new one. Max 3 active — soft-delete an");
      console.error("     old one first if you are at the limit.");
      process.exit(2);
    }
    console.error(error);
    process.exit(1);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, { method = "GET", body = null, prefix = "" } = {}) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const url = path.startsWith("http") ? path : `${BASE}${prefix}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      sawSuccess = true;
      consecutive401 = 0;
    } else if (res.status === 401) {
      consecutive401++;
      if (sawSuccess && consecutive401 >= ABORT_AFTER_CONSECUTIVE_401) {
        throw new LockedOutError(
          `${consecutive401} consecutive 401s after the token had been working — ` +
            `the account looks locked out rather than misconfigured. Stopping so ` +
            `further requests do not prolong it.`
        );
      }
    } else {
      consecutive401 = 0;
    }

    const ms = Date.now() - started;
    const contentType = res.headers.get("content-type") || "";
    let payload = null;
    if (method !== "HEAD" && contentType.includes("json")) {
      payload = await res.json().catch(() => null);
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType: contentType.split(";")[0] || null,
      ms,
      payload,
      headers: res.headers,
      url,
    };
  } catch (error) {
    // A lockout is not a per-request failure to be reported in a table — it
    // ends the run, so it has to escape rather than be swallowed as status 0.
    if (error instanceof LockedOutError) throw error;
    return {
      ok: false,
      status: 0,
      contentType: null,
      ms: Date.now() - started,
      payload: null,
      headers: new Headers(),
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Their response envelope is one of the unknowns, so unwrap defensively rather
// than assuming `{ data: [...] }`.
function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["data", "results", "contacts", "items", "records", "rows"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  // A single nested envelope, e.g. { data: { data: [...] } }.
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of ["data", "results", "items"]) {
        if (Array.isArray(value[key])) return value[key];
      }
    }
  }
  return null;
}

function extractTotal(payload) {
  if (!payload || typeof payload !== "object") return null;
  const seek = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    for (const key of ["total", "total_count", "totalCount", "count", "total_records"]) {
      if (typeof obj[key] === "number") return obj[key];
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        const found = seek(value, depth + 1);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return seek(payload);
}

function recordId(record) {
  if (!record || typeof record !== "object") return null;
  for (const key of ["id", "_id", "contact_id", "contactId", "uuid"]) {
    if (record[key] != null) return String(record[key]);
  }
  return null;
}

// Field names whose *values* must never be printed. The census still reports
// their type and null-rate — just not the contents.
const PII_PATTERN =
  /(email|phone|mobile|cell|name|address|street|zip|postal|dob|birth|ssn|password|token|secret|note|message|comment)/i;

function typeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// ── 1. Path prefix discovery ─────────────────────────────────────────────────
// Third-party write-ups point at /v2/public, but that is hearsay. Ask.

const PREFIX_CANDIDATES = ["/v2/public", "/v2", "/public", ""];

async function discoverPrefix() {
  const attempts = [];
  for (const prefix of PREFIX_CANDIDATES) {
    const res = await request("/contacts?limit=1", { prefix });
    attempts.push({ prefix: prefix || "(none)", status: res.status, ms: res.ms });

    if (res.status === 401) {
      return { prefix: null, attempts, fatal: "401 Unauthorized — the token is rejected." };
    }
    if (res.ok && extractList(res.payload) !== null) {
      return { prefix, attempts, sample: res.payload };
    }
  }
  return { prefix: null, attempts, fatal: "No candidate path returned a contact list." };
}

// ── 2. Endpoint matrix ───────────────────────────────────────────────────────

const ENDPOINTS = [
  "contacts", "contacts/search", "users", "user", "me", "agents", "teams",
  "hashtags", "tags", "lead-sources", "sources", "deals", "transactions",
  "listings", "properties", "saved-searches", "campaigns", "notes",
  "activities", "tasks", "appointments", "messages", "emails",
];

async function probeEndpoints(prefix) {
  const matrix = {};
  for (const name of ENDPOINTS) {
    const res = await request(`/${name}?limit=1`, { prefix });
    const list = extractList(res.payload);
    matrix[name] = {
      status: res.status,
      available: res.ok,
      contentType: res.contentType,
      ms: res.ms,
      returnsList: list !== null,
      sampleSize: list ? list.length : null,
      ...(res.error ? { error: res.error } : {}),
    };
  }
  return matrix;
}

// ── 3. Field census ──────────────────────────────────────────────────────────
// The single most useful output: their real field names and, for low-cardinality
// fields, their real enum vocabulary. This is what normalizeStage /
// normalizeLeadType get taught, instead of guessing at aliases.

function censusFields(records) {
  const fields = new Map();

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    for (const [key, value] of Object.entries(record)) {
      if (!fields.has(key)) {
        fields.set(key, { types: new Set(), nulls: 0, seen: 0, values: new Set(), tooMany: false });
      }
      const field = fields.get(key);
      field.seen++;
      field.types.add(typeOf(value));
      if (value === null || value === undefined || value === "") field.nulls++;

      if (!field.tooMany && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        field.values.add(String(value));
        if (field.values.size > 25) {
          field.tooMany = true;
          field.values.clear();
        }
      }
    }
  }

  const total = records.length;
  return [...fields.entries()]
    .map(([name, field]) => {
      const pii = PII_PATTERN.test(name);
      const enumerable = !field.tooMany && field.values.size > 0 && !pii;
      return {
        name,
        types: [...field.types],
        nullRate: total ? Number((field.nulls / total).toFixed(2)) : null,
        presentIn: field.seen,
        // Values are withheld for anything that looks personal — the point of
        // the census is the schema, not Steven's client data.
        distinctValues: enumerable ? [...field.values].sort() : null,
        withheld: pii ? "looks like personal data" : field.tooMany ? ">25 distinct values" : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const UPDATED_AT_KEYS = ["updated_at", "updatedAt", "modified", "modified_at", "last_activity", "last_modified", "date_modified"];

async function contactCensus(prefix) {
  const pages = [];
  const records = [];

  for (let page = 1; page <= 3; page++) {
    const res = await request(`/contacts?limit=100&page=${page}`, { prefix });
    const list = extractList(res.payload);
    if (!res.ok || !list) break;
    pages.push({ page, status: res.status, returned: list.length, ms: res.ms });
    records.push(...list);
    if (list.length === 0) break;
  }

  const fields = censusFields(records);
  const fieldNames = new Set(fields.map((f) => f.name));
  const updatedAtField = UPDATED_AT_KEYS.find((k) => fieldNames.has(k)) || null;

  return {
    sampled: records.length,
    pages,
    updatedAtField,
    updatedAtSample: updatedAtField && records[0] ? String(records[0][updatedAtField] ?? "") : null,
    fields,
    firstId: records.length ? recordId(records[0]) : null,
  };
}

// ── 4. Capability tests ──────────────────────────────────────────────────────
// Every test must prove the parameter was HONOURED, not merely accepted. An API
// that silently ignores `updated_since` and returns everything would, if
// trusted, make an incremental sync quietly miss nothing — but an API that
// silently ignores it and we *believe* it filtered is how a sync corrupts data.
// So each result is compared against an unfiltered baseline by ID set.

async function baselineIds(prefix, limit = 10) {
  const res = await request(`/contacts?limit=${limit}`, { prefix });
  const list = extractList(res.payload) || [];
  return { ids: list.map(recordId).filter(Boolean), count: list.length, total: extractTotal(res.payload) };
}

async function probePagination(prefix, baseline) {
  const results = {};

  // Page-size parameter: does asking for 3 actually return 3?
  for (const param of ["limit", "per_page", "page_size", "count"]) {
    const res = await request(`/contacts?${param}=3`, { prefix });
    const list = extractList(res.payload);
    results[param] = {
      status: res.status,
      returned: list ? list.length : null,
      honoured: Boolean(list && list.length === 3 && baseline.count > 3),
    };
  }

  // Offset style: page=2 / offset=N must return a DIFFERENT id set to page 1.
  const styles = {};
  for (const [style, query] of [["page", "limit=5&page=2"], ["offset", "limit=5&offset=5"], ["skip", "limit=5&skip=5"]]) {
    const res = await request(`/contacts?${query}`, { prefix });
    const list = extractList(res.payload) || [];
    const ids = list.map(recordId).filter(Boolean);
    const firstFive = new Set(baseline.ids.slice(0, 5));
    const overlap = ids.filter((id) => firstFive.has(id)).length;
    styles[style] = {
      status: res.status,
      returned: ids.length,
      // Honoured only if it returned rows and they are not page 1 again.
      honoured: ids.length > 0 && overlap === 0 && baseline.ids.length > 5,
      overlapWithPageOne: overlap,
    };
  }

  return { pageSizeParams: results, styles };
}

async function probeIncremental(prefix, baseline) {
  // A timestamp far in the future: an honoured filter returns (almost) nothing.
  // An ignored filter returns the full list — which is how we tell them apart.
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const params = [
    ["updated_since", future],
    ["updated_at[gte]", future],
    ["modified_since", future],
    ["since", future],
    ["filter[updated_at]", future],
    ["updatedAfter", future],
  ];

  const results = {};
  for (const [param, value] of params) {
    const res = await request(`/contacts?limit=10&${encodeURIComponent(param)}=${encodeURIComponent(value)}`, { prefix });
    const list = extractList(res.payload);
    const returned = list ? list.length : null;
    results[param] = {
      status: res.status,
      returned,
      // Fewer rows than the unfiltered baseline => the server actually filtered.
      honoured: Boolean(res.ok && list && baseline.count > 0 && returned < baseline.count),
    };
  }

  const winner = Object.entries(results).find(([, r]) => r.honoured);
  return { params: results, supported: Boolean(winner), param: winner ? winner[0] : null, verified: Boolean(winner) };
}

/**
 * Single-record paths are SINGULAR here — /contact/{id}, not /contacts/{id} —
 * while the list is plural. Guessing wrong reads as "this API has no detail
 * endpoint", so both shapes get tried.
 */
async function probeDetailRichness(prefix, firstId, listFieldNames) {
  if (!firstId) return { tested: false, reason: "no contact id available" };

  for (const shape of ["contact", "contacts"]) {
    const res = await request(`/${shape}/${encodeURIComponent(firstId)}`, { prefix });
    if (!res.ok) continue;

    const record = extractList(res.payload)?.[0] ?? res.payload?.data ?? res.payload;
    if (!record || typeof record !== "object") continue;

    const detailKeys = Object.keys(record);
    return {
      tested: true,
      status: res.status,
      available: true,
      pathShape: `/${shape}/{id}`,
      extraFields: detailKeys.filter((k) => !listFieldNames.has(k)).sort(),
      fieldCount: detailKeys.length,
    };
  }
  return { tested: true, available: false };
}

/**
 * Anything hanging off a single contact. These do not appear as top-level
 * collections — /notes and /tags are both 404 — so probing only the collection
 * roots would wrongly conclude that notes and tags are unavailable.
 *
 * This matters more than it looks: whether notes can round-trip decides whether
 * "two-way sync" means contact details only, or contact details plus the actual
 * record of what was said.
 */
async function probeContactSubResources(prefix, firstId) {
  if (!firstId) return { tested: false, reason: "no contact id available" };

  const paths = {
    tags: `/contact/${encodeURIComponent(firstId)}/tags`,
    notes: `/contact/${encodeURIComponent(firstId)}/action/note`,
    calls: `/contact/${encodeURIComponent(firstId)}/action/call`,
    emails: `/contact/${encodeURIComponent(firstId)}/action/email`,
    texts: `/contact/${encodeURIComponent(firstId)}/action/text`,
    appointments: `/contact/${encodeURIComponent(firstId)}/action/appointment`,
    timeline: `/contact/${encodeURIComponent(firstId)}/timeline`,
  };

  const out = {};
  for (const [name, path] of Object.entries(paths)) {
    const res = await request(path, { prefix });
    const list = extractList(res.payload);
    const sample = list?.[0] ?? (res.ok ? res.payload?.data : null);
    out[name] = {
      status: res.status,
      available: res.ok,
      returnsList: list !== null,
      count: list ? list.length : null,
      // Field names only — the contents are Steven's client conversations.
      fields:
        sample && typeof sample === "object" && !Array.isArray(sample)
          ? Object.keys(sample).sort()
          : null,
    };
  }
  return { tested: true, ...out };
}

// ── 5. Rate limits (opt-in) ──────────────────────────────────────────────────

async function probeRateLimit(prefix) {
  const headersSeen = {};
  let firstThrottleAt = null;
  let retryAfter = null;

  for (let i = 1; i <= 30; i++) {
    const res = await request("/contacts?limit=1", { prefix });
    for (const [key, value] of res.headers.entries()) {
      if (/ratelimit|retry-after|x-rate/i.test(key)) headersSeen[key] = value;
    }
    if (res.status === 429) {
      firstThrottleAt = i;
      retryAfter = res.headers.get("retry-after");
      break;
    }
  }

  return { requestsMade: firstThrottleAt ?? 30, headersSeen, firstThrottleAt, retryAfter };
}

// ── 6. Write capability ──────────────────────────────────────────────────────
// OPTIONS tells us something for free. The round-trip below is the only honest
// test, and it is opt-in because it briefly creates a real record in Steven's
// account — under an @….invalid address that can never receive mail.

async function probeWrites(prefix) {
  const optionsRes = await request("/contacts", { method: "OPTIONS", prefix });
  const allow = optionsRes.headers.get("allow") || optionsRes.headers.get("access-control-allow-methods");

  const result = {
    options: { status: optionsRes.status, allow: allow || null },
    roundTrip: DO_WRITE ? null : "skipped — pass --write-probe to test writes",
  };

  if (!DO_WRITE) return result;

  const marker = `boldtrail-probe+${Date.now()}@stevenmoning.invalid`;
  result.probeEmail = marker;
  result.roundTrip = {};

  // Single-record writes follow the singular path, same as GET /contact/{id}.
  // The plural form is tried as a fallback rather than assumed away.
  let created = null;
  for (const shape of ["contact", "contacts"]) {
    const res = await request(`/${shape}`, {
      method: "POST",
      prefix,
      body: { first_name: "Probe", last_name: "Test", email: marker },
    });
    result.roundTrip[`create ${shape}`] = { status: res.status, ok: res.ok };
    if (res.ok) {
      created = res;
      result.createPath = `/${shape}`;
      break;
    }
  }

  if (!created) {
    result.supported = false;
    return result;
  }

  const newId = recordId(
    extractList(created.payload)?.[0] ?? created.payload?.data ?? created.payload
  );
  if (!newId) {
    result.supported = true;
    result.roundTrip.warning = "Created, but no id came back — cannot clean up automatically.";
    result.roundTrip.cleanupWarning = `Remove ${marker} from BoldTrail by hand.`;
    return result;
  }

  const readBack = await request(`/contact/${encodeURIComponent(newId)}`, { prefix });
  result.roundTrip.read = { status: readBack.status, ok: readBack.ok };

  // The update path the sync will actually use — worth proving now rather than
  // discovering it is unavailable halfway through a push.
  const updated = await request(`/contact/${encodeURIComponent(newId)}`, {
    method: "PUT",
    prefix,
    body: { last_name: "Updated" },
  });
  result.roundTrip.update = { status: updated.status, ok: updated.ok };

  // The two sub-resources that decide how much of "two-way" is real.
  const taggedRes = await request(`/contact/${encodeURIComponent(newId)}/tags`, {
    method: "PUT",
    prefix,
    body: { tags: ["probe-delete-me"] },
  });
  result.roundTrip.writeTags = { status: taggedRes.status, ok: taggedRes.ok };

  const noteRes = await request(`/contact/${encodeURIComponent(newId)}/action/note`, {
    method: "PUT",
    prefix,
    body: { note: "probe" },
  });
  result.roundTrip.writeNote = { status: noteRes.status, ok: noteRes.ok };

  const removed = await request(`/contact/${encodeURIComponent(newId)}`, {
    method: "DELETE",
    prefix,
  });
  result.roundTrip.delete = { status: removed.status, ok: removed.ok };
  if (!removed.ok) {
    result.roundTrip.cleanupWarning =
      `Could not delete the probe contact (HTTP ${removed.status}). ` +
      `Remove ${marker} from BoldTrail by hand.`;
  }

  result.supported = true;
  return result;
}

// ── Run ──────────────────────────────────────────────────────────────────────

function heading(text) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

console.log(`BoldTrail API probe`);
console.log(`Base:  ${BASE}`);
console.log(`Token: …${TOKEN.slice(-4)} (${TOKEN.length} chars)`);
console.log(`Mode:  read-only${DO_RATELIMIT ? " + rate-limit test" : ""}${DO_WRITE ? " + WRITE ROUND-TRIP" : ""}`);

const report = { baseUrl: BASE, probedAt: new Date().toISOString() };

heading("1. Path prefix");
const discovered = await discoverPrefix();
for (const attempt of discovered.attempts) {
  console.log(`  ${String(attempt.status).padEnd(4)} ${attempt.prefix.padEnd(12)} ${attempt.ms}ms`);
}

if (discovered.fatal) {
  console.error(`\nFAIL: ${discovered.fatal}`);
  if (discovered.attempts.some((a) => a.status === 401)) {
    console.error("The token is present but rejected. Tokens expire after a year —");
    console.error("regenerate it in BoldTrail: Lead Engine → Lead Dropbox → My API Tokens.");
  } else {
    console.error("Contacts may not be exposed to this token's scope, or the base URL is wrong.");
    console.error("Try: BOLDTRAIL_API_BASE=<their url> node --env-file=.env.local scripts/probe-boldtrail.mjs");
  }
  report.fatal = discovered.fatal;
  report.prefixAttempts = discovered.attempts;
  console.log("\n=== MACHINE READABLE ===");
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const prefix = discovered.prefix;
report.pathPrefix = prefix;
console.log(`\n  → using prefix "${prefix || "(none)"}"`);

heading("2. Endpoints");
report.endpoints = await probeEndpoints(prefix);
for (const [name, info] of Object.entries(report.endpoints)) {
  const mark = info.available ? "✓" : " ";
  const note = info.available ? (info.returnsList ? "list" : "object") : "";
  console.log(`  ${mark} ${String(info.status).padEnd(4)} ${name.padEnd(16)} ${note}`);
}

heading("3. Contact fields");
const census = await contactCensus(prefix);
report.contacts = census;
console.log(`  Sampled ${census.sampled} contact(s) across ${census.pages.length} page(s)`);
console.log(`  Incremental-sync timestamp field: ${census.updatedAtField ?? "NONE FOUND"}`);
if (census.updatedAtSample) console.log(`  Sample value: ${census.updatedAtSample}`);
console.log("");
for (const field of census.fields) {
  const types = field.types.join("|");
  const values = field.distinctValues
    ? ` = [${field.distinctValues.join(", ")}]`
    : field.withheld
      ? ` (values withheld: ${field.withheld})`
      : "";
  console.log(`  ${field.name.padEnd(28)} ${types.padEnd(16)} null:${String(field.nullRate).padEnd(5)}${values}`);
}

heading("4. Capabilities");
const baseline = await baselineIds(prefix);
report.totalContacts = baseline.total;
console.log(`  Baseline: ${baseline.count} rows fetched, reported total: ${baseline.total ?? "not exposed"}`);

report.pagination = await probePagination(prefix, baseline);
console.log("\n  Page-size parameter:");
for (const [param, info] of Object.entries(report.pagination.pageSizeParams)) {
  console.log(`    ${param.padEnd(12)} ${String(info.status).padEnd(4)} returned:${String(info.returned).padEnd(5)} ${info.honoured ? "HONOURED" : "ignored/failed"}`);
}
console.log("\n  Offset style:");
for (const [style, info] of Object.entries(report.pagination.styles)) {
  console.log(`    ${style.padEnd(12)} ${String(info.status).padEnd(4)} returned:${String(info.returned).padEnd(5)} ${info.honoured ? "HONOURED" : "ignored/failed"}`);
}

report.incremental = await probeIncremental(prefix, baseline);
console.log("\n  Incremental filter (a far-future timestamp should return ~nothing):");
for (const [param, info] of Object.entries(report.incremental.params)) {
  console.log(`    ${param.padEnd(20)} ${String(info.status).padEnd(4)} returned:${String(info.returned).padEnd(5)} ${info.honoured ? "HONOURED" : "ignored/failed"}`);
}

report.detail = await probeDetailRichness(prefix, census.firstId, new Set(census.fields.map((f) => f.name)));
if (report.detail.available) {
  console.log(`\n  GET ${report.detail.pathShape}: ${report.detail.fieldCount} fields, ${report.detail.extraFields.length} not in the list response`);
  if (report.detail.extraFields.length) console.log(`    extra: ${report.detail.extraFields.join(", ")}`);
} else {
  console.log(`\n  GET /contact/{id}: not available`);
}

report.subResources = await probeContactSubResources(prefix, census.firstId);
console.log("\n  Per-contact sub-resources:");
for (const [name, info] of Object.entries(report.subResources)) {
  if (name === "tested") continue;
  const mark = info.available ? "✓" : " ";
  const fields = info.fields ? ` — ${info.fields.join(", ")}` : info.available ? " — empty" : "";
  console.log(`    ${mark} ${String(info.status).padEnd(4)} ${name.padEnd(13)}${fields}`);
}

if (DO_RATELIMIT) {
  heading("5. Rate limits");
  report.rateLimit = await probeRateLimit(prefix);
  console.log(`  Requests before throttling: ${report.rateLimit.firstThrottleAt ?? "30+ (no 429 hit)"}`);
  const headerKeys = Object.keys(report.rateLimit.headersSeen);
  console.log(`  Rate-limit headers: ${headerKeys.length ? headerKeys.join(", ") : "none exposed"}`);
} else {
  report.rateLimit = { skipped: "pass --ratelimit to test" };
}

heading(DO_RATELIMIT ? "6. Writes" : "5. Writes");
report.writes = await probeWrites(prefix);
console.log(`  OPTIONS /contacts: ${report.writes.options.status}${report.writes.options.allow ? ` (allow: ${report.writes.options.allow})` : ""}`);
if (DO_WRITE) {
  console.log(`  Round-trip: ${JSON.stringify(report.writes.roundTrip)}`);
  if (report.writes.roundTrip?.cleanupWarning) console.log(`  ⚠ ${report.writes.roundTrip.cleanupWarning}`);
} else {
  console.log(`  Round-trip: ${report.writes.roundTrip}`);
}

// ── Verdict ──────────────────────────────────────────────────────────────────

heading("Verdict");

const contactsWork = report.endpoints.contacts?.available;
const tier = report.incremental.verified
  ? 1
  : census.updatedAtField
    ? 2
    : 3;
report.syncTier = tier;

console.log(`  Contacts readable:      ${contactsWork ? "yes" : "NO — sync is blocked"}`);
console.log(`  Incremental pull:       ${report.incremental.verified ? `yes, via "${report.incremental.param}"` : "no working filter found"}`);
console.log(`  Change-detection tier:  ${tier} — ${
  tier === 1 ? "filter by watermark" : tier === 2 ? "full scan, filter on their updated_at locally" : "full scan + content fingerprint"
}`);
console.log(`  Write-back:             ${
  DO_WRITE
    ? report.writes.supported ? "confirmed working" : "rejected"
    : "unknown — re-run with --write-probe"
}`);

const subs = report.subResources ?? {};
console.log(`  Notes round-trip:       ${subs.notes?.available ? "YES — /contact/{id}/action/note works" : "no"}`);
console.log(`  Tags round-trip:        ${subs.tags?.available ? "YES — /contact/{id}/tags works" : "no"}`);

// Pipeline is the one that decides how much of "two-way" is real. Their
// `status` is a numeric code on the contact, not a stage endpoint, so the
// question is whether that number can be written back — not whether some
// /deals collection exists.
const unavailable = ["deals", "transactions", "activities", "tasks"].filter(
  (name) => !report.endpoints[name]?.available
);
if (unavailable.length) {
  console.log(`\n  Still no endpoint for: ${unavailable.join(", ")}`);
  console.log(`  → there is no deal/pipeline object to sync against.`);
}

console.log("\n=== MACHINE READABLE ===");
console.log(JSON.stringify(report, null, 2));
process.exit(contactsWork ? 0 : 1);
