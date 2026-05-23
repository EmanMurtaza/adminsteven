import Header from "@/components/layout/Header";
import ListingsTable from "@/components/listings/ListingsTable";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ListingsPage() {
  const supabase = await createClient();
  const { data: listings, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load listings: {error.message}
      </p>
    );
  }

  return (
    <>
      <Header title="Listings" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">
              {listings?.length ?? 0}
            </span>{" "}
            total
          </p>
          <Link
            href="/listings/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <span>+ New Listing</span>
            <span className="text-gold">›</span>
          </Link>
        </div>
        <ListingsTable listings={listings ?? []} />
      </main>
    </>
  );
}
