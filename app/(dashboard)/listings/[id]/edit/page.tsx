import Header from "@/components/layout/Header";
import ListingForm from "@/components/listings/ListingForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { getListingById, updateListing as updateListingDoc } from "@/lib/listings";
import { ListingInsert } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");
  const listing = await getListingById(id);

  if (!listing) notFound();

  async function updateListing(data: ListingInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    try {
      const updated = await updateListingDoc(id, data);
      if (!updated) return { error: "Listing not found" };
      revalidatePath("/listings");
      revalidatePath(`/listings/${id}`);
      revalidatePath("/dashboard");
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  return (
    <>
      <Header title={`Edit: ${listing.title}`} />
      <main className="p-4 sm:p-8">
        <ListingForm initialData={listing} onSubmit={updateListing} />
      </main>
    </>
  );
}
