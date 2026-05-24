"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Eye } from "lucide-react";
import type { BlogPost } from "@/lib/types";

interface BlogsTableProps {
  posts: BlogPost[];
  deleteAction: (id: number) => Promise<{ error?: string }>;
}

function statusOf(post: BlogPost): "published" | "draft" {
  if (!post.published_at) return "draft";
  return new Date(post.published_at).getTime() <= Date.now() ? "published" : "draft";
}

const statusStyles: Record<string, string> = {
  published: "bg-gold/15 text-gold-dark border border-gold/40",
  draft: "bg-cream-200 text-ink-soft border border-ink-mute/30",
};

export default function BlogsTable({ posts, deleteAction }: BlogsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteAction(id);
      if (result.error) {
        alert(`Delete failed: ${result.error}`);
      } else {
        router.refresh();
      }
    });
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">
          No blog posts yet
        </p>
        <p className="text-sm text-ink-mute mb-5">
          Publish your first post to get started.
        </p>
        <Link
          href="/blogs/new"
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          <span>+ Create a Post</span>
          <span className="text-gold">›</span>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="sm:hidden space-y-3">
        {posts.map((post) => {
          const status = statusOf(post);
          return (
            <div
              key={post.id}
              className="bg-white border border-gold/25 rounded-xl p-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg text-navy leading-tight truncate">
                    {post.title}
                  </p>
                  <p className="text-xs text-ink-mute mt-1">{post.cat}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider shrink-0 ${statusStyles[status]}`}
                >
                  {status}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gold/15">
                <p className="text-[10px] uppercase tracking-wider text-ink-mute">
                  /{post.slug}
                </p>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/blogs/${post.id}`}
                    className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors"
                    aria-label="View"
                  >
                    <Eye size={16} />
                  </Link>
                  <Link
                    href={`/blogs/${post.id}/edit`}
                    className="p-2 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id, post.title)}
                    disabled={isPending}
                    className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gold/25 bg-white shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
        <table className="min-w-full divide-y divide-gold/15 text-sm">
          <thead className="bg-cream-100 text-ink-soft uppercase text-[10px] tracking-[0.18em]">
            <tr>
              <th className="px-5 py-4 text-left font-semibold">Title</th>
              <th className="px-5 py-4 text-left font-semibold">Category</th>
              <th className="px-5 py-4 text-left font-semibold">Status</th>
              <th className="px-5 py-4 text-left font-semibold">Published</th>
              <th className="px-5 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {posts.map((post) => {
              const status = statusOf(post);
              return (
                <tr key={post.id} className="hover:bg-cream-100/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-navy">{post.title}</div>
                    <div className="text-[11px] text-ink-mute font-mono mt-0.5">/{post.slug}</div>
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{post.cat}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyles[status]}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-mute text-xs">
                    {post.published_at
                      ? new Date(post.published_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/blogs/${post.id}`}
                        className="p-1.5 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors"
                      >
                        <Eye size={16} />
                      </Link>
                      <Link
                        href={`/blogs/${post.id}/edit`}
                        className="p-1.5 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                      >
                        <Pencil size={16} />
                      </Link>
                      <button
                        onClick={() => handleDelete(post.id, post.title)}
                        disabled={isPending}
                        className="p-1.5 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
