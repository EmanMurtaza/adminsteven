"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { LEAD_TYPES, STAGES, type TagOption } from "@/lib/contacts";
import MultiSelectFilter from "./MultiSelectFilter";
import TagPicker from "./TagPicker";

// Per-column filters, living in a second header row so each one sits under the
// column it filters.
//
// URL-driven like every other filter in this app, so a filtered view is
// shareable and survives a refresh — but pushed with router.replace rather than
// a form submit. A <form> cannot wrap a <tbody>, and splitting one across the
// table would mean the inputs and the results were different elements arguing
// about layout. Each control just rewrites its own query param.
//
// Text inputs commit on Enter or blur rather than per keystroke: this is a
// server-rendered list, so every commit is a round trip.

export interface ColumnFilterValues {
  name?: string;
  contact?: string;
  /** Several at once — most contacts hold more than one role. */
  type?: string[];
  stage?: string[];
  location?: string;
  source?: string;
  tag?: string[];
  visited?: string;
  followed?: string;
  due?: string;
}

const DATE_WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "none", label: "Never" },
];

export default function ColumnFilters({
  values,
  tagOptions = [],
}: {
  values: ColumnFilterValues;
  /** The saved hashtag vocabulary, so the filter is a picker not a spelling test. */
  tagOptions?: TagOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(key: string, value: string | string[]) {
    const next = new URLSearchParams(params.toString());
    // Several values ride in one param as a comma-separated list, so the URL
    // stays readable and shareable: ?type=buyer,seller
    const joined = Array.isArray(value) ? value.join(",") : value;
    if (joined) next.set(key, joined);
    else next.delete(key);
    // A different filter is a different result set, so it starts at page 1.
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <tr className="bg-cream-100/70">
      <Cell sticky>
        <TextFilter placeholder="Name…" value={values.name} onCommit={(v) => apply("name", v)} />
      </Cell>
      <Cell>
        <TextFilter
          placeholder="Email or phone…"
          value={values.contact}
          onCommit={(v) => apply("contact", v)}
        />
      </Cell>
      <Cell>
        <MultiSelectFilter
          label="Any type"
          values={values.type ?? []}
          options={LEAD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          onChange={(v) => apply("type", v)}
        />
      </Cell>
      <Cell>
        <MultiSelectFilter
          label="Any stage"
          values={values.stage ?? []}
          options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(v) => apply("stage", v)}
        />
      </Cell>
      <Cell>
        <TextFilter
          placeholder="City, state, ZIP…"
          value={values.location}
          onCommit={(v) => apply("location", v)}
        />
      </Cell>
      <Cell>
        <TextFilter placeholder="Source…" value={values.source} onCommit={(v) => apply("source", v)} />
      </Cell>
      <Cell>
        {/* A picker, not a text box: with 44 tags in play, filtering used to
            mean typing `openhouse21067952-2025-11-02` exactly right. */}
        <TagPicker
          compact
          options={tagOptions}
          values={values.tag ?? []}
          onChange={(v) => apply("tag", v)}
        />
      </Cell>
      <Cell>
        <SelectFilter
          label="Any time"
          value={values.visited}
          options={DATE_WINDOWS}
          onChange={(v) => apply("visited", v)}
        />
      </Cell>
      <Cell>
        <SelectFilter
          label="Any time"
          value={values.followed}
          options={DATE_WINDOWS}
          onChange={(v) => apply("followed", v)}
        />
      </Cell>
      <Cell>
        <SelectFilter
          label="Any"
          value={values.due}
          options={[
            { value: "overdue", label: "Due now" },
            { value: "set", label: "Scheduled" },
            { value: "none", label: "Not set" },
          ]}
          onChange={(v) => apply("due", v)}
        />
      </Cell>
      <Cell sticky right />
    </tr>
  );
}

function Cell({
  children,
  sticky,
  right,
}: {
  children?: React.ReactNode;
  sticky?: boolean;
  right?: boolean;
}) {
  // The pinned columns need an opaque background here too, or the filter row
  // scrolls visibly underneath them.
  const base = "px-3 pb-2.5 pt-0 align-top border-b border-gold/25";
  if (!sticky) return <td className={base}>{children}</td>;
  // Opaque, and with the same hairline the header and body cells use, so the
  // pinned edge is one continuous line down the whole table rather than
  // reappearing per row. #f7efdc is cream-100 over the header tint.
  return (
    <td
      className={`${base} sticky ${right ? "right-0" : "left-0"} z-20 bg-[#f7efdc] ${
        right
          ? "before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-gold/45"
          : "after:absolute after:inset-y-0 after:-right-px after:w-px after:bg-gold/45"
      }`}
    >
      {children}
    </td>
  );
}

const control =
  "w-full bg-white border border-gold/30 text-navy rounded-md px-2 py-1.5 text-xs placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

function TextFilter({
  placeholder,
  value,
  onCommit,
}: {
  placeholder: string;
  value?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [seen, setSeen] = useState(value);

  // The URL is the source of truth: Clear-all, the back button and a link all
  // change it without touching this input, and the box has to follow.
  //
  // Adjusted during render rather than in an effect — React's own answer for
  // "reset state when a prop changes". An effect would render the stale value
  // first and then correct it, and keying the input would remount it and take
  // the caret with it on every commit.
  if (seen !== value) {
    setSeen(value);
    setDraft(value ?? "");
  }

  return (
    <input
      type="search"
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== (value ?? "") && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft.trim());
        }
        if (e.key === "Escape") setDraft(value ?? "");
      }}
      className={control}
    />
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`${control} cursor-pointer`}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
