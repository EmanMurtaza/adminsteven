import Header from "@/components/layout/Header";
import ListingForm from "@/components/listings/ListingForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { ListingInsert } from "@/lib/types";
import { revalidatePath } from "next/cache";

export default function NewListingPage() {
  async function createListing(data: ListingInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("properties").insert(data);
    if (!error) {
      revalidatePath("/listings");
      revalidatePath("/dashboard");
    }
    return { error: error?.message };
  }

  return (
    <>
      <Header title="New Listing" />
      <main className="p-4 sm:p-8">
        <ListingForm onSubmit={createListing} />
      </main>
    </>
  );
}
