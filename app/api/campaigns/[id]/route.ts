import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { withCors } from "@/lib/cors";

const cors = (res: NextResponse, req: NextRequest) =>
  withCors(res, req, "GET, PUT, DELETE, OPTIONS");

const PUBLIC_COLUMNS =
  "id, headline, body, media_url, media_type, cta_text, cta_url, priority, display_delay_seconds, frequency, starts_at, ends_at, status, created_at, updated_at";

export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), req);
}

type Params = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id — public
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) {
    return cors(NextResponse.json({ error: "Not found" }, { status: 404 }), req);
  }

  return cors(NextResponse.json({ data }), req);
}

// PUT /api/campaigns/:id
export async function PUT(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }), request);
  }

  return cors(NextResponse.json({ data }), request);
}

// DELETE /api/campaigns/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const { id } = await params;
  const supabase = await createServiceClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }), request);
  }

  return cors(NextResponse.json({ success: true }), request);
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
