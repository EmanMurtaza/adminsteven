import Header from "@/components/layout/Header";
import BlogForm from "@/components/blog/BlogForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { BlogPostInsert } from "@/lib/types";
import { revalidatePath } from "next/cache";

export default function NewBlogPostPage() {
  async function createPost(data: BlogPostInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    if (data.status === "published" && !data.published_at) {
      data.published_at = new Date().toISOString();
    }
    const { error } = await supabase.from("blogs").insert(data);
    if (!error) revalidatePath("/blog");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="New Blog Post" />
      <main className="p-4 sm:p-8">
        <BlogForm onSubmit={createPost} />
      </main>
    </>
  );
}
