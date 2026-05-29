import Header from "@/components/layout/Header";
import BlogTable from "@/components/blog/BlogTable";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function BlogPage() {
  const supabase = await createClient();
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load posts: {error.message}
      </p>
    );
  }

  async function deletePost(id: string) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    revalidatePath("/blog");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Blog" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">
              {posts?.length ?? 0}
            </span>{" "}
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
      </main>
    </>
  );
}
