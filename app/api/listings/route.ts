import { NextRequest, NextResponse } from "next/server";
import { createListing, listListings } from "@/lib/listings";
import { withCors } from "@/lib/cors";
import { Listing, ListingStatus } from "@/lib/types";

const cors = (res: NextResponse, req: NextRequest) => withCors(res, req, "GET, POST, OPTIONS");

// `meta` holds private deal data (owner names, mailing addresses, parcel IDs,
// legal descriptions, holding entity). It must NEVER reach the public browser.
// Strip it from every public GET response — the authed admin reads full docs
// through lib/listings.ts directly, so this only affects the HTTP boundary.
function toPublic({ meta: _meta, ...rest }: Listing): Omit<Listing, "meta"> {
  return rest;
}

export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), req);
}

// GET /api/listings — called by the main website to fetch published listings
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // `type` preferred; `category` kept as an alias for older callers
  const propertyType = searchParams.get("type") ?? searchParams.get("category");
  const featured = searchParams.get("featured");
  const status = (searchParams.get("status") ?? "published") as ListingStatus;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  try {
    const { data, count } = await listListings({
      status,
      propertyType,
      featured: featured === "true",
      limit,
      offset,
    });
    return cors(NextResponse.json({ data: data.map(toPublic), count }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return cors(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

// POST /api/listings — create a listing (internal admin use, protected by API key)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const body = await request.json();
  try {
    const data = await createListing(body);
    return cors(NextResponse.json({ data }, { status: 201 }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return cors(NextResponse.json({ error: message }, { status: 400 }), request);
  }
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
