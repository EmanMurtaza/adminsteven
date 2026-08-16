import type { SupabaseClient } from "@supabase/supabase-js";

// Small typed wrapper over the `sync_state` key/value table.
//
// This is what stops the sync being chatty: the last-run timestamp and the
// lockout deadline both live here, and both are consulted BEFORE any client is
// constructed, so a run that should not happen costs a single Postgres read and
// zero API requests.

const KEYS = {
  lastPullAt: "boldtrail:last_pull_at",
  lockedUntil: "boldtrail:locked_until",
  capabilities: "boldtrail:capabilities",
  tokenFingerprint: "boldtrail:token_fingerprint",
} as const;

type Client = SupabaseClient;

async function readValue<T>(supabase: Client, key: string): Promise<T | null> {
  const { data } = await supabase.from("sync_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

async function writeValue(supabase: Client, key: string, value: unknown): Promise<void> {
  await supabase.from("sync_state").upsert({ key, value }, { onConflict: "key" });
}

// ── Minimum interval between runs ────────────────────────────────────────────

export async function getLastPullAt(supabase: Client): Promise<Date | null> {
  const value = await readValue<{ at?: string }>(supabase, KEYS.lastPullAt);
  if (!value?.at) return null;
  const parsed = new Date(value.at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function setLastPullAt(supabase: Client, when = new Date()): Promise<void> {
  await writeValue(supabase, KEYS.lastPullAt, { at: when.toISOString() });
}

/** Milliseconds still to wait, or 0 when a run is allowed. */
export async function millisUntilAllowed(supabase: Client, minIntervalMs: number): Promise<number> {
  const last = await getLastPullAt(supabase);
  if (!last) return 0;
  const elapsed = Date.now() - last.getTime();
  return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}

// ── Lockout circuit breaker ──────────────────────────────────────────────────
// A lockout must never be answered with more traffic. Once tripped, every run —
// scheduled or manual — returns without opening a socket until it expires.

/** How long to stand down after a lockout. Longer than any observed recovery. */
export const LOCKOUT_BACKOFF_MS = 60 * 60 * 1000;

export async function getLockedUntil(supabase: Client): Promise<Date | null> {
  const value = await readValue<{ until?: string }>(supabase, KEYS.lockedUntil);
  if (!value?.until) return null;
  const parsed = new Date(value.until);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return null;
  return parsed;
}

export async function tripLockout(supabase: Client, backoffMs = LOCKOUT_BACKOFF_MS): Promise<Date> {
  const until = new Date(Date.now() + backoffMs);
  await writeValue(supabase, KEYS.lockedUntil, { until: until.toISOString() });
  return until;
}

export async function clearLockout(supabase: Client): Promise<void> {
  await writeValue(supabase, KEYS.lockedUntil, {});
}

// ── Token identity ───────────────────────────────────────────────────────────
// Last 4 characters only. Enough to notice the token was swapped, useless to
// anyone who reads the table.

export async function getTokenFingerprint(supabase: Client): Promise<string | null> {
  const value = await readValue<{ fingerprint?: string }>(supabase, KEYS.tokenFingerprint);
  return value?.fingerprint ?? null;
}

export async function setTokenFingerprint(supabase: Client, fingerprint: string): Promise<void> {
  await writeValue(supabase, KEYS.tokenFingerprint, { fingerprint, seen_at: new Date().toISOString() });
}

// ── Probe capabilities ───────────────────────────────────────────────────────

export async function getCapabilities(supabase: Client): Promise<Record<string, unknown> | null> {
  return readValue<Record<string, unknown>>(supabase, KEYS.capabilities);
}

export async function setCapabilities(supabase: Client, report: unknown): Promise<void> {
  await writeValue(supabase, KEYS.capabilities, report);
}

export { KEYS as SYNC_STATE_KEYS };
