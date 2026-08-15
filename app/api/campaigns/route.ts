import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors } from "@/lib/cors";

const cors = (res: NextResponse, req: NextRequest) => withCors(res, req, "GET, POST, OPTIONS");

const PUBLIC_COLUMNS =
  "id, headline, body, media_url, media_type, cta_text, cta_url, priority, display_delay_seconds, frequency, starts_at, ends_at, status, created_at, updated_at";

export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), req);
}

// GET /api/campaigns — called by the main website to fetch campaigns to show
// as a popup. Same shape as /api/listings and /api/blog: {data, count},
// status/limit/offset query params. `live=false` turns off the start/end
// date-window filter (on by default) so the admin panel can preview
// everything, not just what's eligible to show right now.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "published";
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const live = searchParams.get("live") !== "false";

  const supabase = await createServiceClient();
  let query = supabase
    .from("campaigns")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .eq("status", status)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (live) {
    const nowIso = new Date().toISOString();
    query = query
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`);
  }

  const { data, error, count } = await query;

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 500 }), request);
  }

  return cors(NextResponse.json({ data: data ?? [], count }), request);
}

// POST /api/campaigns — create a campaign (internal admin use, protected by API key)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("campaigns").insert(body).select().single();

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }), request);
  }

  return cors(NextResponse.json({ data }, { status: 201 }), request);
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
