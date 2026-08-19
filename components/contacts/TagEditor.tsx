"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import TagPicker from "./TagPicker";
import type { TagOption } from "@/lib/contacts";

/**
 * A contact's hashtags.
 *
 * The picker does the work — pick from what already exists, or create something
 * new — so this only owns the save. It used to be a free-text box, which is how
 * the same idea ended up stored as "Client", "client" and "Seller"; the picker
 * offers the existing spelling before it offers to invent one.
 *
 * Tags arrive from BoldTrail and a pull ADDS them and never deletes (see
 * FIELD_SYNC_POLICY), so removing one here removes it here only. Worth saying
 * out loud rather than letting someone discover it when a tag they deleted comes
 * back overnight.
 */
export default function TagEditor({
  tags,
  options,
  syncedFromBoldTrail = false,
  onSave,
}: {
  tags: string[];
  /** The saved vocabulary. */
  options: TagOption[];
  syncedFromBoldTrail?: boolean;
  onSave: (tags: string[]) => Promise<{ error?: string }>;
}) {
  const [current, setCurrent] = useState<string[]>(tags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string[]) {
    // Optimistic: the list is the thing being edited, so it has to feel direct.
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    const result = await onSave(next);
    setBusy(false);
    if (result.error) {
      setCurrent(previous);
      setError(result.error);
    }
  }

  return (
    <div>
      <TagPicker
        allowCreate
        options={options}
        values={current}
        onChange={commit}
        placeholder="Add hashtags…"
      />

      {busy && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-mute">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-burgundy">{error}</p>}

      {syncedFromBoldTrail && (
        <p className="mt-3 text-[11px] text-ink-mute leading-relaxed">
          A sync adds BoldTrail&apos;s tags and never deletes any, so a tag you
          remove here will come back if it still exists in BoldTrail.
        </p>
      )}
    </div>
  );
}
