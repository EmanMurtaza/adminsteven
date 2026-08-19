import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Mail, Phone, Star } from "lucide-react";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import {
  Contact,
  LEAD_TYPES,
  STAGES,
  STAGE_TONES,
  contactName,
  isAlumni,
  loadTagVocabulary,
  stageLabel,
  type Stage,
} from "@/lib/contacts";
import { formatDate, formatDateTime } from "@/lib/format";
import RoleBadges from "@/components/contacts/RoleBadges";
import TagEditor from "@/components/contacts/TagEditor";
import ContactDetailsForm from "@/components/contacts/ContactDetailsForm";
import ContactPipelinePanel from "@/components/contacts/ContactPipelinePanel";
import ExternalNotes from "@/components/contacts/ExternalNotes";
import RawDetails from "@/components/contacts/RawDetails";

// One page per contact.
//
// The list view can only ever show a slice — ten columns out of forty-odd — and
// the expand-in-place panel it grew instead was read-only and had nowhere to put
// an edit form. A contact is a thing you work on, so it gets a URL: linkable,
// bookmarkable, back-button-able, and somewhere a form can live without fighting
// a table row for width.

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <>
        <Header title="Contact" />
        <main className="p-4 sm:p-8">
          <div className="bg-white border border-burgundy/30 rounded-xl p-6">
            <p className="text-burgundy font-medium mb-2">Could not load this contact</p>
            <p className="text-sm text-ink-soft">{error.message}</p>
          </div>
        </main>
      </>
    );
  }
  if (!data) notFound();

  const contact = data as Contact;
  const isLinked = Boolean(contact.external_id);

  // The saved vocabulary, so the picker offers what already exists before it
  // offers to invent something. Reads contact_tags, not a scrape of whatever
  // tags happen to be on contacts right now.
  const tagOptions = await loadTagVocabulary(supabase);

  async function save(patch: Record<string, unknown>) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const { error } = await supabase.from("contacts").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") return { error: "Another contact already uses that email." };
      return { error: error.message };
    }
    revalidatePath(`/contacts/${id}`);
    revalidatePath("/contacts");
    revalidatePath("/pipeline");
    return {};
  }

  async function saveTags(tags: string[]) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };

    // Register anything new before writing it onto the contact, so a tag
    // invented here is immediately offered everywhere else. ignoreDuplicates
    // because a tag someone has already renamed or hidden must not be reset.
    const rows = tags.map((name) => ({ name, label: name, source: "manual" }));
    if (rows.length) {
      await supabase
        .from("contact_tags")
        .upsert(rows, { onConflict: "name", ignoreDuplicates: true });
    }
    return save({ tags });
  }

  async function saveDetails(patch: Record<string, string | number | null>) {
    "use server";
    return save(patch);
  }

  async function savePipeline(patch: Record<string, string | null>) {
    "use server";
    return save(patch);
  }

  const stageTone = STAGE_TONES[contact.stage as Stage] ?? STAGE_TONES.new_lead;

  return (
    <>
      <Header title={contactName(contact)} />
      <main className="p-4 sm:p-8 space-y-5 max-w-6xl">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1.5 text-sm text-gold-dark hover:text-navy transition-colors"
        >
          <ArrowLeft size={15} />
          All contacts
        </Link>

        {/* ── Summary ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-serif text-2xl sm:text-3xl text-navy break-words">
                {contactName(contact)}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${stageTone}`}
                >
                  {stageLabel(contact.stage)}
                </span>
                <RoleBadges contact={contact} />
                {isAlumni(contact) && (
                  <Link
                    href="/contacts/alumni"
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-navy/[0.07] text-navy ring-1 ring-inset ring-navy/20 hover:bg-navy/12 transition-colors"
                  >
                    Alumni
                  </Link>
                )}
                {contact.rating != null && contact.rating > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-gold-dark"
                    title={`${contact.rating} out of 5`}
                  >
                    <Star size={12} className="fill-current" />
                    {contact.rating}/5
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-gold-dark transition-colors break-all"
                >
                  <Mail size={14} className="shrink-0 text-ink-mute" />
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-gold-dark transition-colors"
                >
                  <Phone size={14} className="shrink-0 text-ink-mute" />
                  {contact.phone}
                </a>
              )}
              {contact.email_opt_in === false && (
                <span className="text-xs text-burgundy">Opted out of email</span>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-5 pt-4 border-t border-gold/15 text-xs">
            <Fact label="Source" value={contact.source ?? "—"} />
            <Fact
              label="First seen"
              value={formatDate(contact.first_seen_at ?? contact.created_at)}
            />
            <Fact
              label="Last visit"
              value={contact.last_visit_at ? formatDate(contact.last_visit_at) : "—"}
            />
            <Fact
              label="Last contacted"
              value={
                contact.last_contacted_at ? formatDate(contact.last_contacted_at) : "Never"
              }
            />
          </dl>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <ContactDetailsForm
              contact={contact}
              isLinked={isLinked}
              onSave={saveDetails}
            />
          </div>

          <div className="space-y-5 lg:sticky lg:top-6">
            <Panel title="Pipeline">
              <ContactPipelinePanel
                stage={contact.stage as Stage}
                leadType={contact.lead_type}
                notes={contact.notes}
                stages={STAGES.map((s) => ({ value: s.value, label: s.label }))}
                leadTypes={LEAD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                onSave={savePipeline}
              />
            </Panel>

            <Panel title="Hashtags">
              <TagEditor
                tags={contact.tags ?? []}
                options={tagOptions}
                syncedFromBoldTrail={isLinked}
                onSave={saveTags}
              />
            </Panel>

            {isLinked && (
              <Panel title="BoldTrail">
                <dl className="text-xs space-y-2">
                  <Fact label="Record id" value={contact.external_id ?? "—"} />
                  <Fact label="Sync status" value={contact.sync_status ?? "—"} />
                  <Fact
                    label="Last synced"
                    value={
                      contact.external_synced_at
                        ? formatDateTime(contact.external_synced_at)
                        : "—"
                    }
                  />
                  {contact.assigned_agent && (
                    <Fact label="Owned by" value={contact.assigned_agent} />
                  )}
                </dl>
              </Panel>
            )}
          </div>
        </div>

        <ExternalNotes notes={contact.external_notes} />
        <RawDetails raw={contact.raw} />
      </main>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gold/25 rounded-xl p-4 sm:p-5">
      <h2 className="font-serif text-navy text-base mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</dt>
      <dd className="text-navy mt-0.5 break-words">{value}</dd>
    </div>
  );
}
