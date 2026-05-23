import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/listings — called by the main website to fetch published listings
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const status = searchParams.get("status") ?? "published";
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  const supabase = await createServiceClient();
  let query = supabase
    .from("listings")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}

// POST /api/listings — create a listing (internal admin use, protected by API key)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("listings").insert(body).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

function isAuthorized(request: NextRequest): boolean {
  const key = request.headers.get("x-api-key");
  return key === process.env.ADMIN_API_KEY;
}
