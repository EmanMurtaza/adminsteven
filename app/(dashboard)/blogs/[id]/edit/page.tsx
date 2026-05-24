import Header from "@/components/layout/Header";
import BlogForm from "@/components/blogs/BlogForm";
import { createClient } from "@/lib/supabase/server";
import { validateBlogInput } from "@/lib/validation";
import type { BlogPostInsert } from "@/lib/types";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function EditBlogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", numericId)
    .single();

  if (!post) notFound();

  async function updateBlog(data: BlogPostInsert): Promise<{ error?: string }> {
    "use server";
    const validated = validateBlogInput(data);
    if (!validated.ok) return { error: validated.error };

    const supabase = await createClient();
    const { error } = await supabase
      .from("blog_posts")
      .update(validated.data)
      .eq("id", numericId);
    if (error) {
      if (error.code === "23505") {
        return { error: "A post with that slug already exists. Pick a different slug." };
      }
      return { error: error.message };
    }
    revalidatePath("/blogs");
    revalidatePath(`/blogs/${numericId}`);
    return {};
  }

  return (
    <>
      <Header title={`Edit: ${post.title}`} />
      <main className="p-4 sm:p-8">
        <BlogForm initialData={post} onSubmit={updateBlog} />
      </main>
    </>
  );
}
