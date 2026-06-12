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

// GET /api/blog — fetch published blog posts for the main website
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "published";
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const tag = searchParams.get("tag");

  const supabase = await createServiceClient();
  let query = supabase
    .from("blogs")
    .select("id, title, slug, author, excerpt, cover_image, tags, status, published_at, created_at, updated_at")
    .eq("status", status)
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (tag) query = query.contains("tags", [tag]);

  const { data, error, count } = await query;

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return cors(NextResponse.json({ data, count }));
}

// POST /api/blog — create a post (admin only)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const body = await request.json();
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("blogs").insert(body).select().single();

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 400 }));
  }

  return cors(NextResponse.json({ data }, { status: 201 }));
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
