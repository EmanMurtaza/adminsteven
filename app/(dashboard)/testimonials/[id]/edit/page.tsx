import Header from "@/components/layout/Header";
import TestimonialForm from "@/components/testimonials/TestimonialForm";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { Testimonial, TestimonialInsert } from "@/lib/testimonials";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

export default async function EditTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data } = await supabase
    .from("testimonials")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const testimonial = data as Testimonial;

  async function updateTestimonial(values: TestimonialInsert) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("testimonials").update(values).eq("id", id);
    revalidatePath("/testimonials");
    return { error: error?.message };
  }

  return (
    <>
      <Header title={`Edit — ${testimonial.name}`} />
      <main className="p-4 sm:p-8">
        <TestimonialForm initialData={testimonial} onSubmit={updateTestimonial} />
      </main>
    </>
  );
}
