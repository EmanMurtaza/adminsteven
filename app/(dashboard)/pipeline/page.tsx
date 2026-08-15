import Header from "@/components/layout/Header";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import {
  FilterBar,
  FilterTabs,
  SearchField,
  SelectField,
  queryString,
} from "@/components/ui/FilterBar";
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

// Stage is the board itself, so it is not offered here — what is useful on top
// of the columns is who is overdue and who is going cold.
const FOLLOW_UPS = [
  { value: "due", label: "Follow-up due" },
  { value: "upcoming", label: "Follow-up scheduled" },
  { value: "none", label: "No follow-up set" },
];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(
    new Date()
  );
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
  const followUp = FOLLOW_UPS.some((f) => f.value === str(params.follow))
    ? str(params.follow)
    : undefined;
  const search = str(params.q)?.trim();

  const isFiltered = Boolean(followUp || search);
  const today = todayISO();

  let query = supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, BOARD_LIMIT - 1);

  if (filter === "buyer") query = query.or("lead_type.eq.buyer,lead_type.eq.both");
  else if (filter === "seller") query = query.or("lead_type.eq.seller,lead_type.eq.both");
  else if (filter === "investor") query = query.eq("lead_type", "investor");

  if (followUp === "due") query = query.lte("next_follow_up", today);
  else if (followUp === "upcoming") query = query.gt("next_follow_up", today);
  else if (followUp === "none") query = query.is("next_follow_up", null);

  if (search) {
    const like = `%${search.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`
    );
  }

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
          <FilterTabs
            tabs={FILTERS}
            active={filter}
            href={(key) =>
              queryString("/pipeline", {
                type: key === "all" ? undefined : key,
                follow: followUp,
                q: search,
              })
            }
          />
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">{contacts.length}</span>{" "}
            {contacts.length === 1 ? "lead" : "leads"} on the board
            {contacts.length === BOARD_LIMIT && " (showing most recent — use Contacts to search all)"}
          </p>
        </div>

        <FilterBar
          action="/pipeline"
          isFiltered={isFiltered}
          hidden={{ type: filter === "all" ? undefined : filter }}
        >
          <SearchField
            defaultValue={search}
            placeholder="Search name, email or phone…"
          />
          <SelectField
            name="follow"
            value={followUp}
            anyLabel="Any follow-up"
            options={FOLLOW_UPS}
          />
        </FilterBar>

        {contacts.length === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No leads match these filters.</p>
            <Link
              href={queryString("/pipeline", {
                type: filter === "all" ? undefined : filter,
              })}
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          // Re-key on the filters so the board's local drag state resets when
          // the underlying set of cards changes.
          <PipelineBoard
            key={`${filter}:${followUp ?? ""}:${search ?? ""}`}
            contacts={contacts}
            onMove={moveContactStage}
          />
        )}
      </main>
    </>
  );
}
