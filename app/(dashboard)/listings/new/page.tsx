import Header from "@/components/layout/Header";
import ListingForm from "@/components/listings/ListingForm";
import { createClient } from "@/lib/supabase/server";
import { ListingInsert } from "@/lib/types";

export default function NewListingPage() {
  async function createListing(data: ListingInsert) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.from("listings").insert(data);
    return { error: error?.message };
  }

  return (
    <>
      <Header title="New Listing" />
      <main className="p-8">
        <ListingForm onSubmit={createListing} />
      </main>
    </>
  );
}
