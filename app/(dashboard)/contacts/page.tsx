import Header from "@/components/layout/Header";
import ContactsTable from "@/components/contacts/ContactsTable";
import AddContactModal, { NewContactInput } from "@/components/dashboard/AddContactModal";
import Pagination from "@/components/ui/Pagination";
import {
  FilterBar,
  FilterTabs,
  SearchField,
  SelectField,
  queryString,
} from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Contact, LEAD_TYPES, STAGES } from "@/lib/contacts";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 25;

const VIEWS = [
  { key: "all", label: "All" },
  { key: "due", label: "Follow up due" },
  { key: "buyer", label: "Buyers" },
  { key: "seller", label: "Sellers" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

// The three ways a contact gets here — see the import actions below.
const SOURCES = [
  { value: "website", label: "Website form" },
  { value: "csv", label: "CSV import" },
  { value: "manual", label: "Added by hand" },
];

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Steven's private client list — no anon access at all, so this reads through
  // the service role after confirming a signed-in admin.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const rawView = str(params.view);
  const view: ViewKey = VIEWS.some((v) => v.key === rawView) ? (rawView as ViewKey) : "all";
  const stage = STAGES.some((s) => s.value === str(params.stage))
    ? str(params.stage)
    : undefined;
  // The tabs cover buyers and sellers; this reaches the rest (investor, both).
  const leadType = LEAD_TYPES.some((t) => t.value === str(params.type))
    ? str(params.type)
    : undefined;
  const source = SOURCES.some((s) => s.value === str(params.source))
    ? str(params.source)
    : undefined;
  const search = str(params.q)?.trim();
  const page = Math.max(1, Number(str(params.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const today = todayISO();

  const isFiltered = Boolean(stage || leadType || source || search);

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    // Whoever is due soonest comes first; contacts with no date sort last.
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (view === "due") query = query.lte("next_follow_up", today);
  else if (view === "buyer") query = query.or("lead_type.eq.buyer,lead_type.eq.both");
  else if (view === "seller") query = query.or("lead_type.eq.seller,lead_type.eq.both");

  if (stage) query = query.eq("stage", stage);
  if (leadType) query = query.eq("lead_type", leadType);
  if (source) query = query.eq("source", source);
  if (search) {
    // Strip the delimiters PostgREST uses inside or() so a comma or bracket in
    // the search box cannot split into bogus conditions.
    const like = `%${search.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`
    );
  }

  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    const missing = error.message.includes("contacts");
    return (
      <>
        <Header title="Contacts" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load contacts</p>
            <p className="text-sm text-ink-soft mb-3">{error.message}</p>
            {missing && (
              <p className="text-sm text-ink-soft">
                If this is the first run, the table does not exist yet — apply{" "}
                <code className="bg-cream-200 px-1.5 py-0.5 rounded text-xs">
                  supabase/create_contacts_crm.sql
                </code>{" "}
                in the Supabase SQL editor.
              </p>
            )}
          </div>
        </main>
      </>
    );
  }

  const contacts = (data ?? []) as Contact[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  async function updateContact(id: string, patch: Partial<Contact>) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").update(patch).eq("id", id);
    revalidatePath("/contacts");
    return { error: error?.message };
  }

  // Typed in by hand — the third way a lead arrives, alongside the CSV import
  // and the website forms. Same action the dashboard uses.
  async function createContact(input: NewContactInput): Promise<{ error?: string }> {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();
    if (!email && !phone) return { error: "Add an email or phone number." };

    const { error } = await supabase.from("contacts").insert({
      first_name: input.first_name.trim() || null,
      last_name: input.last_name.trim() || null,
      email: email || null,
      phone: phone || null,
      lead_type: input.lead_type,
      stage: input.stage,
      source: input.source.trim() || "manual",
      notes: input.notes.trim() || null,
    });

    if (error) {
      // contacts_email_unique — a friendlier message than the raw constraint name.
      if (error.code === "23505") return { error: "A contact with that email already exists." };
      return { error: error.message };
    }

    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/pipeline");
    return {};
  }

  async function deleteContact(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    revalidatePath("/contacts");
    return { error: error?.message };
  }

  // Pull website enquiries that have not become contacts yet. Matching on
  // submission_id keeps this idempotent — running it twice adds nothing.
  // Returns void: it is wired straight to a <form action>, which requires it.
  async function importFromWebsite(): Promise<void> {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return;

    const [{ data: submissions }, { data: existing }] = await Promise.all([
      supabase
        .from("contact_submissions")
        .select("id, name, email, phone, source, message, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("contacts").select("submission_id, email"),
    ]);

    const doneIds = new Set((existing ?? []).map((c) => c.submission_id).filter(Boolean));
    const doneEmails = new Set(
      (existing ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean)
    );

    const rows = (submissions ?? [])
      .filter((s) => !doneIds.has(s.id))
      .filter((s) => !s.email || !doneEmails.has(s.email.toLowerCase()))
      .map((s) => {
        const parts = (s.name ?? "").trim().split(/\s+/);
        // `source` is always buyer or seller — the enquiry lists filter on
        // exactly those. Someone doing both sides of a trade says so inside
        // the form, so that answer is what decides the lead type.
        const bothSides = /^I am a:\s*Both\s*$/m.test(s.message ?? "");
        const side = s.source === "buyer" || s.source === "seller" ? s.source : "unknown";
        return {
          first_name: parts[0] || null,
          last_name: parts.slice(1).join(" ") || null,
          email: s.email?.toLowerCase() || null,
          phone: s.phone || null,
          lead_type: bothSides ? "both" : side,
          stage: "new",
          source: "website",
          submission_id: s.id,
        };
      });

    if (rows.length) await supabase.from("contacts").insert(rows);
    await supabase.from("import_batches").insert({
      kind: "website",
      source: "website",
      inserted_count: rows.length,
      updated_count: 0,
      skipped_count: 0,
    });
    revalidatePath("/contacts");
    revalidatePath("/contacts/import");
  }

  // Every filter except the one being changed rides along, so switching tabs
  // keeps your search and dropdowns. `page` is never carried — a different
  // filter means a different result set, so it starts at page 1.
  const carried = { stage, type: leadType, source, q: search };
  const qs = (over: Record<string, string | undefined>) =>
    queryString("/contacts", {
      view: view === "all" ? undefined : view,
      ...carried,
      ...over,
    });

  return (
    <>
      <Header title="Contacts" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            tabs={VIEWS}
            active={view}
            href={(key) => qs({ view: key === "all" ? undefined : key })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <AddContactModal onCreate={createContact} />
            <ImportWebsiteButton action={importFromWebsite} />
            <Link
              href="/contacts/import"
              className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <span>Import CSV</span>
              <span className="text-gold">›</span>
            </Link>
          </div>
        </div>

        {/* The active tab is not an input here, so it rides along hidden —
            otherwise applying a filter would drop you back to All. */}
        <FilterBar
          action="/contacts"
          isFiltered={isFiltered}
          hidden={{ view: view === "all" ? undefined : view }}
        >
          <SearchField
            defaultValue={search}
            placeholder="Search name, email or phone…"
          />
          <SelectField name="stage" value={stage} anyLabel="Any stage" options={STAGES} />
          <SelectField
            name="type"
            value={leadType}
            anyLabel="Any lead type"
            options={LEAD_TYPES}
          />
          <SelectField
            name="source"
            value={source}
            anyLabel="Any source"
            options={SOURCES}
          />
        </FilterBar>

        {/* The pager itself hides on a single page, so say where you are here
            instead — otherwise 25 of 60 rows looks like all of them. */}
        <p className="text-sm text-ink-mute">
          {totalPages > 1 ? (
            <>
              Showing{" "}
              <span className="font-serif text-navy text-base">
                {from + 1}–{from + contacts.length}
              </span>{" "}
              of <span className="font-serif text-navy text-base">{count ?? 0}</span> contacts
              <span className="text-ink-mute/70"> · page {page} of {totalPages}</span>
            </>
          ) : (
            <>
              <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
              {count === 1 ? "contact" : "contacts"}
            </>
          )}
          {view === "due" && " needing follow-up today or sooner"}
          {isFiltered && " matching your filters"}
        </p>

        {contacts.length === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No contacts match these filters.</p>
            <Link
              href={qs({ stage: undefined, type: undefined, source: undefined, q: undefined })}
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <ContactsTable
            contacts={contacts}
            onUpdate={updateContact}
            onDelete={deleteContact}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/contacts"
          extraParams={{
            view: view === "all" ? undefined : view,
            ...carried,
          }}
        />
      </main>
    </>
  );
}

// Small server-action form so the button works without a client component.
function ImportWebsiteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        title="Add any website enquiries that are not in the list yet"
        className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
      >
        Pull in website enquiries
      </button>
    </form>
  );
}
