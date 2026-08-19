import Header from "@/components/layout/Header";
import ContactsTable from "@/components/contacts/ContactsTable";
import Pagination from "@/components/ui/Pagination";
import { FilterBar, SearchField } from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import {
  ALUMNI_EMAIL_FILTER,
  Contact,
  LEAD_TYPES,
  STAGES,
  applyColumnFilters,
  columnFilterParams,
  hasColumnFilters,
  multiParam,
  searchTerms,
} from "@/lib/contacts";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Alumni — contacts reachable at an alumni address.
//
// WHY ITS OWN SECTION RATHER THAN A TAG
// A tag is something somebody has to remember to apply, and it goes stale the
// moment an address changes. This segment is derived from the email itself, so
// it cannot drift: a contact is in this list exactly as long as their address
// says they are, and a new import joins it without anyone doing anything.
//
// See ALUMNI_EMAIL_FILTER in lib/contacts for what counts as an alumni domain
// and, more importantly, what deliberately does not.

const PAGE_SIZE = 25;

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AlumniPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const stage = multiParam(str(params.stage), STAGES);
  const leadType = multiParam(str(params.type), LEAD_TYPES);
  const search = str(params.q)?.trim();
  const tag = str(params.tag)?.trim();
  const page = Math.max(1, Number(str(params.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const columnFilters = {
    name: str(params.name)?.trim(),
    contact: str(params.contact)?.trim(),
    type: leadType,
    stage,
    location: str(params.location)?.trim(),
    source: str(params.source_q)?.trim(),
    tag,
    visited: str(params.visited),
    followed: str(params.followed),
    due: str(params.due),
  };

  const isFiltered = Boolean(search) || hasColumnFilters(columnFilters);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(
    new Date()
  );

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .or(ALUMNI_EMAIL_FILTER)
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  query = applyColumnFilters(query, columnFilters, today);
  for (const group of search ? searchTerms(search) : []) {
    query = query.or(group);
  }

  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  // The stage mix across the whole segment, not just this page — a count that
  // changed as you paged would be worse than no count at all.
  const { data: allRows } = await supabase
    .from("contacts")
    .select("stage, email_opt_in")
    .or(ALUMNI_EMAIL_FILTER);

  if (error) {
    return (
      <>
        <Header title="Alumni" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load alumni contacts</p>
            <p className="text-sm text-ink-soft">{error.message}</p>
          </div>
        </main>
      </>
    );
  }

  const contacts = (data ?? []) as Contact[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const rows = (allRows ?? []) as { stage: string; email_opt_in: boolean | null }[];
  const byStage = STAGES.map((s) => ({
    label: s.label,
    count: rows.filter((r) => r.stage === s.value).length,
  })).filter((s) => s.count > 0);
  // Only a definite false is a no. Null means BoldTrail never said, which is
  // not permission — see the note on email_opt_in in lib/contacts.
  const optedOut = rows.filter((r) => r.email_opt_in === false).length;

  async function updateContact(id: string, patch: Partial<Contact>) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").update(patch).eq("id", id);
    revalidatePath("/contacts/alumni");
    revalidatePath("/contacts");
    return { error: error?.message };
  }

  async function deleteContact(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    revalidatePath("/contacts/alumni");
    revalidatePath("/contacts");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Alumni" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-serif text-2xl text-navy">
                {count ?? 0}{" "}
                <span className="text-base text-ink-soft">
                  {count === 1 ? "alumni contact" : "alumni contacts"}
                </span>
              </p>
              <p className="text-sm text-ink-mute mt-1 max-w-2xl leading-relaxed">
                Everyone whose email sits on an alumni domain. The list is derived
                from the address itself, so it stays current on its own — nothing
                to tag and nothing to keep up to date.
              </p>
            </div>
            <Link
              href="/contacts"
              className="text-sm text-gold-dark hover:text-navy transition-colors shrink-0"
            >
              All contacts ›
            </Link>
          </div>

          {(byStage.length > 0 || optedOut > 0) && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gold/15">
              {byStage.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 text-xs bg-cream-100 border border-gold/25 rounded-full px-2.5 py-1"
                >
                  <span className="text-ink-soft">{s.label}</span>
                  <span className="text-navy font-medium tabular-nums">{s.count}</span>
                </span>
              ))}
              {/* Worth its own badge: this segment is the obvious one to email,
                  and the campaigns feature has to respect the opt-out. */}
              {optedOut > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-burgundy/10 border border-burgundy/25 text-burgundy rounded-full px-2.5 py-1">
                  {optedOut} opted out of email
                </span>
              )}
            </div>
          )}
        </div>

        <FilterBar
          action="/contacts/alumni"
          isFiltered={isFiltered}
          hidden={columnFilterParams(columnFilters)}
        >
          <SearchField
            defaultValue={search}
            placeholder="Search everything — name, email, phone, tag…"
          />
        </FilterBar>

        <p className="text-sm text-ink-mute">
          {totalPages > 1 ? (
            <>
              Showing{" "}
              <span className="font-serif text-navy text-base">
                {from + 1}–{from + contacts.length}
              </span>{" "}
              of <span className="font-serif text-navy text-base">{count ?? 0}</span>
            </>
          ) : (
            <>
              <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
              {count === 1 ? "contact" : "contacts"}
            </>
          )}
          {isFiltered && " matching your filters"}
        </p>

        {contacts.length === 0 ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">
              {isFiltered
                ? "No alumni contacts match these filters."
                : "No contacts on an alumni domain yet."}
            </p>
            {isFiltered && (
              <Link
                href="/contacts/alumni"
                className="text-sm text-gold-dark hover:text-navy transition-colors"
              >
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <>
            <ContactsTable
              contacts={contacts}
              onUpdate={updateContact}
              onDelete={deleteContact}
              columnFilters={columnFilters}
            />
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              basePath="/contacts/alumni"
              extraParams={{ q: search, ...columnFilterParams(columnFilters) }}
            />
          </>
        )}
      </main>
    </>
  );
}
