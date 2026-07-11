import { NextRequest, NextResponse } from "next/server";
import { deleteListing, getListingById, updateListing } from "@/lib/listings";
import { withCors } from "@/lib/cors";

const cors = (res: NextResponse, req: NextRequest) => withCors(res, req, "GET, PUT, DELETE, OPTIONS");

export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), req);
}

type Params = { params: Promise<{ id: string }> };

// GET /api/listings/:id — public; strip private `meta` (see route.ts).
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const data = await getListingById(id);

  if (!data) {
    return cors(NextResponse.json({ error: "Not found" }, { status: 404 }), req);
  }

  const { meta: _meta, ...pub } = data;
  return cors(NextResponse.json({ data: pub }), req);
}

// PUT /api/listings/:id
export async function PUT(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const { id } = await params;
  const body = await request.json();

  try {
    const data = await updateListing(id, body);
    if (!data) {
      return cors(NextResponse.json({ error: "Not found" }, { status: 404 }), request);
    }
    return cors(NextResponse.json({ data }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return cors(NextResponse.json({ error: message }, { status: 400 }), request);
  }
}

// DELETE /api/listings/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAuthorized(request)) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const { id } = await params;
  const deleted = await deleteListing(id);

  if (!deleted) {
    return cors(NextResponse.json({ error: "Not found" }, { status: 404 }), request);
  }

  return cors(NextResponse.json({ success: true }), request);
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("x-api-key") === process.env.ADMIN_API_KEY;
}
