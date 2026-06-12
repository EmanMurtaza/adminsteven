import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const CORS_ORIGIN = "https://stevenmoning.vercel.app";

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

// GET /api/listings — called by the main website to fetch published listings
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // `type` preferred; `category` kept as an alias for older callers
  const propertyType = searchParams.get("type") ?? searchParams.get("category");
  const featured = searchParams.get("featured");
  const status = searchParams.get("status") ?? "published";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const supabase = await createServiceClient();
  let query = supabase
    .from("properties")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (propertyType) query = query.eq("property_type", propertyType);
  if (featured === "true") query = query.eq("is_featured", true);

  const { data, error, count } = await query;

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return cors(NextResponse.json({ data, count }));
}

// POST /api/listings — create a listing (internal admin use, protected by API key)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("properties").insert(body).select().single();

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }));
  }

  return cors(NextResponse.json({ data }, { status: 201 }));
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
