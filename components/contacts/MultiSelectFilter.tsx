"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * A column filter that takes several values at once.
 *
 * A single-value dropdown was wrong for Type in particular: two thirds of this
 * account holds more than one role, and "show me buyers and sellers" is a more
 * natural question than "show me buyers, then run it again for sellers". Stage
 * has the same shape — "everything still open" is four of the eight.
 *
 * Native <select multiple> renders as a fixed-height scrolling box that cannot
 * sit in a table header, so this is a popover of checkboxes. The button carries
 * the current selection so the filter is legible without opening it.
 */
export default function MultiSelectFilter({
  label,
  values,
  options,
  onChange,
}: {
  /** Shown when nothing is selected, e.g. "Any type". */
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  // Close on an outside click or Escape — a popover inside a scrolling table
  // that stays open while you scroll away is worse than no popover.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
    );
  }

  const summary =
    values.length === 0
      ? label
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label ?? values[0]
        : `${values.length} selected`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        className={`w-full flex items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-xs transition focus:outline-none focus:ring-2 focus:ring-gold ${
          values.length
            ? "bg-gold/12 border-gold/50 text-navy font-medium"
            : "bg-white border-gold/30 text-ink-mute"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          id={id}
          role="listbox"
          aria-multiselectable
          // z-40 clears the sticky columns (z-20) and the scroll shadows (z-30).
          className="absolute left-0 top-full mt-1 z-40 min-w-full w-max max-w-[220px] bg-white border border-gold/35 rounded-lg shadow-[0_8px_24px_-8px_rgba(14,27,48,0.28)] p-1"
        >
          {options.map((o) => {
            const on = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-navy hover:bg-cream-100 transition-colors"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                    on ? "bg-navy border-navy text-cream" : "border-gold/45 bg-white"
                  }`}
                >
                  {on && <Check size={10} strokeWidth={3} />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}

          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 mt-1 border-t border-gold/20 text-[11px] text-ink-mute hover:text-navy transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
