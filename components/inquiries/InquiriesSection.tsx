import Header from "@/components/layout/Header";
import InquiriesTable from "@/components/inquiries/InquiriesTable";
import Pagination from "@/components/ui/Pagination";
import { FilterBar, SearchField, SelectField } from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Inquiry } from "@/lib/inquiries";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 10;

const READ_STATES = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

// Shared implementation behind the dedicated /inquiries/buyers and
// /inquiries/sellers sections. Each renders only its own lead type.
export default async function InquiriesSection({
  source,
  title,
  basePath,
  searchParams,
}: {
  source: "buyer" | "seller";
  title: string;
  basePath: string;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Private lead records — RLS blocks the anon key, so read via service role
  // after confirming an admin is signed in.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const q = str(searchParams.q)?.trim();
  const read = READ_STATES.some((r) => r.value === str(searchParams.read))
    ? str(searchParams.read)
    : undefined;
  const period = PERIODS.some((p) => p.value === str(searchParams.period))
    ? str(searchParams.period)
    : undefined;
  const page = Math.max(1, Number(str(searchParams.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const isFiltered = Boolean(q || read || period);

  let query = supabase
    .from("contact_submissions")
    .select("id, name, email, phone, message, source, is_read, created_at", {
      count: "exact",
    })
    .eq("source", source)
    .order("created_at", { ascending: false });

  if (read) query = query.eq("is_read", read === "read");
  if (period) {
    const since = new Date();
    since.setDate(since.getDate() - Number(period));
    query = query.gte("created_at", since.toISOString());
  }
  if (q) {
    // Strip the characters PostgREST uses to delimit or() alternatives so a
    // comma in the search box cannot split into bogus conditions.
    const like = `%${q.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `name.ilike.${like},email.ilike.${like},phone.ilike.${like},message.ilike.${like}`
    );
  }

  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <>
        <Header title={title} />
        <p className="p-4 sm:p-8 text-burgundy">
          Failed to load {title.toLowerCase()}: {error.message}
        </p>
      </>
    );
  }

  const inquiries = (data ?? []) as Inquiry[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const noun = (count ?? 0) === 1 ? title.replace(/s$/, "").toLowerCase() : title.toLowerCase();

  async function setRead(id: string, isRead: boolean) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase
      .from("contact_submissions")
      .update({ is_read: isRead })
      .eq("id", id);
    revalidatePath(basePath);
    revalidatePath("/dashboard");
    return { error: error?.message };
  }

  async function deleteInquiry(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase
      .from("contact_submissions")
      .delete()
      .eq("id", id);
    revalidatePath(basePath);
    revalidatePath("/dashboard");
    return { error: error?.message };
  }

  return (
    <>
      <Header title={title} />
      <main className="p-4 sm:p-8 space-y-5">
        <FilterBar action={basePath} isFiltered={isFiltered}>
          <SearchField
            defaultValue={q}
            placeholder="Search name, email, phone or message…"
          />
          <SelectField
            name="read"
            value={read}
            anyLabel="Read & unread"
            options={READ_STATES}
          />
          <SelectField
            name="period"
            value={period}
            anyLabel="Any time"
            options={PERIODS}
          />
        </FilterBar>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{count ?? 0}</span> {noun}
          {isFiltered ? " matching your filters" : " total"}
          {totalPages > 1 && (
            <span className="text-ink-mute/70">
              {" "}
              · page {page} of {totalPages}
            </span>
          )}
        </p>

        {(count ?? 0) === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">
              No {title.toLowerCase()} match these filters.
            </p>
            <Link
              href={basePath}
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <InquiriesTable
            inquiries={inquiries}
            onToggleRead={setRead}
            onDelete={deleteInquiry}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath={basePath}
          extraParams={{ q, read, period }}
        />
      </main>
    </>
  );
}
