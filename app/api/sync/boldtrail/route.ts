import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedRequest } from "@/lib/apiAuth";
import { pullContacts, remapStoredDetails } from "@/lib/boldtrail/sync";

// Scheduled BoldTrail pull.
//
// Called by Vercel Cron once a day (see vercel.json) with
// `Authorization: Bearer $CRON_SECRET`, or by hand with the existing
// `x-api-key` header.
//
// NOTE: /api/sync is in the public-prefix list in proxy.ts. It has to be —
// otherwise this unauthenticated-by-session request gets a 302 to /login,
// which Vercel Cron records as a successful run while nothing happens.

/** Serverless ceiling. 300s needs a Pro plan; Hobby caps at 60. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Leave headroom so the run stops itself rather than being killed mid-write. */
const BUDGET_MS = (maxDuration - 20) * 1000;

async function handle(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: there is no user session on a cron call, and the sync writes
  // to `contacts`, which has RLS on with no policies.
  const supabase = await createServiceClient();

  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dry") === "1";

  // Re-derive columns from payloads already stored locally. No API calls, so it
  // is safe to run any time — after adding a column, or fixing a mapping.
  if (params.get("remap") === "1") {
    const outcome = await remapStoredDetails(supabase);
    return NextResponse.json({ status: outcome.error ? "failed" : "ok", ...outcome });
  }

  try {
    const result = await pullContacts(supabase, {
      mode: "cron",
      dryRun,
      budgetMs: BUDGET_MS,
    });

    // A skipped or failed run is still a completed HTTP request. Returning a
    // non-200 would make Vercel retry, which for a lockout is the exact wrong
    // response — the body carries the real outcome.
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handle(request);
}

/** Vercel Cron issues a GET. */
export async function GET(request: Request) {
  return handle(request);
}
