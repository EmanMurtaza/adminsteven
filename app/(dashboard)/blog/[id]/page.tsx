import Header from "@/components/layout/Header";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";

const statusStyles: Record<string, string> = {
  published: "bg-gold/15 text-gold-dark border border-gold/40",
  draft: "bg-cream-200 text-ink-soft border border-ink-mute/30",
  archived: "bg-navy/10 text-navy-500 border border-navy/20",
};

export default async function ViewBlogPostPage({
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

  return (
    <>
      <Header title={post.title} />
      <main className="p-4 sm:p-8">
        <div className="max-w-3xl">
          {/* Meta bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyles[post.status]}`}
            >
              {post.status}
            </span>
            {post.author && (
              <span className="text-sm text-ink-mute">By {post.author}</span>
            )}
            <span className="text-sm text-ink-mute">
              {new Date(post.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <Link
              href={`/blog/${post.id}/edit`}
              className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-navy hover:bg-navy-500 text-cream rounded-md text-sm font-medium transition-colors"
            >
              <Pencil size={14} />
              Edit
            </Link>
          </div>

          {/* Cover */}
          {post.cover_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.cover_image}
              alt={post.title}
              className="w-full h-64 sm:h-80 object-cover rounded-xl mb-6 shadow-[0_4px_20px_-8px_rgba(14,27,48,0.2)]"
            />
          )}

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-base text-ink-soft italic border-l-2 border-gold pl-4 mb-6">
              {post.excerpt}
            </p>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-gold/10 text-gold-dark text-xs rounded-full border border-gold/25"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <div
            className="bg-white border border-gold/25 rounded-xl p-5 sm:p-8 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)] ProseMirror"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          <div className="mt-6">
            <Link
              href="/blog"
              className="text-sm text-ink-mute hover:text-navy transition-colors"
            >
              ← Back to Blog
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
