import Header from "@/components/layout/Header";
import InquiriesTable from "@/components/inquiries/InquiriesTable";
import Pagination from "@/components/ui/Pagination";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Inquiry } from "@/lib/inquiries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 10;

// Shared implementation behind the dedicated /inquiries/buyers and
// /inquiries/sellers sections. Each renders only its own lead type.
export default async function InquiriesSection({
  source,
  title,
  basePath,
  page,
}: {
  source: "buyer" | "seller";
  title: string;
  basePath: string;
  page: number;
}) {
  // Private lead records — RLS blocks the anon key, so read via service role
  // after confirming an admin is signed in.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("contact_submissions")
    .select("id, name, email, phone, message, source, is_read, created_at", {
      count: "exact",
    })
    .eq("source", source)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

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
        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
          {(count ?? 0) === 1 ? title.replace(/s$/, "").toLowerCase() : title.toLowerCase()}{" "}
          total
        </p>

        <InquiriesTable
          inquiries={inquiries}
          onToggleRead={setRead}
          onDelete={deleteInquiry}
        />

        <Pagination currentPage={page} totalPages={totalPages} basePath={basePath} />
      </main>
    </>
  );
}
