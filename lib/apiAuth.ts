import { timingSafeEqual } from "node:crypto";

// Shared auth for the API routes.
//
// Extracted because the same `x-api-key` check was copy-pasted across the
// listings, blog and campaign routes, and the sync route needs a second way in:
// Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET` and
// cannot be made to send a custom header.

/** Constant-time, and safe when the two strings differ in length. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so compare against a fixed-size digest of each instead.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The existing shared-secret header used by the public site's write calls. */
export function hasAdminApiKey(request: Request): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;
  const provided = request.headers.get("x-api-key");
  return provided !== null && safeEqual(provided, expected);
}

/** What Vercel Cron sends when CRON_SECRET is set as a project env var. */
export function hasCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), expected);
}

/**
 * Either credential is enough. Accepting the admin key as well as the cron
 * secret is deliberate: it means the endpoint can be triggered by hand with
 * curl using a secret that already exists, rather than needing a browser
 * session or a second setup step.
 */
export function isAuthorizedRequest(request: Request): boolean {
  return hasAdminApiKey(request) || hasCronSecret(request);
}
