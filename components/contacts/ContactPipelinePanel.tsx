"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";

/**
 * Stage, primary type and notes — the three things that are yours rather than
 * BoldTrail's, kept together and away from the imported record.
 *
 * Stage and type save on change, because they are one-click decisions and a
 * Save button between the click and the result is friction for nothing. Notes
 * save on blur, so a write happens once per edit rather than once per keystroke.
 */
export default function ContactPipelinePanel({
  stage,
  leadType,
  notes,
  stages,
  leadTypes,
  onSave,
}: {
  stage: string;
  leadType: string;
  notes: string | null;
  stages: { value: string; label: string }[];
  leadTypes: { value: string; label: string }[];
  onSave: (patch: Record<string, string | null>) => Promise<{ error?: string }>;
}) {
  const [values, setValues] = useState({ stage, lead_type: leadType, notes: notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(patch: Record<string, string | null>) {
    setBusy(true);
    setError(null);
    const result = await onSave(patch);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }

  const select =
    "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition disabled:opacity-60";

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="p-stage"
          className="block text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1"
        >
          Stage
        </label>
        <select
          id="p-stage"
          value={values.stage}
          disabled={busy}
          onChange={(e) => {
            setValues((v) => ({ ...v, stage: e.target.value }));
            commit({ stage: e.target.value });
          }}
          className={select}
        >
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="p-type"
          className="block text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1"
        >
          Primary type
        </label>
        <select
          id="p-type"
          value={values.lead_type}
          disabled={busy}
          onChange={(e) => {
            setValues((v) => ({ ...v, lead_type: e.target.value }));
            commit({ lead_type: e.target.value });
          }}
          className={select}
        >
          {leadTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-mute mt-1 leading-relaxed">
          Which role leads. The others come from BoldTrail and are shown beside
          the name.
        </p>
      </div>

      <div>
        <label
          htmlFor="p-notes"
          className="block text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1"
        >
          Your notes
        </label>
        <textarea
          id="p-notes"
          rows={6}
          value={values.notes}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          onBlur={() => {
            if (values.notes !== (notes ?? "")) commit({ notes: values.notes || null });
          }}
          placeholder="What was said, what they want, when to chase…"
          className="w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm leading-relaxed resize-y placeholder-ink-mute/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition disabled:opacity-60"
        />
      </div>

      <div className="h-4 text-xs">
        {busy && (
          <span className="inline-flex items-center gap-1.5 text-ink-mute">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
        {done && !busy && (
          <span className="inline-flex items-center gap-1.5 text-forest">
            <Check size={12} /> Saved
          </span>
        )}
        {error && <span className="text-burgundy">{error}</span>}
      </div>
    </div>
  );
}
