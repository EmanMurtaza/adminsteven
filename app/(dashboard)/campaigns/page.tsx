import Header from "@/components/layout/Header";
import CampaignsTable from "@/components/campaigns/CampaignsTable";
import { FilterBar, SearchField, SelectField } from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import {
  Campaign,
  CAMPAIGN_STATUSES,
  CAMPAIGN_FREQUENCIES,
  isLiveNow,
} from "@/lib/campaigns";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const WINDOWS = [
  { value: "live", label: "Live right now" },
  { value: "scheduled", label: "Scheduled (not yet started)" },
  { value: "ended", label: "Ended" },
];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function windowOf(c: Campaign, now: Date): string {
  if (c.starts_at && new Date(c.starts_at) > now) return "scheduled";
  if (c.ends_at && new Date(c.ends_at) < now) return "ended";
  return isLiveNow(c, now) ? "live" : "";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const q = str(params.q)?.trim();
  const status = CAMPAIGN_STATUSES.some((s) => s.value === str(params.status))
    ? str(params.status)
    : undefined;
  const frequency = CAMPAIGN_FREQUENCIES.some((f) => f.value === str(params.frequency))
    ? str(params.frequency)
    : undefined;
  const timing = WINDOWS.some((w) => w.value === str(params.timing))
    ? str(params.timing)
    : undefined;

  const isFiltered = Boolean(q || status || frequency || timing);

  let query = supabase
    .from("campaigns")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (frequency) query = query.eq("frequency", frequency);
  if (q) {
    const like = `%${q.replace(/[,()]/g, " ")}%`;
    query = query.or(`title.ilike.${like},headline.ilike.${like},body.ilike.${like}`);
  }

  const { data, error } = await query;

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

  const now = new Date();
  const all = (data ?? []) as Campaign[];
  // The live/scheduled/ended window depends on start and end dates compared to
  // "now", which is exactly what isLiveNow already encodes — filter in JS to
  // reuse that rule rather than restating it as SQL that could drift from it.
  const campaigns = timing ? all.filter((c) => windowOf(c, now) === timing) : all;
  const live = campaigns.filter((c) => isLiveNow(c, now)).length;

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
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <FilterBar action="/campaigns" isFiltered={isFiltered}>
            <SearchField
              defaultValue={q}
              placeholder="Search name, headline or body…"
            />
            <SelectField
              name="status"
              value={status}
              anyLabel="Any status"
              options={CAMPAIGN_STATUSES}
            />
            <SelectField
              name="timing"
              value={timing}
              anyLabel="Any schedule"
              options={WINDOWS}
            />
            <SelectField
              name="frequency"
              value={frequency}
              anyLabel="Any frequency"
              options={CAMPAIGN_FREQUENCIES}
            />
          </FilterBar>

          <Link
            href="/campaigns/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 shrink-0"
          >
            <span>+ New Campaign</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{live}</span>{" "}
          {live === 1 ? "campaign" : "campaigns"} live on the website right now
          {isFiltered && (
            <>
              {" "}
              · showing{" "}
              <span className="font-serif text-navy text-base">{campaigns.length}</span>{" "}
              {campaigns.length === 1 ? "match" : "matches"}
            </>
          )}
        </p>

        {campaigns.length === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No campaigns match these filters.</p>
            <Link
              href="/campaigns"
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <CampaignsTable
            campaigns={campaigns}
            onDelete={deleteCampaign}
            onSetStatus={setStatus}
          />
        )}
      </main>
    </>
  );
}
