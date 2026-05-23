import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/listings/:id
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("listings").select("*").eq("id", id).single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

// PUT /api/listings/:id
export async function PUT(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/listings/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createServiceClient();
  const { error } = await supabase.from("listings").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

function isAuthorized(request: NextRequest): boolean {
  const key = request.headers.get("x-api-key");
  return key === process.env.ADMIN_API_KEY;
}
