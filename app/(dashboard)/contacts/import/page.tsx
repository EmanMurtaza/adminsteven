import Header from "@/components/layout/Header";
import CsvImporter from "@/components/contacts/CsvImporter";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { ContactDraft } from "@/lib/contacts";
import { ImportBatch, importBatchLabel } from "@/lib/importBatches";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function ImportContactsPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data: batchData } = await supabase
    .from("import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  const batches = (batchData ?? []) as ImportBatch[];

  async function importContacts(input: {
    drafts: ContactDraft[];
    fileName: string;
    source: string;
    skippedCount: number;
  }) {
    "use server";
    const { drafts, fileName, source, skippedCount } = input;
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    async function logBatch(inserted: number, updated: number) {
      // Audit trail only — never let a logging failure block a real import.
      await supabase!.from("import_batches").insert({
        kind: "csv",
        file_name: fileName || null,
        source: source || null,
        inserted_count: inserted,
        updated_count: updated,
        skipped_count: skippedCount,
      });
    }

    if (!drafts.length) {
      await logBatch(0, 0);
      revalidatePath("/contacts/import");
      return { inserted: 0, updated: 0 };
    }

    // Split on what already exists so we can report honest numbers and, more
    // importantly, avoid trampling stage/notes/follow-up on contacts Steven has
    // already worked. An import refreshes contact details, nothing else.
    //
    // The match must be case-insensitive, and that rules out `.in("email", …)`:
    // drafts are lower-cased on the way in, but rows already in the table are
    // stored however they first arrived. A "John@x.com" in the table would not
    // match a "john@x.com" draft, so the row would be queued as an insert and
    // then violate `contacts_email_unique` (a unique index on lower(email)) —
    // taking its whole 500-row chunk down with it.
    //
    // So pull the id/email pairs and match in JS. Paged, because PostgREST caps
    // a response at 1000 rows and silently truncating here would recreate the
    // exact bug this is fixing.
    const existing: { id: string; email: string | null; first_name: string | null; last_name: string | null; phone: string | null }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, phone")
        .not("email", "is", null)
        .range(from, from + PAGE - 1);
      if (error) return { inserted: 0, updated: 0, error: error.message };
      existing.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const byEmail = new Map(
      existing
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c])
    );

    const toInsert: ContactDraft[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    for (const draft of drafts) {
      const match = draft.email ? byEmail.get(draft.email) : undefined;
      if (match) {
        // Only fill gaps — never overwrite something already there. Merging
        // against the current value (rather than sending a sparse patch) keeps
        // every row's key set identical, which the batched upsert below needs.
        const merged = {
          id: match.id,
          first_name: match.first_name || draft.first_name || null,
          last_name: match.last_name || draft.last_name || null,
          phone: match.phone || draft.phone || null,
        };
        const changed =
          merged.first_name !== match.first_name ||
          merged.last_name !== match.last_name ||
          merged.phone !== match.phone;
        if (changed) toUpdate.push(merged);
      } else {
        toInsert.push(draft);
      }
    }

    let inserted = 0;
    if (toInsert.length) {
      // PostgREST rejects a batch insert unless every object has exactly the
      // same keys ("All object keys must match"), so square the rows off
      // against one column set before sending.
      const columns = [
        "first_name", "last_name", "email", "phone",
        "lead_type", "stage", "source", "tags", "notes", "raw",
        "rating", "email_opt_in", "assigned_agent",
        "first_seen_at", "last_closing_date", "homeowner_status",
      ] as const;
      const squared = toInsert.map((d) =>
        Object.fromEntries(
          columns.map((c) => [c, (d as Record<string, unknown>)[c] ?? null])
        )
      );

      // Chunked: a few thousand rows in one request will time out.
      for (let i = 0; i < squared.length; i += 500) {
        const chunk = squared.slice(i, i + 500);
        const { error } = await supabase.from("contacts").insert(chunk);
        if (error) {
          await logBatch(inserted, 0);
          revalidatePath("/contacts/import");
          return { inserted, updated: 0, error: error.message };
        }
        inserted += chunk.length;
      }
    }

    // Batched, not one UPDATE per row: a few thousand sequential round-trips
    // will outlast the request. Conflicting on `id` means these only ever
    // update rows that were matched above, never create new ones.
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += 500) {
      const chunk = toUpdate.slice(i, i + 500);
      const { error } = await supabase.from("contacts").upsert(chunk, { onConflict: "id" });
      if (error) {
        await logBatch(inserted, updated);
        revalidatePath("/contacts/import");
        return { inserted, updated, error: error.message };
      }
      updated += chunk.length;
    }

    await logBatch(inserted, updated);
    revalidatePath("/contacts");
    revalidatePath("/contacts/import");
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

        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-6">
          <h2 className="font-serif text-base text-navy mb-1">Recent imports</h2>
          <p className="text-sm text-ink-mute mb-4">
            Every CSV run and website pull-in, so you can see what came in and when.
          </p>
          {batches.length === 0 ? (
            <p className="text-sm text-ink-mute">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink-mute border-b border-gold/20">
                    <th className="py-2 pr-4 font-medium">File / source</th>
                    <th className="py-2 pr-4 font-medium">Label</th>
                    <th className="py-2 pr-4 font-medium text-right">Added</th>
                    <th className="py-2 pr-4 font-medium text-right">Updated</th>
                    <th className="py-2 pr-4 font-medium text-right">Skipped</th>
                    <th className="py-2 font-medium text-right">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold/10">
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 pr-4 text-navy truncate max-w-[220px]" title={importBatchLabel(b)}>
                        {importBatchLabel(b)}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-soft">{b.source ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-right text-navy font-medium">{b.inserted_count}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-soft">{b.updated_count}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-soft">{b.skipped_count}</td>
                      <td className="py-2.5 text-right text-ink-mute text-xs whitespace-nowrap">
                        {formatDateTime(b.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
