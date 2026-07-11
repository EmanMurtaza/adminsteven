import { NextRequest, NextResponse } from "next/server";

// Browser origins allowed to call the public listings API. Prod site + local
// Vite dev by default; extend with CORS_ALLOWED_ORIGINS (comma-separated) in
// Vercel if the site ever moves or gets a custom domain.
const DEFAULT_ORIGINS = [
  "https://stevenmoning.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

const ALLOWED = new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
]);

// Reflect the request Origin only when it's on the allowlist; otherwise fall
// back to the canonical prod origin. `Vary: Origin` keeps caches correct.
export function withCors(res: NextResponse, req: NextRequest, methods: string): NextResponse {
  const origin = req.headers.get("origin");
  res.headers.set("Access-Control-Allow-Origin", origin && ALLOWED.has(origin) ? origin : DEFAULT_ORIGINS[0]);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", methods);
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  return res;
}
