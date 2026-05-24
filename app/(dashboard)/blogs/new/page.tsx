import Header from "@/components/layout/Header";
import BlogForm from "@/components/blogs/BlogForm";
import { createClient } from "@/lib/supabase/server";
import { validateBlogInput } from "@/lib/validation";
import type { BlogPostInsert } from "@/lib/types";
import { revalidatePath } from "next/cache";

export default function NewBlogPage() {
  async function createBlog(data: BlogPostInsert): Promise<{ error?: string }> {
    "use server";
    // Re-validate on the server — never trust the client.
    const validated = validateBlogInput(data);
    if (!validated.ok) return { error: validated.error };

    const supabase = await createClient();
    const { error } = await supabase.from("blog_posts").insert(validated.data);
    if (error) {
      if (error.code === "23505") {
        return { error: "A post with that slug already exists. Pick a different slug." };
      }
      return { error: error.message };
    }
    revalidatePath("/blogs");
    return {};
  }

  return (
    <>
      <Header title="New Post" />
      <main className="p-4 sm:p-8">
        <BlogForm onSubmit={createBlog} />
      </main>
    </>
  );
}
