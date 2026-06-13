import Header from "@/components/layout/Header";
import ListingForm from "@/components/listings/ListingForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { ListingInsert } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");
  const { data: listing } = await supabase.from("properties").select("*").eq("id", id).single();

  if (!listing) notFound();

  async function updateListing(data: ListingInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("properties").update(data).eq("id", id);
    if (!error) {
      revalidatePath("/listings");
      revalidatePath(`/listings/${id}`);
      revalidatePath("/dashboard");
    }
    return { error: error?.message };
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
