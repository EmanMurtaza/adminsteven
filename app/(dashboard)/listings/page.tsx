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
    return <p className="p-6 text-red-500">Failed to load listings: {error.message}</p>;
  }

  return (
    <>
      <Header title="Listings" />
      <main className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{listings?.length ?? 0} total</p>
          <Link
            href="/listings/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + New Listing
          </Link>
        </div>
        <ListingsTable listings={listings ?? []} />
      </main>
    </>
  );
}
