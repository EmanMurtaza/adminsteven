import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: total }, { count: published }, { count: drafts }] = await Promise.all([
    supabase.from("listings").select("*", { count: "exact", head: true }),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  const stats = [
    { label: "Total Listings", value: total ?? 0 },
    { label: "Published", value: published ?? 0 },
    { label: "Drafts", value: drafts ?? 0 },
  ];

  return (
    <>
      <Header title="Dashboard" />
      <main className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {stats.map(({ label, value }) => (
            <div key={label} className="bg-white rounded-lg border border-gray-200 p-5">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Quick actions</h2>
          <div className="flex gap-3">
            <Link
              href="/listings/new"
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
            >
              + New Listing
            </Link>
            <Link
              href="/listings"
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              View All Listings
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
