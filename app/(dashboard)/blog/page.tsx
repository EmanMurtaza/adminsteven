import Header from "@/components/layout/Header";
import BlogTable from "@/components/blog/BlogTable";
import Pagination from "@/components/ui/Pagination";
import { FilterBar, SearchField, SelectField } from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { BLOG_CATEGORIES, CONTENT_STATUSES } from "@/lib/types";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 10;

const CATEGORY_OPTIONS = BLOG_CATEGORIES.map((c) => ({ value: c, label: c }));

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Drafts are hidden from the anon key by RLS — admin reads need service role
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const q = str(params.q)?.trim();
  const status = CONTENT_STATUSES.some((s) => s.value === str(params.status))
    ? str(params.status)
    : undefined;
  const tag = BLOG_CATEGORIES.includes(
    str(params.tag) as (typeof BLOG_CATEGORIES)[number]
  )
    ? str(params.tag)
    : undefined;
  const page = Math.max(1, Number(str(params.page) ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const isFiltered = Boolean(q || status || tag);

  let query = supabase
    .from("blogs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  // `tags` is a text[] — contains() is the array operator, not eq().
  if (tag) query = query.contains("tags", [tag]);
  if (q) {
    // Commas separate the alternatives in PostgREST's or(), so a comma typed
    // into the search box would split it into bogus conditions.
    const like = `%${q.replace(/[,()]/g, " ")}%`;
    query = query.or(
      `title.ilike.${like},slug.ilike.${like},excerpt.ilike.${like},author.ilike.${like}`
    );
  }

  const { data: posts, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load posts: {error.message}
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  async function deletePost(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("blogs").delete().eq("id", id);
    revalidatePath("/blog");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Blog" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <FilterBar action="/blog" isFiltered={isFiltered}>
            <SearchField
              defaultValue={q}
              placeholder="Search title, slug, excerpt or author…"
            />
            <SelectField
              name="status"
              value={status}
              anyLabel="Any status"
              options={CONTENT_STATUSES}
            />
            <SelectField
              name="tag"
              value={tag}
              anyLabel="Any category"
              options={CATEGORY_OPTIONS}
            />
          </FilterBar>

          <Link
            href="/blog/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 shrink-0"
          >
            <span>+ New Post</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{count ?? 0}</span>{" "}
          {count === 1 ? "post" : "posts"}
          {isFiltered && " matching your filters"}
          {totalPages > 1 && (
            <span className="text-ink-mute/70">
              {" "}
              · page {page} of {totalPages}
            </span>
          )}
        </p>

        {(count ?? 0) === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No posts match these filters.</p>
            <Link
              href="/blog"
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <BlogTable posts={posts ?? []} onDelete={deletePost} />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/blog"
          extraParams={{ q, status, tag }}
        />
      </main>
    </>
  );
}
