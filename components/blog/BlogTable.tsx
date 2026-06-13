"use client";

import Link from "next/link";
import { BlogPost } from "@/lib/types";
import { Pencil, Trash2, Eye } from "lucide-react";
import { useState } from "react";

interface BlogTableProps {
  posts: BlogPost[];
  onDelete?: (id: string) => Promise<{ error?: string }>;
}

const statusStyles: Record<string, string> = {
  published: "bg-gold/15 text-gold-dark border border-gold/40",
  draft: "bg-cream-200 text-ink-soft border border-ink-mute/30",
  archived: "bg-navy/10 text-navy-500 border border-navy/20",
};

export default function BlogTable({ posts, onDelete }: BlogTableProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    if (!onDelete) return;
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 px-4 bg-white border border-gold/25 rounded-xl">
        <p className="font-serif text-xl sm:text-2xl text-navy mb-2">
          No posts yet
        </p>
        <p className="text-sm text-ink-mute mb-5">
          Write your first blog post to get started.
        </p>
        <Link
          href="/blog/new"
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          <span>+ New Post</span>
          <span className="text-gold">›</span>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="bg-white border border-gold/25 rounded-xl p-4 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
          >
            {post.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover_image}
                alt=""
                className="w-full h-28 object-cover rounded-lg mb-3"
              />
            )}
            <div className="flex justify-between items-start gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base text-navy leading-tight">
                  {post.title}
                </p>
                {post.author && (
                  <p className="text-xs text-ink-mute mt-0.5">{post.author}</p>
                )}
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider shrink-0 ${statusStyles[post.status]}`}
              >
                {post.status}
              </span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gold/15">
              <p className="text-xs text-ink-mute">
                {new Date(post.created_at).toLocaleDateString()}
              </p>
              <div className="flex items-center gap-1">
                <Link
                  href={`/blog/${post.id}`}
                  className="p-2 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors"
                >
                  <Eye size={15} />
                </Link>
                <Link
                  href={`/blog/${post.id}/edit`}
                  className="p-2 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                >
                  <Pencil size={15} />
                </Link>
                {onDelete && (
                  <button
                    onClick={() => handleDelete(post.id, post.title)}
                    disabled={deleting === post.id}
                    className="p-2 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gold/25 bg-white shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
        <table className="min-w-full divide-y divide-gold/15 text-sm">
          <thead className="bg-cream-100 text-ink-soft uppercase text-[10px] tracking-[0.18em]">
            <tr>
              <th className="px-5 py-4 text-left font-semibold">Title</th>
              <th className="px-5 py-4 text-left font-semibold">Author</th>
              <th className="px-5 py-4 text-left font-semibold">Tags</th>
              <th className="px-5 py-4 text-left font-semibold">Status</th>
              <th className="px-5 py-4 text-left font-semibold">Date</th>
              <th className="px-5 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-cream-100/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    {post.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.cover_image}
                        alt=""
                        className="w-10 h-10 object-cover rounded-md shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-navy truncate max-w-xs">
                        {post.title}
                      </p>
                      {post.excerpt && (
                        <p className="text-xs text-ink-mute truncate max-w-xs mt-0.5">
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-ink-soft">{post.author ?? "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-gold/10 text-gold-dark text-[10px] rounded-full border border-gold/25"
                      >
                        {tag}
                      </span>
                    ))}
                    {post.tags.length > 3 && (
                      <span className="text-[10px] text-ink-mute">
                        +{post.tags.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyles[post.status]}`}
                  >
                    {post.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-ink-mute text-xs">
                  {new Date(post.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/blog/${post.id}`}
                      className="p-1.5 rounded text-ink-mute hover:text-gold-dark hover:bg-gold/10 transition-colors"
                      title="View"
                    >
                      <Eye size={15} />
                    </Link>
                    <Link
                      href={`/blog/${post.id}/edit`}
                      className="p-1.5 rounded text-ink-mute hover:text-navy hover:bg-navy/10 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </Link>
                    {onDelete && (
                      <button
                        onClick={() => handleDelete(post.id, post.title)}
                        disabled={deleting === post.id}
                        className="p-1.5 rounded text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
