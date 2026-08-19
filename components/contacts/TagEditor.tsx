"use client";

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";

/**
 * Add and remove a contact's hashtags.
 *
 * Tags arrive from BoldTrail and are pull-only in the sense that a pull ADDS
 * them and never deletes — see FIELD_SYNC_POLICY. So removing one here removes
 * it here only, and if BoldTrail still has it the next sync puts it back. That
 * is worth saying in the UI rather than letting someone discover it when a tag
 * they deleted reappears overnight.
 *
 * `suggestions` are the tags already in use across the account, so the fifth
 * person to be tagged "investor" gets the existing spelling instead of
 * "Investor" or "investors" — free-text tags fragment fast without it.
 */
export default function TagEditor({
  tags,
  suggestions = [],
  syncedFromBoldTrail = false,
  onSave,
}: {
  tags: string[];
  suggestions?: string[];
  syncedFromBoldTrail?: boolean;
  onSave: (tags: string[]) => Promise<{ error?: string }>;
}) {
  const [current, setCurrent] = useState<string[]>(tags);
  const [draft, setDraft] = useState("");
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

  function add(raw: string) {
    // Normalised on the way in: a leading "#" is how people type tags, and
    // "Investor" and "investor" are the same tag however they were typed.
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    if (!tag) return;
    setDraft("");
    if (current.includes(tag)) return;
    commit([...current, tag]);
  }

  const unused = suggestions.filter((s) => !current.includes(s)).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {current.length === 0 && (
          <p className="text-xs text-ink-mute">No hashtags yet.</p>
        )}
        {current.map((tag) => (
          <span
            key={tag}
            className="group inline-flex items-center gap-1 rounded-full bg-cream-200 text-ink-soft ring-1 ring-inset ring-ink-mute/20 pl-2.5 pr-1 py-1 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => commit(current.filter((t) => t !== tag))}
              disabled={busy}
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors disabled:opacity-40"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a hashtag…"
          aria-label="Add a hashtag"
          disabled={busy}
          className="flex-1 min-w-0 bg-white border border-gold/30 text-navy rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="inline-flex items-center gap-1.5 bg-navy hover:bg-navy-500 disabled:opacity-40 disabled:hover:bg-navy text-cream px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {unused.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-mute mb-1.5">
            Already in use
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => add(tag)}
                disabled={busy}
                className="rounded-full border border-dashed border-gold/45 text-ink-soft hover:text-navy hover:bg-gold/10 hover:border-gold px-2.5 py-1 text-xs transition-colors disabled:opacity-40"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
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
