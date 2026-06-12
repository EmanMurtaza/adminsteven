import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const CORS_ORIGIN = "https://stevenmoning.vercel.app";

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

type Params = { params: Promise<{ id: string }> };

// GET /api/listings/:id
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).single();

  if (error || !data) {
    return cors(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }

  return cors(NextResponse.json({ data }));
}

// PUT /api/listings/:id
export async function PUT(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }));
  }

  return cors(NextResponse.json({ data }));
}

// DELETE /api/listings/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const { id } = await params;
  const supabase = await createServiceClient();
  const { error } = await supabase.from("properties").delete().eq("id", id);

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }));
  }

  return cors(NextResponse.json({ success: true }));
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
