import Header from "@/components/layout/Header";
import BlogTable from "@/components/blog/BlogTable";
import Pagination from "@/components/ui/Pagination";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 10;

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Drafts are hidden from the anon key by RLS — admin reads need service role
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const pageParam = (await searchParams).page;
  const page = Math.max(
    1,
    Number(typeof pageParam === "string" ? pageParam : "1") || 1
  );
  const from = (page - 1) * PAGE_SIZE;

  const { data: posts, error, count } = await supabase
    .from("blogs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load posts: {error.message}
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  async function deletePost(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("blogs").delete().eq("id", id);
    revalidatePath("/blog");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Blog" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
            total
          </p>
          <Link
            href="/blog/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <span>+ New Post</span>
            <span className="text-gold">›</span>
          </Link>
        </div>
        <BlogTable posts={posts ?? []} onDelete={deletePost} />
        <Pagination currentPage={page} totalPages={totalPages} basePath="/blog" />
      </main>
    </>
  );
}
