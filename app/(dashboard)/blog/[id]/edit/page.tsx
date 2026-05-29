import Header from "@/components/layout/Header";
import BlogForm from "@/components/blog/BlogForm";
import { createClient } from "@/lib/supabase/server";
import { BlogPostInsert } from "@/lib/types";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (!post) notFound();

  async function updatePost(data: BlogPostInsert) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase
      .from("blog_posts")
      .update(data)
      .eq("id", id);
    if (!error) revalidatePath("/blog");
    return { error: error?.message };
  }

  return (
    <>
      <Header title={`Edit: ${post.title}`} />
      <main className="p-4 sm:p-8">
        <BlogForm initialData={post} onSubmit={updatePost} />
      </main>
    </>
  );
}
