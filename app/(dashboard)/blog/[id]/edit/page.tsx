import Header from "@/components/layout/Header";
import BlogForm from "@/components/blog/BlogForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { BlogPostInsert } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");
  const { data: post } = await supabase
    .from("blogs")
    .select("*")
    .eq("id", id)
    .single();

  if (!post) notFound();

  async function updatePost(data: BlogPostInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    if (data.status === "published" && !post.published_at) {
      data.published_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("blogs")
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
