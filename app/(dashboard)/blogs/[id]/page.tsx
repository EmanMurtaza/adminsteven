import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function BlogDetailPage({
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

  const status = post.published_at && new Date(post.published_at).getTime() <= Date.now()
    ? "published"
    : "draft";

  return (
    <>
      <Header title={post.title} />
      <main className="p-4 sm:p-8 max-w-3xl space-y-5 sm:space-y-6">
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
          <Row label="Title" value={post.title} />
          <Row label="Slug" value={`/#/blog/${post.slug}`} mono />
          <Row label="Category" value={post.cat} />
          <Row label="Author" value={post.author ?? "—"} />
          <Row label="Status" value={status} highlight />
          <Row
            label="Published"
            value={post.published_at ? new Date(post.published_at).toLocaleString() : "—"}
          />
          <Row label="Excerpt" value={post.excerpt ?? "—"} />
          <Row label="Created" value={new Date(post.created_at).toLocaleString()} />
        </div>

        {post.image && (
          <div className="bg-white border border-gold/25 rounded-xl p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image}
              alt={post.title}
              className="rounded-md max-h-80 w-auto mx-auto"
            />
          </div>
        )}

        {post.content && (
          <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute mb-3">
              Content (raw)
            </p>
            <pre className="whitespace-pre-wrap font-mono text-xs text-ink-soft leading-relaxed">
              {post.content}
            </pre>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/blogs/${post.id}/edit`}
            className="bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <span>Edit</span>
            <span className="text-gold">›</span>
          </Link>
          <Link
            href="/blogs"
            className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-5 py-2.5 rounded-md text-sm font-medium transition-colors text-center"
          >
            Back
          </Link>
        </div>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 sm:items-start py-2 border-b border-gold/10 last:border-b-0">
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-[0.18em] text-ink-mute mb-1 sm:mb-0 sm:mt-1">
        {label}
      </span>
      <span
        className={
          highlight
            ? "text-sm font-semibold uppercase tracking-wider text-gold-dark"
            : mono
              ? "text-sm text-navy break-words font-mono"
              : "text-sm text-navy break-words"
        }
      >
        {value}
      </span>
    </div>
  );
}
