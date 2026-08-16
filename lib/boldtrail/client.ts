// HTTP client for the BoldTrail (kvCORE) Public API V2.
//
// Everything here is shaped by what scripts/probe-boldtrail.mjs found against
// the real account, not by their documentation (which is not public):
//
//   • Base https://api.kvcore.com, prefix /v2/public.
//   • The list is PLURAL (/contacts), a single record is SINGULAR (/contact/1).
//   • Pagination is `limit` + `page`. `offset` and `skip` are accepted and then
//     SILENTLY IGNORED — using them would re-read page one forever.
//   • No incremental filter works. Six spellings of "updated since" were all
//     accepted and ignored, so filtering happens on our side.
//   • 401 means at least three different things: bad token, endpoint outside
//     the token's scope, and rate/abuse lockout. See isAuthError below.
//   • 429 was never observed. Throttling appears to arrive as 401 instead.

const DEFAULT_BASE = "https://api.kvcore.com";
const PREFIX = "/v2/public";

/** Their maximum observed page size. 978 contacts fit in two requests. */
export const MAX_PAGE_SIZE = 500;

export class BoldTrailError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
    this.name = "BoldTrailError";
  }
}

/**
 * Raised when the account looks locked out rather than misconfigured: the token
 * worked, then everything started returning 401.
 *
 * This is deliberately NOT treated as a dead token. Failing a nightly sync
 * permanently because the API was briefly annoyed would mean the sync silently
 * stops until somebody notices, which is the worst possible failure mode for
 * something that runs unattended.
 */
export class BoldTrailLockedOutError extends BoldTrailError {
  constructor(path: string) {
    super(
      "BoldTrail returned 401 after the token had been working — the account " +
        "looks rate-limited or locked out. Backing off; the next run will retry.",
      401,
      path
    );
    this.name = "BoldTrailLockedOutError";
  }
}

/** The endpoint is not in this token's scope. Expected, and never fatal. */
export class BoldTrailForbiddenError extends BoldTrailError {
  constructor(path: string, status: number) {
    super(`BoldTrail denied ${path} (${status}) — outside this token's scope.`, status, path);
    this.name = "BoldTrailForbiddenError";
  }
}

/**
 * One request every two seconds. Deliberately dull.
 *
 * The only hard data point we have is that ~150 probe requests plus two 500-row
 * scans inside about five minutes locked the account out for longer than three
 * minutes. The actual threshold is unknown, and the only way to measure it is
 * to trigger the thing we are avoiding — on a live account holding 978 real
 * client records. So this sits far below any plausible limit instead, and
 * `telemetry` below builds the evidence that would justify raising it.
 */
const DEFAULT_MIN_INTERVAL_MS = 2_000;

/** Steady state is 2 requests. Anything near this ceiling means a bug. */
const DEFAULT_MAX_REQUESTS = 120;

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  /** Floor on the gap between requests. Their limits are undisclosed. */
  minIntervalMs?: number;
  /** Hard ceiling on requests for one run. The main defence against a lockout. */
  maxRequests?: number;
  /** Wall-clock budget, so a serverless invocation stops before it is killed. */
  budgetMs?: number;
}

/**
 * What the run observed about the API, gathered from requests it was making
 * anyway. Recorded into `sync_runs.detail` so that after a few weeks of
 * ordinary daily runs there is a real picture of this API's behaviour — at no
 * extra cost and without probing for a limit.
 */
export interface Telemetry {
  requests: number;
  p50Ms: number | null;
  maxMs: number | null;
  statuses: Record<string, number>;
  /** Any rate-limit header they ever return. So far: none observed. */
  rateHeaders: Record<string, string>;
}

