import Header from "@/components/layout/Header";
import ListingForm from "@/components/listings/ListingForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { createListing as createListingDoc } from "@/lib/listings";
import { ListingInsert } from "@/lib/types";
import { revalidatePath } from "next/cache";

export default function NewListingPage() {
  async function createListing(data: ListingInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    try {
      await createListingDoc(data);
      revalidatePath("/listings");
      revalidatePath("/dashboard");
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error" };
    }
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
