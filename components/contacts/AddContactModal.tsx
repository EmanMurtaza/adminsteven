"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { DEFAULT_STAGE, LEAD_TYPES, STAGES, LeadType, Stage, type TagOption } from "@/lib/contacts";
import TagPicker from "./TagPicker";

export interface NewContactInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lead_type: LeadType;
  stage: Stage;
  source: string;
  notes: string;
  tags: string[];
}

interface Props {
  onCreate: (input: NewContactInput) => Promise<{ error?: string }>;
  /** The saved hashtag vocabulary. */
  tagOptions?: TagOption[];
}

const EMPTY: NewContactInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  lead_type: "unknown",
  stage: DEFAULT_STAGE,
  source: "manual",
  notes: "",
  tags: [],
};

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";

export default function AddContactModal({ onCreate, tagOptions = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewContactInput>(EMPTY);

  function update<K extends keyof NewContactInput>(key: K, value: NewContactInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function close() {
    setOpen(false);
    setError(null);
    setForm(EMPTY);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Add an email or phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onCreate(form);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
      >
        <UserPlus size={16} />
        Add Contact
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl border border-gold/25 w-full max-w-md p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl text-navy">Add Contact</h2>
              <button
                onClick={close}
                aria-label="Close"
                className="text-ink-mute hover:text-navy p-1 -m-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => update("first_name", e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={(e) => update("last_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  aria-label="Lead type"
                  value={form.lead_type}
                  onChange={(e) => update("lead_type", e.target.value as LeadType)}
                  className={inputClass}
                >
                  {LEAD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Stage"
                  value={form.stage}
                  onChange={(e) => update("stage", e.target.value as Stage)}
                  className={inputClass}
                >
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                placeholder="Source (e.g. referral, open house)"
                value={form.source}
                onChange={(e) => update("source", e.target.value)}
                className={inputClass}
              />
              {/* The same picker the contact page and the filter row use, so a
                  tag typed here joins the vocabulary rather than starting a
                  near-duplicate of one that already exists. */}
              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1">
                  Hashtags
                </label>
                <TagPicker
                  allowCreate
                  options={tagOptions}
                  values={form.tags}
                  onChange={(tags) => update("tags", tags)}
                  placeholder="Add hashtags…"
                />
              </div>
              <textarea
                placeholder="Notes"
                rows={3}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className={`${inputClass} resize-y`}
              />

              {error && (
                <p className="text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-navy hover:bg-navy-500 disabled:opacity-50 text-cream px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {busy ? "Adding…" : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