export interface BoldTrailClient {
  get<T = unknown>(path: string): Promise<T>;
  /** Yields whole pages so callers can stop on budget rather than mid-page. */
  listPages<T = unknown>(path: string, pageSize?: number): AsyncGenerator<T[]>;
  readonly requestsMade: number;
  readonly outOfBudget: boolean;
  telemetry(): Telemetry;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Unwraps the response envelope, which varies by endpoint. */
function unwrapList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "results", "contacts", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

export function createBoldTrailClient(options: ClientOptions): BoldTrailClient {
  const base = (options.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const deadline = options.budgetMs ? Date.now() + options.budgetMs : null;

  let lastRequestAt = 0;
  let requestsMade = 0;
  let sawSuccess = false;
  let consecutive401 = 0;

  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  const rateHeaders: Record<string, string> = {};

  function outOfBudget(): boolean {
    if (requestsMade >= maxRequests) return true;
    if (deadline && Date.now() >= deadline) return true;
    return false;
  }

  async function raw(path: string): Promise<Response> {
    // Serial, never parallel. Concurrency buys very little against a two-page
    // list and is the fastest way to trip whatever limit produced the lockout.
    const wait = minInterval - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestsMade++;

    const started = Date.now();
    const res = await fetch(`${base}${PREFIX}${path}`, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });

    latencies.push(Date.now() - started);
    statuses[String(res.status)] = (statuses[String(res.status)] ?? 0) + 1;
    for (const [key, value] of res.headers.entries()) {
      if (/ratelimit|retry-after|x-rate/i.test(key)) rateHeaders[key] = value;
    }

    return res;
  }

  async function get<T>(path: string): Promise<T> {
    if (outOfBudget()) {
      throw new BoldTrailError("Request budget exhausted for this run.", 0, path);
    }

    // Retries are few and slow on purpose. If the API is unhappy, the useful
    // response is to stop and come back tomorrow, not to try harder now.
    const backoffs = [1_000, 4_000, 10_000];
    let lastError: BoldTrailError | null = null;

    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      const res = await raw(path);

      if (res.ok) {
        sawSuccess = true;
        consecutive401 = 0;
        return (await res.json()) as T;
      }

      if (res.status === 401) {
        consecutive401++;
        // A scope denial is isolated: other calls in the same run still work.
        // A lockout 401s everything, so a run of them after a success is the
        // signal to stop rather than keep poking.
        if (sawSuccess && consecutive401 >= 3) throw new BoldTrailLockedOutError(path);
        if (!sawSuccess) {
          // Nothing has succeeded yet, so we cannot tell a dead token from a
          // lockout that started before this run. Retry once, slowly.
          lastError = new BoldTrailError(
            "BoldTrail rejected the token (401). Either it expired, or the " +
              "account is locked out — this API uses 401 for both.",
            401,
            path
          );
          if (attempt < backoffs.length) {
            await sleep(backoffs[attempt]);
            continue;
          }
          throw lastError;
        }
        throw new BoldTrailForbiddenError(path, 401);
      }

      if (res.status === 403 || res.status === 404 || res.status === 405) {
        throw new BoldTrailForbiddenError(path, res.status);
      }

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) * 1000;
        lastError = new BoldTrailError(`BoldTrail ${res.status} on ${path}`, res.status, path);
        if (attempt < backoffs.length) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffs[attempt]);
          continue;
        }
      }

      throw lastError ?? new BoldTrailError(`BoldTrail ${res.status} on ${path}`, res.status, path);
    }

    throw lastError ?? new BoldTrailError(`BoldTrail request failed: ${path}`, 0, path);
  }

  async function* listPages<T>(path: string, pageSize = MAX_PAGE_SIZE): AsyncGenerator<T[]> {
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
      if (outOfBudget()) return;
      const payload = await get<unknown>(`${path}${sep}limit=${pageSize}&page=${page}`);
      const rows = unwrapList(payload);
      if (!rows || rows.length === 0) return;
      yield rows as T[];
      // A short page is the last page. There is no total to trust here — the
      // count field is absent on some responses.
      if (rows.length < pageSize) return;
    }
  }

  return {
    get,
    listPages,
    get requestsMade() {
      return requestsMade;
    },
    get outOfBudget() {
      return outOfBudget();
    },
    telemetry() {
      const sorted = [...latencies].sort((a, b) => a - b);
      return {
        requests: requestsMade,
        p50Ms: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        maxMs: sorted.length ? sorted[sorted.length - 1] : null,
        statuses,
        rateHeaders,
      };
    },
  };
}

/** Builds a client from the environment, or null when sync is off/unconfigured. */
export function clientFromEnv(overrides: Partial<ClientOptions> = {}): BoldTrailClient | null {
  const token = process.env.BOLDTRAIL_API_TOKEN;
  if (!token) return null;
  if (process.env.BOLDTRAIL_SYNC_ENABLED === "false") return null;

  return createBoldTrailClient({
    token,
    baseUrl: process.env.BOLDTRAIL_API_BASE,
    minIntervalMs: Number(process.env.BOLDTRAIL_MIN_INTERVAL_MS) || 250,
    ...overrides,
  });
}

/** Last 4 characters only — enough to tell two tokens apart, useless if leaked. */
export function tokenFingerprint(): string | null {
  const token = process.env.BOLDTRAIL_API_TOKEN;
  return token ? `…${token.slice(-4)}` : null;
}
