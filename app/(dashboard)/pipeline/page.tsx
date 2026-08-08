import Header from "@/components/layout/Header";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Contact, Stage } from "@/lib/contacts";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A board only makes sense over a bounded set of cards — this is a working
// pipeline for one agent's active leads, not a full-table export. Use
// /contacts (with its search and pagination) for the complete list.
const BOARD_LIMIT = 500;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "buyer", label: "Buyers" },
  { key: "seller", label: "Sellers" },
  { key: "investor", label: "Investors" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const rawFilter = str(params.type);
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter)
    ? (rawFilter as FilterKey)
    : "all";

  let query = supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, BOARD_LIMIT - 1);

  if (filter === "buyer") query = query.or("lead_type.eq.buyer,lead_type.eq.both");
  else if (filter === "seller") query = query.or("lead_type.eq.seller,lead_type.eq.both");
  else if (filter === "investor") query = query.eq("lead_type", "investor");

  const { data, error } = await query;

  async function moveContactStage(id: string, stage: Stage): Promise<{ error?: string }> {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").update({ stage }).eq("id", id);
    revalidatePath("/pipeline");
    revalidatePath("/contacts");
    return { error: error?.message };
  }

  if (error) {
    const missing = error.message.includes("contacts");
    return (
      <>
        <Header title="Pipeline" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load the pipeline</p>
            <p className="text-sm text-ink-soft mb-3">{error.message}</p>
            {missing && (
              <p className="text-sm text-ink-soft">
                Apply{" "}
                <code className="bg-cream-200 px-1.5 py-0.5 rounded text-xs">
                  supabase/create_contacts_crm.sql
                </code>{" "}
                in the Supabase SQL editor first.
              </p>
            )}
          </div>
        </main>
      </>
    );
  }

  const contacts = (data ?? []) as Contact[];

  return (
    <>
      <Header title="Pipeline" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? "/pipeline" : `/pipeline?type=${f.key}`}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  f.key === filter
                    ? "bg-navy text-cream border-navy"
                    : "bg-white text-ink-soft border-gold/30 hover:border-gold hover:text-navy"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">{contacts.length}</span>{" "}
            {contacts.length === 1 ? "lead" : "leads"} on the board
            {contacts.length === BOARD_LIMIT && " (showing most recent — use Contacts to search all)"}
          </p>
        </div>

        <PipelineBoard key={filter} contacts={contacts} onMove={moveContactStage} />
      </main>
    </>
  );
}
