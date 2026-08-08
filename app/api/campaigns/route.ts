import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors } from "@/lib/cors";

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), request, METHODS);
}

// GET /api/campaigns — the popup campaigns eligible to show right now, for
// the public site to render on page load. Date-window and priority logic
// lives here so the public site doesn't have to duplicate it.
export async function GET(request: NextRequest) {
  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, headline, body, image_url, cta_text, cta_url, priority, display_delay_seconds, frequency, starts_at, ends_at"
    )
    .eq("status", "published")
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }), request, METHODS);
  }

  return withCors(NextResponse.json({ data: data ?? [] }), request, METHODS);
}
