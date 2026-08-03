import Header from "@/components/layout/Header";
import TestimonialForm from "@/components/testimonials/TestimonialForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { TestimonialInsert } from "@/lib/testimonials";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function NewTestimonialPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  // New ones go to the end of the list unless the order is set by hand.
  const { data: last } = await supabase
    .from("testimonials")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.sort_order ?? 0) + 1;

  async function createTestimonial(data: TestimonialInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("testimonials").insert(data);
    revalidatePath("/testimonials");
    return { error: error?.message };
  }

  return (
    <>
      <Header title="New Testimonial" />
      <main className="p-4 sm:p-8">
        <TestimonialForm
          initialData={{ sort_order: nextOrder }}
          onSubmit={createTestimonial}
        />
      </main>
    </>
  );
}
