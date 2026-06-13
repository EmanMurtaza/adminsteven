import Header from "@/components/layout/Header";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");
  const { data: listing } = await supabase.from("properties").select("*").eq("id", id).single();

  if (!listing) notFound();

  return (
    <>
      <Header title={listing.title} />
      <main className="p-4 sm:p-8 max-w-3xl space-y-5 sm:space-y-6">
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
          <Row label="Title" value={listing.title} />
          <Row label="Type" value={listing.property_type?.replace("_", "-") ?? "—"} />
          <Row label="Status" value={listing.status} highlight />
          <Row
            label="Price"
            value={listing.price != null ? `$${Number(listing.price).toLocaleString()}` : "—"}
          />
          <Row
            label="Address"
            value={
              [listing.address, listing.city, listing.state, listing.zip_code]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row label="Neighborhood" value={listing.neighborhood ?? "—"} />
          <Row
            label="Beds / Baths"
            value={
              listing.bedrooms != null || listing.bathrooms != null
                ? `${listing.bedrooms ?? "—"} bd / ${listing.bathrooms ?? "—"} ba`
                : "—"
            }
          />
          <Row
            label="Square Feet"
            value={listing.square_footage != null ? listing.square_footage.toLocaleString() : "—"}
          />
          <Row label="Year Built" value={listing.year_built != null ? String(listing.year_built) : "—"} />
          <Row label="MLS #" value={listing.mls_number ?? "—"} />
          <Row label="Featured" value={listing.is_featured ? "Yes" : "No"} />
          <Row label="Description" value={listing.description ?? "—"} />
          <Row label="Created" value={new Date(listing.created_at).toLocaleString()} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/listings/${id}/edit`}
            className="bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <span>Edit</span>
            <span className="text-gold">›</span>
          </Link>
          <Link
            href="/listings"
            className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-5 py-2.5 rounded-md text-sm font-medium transition-colors text-center"
          >
            Back
          </Link>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 sm:items-start py-2 border-b border-gold/10 last:border-b-0">
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-[0.18em] text-ink-mute mb-1 sm:mb-0 sm:mt-1">
        {label}
      </span>
      <span
        className={
          highlight
            ? "text-sm font-semibold uppercase tracking-wider text-gold-dark"
            : "text-sm text-navy break-words"
        }
      >
        {value}
      </span>
    </div>
  );
}
