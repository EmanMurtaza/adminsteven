import Header from "@/components/layout/Header";
import TestimonialsTable from "@/components/testimonials/TestimonialsTable";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Testimonial } from "@/lib/testimonials";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function TestimonialsPage() {
  // Drafts are hidden from the anon key by RLS, so admin reads use the service role.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

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
                supabase/create_testimonials.sql
              </code>{" "}
              in the Supabase SQL editor.
            </p>
          </div>
        </main>
      </>
    );
  }

  const testimonials = (data ?? []) as Testimonial[];
  const live = testimonials.filter((t) => t.status === "published").length;

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
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-sm text-ink-mute">
            <span className="font-serif text-navy text-base">{live}</span> live on the
            website
            {testimonials.length !== live && ` · ${testimonials.length - live} hidden`}
          </p>
          <Link
            href="/testimonials/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <span>+ New Testimonial</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <TestimonialsTable
          testimonials={testimonials}
          onDelete={deleteTestimonial}
          onToggleStatus={setStatus}
        />
      </main>
    </>
  );
}
