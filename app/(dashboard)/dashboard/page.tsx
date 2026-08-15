import Header from "@/components/layout/Header";
import AnalyticsCharts from "@/components/analytics/AnalyticsCharts";
import AddContactModal, { NewContactInput } from "@/components/contacts/AddContactModal";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { getPipelineAnalytics, getInquiryAnalytics } from "@/lib/analytics";
import { getListingAnalytics, listListings } from "@/lib/listings";
import { formatPrice, percentChange } from "@/lib/format";
import { Users, UserPlus, Bell, Target, Building2, DollarSign } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const RECENT_LISTINGS = 6;

function Chip({
  icon,
  label,
  value,
  deltaPct,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  deltaPct?: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-gold/40 transition-colors min-w-0"
    >
      <div className="w-7 h-7 rounded-md bg-gold/15 text-gold flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-[0.12em] text-cream/50 truncate">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className="font-serif text-base text-cream font-semibold leading-none">{value}</p>
          {deltaPct != null && (
            <span
              className={`text-[10px] font-medium ${deltaPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {deltaPct >= 0 ? "+" : ""}
              {Math.round(deltaPct)}%
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const [
    pipeline,
    inquiries,
    listingStats,
    { data: recentListings },
  ] = await Promise.all([
    getPipelineAnalytics(supabase),
    getInquiryAnalytics(supabase),
    getListingAnalytics(),
    listListings({ limit: RECENT_LISTINGS }),
  ]);

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

    revalidatePath("/dashboard");
    revalidatePath("/contacts");
    revalidatePath("/pipeline");
    return {};
  }

  const publishedListings = listingStats.byStatus.find((s) => s.status === "published")?.count ?? 0;
  const conversionLabel =
    pipeline.conversionRate === null ? "—" : `${Math.round(pipeline.conversionRate * 100)}%`;
  const leadsDelta = percentChange(pipeline.newLast7Days, pipeline.newPrevWeek);
  const enquiriesDelta = percentChange(inquiries.last7Days, inquiries.prevWeek);

  return (
    <>
      <Header title="Dashboard" />
      <main className="p-4 sm:p-6 space-y-4">
        {/* Title row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl sm:text-2xl text-navy">Business Snapshot</h1>
            <p className="text-xs text-ink-mute mt-0.5">
              Live pipeline, listings &amp; enquiry performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AddContactModal onCreate={createContact} />
            <Link
              href="/listings/new"
              className="bg-navy hover:bg-navy-500 text-cream px-3.5 py-2 rounded-md text-xs font-medium transition-colors"
            >
              + Listing
            </Link>
            <Link
              href="/contacts/import"
              className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-3.5 py-2 rounded-md text-xs font-medium transition-colors"
            >
              Import Leads
            </Link>
          </div>
        </div>

        {/* Dark KPI strip */}
        <div className="bg-navy rounded-xl p-3 sm:p-3.5 shadow-[0_10px_30px_-14px_rgba(6,16,28,0.5)]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Chip
              icon={<Users size={14} />}
              label="Total Leads"
              value={pipeline.totalContacts}
              href="/pipeline"
            />
            <Chip
              icon={<UserPlus size={14} />}
              label="New (7d)"
              value={pipeline.newLast7Days}
              deltaPct={leadsDelta}
              href="/pipeline"
            />
            <Chip
              icon={<Bell size={14} />}
              label="Enquiries"
              value={inquiries.unread}
              deltaPct={enquiriesDelta}
              href="/inquiries/buyers"
            />
            <Chip
              icon={<Target size={14} />}
              label="Win Rate"
              value={conversionLabel}
              href="/pipeline"
            />
            <Chip
              icon={<Building2 size={14} />}
              label="Listings"
              value={`${publishedListings}/${listingStats.totalCount}`}
              href="/listings"
            />
            <Chip
              icon={<DollarSign size={14} />}
              label="Avg Price"
              value={formatPrice(listingStats.avgPrice)}
              href="/listings"
            />
          </div>
        </div>

        {/* Dense panel grid */}
        <AnalyticsCharts
          pipeline={pipeline}
          inquiries={inquiries}
          listings={listingStats}
          recentListings={recentListings ?? []}
        />
      </main>
    </>
  );
}
