import Header from "@/components/layout/Header";
import TestimonialsTable from "@/components/testimonials/TestimonialsTable";
import { FilterBar, SearchField, SelectField } from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Testimonial } from "@/lib/testimonials";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const STATUSES = [
  { value: "published", label: "Live on site" },
  { value: "draft", label: "Hidden" },
];

const RATINGS = [
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars & up" },
  { value: "3", label: "3 stars & up" },
];

const FLAGS = [{ value: "featured", label: "Featured only" }];

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function TestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Drafts are hidden from the anon key by RLS, so admin reads use the service role.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const q = str(params.q)?.trim();
  const status = STATUSES.some((s) => s.value === str(params.status))
    ? str(params.status)
    : undefined;
  const rating = RATINGS.some((r) => r.value === str(params.rating))
    ? str(params.rating)
    : undefined;
  const flag = FLAGS.some((f) => f.value === str(params.flag))
    ? str(params.flag)
    : undefined;

  const isFiltered = Boolean(q || status || rating || flag);

  let query = supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (rating) query = query.gte("rating", Number(rating));
  if (flag === "featured") query = query.eq("featured", true);
  if (q) {
    const like = `%${q.replace(/[,()]/g, " ")}%`;
    query = query.or(`quote.ilike.${like},name.ilike.${like},role.ilike.${like}`);
  }

  // "Live on the website" is a fact about the whole table, not about whatever
  // filter is applied — so count it separately rather than from the filtered rows.
  const [{ data, error }, { count: liveCount }] = await Promise.all([
    query,
    supabase
      .from("testimonials")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
  ]);

  if (error) {
    return (
      <>
        <Header title="Testimonials" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load testimonials</p>
            <p className="text-sm text-ink-soft mb-3">{error.message}</p>
            <p className="text-sm text-ink-soft">
              If this is the first run, apply{" "}
              <code className="bg-cream-200 px-1.5 py-0.5 rounded text-xs">
                supabase/setup.sql
              </code>{" "}
              in the Supabase SQL editor.
            </p>
          </div>
        </main>
      </>
    );
  }

  const testimonials = (data ?? []) as Testimonial[];
  const live = liveCount ?? 0;

  async function deleteTestimonial(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("testimonials").delete().eq("id", id);
    revalidatePath("/testimonials");
    return { error: error?.message };
  }

  async function setStatus(id: string, status: "draft" | "published") {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("testimonials").update({ status }).eq("id", id);
    revalidatePath("/testimonials");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="Testimonials" />
      <main className="p-4 sm:p-8 space-y-5">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <FilterBar action="/testimonials" isFiltered={isFiltered}>
            <SearchField
              defaultValue={q}
              placeholder="Search quote, name or role…"
            />
            <SelectField
              name="status"
              value={status}
              anyLabel="Any status"
              options={STATUSES}
            />
            <SelectField
              name="rating"
              value={rating}
              anyLabel="Any rating"
              options={RATINGS}
            />
            <SelectField
              name="flag"
              value={flag}
              anyLabel="All testimonials"
              options={FLAGS}
            />
          </FilterBar>

          <Link
            href="/testimonials/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 shrink-0"
          >
            <span>+ New Testimonial</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{live}</span> live on the
          website
          {isFiltered && (
            <>
              {" "}
              · showing{" "}
              <span className="font-serif text-navy text-base">
                {testimonials.length}
              </span>{" "}
              {testimonials.length === 1 ? "match" : "matches"}
            </>
          )}
        </p>

        {testimonials.length === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No testimonials match these filters.</p>
            <Link
              href="/testimonials"
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <TestimonialsTable
            testimonials={testimonials}
            onDelete={deleteTestimonial}
            onToggleStatus={setStatus}
          />
        )}
      </main>
    </>
  );
}
