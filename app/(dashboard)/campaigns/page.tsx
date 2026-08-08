import Header from "@/components/layout/Header";
import CampaignsTable from "@/components/campaigns/CampaignsTable";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Campaign, isLiveNow } from "@/lib/campaigns";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function CampaignsPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    const missing = error.message.includes("campaigns");
    return (
      <>
        <Header title="Campaigns" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load campaigns</p>
            <p className="text-sm text-ink-soft mb-3">{error.message}</p>
            {missing && (
              <p className="text-sm text-ink-soft">
                If this is the first run, the table does not exist yet — apply{" "}
                <code className="bg-cream-200 px-1.5 py-0.5 rounded text-xs">
                  supabase/create_campaigns.sql
                </code>{" "}
                in the Supabase SQL editor.
              </p>
            )}
          </div>
        </main>
      </>
    );
  }

  const campaigns = (data ?? []) as Campaign[];
  const live = campaigns.filter((c) => isLiveNow(c)).length;

  async function deleteCampaign(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    revalidatePath("/campaigns");
    return { error: error?.message };
  }

  async function setStatus(id: string, status: Campaign["status"]) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
    revalidatePath("/campaigns");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Campaigns" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">{live}</span>{" "}
            {live === 1 ? "campaign" : "campaigns"} live on the website right now
          </p>
          <Link
            href="/campaigns/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <span>+ New Campaign</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <CampaignsTable campaigns={campaigns} onDelete={deleteCampaign} onSetStatus={setStatus} />
      </main>
    </>
  );
}
