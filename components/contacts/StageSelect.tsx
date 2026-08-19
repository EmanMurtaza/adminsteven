"use client";

import { ChevronDown } from "lucide-react";
import { STAGES, STAGE_TONES, type Stage } from "@/lib/contacts";

/**
 * The stage control, drawn as a coloured pill rather than a browser dropdown.
 *
 * A bare `<select>` renders differently on every platform and ignores most of
 * what you tell it, so the stage colour never actually reached the control — it
 * showed up as a grey box with an arrow. `appearance-none` gives the styling
 * back, and the real `<select>` underneath keeps the keyboard behaviour, the
 * native picker on touch, and the form semantics that a div-and-listbox
 * reimplementation would have to rebuild badly.
 *
 * The chevron is a sibling rather than a background image so it inherits the
 * text colour of whichever stage is selected.
 */
export default function StageSelect({
  value,
  disabled,
  onChange,
}: {
  value: Stage;
  disabled?: boolean;
  onChange: (stage: Stage) => void;
}) {
  return (
    <div className="relative inline-block w-full min-w-[120px]">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Stage)}
        aria-label="Stage"
        className={`w-full appearance-none cursor-pointer rounded-full ring-1 ring-inset pl-3 pr-7 py-1.5 text-xs font-medium
          focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-50 disabled:cursor-wait
          transition-shadow ${STAGE_TONES[value] ?? STAGE_TONES.new_lead}`}
      >
        {STAGES.map((s) => (
          // Options are drawn by the OS, so they get no colour — force readable
          // defaults instead of inheriting the pill's tinted background.
          <option key={s.value} value={s.value} className="bg-white text-ink">
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-70"
      />
    </div>
  );
}
