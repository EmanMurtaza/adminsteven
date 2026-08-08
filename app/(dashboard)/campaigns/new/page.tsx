import Header from "@/components/layout/Header";
import CampaignForm from "@/components/campaigns/CampaignForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { CampaignInsert } from "@/lib/campaigns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function NewCampaignPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  async function createCampaign(data: CampaignInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("campaigns").insert(data);
    revalidatePath("/campaigns");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="New Campaign" />
      <main className="p-4 sm:p-8">
        <CampaignForm onSubmit={createCampaign} />
      </main>
    </>
  );
}
