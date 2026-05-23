import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: listing } = await supabase.from("listings").select("*").eq("id", id).single();

  if (!listing) notFound();

  return (
    <>
      <Header title={listing.title} />
      <main className="p-6 max-w-2xl space-y-5">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <Row label="Title" value={listing.title} />
          <Row label="Category" value={listing.category ?? "—"} />
          <Row label="Price" value={listing.price != null ? `$${listing.price.toLocaleString()}` : "—"} />
          <Row label="Status" value={listing.status} />
          <Row label="Description" value={listing.description ?? "—"} />
          <Row label="Created" value={new Date(listing.created_at).toLocaleString()} />
        </div>

        <div className="flex gap-3">
          <Link
            href={`/listings/${id}/edit`}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            Edit
          </Link>
          <Link
            href="/listings"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Back
          </Link>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="w-28 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
