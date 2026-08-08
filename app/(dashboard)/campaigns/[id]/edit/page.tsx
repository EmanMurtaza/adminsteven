import Header from "@/components/layout/Header";
import CampaignForm from "@/components/campaigns/CampaignForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Campaign, CampaignInsert } from "@/lib/campaigns";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();

  if (!data) notFound();
  const campaign = data as Campaign;

  async function updateCampaign(values: CampaignInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("campaigns").update(values).eq("id", id);
    revalidatePath("/campaigns");
    return { error: error?.message };
  }

  return (
    <>
      <Header title={`Edit — ${campaign.title}`} />
      <main className="p-4 sm:p-8">
        <CampaignForm initialData={campaign} onSubmit={updateCampaign} />
      </main>
    </>
  );
}
