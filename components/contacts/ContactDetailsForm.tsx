"use client";

import { useState } from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import type { Contact } from "@/lib/contacts";

/**
 * The editable record behind a contact.
 *
 * Every field is always rendered, including the empty ones — that is the whole
 * point. Most of this account is sparse (company is blank on all 978 imported
 * contacts, city on all but 19), and a card that hides what it does not have
 * gives you no way to add it. An empty input with a label is the affordance.
 *
 * Fields BoldTrail owns are marked rather than disabled. Disabling them would
 * be wrong — a contact that is not linked to BoldTrail has no such constraint,
 * and even a linked one is worth correcting locally between syncs — but so
 * would saying nothing, because for a linked contact the next enrichment
 * rewrites these columns from their payload. See `detailColumns` in
 * lib/boldtrail/sync.
 */

type FieldKey = keyof Contact;

interface Field {
  key: FieldKey;
  label: string;
  type?: "text" | "email" | "tel" | "date" | "number";
  placeholder?: string;
  /** BoldTrail rewrites this on the next detail fetch for a linked contact. */
  overwrittenBySync?: boolean;
  half?: boolean;
}

const SECTIONS: { title: string; hint?: string; fields: Field[] }[] = [
  {
    title: "Identity",
    fields: [
      { key: "first_name", label: "First name", half: true },
      { key: "last_name", label: "Last name", half: true },
      { key: "email", label: "Email", type: "email" },
      { key: "second_email", label: "Second email", type: "email", overwrittenBySync: true },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "birthday", label: "Birthday", type: "date", overwrittenBySync: true },
    ],
  },
  {
    title: "Location",
    fields: [
      { key: "address", label: "Address", overwrittenBySync: true },
      { key: "city", label: "City", half: true, overwrittenBySync: true },
      { key: "state", label: "State", half: true, overwrittenBySync: true },
      { key: "zip_code", label: "ZIP", half: true, overwrittenBySync: true },
    ],
  },
  {
    title: "Work",
    fields: [
      { key: "company", label: "Company", overwrittenBySync: true },
      { key: "job_title", label: "Job title", overwrittenBySync: true },
    ],
  },
  {
    title: "Household",
    fields: [
      { key: "spouse_name", label: "Partner name", overwrittenBySync: true },
      { key: "spouse_email", label: "Partner email", type: "email", overwrittenBySync: true },
      { key: "spouse_phone", label: "Partner phone", type: "tel", overwrittenBySync: true },
    ],
  },
  {
    title: "What they are looking for",
    hint: "BoldTrail derives these from what the contact actually browsed. Set them by hand when you know better.",
    fields: [
      { key: "avg_price", label: "Target price", type: "number", placeholder: "450000", overwrittenBySync: true, half: true },
      { key: "avg_beds", label: "Beds", type: "number", half: true, overwrittenBySync: true },
      { key: "avg_baths", label: "Baths", type: "number", half: true, overwrittenBySync: true },
      { key: "homeowner_status", label: "Homeowner status", half: true, overwrittenBySync: true },
    ],
  },
  {
    title: "Working the lead",
    hint: "Yours alone. BoldTrail has no pipeline to sync these with and never sees them.",
    fields: [
      { key: "next_follow_up", label: "Next follow-up", type: "date", half: true },
      { key: "source", label: "Source", half: true },
    ],
  },
];

function initialValues(contact: Contact): Record<string, string> {
  const values: Record<string, string> = {};
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const raw = contact[field.key];
      // Dates arrive as full timestamps but <input type="date"> wants yyyy-mm-dd.
      values[field.key] =
        raw === null || raw === undefined
          ? ""
          : field.type === "date"
            ? String(raw).slice(0, 10)
            : String(raw);
    }
  }
  return values;
}

export default function ContactDetailsForm({
  contact,
  isLinked,
  onSave,
}: {
  contact: Contact;
  /** Linked to BoldTrail, so the marked fields get rewritten by a sync. */
  isLinked: boolean;
  onSave: (patch: Record<string, string | number | null>) => Promise<{ error?: string }>;
}) {
  const [values, setValues] = useState(() => initialValues(contact));
  const [saved, setSaved] = useState(() => initialValues(contact));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = Object.keys(values).some((k) => values[k] !== saved[k]);
  const missing = Object.values(saved).filter((v) => v === "").length;

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDone(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Only what actually changed. Sending the whole form would rewrite every
    // column on every save and make `updated_at` meaningless.
    const patch: Record<string, string | number | null> = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const key = field.key as string;
        if (values[key] === saved[key]) continue;
        const raw = values[key].trim();
        patch[key] =
          raw === ""
            ? null
            : field.type === "number"
              ? Number(raw)
              : raw;
      }
    }

    const result = await onSave(patch);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(values);
    setDone(true);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {missing > 0 && (
        <p className="text-xs text-ink-soft bg-cream-100 border border-gold/25 rounded-lg px-3.5 py-2.5">
          <span className="font-medium text-navy">{missing}</span>{" "}
          {missing === 1 ? "field is" : "fields are"} empty. Fill in anything you
          know — the blanks below are the ones BoldTrail never had.
        </p>
      )}

      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="bg-white border border-gold/25 rounded-xl p-4 sm:p-5"
        >
          <h3 className="font-serif text-navy text-base mb-1">{section.title}</h3>
          {section.hint && (
            <p className="text-xs text-ink-mute mb-3 leading-relaxed">{section.hint}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {section.fields.map((field) => {
              const key = field.key as string;
              const warn = isLinked && field.overwrittenBySync;
              return (
                <div key={key} className={field.half ? "sm:col-span-1" : "sm:col-span-2"}>
                  <label
                    htmlFor={`f-${key}`}
                    className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1"
                  >
                    {field.label}
                    {warn && (
                      <span
                        title="BoldTrail rewrites this field on the next sync"
                        className="text-gold-dark"
                      >
                        <AlertTriangle size={11} />
                      </span>
                    )}
                  </label>
                  <input
                    id={`f-${key}`}
                    type={field.type ?? "text"}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    step={field.type === "number" ? "any" : undefined}
                    value={values[key]}
                    placeholder={field.placeholder ?? "—"}
                    onChange={(e) => set(key, e.target.value)}
                    className="w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm placeholder-ink-mute/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {isLinked && (
        <p className="flex items-start gap-2 text-xs text-ink-mute leading-relaxed">
          <AlertTriangle size={13} className="text-gold-dark shrink-0 mt-0.5" />
          This contact is linked to BoldTrail. Fields marked with that icon are
          re-read from their record on the next sync, so a correction made here
          holds only until then.
        </p>
      )}

      {error && (
        <p className="text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      {/* Sticky so Save is reachable without scrolling to the end of a long
          form on a phone. */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-cream/95 backdrop-blur-sm border-t border-gold/20 sm:border-0 sm:bg-transparent sm:backdrop-blur-none flex items-center gap-3">
        <button
          type="submit"
          disabled={!dirty || busy}
          className="inline-flex items-center gap-2 bg-navy hover:bg-navy-500 disabled:opacity-40 disabled:hover:bg-navy text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {busy ? "Saving…" : "Save changes"}
        </button>
        {done && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-sm text-forest">
            <Check size={15} /> Saved
          </span>
        )}
        {dirty && !busy && (
          <span className="text-sm text-ink-mute">Unsaved changes</span>
        )}
      </div>
    </form>
  );
}
