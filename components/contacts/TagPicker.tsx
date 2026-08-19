"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Plus, Search, X } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { normalizeTag, type TagOption } from "@/lib/contacts";

/**
 * Pick hashtags from the ones already in use, or make a new one.
 *
 * The same control does filtering and editing, because they are the same
 * question — "which tags?" — and having a picker on one screen and a free-text
 * box on another is how a vocabulary fragments into `Client`, `client` and
 * `clients`.
 *
 * Search rather than a plain list: 44 tags is past scanning. Batch markers
 * (`import20251007-1985a`) are hidden until typed for; they are provenance
 * rather than vocabulary, but they are real tags on real contacts, so they
 * remain reachable.
 */
export default function TagPicker({
  options,
  values,
  onChange,
  allowCreate = false,
  placeholder = "Any hashtag",
  compact = false,
}: {
  options: TagOption[];
  values: string[];
  onChange: (values: string[]) => void;
  /** Offer "Create «foo»" for text that matches nothing. Off when filtering — a
   *  tag nobody has cannot match anything, so offering it would only mislead. */
  allowCreate?: boolean;
  placeholder?: string;
  /** Sized for a table filter row rather than a form. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDismissable(open, root, close);

  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const matches = options.filter((o) => {
      if (q) return o.name.includes(q) || o.label.toLowerCase().includes(q);
      // Hidden tags stay out of the resting list but are found by searching.
      return !o.hidden;
    });
    // Selected first so removing one never means hunting for it, then by how
    // widely used the tag is — the useful ones surface without being ranked by
    // hand.
    return matches.sort((a, b) => {
      const aOn = values.includes(a.name);
      const bOn = values.includes(b.name);
      if (aOn !== bOn) return aOn ? -1 : 1;
      return (b.count ?? 0) - (a.count ?? 0);
    });
  }, [options, q, values]);

  const typed = normalizeTag(query);
  const canCreate =
    allowCreate && typed.length > 0 && !options.some((o) => o.name === typed);

  function toggle(name: string) {
    onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name]);
  }

  function create() {
    if (!canCreate) return;
    onChange([...values, typed]);
    setQuery("");
  }

  const summary =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.name === values[0])?.label ?? values[0]
        : `${values.length} hashtags`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`w-full flex items-center justify-between gap-1 rounded-md border transition focus:outline-none focus:ring-2 focus:ring-gold ${
          compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
        } ${
          values.length
            ? "bg-gold/12 border-gold/50 text-navy font-medium"
            : "bg-white border-gold/30 text-ink-mute"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          size={compact ? 12 : 14}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Selected tags stay visible below the button when editing, so the set
          being built is readable without opening the popover. */}
      {!compact && values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-cream-200 text-ink-soft ring-1 ring-inset ring-ink-mute/20 pl-2.5 pr-1 py-1 text-xs font-medium"
            >
              {options.find((o) => o.name === name)?.label ?? name}
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-label={`Remove ${name}`}
                className="rounded-full p-0.5 text-ink-mute hover:text-burgundy hover:bg-burgundy/10 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        // z-40 clears the sticky table columns (z-20) and the scroll shadows (z-30).
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 top-full mt-1 z-40 w-[240px] max-w-[80vw] bg-white border border-gold/35 rounded-lg shadow-[0_8px_24px_-8px_rgba(14,27,48,0.28)]"
        >
          <div className="relative border-b border-gold/20">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canCreate) create();
                  else if (visible.length === 1) toggle(visible[0].name);
                }
              }}
              placeholder="Search hashtags…"
              aria-label="Search hashtags"
              className="w-full bg-transparent pl-8 pr-2 py-2 text-xs text-navy placeholder-ink-mute/60 focus:outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {visible.length === 0 && !canCreate && (
              <p className="px-2 py-3 text-xs text-ink-mute text-center">
                {q ? "No hashtag matches." : "No hashtags yet."}
              </p>
            )}

            {visible.map((o) => {
              const on = values.includes(o.name);
              return (
                <button
                  key={o.name}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.name)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-navy hover:bg-cream-100 transition-colors"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                      on ? "bg-navy border-navy text-cream" : "border-gold/45 bg-white"
                    }`}
                  >
                    {on && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="truncate flex-1">{o.label}</span>
                  {o.count != null && (
                    <span className="text-[10px] text-ink-mute tabular-nums shrink-0">
                      {o.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={create}
              className="w-full flex items-center gap-2 px-3 py-2 border-t border-gold/20 text-xs text-gold-dark hover:bg-gold/10 transition-colors"
            >
              <Plus size={12} className="shrink-0" />
              Create <span className="font-medium">{typed}</span>
            </button>
          )}

          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 border-t border-gold/20 text-[11px] text-ink-mute hover:text-navy transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
