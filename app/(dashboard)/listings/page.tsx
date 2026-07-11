import Header from "@/components/layout/Header";
import ListingsTable from "@/components/listings/ListingsTable";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { deleteListing as deleteListingDoc, listListings } from "@/lib/listings";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function ListingsPage() {
  // Auth still gated by Supabase; the listings themselves now live in MongoDB.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  let listings;
  try {
    ({ data: listings } = await listListings({}));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load listings: {message}
      </p>
    );
  }

  async function deleteListing(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const deleted = await deleteListingDoc(id);
    revalidatePath("/listings");
    revalidatePath("/dashboard");
    return deleted ? {} : { error: "Listing not found" };
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
        <ListingsTable listings={listings ?? []} onDelete={deleteListing} />
      </main>
    </>
  );
}
