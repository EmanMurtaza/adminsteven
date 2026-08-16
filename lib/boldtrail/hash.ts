import { createHash } from "node:crypto";
import { LOCALLY_TRACKED_FIELDS } from "./policy";

// Fingerprints, used to answer two questions without spending an API request or
// keeping an audit log:
//
//   "has BoldTrail's copy changed since we last looked?"   → remoteFingerprint
//   "has Steven edited this since the last sync?"          → localFingerprint
//
// WHY NOT TIMESTAMPS FOR THE LOCAL SIDE
// The obvious approach — `contacts.updated_at > external_synced_at` — is a trap
// in this schema. `contacts_touch_updated_at` fires on EVERY update, including
// the sync's own writes, so immediately after a sync every row it touched looks
// locally edited. The next run would then push all of them, touch them again,
// and repeat forever. A content hash simply does not have that failure mode.

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Stable stringify: keys sorted, so two objects with the same content hash the
 * same regardless of key order. `JSON.stringify` alone does not guarantee that
 * across different construction paths.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Normalised so that cosmetic differences do not read as changes. Without this
 * a trailing space or a case change in an email would look like a real edit and
 * queue a pointless write on every run.
 */
function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed.toLowerCase();
  }
  if (Array.isArray(value)) {
    // Tag order is not meaningful; sort so a reorder is not a change.
    return [...value].map(normalizeValue).sort();
  }
  return value ?? null;
}

function fingerprint(source: Record<string, unknown>, fields: string[]): string {
  const subset: Record<string, unknown> = {};
  for (const field of fields) subset[field] = normalizeValue(source[field]);
  return sha256(canonical(subset));
}

/**
 * Fingerprint of our copy's two-way fields. Compared against the stored
 * `local_hash` — if they differ, Steven changed something here since the last
 * sync, and that edit must not be silently overwritten by theirs.
 */
export function localFingerprint(contact: Record<string, unknown>): string {
  return fingerprint(contact, LOCALLY_TRACKED_FIELDS);
}

/**
 * Fingerprint of their payload. Compared against the stored `remote_hash`.
 *
 * This is the backstop for their `updated_at`: if it is ever stale, wrong, or
 * not bumped for some class of edit, the hash still catches the change. Cheap,
 * since the list response we already fetched is the input.
 */
export function remoteFingerprint(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  return fingerprint(payload, keys);
}
