import Header from "@/components/layout/Header";
import SoldPanel, { LinkedContact } from "@/components/listings/SoldPanel";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { getListingById, markListingSold } from "@/lib/listings";
import { formatDate, formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { listingStatusLabel, salesChannelLabel } from "@/lib/types";
import { contactName } from "@/lib/contacts";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** A week out — near enough to be useful, far enough not to be today's problem. */
const FOLLOW_UP_DAYS = 7;

/** Module scope, not inside the component: reading the clock during render is
 *  impure, and this only ever runs inside a server action anyway. */
function followUpDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + FOLLOW_UP_DAYS);
  return date.toISOString().slice(0, 10);
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");
  const listing = await getListingById(id);

  if (!listing) notFound();

  // Who is attached to this property. The link table lives in Postgres while
  // the listing lives in Mongo, so this is a second read rather than a join.
  const { data: links } = await supabase
    .from("contact_listings")
    .select("role, contacts (id, first_name, last_name, email, stage, next_follow_up)")
    .eq("listing_id", id);

  type LinkRow = {
    role: string;
    contacts: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      stage: string;
      next_follow_up: string | null;
    } | null;
  };

  const linked: LinkedContact[] = ((links ?? []) as unknown as LinkRow[])
    .filter((row) => row.contacts)
    .map((row) => ({
      id: row.contacts!.id,
      name: contactName(row.contacts!),
      email: row.contacts!.email,
      stage: row.contacts!.stage,
      role: row.role,
      next_follow_up: row.contacts!.next_follow_up,
    }));

  async function markSold(input: { sold_price: number | null; sold_at: string | null }) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    const updated = await markListingSold(id, input);
    if (!updated) return { error: "Listing not found." };

    revalidatePath("/listings");
    revalidatePath(`/listings/${id}`);
    revalidatePath("/dashboard");
    return {};
  }

  // Records who actually bought it, and closes them out. Only ever one person,
  // and only ever on an explicit click.
  async function closeAsBuyer(contactId: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    const { error: stageError } = await supabase
      .from("contacts")
      .update({ stage: "closed", last_contacted_at: new Date().toISOString() })
      .eq("id", contactId);
    if (stageError) return { error: stageError.message };

    // Promote the link from "asked about it" to "bought it". The old
    // 'interested' row is left alone — it is true, and role is part of the key.
    const { error: linkError } = await supabase
      .from("contact_listings")
      .upsert(
        { contact_id: contactId, listing_id: id, role: "buyer" },
        { onConflict: "contact_id,listing_id,role", ignoreDuplicates: true }
      );
    if (linkError) return { error: linkError.message };

    revalidatePath(`/listings/${id}`);
    revalidatePath("/contacts");
    revalidatePath("/pipeline");
    return {};
  }

  // Purely additive: it only fills in a date where there was none. It never
  // moves anyone's stage and never overwrites a date Steven already chose.
  async function scheduleFollowUps() {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    const { data: rows, error: readError } = await supabase
      .from("contact_listings")
      .select("contacts (id, stage, next_follow_up)")
      .eq("listing_id", id)
      .eq("role", "interested");
    if (readError) return { error: readError.message };

    type Row = { contacts: { id: string; stage: string; next_follow_up: string | null } | null };
    const due = ((rows ?? []) as unknown as Row[])
      .map((r) => r.contacts)
      .filter((c): c is NonNullable<Row["contacts"]> => Boolean(c))
      // Leave finished leads finished, and leave existing dates alone.
      .filter((c) => c.next_follow_up === null && c.stage !== "closed" && c.stage !== "lost");

    if (due.length === 0) return { scheduled: 0 };

    const { error: writeError } = await supabase
      .from("contacts")
      .update({ next_follow_up: followUpDate() })
      .in("id", due.map((c) => c.id));
    if (writeError) return { error: writeError.message };

    revalidatePath(`/listings/${id}`);
    revalidatePath("/contacts");
    return { scheduled: due.length };
  }

  return (
    <>
      <Header title={listing.title} />
      <main className="p-4 sm:p-8 max-w-3xl space-y-5 sm:space-y-6">
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
          <Row label="Title" value={listing.title} />
          <Row label="Type" value={listing.property_type?.replace("_", "-") ?? "—"} />
          <Row label="Sub-category" value={salesChannelLabel(listing.sales_channel)} />
          <Row label="Status" value={listingStatusLabel(listing.status)} highlight />
          <Row label="Price" value={formatPrice(listing.price)} />
          {listing.status === "sold" && (
            <>
              <Row label="Sold for" value={formatPrice(listing.sold_price)} />
              <Row
                label="Sold on"
                value={listing.sold_at ? formatDate(listing.sold_at) : "—"}
              />
              <Row
                label="Days on market"
                value={listing.days_on_market != null ? String(listing.days_on_market) : "—"}
              />
            </>
          )}
          <Row
            label="Address"
            value={
              [listing.address, listing.city, listing.state, listing.zip_code]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row label="Neighborhood" value={listing.neighborhood ?? "—"} />
          <Row
            label="Beds / Baths"
            value={
              listing.bedrooms != null || listing.bathrooms != null
                ? `${listing.bedrooms ?? "—"} bd / ${listing.bathrooms ?? "—"} ba`
                : "—"
            }
          />
          <Row label="Square Feet" value={formatNumber(listing.square_footage)} />
          <Row label="Year Built" value={listing.year_built != null ? String(listing.year_built) : "—"} />
          <Row label="MLS #" value={listing.mls_number ?? "—"} />
          <Row label="Featured" value={listing.is_featured ? "Yes" : "No"} />
          <Row label="Description" value={listing.description ?? "—"} />
          <Row label="Created" value={formatDateTime(listing.created_at)} />
        </div>

        <SoldPanel
          status={listing.status}
          soldAt={listing.sold_at}
          soldPrice={listing.sold_price}
          askingPrice={listing.price}
          linked={linked}
          onMarkSold={markSold}
          onCloseAsBuyer={closeAsBuyer}
          onScheduleFollowUps={scheduleFollowUps}
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/listings/${id}/edit`}
            className="bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <span>Edit</span>
            <span className="text-gold">›</span>
          </Link>
          <Link
            href="/listings"
            className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-5 py-2.5 rounded-md text-sm font-medium transition-colors text-center"
          >
            Back
          </Link>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 sm:items-start py-2 border-b border-gold/10 last:border-b-0">
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-[0.18em] text-ink-mute mb-1 sm:mb-0 sm:mt-1">
        {label}
      </span>
      <span
        className={
          highlight
            ? "text-sm font-semibold uppercase tracking-wider text-gold-dark"
            : "text-sm text-navy break-words"
        }
      >
        {value}
      </span>
    </div>
  );
}
