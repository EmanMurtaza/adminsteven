import Header from "@/components/layout/Header";
import ContactsTable from "@/components/contacts/ContactsTable";
import Pagination from "@/components/ui/Pagination";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Contact, STAGES } from "@/lib/contacts";
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
  const stage = str(params.stage);
  const search = str(params.q)?.trim();
  const page = Math.max(1, Number(str(params.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const today = todayISO();

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
  if (search) {
    const like = `%${search}%`;
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
        .select("id, name, email, phone, source, created_at")
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
        return {
          first_name: parts[0] || null,
          last_name: parts.slice(1).join(" ") || null,
          email: s.email?.toLowerCase() || null,
          phone: s.phone || null,
          lead_type: s.source === "buyer" || s.source === "seller" ? s.source : "unknown",
          stage: "new",
          source: "website",
          submission_id: s.id,
        };
      });

    if (rows.length) await supabase.from("contacts").insert(rows);
    revalidatePath("/contacts");
  }

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: view === "all" ? undefined : view, stage, q: search, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/contacts?${s}` : "/contacts";
  };

  return (
    <>
      <Header title="Contacts" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={qs({ view: v.key === "all" ? undefined : v.key, page: undefined })}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  v.key === view
                    ? "bg-navy text-cream border-navy"
                    : "bg-white text-ink-soft border-gold/30 hover:border-gold hover:text-navy"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
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

        {/* Search + stage filter */}
        <form className="flex flex-wrap gap-2" action="/contacts">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search name, email or phone…"
            className="flex-1 min-w-[200px] bg-white border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
          />
          <select
            name="stage"
            defaultValue={stage ?? ""}
            className="bg-white border border-gold/30 text-navy rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          >
            <option value="">Any stage</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
          {count === 1 ? "contact" : "contacts"}
          {view === "due" && " needing follow-up today or sooner"}
        </p>

        <ContactsTable
          contacts={contacts}
          onUpdate={updateContact}
          onDelete={deleteContact}
        />

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/contacts"
          extraParams={{
            view: view === "all" ? undefined : view,
            stage,
            q: search,
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
