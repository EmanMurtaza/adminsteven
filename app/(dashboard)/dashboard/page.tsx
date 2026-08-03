import Header from "@/components/layout/Header";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { countListings } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Auth still gated by Supabase; listing counts now come from MongoDB.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const [
    total,
    published,
    drafts,
    { count: totalPosts },
    { count: publishedPosts },
    { count: newInquiries },
  ] = await Promise.all([
    countListings(),
    countListings({ status: "published" }),
    countListings({ status: "draft" }),
    supabase.from("blogs").select("*", { count: "exact", head: true }),
    supabase.from("blogs").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("contact_submissions").select("*", { count: "exact", head: true }).eq("is_read", false),
  ]);

  const stats = [
    { label: "New Enquiries", value: newInquiries ?? 0, href: "/inquiries/buyers" },
    { label: "Total Listings", value: total },
    { label: "Published Listings", value: published },
    { label: "Draft Listings", value: drafts },
    { label: "Blog Posts", value: totalPosts ?? 0 },
    { label: "Published Posts", value: publishedPosts ?? 0 },
  ];

  return (
    <>
      <Header title="Dashboard" />
      <main className="p-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
          {stats.map(({ label, value, href }) => {
            const card = (
              <>
                <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-ink-mute">
                  {label}
                </p>
                <p className="font-serif text-3xl sm:text-4xl font-semibold text-navy mt-3">
                  {value}
                </p>
                <div className="h-px w-8 bg-gold mt-4" />
              </>
            );
            const shell =
              "block bg-white border rounded-xl p-5 sm:p-6 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)] hover:shadow-[0_8px_30px_-12px_rgba(14,27,48,0.18)] transition-shadow";
            // An unread count is only useful if it takes you to the unread list.
            return href ? (
              <Link
                key={label}
                href={href}
                className={`${shell} ${value > 0 ? "border-gold" : "border-gold/25"}`}
              >
                {card}
              </Link>
            ) : (
              <div key={label} className={`${shell} border-gold/25`}>
                {card}
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-6">
          <h2 className="font-serif text-lg sm:text-xl text-navy mb-1">
            Quick Actions
          </h2>
          <p className="text-sm text-ink-mute mb-5">
            Manage your properties and content.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/listings/new"
              className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <span>+ New Listing</span>
              <span className="text-gold">›</span>
            </Link>
            <Link
              href="/blog/new"
              className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <span>+ New Post</span>
              <span className="text-gold">›</span>
            </Link>
            <Link
              href="/listings"
              className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
            >
              All Listings
            </Link>
            <Link
              href="/blog"
              className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
            >
              All Posts
            </Link>
          </div>
        </div>

        {/* Tagline strip */}
        <div className="text-center pt-2 sm:pt-4">
          <p className="font-serif italic text-ink-mute text-xs sm:text-sm px-4">
            “DFW Real Estate · Luxury, REO &amp; Investor — Since 2006”
          </p>
        </div>
      </main>
    </>
  );
}
