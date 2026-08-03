import Header from "@/components/layout/Header";
import CsvImporter from "@/components/contacts/CsvImporter";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { ContactDraft } from "@/lib/contacts";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function ImportContactsPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  async function importContacts(drafts: ContactDraft[]) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    if (!drafts.length) return { inserted: 0, updated: 0 };

    // Split on what already exists so we can report honest numbers and, more
    // importantly, avoid trampling stage/notes/follow-up on contacts Steven has
    // already worked. An import refreshes contact details, nothing else.
    const emails = drafts.map((d) => d.email).filter(Boolean) as string[];
    const { data: existing } = emails.length
      ? await supabase.from("contacts").select("id, email").in("email", emails)
      : { data: [] };

    const byEmail = new Map(
      (existing ?? []).map((c) => [(c.email ?? "").toLowerCase(), c.id])
    );

    const toInsert: ContactDraft[] = [];
    const toUpdate: { id: string; patch: Partial<ContactDraft> }[] = [];

    for (const draft of drafts) {
      const id = draft.email ? byEmail.get(draft.email) : undefined;
      if (id) {
        const patch: Partial<ContactDraft> = {};
        // Only fill gaps — never overwrite something already there.
        if (draft.first_name) patch.first_name = draft.first_name;
        if (draft.last_name) patch.last_name = draft.last_name;
        if (draft.phone) patch.phone = draft.phone;
        if (Object.keys(patch).length) toUpdate.push({ id, patch });
      } else {
        toInsert.push(draft);
      }
    }

    let inserted = 0;
    if (toInsert.length) {
      // Chunked: a few thousand rows in one request will time out.
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        const { error } = await supabase.from("contacts").insert(chunk);
        if (error) return { inserted, updated: 0, error: error.message };
        inserted += chunk.length;
      }
    }

    let updated = 0;
    for (const { id, patch } of toUpdate) {
      const { error } = await supabase.from("contacts").update(patch).eq("id", id);
      if (!error) updated++;
    }

    revalidatePath("/contacts");
    return { inserted, updated };
  }

  return (
    <>
      <Header title="Import contacts" />
      <main className="p-4 sm:p-8 space-y-5 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-mute">
            Bring your existing leads across from BoldTrail, or any spreadsheet.
          </p>
          <Link
            href="/contacts"
            className="text-sm text-ink-soft hover:text-navy transition-colors"
          >
            ← Back to contacts
          </Link>
        </div>

        <CsvImporter onImport={importContacts} />

        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-6">
          <h2 className="font-serif text-base text-navy mb-2">
            Getting your contacts out of BoldTrail
          </h2>
          <ol className="text-sm text-ink-soft space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Open your contacts / smart CRM list in BoldTrail.</li>
            <li>Select the contacts you want, or select all.</li>
            <li>Choose the export option and save the CSV file.</li>
            <li>Upload that file above — the columns are matched for you.</li>
          </ol>
          <p className="text-xs text-ink-mute mt-3">
            Exact menu wording varies by BoldTrail plan. If you cannot find an
            export option, their support can run one for your account. Any CSV
            with a header row works here, so a spreadsheet you keep yourself is
            fine too.
          </p>
        </div>
      </main>
    </>
  );
}
